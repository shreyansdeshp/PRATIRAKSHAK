"""Hangar scheduling under constraints (SPEC §9.5, P5): CP-SAT with a greedy fallback.

A *visit* = one aircraft's bundled tasks (due within the bundling tolerance). Each visit occupies one hangar bay for
`duration` days and consumes technician-hours evenly over them. Constraints per base and day: bays ≤ hangar_bays,
tech-hours ≤ tech_hours_per_day, and per type the aircraft in the hangar ≤ the readiness-floor allowance.
Objective: Σ risk_weight·start + lateness_weight·Σ lateness (lateness = end beyond the lower-bound RUL day).
The solver uses a *deterministic* time limit so results reproduce across machines.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from ortools.sat.python import cp_model

from pratirakshak.decide.combine import bundle
from pratirakshak.io import load_config
from pratirakshak.settings import SEED

SCALE = 10  # tech-hours in tenths for integer CP-SAT


@dataclass
class Task:
    tail: str
    base: str
    type: str
    system: str
    lru: str
    hours: float            # technician-hours
    release: int            # earliest day work can start (spare arrival)
    due: int                # lower-bound RUL day (start must finish by then)
    weight: float           # risk weight (≈ P(fail) × 100 + 1)
    pulled: bool = False


@dataclass
class Visit:
    id: str
    tail: str
    base: str
    type: str
    tasks: list[Task]
    hours: float
    duration: int
    release: int
    due: int
    weight: float
    pulled: bool
    start: int | None = None
    bay: int | None = None

    def to_json(self) -> dict[str, Any]:
        return {"id": self.id, "tail": self.tail, "base": self.base, "type": self.type, "start": self.start,
                "end": None if self.start is None else self.start + self.duration, "duration": self.duration,
                "bay": self.bay, "hours": round(self.hours, 1), "release": self.release, "due": self.due,
                "weight": round(self.weight, 2), "pulled": self.pulled,
                "tasks": [{"system": t.system, "lru": t.lru, "hours": round(t.hours, 1), "due": t.due} for t in self.tasks]}


@dataclass
class BaseCapacity:
    bays: int
    tech_hours: float
    type_allowance: dict[str, int] = field(default_factory=dict)


def make_visits(tasks: list[Task], tolerance: int, setup_hours: float, crew_hours_per_day: float) -> list[Visit]:
    by_tail: dict[str, list[Task]] = {}
    for t in tasks:
        by_tail.setdefault(t.tail, []).append(t)
    visits = []
    for tail in sorted(by_tail):
        ts = by_tail[tail]
        groups = bundle({f"{i}": t.due for i, t in enumerate(ts)}, tolerance)
        for gi, g in enumerate(groups):
            members = [ts[int(i)] for i in g]
            hours = setup_hours + sum(t.hours for t in members)
            visits.append(Visit(f"{tail}#{gi}", tail, members[0].base, members[0].type, members, hours,
                                max(1, math.ceil(hours / crew_hours_per_day)), max(t.release for t in members),
                                min(t.due for t in members), sum(t.weight for t in members), any(t.pulled for t in members)))
    return visits


def objective(visits: list[Visit], horizon: int, risk_w: float, late_w: float) -> float:
    tot = 0.0
    for v in visits:
        if v.start is None:
            tot += late_w * horizon * 2 + risk_w * v.weight * horizon
            continue
        tot += risk_w * v.weight * v.start + late_w * max(0, v.start + v.duration - max(v.due, v.release + v.duration))
    return tot


def _fits(v: Visit, s: int, usage: dict[tuple[str, int], list[float]], cap: dict[str, BaseCapacity],
          type_use: dict[tuple[str, str, int], int]) -> bool:
    c = cap[v.base]
    for d in range(s, s + v.duration):
        bays, hrs = usage.get((v.base, d), [0, 0.0])
        if bays + 1 > c.bays or hrs + v.hours / v.duration > c.tech_hours + 1e-9:
            return False
        if type_use.get((v.base, v.type, d), 0) + 1 > max(c.type_allowance.get(v.type, 99), 0):
            return False
    return True


def greedy(visits: list[Visit], cap: dict[str, BaseCapacity], horizon: int) -> list[Visit]:
    """Earliest-due-first, then heaviest risk; earliest feasible start."""
    usage: dict[tuple[str, int], list[float]] = {}
    type_use: dict[tuple[str, str, int], int] = {}
    tail_days: set[tuple[str, int]] = set()   # one aircraft cannot be in two bays at once
    for v in sorted(visits, key=lambda v: (v.due, -v.weight, v.id)):
        v.start = None
        for s in range(v.release, horizon - v.duration + 1):
            if any((v.tail, d) in tail_days for d in range(s, s + v.duration)):
                continue
            if _fits(v, s, usage, cap, type_use):
                v.start = s
                tail_days.update((v.tail, d) for d in range(s, s + v.duration))
                for d in range(s, s + v.duration):
                    u = usage.setdefault((v.base, d), [0, 0.0])
                    u[0] += 1
                    u[1] += v.hours / v.duration
                    type_use[(v.base, v.type, d)] = type_use.get((v.base, v.type, d), 0) + 1
                break
    return visits


def cpsat(visits: list[Visit], cap: dict[str, BaseCapacity], horizon: int, risk_w: float, late_w: float,
          det_time: float) -> tuple[list[Visit], dict[str, Any]]:
    m = cp_model.CpModel()
    starts, ends, presents, intervals = {}, {}, {}, {}
    late = {}
    for v in visits:
        lo, hi = v.release, horizon - v.duration
        pres = m.NewBoolVar(f"p_{v.id}")
        if lo > hi:
            m.Add(pres == 0)
            lo = hi = max(0, hi)
        s = m.NewIntVar(lo, max(lo, hi), f"s_{v.id}")
        e = m.NewIntVar(lo + v.duration, max(lo, hi) + v.duration, f"e_{v.id}")
        iv = m.NewOptionalIntervalVar(s, v.duration, e, pres, f"i_{v.id}")
        lt = m.NewIntVar(0, horizon * 2, f"l_{v.id}")
        m.Add(lt >= e - max(v.due, v.release + v.duration)).OnlyEnforceIf(pres)
        starts[v.id], ends[v.id], presents[v.id], intervals[v.id], late[v.id] = s, e, pres, iv, lt
    for b, c in cap.items():
        vb = [v for v in visits if v.base == b]
        if not vb:
            continue
        m.AddCumulative([intervals[v.id] for v in vb], [1] * len(vb), c.bays)
        m.AddCumulative([intervals[v.id] for v in vb], [int(math.ceil(v.hours / v.duration * SCALE)) for v in vb],
                        int(c.tech_hours * SCALE))
        for ty, allow in c.type_allowance.items():
            vt = [v for v in vb if v.type == ty]
            if vt:
                m.AddCumulative([intervals[v.id] for v in vt], [1] * len(vt), max(allow, 0))
    by_tail: dict[str, list[Visit]] = {}
    for v in visits:
        by_tail.setdefault(v.tail, []).append(v)
    for vs in by_tail.values():
        if len(vs) > 1:   # the same aircraft cannot occupy two bays on overlapping days
            m.AddNoOverlap([intervals[v.id] for v in vs])
    unsched = late_w * horizon * 2
    m.Minimize(sum(int(risk_w * v.weight) * starts[v.id] + int(late_w) * late[v.id]
                   + int(unsched + risk_w * v.weight * horizon) * (1 - presents[v.id]) for v in visits))
    solver = cp_model.CpSolver()
    solver.parameters.max_deterministic_time = det_time
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = SEED % 2**31
    status = solver.Solve(m)
    stats = {"status": solver.StatusName(status), "wall_seconds": round(solver.WallTime(), 3),
             "deterministic_time": round(solver.ResponseProto().deterministic_time, 3)}
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for v in visits:
            v.start = int(solver.Value(starts[v.id])) if solver.Value(presents[v.id]) else None
        stats["best_bound"] = solver.BestObjectiveBound()
    return visits, stats


def assign_bays(visits: list[Visit]) -> None:
    """Interval colouring per base so the Gantt can draw one lane per bay."""
    for b in sorted({v.base for v in visits}):
        free_at: list[int] = []
        for v in sorted((v for v in visits if v.base == b and v.start is not None), key=lambda v: (v.start, v.id)):
            for i, f in enumerate(free_at):
                if f <= v.start:  # type: ignore[operator]
                    v.bay, free_at[i] = i, v.start + v.duration  # type: ignore[operator]
                    break
            else:
                v.bay = len(free_at)
                free_at.append(v.start + v.duration)  # type: ignore[operator]


def schedule(tasks: list[Task], cap: dict[str, BaseCapacity], policies: dict[str, Any] | None = None,
             costs: dict[str, Any] | None = None, use_cpsat: bool = True) -> dict[str, Any]:
    pol = policies or load_config("policies")
    cst = costs or load_config("costs")
    sc = pol["scheduler"]
    H = sc["horizon_days"]
    visits = make_visits(tasks, pol["bundle_tolerance_days"], cst["planned"]["setup_hours"], pol["crew_hours_per_bay_day"])
    g = greedy([Visit(**{**v.__dict__}) for v in visits], cap, H)
    g_obj = objective(g, H, sc["risk_weight"], sc["lateness_weight"])
    result = {"visits": g, "method": "greedy", "greedy_objective": round(g_obj, 1), "cpsat": None}
    if use_cpsat and visits:
        c, stats = cpsat([Visit(**{**v.__dict__}) for v in visits], cap, H, sc["risk_weight"], sc["lateness_weight"],
                         sc["max_deterministic_time"])
        if stats["status"] in ("OPTIMAL", "FEASIBLE"):
            c_obj = objective(c, H, sc["risk_weight"], sc["lateness_weight"])
            stats.update(objective=round(c_obj, 1),
                         improvement_vs_greedy=round((g_obj - c_obj) / g_obj, 4) if g_obj else 0.0)
            if c_obj <= g_obj:
                result.update(visits=c, method="cp-sat")
        result["cpsat"] = stats
    assign_bays(result["visits"])
    return result


def check_limits(visits: list[Visit], cap: dict[str, BaseCapacity]) -> list[str]:
    """Return violations (empty = every base-day within bay, tech-hour and readiness-floor limits)."""
    use: dict[tuple[str, int], list[float]] = {}
    tuse: dict[tuple[str, str, int], int] = {}
    for v in visits:
        if v.start is None:
            continue
        for d in range(v.start, v.start + v.duration):
            u = use.setdefault((v.base, d), [0, 0.0])
            u[0] += 1
            u[1] += v.hours / v.duration
            tuse[(v.base, v.type, d)] = tuse.get((v.base, v.type, d), 0) + 1
    bad = [f"{b} day {d}: {u[0]} bays > {cap[b].bays}" for (b, d), u in use.items() if u[0] > cap[b].bays]
    bad += [f"{b} day {d}: {u[1]:.1f} tech-h > {cap[b].tech_hours}" for (b, d), u in use.items() if u[1] > cap[b].tech_hours + 0.1]
    bad += [f"{b} {t} day {d}: {n} in hangar > allowance" for (b, t, d), n in tuse.items()
            if n > cap[b].type_allowance.get(t, 99)]
    return bad
