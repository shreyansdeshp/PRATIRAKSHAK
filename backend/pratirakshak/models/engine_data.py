"""Engine pre-processing (SPEC §6.3). Everything is fitted on TRAIN units only, then applied to val/replay/test."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

from pratirakshak.ingest.cmapss import OP_COLS, load_subset
from pratirakshak.ingest.splits import load_splits
from pratirakshak.io import load_config
from pratirakshak.settings import derive_seed

MULTI_CONDITION = {"FD002", "FD004"}


def engine_cfg() -> dict[str, Any]:
    return load_config("models")["engine"]


@dataclass
class Normaliser:
    """Operating-condition clustering + per-condition z-score, fitted on train-unit rows only."""

    inputs: list[str]
    kmeans: KMeans | None = None
    mean: np.ndarray = field(default_factory=lambda: np.zeros(0))  # (k, F)
    std: np.ndarray = field(default_factory=lambda: np.zeros(0))
    healthy_z: np.ndarray = field(default_factory=lambda: np.zeros(0))  # (F,) mean z on rows with RUL > r_max
    healthy_raw: np.ndarray = field(default_factory=lambda: np.zeros(0))  # (k, F) raw-unit healthy means
    fit_units: list[int] = field(default_factory=list)

    def cluster(self, df: pd.DataFrame) -> np.ndarray:
        if self.kmeans is None:
            return np.zeros(len(df), dtype=int)
        return self.kmeans.predict(df[OP_COLS].to_numpy())

    def fit(self, train: pd.DataFrame, subset: str, k: int, r_max: int) -> Normaliser:
        self.fit_units = sorted(int(u) for u in train["unit"].unique())
        if subset in MULTI_CONDITION:
            self.kmeans = KMeans(n_clusters=k, n_init=10, random_state=derive_seed("kmeans", subset) % 2**31)
            self.kmeans.fit(train[OP_COLS].to_numpy())
        c = self.cluster(train)
        x = train[self.inputs].to_numpy(dtype=float)
        n_c = int(c.max()) + 1
        self.mean = np.stack([x[c == i].mean(0) for i in range(n_c)])
        self.std = np.stack([x[c == i].std(0) for i in range(n_c)])
        self.std[self.std < 1e-8] = 1.0
        healthy = (train["rul"] > r_max).to_numpy()
        self.healthy_z = self.transform(train)[healthy].mean(0)
        self.healthy_raw = np.stack([x[(c == i) & healthy].mean(0) for i in range(n_c)])
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        c = self.cluster(df)
        x = df[self.inputs].to_numpy(dtype=float)
        return ((x - self.mean[c]) / self.std[c]).astype(np.float32)

    def to_json(self) -> dict[str, Any]:
        return {
            "inputs": self.inputs,
            "kmeans_centers": None if self.kmeans is None else self.kmeans.cluster_centers_.round(6).tolist(),
            "mean": self.mean.round(6).tolist(), "std": self.std.round(6).tolist(),
            "healthy_z": self.healthy_z.round(6).tolist(), "healthy_raw": self.healthy_raw.round(4).tolist(),
            "fit_units": self.fit_units,
        }


@dataclass
class Windows:
    x: np.ndarray        # (N, W, F) float32
    y: np.ndarray        # capped RUL at window end
    y_true: np.ndarray   # uncapped RUL at window end
    cycle: np.ndarray    # cycle index at window end
    unit: np.ndarray


def _unit_windows(z: np.ndarray, ends: np.ndarray, w: int) -> np.ndarray:
    pad = np.concatenate([np.repeat(z[:1], w - 1, axis=0), z], axis=0)  # left-pad with first row
    idx = ends[:, None] + np.arange(w)[None, :] - 1  # in padded coords: window ending at cycle e → rows e-1 .. e+w-2
    return pad[idx]


def make_windows(df: pd.DataFrame, z: np.ndarray, w: int, r_max: int, mode: str,
                 rul_after_end: dict[int, int] | None = None, n_trunc: int = 10, seed: int = 0) -> Windows:
    """mode: 'all' (every cycle), 'last' (last cycle per unit), 'trunc' (n_trunc seeded truncation points per unit)."""
    rng = np.random.default_rng(seed)
    xs, ys, yts, cs, us = [], [], [], [], []
    units = df["unit"].to_numpy()
    for u in np.unique(units):
        m = units == u
        zu = z[m]
        life = len(zu)
        if mode == "all":
            ends = np.arange(1, life + 1)
        elif mode == "last":
            ends = np.array([life])
        else:
            lo = max(1, int(0.1 * life))
            ends = np.sort(rng.choice(np.arange(lo, life + 1), size=min(n_trunc, life - lo + 1), replace=False))
        extra = 0 if rul_after_end is None else rul_after_end[int(u)]
        rul = (life - ends) + extra
        xs.append(_unit_windows(zu, ends, w))
        ys.append(np.minimum(rul, r_max))
        yts.append(rul)
        cs.append(ends)
        us.append(np.full(len(ends), u))
    return Windows(np.concatenate(xs).astype(np.float32), np.concatenate(ys).astype(np.float32),
                   np.concatenate(yts).astype(np.float32), np.concatenate(cs), np.concatenate(us))


@dataclass
class Prepared:
    subset: str
    cfg: dict[str, Any]
    norm: Normaliser
    train: Windows
    val_all: Windows      # every cycle of val units (early stopping)
    val_cal: Windows      # truncation windows of val units (conformal calibration)
    test: Windows         # last window per official test engine
    replay_df: pd.DataFrame
    replay_z: np.ndarray
    split_units: dict[str, list[int]]


def prepare(subset: str, cfg: dict[str, Any] | None = None) -> Prepared:
    cfg = cfg or engine_cfg()
    w, r_max, inputs = cfg["window"], cfg["r_max"], cfg["inputs"]
    data = load_subset(subset)
    sp = load_splits()[subset]
    tr = data.train[data.train["unit"].isin(sp["train"])].reset_index(drop=True)
    va = data.train[data.train["unit"].isin(sp["val"])].reset_index(drop=True)
    rp = data.train[data.train["unit"].isin(sp["replay"])].reset_index(drop=True)

    norm = Normaliser(inputs).fit(tr, subset, cfg["kmeans_k"], r_max)
    z_tr, z_va, z_rp, z_te = (norm.transform(d) for d in (tr, va, rp, data.test))
    test_rul = {int(u): int(r) for u, r in zip(sorted(data.test["unit"].unique()), data.test_rul, strict=True)}

    return Prepared(
        subset=subset, cfg=cfg, norm=norm,
        train=make_windows(tr, z_tr, w, r_max, "all"),
        val_all=make_windows(va, z_va, w, r_max, "all"),
        val_cal=make_windows(va, z_va, w, r_max, "trunc", n_trunc=cfg["val_truncations_per_unit"],
                             seed=derive_seed("valtrunc", subset)),
        test=make_windows(data.test, z_te, w, r_max, "last", rul_after_end=test_rul),
        replay_df=rp, replay_z=z_rp, split_units=sp,
    )


# ------------------------------------------------------------------------------- tabular features
def summary_features(win: Windows, inputs: list[str], rich: bool) -> tuple[np.ndarray, list[str]]:
    """Ridge (rich=False): last, mean, slope. LightGBM (rich=True): + std, delta(last5 − first5)."""
    x = win.x
    w = x.shape[1]
    t = np.arange(w, dtype=np.float32) - (w - 1) / 2
    slope = np.einsum("nwf,w->nf", x, t) / float((t**2).sum())
    blocks = {"last": x[:, -1], "mean": x.mean(1), "slope": slope}
    if rich:
        blocks["std"] = x.std(1)
        blocks["delta"] = x[:, -5:].mean(1) - x[:, :5].mean(1)
    feats = np.concatenate([*blocks.values(), win.cycle[:, None].astype(np.float32)], axis=1)
    names = [f"{s}__{k}" for k in blocks for s in inputs] + ["cycle"]
    return feats, names
