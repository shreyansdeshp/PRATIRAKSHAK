"""Global settings: the one seed and repository paths.

Every generator, split and simulation takes its randomness from SEED (or a
seed derived from it with `derive_seed`) so the same command gives the same bytes.
"""

from __future__ import annotations

import hashlib
import os
import random
from pathlib import Path

import numpy as np

SEED = 26249

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
CMAPSS_DIR = RAW_DIR / "cmapss"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
ROUTES_DIR = DATA_DIR / "routes"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
DOCS_DIR = ROOT / "docs"
FRONTEND_DATA_DIR = ROOT / "frontend" / "public" / "data"


def derive_seed(*parts: object, base: int = SEED) -> int:
    """Stable child seed from a name path, e.g. derive_seed("synth", "PR-G207")."""
    key = "/".join([str(base), *map(str, parts)]).encode()
    return int.from_bytes(hashlib.sha256(key).digest()[:4], "little")


def seed_everything(seed: int = SEED) -> np.random.Generator:
    """Seed python, numpy and (if installed) torch; return a numpy Generator."""
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        torch.use_deterministic_algorithms(True, warn_only=True)
    except ImportError:
        pass
    return np.random.default_rng(seed)
