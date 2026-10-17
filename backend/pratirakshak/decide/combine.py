"""Combine per-system estimates into an aircraft view (SPEC §7.6).

- Aircraft failure risk in the window: R = 1 − Π(1 − p_i). Assumes the systems fail independently *given the
  shared drivers*; couplings are modelled upstream in the generator and in the features (stated on the Method page).
- Readiness gating: READY only if no mission-critical system reaches its risk limit; the limiting system is named,
  so the average health bar can never hide a single no-go.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import numpy as np

READY, WATCH, PULL = "READY", "WATCH", "PULL"
GLYPH = {READY: "●", WATCH: "▲", PULL: "■"}


def aircraft_risk(p: Iterable[float]) -> float:
    """R = 1 − Π(1 − p_i)."""
    arr = np.clip(np.asarray(list(p), dtype=float), 0.0, 1.0)
    return float(1.0 - np.prod(1.0 - arr))


def health_from_rul(rul_p50: float, ref: float) -> float:
    """Monotone 0–100 health from the median RUL (100 = at least `ref` of life left)."""
    return float(100.0 * np.clip(rul_p50 / ref, 0.0, 1.0))


def weighted_health(health: Mapping[str, float], weights: Mapping[str, float]) -> float:
    tot = sum(weights[s] for s in health)
    return float(sum(health[s] * weights[s] for s in health) / tot)


def critical_systems(mission_critical: Mapping[str, bool | str], role_critical: Iterable[str]) -> set[str]:
    """Systems flagged `true`, plus `role` systems the aircraft type lists as critical for its role."""
    role = set(role_critical)
    return {s for s, f in mission_critical.items() if f is True or (f == "role" and s in role)}


@dataclass(frozen=True)
class Gate:
    status: str
    limiting_system: str
    limiting_p: float
    risk: float


def gate(p: Mapping[str, float], critical: set[str], watch: float, pull: float,
         failed: Iterable[str] = ()) -> Gate:
    """READY / WATCH / PULL with the limiting system (highest risk among critical systems, else overall)."""
    failed = set(failed)
    pool = {s: v for s, v in p.items() if s in critical} or dict(p)
    lim = max(sorted(pool), key=lambda s: (1.0 if s in failed else pool[s]))
    lim_p = 1.0 if lim in failed else pool[lim]
    if failed & critical or lim_p >= pull:
        status = PULL
    elif lim_p >= watch or any(v >= pull for s, v in p.items() if s not in critical):
        status = WATCH  # a non-critical system at its limit degrades capability but does not ground the aircraft
    else:
        status = READY
    return Gate(status, lim, float(lim_p), aircraft_risk(1.0 if s in failed else v for s, v in p.items()))


def bundle(due_days: Mapping[str, float], tolerance_days: float) -> list[list[str]]:
    """Group tasks whose due days fall within `tolerance_days` of the group's earliest task (one hangar visit)."""
    groups: list[list[str]] = []
    start = None
    for task, due in sorted(due_days.items(), key=lambda kv: (kv[1], kv[0])):
        if start is None or due - start > tolerance_days:
            groups.append([task])
            start = due
        else:
            groups[-1].append(task)
    return groups
