"""No leakage in pre-processing: scalers/clusterers see train units only (SPEC §0.6)."""

import pytest

from pratirakshak.ingest.cmapss import cmapss_dir
from pratirakshak.ingest.splits import load_splits
from pratirakshak.models.engine_data import prepare

try:
    cmapss_dir()
    HAVE_DATA = True
except FileNotFoundError:
    HAVE_DATA = False

needs_data = pytest.mark.skipif(not HAVE_DATA, reason="C-MAPSS files not present (run fetch)")


@needs_data
@pytest.mark.parametrize("subset", ["FD001", "FD002"])
def test_normaliser_fitted_on_train_units_only(subset: str) -> None:
    sp = load_splits()[subset]
    p = prepare(subset)
    assert p.norm.fit_units == sorted(sp["train"])
    assert not set(p.norm.fit_units) & (set(sp["val"]) | set(sp["replay"]))
    assert set(p.train.unit.tolist()) == set(sp["train"])
    assert set(p.val_cal.unit.tolist()) == set(sp["val"])
