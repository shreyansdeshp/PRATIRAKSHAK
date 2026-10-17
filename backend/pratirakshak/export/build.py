"""Stage 8 — static snapshot bundle for the front-end (SPEC §12 "static-first delivery").

Everything the UI shows comes from these files; the live API only adds what-ifs. Rules:
- No ground truth about the future reaches the UI (engine life lengths, latent damage stay in the backend).
- The vendor snapshot is built separately from demand records only — no tail ids, health or readiness.
- Deterministic bytes: no wall-clock timestamps.
"""

from __future__ import annotations

import hashlib
import shutil
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from pratirakshak import __version__
from pratirakshak.export.profiles import build_profiles
from pratirakshak.ingest.cmapss import HEADLINE_SENSORS, SENSOR_NAMES
from pratirakshak.io import load_config, read_json, write_json
from pratirakshak.settings import (
    FRONTEND_DATA_DIR,
    MODELS_DIR,
    PROCESSED_DIR,
    REPORTS_DIR,
    ROUTES_DIR,
    SEED,
    derive_seed,
)
from pratirakshak.synth.model import STRESSES, SYSTEMS, Drivers, SynthModel

OUT = FRONTEND_DATA_DIR
STATE, PLAN, RESULTS = PROCESSED_DIR / "state", PROCESSED_DIR / "plan", PROCESSED_DIR / "results"
PROVENANCE = {
    "REAL": "NASA C-MAPSS engine data or another public dataset, used as recorded.",
    "REAL-ANCHORED": "Synthetic, but calibrated on a real dataset (UCI hydraulic rig, Open-Meteo/ERA5 climate, OSRM/OSM roads).",
    "SIMULATED": "Synthetic, produced by our generator or simulator.",
    "ILLUSTRATIVE": "Placeholder values for the story (costs in ₵, names, stock levels).",
}


def r(x: Any, nd: int = 3) -> Any:
    """Round floats (recursively) so the JSON stays small and stable."""
    if isinstance(x, float | np.floating):
        return None if not np.isfinite(x) else round(float(x), nd)
    if isinstance(x, dict):
        return {k: r(v, nd) for k, v in x.items()}
    if isinstance(x, list | tuple):
        return [r(v, nd) for v in x]
    if isinstance(x, np.integer):
        return int(x)
    return x


def snapshot_clock(world_cfg: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(world_cfg["calendar"]["sim_start"] + "T06:00:00")


# ------------------------------------------------------------------------------------------ world
def build_world(world: dict[str, Any], wcfg: dict[str, Any]) -> dict[str, Any]:
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    env0 = env[env["day"] == 0].set_index("base")
    tcfg = {t["id"]: t for t in wcfg["aircraft_types"]}
    bases = []
    for b in world["bases"]:
        e = env0.loc[b["id"]]
        bases.append({**b, "env_d0": {k: float(e[k]) for k in ["t_max_c", "t_min_c", "rh_pct", "precip_mm", *STRESSES]},
                      "nudge_note": next(x["nudge_note"] for x in wcfg["bases"] if x["id"] == b["id"])})
    routes = []
    ROUTE_OUT = OUT / "routes"
    ROUTE_OUT.mkdir(parents=True, exist_ok=True)
    for rt in world["routes"]:
        geo = None
        if rt["geometry_file"]:
            name = rt["geometry_file"].split("/")[-1]
            shutil.copyfile(ROUTES_DIR / "road" / name, ROUTE_OUT / name)
            geo = f"data/routes/{name}"
        routes.append({k: rt[k] for k in ("id", "from_node", "to_node", "mode", "distance_km", "minutes", "source")}
                      | {"geometry": geo, "closure": rt["seasonal_closure"]})
    shutil.copyfile(ROUTES_DIR / "air.geojson", ROUTE_OUT / "air.geojson")
    aircraft = [{"tail": a["tail"], "type": a["type"], "base": a["base"], "age_years": a["age_years"],
                 "airframe_hours": a["airframe_hours"], "airframe_life_hours": a["airframe_life_hours"],
                 "engines": [{"position": e["position"], "subset": e["cmapss_subset"],
                              "time_since_overhaul_h": e["time_since_overhaul_h"]} for e in a["engines"]]}  # no life truth
                for a in world["aircraft"]]
    types = [{**t, "role_critical": tcfg[t["id"]]["criticality_role"], "cruise_kmh": tcfg[t["id"]].get("cruise_kmh")}
             for t in world["types"]]
    return {"provenance": world["provenance"], "calendar": world["calendar"], "bases": bases, "nodes": world["nodes"],
            "types": types, "systems": world["systems"], "aircraft": aircraft, "parts": world["parts"],
            "stock": world["stock"], "routes": routes, "readiness_floor": wcfg["readiness_floor"]}


# ------------------------------------------------------------------------------------------ state
def build_state(world: dict[str, Any]) -> dict[str, Any]:
    d0 = pd.read_parquet(STATE / "d0_systems.parquet")
    ac = pd.read_parquet(STATE / "d0_aircraft.parquet").set_index("tail")
    ex = read_json(STATE / "explanations.json")
    dec = {d["tail"]: d for d in read_json(PLAN / "decisions.json")}
    out = []
    for a in world["aircraft"]:
        t = a["tail"]
        row = ac.loc[t]
        systems = []
        for _, s in d0[d0["tail"] == t].iterrows():
            e = ex[t][s["system"]]
            systems.append({"id": s["system"], "health": float(s["health"]), "p_fail": float(s["p_fail_window"]),
                            "rul_days": [float(s["rul_p10_days"]), float(s["rul_p50_days"]), float(s["rul_p90_days"])],
                            "provenance": s["provenance"], "confidence": e["confidence"], "drivers": e["drivers"],
                            "action": next(x["action"] for x in dec[t]["systems"] if x["system"] == s["system"])})
        out.append({"tail": t, "type": a["type"], "base": a["base"], "status": row["status"],
                    "limiting_system": row["limiting_system"], "limiting_p": float(row["limiting_p"]),
                    "risk_window": float(row["risk_window"]), "weighted_health": float(row["weighted_health"]),
                    "body_health": float(row["body_health"]), "age_years": float(row["age_years"]),
                    "airframe_life_used": float(row["airframe_life_used"]), "action": dec[t]["action"],
                    "action_system": dec[t]["system"], "systems": systems})
    df = pd.DataFrame([{k: x[k] for k in ("tail", "type", "base", "status", "weighted_health")} for x in out])

    def roll(g: pd.DataFrame) -> dict[str, Any]:
        c = g["status"].value_counts()
        return {"aircraft": int(len(g)), "ready": int(c.get("READY", 0)), "watch": int(c.get("WATCH", 0)),
                "pull": int(c.get("PULL", 0)), "avg_health": float(g["weighted_health"].mean())}

    summary = {"fleet": roll(df), "by_base": {b: roll(g) for b, g in df.groupby("base")},
               "by_type": {t: roll(g) for t, g in df.groupby("type")},
               "by_base_type": {f"{b}|{t}": roll(g) for (b, t), g in df.groupby(["base", "type"])},
               "limiting": {k: int(v) for k, v in pd.Series([x["limiting_system"] for x in out if x["status"] != "READY"]).value_counts().items()}}
    syscfg = load_config("systems")
    return {"snapshot": "D+0 06:00Z", "window_days": syscfg["window_days"], "risk": syscfg["risk"],
            "health_ref": syscfg["health_ref"], "aircraft": out, "summary": summary}


# ------------------------------------------------------------------------------------------ history
def build_history(world: dict[str, Any]) -> dict[str, Any]:
    from pratirakshak.models.engine_data import prepare

    hist = pd.read_parquet(STATE / "sensor_history.parquet")
    trust = pd.read_parquet(STATE / "trust_d0.parquet")
    model = SynthModel()
    meta = {s["id"]: {"name": s["name"], "unit": s.get("unit", ""), "system": s["system"], "kind": s["kind"],
                      "healthy": s.get("healthy"), "effect": s.get("effect"), "anchored": bool(s.get("anchored", False))}
            for s in model.sensors}
    systems: dict[str, dict[str, list[float]]] = {}
    for (t, sid), g in hist.sort_values("day").groupby(["tail", "sensor"]):
        systems.setdefault(t, {})[sid] = [None if pd.isna(v) else round(float(v), 3) for v in g["value"]]
    tr: dict[str, dict[str, Any]] = {}
    for _, x in trust.iterrows():
        tr.setdefault(x["tail"], {})[x["sensor"]] = {"trust": round(float(x["trust"]), 1), "reasons": x["reasons"], "group": x["group"]}
    engines: dict[str, list[dict[str, Any]]] = {}
    preps = {}
    headline = [s for s in HEADLINE_SENSORS]
    for a in world["aircraft"]:
        for e in a["engines"]:
            sub = e["cmapss_subset"]
            if sub not in preps:
                preps[sub] = prepare(sub)
            p = preps[sub]
            m = (p.replay_df["unit"] == e["replay_unit"]).to_numpy()
            rows = p.replay_df[m].iloc[max(0, e["start_cycle"] - 60) : max(e["start_cycle"], 1)]
            z = p.norm.transform(rows)
            cl = p.norm.cluster(rows)
            series = {}
            for s in headline:
                j = p.cfg["inputs"].index(s)
                dev = (z[:, j] - p.norm.healthy_z[j]) * p.norm.std[cl, j]
                sm = pd.Series(dev).rolling(5, min_periods=1).mean().to_numpy()
                sym, desc, unit = SENSOR_NAMES[s]
                series[s] = {"symbol": sym, "name": desc, "unit": unit, "part": HEADLINE_SENSORS[s],
                             "deviation": [round(float(v), 4) for v in sm]}
            engines.setdefault(a["tail"], []).append({"position": e["position"], "subset": sub,
                                                      "cycles": [int(c) for c in rows["cycle"]], "sensors": series})
    return {"days": list(range(-60, 1)), "sensor_meta": meta, "systems": systems, "trust": tr, "engines": engines,
            "note": "Engine series = condition-normalised deviation from the training-calibrated healthy baseline, in sensor "
                    "units, 5-cycle smoothing (REAL C-MAPSS). System series = daily readings (SIMULATED; faults included)."}


# ------------------------------------------------------------------------------------------ twin
def build_twin(world: dict[str, Any], horizon: int = 60, draws: int = 200) -> dict[str, Any]:
    """Default what-if fans (usage ×1, no deferral) from the simulator's own forward model (SPEC §8.4)."""
    from pratirakshak.synth.model import FaultState  # noqa: F401  (faults are irrelevant to latent damage)

    latent = read_json(STATE / "d0_latent.json")
    wcfg = load_config("world")
    types = {t["id"]: t for t in wcfg["aircraft_types"]}
    tempo = {b["id"]: b["tempo"] for b in wcfg["bases"]}
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    model = SynthModel()
    A = len(world["aircraft"])
    d = np.repeat(np.array(latent["damage"])[None], draws, 0).reshape(draws * A, len(SYSTEMS))
    base_of = [a["base"] for a in world["aircraft"]] * draws
    type_of = [a["type"] for a in world["aircraft"]] * draws
    spd = np.array([types[t]["sorties_per_day"] * tempo[b] for t, b in zip(type_of, base_of, strict=True)])
    inten = np.array([types[t]["intensity"] for t in type_of])
    rng = np.random.default_rng(derive_seed("twin-default"))
    cond = np.zeros((horizon + 1, draws * A, len(SYSTEMS)))
    failed_any = np.zeros((horizon + 1, draws * A), dtype=bool)
    cond[0] = 1 - np.minimum(d, 1)
    base_ids = sorted(set(base_of))
    base_idx = np.array([base_ids.index(b) for b in base_of])
    for t in range(1, horizon + 1):
        tab = env[env["day"] == min(t, env["day"].max())].set_index("base").loc[base_ids, STRESSES].to_numpy(dtype=float)
        stress = {s: tab[base_idx, k] for k, s in enumerate(STRESSES)}
        sorties = rng.poisson(spd).astype(float)
        dr = Drivers(sorties, spd, inten, stress, np.full(len(spd), 0.5))
        d = model.step(d, dr, rng)
        cond[t] = 1 - np.minimum(d, 1)
        failed_any[t] = failed_any[t - 1] | (d >= 1).any(1)
    cond = cond.reshape(horizon + 1, draws, A, len(SYSTEMS))
    risk = failed_any.reshape(horizon + 1, draws, A).mean(1)
    q = np.percentile(cond, [10, 50, 90], axis=1) * 100  # (3, T, A, S)
    step = 2
    days = list(range(0, horizon + 1, step))
    out = {}
    for i, a in enumerate(world["aircraft"]):
        out[a["tail"]] = {"systems": {s: {"p10": [round(float(v), 1) for v in q[0, ::step, i, j]],
                                          "p50": [round(float(v), 1) for v in q[1, ::step, i, j]],
                                          "p90": [round(float(v), 1) for v in q[2, ::step, i, j]]}
                                      for j, s in enumerate(SYSTEMS)},
                          "risk_any_failure": [round(float(v), 3) for v in risk[::step, i]]}
    return {"days": days, "draws": draws, "provenance": "SIMULATED",
            "note": "Projected condition index 100·(1 − damage) from the simulator's forward model (same model as the "
                    "stress tests), usage ×1, no deferral. Engines are not projected here (they follow REAL trajectories).",
            "tails": out}


# ------------------------------------------------------------------------------------------ vendor
def build_vendor(world: dict[str, Any], wcfg: dict[str, Any]) -> dict[str, Any]:
    """Vendor view: what to deliver, where, by when, how many, priority. Built from demand records only."""
    clock = snapshot_clock(wcfg)
    nodes = {n["id"]: n for n in world["nodes"]}
    parts = {p["lru"]: p for p in world["parts"]}
    routes = {(rt["from_node"], rt["to_node"], rt["mode"]): rt for rt in world["routes"]}
    routes |= {(rt["to_node"], rt["from_node"], rt["mode"]): rt for rt in world["routes"]}
    demands = []
    for q in read_json(PLAN / "spares_requests.json"):
        demands.append(("expedite", q["lru"], q["destination"], q["deadline_hours"], q["priority"], q["source"], q["mode"],
                        q["eta_hours"], q["route_id"]))
    vendor = next(n for n, v in nodes.items() if v["kind"] == "vendor_hub")
    sched = read_json(PLAN / "schedule.json")
    for v in sched["visits"]:
        if v["start"] is None:
            continue
        for tk in v["tasks"]:
            if tk["lru"] not in parts:
                continue
            rt = routes.get((vendor, v["base"], "road")) or routes.get((vendor, v["base"], "air"))
            demands.append(("restock", tk["lru"], v["base"], parts[tk["lru"]]["lead_time_days"] * 24, "P3", vendor,
                            rt["mode"] if rt else "road", (rt["minutes"] / 60) if rt else None, rt["id"] if rt else None))
    agg: dict[tuple[Any, ...], dict[str, Any]] = {}
    for kind, lru, dest, dl, pr, src, mode, eta, rid in demands:
        key = (kind, lru, dest, pr)
        if key in agg:
            agg[key]["qty"] += 1
            continue
        agg[key] = {"kind": kind, "lru": lru, "part": parts[lru]["name"], "qty": 1, "priority": pr,
                    "destination": {"id": dest, "name": nodes[dest]["name"], "lat": nodes[dest]["lat"], "lon": nodes[dest]["lon"]},
                    "deliver_by": (clock + timedelta(hours=float(dl))).strftime("%Y-%m-%dT%H:%MZ") if dl is not None else None,
                    "source": {"id": src, "name": nodes[src]["name"]}, "mode": mode,
                    "eta_hours": None if eta is None else round(float(eta), 1), "route_id": rid}
    rows = sorted(agg.values(), key=lambda x: ({"P1": 0, "P2": 1, "P3": 2}[x["priority"]], x["deliver_by"] or "", x["lru"], x["destination"]["id"]))
    for i, x in enumerate(rows, start=1):
        x["demand_id"] = f"DMD-{i:03d}"
    return {"role": "vendor", "snapshot": "D+0 06:00Z", "vendor_hub": {"id": vendor, "name": nodes[vendor]["name"]},
            "demands": rows,
            "stock_at_hub": [{"lru": s["lru"], "qty": s["qty"]} for s in world["stock"] if s["node"] == vendor],
            "nodes": [{k: n[k] for k in ("id", "kind", "name", "lat", "lon")} for n in world["nodes"]],
            "routes": [{k: rt[k] for k in ("id", "from_node", "to_node", "mode", "minutes", "geometry_file")}
                       for rt in world["routes"] if vendor in (rt["from_node"], rt["to_node"])],
            "note": "Vendor role: deliveries only. No aircraft identity, health or readiness is included in this file."}


# ------------------------------------------------------------------------------------------ results etc.
def build_results() -> dict[str, Any]:
    s = read_json(RESULTS / "summary.json")
    return {**s, "curves": read_json(RESULTS / "curves.json"), "ablation": read_json(RESULTS / "ablation.json"),
            "sensitivity": read_json(RESULTS / "sensitivity.json"), "counterfactuals": read_json(RESULTS / "counterfactuals.json")}


def build_demo() -> dict[str, Any]:
    d = read_json(RESULTS / "demo.json")
    keep = ("day", "tail", "base", "kind", "system", "in_flight", "duration", "planned", "systems", "p_fail")
    for run in d["runs"].values():
        run["events"] = [{k: e[k] for k in keep if k in e} for e in run["events"] if e["kind"] != "visit_end"]
    return d


def build_models() -> dict[str, Any]:
    eda = read_json(REPORTS_DIR / "data" / "cmapss_eda.json")
    return {"engine": read_json(MODELS_DIR / "engine" / "summary.json"),
            "systems": [read_json(MODELS_DIR / "systems" / s / "metrics.json") for s in SYSTEMS],
            "hydraulics_anchor": read_json(PROCESSED_DIR / "anchors" / "hydraulics.json"),
            "data": {k: eda[k] for k in ("counts", "match_spec", "match_readme", "mismatches", "n_conditions",
                                         "constant_sensors", "lifetimes", "test_min_len")}}


def build_intelligence() -> dict[str, Any]:
    trust = pd.read_parquet(STATE / "trust_d0.parquet")
    return {"graph": read_json(MODELS_DIR / "intelligence" / "graph.json"),
            "trust_harness": read_json(MODELS_DIR / "intelligence" / "trust_harness.json"),
            "engine_importance": {sub: read_json(MODELS_DIR / "engine" / sub / "explain.json")["global_ranking"]
                                  for sub in ("FD001", "FD002", "FD003", "FD004")},
            "fleet_trust": {"sensors": int(len(trust)), "untrusted": int((trust["trust"] < 60).sum()),
                            "flagged": [r(x) for x in trust[trust["trust"] < 60].sort_values("trust").head(20).to_dict("records")]}}


def build_plan() -> dict[str, Any]:
    s = read_json(PLAN / "schedule.json")
    return {**s, "missions": read_json(STATE / "mission_fit.json")}


# ------------------------------------------------------------------------------------------ main
def build_all() -> dict[str, Any]:
    from pratirakshak.export.schema import validate

    wcfg = load_config("world")
    world = read_json(PROCESSED_DIR / "world" / "world.json")
    OUT.mkdir(parents=True, exist_ok=True)
    files: dict[str, Any] = {
        "world": build_world(world, wcfg), "state": build_state(world), "history": build_history(world),
        "decisions": read_json(PLAN / "decisions.json"), "plan": build_plan(), "intelligence": build_intelligence(),
        "models": build_models(), "results": build_results(), "demo": build_demo(), "twin": build_twin(world),
        "vendor": build_vendor(world, wcfg), "profiles": build_profiles(),
    }
    for name, obj in files.items():
        validate(name, obj)
        write_json(OUT / f"{name}.json", r(obj, 4), indent=None)
    meta = {"project": "Pratirakshak", "tagline": "Predict. Prepare. Protect.", "problem_statement": "SIH26249",
            "version": __version__, "seed": SEED, "demo_seed": files["results"]["demo_seed"],
            "sim_start": wcfg["calendar"]["sim_start"], "horizon_days": wcfg["calendar"]["horizon_days"],
            "snapshot": "D+0 06:00Z", "provenance_legend": PROVENANCE,
            "roles": {"commander": [n for n in files if n != "vendor"], "vendor": ["vendor"]}}
    validate("meta", meta)
    write_json(OUT / "meta.json", meta, indent=1)
    manifest = []
    for p in sorted(OUT.rglob("*")):
        if p.is_file() and p.name != "manifest.json":
            b = p.read_bytes()
            manifest.append({"path": "data/" + p.relative_to(OUT).as_posix(), "bytes": len(b),
                             "sha256": hashlib.sha256(b).hexdigest()[:16]})
    write_json(OUT / "manifest.json", {"files": manifest, "total_bytes": sum(m["bytes"] for m in manifest)})
    return {"files": manifest, "total_bytes": sum(m["bytes"] for m in manifest)}
