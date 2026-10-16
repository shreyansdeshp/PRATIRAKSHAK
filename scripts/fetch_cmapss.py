"""Fetch and verify NASA C-MAPSS (SPEC §6.1). Raw data is never committed.

    python scripts/fetch_cmapss.py                   # verify local files; download only if absent
    python scripts/fetch_cmapss.py --write-manifest  # (maintainer) record sha256 of the local copy

Files may sit in data/raw/cmapss/ or in the zip's nested data/raw/cmapss/CMAPSSData/.
The mirror zip contains a nested CMAPSSData.zip; extraction handles both levels and rejects unsafe paths.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "raw" / "cmapss"
MANIFEST = Path(__file__).with_name("cmapss_sha256.json")
URL = "https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip"
FILES = [f"{kind}_FD00{i}.txt" for kind in ("train", "test", "RUL") for i in range(1, 5)] + ["readme.txt"]


def locate() -> Path | None:
    for cand in (DEST, DEST / "CMAPSSData"):
        if all((cand / f).exists() for f in FILES):
            return cand
    return None


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def extract(data: bytes, out: Path) -> None:
    """Extract wanted files from a (possibly nested) zip without trusting member paths."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            name = Path(info.filename).name
            if info.filename.lower().endswith(".zip"):
                extract(zf.read(info), out)
            elif name in FILES or name.endswith(".pdf"):
                (out / name).write_bytes(zf.read(info))  # flat write: no path traversal possible


def download() -> Path:
    import requests

    print(f"downloading {URL} …")
    r = requests.get(URL, timeout=300)
    r.raise_for_status()
    out = DEST / "CMAPSSData"
    out.mkdir(parents=True, exist_ok=True)
    extract(r.content, out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write-manifest", action="store_true")
    args = ap.parse_args()

    src = locate()
    if src is None:
        src = download()
    print(f"C-MAPSS folder: {src.relative_to(ROOT)}")

    digests = {f: sha256(src / f) for f in FILES}
    if args.write_manifest:
        MANIFEST.write_text(json.dumps(digests, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {MANIFEST.relative_to(ROOT)}")
        return 0

    expected = json.loads(MANIFEST.read_text(encoding="utf-8"))
    bad = [f for f in FILES if digests[f] != expected.get(f)]
    for f in FILES:
        print(f"  {'ok ' if f not in bad else 'BAD'} {f}")
    if bad:
        print(f"checksum mismatch: {bad}")
        return 1
    print("all files verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
