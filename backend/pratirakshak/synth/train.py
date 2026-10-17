"""Non-engine RUL models (SPEC §7.5): synthetic run-to-failure airframes → per-system LightGBM + conformal.
Validated ONLY against synthetic ground truth (SIMULATED); hydraulics sensor ranges are REAL-ANCHORED."""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from pratirakshak.io import load_config, write_json
from pratirakshak.models import conformal as C
from pratirakshak.settings import MODELS_DIR, PROCESSED_DIR, derive_seed
from pratirakshak.synth.model import STRESSES, SYSTEMS, Drivers, FaultState, SynthModel
from pratirakshak.world import climate

N_AIRFRAMES = 240
SIM_DAYS = 900
SAMPLE_EVERY = 3
QUANTILES = [0.05, 0.10, 0.15, 0.20, 0.25, 0.50, 0.75, 0.80, 0.85, 0.90, 0.95]
LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9]
OUT = MODELS_DIR / "systems"


# ------------------------------------------------------------------------------------------ climate
def base_stress_tables() -> dict[str, dict[str, np.ndarray]]:
    """365-day stress arrays per base from the committed Open-Meteo normals (Stage 2)."""
    world = load_config("world")
    normals = pd.read_parquet(PROCESSED_DIR / "world" / "climate_normals.parquet")
    out = {}
    for b in world["bases"]:
        nb = normals[normals["base"] == b["id"]].set_index("mmdd").sort_index()
        st = climate.stress_indices(nb.drop(columns=["base", "elevation_m"]), float(nb["elevation_m"].iloc[0]),
                                    b["dust_index"], b["salinity_index"])
        out[b["id"]] = {e: st[e].to_numpy(dtype=float) for e in STRESSES}
    return out


# ------------------------------------------------------------------------------------------ simulation
@dataclass
class SimRecord:
    obs: np.ndarray          # (T, N, M) observed sensors (NaN = dropout)
    fault: np.ndarray        # (T, N, M) int8 fault codes
    d: np.ndarray            # (T, N, S) latent damage after the day's step
    dss: np.ndarray          # (T, N, S) days since last service/renewal
    sorties: np.ndarray      # (T, N)
    nominal: np.ndarray      # (T, N)
    stress: np.ndarray       # (T, N, 7)
    intensity: np.ndarray    # (N,)
    failures: list[tuple[int, int, int]]  # (unit, system, day)


def legacy_intervals(model: SynthModel, type_of: list[str], base_of: list[str], fraction: float) -> np.ndarray:
    """Calendar service interval (days) per unit × system for the fleet's *existing* fixed-interval practice:
    `fraction` × the system's life at that unit's usage (config life is at the reference sortie rate)."""
    world = load_config("world")
    types = {t["id"]: t for t in world["aircraft_types"]}
    tempo = {b["id"]: b["tempo"] for b in world["bases"]}
    ref = model.coup["reference_sorties_per_day"]
    out = np.zeros((len(type_of), len(SYSTEMS)))
    for i, (t, b) in enumerate(zip(type_of, base_of, strict=True)):
        ratio = types[t]["sorties_per_day"] * tempo[b] / ref
        for j, s in enumerate(SYSTEMS):
            out[i, j] = fraction * model.life[j] / max(ratio, 0.1) ** model.coup["usage"].get(s, 1.0)
    return out


def simulate(model: SynthModel, n: int, days: int, seed: int, d0: np.ndarray | None = None,
             base_of: list[str] | None = None, type_of: list[str] | None = None, start_doy: np.ndarray | None = None,
             engine_d0: np.ndarray | None = None, renew: bool = True, service_interval: np.ndarray | None = None,
             dss0: np.ndarray | None = None) -> SimRecord:
    """`service_interval` (N, S): if given, a system is serviced whenever its days-since-service reaches it."""
    world = load_config("world")
    rng = np.random.default_rng(seed)
    tables = base_stress_tables()
    types = {t["id"]: t for t in world["aircraft_types"]}
    tempo = {b["id"]: b["tempo"] for b in world["bases"]}
    base_of = base_of or list(rng.choice(sorted(tables), size=n))
    type_of = type_of or list(rng.choice(sorted(types), size=n))
    start_doy = rng.integers(0, 365, size=n) if start_doy is None else start_doy
    spd = np.array([types[t]["sorties_per_day"] * tempo[b] for t, b in zip(type_of, base_of, strict=True)])
    k = np.array([types[t]["engine_cycle_to_sorties"] for t in type_of])
    inten = np.array([types[t]["intensity"] for t in type_of])
    d = rng.uniform(0, 0.7, size=(n, len(SYSTEMS))) if d0 is None else d0.copy()
    eng = rng.uniform(0, 0.7, size=n) if engine_d0 is None else engine_d0.copy()
    fs = FaultState.empty(n, len(model.sensors))
    dss = np.zeros((n, len(SYSTEMS))) if dss0 is None else dss0.astype(float).copy()
    weekend = world["missions"]["weekend_factor"]

    S, M = len(SYSTEMS), len(model.sensors)
    rec = SimRecord(np.zeros((days, n, M), np.float32), np.zeros((days, n, M), np.int8), np.zeros((days, n, S), np.float32),
                    np.zeros((days, n, S), np.float32), np.zeros((days, n), np.float32), np.zeros((days, n), np.float32),
                    np.zeros((days, n, len(STRESSES)), np.float32), inten, [])
    for t in range(days):
        wf = weekend if t % 7 >= 5 else 1.0
        nominal = spd * wf
        sorties = rng.poisson(nominal).astype(float)
        doy = (start_doy + t) % 365
        stress = {e: np.array([tables[b][e][dd] for b, dd in zip(base_of, doy, strict=True)]) for e in STRESSES}
        dr = Drivers(sorties, nominal, inten, stress, eng)
        d = model.step(d, dr, rng)
        y = model.observe(d, dr, rng, fs)
        eng = eng + sorties / (k * 220.0)
        eng = np.where(eng >= 1, rng.uniform(0, 0.05, size=n), eng)
        dss += 1
        failed = d >= 1
        if failed.any():
            for u, s in zip(*np.nonzero(failed), strict=True):
                rec.failures.append((int(u), int(s), t))
            if renew:
                d = np.where(failed, rng.uniform(0, 0.03, size=d.shape), d)
                dss = np.where(failed, 0, dss)
        if service_interval is not None:
            due = (dss >= service_interval) & ~failed
            if due.any():
                d = model.service(d, due, rng)
                dss = np.where(due, 0, dss)
        rec.obs[t], rec.fault[t], rec.d[t], rec.dss[t] = y, fs.code, np.minimum(d, 1.5), dss
        rec.sorties[t], rec.nominal[t] = sorties, nominal
        rec.stress[t] = np.stack([stress[e] for e in STRESSES], axis=1)
    return rec


def rul_targets(rec: SimRecord, cap: int) -> np.ndarray:
    """(T, N, S) capped RUL in days; NaN where unknowable (no failure seen and fewer than `cap` days left)."""
    T, N, S = rec.d.shape
    out = np.full((T, N, S), np.nan, dtype=np.float32)
    fails: dict[tuple[int, int], list[int]] = {}
    for u, s, day in rec.failures:
        fails.setdefault((u, s), []).append(day)
    days = np.arange(T)
    for u in range(N):
        for s in range(S):
            fd = np.array(sorted(fails.get((u, s), [])))
            nxt = np.full(T, np.inf)
            if len(fd):
                idx = np.searchsorted(fd, days, side="left")
                ok = idx < len(fd)
                nxt[ok] = fd[idx[ok]]
            rul = nxt - days
            known = np.isfinite(rul) | (days + cap <= T - 1)
            out[:, u, s] = np.where(known, np.minimum(rul, cap), np.nan)
    return out


# ------------------------------------------------------------------------------------------ features
def window_features(obs_w: np.ndarray, dss: np.ndarray, usage: np.ndarray, stress: np.ndarray,
                    intensity: np.ndarray) -> np.ndarray:
    """obs_w: (R, Ms, W) sensor windows for one system → (R, 3·Ms + 1 + 1 + 7 + 1) features (NaN-safe)."""
    R, Ms, W = obs_w.shape
    valid = ~np.isnan(obs_w)
    any_valid = valid.any(axis=2)
    last_idx = W - 1 - np.argmax(valid[:, :, ::-1], axis=2)
    last = np.take_along_axis(obs_w, last_idx[..., None], axis=2)[..., 0]
    last = np.where(any_valid, last, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN windows (long dropout) → NaN, handled by LightGBM
        mean = np.nanmean(obs_w, axis=2)
    filled = np.where(valid, obs_w, np.nan_to_num(mean)[..., None])
    t = np.arange(W) - (W - 1) / 2
    slope = (filled * t).sum(2) / (t**2).sum()
    slope = np.where(any_valid, slope, np.nan)
    return np.concatenate([last, mean, slope, dss[:, None], usage[:, None], stress, intensity[:, None]], axis=1)


def feature_names(model: SynthModel, s: int) -> list[str]:
    ids = [x["id"] for x in model.sensors if x["system"] == SYSTEMS[s]]
    return ([f"{i}__last" for i in ids] + [f"{i}__mean" for i in ids] + [f"{i}__slope" for i in ids]
            + ["days_since_service", "usage_ratio_14d"] + [f"stress_{e}" for e in STRESSES] + ["intensity"])


def system_dataset(model: SynthModel, rec: SimRecord, s: int, W: int, cap: int, every: int,
                   y: np.ndarray | None) -> tuple[np.ndarray, np.ndarray | None, np.ndarray, np.ndarray]:
    """Rows for days W-1, W-1+every, … → (X, y, unit, day)."""
    cols = np.where(model.sensor_system == s)[0]
    obs = rec.obs[:, :, cols]                                   # (T, N, Ms)
    win = sliding_window_view(obs, W, axis=0)                   # (T-W+1, N, Ms, W)
    days = np.arange(W - 1, obs.shape[0], every)
    w = win[days - (W - 1)]                                     # (D, N, Ms, W)
    D, N = w.shape[0], w.shape[1]
    usage = sliding_window_view(rec.sorties / np.maximum(rec.nominal, 1e-6), W, axis=0)[days - (W - 1)].mean(-1)
    stress = sliding_window_view(rec.stress, W, axis=0)[days - (W - 1)].mean(-1)   # (D, N, 7)
    X = window_features(w.reshape(D * N, len(cols), W), rec.dss[days][:, :, s].reshape(-1), usage.reshape(-1),
                        stress.reshape(D * N, -1), np.tile(rec.intensity, D))
    unit = np.tile(np.arange(N), D)
    day = np.repeat(days, N)
    yy = None if y is None else y[days][:, :, s].reshape(-1)
    return X, yy, unit, day


# ------------------------------------------------------------------------------------------ training
def train_all() -> list[dict[str, Any]]:
    model = SynthModel()
    cfg = model.cfg
    W, cap = cfg["feature_window_days"], cfg["rul_cap_days"]
    rec = simulate(model, N_AIRFRAMES, SIM_DAYS, derive_seed("synth-train"))
    y_all = rul_targets(rec, cap)
    rng = np.random.default_rng(derive_seed("synth-split"))
    perm = rng.permutation(N_AIRFRAMES)
    n_tr, n_va = int(0.6 * N_AIRFRAMES), int(0.2 * N_AIRFRAMES)
    part = {"train": set(perm[:n_tr].tolist()), "val": set(perm[n_tr:n_tr + n_va].tolist()),
            "test": set(perm[n_tr + n_va:].tolist())}
    results = []
    for s, name in enumerate(SYSTEMS):
        X, y, unit, day = system_dataset(model, rec, s, W, cap, SAMPLE_EVERY, y_all)
        assert y is not None
        ok = ~np.isnan(y)
        sel = {k: ok & np.isin(unit, list(v)) for k, v in part.items()}
        reg = lgb.LGBMRegressor(n_estimators=1500, learning_rate=0.03, num_leaves=31, min_child_samples=40,
                                subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                                random_state=derive_seed("sys-lgbm", name) % 2**31, deterministic=True,
                                force_row_wise=True, verbose=-1)
        reg.fit(X[sel["train"]], y[sel["train"]], eval_set=[(X[sel["val"]], y[sel["val"]])],
                callbacks=[lgb.early_stopping(100, verbose=False)])
        # calibration: one row per val airframe per week (less correlated scores)
        cal = sel["val"] & (day % 7 == (W - 1) % 7)
        margins = C.abs_margins(np.clip(reg.predict(X[cal]), 0, cap), y[cal], LEVELS)
        pt = np.clip(reg.predict(X[sel["test"]]), 0, cap)
        qv = C.calibrated_quantiles(None, pt, QUANTILES, margins)
        yt = y[sel["test"]]
        picp, mpiw = C.picp_mpiw(qv, QUANTILES, yt, 0.8)
        near = yt <= 30
        res = {
            "system": name, "provenance": "SIMULATED (validated against synthetic ground truth)",
            "rows_train": int(sel["train"].sum()), "rows_test": int(sel["test"].sum()),
            "failures_observed": int(sum(1 for f in rec.failures if f[1] == s)),
            "rmse_days": round(float(np.sqrt(((pt - yt) ** 2).mean())), 3),
            "mae_days": round(float(np.abs(pt - yt).mean()), 3),
            "mae_days_when_rul_le_30": round(float(np.abs(pt[near] - yt[near]).mean()), 3) if near.any() else None,
            "picp80": round(picp, 4), "mpiw80_days": round(mpiw, 2),
            "best_iteration": int(reg.best_iteration_ or 0),
        }
        d = OUT / name
        d.mkdir(parents=True, exist_ok=True)
        reg.booster_.save_model(str(d / "lgbm.txt"))
        write_json(d / "conformal.json", {"method": "abs-residual split conformal", "margins": margins,
                                          "calibration_rows": int(cal.sum())})
        write_json(d / "feature_spec.json", {"features": feature_names(model, s), "window_days": W, "cap_days": cap,
                                             "quantiles": QUANTILES})
        write_json(d / "metrics.json", res)
        results.append(res)
        print(f"    {name:16} RMSE {res['rmse_days']:6.2f} d · MAE {res['mae_days']:6.2f} d · PICP80 {res['picp80']:.3f} · "
              f"failures {res['failures_observed']}")
    return results


class SystemPredictor:
    """Load trained per-system models; predict conformal quantiles (days) from feature rows."""

    def __init__(self) -> None:
        self.boosters = {s: lgb.Booster(model_file=str(OUT / s / "lgbm.txt")) for s in SYSTEMS}
        from pratirakshak.io import read_json

        self.margins = {s: read_json(OUT / s / "conformal.json")["margins"] for s in SYSTEMS}
        self.cap = load_config("systems")["rul_cap_days"]

    def quantiles(self, s: str, X: np.ndarray) -> np.ndarray:
        pt = np.clip(self.boosters[s].predict(X), 0, self.cap)
        return C.calibrated_quantiles(None, pt, QUANTILES, self.margins[s])
