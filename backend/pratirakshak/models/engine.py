"""Stage 3 orchestration: train baselines + main model per subset, conformalise, evaluate, explain, export."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
import torch
from sklearn.linear_model import Ridge

from pratirakshak.ingest.cmapss import HEADLINE_SENSORS, SENSOR_NAMES
from pratirakshak.io import write_json, write_parquet
from pratirakshak.models import conformal as C
from pratirakshak.models.engine_data import Prepared, Windows, make_windows, prepare, summary_features
from pratirakshak.models.engine_seq import SeqEnsemble, train_member, with_cycle_channel
from pratirakshak.settings import MODELS_DIR, derive_seed, seed_everything


# ------------------------------------------------------------------------------------------ metrics
def nasa_score(pred: np.ndarray, true: np.ndarray) -> float:
    d = pred - true
    return float(np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1).sum())


def point_metrics(pred: np.ndarray, win: Windows) -> dict[str, float]:
    out = {}
    for tag, y in (("", win.y_true), ("_capped", win.y)):
        e = pred - y
        out[f"rmse{tag}"] = float(np.sqrt((e**2).mean()))
        out[f"mae{tag}"] = float(np.abs(e).mean())
        out[f"nasa_score{tag}"] = nasa_score(pred, y)
    return {k: round(v, 3) for k, v in out.items()}


# ------------------------------------------------------------------------------------------ training
def fit_ridge(p: Prepared) -> Callable[[Windows], np.ndarray]:
    inputs, r_max = p.cfg["inputs"], p.cfg["r_max"]
    xtr, _ = summary_features(p.train, inputs, rich=False)
    mu, sd = xtr.mean(0), xtr.std(0) + 1e-8
    model = Ridge(alpha=p.cfg["ridge"]["alpha"]).fit((xtr - mu) / sd, p.train.y)
    return lambda w: np.clip(model.predict((summary_features(w, inputs, False)[0] - mu) / sd), 0, r_max)


def fit_lgbm(p: Prepared) -> tuple[lgb.LGBMRegressor, list[str]]:
    hp = dict(p.cfg["lightgbm"])
    es = hp.pop("early_stopping_rounds")
    xtr, names = summary_features(p.train, p.cfg["inputs"], rich=True)
    xva, _ = summary_features(p.val_all, p.cfg["inputs"], rich=True)
    model = lgb.LGBMRegressor(**hp, random_state=derive_seed("lgbm", p.subset) % 2**31, deterministic=True,
                              force_row_wise=True, verbose=-1)
    model.fit(xtr, p.train.y, eval_set=[(xva, p.val_all.y)], callbacks=[lgb.early_stopping(es, verbose=False)])
    return model, names


def fit_seq(p: Prepared, fast: bool) -> SeqEnsemble:
    hp = dict(p.cfg["sequence"])
    seeds = hp["fast"]["ensemble_seeds"] if fast else hp["ensemble_seeds"]
    epochs = hp["fast"]["max_epochs"] if fast else hp["max_epochs"]
    xtr, xva = with_cycle_channel(p.train), with_cycle_channel(p.val_all)
    members, hist = [], []
    for i in range(seeds):
        seed = derive_seed("seq", p.subset, i) % 2**31
        sd, h = train_member(xtr, p.train.y, xva, p.val_all.y, p.cfg["quantiles"], hp, p.cfg["r_max"], seed, epochs)
        members.append(sd)
        hist.append(h)
        print(f"    seq member {i + 1}/{seeds}: {h['epochs_run']} epochs, val pinball {h['best_val_pinball']}")
    return SeqEnsemble(members, xtr.shape[2], p.cfg["quantiles"], hp, p.cfg["r_max"], hist)


# ------------------------------------------------------------------------------------------ run one subset
def run_subset(subset: str, fast: bool) -> dict[str, Any]:
    t0 = time.time()
    seed_everything(derive_seed("engine", subset) % 2**31)
    p = prepare(subset)
    cfg, qs, levels = p.cfg, p.cfg["quantiles"], p.cfg["coverage_levels"]
    out_dir = MODELS_DIR / "engine" / subset
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"  {subset}: windows train {len(p.train.y):,} · val {len(p.val_all.y):,} · cal {len(p.val_cal.y):,} · test {len(p.test.y)}")

    ridge = fit_ridge(p)
    lgbm, feat_names = fit_lgbm(p)
    seq = fit_seq(p, fast)

    def lgbm_point(w: Windows) -> np.ndarray:
        return np.clip(lgbm.predict(summary_features(w, cfg["inputs"], True)[0]), 0, cfg["r_max"])

    # conformal calibration on val truncation windows
    m_b = C.abs_margins(lgbm_point(p.val_cal), p.val_cal.y, levels)
    q_cal, _ = seq.predict(with_cycle_channel(p.val_cal))
    m_main = C.cqr_margins(q_cal, qs, p.val_cal.y, levels)

    def serve_b(w: Windows) -> np.ndarray:
        return C.calibrated_quantiles(None, lgbm_point(w), qs, m_b)

    def serve_main(w: Windows) -> np.ndarray:
        return C.calibrated_quantiles(seq.predict(with_cycle_channel(w))[0], None, qs, m_main)

    # test evaluation
    mid = qs.index(0.5)
    q_main, disagree = seq.predict(with_cycle_channel(p.test))
    test_q = {"main": serve_main(p.test), "lgbm": serve_b(p.test)}
    preds = {"ridge": ridge(p.test), "lgbm": test_q["lgbm"][:, mid], "main": test_q["main"][:, mid]}
    metrics = {k: point_metrics(v, p.test) for k, v in preds.items()}
    intervals = {}
    for name in ("main", "lgbm"):
        rel = []
        for lv in levels:
            picp, mpiw = C.picp_mpiw(test_q[name], qs, p.test.y, lv)
            rel.append({"nominal": lv, "empirical": round(picp, 4), "mean_width": round(mpiw, 2)})
        intervals[name] = rel
    nominal = cfg["nominal_interval"]
    head = {n: next(r for r in intervals[n] if r["nominal"] == nominal) for n in intervals}

    gain = 1 - metrics["main"]["rmse"] / metrics["lgbm"]["rmse"]
    serving = "main" if gain >= cfg["serving_rule_rmse_gain"] else "lgbm"
    serve = serve_main if serving == "main" else serve_b
    serve_q = test_q[serving]

    # alarm quality — test engines (snapshot ROC over θ)
    H = cfg["alarm"]["horizon_cycles"]
    pf = C.p_fail_within(serve_q, qs, H)
    event = p.test.y_true <= H
    roc = []
    for th in cfg["alarm"]["theta_grid"]:
        alarm = pf >= th
        roc.append({"theta": th,
                    "false_alarm_rate": round(float((alarm & ~event).sum() / max((~event).sum(), 1)), 4),
                    "miss_rate": round(float((~alarm & event).sum() / max(event.sum(), 1)), 4)})

    # alarm quality — replay units (sequential, never used in fitting or calibration)
    rp_win = make_windows(p.replay_df, p.replay_z, cfg["window"], cfg["r_max"], "all")
    rp_q = serve(rp_win)
    rp_pf = C.p_fail_within(rp_q, qs, H)
    theta = cfg["alarm"]["theta"]
    leads = []
    for u in np.unique(rp_win.unit):
        m = rp_win.unit == u
        hit = np.where(rp_pf[m] >= theta)[0]
        life = int(rp_win.cycle[m].max())
        leads.append(None if len(hit) == 0 else int(life - rp_win.cycle[m][hit[0]]))
    lv_arr = np.array([lv for lv in leads if lv is not None])
    replay_alarm = {
        "units": len(leads), "theta": theta, "horizon": H,
        "missed": int(sum(lv is None or lv < 1 for lv in leads)),
        "premature_gt_3H": int((lv_arr > 3 * H).sum()) if len(lv_arr) else 0,
        "lead_p10": float(np.percentile(lv_arr, 10)) if len(lv_arr) else None,
        "lead_median": float(np.median(lv_arr)) if len(lv_arr) else None,
        "lead_p90": float(np.percentile(lv_arr, 90)) if len(lv_arr) else None,
        "leads": leads,
    }
    rp_df = pd.DataFrame({"unit": rp_win.unit.astype(int), "cycle": rp_win.cycle.astype(int),
                          "rul_true": rp_win.y_true.astype(int), "p_fail_H": rp_pf.round(5)})
    for j, q in enumerate(qs):
        rp_df[f"q{int(round(q * 100)):02d}"] = rp_q[:, j].round(3)
    rp_df["model"] = serving
    write_parquet(out_dir / "replay_predictions.parquet", rp_df)

    # explainability — occlusion to healthy baseline on the serving model (test engines)
    inputs = cfg["inputs"]
    base_mid = serve_q[:, mid]
    deltas = np.zeros((len(p.test.y), len(inputs)))
    for j in range(len(inputs)):
        occ = Windows(p.test.x.copy(), p.test.y, p.test.y_true, p.test.cycle, p.test.unit)
        occ.x[:, :, j] = p.norm.healthy_z[j]
        deltas[:, j] = serve(occ)[:, mid] - base_mid  # > 0: this sensor is pulling predicted RUL down
    glob = np.abs(deltas).mean(0)
    ranking = sorted(({"sensor": s, "symbol": SENSOR_NAMES[s][0], "description": SENSOR_NAMES[s][1],
                       "part": HEADLINE_SENSORS.get(s, "redundancy check"), "headline": s in HEADLINE_SENSORS,
                       "mean_abs_delta_rul": round(float(g), 3)} for s, g in zip(inputs, glob, strict=True)),
                     key=lambda r: -r["mean_abs_delta_rul"])
    per_engine = []
    for n in range(len(p.test.y)):
        order = [j for j in np.argsort(-deltas[n]) if inputs[j] in HEADLINE_SENSORS][:3]
        per_engine.append({"unit": int(p.test.unit[n]),
                           "top3": [{"sensor": inputs[j], "delta_rul": round(float(deltas[n, j]), 2)} for j in order]})
    shap_rank = []
    try:
        import shap

        xs, _ = summary_features(p.test, inputs, True)
        sv = np.abs(shap.TreeExplainer(lgbm.booster_).shap_values(xs)).mean(0)
        agg = {s: float(sum(v for f, v in zip(feat_names, sv, strict=True) if f.startswith(f"{s}__"))) for s in inputs}
        agg["cycle"] = float(sv[feat_names.index("cycle")])
        shap_rank = [{"feature": k, "mean_abs_shap": round(v, 3)} for k, v in sorted(agg.items(), key=lambda kv: -kv[1])]
    except Exception as exc:  # SHAP is optional for the pipeline; record why if it fails
        shap_rank = [{"error": f"{exc.__class__.__name__}: {exc}"}]

    # artefacts
    torch.save({"members": seq.members, "n_in": seq.n_in, "quantiles": qs, "hp": seq.hp, "r_max": seq.r_max},
               out_dir / "model.pt")
    lgbm.booster_.save_model(str(out_dir / "lgbm.txt"))
    write_json(out_dir / "scaler.json", p.norm.to_json())
    write_json(out_dir / "conformal.json", {"method_main": "CQR", "method_lgbm": "abs-residual split conformal",
                                            "calibration_windows": len(p.val_cal.y), "margins_main": m_main,
                                            "margins_lgbm": m_b})
    write_json(out_dir / "feature_spec.json", {"window": cfg["window"], "r_max": cfg["r_max"], "inputs": inputs,
                                               "lgbm_features": feat_names, "quantiles": qs,
                                               "split_units": {k: len(v) for k, v in p.split_units.items()}})
    write_json(out_dir / "explain.json", {"method": f"occlusion to healthy baseline on serving model ({serving})",
                                          "global_ranking": ranking, "per_test_engine": per_engine,
                                          "lgbm_shap_global": shap_rank})
    result = {
        "subset": subset, "provenance": "REAL", "fast": fast, "serving_model": serving,
        "main_vs_lgbm_rmse_gain": round(gain, 4),
        "test_engines": int(len(p.test.y)), "metrics": metrics, "intervals": intervals, "headline_interval": head,
        "ensemble_disagreement_mean": round(float(disagree.mean()), 3),
        "lgbm_best_iteration": int(lgbm.best_iteration_ or 0), "seq_training": [
            {k: v for k, v in h.items() if k != "log"} for h in seq.history],
        "alarm_test_roc": roc, "alarm_replay": replay_alarm, "seconds": round(time.time() - t0, 1),
    }
    write_json(out_dir / "metrics.json", {k: v for k, v in result.items() if k != "seconds"})  # keep bytes stable
    return result
