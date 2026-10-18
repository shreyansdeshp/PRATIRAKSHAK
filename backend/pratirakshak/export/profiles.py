"""Elevation profiles along the cached road routes (SPEC §11.3: elevation strip under the spares map).

Each road route is resampled every ~2 km and sampled from AWS Terrain Tiles (Terrarium encoding, zoom 8 ≈ 600 m/px).
Tiles are cached in data/raw/terrarium/z8 (gitignored); the result is a small JSON in the snapshot, so the UI needs
no network for it. REAL-ANCHORED (DEM elevations along OSM-derived road geometry).
"""

from __future__ import annotations

import io
import math
import time
from typing import Any

import numpy as np
import requests
from PIL import Image

from pratirakshak.io import read_json
from pratirakshak.settings import RAW_DIR, ROUTES_DIR

Z = 8
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CACHE = RAW_DIR / "terrarium" / f"z{Z}"
UA = {"User-Agent": "pratirakshak-sih26249/0.1 (student project)"}
STEP_KM = 2.0


def _hav(a: list[float], b: list[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


class Dem:
    def __init__(self) -> None:
        self.tiles: dict[tuple[int, int], np.ndarray] = {}

    def tile(self, x: int, y: int) -> np.ndarray:
        if (x, y) not in self.tiles:
            path = CACHE / f"{x}_{y}.png"
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                r = requests.get(TERRARIUM.format(z=Z, x=x, y=y), headers=UA, timeout=60)
                r.raise_for_status()
                path.write_bytes(r.content)
                time.sleep(0.05)
            a = np.asarray(Image.open(io.BytesIO(path.read_bytes())).convert("RGB"), dtype=np.float32)
            self.tiles[(x, y)] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
        return self.tiles[(x, y)]

    def elevation(self, lon: float, lat: float) -> float:
        n = 2**Z
        fx = (lon + 180) / 360 * n
        r = math.radians(lat)
        fy = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n
        tx, ty = int(fx), int(fy)
        px, py = min(255, int((fx - tx) * 256)), min(255, int((fy - ty) * 256))
        return float(self.tile(tx, ty)[py, px])


def resample(coords: list[list[float]]) -> tuple[list[float], list[list[float]]]:
    out_d, out_p = [0.0], [coords[0]]
    acc, next_at = 0.0, STEP_KM
    for a, b in zip(coords, coords[1:], strict=False):
        seg = _hav(a, b)
        while seg > 0 and acc + seg >= next_at:
            t = (next_at - acc) / seg
            out_p.append([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
            out_d.append(next_at)
            next_at += STEP_KM
        acc += seg
    out_p.append(coords[-1])
    out_d.append(acc)
    return out_d, out_p


def build_profiles() -> dict[str, Any]:
    dem = Dem()
    out: dict[str, Any] = {}
    for path in sorted((ROUTES_DIR / "road").glob("*.geojson")):
        feat = read_json(path)
        dist, pts = resample(feat["geometry"]["coordinates"])
        elev = [max(0.0, dem.elevation(lon, lat)) for lon, lat in pts]
        k = int(np.argmax(elev))
        rid = f"road:{feat['properties']['from']}-{feat['properties']['to']}"
        out[rid] = {"distance_km": [round(x, 1) for x in dist], "elevation_m": [round(e) for e in elev],
                    "max_m": round(elev[k]), "max_at_km": round(dist[k], 1), "length_km": round(dist[-1], 1)}
    # airlift legs: the straight flight line between the two nodes, same sampling (terrain under the flight path)
    import pandas as pd
    from pratirakshak.settings import PROCESSED_DIR
    nodes = pd.read_parquet(PROCESSED_DIR / "world" / "nodes.parquet").set_index("id")
    routes = pd.read_parquet(PROCESSED_DIR / "world" / "routes.parquet")
    for _, r in routes[routes["mode"] == "air"].iterrows():
        a, b = nodes.loc[r["from_node"]], nodes.loc[r["to_node"]]
        dist, pts = resample([[float(a["lon"]), float(a["lat"])], [float(b["lon"]), float(b["lat"])]])
        elev = [max(0.0, dem.elevation(lon, lat)) for lon, lat in pts]
        k = int(np.argmax(elev))
        out[r["id"]] = {"distance_km": [round(x, 1) for x in dist], "elevation_m": [round(e) for e in elev],
                        "max_m": round(elev[k]), "max_at_km": round(dist[k], 1), "length_km": round(dist[-1], 1)}
    return {"provenance": "REAL-ANCHORED", "source": "AWS Terrain Tiles (Terrarium, z8) sampled every 2 km along cached OSRM road geometry and along straight airlift flight lines",
            "routes": out}
