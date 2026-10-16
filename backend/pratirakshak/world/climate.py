"""Base climatology → daily environment stress for the sim horizon (SPEC §7.3, §7.4).

Source: Open-Meteo historical archive (ERA5-based, CC BY 4.0, keyless, non-commercial). One request per base,
cached raw in data/interim/climate/ (gitignored). The derived day-of-year normals are committed in
data/processed/world/ so the world rebuilds offline. Dust/salinity indices are ILLUSTRATIVE config values.
"""

from __future__ import annotations

import time
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests

from pratirakshak.io import read_json, write_json
from pratirakshak.settings import INTERIM_DIR

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY = ["temperature_2m_max", "temperature_2m_min", "relative_humidity_2m_mean", "precipitation_sum", "wind_speed_10m_max"]
USER_AGENT = "pratirakshak-sih26249/0.1 (student hackathon project; contact via GitHub shreyansdeshp)"
CACHE_DIR = INTERIM_DIR / "climate"


def fetch_archive(base_id: str, lat: float, lon: float, years: tuple[int, int]) -> dict | None:  # type: ignore[type-arg]
    """Raw Open-Meteo response, cached. Returns None if offline and uncached."""
    path = CACHE_DIR / f"{base_id}_{years[0]}_{years[1]}.json"
    if path.exists():
        return read_json(path)
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": f"{years[0]}-01-01", "end_date": f"{years[1]}-12-31",
        "daily": ",".join(DAILY), "timezone": "UTC",
    }
    try:
        r = requests.get(ARCHIVE_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=120)
        r.raise_for_status()
    except requests.RequestException as exc:
        print(f"  climate {base_id}: Open-Meteo unreachable ({exc.__class__.__name__})")
        return None
    data = r.json()
    write_json(path, data, indent=None)
    time.sleep(1.0)  # polite
    return data


def daily_normals(raw: dict) -> pd.DataFrame:  # type: ignore[type-arg]
    """Day-of-year normals (mean over years, ±3-day circular smoothing)."""
    df = pd.DataFrame(raw["daily"])
    df["time"] = pd.to_datetime(df["time"])
    df = df[~((df["time"].dt.month == 2) & (df["time"].dt.day == 29))]
    df["mmdd"] = df["time"].dt.strftime("%m-%d")
    norm = df.groupby("mmdd")[DAILY].mean()
    padded = pd.concat([norm.iloc[-3:], norm, norm.iloc[:3]])
    smooth = padded.rolling(7, center=True).mean().iloc[3:-3]
    return smooth.round(3)


def stress_indices(normals: pd.DataFrame, elevation_m: float, dust: float, salinity: float) -> pd.DataFrame:
    """Map climate normals to 0–1 stress indices (formulae documented in docs/PARAMETER_SOURCES.md)."""
    t_max, t_min = normals["temperature_2m_max"], normals["temperature_2m_min"]
    rh, rain, wind = normals["relative_humidity_2m_mean"], normals["precipitation_sum"], normals["wind_speed_10m_max"]
    wet = np.clip(rain / 15.0, 0, 1)
    return pd.DataFrame({
        "t_max_c": t_max, "t_min_c": t_min, "rh_pct": rh, "precip_mm": rain, "wind_max_kmh": wind,
        "heat": np.clip((t_max - 30) / 15, 0, 1),
        "cold": np.clip((5 - t_min) / 25, 0, 1),
        "humidity": np.clip((rh - 50) / 45, 0, 1),
        "wet": wet,
        "dust": np.clip(dust * (1 - 0.7 * wet) * (0.7 + 0.3 * np.clip(wind / 30, 0, 1)), 0, 1),
        "salinity": salinity * (0.6 + 0.4 * np.clip((rh - 50) / 45, 0, 1)),
        "altitude": float(np.clip(elevation_m / 4000, 0, 1)),
    }, index=normals.index).round(4)


def horizon_dates(start: str, days: int) -> list[date]:
    d0 = date.fromisoformat(start)
    return [d0 + timedelta(days=i) for i in range(days)]
