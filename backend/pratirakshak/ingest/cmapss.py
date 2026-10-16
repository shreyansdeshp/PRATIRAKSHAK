"""Load NASA C-MAPSS (REAL). Column layout per readme.txt: unit, cycle, 3 operational settings, 21 sensors."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from pratirakshak.settings import CMAPSS_DIR

SUBSETS = ("FD001", "FD002", "FD003", "FD004")
OP_COLS = ["op1", "op2", "op3"]
SENSOR_COLS = [f"s{i}" for i in range(1, 22)]
COLUMNS = ["unit", "cycle", *OP_COLS, *SENSOR_COLS]

# SPEC §6.1 sensor dictionary. readme.txt only says "sensor measurement 1..21"; names/units/order are
# Table 2 of Saxena et al. (2008) "Damage Propagation Modeling…" (checked against the bundled PDF).
SENSOR_NAMES = {
    "s1": ("T2", "fan inlet temperature", "°R"),
    "s2": ("T24", "LPC outlet temperature", "°R"),
    "s3": ("T30", "HPC outlet temperature", "°R"),
    "s4": ("T50", "LPT outlet temperature", "°R"),
    "s5": ("P2", "fan inlet pressure", "psia"),
    "s6": ("P15", "bypass-duct pressure", "psia"),
    "s7": ("P30", "HPC outlet pressure", "psia"),
    "s8": ("Nf", "physical fan speed", "rpm"),
    "s9": ("Nc", "physical core speed", "rpm"),
    "s10": ("EPR", "engine pressure ratio", "–"),
    "s11": ("Ps30", "HPC outlet static pressure", "psia"),
    "s12": ("phi", "fuel flow to Ps30 ratio", "pps/psi"),
    "s13": ("NRf", "corrected fan speed", "rpm"),
    "s14": ("NRc", "corrected core speed", "rpm"),
    "s15": ("BPR", "bypass ratio", "–"),
    "s16": ("farB", "burner fuel-air ratio", "–"),
    "s17": ("htBleed", "bleed enthalpy", "–"),
    "s18": ("Nf_dmd", "demanded fan speed", "rpm"),
    "s19": ("PCNfR_dmd", "demanded corrected fan speed", "rpm"),
    "s20": ("W31", "HPT coolant bleed", "lbm/s"),
    "s21": ("W32", "LPT coolant bleed", "lbm/s"),
}

# SPEC §6.2 — the 12 headline sensors and the part each indicates.
HEADLINE_SENSORS = {
    "s8": "Fan", "s15": "Fan",
    "s2": "Low-pressure compressor",
    "s3": "High-pressure compressor", "s7": "High-pressure compressor",
    "s11": "High-pressure compressor", "s9": "High-pressure compressor",
    "s12": "Combustor",
    "s20": "High-pressure turbine", "s17": "High-pressure turbine",
    "s4": "Low-pressure turbine", "s21": "Low-pressure turbine",
}


@dataclass(frozen=True)
class Subset:
    name: str
    train: pd.DataFrame  # includes per-row `rul` (true, uncapped)
    test: pd.DataFrame
    test_rul: np.ndarray  # true RUL after the last test cycle, indexed by test unit order (unit 1..n)


def cmapss_dir(root: Path = CMAPSS_DIR) -> Path:
    """The folder holding train_FD001.txt — either data/raw/cmapss/ or the zip's nested CMAPSSData/."""
    for cand in (root, root / "CMAPSSData"):
        if (cand / "train_FD001.txt").exists():
            return cand
    raise FileNotFoundError(
        f"C-MAPSS files not found under {root}. Run `./tasks.ps1 fetch` (or `make fetch`)."
    )


def read_table(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, sep=r"\s+", header=None, engine="c")
    if df.shape[1] != len(COLUMNS):
        raise ValueError(f"{path.name}: expected {len(COLUMNS)} columns, found {df.shape[1]}")
    df.columns = COLUMNS
    return df.astype({"unit": "int32", "cycle": "int32"})


def load_subset(name: str, root: Path | None = None) -> Subset:
    d = cmapss_dir() if root is None else cmapss_dir(root)
    train = read_table(d / f"train_{name}.txt")
    test = read_table(d / f"test_{name}.txt")
    test_rul = np.loadtxt(d / f"RUL_{name}.txt", dtype=np.int32).reshape(-1)
    life = train.groupby("unit")["cycle"].transform("max")
    train["rul"] = (life - train["cycle"]).astype("int32")
    return Subset(name, train, test, test_rul)


def lifetimes(train: pd.DataFrame) -> pd.Series:
    """Run-to-failure length (cycles) per train unit."""
    return train.groupby("unit")["cycle"].max().rename("life")


def condition_id(df: pd.DataFrame) -> pd.Series:
    """Coarse operating-condition label for EDA only (the 6 conditions are discrete points in op space).
    Model pre-processing uses KMeans fitted on train units (Stage 3), not this."""
    op2 = df["op2"].round(2) + 0.0  # + 0.0 folds -0.0 into 0.0
    return (
        df["op1"].round(0).astype(int).astype(str)
        + "/" + op2.map("{:.2f}".format)
        + "/" + df["op3"].round(0).astype(int).astype(str)
    ).rename("cond")
