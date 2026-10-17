"""REAL anchor for the hydraulics system (SPEC §7.4): UCI "Condition monitoring of hydraulic systems"
(Helwig, Pignanelli, Schütze; CC BY 4.0). 2,205 one-minute load cycles of a hydraulic test rig, 17 sensors.

1. Real validation: LightGBM classifiers for pump leakage / accumulator / cooler / valve state from cycle features,
   evaluated on a *block* split (blocks of 50 consecutive cycles) so neighbouring cycles cannot leak.
2. Calibration: pressure noise (cycle-to-cycle, same condition), severe-leak pressure change, cooler-failure temperature
   rise and flow noise → used to set the synthetic hydraulics sensors (mapping: "severe" rig state ≙ damage 0.8).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score

from pratirakshak.io import read_json, write_json, write_parquet
from pratirakshak.settings import INTERIM_DIR, PROCESSED_DIR, RAW_DIR, derive_seed

UCI_DIR = RAW_DIR / "uci_hydraulic"
FEATURES = INTERIM_DIR / "uci_hydraulic_features.parquet"
ANCHOR_JSON = PROCESSED_DIR / "anchors" / "hydraulics.json"
SENSORS = ["PS1", "PS2", "PS3", "PS4", "PS5", "PS6", "EPS1", "FS1", "FS2", "TS1", "TS2", "TS3", "TS4", "VS1", "CE", "CP", "SE"]
TARGETS = ["cooler_pct", "valve_pct", "pump_leak", "accumulator_bar", "stable_flag"]
SEVERE_AS_DAMAGE = 0.8


def available() -> bool:
    return (UCI_DIR / "profile.txt").exists() and all((UCI_DIR / f"{s}.txt").exists() for s in SENSORS)


def cycle_features() -> pd.DataFrame:
    if FEATURES.exists():
        return pd.read_parquet(FEATURES)
    cols: dict[str, np.ndarray] = {}
    for s in SENSORS:
        x = pd.read_csv(UCI_DIR / f"{s}.txt", sep="\t", header=None, dtype=np.float64).to_numpy()
        cols[f"{s}_mean"], cols[f"{s}_std"] = x.mean(1), x.std(1)
        cols[f"{s}_min"], cols[f"{s}_max"] = x.min(1), x.max(1)
    df = pd.DataFrame(cols)
    prof = pd.read_csv(UCI_DIR / "profile.txt", sep="\t", header=None, names=TARGETS)
    df = pd.concat([df, prof], axis=1)
    df.insert(0, "cycle", np.arange(len(df)))
    write_parquet(FEATURES, df)
    return df


def validate(df: pd.DataFrame) -> dict[str, Any]:
    rng = np.random.default_rng(derive_seed("uci_blocks"))
    block = df["cycle"] // 50
    blocks = np.unique(block)
    test_blocks = set(rng.choice(blocks, size=int(round(0.3 * len(blocks))), replace=False).tolist())
    test = block.isin(test_blocks).to_numpy()
    feats = [c for c in df.columns if c.endswith(("_mean", "_std", "_min", "_max"))]
    out: dict[str, Any] = {"split": "30 % of 50-cycle blocks held out (seeded)", "n_train": int((~test).sum()),
                           "n_test": int(test.sum()), "targets": {}}
    for t in ["pump_leak", "accumulator_bar", "cooler_pct", "valve_pct"]:
        y = df[t].astype(str).to_numpy()
        clf = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=15, random_state=derive_seed("uci", t) % 2**31,
                                 deterministic=True, force_row_wise=True, verbose=-1)
        clf.fit(df.loc[~test, feats], y[~test])
        pred = clf.predict(df.loc[test, feats])
        out["targets"][t] = {"accuracy": round(float(accuracy_score(y[test], pred)), 4),
                             "macro_f1": round(float(f1_score(y[test], pred, average="macro")), 4),
                             "classes": sorted(set(y.tolist()))}
    return out


def calibrate(df: pd.DataFrame) -> dict[str, Any]:
    stable = df[df["stable_flag"] == 0]
    cond = ["cooler_pct", "valve_pct", "pump_leak", "accumulator_bar"]

    def rel_noise(col: str) -> float:
        g = stable.groupby(cond)[col]
        return float((g.std() / g.mean().abs()).median())

    healthy = stable[(stable["pump_leak"] == 0) & (stable["cooler_pct"] == 100) & (stable["valve_pct"] == 100)]
    severe_leak = stable[(stable["pump_leak"] == 2) & (stable["cooler_pct"] == 100) & (stable["valve_pct"] == 100)]
    cooler_fail = stable[(stable["cooler_pct"] == 3) & (stable["pump_leak"] == 0) & (stable["valve_pct"] == 100)]
    p_h, p_s = healthy["PS1_mean"].mean(), severe_leak["PS1_mean"].mean()
    return {
        "pressure_rel_noise": round(rel_noise("PS1_mean"), 6),
        "pressure_rel_change_severe_leak": round(float((p_s - p_h) / p_h), 6),
        "flow_rel_noise": round(rel_noise("FS1_mean"), 6),
        "flow_rel_change_severe_leak": round(float((severe_leak["FS1_mean"].mean() - healthy["FS1_mean"].mean())
                                                   / healthy["FS1_mean"].mean()), 6),
        "temperature_noise_c": round(float(stable.groupby(cond)["TS1_mean"].std().median()), 4),
        "temperature_rise_cooler_failure_c": round(float(cooler_fail["TS1_mean"].mean() - healthy["TS1_mean"].mean()), 4),
        "n_cycles_healthy": int(len(healthy)), "n_cycles_severe_leak": int(len(severe_leak)),
        "n_cycles_cooler_failure": int(len(cooler_fail)), "severe_state_as_damage": SEVERE_AS_DAMAGE,
    }


def run() -> dict[str, Any] | None:
    if not available():
        return None
    df = cycle_features()
    result = {"source": "UCI ML Repository #447 (Helwig, Pignanelli, Schütze 2015), CC BY 4.0", "provenance": "REAL",
              "cycles": int(len(df)), "validation": validate(df), "calibration": calibrate(df)}
    write_json(ANCHOR_JSON, result)
    return result


def load_anchor(path: Path = ANCHOR_JSON) -> dict[str, Any] | None:
    return read_json(path) if path.exists() else None


def apply_anchor(sensor: dict[str, Any], anchor: dict[str, Any] | None) -> dict[str, Any]:
    """Set a hydraulics sensor's effect size from the rig (severe state ≙ damage 0.8). Noise = max(rig noise,
    configured noise): the rig is laboratory-grade, so the configured in-flight noise acts as a floor."""
    if anchor is None or "anchor" not in sensor:
        return sensor
    c, s, d = anchor["calibration"], dict(sensor), SEVERE_AS_DAMAGE ** sensor["power"]
    if sensor["anchor"] == "pressure":
        s["noise"] = round(max(c["pressure_rel_noise"] * s["healthy"], sensor["noise"]), 4)
        s["effect"] = round(c["pressure_rel_change_severe_leak"] / d * s["healthy"], 3)
    elif sensor["anchor"] == "temperature":
        s["noise"] = round(max(c["temperature_noise_c"], sensor["noise"]), 4)
        s["effect"] = round(c["temperature_rise_cooler_failure_c"] / d, 3)
    elif sensor["anchor"] == "flow":
        s["noise"] = round(max(c["flow_rel_noise"] * s["healthy"], sensor["noise"]), 4)
    s["anchored"] = True
    return s
