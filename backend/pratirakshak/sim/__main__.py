"""Stage 7 — policies × scenarios × seeds, counterfactuals, ablations, sensitivity, demo seed, results report.

Run: ./tasks.ps1 sim | make sim | python -m pratirakshak.sim [--workers N] [--seeds N]
Every number in reports/results.md and data/processed/results/*.json is computed here from the simulation runs.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import t as student_t

from pratirakshak.io import load_config, write_json, write_parquet, write_text
from pratirakshak.settings import PROCESSED_DIR, REPORTS_DIR
from pratirakshak.sim.engine import POLICIES, POLICY_LABEL
from pratirakshak.sim.runner import init_worker, prepare_caches, run_one, single_threaded_env

OUT = PROCESSED_DIR / "results"
SCENARIOS = ["base", "surge", "strike", "supply", "weather"]
METRICS = ["ready_pct", "sortie_fill_pct", "unplanned_failures", "inflight_failures", "planned_hours", "unplanned_hours",
           "wasted_life_pct", "stockouts", "cost", "pulls", "verify_actions", "hangar_days", "sensor_fault_onsets"]
HIGHER_BETTER = {"ready_pct", "sortie_fill_pct"}
HEADLINE = ["ready_pct", "sortie_fill_pct", "unplanned_failures", "inflight_failures", "unplanned_hours", "wasted_life_pct", "cost"]
LABEL = {"ready_pct": "Ready aircraft (%)", "sortie_fill_pct": "Sorties flown / demanded (%)",
         "unplanned_failures": "Unplanned failures", "inflight_failures": "In-flight failures (mission aborts)",
         "planned_hours": "Planned downtime (h)", "unplanned_hours": "Unplanned downtime (h)", "wasted_life_pct": "Wasted life (%)",
         "stockouts": "Stockouts", "cost": "Cost (₵, ILLUSTRATIVE)", "pulls": "Pulls", "verify_actions": "Verify-sensor actions",
         "hangar_days": "Hangar days", "sensor_fault_onsets": "Sensor faults (onsets)"}


def jobs(seeds: int, sens_seeds: int, late: list[int]) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for sc in SCENARIOS:
        for pol in POLICIES:
            out += [("main", {"policy": pol, "scenario": sc, "seed": s}) for s in range(seeds)]
    for d in late:
        out += [(f"late{d}", {"policy": "P3", "scenario": "base", "seed": s, "detection_delay": d}) for s in range(seeds)]
    for tag, kw in (("no_trust", {"use_trust": False}), ("no_spares", {"spares_aware": False}), ("no_bundling", {"bundling": False})):
        out += [(tag, {"policy": "P3", "scenario": "base", "seed": s, **kw}) for s in range(seeds)]
    for scale in (0.5, 2.0):
        out += [(f"theta{scale}", {"policy": "P3", "scenario": "base", "seed": s, "theta_scale": scale}) for s in range(sens_seeds)]
    for pol in POLICIES:
        out += [("usage1.5", {"policy": pol, "scenario": "base", "seed": s, "usage_scale": 1.5}) for s in range(sens_seeds)]
        out += [("stock0.5", {"policy": pol, "scenario": "base", "seed": s, "stock_scale": 0.5}) for s in range(sens_seeds)]
    return out


def ci(values: list[float]) -> dict[str, float]:
    v = np.asarray(values, dtype=float)
    n = len(v)
    mean = float(v.mean())
    sd = float(v.std(ddof=1)) if n > 1 else 0.0
    half = float(student_t.ppf(0.975, n - 1) * sd / math.sqrt(n)) if n > 1 else 0.0
    return {"mean": round(mean, 3), "lo": round(mean - half, 3), "hi": round(mean + half, 3), "sd": round(sd, 3), "n": n}


def better(metric: str, a: float, b: float) -> bool:
    return a > b if metric in HIGHER_BETTER else a < b


def ablation_verdicts(ablation: dict[str, Any], names: dict[str, str]) -> list[str]:
    """Which of our 'unique' ideas measurably pay off (95 % intervals vs full P3); report honestly, caveat the rest."""
    full = ablation["full"]
    out = ["What each feature buys (vs full P3; 'no measurable effect' = 95 % intervals overlap):", ""]
    for k, v in ablation.items():
        if k == "full":
            continue
        parts = []
        for m in ("ready_pct", "unplanned_failures", "inflight_failures", "cost"):
            a, b = full[m], v[m]
            if a["hi"] < b["lo"] or b["hi"] < a["lo"]:
                d = a["mean"] - b["mean"]
                parts.append(f"{LABEL[m]} {d:+.1f} with the feature ({'better' if better(m, a['mean'], b['mean']) else 'worse'})")
        feature = names[k].replace("Without ", "")
        out.append(f"- **{feature}:** " + ("; ".join(parts) if parts else
                   "no measurable effect in this simulation — kept as a safeguard, claimed only as such."))
    return out


def report_only() -> int:
    """Rewrite reports/results.md from the saved JSONs (no re-simulation)."""
    from pratirakshak.io import read_json

    s = read_json(OUT / "summary.json")
    cf = read_json(OUT / "counterfactuals.json")
    write_text(REPORTS_DIR / "results.md", report(s["summary"], s["paired"], s["best_baseline"], read_json(OUT / "ablation.json"),
                                                  read_json(OUT / "sensitivity.json"), cf["late_detection"], cf["usage_2x"],
                                                  read_json(OUT / "demo.json"), s["seeds"], load_config("scenarios")))
    print("rewrote reports/results.md")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    # laptop-safe default: up to 6 workers (each ≈ 0.2 GB measured, single-threaded, below-normal priority)
    ap.add_argument("--workers", type=int, default=max(1, min(6, (os.cpu_count() or 2) // 3)))
    ap.add_argument("--seeds", type=int, default=None)
    ap.add_argument("--report-only", action="store_true", help="rewrite reports/results.md from saved results")
    args = ap.parse_args()
    if args.report_only:
        return report_only()
    cfg = load_config("scenarios")
    seeds = args.seeds or cfg["seeds"]
    sens = min(cfg["sensitivity_seeds"], seeds)
    late = cfg["late_detection_days"]

    single_threaded_env()  # children inherit 1 maths thread each
    prepare_caches()  # heavy pre-processing once, in this process; workers only read small caches
    todo = jobs(seeds, sens, late)
    t0 = time.time()
    print(f"running {len(todo)} simulations on {args.workers} workers …")
    with ProcessPoolExecutor(max_workers=args.workers, initializer=init_worker) as ex:
        results = list(ex.map(run_one, [o for _, o in todo], chunksize=2))
    print(f"  done in {time.time() - t0:.0f} s")
    for (tag, _), r in zip(todo, results, strict=True):
        r["tag"] = tag

    runs = pd.DataFrame([{"tag": r["tag"], "policy": r["policy"], "scenario": r["scenario"], "seed": r["seed"],
                          **{m: r[m] for m in METRICS}} for r in results])
    write_parquet(OUT / "runs.parquet", runs)

    # ---------------------------------------------------------------- main grid
    main_runs = [r for r in results if r["tag"] == "main"]
    summary: dict[str, Any] = {}
    curves: dict[str, Any] = {}
    best_baseline: dict[str, str] = {}
    for sc in SCENARIOS:
        summary[sc], curves[sc] = {}, {}
        for pol in POLICIES:
            rs = [r for r in main_runs if r["scenario"] == sc and r["policy"] == pol]
            summary[sc][pol] = {m: ci([r[m] for r in rs]) for m in METRICS}
            curves[sc][pol] = {"fleet": np.round(np.mean([r["ready_curve"] for r in rs], axis=0), 4).tolist(),
                               "by_base": {b: np.round(np.mean([r["ready_by_base"][b] for r in rs], axis=0), 4).tolist()
                                           for b in rs[0]["ready_by_base"]}}
        best_baseline[sc] = max(["P0", "P1", "P2"], key=lambda p: summary[sc][p]["ready_pct"]["mean"])

    # paired (same seed, common random numbers) P3 − best baseline
    paired: dict[str, Any] = {}
    for sc in SCENARIOS:
        bb = best_baseline[sc]
        paired[sc] = {"best_baseline": bb}
        for m in HEADLINE:
            diffs = [next(r[m] for r in main_runs if r["scenario"] == sc and r["policy"] == "P3" and r["seed"] == s)
                     - next(r[m] for r in main_runs if r["scenario"] == sc and r["policy"] == bb and r["seed"] == s)
                     for s in range(seeds)]
            paired[sc][m] = {**ci(diffs), "per_seed": [round(x, 3) for x in diffs]}

    # demo seed: base-scenario seed whose P3 − best-baseline availability gain is closest to the median
    gains = paired["base"]["ready_pct"]["per_seed"]
    med = float(np.median(gains))
    demo_seed = int(min(range(seeds), key=lambda s: (abs(gains[s] - med), s)))
    print(f"  demo seed {demo_seed} (gain {gains[demo_seed]:+.2f} pp; median {med:+.2f}; range {min(gains):+.2f}…{max(gains):+.2f})")

    # ---------------------------------------------------------------- variants
    def group(tag: str) -> list[dict[str, Any]]:
        return [r for r in results if r["tag"] == tag]

    p3_base = [r for r in main_runs if r["scenario"] == "base" and r["policy"] == "P3"]
    ablation = {"full": {m: ci([r[m] for r in p3_base]) for m in METRICS}}
    for tag in ("no_trust", "no_spares", "no_bundling"):
        ablation[tag] = {m: ci([r[m] for r in group(tag)]) for m in METRICS}

    sensitivity: dict[str, Any] = {"theta": {"1.0": {m: ci([r[m] for r in p3_base[:sens]]) for m in HEADLINE}}}
    for scale in (0.5, 2.0):
        sensitivity["theta"][str(scale)] = {m: ci([r[m] for r in group(f"theta{scale}")]) for m in HEADLINE}
    for tag, key in (("usage1.5", "usage"), ("stock0.5", "stock")):
        sensitivity[key] = {}
        for pol in POLICIES:
            base_runs = [r for r in main_runs if r["scenario"] == "base" and r["policy"] == pol and r["seed"] < sens]
            sensitivity[key][pol] = {"default": {m: ci([r[m] for r in base_runs]) for m in HEADLINE},
                                     "varied": {m: ci([r[m] for r in group(tag) if r["policy"] == pol]) for m in HEADLINE}}
    sensitivity["detection_delay"] = {"0": {m: ci([r[m] for r in p3_base]) for m in HEADLINE}}
    for d in late:
        sensitivity["detection_delay"][str(d)] = {m: ci([r[m] for r in group(f"late{d}")]) for m in HEADLINE}

    # ---------------------------------------------------------------- counterfactuals
    n_ac = 72
    late_cf: dict[str, Any] = {"fleet": {}}
    d0_curve = np.mean([r["ready_curve"] for r in p3_base], axis=0)
    for d in [0, *late]:
        rs = p3_base if d == 0 else group(f"late{d}")
        curve = np.mean([r["ready_curve"] for r in rs], axis=0)
        late_cf["fleet"][str(d)] = {"ready_curve": np.round(curve, 4).tolist(),
                                    "cumulative_gap_aircraft_days": np.round(np.cumsum((d0_curve - curve) * n_ac), 2).tolist(),
                                    "unplanned_failures": ci([r["unplanned_failures"] for r in rs]),
                                    "inflight_failures": ci([r["inflight_failures"] for r in rs])}
    usage_cf: dict[str, Any] = {}
    for pol in ("P0", "P3"):
        usage_cf[pol] = {}
        for sc in ("base", "surge"):
            rs = [r for r in main_runs if r["scenario"] == sc and r["policy"] == pol]
            usage_cf[pol][sc] = {"damage_curve": np.round(np.mean([r["damage_curve"] for r in rs], axis=0), 4).tolist(),
                                 "visits": ci([r["visits"] for r in rs]), "hangar_days": ci([r["hangar_days"] for r in rs]),
                                 "planned_hours": ci([r["planned_hours"] for r in rs]),
                                 "unplanned_failures": ci([r["unplanned_failures"] for r in rs]),
                                 "sensor_fault_onsets": ci([r["sensor_fault_onsets"] for r in rs]),
                                 "verify_actions": ci([r["verify_actions"] for r in rs])}

    # demo-seed event logs (per-aircraft timelines for S6/S8) — re-run 6 sims with logging
    demo_jobs = [{"policy": p, "scenario": "base", "seed": demo_seed, "log_events": True} for p in POLICIES]
    demo_jobs += [{"policy": "P3", "scenario": "base", "seed": demo_seed, "detection_delay": d, "log_events": True} for d in late]
    with ProcessPoolExecutor(max_workers=min(args.workers, len(demo_jobs)), initializer=init_worker) as ex:
        demo_runs = list(ex.map(run_one, demo_jobs))
    demo = {"seed": demo_seed, "rule": "base-scenario seed whose P3 − best-baseline ready-% gain is closest to the median",
            "gains_by_seed": gains, "median_gain": round(med, 3), "best_baseline": best_baseline["base"], "runs": {}}
    for r in demo_runs:
        key = r["policy"] if r["options"]["detection_delay"] == 0 else f"P3_late{r['options']['detection_delay']}"
        demo["runs"][key] = {m: r[m] for m in METRICS} | {"events": r["events"], "ready_curve": r["ready_curve"],
                                                         "ready_by_base": r["ready_by_base"], "hangar_by_base": r["hangar_by_base"]}

    # ---------------------------------------------------------------- write
    write_json(OUT / "summary.json", {"provenance": "SIMULATED", "seeds": seeds, "scenarios": {s: cfg["scenarios"][s]["label"] for s in SCENARIOS},
                                      "policies": POLICY_LABEL, "best_baseline": best_baseline, "summary": summary, "paired": paired,
                                      "demo_seed": demo_seed})
    write_json(OUT / "curves.json", curves)
    write_json(OUT / "ablation.json", ablation)
    write_json(OUT / "sensitivity.json", sensitivity)
    write_json(OUT / "counterfactuals.json", {"late_detection": late_cf, "usage_2x": usage_cf})
    write_json(OUT / "demo.json", demo)
    write_text(REPORTS_DIR / "results.md", report(summary, paired, best_baseline, ablation, sensitivity, late_cf, usage_cf,
                                                  demo, seeds, cfg))
    print("\n" + table_text(summary, best_baseline))
    return 0


# ==================================================================================== report
def fmt(c: dict[str, float], digits: int = 1) -> str:
    return f"{c['mean']:.{digits}f} [{c['lo']:.{digits}f}, {c['hi']:.{digits}f}]"


def table_text(summary: dict[str, Any], best: dict[str, str]) -> str:
    rows = ["| Scenario | Metric | " + " | ".join(f"{p} {POLICY_LABEL[p]}" for p in POLICIES) + " |",
            "|---|---|" + "---|" * len(POLICIES)]
    for sc, by_pol in summary.items():
        for m in HEADLINE:
            d = 0 if m in ("unplanned_failures", "inflight_failures", "cost", "unplanned_hours") else 1
            rows.append(f"| {sc} | {LABEL[m]} | " + " | ".join(fmt(by_pol[p][m], d) for p in POLICIES) + " |")
    return "\n".join(rows)


def report(summary: dict[str, Any], paired: dict[str, Any], best: dict[str, str], ablation: dict[str, Any],
           sensitivity: dict[str, Any], late_cf: dict[str, Any], usage_cf: dict[str, Any], demo: dict[str, Any],
           seeds: int, cfg: dict[str, Any]) -> str:
    L = ["# Results — fleet simulation  `SIMULATED`", "",
         f"_Generated by `python -m pratirakshak.sim`. 90-day horizon, {seeds} seeds per policy × scenario, common random numbers "
         "(identical sorties, wear increments, sensor noise and sensor faults across policies for a given seed). Mean with 95 % "
         "t-interval across seeds. Engines replay REAL C-MAPSS trajectories; the other seven systems, the fleet, costs (₵) and "
         "scenarios are SIMULATED / ILLUSTRATIVE._", "",
         "Policies: **P0** run-to-failure · **P1** fixed interval (the fleet's existing practice) · **P2** raw-sensor threshold alarms "
         "(condition-corrected limits, 7-day cooldown) · **P3** Pratirakshak (calibrated RUL risk → rule → spares-aware, bundled plan). "
         "One fair setting per baseline, no tuning loop.", "",
         "## 1. Outcomes by scenario", "", table_text(summary, best), "",
         "## 2. Paired difference: P3 − best baseline (same seed)", "",
         "| Scenario | Best baseline (by ready %) | " + " | ".join(LABEL[m] for m in HEADLINE) + " |",
         "|---|---|" + "---|" * len(HEADLINE)]
    for sc, p in paired.items():
        L.append(f"| {sc} | {p['best_baseline']} {POLICY_LABEL[p['best_baseline']]} | "
                 + " | ".join(f"{p[m]['mean']:+.1f} [{p[m]['lo']:+.1f}, {p[m]['hi']:+.1f}]" for m in HEADLINE) + " |")
    L += ["", "## 3. Demo seed (shown in the video and screenshots)", "",
          f"Seed **{demo['seed']}**, chosen objectively: {demo['rule']}. Ready-% gain per seed: "
          + ", ".join(f"{g:+.2f}" for g in demo["gains_by_seed"]) + f" (median {demo['median_gain']:+.2f}). "
          "This run is typical, not the best.", "",
          "## 4. Where Pratirakshak does NOT help (computed, not hand-picked)", ""]
    notes = []
    for sc, p in paired.items():
        for m in HEADLINE:
            c = p[m]
            worse = (c["lo"] > 0) if m not in HIGHER_BETTER else (c["hi"] < 0)
            tie = c["lo"] <= 0 <= c["hi"]
            if worse:
                notes.append(f"- **{sc} · {LABEL[m]}:** P3 is worse than {POLICY_LABEL[p['best_baseline']]} ({c['mean']:+.1f}, CI "
                             f"[{c['lo']:+.1f}, {c['hi']:+.1f}]).")
            elif tie and m in ("ready_pct", "cost", "wasted_life_pct"):
                notes.append(f"- **{sc} · {LABEL[m]}:** no clear difference from {POLICY_LABEL[p['best_baseline']]} "
                             f"({c['mean']:+.1f}, CI [{c['lo']:+.1f}, {c['hi']:+.1f}]).")
    L += notes or ["- No headline metric where P3 is clearly worse than the best baseline."]
    L += ["- Pratirakshak replaces parts earlier than strictly necessary (wasted life is not zero) and generates more "
          "planned hangar visits than run-to-failure; that is the price of avoiding in-service failures.",
          "- All non-engine systems and their failure physics are synthetic; the gains are evidence about the *decision logic* "
          "under a plausible model, not a forecast for a real fleet.", "",
          "## 5. Ablations (P3, base scenario)", "", "| Variant | " + " | ".join(LABEL[m] for m in HEADLINE) + " |",
          "|---|" + "---|" * len(HEADLINE)]
    names = {"full": "Full P3", "no_trust": "Without sensor trust", "no_spares": "Without spares-awareness", "no_bundling": "Without bundling"}
    for k, v in ablation.items():
        L.append(f"| {names[k]} | " + " | ".join(fmt(v[m]) for m in HEADLINE) + " |")
    L += ["", *ablation_verdicts(ablation, names)]
    L += ["", "## 6. Sensitivity (P3 unless stated)", "", "| Setting | " + " | ".join(LABEL[m] for m in HEADLINE) + " |",
          "|---|" + "---|" * len(HEADLINE)]
    for k, v in sensitivity["theta"].items():
        L.append(f"| θ × {k} | " + " | ".join(fmt(v[m]) for m in HEADLINE) + " |")
    for k, v in sensitivity["detection_delay"].items():
        L.append(f"| detection delay {k} d | " + " | ".join(fmt(v[m]) for m in HEADLINE) + " |")
    for key, lab in (("usage", "usage × 1.5"), ("stock", "stock × 0.5")):
        for pol in POLICIES:
            v = sensitivity[key][pol]["varied"]
            L.append(f"| {lab} · {pol} | " + " | ".join(fmt(v[m]) for m in HEADLINE) + " |")
    lf = late_cf["fleet"]

    def gap(d: str) -> str:
        g = lf[d]["cumulative_gap_aircraft_days"][-1]
        return f"{abs(g):.0f} aircraft-days {'lost' if g > 0 else 'gained'}"

    L += ["", "## 7. Counterfactuals", "",
          f"- **Late detection** (sensor data arrives d days late and is treated as current): unplanned failures "
          f"{lf['0']['unplanned_failures']['mean']:.1f} → {lf['1']['unplanned_failures']['mean']:.1f} (1 d) → "
          f"{lf['3']['unplanned_failures']['mean']:.1f} (3 d) → {lf['7']['unplanned_failures']['mean']:.1f} (7 d); in-flight failures "
          f"{lf['0']['inflight_failures']['mean']:.1f} → {lf['7']['inflight_failures']['mean']:.1f} (7 d). Availability over the 90 days: "
          f"{gap('3')} at 3 d, {gap('7')} at 7 d. Acting later also means fewer, later hangar visits, and some deferred work falls "
          "beyond the 90-day horizon, which flatters availability; the failure counts are the honest cost of late detection.",
          f"- **2× usage:** under P3 hangar days {usage_cf['P3']['base']['hangar_days']['mean']:.0f} → "
          f"{usage_cf['P3']['surge']['hangar_days']['mean']:.0f}; sensor faults {usage_cf['P3']['base']['sensor_fault_onsets']['mean']:.0f} → "
          f"{usage_cf['P3']['surge']['sensor_fault_onsets']['mean']:.0f}; verify-sensor actions "
          f"{usage_cf['P3']['base']['verify_actions']['mean']:.0f} → {usage_cf['P3']['surge']['verify_actions']['mean']:.0f}. "
          f"Under P0 unplanned failures {usage_cf['P0']['base']['unplanned_failures']['mean']:.0f} → "
          f"{usage_cf['P0']['surge']['unplanned_failures']['mean']:.0f}.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
