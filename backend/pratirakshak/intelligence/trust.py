"""Sensor trust scoring (SPEC §8.2, U6).

Expected relations are learned on fault-free data: each sensor is regressed on its siblings (same system / same
engine) plus context. Trust 0–100 per sensor over a recent window combines:
  stuck-at run · flat-line (variance collapse) · dropout rate · out-of-range · spike · sibling-residual drift.
Fault vs degradation: real degradation moves the siblings consistently, so the sibling residual stays small;
a sensor fault breaks the relation. Single-fault assumption per group: only the sensor with the largest residual
in its group takes the residual penalty (the others are its witnesses, not suspects).
All thresholds are data-driven (noise, valid range, natural repeat runs) or in config/intelligence.yaml.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from pratirakshak.io import load_config


@dataclass
class GroupRelation:
    """Relation model + per-sensor meta for one sensor group (a system's analog sensors, or one engine's inputs)."""

    names: list[str]
    coef: list[np.ndarray]      # per sensor: coefficients over [siblings, siblings², ctx, 1]
    sigma: np.ndarray           # residual std per sensor
    noise: np.ndarray           # local noise (first-difference std / √2)
    lo: np.ndarray
    hi: np.ndarray
    stuck_run: np.ndarray       # identical-run length that counts as stuck (≥ config, ≥ natural p99.9 + 1)

    @staticmethod
    def _design(x: np.ndarray, k: int, ctx: np.ndarray | None) -> np.ndarray:
        sib = np.delete(x, k, axis=-1)
        parts = [sib, sib**2]
        if ctx is not None:
            parts.append(ctx)
        parts.append(np.ones(x.shape[:-1] + (1,)))
        return np.concatenate(parts, axis=-1)

    @classmethod
    def fit(cls, names: list[str], clean: np.ndarray, ctx: np.ndarray | None, series: np.ndarray, min_stuck: int,
            slack_noise: float = 4.0) -> GroupRelation:
        """clean: (R, M) fault-free rows; series: (U, T, M) fault-free sequences (for noise & natural repeat runs)."""
        scale = clean.std(0) + 1e-9
        mu = clean.mean(0)
        z = (clean - mu) / scale
        coef, sigma = [], []
        for k in range(len(names)):
            A = cls._design(z, k, ctx)
            c, *_ = np.linalg.lstsq(A, z[:, k], rcond=None)
            coef.append(c)
            sigma.append(float((z[:, k] - A @ c).std()) * scale[k])
        diffs = np.diff(series, axis=1).reshape(-1, len(names))
        # robust (MAD) noise: renewal/service steps must not inflate it
        mad = np.nanmedian(np.abs(diffs - np.nanmedian(diffs, axis=0)), axis=0)
        noise = 1.4826 * mad / np.sqrt(2) + 1e-9
        lo = np.nanquantile(clean, 0.0005, axis=0) - slack_noise * noise
        hi = np.nanquantile(clean, 0.9995, axis=0) + slack_noise * noise
        runs = np.array([np.nanquantile(max_identical_run(series[:, :, k]), 0.999) for k in range(len(names))])
        rel = cls(names, coef, np.array(sigma), noise, lo, hi, np.maximum(min_stuck, runs + 1).astype(int))
        rel._mu, rel._scale = mu, scale  # type: ignore[attr-defined]
        return rel

    def predict(self, x: np.ndarray, k: int, ctx: np.ndarray | None) -> np.ndarray:
        z = (x - self._mu) / self._scale  # type: ignore[attr-defined]
        return (self._design(z, k, ctx) @ self.coef[k]) * self._scale[k] + self._mu[k]  # type: ignore[attr-defined]

    def to_json(self) -> dict[str, Any]:
        return {"sensors": self.names, "sigma": self.sigma.round(6).tolist(), "noise": self.noise.round(6).tolist(),
                "lo": self.lo.round(4).tolist(), "hi": self.hi.round(4).tolist(), "stuck_run": self.stuck_run.tolist()}


def max_identical_run(x: np.ndarray) -> np.ndarray:
    """Longest run of identical consecutive non-NaN values along the last axis (x: (..., T))."""
    eq = (x[..., 1:] == x[..., :-1])
    run = np.zeros(x.shape[:-1])
    best = np.zeros(x.shape[:-1])
    for t in range(eq.shape[-1]):
        run = np.where(eq[..., t], run + 1, 0)
        best = np.maximum(best, run)
    return best + 1


def score(rel: GroupRelation, win: np.ndarray, ctx: np.ndarray | None, cfg: dict[str, Any] | None = None) -> dict[str, np.ndarray]:
    """win: (N, W, M) recent readings (NaN = dropout); ctx: (N, W, C) or None. Returns trust (N, M) + components."""
    cfg = cfg or load_config("intelligence")["trust"]
    pen = cfg["penalties"]
    N, W, M = win.shape
    valid = ~np.isnan(win)
    dropout = 1 - valid.mean(1)
    with np.errstate(all="ignore"):
        med = np.nanmedian(np.where(valid.any(1, keepdims=True), win, 0.0), axis=1)
    filled = np.where(valid, win, med[:, None, :])
    stuck = max_identical_run(np.moveaxis(win, 1, -1)) >= rel.stuck_run[None, :]
    std = np.where(valid.sum(1) >= 3, np.nanstd(np.where(valid, win, np.nan), axis=1), np.inf)
    flat = (std < cfg["variance_collapse_frac"] * rel.noise[None, :]) & ~stuck
    oor = ((filled < rel.lo) | (filled > rel.hi)).any(1)
    # spike = an isolated one-step excursion: far from both neighbours, which agree with each other, and not shared
    # by sibling sensors on the same step (a shared jump is a real state change, e.g. a service)
    nz = rel.noise[None, None, :]
    d_prev = np.abs(filled[:, 1:-1] - filled[:, :-2]) / nz
    d_next = np.abs(filled[:, 1:-1] - filled[:, 2:]) / nz
    d_nb = np.abs(filled[:, 2:] - filled[:, :-2]) / nz
    pt = (d_prev > cfg["spike_z"]) & (d_next > cfg["spike_z"]) & (d_nb < cfg["spike_z"] / 2)
    shared = pt.sum(2, keepdims=True) >= 2
    spike = (pt & ~shared).any(1)

    n_last = min(5, W)
    rz = np.zeros((N, M))
    for k in range(M):
        pred = rel.predict(filled, k, ctx)
        r = (filled[:, :, k] - pred)[:, -n_last:]
        v = valid[:, -n_last:, k]
        n_ok = np.maximum(v.sum(1), 1)
        rz[:, k] = np.where(v.any(1), np.where(v, r, 0).sum(1) / n_ok / (rel.sigma[k] / np.sqrt(n_ok)), 0.0)
    absz = np.abs(rz)
    suspect = absz == absz.max(1, keepdims=True)
    over = np.clip((absz - cfg["residual_z_warn"]) / 6.0, 0, 1) * suspect

    trust = 100 * (1 - pen["stuck"] * stuck) * (1 - pen["flat"] * flat) * (1 - dropout) \
        * (1 - pen["out_of_range"] * oor) * (1 - pen["spike"] * spike) * (1 - pen["residual_max"] * over)
    return {"trust": np.round(trust, 2), "stuck": stuck, "flat": flat, "dropout": dropout, "out_of_range": oor,
            "spike": spike, "residual_z": rz}


def reasons(comp: dict[str, np.ndarray], i: int, k: int, warn: float) -> list[str]:
    out = []
    if comp["stuck"][i, k]:
        out.append("reading frozen (identical values)")
    if comp["flat"][i, k]:
        out.append("variance collapsed (flat-lined)")
    if comp["dropout"][i, k] > 0:
        out.append(f"{comp['dropout'][i, k]:.0%} of readings missing")
    if comp["out_of_range"][i, k]:
        out.append("outside physical range")
    if comp["spike"][i, k]:
        out.append("isolated spike")
    if abs(comp["residual_z"][i, k]) > warn:
        out.append(f"inconsistent with redundant/sibling sensors (z = {comp['residual_z'][i, k]:+.1f})")
    return out
