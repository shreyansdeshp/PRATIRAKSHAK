"""Stage 6 — decisions + spares + hangar plan at D+0. `./tasks.ps1 plan` / `make plan` / `python -m pratirakshak.decide`."""

from __future__ import annotations

import math
import sys
from collections import Counter
from datetime import date
from typing import Any

import pandas as pd

from pratirakshak.decide.rule import Context, add_cannibalisation, decide_aircraft
from pratirakshak.decide.spares import Logistics
from pratirakshak.io import load_config, read_json, write_json, write_text
from pratirakshak.plan.scheduler import BaseCapacity, Task, check_limits, schedule
from pratirakshak.settings import PROCESSED_DIR, REPORTS_DIR

STATE, PLAN = PROCESSED_DIR / "state", PROCESSED_DIR / "plan"


def estimates_for(tail: str, d0: pd.DataFrame, ex: dict[str, Any], trust: pd.DataFrame) -> list[dict[str, Any]]:
    out = []
    for _, r in d0[d0["tail"] == tail].iterrows():
        s = r["system"]
        e = ex[tail][s]
        conf = e["confidence"]
        note = ""
        drivers = e["drivers"]
        if s != "engines" and drivers:
            t = trust[(trust["tail"] == tail) & (trust["group"] == s) & trust["sensor"].isin([d["sensor"] for d in drivers])]
            if len(t):
                worst = t.sort_values("trust").iloc[0]
                note = f"{worst['sensor']}: {worst['reasons']}" if worst["reasons"] else ""
        out.append({"tail": tail, "system": s, "p_fail": r["p_fail_window"], "rul_p10": r["rul_p10_days"],
                    "rul_p50": r["rul_p50_days"], "rul_p90": r["rul_p90_days"], "drivers": drivers,
                    "min_trust": conf["min_trust"], "trust_note": note, "confidence": conf, "failed": False})
    return out


def build_tasks(decisions: list[dict[str, Any]], ctx: Context, horizon: int) -> list[Task]:
    tasks = []
    for d in decisions:
        for s in d["systems"]:
            a = s["action"]
            if a in ("SERVE_NORMALLY", "SWAP_TAIL_FOR_MISSION"):
                continue
            part = ctx.parts[s["lru"]]
            hours = 2.0 if a == "VERIFY_SENSOR" else part["install_hours"] * ctx.policies["tech_hours_factor"]
            release = 0
            sp = s.get("spares")
            if sp and sp["chosen"] and not (a == "PULL_FROM_LINE" and s.get("cannibalise_from")):
                release = math.ceil(sp["chosen"]["eta_hours"] / 24) if sp["chosen"]["eta_hours"] != float("inf") \
                    else math.ceil(part["lead_time_days"])
            elif sp and not sp["chosen"]:
                release = math.ceil(part["lead_time_days"])
            due = 0 if a == "PULL_FROM_LINE" else (2 if a == "VERIFY_SENSOR" else max(0, min(horizon, int(s["rul_days"][0]))))
            tasks.append(Task(d["tail"], d["base"], d["type"], s["system"], s["lru"], hours, min(release, horizon), due,
                              s["p_fail"] * 100 + 1 + (50 if a == "PULL_FROM_LINE" else 0), a == "PULL_FROM_LINE"))
    return tasks


def capacities(world: dict[str, Any], decisions: list[dict[str, Any]], floor: float) -> dict[str, BaseCapacity]:
    cap = {}
    for b in world["bases"]:
        n_type = Counter(a["type"] for a in world["aircraft"] if a["base"] == b["id"])
        pulled = Counter(d["type"] for d in decisions if d["base"] == b["id"] and d["action"] == "PULL_FROM_LINE")
        allow = {t: max(int(math.floor(n * (1 - floor))), pulled[t], 1) for t, n in n_type.items()}
        cap[b["id"]] = BaseCapacity(b["hangar_bays"], b["tech_hours_per_day"], allow)
    return cap


def main() -> int:
    world = read_json(PROCESSED_DIR / "world" / "world.json")
    wcfg = load_config("world")
    d0 = pd.read_parquet(STATE / "d0_systems.parquet")
    ac = pd.read_parquet(STATE / "d0_aircraft.parquet").set_index("tail")
    ex = read_json(STATE / "explanations.json")
    trust = pd.read_parquet(STATE / "trust_d0.parquet")
    missions = pd.read_parquet(PROCESSED_DIR / "world" / "missions.parquet")
    mfit = read_json(STATE / "mission_fit.json")
    ctx = Context(Logistics(world), {p["lru"]: p for p in world["parts"]})
    on = date.fromisoformat(wcfg["calendar"]["sim_start"])
    vahak_bases = {t for t in ac.index if ac.loc[t, "type"] == "VAH" and ac.loc[t, "status"] != "PULL"}
    vahak_bases = {ac.loc[t, "base"] for t in vahak_bases}
    crit_today = missions[missions["day"] == 0].set_index(["base", "type"])["criticality"].to_dict()

    decisions = []
    for a in world["aircraft"]:
        crit = crit_today.get((a["base"], a["type"]), "training")
        theta = ctx.policies["theta"][crit]
        d = decide_aircraft(a, estimates_for(a["tail"], d0, ex, trust), theta, crit, on, vahak_bases, ctx)
        d["status_d0"] = ac.loc[a["tail"], "status"]
        decisions.append(d)
    add_cannibalisation(decisions)
    swaps = {c["tail"]: m["id"] for m in mfit for c in m["candidates"] if c["excluded"] and not c["reasons"][0].startswith("already")}
    for d in decisions:
        if d["tail"] in swaps and ctx.severity[d["action"]] > ctx.severity["SWAP_TAIL_FOR_MISSION"]:
            d["action"], d["reason"] = "SWAP_TAIL_FOR_MISSION", \
                f"Fit for routine flying, but over the risk limit for mission {swaps[d['tail']]}: swap in another tail."

    H = ctx.policies["scheduler"]["horizon_days"]
    tasks = build_tasks(decisions, ctx, H)
    cap = capacities(world, decisions, wcfg["readiness_floor"])
    plan = schedule(tasks, cap)
    violations = check_limits(plan["visits"], cap)

    requests, n = [], 0
    for d in decisions:
        for s in d["systems"]:
            sp = s.get("spares")
            if not sp or not sp["chosen"] or sp["chosen"]["mode"] == "local":
                continue
            n += 1
            requests.append({"demand_id": f"D-{n:04d}", "tail": d["tail"], "lru": s["lru"], "lru_name": s["lru_name"], "qty": 1,
                             "destination": d["base"], "deadline_hours": sp["deadline_hours"],
                             "priority": "P1" if d["action"] in ("PULL_FROM_LINE", "EXPEDITE_SPARE") else "P2",
                             "source": sp["chosen"]["node"], "mode": sp["chosen"]["mode"], "eta_hours": sp["chosen"]["eta_hours"],
                             "route_id": sp["chosen"]["route_id"], "verdict": sp["verdict"]})

    write_json(PLAN / "decisions.json", decisions)
    write_json(PLAN / "schedule.json", {"method": plan["method"], "greedy_objective": plan["greedy_objective"],
                                        "cpsat": plan["cpsat"], "violations": violations, "horizon_days": H,
                                        "capacity": {b: c.__dict__ for b, c in cap.items()},
                                        "visits": [v.to_json() for v in plan["visits"]]})
    write_json(PLAN / "spares_requests.json", requests)

    acts = Counter(d["action"] for d in decisions)
    sys_acts = Counter(s["action"] for d in decisions for s in d["systems"])
    scheduled = sum(v.start is not None for v in plan["visits"])
    late = sum(1 for v in plan["visits"] if v.start is not None and v.start + v.duration > max(v.due, v.release + v.duration))
    lines = ["# Plan at D+0  `SIMULATED`", "", "_Generated by `python -m pratirakshak.decide`._", "",
             "| Aircraft action | Count |", "|---|---|", *[f"| {k} | {v} |" for k, v in acts.most_common()], "",
             f"System-level actions: {dict(sys_acts)}", "",
             f"Scheduler: **{plan['method']}** · visits {len(plan['visits'])} (scheduled {scheduled}, late {late}) · "
             f"greedy objective {plan['greedy_objective']} · CP-SAT {plan['cpsat']}", "",
             f"Limit check (bays, tech-hours, readiness floor per base-day): {'no violations' if not violations else violations}", ""]
    write_text(REPORTS_DIR / "plan_d0.md", "\n".join(lines) + "\n")
    print("\n".join(lines[4:]))
    for d in decisions:
        if d["action"] in ("PULL_FROM_LINE", "EXPEDITE_SPARE", "VERIFY_SENSOR"):
            print(f"  {d['tail']} {d['action']:15} {d['reason'][:190]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
