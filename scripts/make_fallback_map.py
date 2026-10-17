"""Offline fallback map assets (SPEC §11.3): Natural Earth vectors + a pre-rendered hillshade for India.

    python scripts/make_fallback_map.py

Downloads (once, into data/raw/naturalearth and data/raw/terrarium — gitignored), then writes small, simplified files to
frontend/public/fallback-map/: land, countries, india_states, rivers (GeoJSON) and hillshade.png + hillshade.json.
Natural Earth: public domain. Terrain Tiles (AWS Open Data, Terrarium encoding): attribution in CREDITS.md.
"""

from __future__ import annotations

import io
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW_NE = ROOT / "data" / "raw" / "naturalearth"
RAW_DEM = ROOT / "data" / "raw" / "terrarium"
OUT = ROOT / "frontend" / "public" / "fallback-map"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
UA = {"User-Agent": "pratirakshak-sih26249/0.1 (student project)"}
BBOX = (58.0, 2.0, 102.0, 40.0)        # lon_min, lat_min, lon_max, lat_max kept in the vectors
DEM_BBOX = (54.0, 4.0, 104.0, 40.0)    # hillshade extent (covers the full hero map frame)
DEM_Z = 6


def fetch(url: str, path: Path) -> bytes:
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, headers=UA, timeout=120)
    r.raise_for_status()
    path.write_bytes(r.content)
    time.sleep(0.2)
    return r.content


def rdp(pts: list[list[float]], eps: float) -> list[list[float]]:
    if len(pts) < 4:
        return pts
    a = np.asarray(pts, dtype=float)
    keep = np.zeros(len(a), dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, len(a) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        seg = a[j] - a[i]
        n = math.hypot(*seg)
        rel = a[i + 1 : j] - a[i]
        d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / n if n else np.hypot(rel[:, 0], rel[:, 1])
        k = int(np.argmax(d))
        if d[k] > eps:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return [[round(x, 4), round(y, 4)] for x, y in a[keep]]


def bbox_of(coords: object) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []

    def walk(c: object) -> None:
        if isinstance(c, list) and c and isinstance(c[0], int | float):
            xs.append(float(c[0]))
            ys.append(float(c[1]))
        elif isinstance(c, list):
            for x in c:
                walk(x)

    walk(coords)
    if not xs:
        return (1e9, 1e9, 1e9, 1e9)  # empty geometry → never intersects
    return min(xs), min(ys), max(xs), max(ys)


def simplify_geom(g: dict, eps: float) -> dict | None:
    t = g["type"]
    if t == "Polygon":
        rings = [r for r in (rdp(ring, eps) for ring in g["coordinates"]) if len(r) >= 4]
        return {"type": t, "coordinates": rings} if rings else None
    if t == "MultiPolygon":
        polys = []
        for poly in g["coordinates"]:
            rings = [r for r in (rdp(ring, eps) for ring in poly) if len(r) >= 4]
            if rings:
                polys.append(rings)
        return {"type": t, "coordinates": polys} if polys else None
    if t == "LineString":
        return {"type": t, "coordinates": rdp(g["coordinates"], eps)}
    if t == "MultiLineString":
        return {"type": t, "coordinates": [rdp(line, eps) for line in g["coordinates"]]}
    return g


def intersects(b: tuple[float, float, float, float]) -> bool:
    return not (b[2] < BBOX[0] or b[0] > BBOX[2] or b[3] < BBOX[1] or b[1] > BBOX[3])


def vectors() -> dict[str, int]:
    sizes = {}
    specs = {
        "land": ("ne_50m_land.geojson", 0.02, None, []),
        "countries": ("ne_50m_admin_0_countries.geojson", 0.02, None, ["NAME", "ADM0_A3"]),
        "india_states": ("ne_10m_admin_1_states_provinces.geojson", 0.015, ("adm0_a3", "IND"), ["name"]),
        "rivers": ("ne_50m_rivers_lake_centerlines.geojson", 0.02, None, ["name", "scalerank"]),
    }
    for out_name, (fname, eps, filt, props) in specs.items():
        data = json.loads(fetch(NE + fname, RAW_NE / fname))
        feats = []
        for f in data["features"]:
            if filt and str(f["properties"].get(filt[0])) != filt[1]:
                continue
            if f["geometry"] is None or not intersects(bbox_of(f["geometry"]["coordinates"])):
                continue
            g = simplify_geom(f["geometry"], eps)
            if g is None:
                continue
            feats.append({"type": "Feature", "properties": {p.lower(): f["properties"].get(p) for p in props}, "geometry": g})
        OUT.mkdir(parents=True, exist_ok=True)
        text = json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":"))
        (OUT / f"{out_name}.geojson").write_text(text, encoding="utf-8", newline="\n")
        sizes[out_name] = len(text)
    return sizes


# ------------------------------------------------------------------------------------------ hillshade
def lon2x(lon: float, z: int) -> float:
    return (lon + 180) / 360 * 2**z


def lat2y(lat: float, z: int) -> float:
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**z


def x2lon(x: float, z: int) -> float:
    return x / 2**z * 360 - 180


def y2lat(y: float, z: int) -> float:
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2**z))))


def hillshade() -> dict[str, object]:
    z = DEM_Z
    x0, x1 = int(lon2x(DEM_BBOX[0], z)), int(lon2x(DEM_BBOX[2], z))
    y0, y1 = int(lat2y(DEM_BBOX[3], z)), int(lat2y(DEM_BBOX[1], z))
    W, H = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    elev = np.zeros((H, W), dtype=np.float32)
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            png = fetch(TERRARIUM.format(z=z, x=tx, y=ty), RAW_DEM / f"{z}_{tx}_{ty}.png")
            a = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"), dtype=np.float32)
            e = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
            elev[(ty - y0) * 256 : (ty - y0 + 1) * 256, (tx - x0) * 256 : (tx - x0 + 1) * 256] = e
    lat_rows = np.array([y2lat(y0 + (i + 0.5) / 256, z) for i in range(H)])
    px = 40075016.686 * np.cos(np.radians(lat_rows))[:, None] / (256 * 2**z)  # metres per pixel (x), per row
    dzdx = np.gradient(elev, axis=1) / px
    dzdy = np.gradient(elev, axis=0) / px
    slope = np.arctan(np.hypot(dzdx, dzdy) * 1.6)      # mild vertical exaggeration for a small-scale map
    aspect = np.arctan2(-dzdx, dzdy)
    az, alt = math.radians(315), math.radians(45)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shadow = np.clip((0.82 - shade) * 1.05, 0, 0.62)
    light = np.clip((shade - 0.9) * 2.0, 0, 0.25)
    land = elev > 0
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    ink, paper = np.array([58, 50, 38]), np.array([252, 249, 240])
    alpha = np.where(land, np.maximum(shadow, light), 0)
    col = np.where((shadow >= light)[..., None], ink, paper)
    rgba[..., :3] = col
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    img = img.resize((W * 3 // 4, H * 3 // 4), Image.LANCZOS)
    img.save(OUT / "hillshade.png", optimize=True)
    w, n, e, s = x2lon(x0, z), y2lat(y0, z), x2lon(x1 + 1, z), y2lat(y1 + 1, z)
    meta = {"coordinates": [[w, n], [e, n], [e, s], [w, s]], "zoom": z, "tiles": (x1 - x0 + 1) * (y1 - y0 + 1),
            "source": "AWS Terrain Tiles (Terrarium)", "accessed": "2026-10-17"}
    for target in (OUT / "hillshade.json", ROOT / "frontend" / "src" / "map" / "hillshade.json"):  # style.ts imports the bounds
        target.write_text(json.dumps(meta, indent=1), encoding="utf-8", newline="\n")
    return {"png_bytes": (OUT / "hillshade.png").stat().st_size, **meta}


def main() -> int:
    sizes = vectors()
    hs = hillshade()
    print("vectors (bytes):", sizes)
    print("hillshade:", {k: hs[k] for k in ("png_bytes", "tiles", "zoom")})
    return 0


if __name__ == "__main__":
    sys.exit(main())
