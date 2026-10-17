"""Fleet state at D+0 (SPEC §7.6): every tail × 8 systems with health, RUL p10/p50/p90 (days), P(fail in window),
readiness gating and the limiting system. Non-engine systems: SIMULATED 60-day history from each tail's real base
climate and usage, then the trained system models. Engines: REAL replay trajectory at the tail's start cycle."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from pratirakshak.decide.combine import critical_systems, gate, health_from_rul, weighted_health
from pratirakshak.io import load_config, read_json, write_json, write_parquet
from pratirakshak.models import conformal as C
from pratirakshak.settings import MODELS_DIR, PROCESSED_DIR, derive_seed
from pratirakshak.synth.model import STRESSES, SYSTEMS, SynthModel
from pratirakshak.synth.train import QUANTILES, SystemPredictor, legacy_intervals, simulate, system_dataset

STATE_DIR = PROCESSED_DIR / "state"


def engine_cycles_per_day(t: dict[str, Any], tempo: float, stress: dict[str, float], coup: dict[str, Any], weekend: float) -> float:
    spd = t["sorties_per_day"] * tempo * (5 + 2 * weekend) / 7
    accel = 1 + sum(c * stress[e] for e, c in coup["engine_cycle_acceleration"].items())
    return spd / t["engine_cycle_to_sorties"] * accel


def build_d0() -> dict[str, Any]:
    world = load_config("world")
    syscfg = load_config("systems")
    coup = load_config("couplings")
    aircraft = read_json(PROCESSED_DIR / "world" / "world.json")["aircraft"]
    types = {t["id"]: t for t in world["aircraft_types"]}
    tempo = {b["id"]: b["tempo"] for b in world["bases"]}
    sysdefs = {s["id"]: s for s in world["systems"]}
    weights = {s: sysdefs[s]["weight"] for s in sysdefs}
    H, W = syscfg["history_days"], syscfg["feature_window_days"]
    win_days = syscfg["window_days"]
    model = SynthModel()
    pred = SystemPredictor()

    # ---- non-engine systems: simulate days −H … 0 for all tails at once (renewal = repaired if it failed)
    n = len(aircraft)
    start = date.fromisoformat(world["calendar"]["sim_start"]) - timedelta(days=H)
    doy0 = np.array([(start - date(start.year, 1, 1)).days] * n)
    rng = np.random.default_rng(derive_seed("fleet-d0-init"))
    bases, tys = [a["base"] for a in aircraft], [a["type"] for a in aircraft]
    frac = syscfg["legacy_service_fraction"]
    interval = legacy_intervals(model, tys, bases, frac)
    # each system sits at a random phase of the fleet's existing calendar-maintenance cycle at D−60
    dss0 = rng.uniform(0, 1, size=interval.shape) * interval
    d0 = dss0 / (interval / frac) * rng.uniform(0.8, 1.25, size=interval.shape)
    st = SYSTEMS.index("structure")
    d0[:, st] = np.array([0.85 * a["airframe_hours"] / a["airframe_life_hours"] for a in aircraft]) + rng.uniform(0, 0.1, n)
    eng_d0 = np.array([np.mean([e["start_cycle"] / e["unit_life_cycles"] for e in a["engines"]]) for a in aircraft])
    rec = simulate(model, n, H + 1, derive_seed("fleet-d0-sim"), d0=d0, base_of=bases, type_of=tys, start_doy=doy0,
                   engine_d0=eng_d0, service_interval=interval, dss0=dss0)

    rows: list[dict[str, Any]] = []
    for s_idx, s in enumerate(SYSTEMS):
        X, _, unit, day = system_dataset(model, rec, s_idx, W, syscfg["rul_cap_days"], 1, None)
        last = day == H
        qv = pred.quantiles(s, X[last])
        pf = C.p_fail_within(qv, QUANTILES, win_days)
        for i, u in enumerate(unit[last]):
            a = aircraft[int(u)]
            rows.append({"tail": a["tail"], "system": s, "provenance": sysdefs[s]["provenance"],
                         "rul_p10_days": qv[i, 1], "rul_p50_days": qv[i, 5], "rul_p90_days": qv[i, 9],
                         "p_fail_window": pf[i], "health": health_from_rul(qv[i, 5], syscfg["health_ref"]["systems_days"]),
                         "truth_damage": float(rec.d[H, int(u), s_idx])})

    # ---- engines (REAL replay predictions at the start cycle; cycles → days at this tail's usage)
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    env0 = env[env["day"] == 0].set_index("base")
    weekend = world["missions"]["weekend_factor"]
    rp_cache: dict[str, pd.DataFrame] = {}
    for a in aircraft:
        t = types[a["type"]]
        cpd = engine_cycles_per_day(t, tempo[a["base"]], {e: float(env0.loc[a["base"], e]) for e in STRESSES}, coup, weekend)
        per_engine = []
        for e in a["engines"]:
            sub = e["cmapss_subset"]
            if sub not in rp_cache:
                rp_cache[sub] = pd.read_parquet(MODELS_DIR / "engine" / sub / "replay_predictions.parquet").set_index(["unit", "cycle"])
            r = rp_cache[sub].loc[(e["replay_unit"], max(e["start_cycle"], 1))]
            q_cyc = np.array([[r[f"q{int(round(q * 100)):02d}"] for q in QUANTILES]])
            pf = float(C.p_fail_within(q_cyc, QUANTILES, win_days * cpd)[0])
            per_engine.append((pf, q_cyc[0] / cpd, (e["unit_life_cycles"] - e["start_cycle"]) / cpd))
        pfs = [x[0] for x in per_engine]
        worst = int(np.argmax([x[0] for x in per_engine]))
        q_days, true_days = per_engine[worst][1], per_engine[worst][2]
        rows.append({"tail": a["tail"], "system": "engines", "provenance": "REAL",
                     "rul_p10_days": q_days[1], "rul_p50_days": q_days[5], "rul_p90_days": q_days[9],
                     "p_fail_window": 1 - float(np.prod([1 - p for p in pfs])),
                     "health": health_from_rul(q_days[5] * cpd, syscfg["health_ref"]["engines_cycles"]),
                     "truth_damage": float(min(np.mean([e["start_cycle"] / e["unit_life_cycles"] for e in a["engines"]]), 1.5)),
                     "truth_rul_days": float(true_days)})
    sys_df = pd.DataFrame(rows)
    num = ["rul_p10_days", "rul_p50_days", "rul_p90_days", "p_fail_window", "health", "truth_damage", "truth_rul_days"]
    sys_df[num] = sys_df[num].astype(float).round(4)
    order = ["engines", *SYSTEMS]
    sys_df["system"] = pd.Categorical(sys_df["system"], order, ordered=True)
    sys_df = sys_df.sort_values(["tail", "system"]).reset_index(drop=True)
    sys_df["system"] = sys_df["system"].astype(str)

    # ---- aircraft view
    ac_rows = []
    for a in aircraft:
        sub = sys_df[sys_df["tail"] == a["tail"]].set_index("system")
        crit = critical_systems({s: sysdefs[s]["mission_critical"] for s in sysdefs}, types[a["type"]]["criticality_role"])
        g = gate(sub["p_fail_window"].to_dict(), crit, syscfg["risk"]["watch"], syscfg["risk"]["pull"])
        ac_rows.append({"tail": a["tail"], "type": a["type"], "base": a["base"], "status": g.status,
                        "limiting_system": g.limiting_system, "limiting_p": round(g.limiting_p, 4),
                        "risk_window": round(g.risk, 4),
                        "weighted_health": round(weighted_health(sub["health"].to_dict(), weights), 2),
                        "body_health": round(float(sub.loc["structure", "health"]), 2),
                        "age_years": a["age_years"], "airframe_life_used": round(a["airframe_hours"] / a["airframe_life_hours"], 4)})
    ac_df = pd.DataFrame(ac_rows)

    # ---- sensor history (for sparklines and Stage 5 trust scoring)
    days = np.arange(-H, 1)
    hist = []
    for k, sid in enumerate(model.sensor_ids):
        v, f = rec.obs[:, :, k], rec.fault[:, :, k]
        for u, a in enumerate(aircraft):
            hist.append(pd.DataFrame({"tail": a["tail"], "sensor": sid, "day": days, "value": np.round(v[:, u], 4),
                                      "fault_truth": f[:, u]}))
    hist_df = pd.concat(hist, ignore_index=True)

    write_parquet(STATE_DIR / "d0_systems.parquet", sys_df)
    write_parquet(STATE_DIR / "d0_aircraft.parquet", ac_df)
    write_parquet(STATE_DIR / "sensor_history.parquet", hist_df)
    write_json(STATE_DIR / "d0_latent.json", {
        "note": "Ground-truth latent damage at D+0 (simulator only; never shown as an estimate).",
        "systems": SYSTEMS, "tails": [a["tail"] for a in aircraft], "damage": np.round(rec.d[H], 6).tolist(),
        "days_since_service": rec.dss[H].astype(int).tolist(),
        "history_failures": [{"tail": aircraft[u]["tail"], "system": SYSTEMS[s], "day": int(t - H)} for u, s, t in rec.failures],
    })
    return {"aircraft": ac_df, "systems": sys_df, "history_rows": len(hist_df)}
