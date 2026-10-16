"""Stage 1 — ingest & verify C-MAPSS (REAL), make unit-disjoint splits, write docs/DATA_NOTES.md.

Run: ./tasks.ps1 data   |   make data   |   python -m pratirakshak.ingest
Every number in DATA_NOTES.md is computed here from the files on disk.
"""

from __future__ import annotations

import shutil
import sys

import numpy as np
import pandas as pd

from pratirakshak.ingest.cmapss import (
    HEADLINE_SENSORS,
    SENSOR_COLS,
    SENSOR_NAMES,
    SUBSETS,
    Subset,
    cmapss_dir,
    condition_id,
    lifetimes,
    load_subset,
)
from pratirakshak.ingest.splits import SPLITS_PATH, make_splits, save_splits
from pratirakshak.io import write_json, write_text
from pratirakshak.settings import DOCS_DIR, REPORTS_DIR, ROOT

# What SPEC §3.2 says, and what readme.txt says (engines train/test). Compared, never trusted.
SPEC_EXPECTED = {
    "FD001": {"train_units": 100, "test_units": 100, "train_rows": 20631},
    "FD002": {"train_units": 260, "test_units": 259, "train_rows": 53759},
    "FD003": {"train_units": 100, "test_units": 100, "train_rows": 24720},
    "FD004": {"train_units": 249, "test_units": 248, "train_rows": 61249},
}
README_UNITS = {"FD001": (100, 100), "FD002": (260, 259), "FD003": (100, 100), "FD004": (248, 249)}

FIG_DIR = DOCS_DIR / "figures"
EDA_JSON = REPORTS_DIR / "data" / "cmapss_eda.json"

PAPER, INK, INK_SOFT, OLIVE, KHAKI, FOLD = "#F4EFE3", "#1E2224", "#4A4F52", "#4B5632", "#A89F7A", "#D6CCB1"


def counts(s: Subset) -> dict[str, int]:
    return {
        "train_units": int(s.train["unit"].nunique()),
        "test_units": int(s.test["unit"].nunique()),
        "train_rows": len(s.train),
        "test_rows": len(s.test),
        "rul_lines": len(s.test_rul),
        "columns": int(s.train.shape[1] - 1),  # minus derived `rul`
    }


def condition_normalised(df: pd.DataFrame) -> pd.DataFrame:
    """z-score each sensor within its operating condition (EDA only)."""
    c = condition_id(df)
    g = df.groupby(c)[SENSOR_COLS]
    return (df[SENSOR_COLS] - g.transform("mean")) / g.transform("std").replace(0, np.nan)


def sensor_profile(s: Subset) -> pd.DataFrame:
    c = condition_id(s.train)
    levels = s.train.groupby(c)[SENSOR_COLS].nunique().max()
    z = condition_normalised(s.train)
    rho = z.corrwith(s.train["rul"].clip(upper=125), method="spearman")
    return pd.DataFrame({"max_levels_per_condition": levels, "spearman_vs_rul_capped125": rho.round(3)})


def lifetime_stats(life: pd.Series) -> dict[str, float]:
    q = life.quantile([0.1, 0.5, 0.9])
    return {
        "min": int(life.min()), "p10": float(q[0.1]), "median": float(q[0.5]),
        "mean": round(float(life.mean()), 1), "p90": float(q[0.9]), "max": int(life.max()),
    }


# ----------------------------------------------------------------------------------------- figures
def _style(ax) -> None:  # type: ignore[no-untyped-def]
    ax.set_facecolor(PAPER)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK_SOFT)
        ax.spines[side].set_linewidth(0.6)
    ax.tick_params(colors=INK_SOFT, labelsize=7, width=0.6)


def fig_lifetimes(lives: dict[str, pd.Series]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 4, figsize=(12, 2.8), facecolor=PAPER, sharex=True)
    bins = np.arange(100, 560, 20)
    for ax, (name, life) in zip(axes, lives.items(), strict=True):
        _style(ax)
        ax.hist(life, bins=bins, color=KHAKI, edgecolor=INK, linewidth=0.5)
        ax.axvline(life.median(), color=OLIVE, linewidth=1.2)
        ax.set_title(f"{name} · n={len(life)} · median {life.median():.0f}", fontsize=9, color=INK, loc="left")
        ax.set_xlabel("run-to-failure length (cycles)", fontsize=7, color=INK_SOFT)
    fig.suptitle("C-MAPSS training-engine lifetimes  [REAL]", fontsize=10, color=INK, x=0.01, ha="left")
    fig.tight_layout()
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIG_DIR / "lifetimes.png", dpi=150, facecolor=PAPER, metadata={"Software": None})
    plt.close(fig)


def fig_trajectories(s: Subset, n_units: int = 6) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    z = condition_normalised(s.train)
    df = pd.concat([s.train[["unit", "rul"]], z], axis=1)
    rng = np.random.default_rng(26249)
    units = sorted(rng.choice(df["unit"].unique(), size=n_units, replace=False))
    fig, axes = plt.subplots(3, 4, figsize=(12, 6.4), facecolor=PAPER, sharex=True)
    for ax, sensor in zip(axes.flat, HEADLINE_SENSORS, strict=True):
        _style(ax)
        for u in units:
            d = df[df["unit"] == u]
            smooth = d[sensor].rolling(9, min_periods=1, center=True).mean()
            ax.plot(-d["rul"], smooth, color=INK, linewidth=0.6, alpha=0.75)
        ax.axvline(0, color="#B83A26", linewidth=0.8)
        sym, desc, _ = SENSOR_NAMES[sensor]
        ax.set_title(f"{sym} ({sensor}) · {HEADLINE_SENSORS[sensor]}", fontsize=8, color=INK, loc="left")
    for ax in axes[-1]:
        ax.set_xlabel("cycles before failure", fontsize=7, color=INK_SOFT)
    fig.suptitle(
        f"{s.name} · 12 headline sensors, z-scored within operating condition, 9-cycle smoothing · "
        f"{n_units} engines  [REAL]",
        fontsize=10, color=INK, x=0.01, ha="left",
    )
    fig.tight_layout()
    fig.savefig(FIG_DIR / f"trajectories_{s.name}.png", dpi=130, facecolor=PAPER, metadata={"Software": None})
    plt.close(fig)


# ----------------------------------------------------------------------------------------- notes
def write_notes(eda: dict, splits: dict) -> None:  # type: ignore[type-arg]
    L: list[str] = []
    w = L.append
    w("# DATA NOTES — NASA C-MAPSS  `REAL`")
    w("")
    w("_Generated by `python -m pratirakshak.ingest` from the files on disk. Do not edit by hand._")
    w("")
    w(f"Source folder: `{eda['source_dir']}`. Columns per file: **{eda['columns']}** "
      "(`unit, cycle, op1–op3, s1–s21`), whitespace-separated with trailing spaces.")
    w("")
    w("## 1. Counts vs SPEC §3.2 and readme.txt")
    w("")
    w("| Subset | Train engines | Test engines | RUL lines | Train rows | Test rows | SPEC (train/test, rows) | readme (train/test) | Match |")
    w("|---|---|---|---|---|---|---|---|---|")
    for n, c in eda["counts"].items():
        e = SPEC_EXPECTED[n]
        r = README_UNITS[n]
        w(f"| {n} | {c['train_units']} | {c['test_units']} | {c['rul_lines']} | {c['train_rows']:,} | "
          f"{c['test_rows']:,} | {e['train_units']}/{e['test_units']}, {e['train_rows']:,} | {r[0]}/{r[1]} | "
          f"SPEC: {'yes' if eda['match_spec'][n] else '**no**'} · readme: {'yes' if eda['match_readme'][n] else '**no**'} |")
    w("")
    for n in eda["mismatches"]:
        w(f"- **{n}:** {eda['mismatches'][n]}")
    if eda["mismatches"]:
        w("- Resolution: the files are the source of truth (SPEC §3.2).")
    w("")
    w("## 2. Operating conditions")
    w("")
    w("Conditions are discrete points in (altitude, Mach, TRA) space. Coarse labels (rounded settings) used for EDA only; "
      "model pre-processing fits KMeans(k=6) on training units (Stage 3).")
    w("")
    w("| Subset | Distinct conditions (train) |")
    w("|---|---|")
    for n, k in eda["n_conditions"].items():
        w(f"| {n} | {k} |")
    w("")
    w("## 3. Constant / uninformative sensors (determined empirically)")
    w("")
    w("Rule: a sensor is **constant** in a subset if it takes **≤ 2 distinct values within every operating condition** "
      "on the training engines. Relative standard deviation is *not* used: e.g. Nf (s8) varies by only ~10⁻⁵ "
      "relative yet trends clearly with degradation. The Spearman correlation of each sensor (z-scored within "
      "condition) with capped RUL (min(RUL,125)) is listed as an informativeness signal.")
    w("")
    w("| Subset | Constant sensors |")
    w("|---|---|")
    for n, cs in eda["constant_sensors"].items():
        w(f"| {n} | {', '.join(f'{s} ({SENSOR_NAMES[s][0]})' for s in cs)} |")
    w("")
    w("Spearman ρ with capped RUL (negative = rises as the engine wears; blank = constant):")
    w("")
    w("| Sensor | Symbol | Headline part | " + " | ".join(SUBSETS) + " |")
    w("|---|---|---|" + "---|" * len(SUBSETS))
    for s in SENSOR_COLS:
        cells = []
        for n in SUBSETS:
            v = eda["sensor_profile"][n][s]["spearman_vs_rul_capped125"]
            cells.append("" if s in eda["constant_sensors"][n] or v is None else f"{v:+.2f}")
        w(f"| {s} | {SENSOR_NAMES[s][0]} | {HEADLINE_SENSORS.get(s, '—')} | " + " | ".join(cells) + " |")
    w("")
    w("## 4. Lifetimes (training engines, run-to-failure, cycles)")
    w("")
    w("| Subset | min | p10 | median | mean | p90 | max |")
    w("|---|---|---|---|---|---|---|")
    for n, st in eda["lifetimes"].items():
        w(f"| {n} | {st['min']} | {st['p10']:.0f} | {st['median']:.0f} | {st['mean']} | {st['p90']:.0f} | {st['max']} |")
    w("")
    w("Test-engine sequences are truncated before failure; shortest test sequence per subset: "
      + ", ".join(f"{n} {v} cycles" for n, v in eda["test_min_len"].items())
      + " (windows shorter than 30 are left-padded, SPEC §6.3).")
    w("")
    w("![lifetimes](figures/lifetimes.png)")
    w("")
    for n in SUBSETS:
        w(f"![{n} trajectories](figures/trajectories_{n}.png)")
        w("")
    w("## 5. Splits (unit-disjoint, lifetime-stratified)")
    w("")
    w("Train-file engines per subset are sorted by lifetime, cut into groups of 5, and one engine per group is drawn "
      "(seeded) into the **fleet-replay holdout**; the same procedure on the remainder gives **validation**; the rest "
      "is **train**. Replay engines are never used for fitting; the official test files are a different set of engines, "
      "used only for final evaluation. Saved in `data/processed/splits.json`.")
    w("")
    w("| Subset | train | val | replay | total |")
    w("|---|---|---|---|---|")
    for n, sp in splits.items():
        t = sum(len(v) for v in sp.values())
        w(f"| {n} | {len(sp['train'])} | {len(sp['val'])} | {len(sp['replay'])} | {t} |")
    w("")
    w("The simulation samples replay trajectories with replacement and random phase offsets, so a small replay pool "
      "can drive more engines than it contains (SPEC §7.3).")
    w("")
    w("## 6. Sensor dictionary")
    w("")
    w("`readme.txt` names columns only as \"sensor measurement 1…21\". Symbols, descriptions and units below follow "
      "Table 2 of Saxena et al. (2008), in the same order; this is the standard mapping and matches SPEC §6.1.")
    w("")
    w("| Col | Symbol | Description | Units |")
    w("|---|---|---|---|")
    for s, (sym, desc, unit) in SENSOR_NAMES.items():
        w(f"| {s} | {sym} | {desc} | {unit} |")
    w("")
    write_text(DOCS_DIR / "DATA_NOTES.md", "\n".join(L) + "\n")


def main() -> int:
    src = cmapss_dir()
    pdf = src / "Damage Propagation Modeling.pdf"
    if pdf.exists() and not (DOCS_DIR / pdf.name).exists():
        shutil.copy2(pdf, DOCS_DIR / pdf.name)

    subsets = {n: load_subset(n) for n in SUBSETS}
    eda: dict = {"source_dir": src.relative_to(ROOT).as_posix(), "counts": {}, "match_spec": {}, "match_readme": {},
                 "mismatches": {}, "n_conditions": {}, "constant_sensors": {}, "sensor_profile": {},
                 "lifetimes": {}, "lifetime_values": {}, "test_min_len": {}}
    splits: dict[str, dict[str, list[int]]] = {}

    print(f"C-MAPSS source: {src}")
    print(f"{'subset':7} {'train eng':>9} {'test eng':>8} {'RUL':>4} {'train rows':>10} {'test rows':>9}  "
          f"{'SPEC 3.2 (train/test, rows)':28} {'readme':8} verdict")
    for n, s in subsets.items():
        c = counts(s)
        eda["columns"] = c.pop("columns")
        eda["counts"][n] = c
        e, r = SPEC_EXPECTED[n], README_UNITS[n]
        ok_spec = (c["train_units"], c["test_units"], c["train_rows"]) == (e["train_units"], e["test_units"], e["train_rows"])
        ok_readme = (c["train_units"], c["test_units"]) == r
        eda["match_spec"][n], eda["match_readme"][n] = ok_spec, ok_readme
        problems = []
        if not ok_spec:
            problems.append(f"files have {c['train_units']}/{c['test_units']} engines and {c['train_rows']:,} train rows; "
                            f"SPEC says {e['train_units']}/{e['test_units']}, {e['train_rows']:,}")
        if not ok_readme:
            problems.append(f"readme says {r[0]}/{r[1]}")
        if c["rul_lines"] != c["test_units"]:
            problems.append(f"RUL file has {c['rul_lines']} lines for {c['test_units']} test engines")
        if problems:
            eda["mismatches"][n] = "; ".join(problems)
        verdict = "OK" if not problems else "DIFF: " + "; ".join(problems)
        print(f"{n:7} {c['train_units']:>9} {c['test_units']:>8} {c['rul_lines']:>4} {c['train_rows']:>10,} "
              f"{c['test_rows']:>9,}  {str(e['train_units']) + '/' + str(e['test_units']) + ', ' + format(e['train_rows'], ','):28} "
              f"{str(r[0]) + '/' + str(r[1]):8} {verdict}")

        prof = sensor_profile(s)
        eda["n_conditions"][n] = int(condition_id(s.train).nunique())
        eda["constant_sensors"][n] = [k for k, v in prof["max_levels_per_condition"].items() if v <= 2]
        eda["sensor_profile"][n] = {k: {"max_levels_per_condition": int(row.max_levels_per_condition),
                                        "spearman_vs_rul_capped125": None if pd.isna(row.spearman_vs_rul_capped125)
                                        else float(row.spearman_vs_rul_capped125)}
                                    for k, row in prof.iterrows()}
        life = lifetimes(s.train)
        eda["lifetimes"][n] = lifetime_stats(life)
        eda["lifetime_values"][n] = [int(v) for v in life.sort_index().values]
        eda["test_min_len"][n] = int(s.test.groupby("unit")["cycle"].max().min())
        splits[n] = make_splits(n, life)

    save_splits(splits)
    EDA_JSON.parent.mkdir(parents=True, exist_ok=True)
    write_json(EDA_JSON, {"provenance": "REAL", **eda})

    fig_lifetimes({n: lifetimes(s.train) for n, s in subsets.items()})
    for s in subsets.values():
        fig_trajectories(s)
    write_notes(eda, splits)

    print("\nconstant sensors:", {n: v for n, v in eda["constant_sensors"].items()})
    print("splits (train/val/replay):", {n: tuple(len(v) for v in sp.values()) for n, sp in splits.items()})
    print(f"wrote {SPLITS_PATH.relative_to(ROOT)}, {EDA_JSON.relative_to(ROOT)}, docs/DATA_NOTES.md, docs/figures/*.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
