"""Split-conformal intervals (SPEC §6.4) and the failure-probability head P(RUL ≤ H).

- CQR (conformalised quantile regression) for quantile models: per nominal level L, the scores
  max(q_lo − y, y − q_hi) on calibration windows give a margin added to both sides.
- Absolute-residual conformal for point models (LightGBM / Ridge).
Both give finite-sample marginal coverage ≥ L under exchangeability of calibration and test windows.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.stats import norm

Z90 = norm.ppf(0.9)  # 1.2816


def _qhat(scores: np.ndarray, level: float) -> float:
    n = len(scores)
    k = min(math.ceil((n + 1) * level), n)
    return float(np.sort(scores)[k - 1])


def cqr_margins(q_pred: np.ndarray, quantiles: list[float], y: np.ndarray, levels: list[float]) -> dict[str, float]:
    """q_pred: (N, Q) raw quantile predictions on calibration windows."""
    out = {}
    for lv in levels:
        lo, hi = quantiles.index(round((1 - lv) / 2, 2)), quantiles.index(round((1 + lv) / 2, 2))
        s = np.maximum(q_pred[:, lo] - y, y - q_pred[:, hi])
        out[f"{lv:.1f}"] = _qhat(s, lv)
    return out


def abs_margins(point: np.ndarray, y: np.ndarray, levels: list[float]) -> dict[str, float]:
    s = np.abs(y - point)
    return {f"{lv:.1f}": _qhat(s, lv) for lv in levels}


def calibrated_quantiles(q_pred: np.ndarray | None, point: np.ndarray | None, quantiles: list[float],
                         margins: dict[str, float]) -> np.ndarray:
    """Return conformalised quantiles (N, Q) on the same grid; median = model median (or point)."""
    n = len(q_pred) if q_pred is not None else len(point)  # type: ignore[arg-type]
    out = np.zeros((n, len(quantiles)), dtype=float)
    mid = quantiles.index(0.5)
    out[:, mid] = q_pred[:, mid] if q_pred is not None else point  # type: ignore[index]
    for key, m in margins.items():
        lv = float(key)
        lo, hi = quantiles.index(round((1 - lv) / 2, 2)), quantiles.index(round((1 + lv) / 2, 2))
        if q_pred is not None:
            out[:, lo], out[:, hi] = q_pred[:, lo] - m, q_pred[:, hi] + m
        else:
            out[:, lo], out[:, hi] = point - m, point + m  # type: ignore[operator]
    out = np.sort(out, axis=1)  # enforce monotone quantiles
    return np.clip(out, 0, None)


def p_fail_within(qv: np.ndarray, quantiles: list[float], horizon: float | np.ndarray) -> np.ndarray:
    """P(RUL ≤ H) from a quantile set: linear CDF interpolation inside [q05, q95], split-normal tails outside."""
    qs = np.asarray(quantiles)
    h = np.broadcast_to(np.asarray(horizon, dtype=float), (len(qv),))
    i10, i50, i90 = list(quantiles).index(0.1), list(quantiles).index(0.5), list(quantiles).index(0.9)
    s_lo = np.maximum((qv[:, i50] - qv[:, i10]) / Z90, 1e-3)
    s_hi = np.maximum((qv[:, i90] - qv[:, i50]) / Z90, 1e-3)
    out = np.empty(len(qv))
    for n in range(len(qv)):
        row = qv[n]
        if h[n] < row[0]:
            out[n] = norm.cdf((h[n] - row[i50]) / s_lo[n])
            out[n] = min(out[n], qs[0])
        elif h[n] > row[-1]:
            out[n] = max(norm.cdf((h[n] - row[i50]) / s_hi[n]), qs[-1])
        else:
            out[n] = float(np.interp(h[n], row, qs))
    return np.clip(out, 0, 1)


def picp_mpiw(qv: np.ndarray, quantiles: list[float], y: np.ndarray, level: float) -> tuple[float, float]:
    lo, hi = quantiles.index(round((1 - level) / 2, 2)), quantiles.index(round((1 + level) / 2, 2))
    inside = (y >= qv[:, lo]) & (y <= qv[:, hi])
    return float(inside.mean()), float((qv[:, hi] - qv[:, lo]).mean())
