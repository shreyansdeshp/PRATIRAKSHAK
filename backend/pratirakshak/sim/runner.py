"""Process-level setup for simulation runs (shared data loaded once per worker process).

Laptop-safe by design: heavy pre-processing happens once in the parent and is cached to data/interim/; workers load
small pickles, run single-threaded maths, and lower their own priority so the machine stays responsive.
"""

from __future__ import annotations

import os
import pickle
import sys
from dataclasses import asdict
from typing import Any

from pratirakshak.intelligence.trust import GroupRelation
from pratirakshak.io import load_config
from pratirakshak.settings import INTERIM_DIR

REL_CACHE = INTERIM_DIR / "trust_relations.pkl"
ENGINE_CACHE = INTERIM_DIR / "sim_engine_cache.pkl"
THREAD_VARS = ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS")
_DATA: Any = None


def single_threaded_env() -> None:
    """Call in the parent BEFORE starting workers: children inherit one maths thread each (no oversubscription)."""
    for v in THREAD_VARS:
        os.environ[v] = "1"


def lower_priority() -> None:
    if sys.platform == "win32":
        import ctypes

        BELOW_NORMAL = 0x00004000
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), BELOW_NORMAL)
    else:
        try:
            os.nice(10)
        except OSError:
            pass


def _cached(path: Any, build: Any) -> Any:
    if path.exists():
        with path.open("rb") as fh:
            return pickle.load(fh)
    obj = build()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        pickle.dump(obj, fh, protocol=pickle.HIGHEST_PROTOCOL)
    return obj


def relations() -> dict[str, GroupRelation]:
    """System trust relations (fitted on fault-free synthetic data, Stage 5), cached locally."""
    def build() -> dict[str, GroupRelation]:
        from pratirakshak.intelligence.harness import fit_system_relations
        from pratirakshak.synth.model import SynthModel

        return fit_system_relations(SynthModel(), load_config("intelligence")["trust"])

    return _cached(REL_CACHE, build)


def engine_cache() -> dict[str, Any]:
    from pratirakshak.sim.engine import build_engine_cache

    return _cached(ENGINE_CACHE, build_engine_cache)


def prepare_caches() -> None:
    """Parent process: build both caches once so workers only read them."""
    relations()
    engine_cache()


def init_worker() -> None:
    global _DATA
    lower_priority()
    from pratirakshak.sim.engine import load_sim_data

    _DATA = load_sim_data(relations(), engine_cache())


def run_one(opt_dict: dict[str, Any]) -> dict[str, Any]:
    from pratirakshak.sim.engine import RunOptions, Simulator

    if _DATA is None:
        init_worker()
    opt = RunOptions(**opt_dict)
    res = Simulator(_DATA, opt).run()
    res["options"] = asdict(opt)
    return res
