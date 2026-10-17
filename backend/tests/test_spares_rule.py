"""SOURCE vs PULL (SPEC §9.4) — the hand-checkable case from SPEC §14 Stage 6 — and seasonal closures."""

from datetime import date

from pratirakshak.decide.spares import Logistics, source_or_pull


def test_source_or_pull_hand_case() -> None:
    # risk deadline (lower-bound RUL) 20 h, fitting takes 5 h
    assert source_or_pull(eta_hours=30, install_hours=5, deadline_hours=20) == "PULL"
    assert source_or_pull(eta_hours=10, install_hours=5, deadline_hours=20) == "SOURCE"
    assert source_or_pull(eta_hours=15, install_hours=5, deadline_hours=20) == "SOURCE"  # exactly on time counts


def _world() -> dict:
    nodes = [{"id": "HIM", "kind": "base", "name": "Himshikhar"}, {"id": "CHE", "kind": "depot", "name": "Chenab"},
             {"id": "SAH", "kind": "base", "name": "Sahyadri"}]
    closure = {"start_mmdd": "11-15", "end_mmdd": "05-15", "reason": "snow"}
    routes = [
        {"id": "road:CHE-HIM", "from_node": "CHE", "to_node": "HIM", "mode": "road", "minutes": 600, "distance_km": 683, "seasonal_closure": closure},
        {"id": "air:CHE-HIM", "from_node": "CHE", "to_node": "HIM", "mode": "air", "minutes": 330, "distance_km": 300},
        {"id": "air:HIM-SAH", "from_node": "HIM", "to_node": "SAH", "mode": "air", "minutes": 500, "distance_km": 1600},
        {"id": "air:CHE-SAH", "from_node": "CHE", "to_node": "SAH", "mode": "air", "minutes": 480, "distance_km": 1500},
        {"id": "road:HIM-SAH", "from_node": "HIM", "to_node": "SAH", "mode": "road", "minutes": 3000, "distance_km": 2100, "seasonal_closure": closure},
        {"id": "road:CHE-SAH", "from_node": "CHE", "to_node": "SAH", "mode": "road", "minutes": 2000, "distance_km": 1700},
    ]
    return {"nodes": nodes, "routes": routes, "stock": [{"node": "CHE", "lru": "X", "qty": 2}]}


def test_winter_closure_forces_airlift_and_no_vahak_means_no_airlift() -> None:
    lg = Logistics(_world(), {"vendor_dispatch_hours": 24})
    summer = lg.sources("X", "HIM", date(2026, 7, 1), vahak_bases={"SAH"})
    assert summer[0].mode == "road" and summer[0].eta_hours < 20
    winter = lg.sources("X", "HIM", date(2027, 1, 10), vahak_bases={"SAH"})
    usable = [s for s in winter if s.eta_hours != float("inf")]
    assert usable and all(s.mode == "air" for s in usable)
    assert usable[0].eta_hours == round((480 + 330) / 60, 1)  # positioning SAH→CHE, then CHE→HIM
    none = lg.sources("X", "HIM", date(2027, 1, 10), vahak_bases=set())
    assert all(s.eta_hours == float("inf") for s in none)
