"""Logistics routes between nodes (SPEC §9.4). Precomputed once, cached; no runtime routing dependency.

Road: OSRM public demo server (≤ 1 request/s, non-commercial; © OpenStreetMap contributors, ODbL),
geometry simplified (Ramer–Douglas–Peucker) and cached to data/routes/road/<A>-<B>.geojson (committed).
If OSRM is unreachable and no cache exists, a great-circle × detour fallback is used and labelled `fallback`.
Air: great circle at the airlift type's cruise speed.
"""

from __future__ import annotations

import math
import time
from itertools import combinations

import numpy as np
import requests

from pratirakshak.io import read_json, write_json
from pratirakshak.settings import ROUTES_DIR
from pratirakshak.world.climate import USER_AGENT

OSRM_URL = "https://router.project-osrm.org/route/v1/driving/{a};{b}?overview=full&geometries=geojson"
ROAD_DIR = ROUTES_DIR / "road"
EARTH_R_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(h))


def great_circle(lat1: float, lon1: float, lat2: float, lon2: float, n: int = 48) -> list[list[float]]:
    """[lon, lat] points along the great circle (slerp)."""
    def vec(lat: float, lon: float) -> np.ndarray:
        la, lo = math.radians(lat), math.radians(lon)
        return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])

    a, b = vec(lat1, lon1), vec(lat2, lon2)
    omega = math.acos(float(np.clip(a @ b, -1, 1)))
    pts = []
    for t in np.linspace(0, 1, n):
        v = a if omega == 0 else (math.sin((1 - t) * omega) * a + math.sin(t * omega) * b) / math.sin(omega)
        pts.append([round(math.degrees(math.atan2(v[1], v[0])), 5), round(math.degrees(math.asin(v[2])), 5)])
    return pts


def rdp(points: np.ndarray, eps: float) -> np.ndarray:
    """Iterative Ramer–Douglas–Peucker on lon/lat degrees."""
    keep = np.zeros(len(points), dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = points[i], points[j]
        seg = b - a
        norm = np.hypot(*seg)
        rel = points[i + 1 : j] - a
        d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / norm if norm > 0 else np.hypot(rel[:, 0], rel[:, 1])
        k = int(np.argmax(d))
        if d[k] > eps:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return points[keep]


def osrm_road(a_id: str, a: tuple[float, float], b_id: str, b: tuple[float, float]) -> dict | None:  # type: ignore[type-arg]
    """Cached OSRM road route as a GeoJSON Feature; None if unreachable and uncached."""
    path = ROAD_DIR / f"{a_id}-{b_id}.geojson"
    if path.exists():
        return read_json(path)
    url = OSRM_URL.format(a=f"{a[1]},{a[0]}", b=f"{b[1]},{b[0]}")
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
        r.raise_for_status()
        js = r.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"  route {a_id}-{b_id}: OSRM unreachable ({exc.__class__.__name__})")
        return None
    finally:
        time.sleep(1.1)  # demo-server policy: ≤ 1 request/s
    if js.get("code") != "Ok":
        print(f"  route {a_id}-{b_id}: OSRM {js.get('code')}")
        return None
    route = js["routes"][0]
    coords = np.array(route["geometry"]["coordinates"], dtype=float)
    simple = rdp(coords, eps=0.003)  # ≈ 300 m
    feature = {
        "type": "Feature",
        "properties": {
            "from": a_id, "to": b_id, "mode": "road", "source": "osrm",
            "distance_km": round(route["distance"] / 1000, 2),
            "osrm_duration_h": round(route["duration"] / 3600, 3),
            "points_raw": len(coords), "points": len(simple),
            "attribution": "Routing: OSRM demo server (FOSSGIS); data © OpenStreetMap contributors (ODbL)",
        },
        "geometry": {"type": "LineString", "coordinates": [[round(x, 5), round(y, 5)] for x, y in simple]},
    }
    write_json(path, feature, indent=None)
    return feature


def node_pairs(ids: list[str]) -> list[tuple[str, str]]:
    return list(combinations(sorted(ids), 2))
