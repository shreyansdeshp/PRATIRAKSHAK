"""Unit-disjoint, lifetime-stratified splits (SPEC §6.3).

Per subset the train-file units are divided into three disjoint sets:
- `replay`: full run-to-failure units reserved for the fleet simulation (never used in fitting),
- `val`: validation units (early stopping, conformal calibration),
- `train`: model fitting.
The official test files are a separate set of engines and are only used for final evaluation.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from pratirakshak.settings import PROCESSED_DIR, derive_seed

GROUP = 5  # 1 in 5 → 20 %
SPLITS_PATH = PROCESSED_DIR / "splits.json"


def _take_one_per_group(units: list[int], life: pd.Series, rng: np.random.Generator) -> tuple[list[int], list[int]]:
    """Sort by lifetime, chunk into groups of GROUP, pick one unit per chunk at random → stratified 1/GROUP."""
    ordered = sorted(units, key=lambda u: (int(life[u]), u))
    picked: list[int] = []
    rest: list[int] = []
    for i in range(0, len(ordered), GROUP):
        chunk = ordered[i : i + GROUP]
        if len(chunk) < GROUP and len(chunk) < GROUP / 2:
            rest.extend(chunk)  # small tail chunk stays in the larger set
            continue
        j = int(rng.integers(len(chunk)))
        picked.append(chunk[j])
        rest.extend(c for k, c in enumerate(chunk) if k != j)
    return sorted(picked), sorted(rest)


def make_splits(subset: str, life: pd.Series) -> dict[str, list[int]]:
    rng = np.random.default_rng(derive_seed("splits", subset))
    units = [int(u) for u in life.index]
    replay, rest = _take_one_per_group(units, life, rng)
    val, train = _take_one_per_group(rest, life, rng)
    return {"train": train, "val": val, "replay": replay}


def save_splits(splits: dict[str, dict[str, list[int]]], path: Path = SPLITS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(splits, indent=1) + "\n", encoding="utf-8")


def load_splits(path: Path = SPLITS_PATH) -> dict[str, dict[str, list[int]]]:
    return json.loads(path.read_text(encoding="utf-8"))
