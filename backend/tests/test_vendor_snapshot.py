"""Vendor role must not leak tail-level data (SPEC U8, §11.10, Stage 8 check)."""

import json
import re

import pytest

from pratirakshak.settings import FRONTEND_DATA_DIR

VENDOR = FRONTEND_DATA_DIR / "vendor.json"
TAIL = re.compile(r"PR-[GPVS]\d{3}")
FORBIDDEN_KEYS = {"tail", "status", "health", "weighted_health", "body_health", "p_fail", "rul_days", "readiness",
                  "limiting_system", "risk_window", "drivers", "systems"}


def _keys(obj: object) -> set[str]:
    if isinstance(obj, dict):
        return set(obj) | {k for v in obj.values() for k in _keys(v)}
    if isinstance(obj, list):
        return {k for v in obj for k in _keys(v)}
    return set()


@pytest.mark.skipif(not VENDOR.exists(), reason="run `python -m pratirakshak.export` first")
def test_vendor_snapshot_has_no_tail_level_data() -> None:
    text = VENDOR.read_text(encoding="utf-8")
    data = json.loads(text)
    assert data["role"] == "vendor" and data["demands"], "vendor snapshot should list demands"
    assert not TAIL.search(text), "a tail number leaked into the vendor snapshot"
    assert not (_keys(data) & FORBIDDEN_KEYS), f"forbidden keys: {_keys(data) & FORBIDDEN_KEYS}"
    for d in data["demands"]:
        assert set(d) >= {"demand_id", "lru", "qty", "priority", "destination", "deliver_by"}
