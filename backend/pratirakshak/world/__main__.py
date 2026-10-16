"""Stage 2 — `./tasks.ps1 world` / `make world` / `python -m pratirakshak.world`."""

from __future__ import annotations

import sys
from collections import Counter

import pandas as pd

from pratirakshak.settings import ROOT, ROUTES_DIR
from pratirakshak.world.generate import OUT, build


def main() -> int:
    w, clim_src = build()

    print("Fleet by base × type")
    tab = pd.crosstab(pd.Series([a.base for a in w.aircraft], name="base"),
                      pd.Series([a.type for a in w.aircraft], name="type"), margins=True, margins_name="total")
    print(tab.to_string())
    per_base_types = {b: sorted({a.type for a in w.aircraft if a.base == b}) for b in tab.index if b != "total"}
    print("types per base:", {b: len(t) for b, t in per_base_types.items()},
          "→ every base ≥3 types:", all(len(t) >= 3 for t in per_base_types.values()))
    print("sample tails:", ", ".join(a.tail for a in w.aircraft[:4]), "…")

    print("\nBase elevations (Open-Meteo 90 m DEM):",
          {b.id: f"{b.elevation_m:.0f} m" for b in w.bases})
    print("Climate source:", clim_src)

    src = Counter((r.mode, r.source) for r in w.routes)
    road_files = sorted((ROUTES_DIR / "road").glob("*.geojson"))
    print(f"\nRoutes: {len(w.routes)} ({dict(src)}); cached road GeoJSON files: {len(road_files)}; "
          f"air.geojson: {(ROUTES_DIR / 'air.geojson').exists()}")
    him = [r for r in w.routes if r.mode == "road" and r.seasonal_closure is not None]
    print(f"Seasonal-closure road routes (HIM): {len(him)}")
    nearest = sorted((r for r in w.routes if r.mode == "road" and "HIM" in (r.from_node, r.to_node)),
                     key=lambda r: r.minutes)[:3]
    print("HIM nearest by road:", [(r.id, f"{r.distance_km:.0f} km", f"{r.minutes / 60:.1f} h") for r in nearest])

    print(f"\nParts: {len(w.parts)} · stock rows: {len(w.stock)} · missions: {len(w.missions)} · "
          f"environment rows: {len(w.environment) if w.environment is not None else 0}")
    print(f"wrote {OUT.relative_to(ROOT).as_posix()}/ ({len(list(OUT.glob('*')))} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
