"""Mission-aware fit (SPEC §8.3, U2): P(complete mission without a system failure) = Π_i (1 − P(fail_i within L)).

RUL estimates are adjusted for the mission environment: each system's degradation-rate multiplier under the mission
stresses is compared with its multiplier at home base (couplings.yaml), and RUL is divided by the ratio.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from pratirakshak.decide.combine import critical_systems
from pratirakshak.io import load_config, read_json
from pratirakshak.models import conformal as C
from pratirakshak.settings import PROCESSED_DIR
from pratirakshak.synth.model import STRESSES

Q3 = [0.1, 0.5, 0.9]


def env_multiplier(system: str, stress: dict[str, float], coup: dict[str, Any]) -> float:
    if system == "engines":
        return 1 + sum(c * stress.get(e, 0.0) for e, c in coup["engine_cycle_acceleration"].items())
    return 1 + sum(coup["environment"].get(e, {}).get(system, 0.0) * stress.get(e, 0.0) for e in STRESSES)


def mission_fit() -> list[dict[str, Any]]:
    cfg = load_config("intelligence")["missions"]
    world_cfg = load_config("world")
    coup = load_config("couplings")
    syscfg = load_config("systems")
    world = read_json(PROCESSED_DIR / "world" / "world.json")
    sysdefs = {s["id"]: s for s in world_cfg["systems"]}
    types = {t["id"]: t for t in world_cfg["aircraft_types"]}
    d0 = pd.read_parquet(PROCESSED_DIR / "state" / "d0_systems.parquet")
    ac = pd.read_parquet(PROCESSED_DIR / "state" / "d0_aircraft.parquet").set_index("tail")
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    env0 = env[env["day"] == 0].set_index("base")
    out = []
    for m in cfg:
        home = {e: float(env0.loc[m["base"], e]) for e in STRESSES}
        mission_stress = {**home, **m["environment"]}
        crit = critical_systems({s: sysdefs[s]["mission_critical"] for s in sysdefs}, types[m["type"]]["criticality_role"])
        cands = []
        for a in world["aircraft"]:
            if a["base"] != m["base"] or a["type"] != m["type"]:
                continue
            rows = d0[d0["tail"] == a["tail"]]
            per = {}
            for _, r in rows.iterrows():
                s = r["system"]
                ratio = env_multiplier(s, mission_stress, coup) / env_multiplier(s, home, coup)
                q = np.array([[r["rul_p10_days"], r["rul_p50_days"], r["rul_p90_days"]]]) / ratio
                per[s] = float(C.p_fail_within(q, Q3, m["length_days"])[0])
            p_complete = float(np.prod([1 - v for v in per.values()]))
            worst = max(sorted(per), key=lambda s: per[s])
            excl = []
            if ac.loc[a["tail"], "status"] == "PULL":
                excl.append(f"already pulled (limited by {ac.loc[a['tail'], 'limiting_system']})")
            over = [s for s in sorted(crit) if per.get(s, 0) >= m["theta"]]
            if over:
                excl.append("risk over mission limit θ=" + f"{m['theta']:.2f}: " + ", ".join(f"{s} {per[s]:.0%}" for s in over))
            cands.append({"tail": a["tail"], "p_complete": round(p_complete, 4), "worst_system": worst,
                          "worst_p": round(per[worst], 4), "excluded": bool(excl), "reasons": excl,
                          "per_system": {k: round(v, 4) for k, v in per.items()}})
        cands.sort(key=lambda c: (c["excluded"], -c["p_complete"], c["tail"]))
        chosen = [c["tail"] for c in cands if not c["excluded"]][: m["aircraft_needed"]]
        deferrable = [c["tail"] for c in cands if not c["excluded"] and c["tail"] not in chosen]
        out.append({**{k: m[k] for k in ("id", "name", "base", "type", "aircraft_needed", "length_days", "criticality", "theta")},
                    "environment": m["environment"], "candidates": cands, "assigned": chosen,
                    "shortfall": max(0, m["aircraft_needed"] - len(chosen)),
                    "note": "Work on assigned aircraft that does not threaten this mission can be deferred until after it; "
                            f"spare aircraft: {', '.join(deferrable) or 'none'}.",
                    "window_days_default": syscfg["window_days"]})
    return out
