"""The aircraft-level risk formula and readiness gating (SPEC §7.6) — silent errors here corrupt every decision."""

import math

import pytest

from pratirakshak.decide.combine import PULL, READY, WATCH, aircraft_risk, bundle, critical_systems, gate


def test_risk_formula() -> None:
    assert aircraft_risk([]) == 0.0
    assert aircraft_risk([0.0, 0.0]) == 0.0
    assert aircraft_risk([1.0, 0.0]) == 1.0
    assert math.isclose(aircraft_risk([0.1, 0.2]), 1 - 0.9 * 0.8)
    assert math.isclose(aircraft_risk([0.05] * 8), 1 - 0.95**8)
    # never below the largest single risk, never above the sum
    p = [0.03, 0.12, 0.07]
    assert max(p) <= aircraft_risk(p) <= sum(p)


@pytest.mark.parametrize(
    ("p", "status", "limiting"),
    [
        ({"engines": 0.02, "hydraulics": 0.05}, READY, "hydraulics"),
        ({"engines": 0.02, "hydraulics": 0.15}, WATCH, "hydraulics"),
        ({"engines": 0.45, "hydraulics": 0.15}, PULL, "engines"),
        ({"engines": 0.02, "avionics": 0.60}, WATCH, "engines"),  # avionics not role-critical: degrade, don't ground
    ],
)
def test_gating(p: dict[str, float], status: str, limiting: str) -> None:
    crit = critical_systems({"engines": True, "hydraulics": True, "avionics": "role"}, role_critical=[])
    g = gate(p, crit, watch=0.10, pull=0.30)
    assert (g.status, g.limiting_system) == (status, limiting)


def test_failed_critical_system_pulls_and_role_critical_counts() -> None:
    crit = critical_systems({"engines": True, "avionics": "role"}, role_critical=["avionics"])
    assert crit == {"engines", "avionics"}
    g = gate({"engines": 0.01, "avionics": 0.01}, crit, 0.1, 0.3, failed=["avionics"])
    assert g.status == PULL and g.limiting_system == "avionics" and g.risk == 1.0


def test_bundle_groups_within_tolerance() -> None:
    assert bundle({"a": 3, "b": 5, "c": 20, "d": 9}, tolerance_days=7) == [["a", "b", "d"], ["c"]]
