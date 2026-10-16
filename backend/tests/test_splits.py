"""No leakage: every C-MAPSS train-file engine lands in exactly one of train / val / replay (SPEC §0.6, §6.3)."""

import pytest

from pratirakshak.ingest.cmapss import SUBSETS, cmapss_dir, lifetimes, load_subset
from pratirakshak.ingest.splits import SPLITS_PATH, load_splits, make_splits

try:
    cmapss_dir()
    HAVE_DATA = True
except FileNotFoundError:
    HAVE_DATA = False

needs_data = pytest.mark.skipif(not HAVE_DATA, reason="C-MAPSS files not present (run fetch)")


@needs_data
@pytest.mark.parametrize("subset", SUBSETS)
def test_splits_are_unit_disjoint_and_complete(subset: str) -> None:
    life = lifetimes(load_subset(subset).train)
    sp = make_splits(subset, life)
    train, val, replay = set(sp["train"]), set(sp["val"]), set(sp["replay"])
    assert not (train & val) and not (train & replay) and not (val & replay)
    assert train | val | replay == set(int(u) for u in life.index)
    assert sp == make_splits(subset, life)  # deterministic


@needs_data
def test_saved_splits_match_generator() -> None:
    if not SPLITS_PATH.exists():
        pytest.skip("run `python -m pratirakshak.ingest` first")
    saved = load_splits()
    for subset in SUBSETS:
        assert saved[subset] == make_splits(subset, lifetimes(load_subset(subset).train))
