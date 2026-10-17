"""Stage 8 — `./tasks.ps1 export` / `make export` / `python -m pratirakshak.export`."""

from __future__ import annotations

import sys

from pratirakshak.export.build import build_all


def main() -> int:
    res = build_all()
    for f in sorted(res["files"], key=lambda x: -x["bytes"])[:14]:
        print(f"  {f['bytes'] / 1024:9.1f} KB  {f['path']}")
    total = res["total_bytes"] / 2**20
    print(f"snapshot: {len(res['files'])} files, {total:.2f} MB (limit 25 MB) → frontend/public/data/")
    if total > 25:
        print("ERROR: snapshot over 25 MB")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
