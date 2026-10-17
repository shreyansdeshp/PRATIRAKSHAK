"""Per-decision explanations (SPEC §8.1, U1): top-3 drivers in plain language + a confidence level with reasons.

Engines (REAL): occlusion on the serving model — replace one headline sensor's window by its healthy baseline and
measure how much the predicted RUL rises; only the 12 headline sensors are eligible. Text gives the raw-unit
deviation from the healthy baseline over the last cycles.
Other systems (SIMULATED): the sensors furthest from their healthy, environment-corrected value, as a share of the
failure signature.
Confidence: interval width + model agreement (engines: LightGBM vs CNN-GRU) + trust of the sensors involved.
"""

from __future__ import annotations

from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
import torch

from pratirakshak.ingest.cmapss import HEADLINE_SENSORS, SENSOR_NAMES
from pratirakshak.io import load_config, read_json
from pratirakshak.models.engine_data import Prepared, Windows, prepare, summary_features
from pratirakshak.models.engine_seq import SeqEnsemble, with_cycle_channel
from pratirakshak.settings import MODELS_DIR, PROCESSED_DIR
from pratirakshak.synth.model import STRESSES, SynthModel

LAST_CYCLES = 10
LAST_DAYS = 7


def _engine_window(p: Prepared, unit: int, cycle: int) -> Windows:
    m = (p.replay_df["unit"] == unit).to_numpy()
    z = p.replay_z[m]
    w = p.cfg["window"]
    end = max(cycle, 1)
    seq = z[max(0, end - w) : end]
    if len(seq) < w:
        seq = np.concatenate([np.repeat(seq[:1], w - len(seq), 0), seq])
    return Windows(seq[None].astype(np.float32), np.zeros(1, np.float32), np.zeros(1, np.float32), np.array([end]),
                   np.array([unit]))


def _seq_model(subset: str) -> SeqEnsemble | None:
    path = MODELS_DIR / "engine" / subset / "model.pt"
    if not path.exists():
        return None
    ck = torch.load(path, weights_only=False)
    return SeqEnsemble(ck["members"], ck["n_in"], ck["quantiles"], ck["hp"], ck["r_max"], [])


def engine_drivers(p: Prepared, booster: lgb.Booster, unit: int, cycle: int) -> tuple[list[dict[str, Any]], float]:
    inputs = p.cfg["inputs"]
    win = _engine_window(p, unit, cycle)
    base = float(booster.predict(summary_features(win, inputs, True)[0])[0])
    out = []
    m = (p.replay_df["unit"] == unit).to_numpy()
    rows = p.replay_df[m].iloc[max(0, cycle - LAST_CYCLES) : max(cycle, 1)]
    clusters = p.norm.cluster(rows)
    for j, s in enumerate(inputs):
        if s not in HEADLINE_SENSORS:
            continue
        occ = Windows(win.x.copy(), win.y, win.y_true, win.cycle, win.unit)
        occ.x[:, :, j] = p.norm.healthy_z[j]
        delta = float(booster.predict(summary_features(occ, inputs, True)[0])[0]) - base
        z_last = p.norm.transform(rows)[:, j]
        raw_dev = float(np.mean((z_last - p.norm.healthy_z[j]) * p.norm.std[clusters, j]))
        sym, desc, unit_s = SENSOR_NAMES[s]
        unit_txt = "" if unit_s in ("–", "-") else f" {unit_s}"
        out.append({"sensor": s, "symbol": sym, "name": desc, "part": HEADLINE_SENSORS[s], "delta_rul_cycles": round(delta, 2),
                    "deviation": round(raw_dev, 3), "unit": unit_s,
                    "text": f"{desc[0].upper() + desc[1:]} ({sym}) is {raw_dev:+.3g}{unit_txt} from its healthy baseline "
                            f"over the last {LAST_CYCLES} cycles; resetting it to healthy would add "
                            f"{delta:.0f} cycle{'' if round(delta) == 1 else 's'} to the estimate"})
    # only sensors that actually pull the estimate down are drivers (none → the engine looks healthy)
    out = [d for d in out if d["delta_rul_cycles"] > 0.5]
    out.sort(key=lambda r: -r["delta_rul_cycles"])
    return out[:3], base


def system_drivers(model: SynthModel, hist: pd.DataFrame, tail: str, system: str, stress: dict[str, float]) -> list[dict[str, Any]]:
    sens = [s for s in model.sensors if s["system"] == system and s["kind"] == "analog"]
    h = hist[(hist["tail"] == tail) & (hist["day"] > -LAST_DAYS)]
    out = []
    for s in sens:
        v = h.loc[h["sensor"] == s["id"], "value"].to_numpy(dtype=float)
        if np.isnan(v).all():
            continue
        expected = s["healthy"] + sum(c * stress[e] for e, c in s.get("env", {}).items())
        dev = float(np.nanmean(v) - expected)
        frac = dev / s["effect"] if s["effect"] else 0.0
        out.append({"sensor": s["id"], "name": s["name"], "unit": s["unit"], "deviation": round(dev, 3),
                    "share_of_failure_signature": round(frac, 3),
                    "text": f"{s['name']} is {dev:+.4g} {s['unit']} from healthy ({max(frac, 0):.0%} of its failure signature)"})
    out.sort(key=lambda r: -r["share_of_failure_signature"])
    return out[:3]


def confidence(p_fail: float, rel_width: float, min_trust: float, disagreement: float | None,
               cfg: dict[str, Any]) -> dict[str, Any]:
    """How sure we are that the decision side is right: distance of P(fail) from θ, sensor trust, model agreement."""
    margin = abs(p_fail - cfg["theta"])
    disagree_bad = disagreement is not None and disagreement > cfg["disagreement_low_cycles"]
    low = margin < cfg["margin_low"] or min_trust < cfg["min_trust_low"] or disagree_bad
    high = margin >= cfg["margin_high"] and min_trust >= cfg["min_trust_high"] and \
        (disagreement is None or disagreement <= cfg["disagreement_low_cycles"] / 2)
    side = "above" if p_fail >= cfg["theta"] else "below"
    reasons = [f"failure risk {p_fail:.0%} is {margin * 100:.0f} points {side} the {cfg['theta']:.0%} threshold",
               f"lowest trust among the driving sensors {min_trust:.0f}/100",
               f"80 % interval spans {rel_width:.1f}× the larger of the median RUL and the decision window"]
    if disagreement is not None:
        reasons.append(f"two independent engine models differ by {disagreement:.0f} cycles")
    return {"level": "low" if low else ("high" if high else "medium"), "reasons": reasons,
            "decision_margin": round(margin, 4), "rel_width": round(rel_width, 3), "min_trust": round(min_trust, 1),
            "model_disagreement_cycles": None if disagreement is None else round(disagreement, 1)}


def build_explanations(trust: pd.DataFrame) -> dict[str, Any]:
    world = read_json(PROCESSED_DIR / "world" / "world.json")
    d0 = pd.read_parquet(PROCESSED_DIR / "state" / "d0_systems.parquet")
    hist = pd.read_parquet(PROCESSED_DIR / "state" / "sensor_history.parquet")
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    env0 = env[env["day"] == 0].set_index("base")
    ccfg = load_config("intelligence")["confidence"]
    window = load_config("systems")["window_days"]
    model = SynthModel()
    preps: dict[str, Prepared] = {}
    boosters: dict[str, lgb.Booster] = {}
    seqs: dict[str, SeqEnsemble | None] = {}
    out: dict[str, Any] = {}
    for a in world["aircraft"]:
        tail = a["tail"]
        stress = {e: float(env0.loc[a["base"], e]) for e in STRESSES}
        tt = trust[trust["tail"] == tail]
        rec: dict[str, Any] = {}
        for _, row in d0[d0["tail"] == tail].iterrows():
            s = row["system"]
            # width relative to max(median, decision window): near failure a tiny median must not make every pull "low"
            rel_w = float((row["rul_p90_days"] - row["rul_p10_days"]) / max(row["rul_p50_days"], window))
            if s == "engines":
                e = max(a["engines"], key=lambda e: e["start_cycle"] / e["unit_life_cycles"])
                sub = e["cmapss_subset"]
                if sub not in preps:
                    preps[sub] = prepare(sub)
                    boosters[sub] = lgb.Booster(model_file=str(MODELS_DIR / "engine" / sub / "lgbm.txt"))
                    seqs[sub] = _seq_model(sub)
                drivers, p50 = engine_drivers(preps[sub], boosters[sub], e["replay_unit"], e["start_cycle"])
                dis = None
                if seqs[sub] is not None:
                    w = _engine_window(preps[sub], e["replay_unit"], e["start_cycle"])
                    q, _ = seqs[sub].predict(with_cycle_channel(w))  # type: ignore[union-attr]
                    dis = abs(float(q[0, q.shape[1] // 2]) - p50)
                g = tt[tt["group"] == f"engine{e['position']}"]
                keys = {d["sensor"] for d in drivers}
                mt = float(g[g["sensor"].str.split(":").str[0].isin(keys)]["trust"].min()) if len(g) else 100.0
                rec[s] = {"engine_position": e["position"], "drivers": drivers, "confidence": confidence(float(row["p_fail_window"]), rel_w, mt, dis, ccfg)}
            else:
                drivers = system_drivers(model, hist, tail, s, stress)
                g = tt[(tt["group"] == s) & tt["sensor"].isin([d["sensor"] for d in drivers])]
                mt = float(g["trust"].min()) if len(g) else 100.0
                for d in drivers:
                    d["trust"] = float(tt[(tt["group"] == s) & (tt["sensor"] == d["sensor"])]["trust"].min()) \
                        if ((tt["group"] == s) & (tt["sensor"] == d["sensor"])).any() else None
                rec[s] = {"drivers": drivers, "confidence": confidence(float(row["p_fail_window"]), rel_w, mt, None, ccfg)}
        out[tail] = rec
    return out
