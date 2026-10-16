"""Stage 2 — build the fictional world from config/world.yaml (SPEC §3, §4 P1).

Outputs (data/processed/world/): bases, nodes, types, systems, aircraft, engines, parts, stock, routes,
missions, environment (parquet) + world.json (validated against pratirakshak.schema).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from pratirakshak import schema as S
from pratirakshak.io import load_config, read_json, write_json, write_parquet
from pratirakshak.settings import PROCESSED_DIR, REPORTS_DIR, derive_seed
from pratirakshak.world import climate, routes

OUT = PROCESSED_DIR / "world"
NORMALS_PATH = OUT / "climate_normals.parquet"


@dataclass
class World:
    cfg: dict[str, Any]
    bases: list[S.Base] = field(default_factory=list)
    nodes: list[S.Node] = field(default_factory=list)
    types: list[S.AircraftType] = field(default_factory=list)
    systems: list[S.SystemDef] = field(default_factory=list)
    aircraft: list[S.Aircraft] = field(default_factory=list)
    parts: list[S.Part] = field(default_factory=list)
    stock: list[S.StockLevel] = field(default_factory=list)
    routes: list[S.Route] = field(default_factory=list)
    missions: list[S.Mission] = field(default_factory=list)
    environment: pd.DataFrame | None = None


# ------------------------------------------------------------------------------------- climate
def build_climate(cfg: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, str]]:
    """Normals per base (fresh from Open-Meteo/cache, else the committed normals). Returns (normals, source)."""
    years = tuple(cfg["calendar"]["climatology_years"])
    committed = pd.read_parquet(NORMALS_PATH) if NORMALS_PATH.exists() else None
    frames, source = [], {}
    for b in cfg["bases"]:
        raw = climate.fetch_archive(b["id"], b["lat"], b["lon"], years)  # type: ignore[arg-type]
        if raw is not None:
            n = climate.daily_normals(raw).reset_index()
            n["elevation_m"] = float(raw["elevation"])
            source[b["id"]] = f"Open-Meteo archive {years[0]}–{years[1]}"
        elif committed is not None and b["id"] in set(committed["base"]):
            n = committed[committed["base"] == b["id"]].drop(columns="base")
            source[b["id"]] = "committed normals (offline)"
        else:
            raise RuntimeError(f"No climate for {b['id']}: Open-Meteo unreachable and no committed normals.")
        n.insert(0, "base", b["id"])
        frames.append(n)
    return pd.concat(frames, ignore_index=True), source


def build_environment(cfg: dict[str, Any], normals: pd.DataFrame) -> pd.DataFrame:
    dates = climate.horizon_dates(cfg["calendar"]["sim_start"], cfg["calendar"]["horizon_days"])
    rows = []
    for b in cfg["bases"]:
        nb = normals[normals["base"] == b["id"]].set_index("mmdd")
        elev = float(nb["elevation_m"].iloc[0])
        st = climate.stress_indices(nb.drop(columns=["base", "elevation_m"]), elev, b["dust_index"], b["salinity_index"])
        for day, d in enumerate(dates):
            key = d.strftime("%m-%d") if d.strftime("%m-%d") != "02-29" else "02-28"
            rows.append({"base": b["id"], "day": day, "date": d.isoformat(), **st.loc[key].to_dict()})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------------------- fleet
def build_fleet(cfg: dict[str, Any], types: dict[str, S.AircraftType]) -> list[S.Aircraft]:
    splits = read_json(PROCESSED_DIR / "splits.json")
    eda = read_json(REPORTS_DIR / "data" / "cmapss_eda.json")
    tcfg = {t["id"]: t for t in cfg["aircraft_types"]}
    lo, hi = cfg["engine_phase_range"]

    # tail numbers: unique seeded 3-digit numbers per type, assigned in base order
    alloc = cfg["fleet_allocation"]
    numbers: dict[str, list[int]] = {}
    for tid in types:
        n = sum(alloc[b][tid] for b in alloc)
        rng = np.random.default_rng(derive_seed("tails", tid))
        numbers[tid] = sorted(int(x) for x in rng.choice(np.arange(101, 400), size=n, replace=False))

    fleet: list[S.Aircraft] = []
    counters = {tid: 0 for tid in types}
    for base_id in alloc:  # config order
        for tid, n in alloc[base_id].items():
            t, tc = types[tid], tcfg[tid]
            replay = splits[t.cmapss_subset]["replay"]
            life_by_unit = eda["lifetime_values"][t.cmapss_subset]  # index = unit-1
            for _ in range(n):
                tail = f"PR-{t.letter}{numbers[tid][counters[tid]]:03d}"
                counters[tid] += 1
                rng = np.random.default_rng(derive_seed("aircraft", tail))
                age = float(rng.uniform(*tc["age_years"]))
                hours = min(age * tc["annual_hours"] * rng.uniform(0.85, 1.15), 0.97 * t.airframe_life_hours)
                units = rng.choice(replay, size=t.engines, replace=False)
                engines = []
                for pos, u in enumerate(units, start=1):
                    life = int(life_by_unit[int(u) - 1])
                    start = int(round(rng.uniform(lo, hi) * life))
                    tso = start * t.engine_cycle_to_sorties * t.sortie_hours
                    engines.append(S.EngineInstall(
                        position=pos, cmapss_subset=t.cmapss_subset, replay_unit=int(u),
                        unit_life_cycles=life, start_cycle=start, time_since_overhaul_h=round(tso, 1),
                    ))
                fleet.append(S.Aircraft(
                    tail=tail, type=tid, base=base_id, age_years=round(age, 2), airframe_hours=round(hours, 1),
                    airframe_life_hours=t.airframe_life_hours, engines=engines,
                ))
    return fleet


def build_stock(cfg: dict[str, Any], nodes: list[S.Node]) -> list[S.StockLevel]:
    out = []
    for node in nodes:
        for p in cfg["parts"]:
            mean = p["stock"][node.kind]
            rng = np.random.default_rng(derive_seed("stock", node.id, p["lru"]))
            out.append(S.StockLevel(node=node.id, lru=p["lru"], qty=int(rng.poisson(mean))))
    return out


# --------------------------------------------------------------------------------------- routes
def build_routes(cfg: dict[str, Any], nodes: list[S.Node], types: dict[str, S.AircraftType]) -> list[S.Route]:
    lg = cfg["logistics"]
    closures = {c["node"]: c for c in lg["seasonal_closures"]}
    by_id = {n.id: n for n in nodes}
    cruise = next(t["cruise_kmh"] for t in cfg["aircraft_types"] if t["id"] == lg["air"]["carrier_type"])
    out: list[S.Route] = []
    for a_id, b_id in routes.node_pairs(list(by_id)):
        a, b = by_id[a_id], by_id[b_id]
        gc = routes.haversine_km(a.lat, a.lon, b.lat, b.lon)
        closure = None
        for nid in (a_id, b_id):
            if nid in closures:
                c = closures[nid]
                closure = S.SeasonalClosure(start_mmdd=c["from"], end_mmdd=c["to"], reason=c["reason"])

        feat = routes.osrm_road(a_id, (a.lat, a.lon), b_id, (b.lat, b.lon))
        if feat is not None:
            p = feat["properties"]
            dist, hours, src = p["distance_km"], p["osrm_duration_h"] * lg["road"]["truck_time_factor"], "osrm"
            geom = f"data/routes/road/{a_id}-{b_id}.geojson"
        else:
            dist = gc * lg["road"]["fallback_detour_factor"]
            hours, src, geom = dist / lg["road"]["fallback_speed_kmh"], "fallback", None
        out.append(S.Route(
            id=f"road:{a_id}-{b_id}", from_node=a_id, to_node=b_id, mode="road", distance_km=round(dist, 1),
            minutes=round((hours + lg["road"]["handling_hours"]) * 60, 1), geometry_file=geom, source=src,
            seasonal_closure=closure,
        ))
        out.append(S.Route(
            id=f"air:{a_id}-{b_id}", from_node=a_id, to_node=b_id, mode="air", distance_km=round(gc, 1),
            minutes=round((gc / cruise + lg["air"]["handling_hours"]) * 60, 1), geometry_file=None,
            source="great_circle",
        ))
    # air routes as one GeoJSON for the map
    air = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": r.id, "from": r.from_node, "to": r.to_node, "mode": "air",
                                           "distance_km": r.distance_km, "minutes": r.minutes},
         "geometry": {"type": "LineString", "coordinates": routes.great_circle(
             by_id[r.from_node].lat, by_id[r.from_node].lon, by_id[r.to_node].lat, by_id[r.to_node].lon)}}
        for r in out if r.mode == "air"]}
    write_json(routes.ROUTES_DIR / "air.geojson", air, indent=None)
    return out


# ------------------------------------------------------------------------------------- missions
def build_missions(cfg: dict[str, Any], types: dict[str, S.AircraftType]) -> list[S.Mission]:
    mc = cfg["missions"]
    dates = climate.horizon_dates(cfg["calendar"]["sim_start"], cfg["calendar"]["horizon_days"])
    tempo = {b["id"]: b["tempo"] for b in cfg["bases"]}
    out = []
    for base_id, alloc in cfg["fleet_allocation"].items():
        mix = mc["criticality_mix"].get(base_id, mc["criticality_mix"]["default"])
        labels, probs = list(mix), np.array(list(mix.values()), dtype=float)
        for tid, n in alloc.items():
            if n == 0:
                continue
            t = types[tid]
            rng = np.random.default_rng(derive_seed("missions", base_id, tid))
            for day, d in enumerate(dates):
                wf = mc["weekend_factor"] if d.weekday() >= 5 else 1.0
                noise = rng.lognormal(0, mc["demand_noise_cv"])
                sorties = int(round(n * t.sorties_per_day * tempo[base_id] * wf * noise))
                crit = labels[int(rng.choice(len(labels), p=probs / probs.sum()))]
                out.append(S.Mission(day=day, date=d.isoformat(), base=base_id, type=tid, sorties=sorties,
                                     duration_h=t.sortie_hours, criticality=crit))  # type: ignore[arg-type]
    return out


# ---------------------------------------------------------------------------------------- build
def build(cfg: dict[str, Any] | None = None) -> tuple[World, dict[str, str]]:
    cfg = cfg or load_config("world")
    w = World(cfg)
    normals, clim_src = build_climate(cfg)
    elev = normals.groupby("base")["elevation_m"].first().to_dict()

    for b in cfg["bases"]:
        w.bases.append(S.Base(
            id=b["id"], name=b["name"], region=b["region"], lat=b["lat"], lon=b["lon"],
            elevation_m=elev[b["id"]], character=b["character"], hangar_bays=b["hangar_bays"],
            tech_hours_per_day=b["tech_hours_per_day"], dust_index=b["dust_index"],
            salinity_index=b["salinity_index"], tempo=b["tempo"],
        ))
    w.nodes = [S.Node(id=b.id, kind="base", name=b.name, region=b.region, lat=b.lat, lon=b.lon,
                      elevation_m=b.elevation_m) for b in w.bases]
    w.nodes += [S.Node(**n) for n in cfg["nodes"]]
    w.types = [S.AircraftType(**{k: v for k, v in t.items() if k in S.AircraftType.model_fields})
               for t in cfg["aircraft_types"]]
    types = {t.id: t for t in w.types}
    w.systems = [S.SystemDef(**s) for s in cfg["systems"]]
    w.parts = [S.Part(**{k: v for k, v in p.items() if k != "stock"}) for p in cfg["parts"]]
    w.aircraft = build_fleet(cfg, types)
    w.stock = build_stock(cfg, w.nodes)
    w.routes = build_routes(cfg, w.nodes, types)
    w.missions = build_missions(cfg, types)
    w.environment = build_environment(cfg, normals)

    validate(w)
    save(w, normals)
    return w, clim_src


def validate(w: World) -> None:
    assert len(w.aircraft) == 72, f"fleet size {len(w.aircraft)} != 72"
    assert len({a.tail for a in w.aircraft}) == len(w.aircraft), "duplicate tails"
    per_base: dict[str, set[str]] = {}
    for a in w.aircraft:
        per_base.setdefault(a.base, set()).add(a.type)
    for b, ts in per_base.items():
        assert len(ts) >= 3, f"base {b} hosts only {sorted(ts)}"
    sizes = pd.Series([a.base for a in w.aircraft]).value_counts()
    assert sizes.between(14, 22).all(), f"base sizes out of 14–22: {sizes.to_dict()}"
    assert abs(sum(s.weight for s in w.systems) - 1) < 1e-9, "system weights must sum to 1"
    assert 30 <= len(w.parts) <= 40


def save(w: World, normals: pd.DataFrame) -> None:
    def frame(items: list[Any]) -> pd.DataFrame:
        return pd.DataFrame([i.model_dump() for i in items])

    write_parquet(OUT / "bases.parquet", frame(w.bases))
    write_parquet(OUT / "nodes.parquet", frame(w.nodes))
    write_parquet(OUT / "types.parquet", frame(w.types))
    write_parquet(OUT / "systems.parquet", frame(w.systems).astype({"mission_critical": str}))
    write_parquet(OUT / "aircraft.parquet", frame(w.aircraft).drop(columns="engines"))
    write_parquet(OUT / "engines.parquet", pd.DataFrame(
        [{"tail": a.tail, **e.model_dump()} for a in w.aircraft for e in a.engines]))
    write_parquet(OUT / "parts.parquet", frame(w.parts))
    write_parquet(OUT / "stock.parquet", frame(w.stock))
    write_parquet(OUT / "routes.parquet", pd.DataFrame(
        [{**r.model_dump(exclude={"seasonal_closure"}),
          "closure": None if r.seasonal_closure is None else f"{r.seasonal_closure.start_mmdd}..{r.seasonal_closure.end_mmdd}"}
         for r in w.routes]))
    write_parquet(OUT / "missions.parquet", frame(w.missions))
    assert w.environment is not None
    write_parquet(OUT / "environment.parquet", w.environment)
    write_parquet(NORMALS_PATH, normals)

    write_json(OUT / "world.json", {
        "provenance": {
            "bases/nodes/types/tails": "ILLUSTRATIVE (fictional)", "parts cost": "ILLUSTRATIVE (₵)",
            "engines": "REAL (C-MAPSS fleet-replay holdout)", "environment": "REAL-ANCHORED (Open-Meteo/ERA5 normals)",
            "dust/salinity": "ILLUSTRATIVE", "missions/stock": "SIMULATED", "road routes": "REAL-ANCHORED (OSRM/OSM)",
        },
        "calendar": w.cfg["calendar"],
        "bases": [b.model_dump() for b in w.bases],
        "nodes": [n.model_dump() for n in w.nodes],
        "types": [t.model_dump() for t in w.types],
        "systems": [s.model_dump() for s in w.systems],
        "aircraft": [a.model_dump() for a in w.aircraft],
        "parts": [p.model_dump() for p in w.parts],
        "stock": [s.model_dump() for s in w.stock],
        "routes": [r.model_dump() for r in w.routes],
    })
