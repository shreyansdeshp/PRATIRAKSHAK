"""Headline-chart data (Results > Headline): cumulative unplanned failures per day and life used at replacement,
base scenario, every policy, every seed. Same engine and seeds as the main grid, so it agrees with the summary numbers."""

from __future__ import annotations

import argparse
import os
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from pratirakshak.io import load_config, write_json
from pratirakshak.settings import PROCESSED_DIR
from pratirakshak.sim.engine import POLICIES
from pratirakshak.sim.runner import init_worker, prepare_caches, run_one, single_threaded_env

OUT = PROCESSED_DIR / "results"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    seeds = load_config("scenarios")["seeds"]
    single_threaded_env()
    prepare_caches()
    todo = [{"policy": p, "scenario": "base", "seed": s} for p in POLICIES for s in range(seeds)]
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=args.workers, initializer=init_worker) as ex:
        res = list(ex.map(run_one, todo, chunksize=1))
    print(f"{len(todo)} runs in {time.time() - t0:.0f} s")
    out: dict = {"provenance": "SIMULATED", "seeds": seeds, "policies": {}}
    for p in POLICIES:
        rs = [r for r in res if r["policy"] == p]
        fc = np.array([r["fail_curve"] for r in rs], dtype=float)
        life = [x for r in rs for x in r["life_used"]]
        out["policies"][p] = {"mean": np.round(fc.mean(0), 2).tolist(), "min": fc.min(0).tolist(), "max": fc.max(0).tolist(),
                              "final": float(fc[:, -1].mean()), "life_used": [round(x, 3) for x in life],
                              "life_median": round(float(np.median(life)), 3) if life else None}
    write_json(OUT / "headline.json", out)
    print({p: (v["final"], v["life_median"], len(v["life_used"])) for p, v in out["policies"].items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
