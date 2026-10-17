"""Fit trust relations and run the fault-injection harness (SPEC §8.2). Also scores the fleet's sensors at D+0."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from pratirakshak.ingest.cmapss import SENSOR_NAMES, SUBSETS, load_subset
from pratirakshak.intelligence.trust import GroupRelation, reasons, score
from pratirakshak.io import load_config, read_json
from pratirakshak.models.engine_data import prepare
from pratirakshak.settings import PROCESSED_DIR, derive_seed
from pratirakshak.synth.model import FAULT_TYPES, SYSTEMS, SynthModel
from pratirakshak.synth.train import simulate

ENGINE_FAULTS = ["stuck", "drift", "dropout", "spike"]


def system_groups(model: SynthModel) -> dict[str, np.ndarray]:
    return {s: np.where((model.sensor_system == j) & model.analog)[0] for j, s in enumerate(SYSTEMS)}


# ------------------------------------------------------------------------------------------ fitting
def fit_system_relations(model: SynthModel, cfg: dict[str, Any]) -> dict[str, GroupRelation]:
    rec = simulate(model, 120, 400, derive_seed("trust-clean"), faults=False)
    T, N, _ = rec.obs.shape
    ctx = rec.stress.reshape(T * N, -1)
    rels = {}
    for s, cols in system_groups(model).items():
        clean = rec.obs[:, :, cols].reshape(T * N, len(cols)).astype(float)
        series = np.moveaxis(rec.obs[:, :, cols], 0, 1).astype(float)  # (N, T, Ms)
        rels[s] = GroupRelation.fit([model.sensor_ids[c] for c in cols], clean, ctx, series, cfg["stuck_run"])
    return rels


def fit_engine_relation(subset: str, cfg: dict[str, Any]) -> tuple[GroupRelation, Any]:
    p = prepare(subset)
    tr = load_subset(subset).train
    tr = tr[tr["unit"].isin(p.split_units["train"])].reset_index(drop=True)
    z = p.norm.transform(tr)
    chunks = []
    for u in tr["unit"].unique():
        zu = z[(tr["unit"] == u).to_numpy()]
        for i in range(0, len(zu) - 99, 100):
            chunks.append(zu[i : i + 100])
    rel = GroupRelation.fit(p.cfg["inputs"], z.astype(float), None, np.stack(chunks).astype(float), cfg["stuck_run"])
    return rel, p


# ------------------------------------------------------------------------------------------ evaluation
def _evaluate(flag: np.ndarray, truth: np.ndarray, window: int, steps: np.ndarray) -> dict[str, Any]:
    """flag: (S, N, M) at evaluated steps; truth: (T, N, M) fault code per time step (0 = none)."""
    T, N, M = truth.shape
    step_index = {int(t): i for i, t in enumerate(steps)}
    det: dict[str, list[int]] = {k: [] for k in FAULT_TYPES[1:]}
    delays: list[int] = []
    for u in range(N):
        for m in range(M):
            code = truth[:, u, m]
            t = 0
            while t < T:
                if code[t] == 0:
                    t += 1
                    continue
                start, typ = t, FAULT_TYPES[int(code[t])]
                while t < T and code[t] != 0:
                    t += 1
                end = t - 1
                if start < steps[0]:
                    continue
                hits = [s for s in range(start, min(end + 3, T - 1) + 1) if s in step_index and flag[step_index[s], u, m]]
                det[typ].append(1 if hits else 0)
                if hits:
                    delays.append(hits[0] - start)
    active = truth > 0
    win_active = np.zeros((len(steps), N, M), dtype=bool)
    for i, t in enumerate(steps):
        win_active[i] = active[max(0, t - window + 1) : t + 1].any(0)
    clean = ~win_active
    fa = int((flag & clean).sum())
    n_ep = sum(len(v) for v in det.values())
    return {
        "episodes": n_ep,
        "detection_rate": round(sum(sum(v) for v in det.values()) / max(n_ep, 1), 4),
        "by_type": {k: {"episodes": len(v), "detection_rate": round(sum(v) / max(len(v), 1), 4)} for k, v in det.items() if v},
        "median_delay_steps": float(np.median(delays)) if delays else None,
        "false_alarm_rate_per_sensor_step": round(fa / max(int(clean.sum()), 1), 5),
        "clean_sensor_steps": int(clean.sum()),
    }


def harness_systems(model: SynthModel, rels: dict[str, GroupRelation], cfg: dict[str, Any]) -> dict[str, Any]:
    h = cfg["harness"]
    rec = simulate(model, h["airframes"], h["days"], derive_seed("trust-harness"), faults=True)
    W = cfg["window_days"]
    steps = np.arange(W - 1, rec.obs.shape[0])
    groups = system_groups(model)
    flags, truths = [], []
    for s, cols in groups.items():
        f = np.zeros((len(steps), rec.obs.shape[1], len(cols)), dtype=bool)
        for i, t in enumerate(steps):
            comp = score(rels[s], rec.obs[t - W + 1 : t + 1][:, :, cols].transpose(1, 0, 2).astype(float),
                         rec.stress[t - W + 1 : t + 1].transpose(1, 0, 2).astype(float), cfg)
            f[i] = comp["trust"] < cfg["untrusted_below"]
        flags.append(f)
        truths.append(rec.fault[:, :, cols])
    return _evaluate(np.concatenate(flags, 2), np.concatenate(truths, 2), W, steps)


def harness_engines(cfg: dict[str, Any]) -> tuple[dict[str, Any], dict[str, GroupRelation]]:
    h = cfg["harness"]
    W = cfg["engine_window_cycles"]
    all_flags, rels = [], {}
    for subset in SUBSETS:
        rel, p = fit_engine_relation(subset, cfg)
        rels[subset] = rel
        rng = np.random.default_rng(derive_seed("trust-engine-harness", subset))
        units = sorted(p.replay_df["unit"].unique())[: h["engine_units_per_subset"]]
        for u in units:
            z = p.replay_z[(p.replay_df["unit"] == u).to_numpy()].astype(float).copy()
            T, M = z.shape
            truth = np.zeros((T, 1, M), dtype=np.int8)
            for m in range(M):
                if rng.random() >= h["engine_fault_prob_per_sensor"] or T < 80:
                    continue
                typ = ENGINE_FAULTS[int(rng.integers(len(ENGINE_FAULTS)))]
                start = int(rng.integers(40, T - 20))
                end = start if typ == "spike" else min(T - 1, start + 25)
                sign = rng.choice([-1.0, 1.0])
                if typ == "stuck":
                    z[start : end + 1, m] = z[start, m]
                elif typ == "drift":
                    z[start : end + 1, m] += sign * 0.15 * np.arange(1, end - start + 2)
                elif typ == "dropout":
                    z[start : end + 1, m] = np.nan
                else:
                    z[start, m] += sign * 6.0
                truth[start : end + 1, 0, m] = FAULT_TYPES.index(typ)
            steps = np.arange(W - 1, T, 2)
            flag = np.zeros((len(steps), 1, M), dtype=bool)
            for i, t in enumerate(steps):
                comp = score(rel, z[None, t - W + 1 : t + 1], None, cfg)
                flag[i, 0] = comp["trust"][0] < cfg["untrusted_below"]
            all_flags.append((flag, truth, steps))
    # pool engine results across units
    agg: dict[str, Any] = {"episodes": 0, "hits": 0, "fa": 0, "clean": 0, "delays": [], "by_type": {}}
    for flag, truth, steps in all_flags:
        r = _evaluate(flag, truth, W, steps)
        agg["episodes"] += r["episodes"]
        agg["hits"] += round(r["detection_rate"] * r["episodes"])
        agg["fa"] += round(r["false_alarm_rate_per_sensor_step"] * r["clean_sensor_steps"])
        agg["clean"] += r["clean_sensor_steps"]
        if r["median_delay_steps"] is not None:
            agg["delays"].append(r["median_delay_steps"] * 2)
        for k, v in r["by_type"].items():
            bt = agg["by_type"].setdefault(k, [0, 0])
            bt[0] += v["episodes"]
            bt[1] += round(v["detection_rate"] * v["episodes"])
    out = {"episodes": agg["episodes"], "detection_rate": round(agg["hits"] / max(agg["episodes"], 1), 4),
           "by_type": {k: {"episodes": e, "detection_rate": round(hh / max(e, 1), 4)} for k, (e, hh) in agg["by_type"].items()},
           "median_delay_cycles": float(np.median(agg["delays"])) if agg["delays"] else None,
           "false_alarm_rate_per_sensor_step": round(agg["fa"] / max(agg["clean"], 1), 5), "clean_sensor_steps": agg["clean"]}
    return out, rels


# ------------------------------------------------------------------------------------------ fleet at D+0
def fleet_trust(model: SynthModel, sys_rels: dict[str, GroupRelation], eng_rels: dict[str, GroupRelation],
                cfg: dict[str, Any]) -> pd.DataFrame:
    hist = pd.read_parquet(PROCESSED_DIR / "state" / "sensor_history.parquet")
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    aircraft = read_json(PROCESSED_DIR / "world" / "world.json")["aircraft"]
    W = cfg["window_days"]
    recent = hist[hist["day"] > -W]
    tails = [a["tail"] for a in aircraft]
    rows = []
    stress_cols = ["heat", "cold", "humidity", "wet", "dust", "salinity", "altitude"]
    env0 = env[env["day"] == 0].set_index("base")[stress_cols]
    for s, rel in sys_rels.items():
        cube = recent[recent["sensor"].isin(rel.names)].pivot_table(index=["tail", "day"], columns="sensor", values="value",
                                                                    dropna=False)[rel.names]
        win = cube.to_numpy().reshape(len(tails), W, len(rel.names)) if len(cube) == len(tails) * W else None
        assert win is not None, "sensor history shape mismatch"
        order = cube.index.get_level_values(0).unique().tolist()
        ctx = np.stack([np.repeat(env0.loc[next(a["base"] for a in aircraft if a["tail"] == t)].to_numpy()[None, :], W, 0)
                        for t in order]).astype(float)
        comp = score(rel, win.astype(float), ctx, cfg)
        for i, t in enumerate(order):
            for k, name in enumerate(rel.names):
                rows.append({"tail": t, "group": s, "sensor": name, "trust": float(comp["trust"][i, k]),
                             "reasons": "; ".join(reasons(comp, i, k, cfg["residual_z_warn"]))})
    # engines: REAL replay windows at each tail's start cycle
    preps = {}
    for a in aircraft:
        for e in a["engines"]:
            sub = e["cmapss_subset"]
            if sub not in preps:
                preps[sub] = prepare(sub)
            p = preps[sub]
            z = p.replay_z[(p.replay_df["unit"] == e["replay_unit"]).to_numpy()].astype(float)
            c = max(e["start_cycle"], 1)
            Wc = cfg["engine_window_cycles"]
            w = z[max(0, c - Wc) : c]  # no left-padding here: repeated padding rows would look "stuck"
            if len(w) < 3:
                w = z[:3]
            comp = score(eng_rels[sub], w[None], None, cfg)
            for k, s in enumerate(eng_rels[sub].names):
                rows.append({"tail": a["tail"], "group": f"engine{e['position']}", "sensor": f"{s}:{SENSOR_NAMES[s][0]}",
                             "trust": float(comp["trust"][0, k]), "reasons": "; ".join(reasons(comp, 0, k, cfg["residual_z_warn"]))})
    return pd.DataFrame(rows)


def run_all() -> dict[str, Any]:
    cfg = load_config("intelligence")["trust"]
    model = SynthModel()
    sys_rels = fit_system_relations(model, cfg)
    sys_res = harness_systems(model, sys_rels, cfg)
    eng_res, eng_rels = harness_engines(cfg)
    fleet = fleet_trust(model, sys_rels, eng_rels, cfg)
    return {"systems": sys_res, "engines": eng_res, "fleet": fleet,
            "relations": {**{s: r.to_json() for s, r in sys_rels.items()}, **{s: r.to_json() for s, r in eng_rels.items()}}}
