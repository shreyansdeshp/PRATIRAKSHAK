"""The hangar plan never exceeds bay, technician-hour or readiness-floor limits (SPEC §14 Stage 6)."""

import numpy as np
import pytest

from pratirakshak.plan.scheduler import BaseCapacity, Task, check_limits, schedule

POL = {"bundle_tolerance_days": 7, "crew_hours_per_bay_day": 16,
       "scheduler": {"horizon_days": 30, "max_deterministic_time": 2.0, "lateness_weight": 1000, "risk_weight": 100}}
COSTS = {"planned": {"setup_hours": 4}}


def _tasks(seed: int) -> list[Task]:
    rng = np.random.default_rng(seed)
    out = []
    for i in range(40):  # deliberately more work than capacity
        base = ["A", "B"][i % 2]
        out.append(Task(f"T{i % 18:02d}", base, ["G", "V"][i % 3 == 0], "sys", "LRU", float(rng.uniform(4, 30)),
                        int(rng.integers(0, 5)), int(rng.integers(0, 25)), float(rng.uniform(1, 80))))
    return out


@pytest.mark.parametrize("use_cpsat", [False, True])
def test_schedule_respects_limits(use_cpsat: bool) -> None:
    cap = {"A": BaseCapacity(2, 40, {"G": 2, "V": 1}), "B": BaseCapacity(1, 24, {"G": 1, "V": 1})}
    plan = schedule(_tasks(26249), cap, POL, COSTS, use_cpsat=use_cpsat)
    assert check_limits(plan["visits"], cap) == []
    assert any(v.start is not None for v in plan["visits"])
    if use_cpsat:
        assert plan["cpsat"]["status"] in ("OPTIMAL", "FEASIBLE")
