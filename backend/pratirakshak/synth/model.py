"""Synthetic non-engine systems: forward model (SPEC §7.3). SIMULATED; hydraulics sensors REAL-ANCHORED.

State per unit: damage d_s ∈ [0, ∞) for each of the 7 systems (failure at d ≥ 1) + sensor-fault state.
Daily step: gamma-process damage increments whose mean = (1/life) · acceleration(d) · couplings(drivers).
Observation: healthy + effect · d^power + environment terms + noise, then injected sensor faults.
The same model drives training data (here), the fleet simulation (Stage 7) and the twin (Stage 8).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from pratirakshak.io import load_config
from pratirakshak.synth.anchor_hydraulic import apply_anchor, load_anchor

SYSTEMS = ["hydraulics", "landing_gear", "flight_controls", "electrical", "avionics", "fuel", "structure"]
STRESSES = ["heat", "cold", "humidity", "wet", "dust", "salinity", "altitude"]
FAULT_TYPES = ["none", "stuck", "drift", "dropout", "spike"]


@dataclass
class Drivers:
    """One day of shared drivers for N units (all arrays shape (N,))."""

    sorties: np.ndarray
    nominal_sorties: np.ndarray
    intensity: np.ndarray
    stress: dict[str, np.ndarray]
    engine_d: np.ndarray
    hard_landings: np.ndarray | None = None


@dataclass
class FaultState:
    code: np.ndarray        # (N, M) int8 index into FAULT_TYPES
    days_left: np.ndarray   # (N, M)
    stuck_value: np.ndarray
    offset: np.ndarray      # accumulated drift / spike offset
    sign: np.ndarray
    applied: np.ndarray     # (N, M) fault code that affected the latest observation

    @classmethod
    def empty(cls, n: int, m: int) -> FaultState:
        z = np.zeros((n, m))
        return cls(np.zeros((n, m), dtype=np.int8), z.copy(), z.copy(), z.copy(), np.ones((n, m)),
                   np.zeros((n, m), dtype=np.int8))


@dataclass
class SynthModel:
    cfg: dict[str, Any] = field(default_factory=lambda: load_config("systems"))
    coup: dict[str, Any] = field(default_factory=lambda: load_config("couplings"))
    anchor: dict[str, Any] | None = field(default_factory=load_anchor)

    def __post_init__(self) -> None:
        self.spec = {s: self.cfg["systems"][s] for s in SYSTEMS}
        self.sensors: list[dict[str, Any]] = []
        for s in SYSTEMS:
            for sen in self.spec[s]["sensors"]:
                sen = apply_anchor(sen, self.anchor) if s == "hydraulics" else dict(sen)
                sen.setdefault("kind", "analog")
                sen["system"] = s
                self.sensors.append(sen)
        self.sensor_ids = [x["id"] for x in self.sensors]
        self.sensor_system = np.array([SYSTEMS.index(x["system"]) for x in self.sensors])
        self.analog = np.array([x["kind"] == "analog" for x in self.sensors])
        self.life = np.array([self.spec[s]["life_days"] for s in SYSTEMS], dtype=float)
        self.variability = np.array([self.spec[s]["variability"] for s in SYSTEMS], dtype=float)
        self.inception = np.array([self.spec[s]["inception"] for s in SYSTEMS], dtype=float)
        self.accel = np.array([self.spec[s]["acceleration"] for s in SYSTEMS], dtype=float)
        self.restore = np.array([self.spec[s]["restore"] for s in SYSTEMS], dtype=float)
        self.infant_p = np.array([self.spec[s]["infant_failure_p"] for s in SYSTEMS], dtype=float)

    # ------------------------------------------------------------------------------------- dynamics
    def multiplier(self, d: np.ndarray, dr: Drivers) -> np.ndarray:
        """Daily damage-rate multiplier per unit × system (SPEC §7.3 couplings)."""
        c = self.coup
        n = len(dr.sorties)
        ratio = dr.sorties / c["reference_sorties_per_day"]
        m = np.ones((n, len(SYSTEMS)))
        for j, s in enumerate(SYSTEMS):
            m[:, j] *= np.power(np.maximum(ratio, 0.0), c["usage"].get(s, 1.0))
            m[:, j] *= 1 + c["intensity"].get(s, 0.0) * (dr.intensity - 0.5)
            env = sum(c["environment"].get(e, {}).get(s, 0.0) * dr.stress[e] for e in STRESSES)
            m[:, j] *= 1 + env
            src = 0.0
            for so, targets in c["systems"].items():
                if s in targets:
                    dsrc = dr.engine_d if so == "engines" else d[:, SYSTEMS.index(so)]
                    src = src + targets[s] * np.minimum(dsrc, 1.0)
            m[:, j] *= 1 + src
            if dr.hard_landings is not None:
                m[:, j] *= 1 + c["hard_landings"].get(s, 0.0) * dr.hard_landings
        # idle days still age a little (calendar effects: corrosion, battery, seals)
        return np.maximum(m, 0.15)

    def hard_landings(self, dr: Drivers, rng: np.random.Generator) -> np.ndarray:
        lam = self.coup["hard_landing_rate_per_sortie"] * dr.sorties * (0.5 + dr.intensity)
        return rng.poisson(np.maximum(lam, 0)).astype(float)

    def step(self, d: np.ndarray, dr: Drivers, rng: np.random.Generator) -> np.ndarray:
        if dr.hard_landings is None:
            dr.hard_landings = self.hard_landings(dr, rng)
        over = np.clip((d - self.inception) / (1 - self.inception + 1e-9), 0, None)
        mu = (1.0 / self.life) * (1 + self.accel * over) * self.multiplier(d, dr)
        shape = np.maximum(self.variability * mu, 1e-9)
        return d + rng.gamma(shape, 1.0 / self.variability)

    def service(self, d: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        """Service the systems in `mask` (N, S): remove `restore` fraction of damage; small infant-failure chance."""
        out = np.where(mask, d * (1 - self.restore), d)
        infant = mask & (rng.random(d.shape) < self.infant_p)
        return np.where(infant, np.maximum(out, 0.85), out)

    # ----------------------------------------------------------------------------------- observation
    def observe(self, d: np.ndarray, dr: Drivers, rng: np.random.Generator, fs: FaultState | None) -> np.ndarray:
        n = d.shape[0]
        y = np.zeros((n, len(self.sensors)))
        for k, sen in enumerate(self.sensors):
            dj = np.minimum(d[:, SYSTEMS.index(sen["system"])], 1.2)
            if sen["kind"] == "hard_landings":
                y[:, k] = dr.hard_landings if dr.hard_landings is not None else 0
            elif sen["kind"] == "bit_faults":
                y[:, k] = rng.poisson(0.05 + 3.0 * dj**3)
            elif sen["kind"] == "crack_flag":
                y[:, k] = (rng.random(n) < 0.3 * np.clip((dj - 0.75) * 3, 0, 1)).astype(float)
            else:
                env = sum(coef * dr.stress[e] for e, coef in sen.get("env", {}).items())
                y[:, k] = sen["healthy"] + sen["effect"] * np.power(dj, sen["power"]) + env + sen["noise"] * rng.standard_normal(n)
        if fs is not None:
            y = self._apply_faults(y, fs, rng)
        return y

    def _apply_faults(self, y: np.ndarray, fs: FaultState, rng: np.random.Generator) -> np.ndarray:
        fc = self.cfg["sensor_faults"]
        n, m = y.shape
        scale = np.array([abs(s.get("effect", 1.0)) or 1.0 for s in self.sensors])[None, :]
        # onset
        onset = (fs.code == 0) & (rng.random((n, m)) < fc["hazard_per_sensor_day"]) & self.analog[None, :]
        if onset.any():
            types = list(fc["types"])
            p = np.array([fc["types"][t] for t in types], dtype=float)
            pick = rng.choice(len(types), size=(n, m), p=p / p.sum())
            codes = np.array([FAULT_TYPES.index(t) for t in types])[pick]
            fs.code = np.where(onset, codes, fs.code).astype(np.int8)
            dur = rng.geometric(1 / fc["mean_duration_days"], size=(n, m)).astype(float)
            fs.days_left = np.where(onset, np.where(codes == FAULT_TYPES.index("spike"), 1, dur), fs.days_left)
            fs.stuck_value = np.where(onset, y, fs.stuck_value)
            fs.offset = np.where(onset, 0.0, fs.offset)
            fs.sign = np.where(onset, rng.choice([-1.0, 1.0], size=(n, m)), fs.sign)
        # apply
        stuck, drift = fs.code == 1, fs.code == 2
        dropout, spike = fs.code == 3, fs.code == 4
        fs.offset = np.where(drift, fs.offset + fc["drift_per_day_frac_of_effect"] * scale * fs.sign, fs.offset)
        fs.offset = np.where(spike, fc["spike_magnitude_frac_of_effect"] * scale * fs.sign, fs.offset)
        out = np.where(stuck, fs.stuck_value, y)
        out = np.where(drift | spike, y + fs.offset, out)
        out = np.where(dropout, np.nan, out)
        fs.applied = fs.code.copy()  # ground truth for TODAY's reading (recorded before the tick clears it)
        # tick
        active = fs.code > 0
        fs.days_left = np.where(active, fs.days_left - 1, fs.days_left)
        ended = active & (fs.days_left <= 0)
        fs.code = np.where(ended, 0, fs.code).astype(np.int8)
        fs.offset = np.where(ended, 0.0, fs.offset)
        return out


def stress_from_normals(normals_by_base: dict[str, Any], base: str, doy_index: np.ndarray) -> dict[str, np.ndarray]:
    """Stress arrays for day-of-year indices (0..364) at a base, from precomputed per-base stress tables."""
    tab = normals_by_base[base]
    return {e: tab[e][doy_index % 365] for e in STRESSES}
