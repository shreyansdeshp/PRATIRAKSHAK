"""Live API (SPEC §12). Optional: the front-end runs entirely from static snapshot files and falls back silently.

Endpoints add only what static files cannot: twin what-ifs, a quick re-simulation, and re-evaluating a decision at a
different risk threshold. The vendor endpoint serves the vendor subset only (role separation is in the data).
Run: python -m uvicorn pratirakshak.api.app:app --port 8000
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pratirakshak.io import load_config, read_json
from pratirakshak.settings import FRONTEND_DATA_DIR, PROCESSED_DIR, derive_seed
from pratirakshak.synth.model import STRESSES, SYSTEMS, Drivers, SynthModel

app = FastAPI(title="Pratirakshak API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://localhost:4173"],
                   allow_methods=["GET", "POST"], allow_headers=["*"])


@lru_cache(maxsize=1)
def _world() -> dict[str, Any]:
    return read_json(PROCESSED_DIR / "world" / "world.json")


@lru_cache(maxsize=1)
def _latent() -> dict[str, Any]:
    return read_json(PROCESSED_DIR / "state" / "d0_latent.json")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "snapshot": "D+0 06:00Z"}


# ------------------------------------------------------------------------------------------ twin (U7)
class TwinRequest(BaseModel):
    tail: str
    usage_multiplier: float = Field(1.0, ge=0.0, le=3.0)
    defer_days: int = Field(0, ge=0, le=60)       # days before the scheduled service is allowed to happen
    service_systems: list[str] = []                # systems serviced at day `defer_days` (from the plan)
    environment: str | None = None                 # base id whose environment to use (default: home base)
    horizon_days: int = Field(60, ge=7, le=90)
    draws: int = Field(200, ge=20, le=500)


@app.post("/api/twin")
def twin(req: TwinRequest) -> dict[str, Any]:
    world = _world()
    tails = [a["tail"] for a in world["aircraft"]]
    if req.tail not in tails:
        raise HTTPException(404, "unknown tail")
    i = tails.index(req.tail)
    a = world["aircraft"][i]
    wcfg = load_config("world")
    t = next(x for x in wcfg["aircraft_types"] if x["id"] == a["type"])
    base = req.environment or a["base"]
    tempo = next(b["tempo"] for b in wcfg["bases"] if b["id"] == a["base"])
    env = pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet")
    model = SynthModel()
    n = req.draws
    d = np.repeat(np.array(_latent()["damage"][i])[None], n, 0)
    spd = np.full(n, t["sorties_per_day"] * tempo * req.usage_multiplier)
    inten = np.full(n, t["intensity"])
    rng = np.random.default_rng(derive_seed("twin", req.tail, req.usage_multiplier, req.defer_days, base))
    cond = [1 - np.minimum(d, 1)]
    failed = np.zeros(n, dtype=bool)
    risk = [0.0]
    mask = np.zeros_like(d, dtype=bool)
    for s in req.service_systems:
        if s in SYSTEMS:
            mask[:, SYSTEMS.index(s)] = True
    for day in range(1, req.horizon_days + 1):
        row = env[(env["base"] == base) & (env["day"] == min(day, env["day"].max()))].iloc[0]
        stress = {s: np.full(n, float(row[s])) for s in STRESSES}
        sorties = rng.poisson(spd).astype(float)
        d = model.step(d, Drivers(sorties, spd, inten, stress, np.full(n, 0.5)), rng)
        if day == req.defer_days and mask.any():
            d = model.service(d, mask, rng)
        failed |= (d >= 1).any(1)
        cond.append(1 - np.minimum(d, 1))
        risk.append(float(failed.mean()))
    c = np.stack(cond) * 100
    q = np.percentile(c, [10, 50, 90], axis=1)
    return {"tail": req.tail, "days": list(range(req.horizon_days + 1)), "provenance": "SIMULATED",
            "systems": {s: {"p10": q[0, :, j].round(1).tolist(), "p50": q[1, :, j].round(1).tolist(),
                            "p90": q[2, :, j].round(1).tolist()} for j, s in enumerate(SYSTEMS)},
            "risk_any_failure": [round(x, 3) for x in risk]}


# ------------------------------------------------------------------------------------------ re-simulation
class ResimRequest(BaseModel):
    scenario: str = "base"
    policy: str = "P3"
    seed: int = Field(0, ge=0, le=99)
    detection_delay: int = Field(0, ge=0, le=14)


@app.post("/api/resimulate")
def resimulate(req: ResimRequest) -> dict[str, Any]:
    from pratirakshak.sim.runner import run_one

    if req.scenario not in load_config("scenarios")["scenarios"] or req.policy not in ("P0", "P1", "P2", "P3"):
        raise HTTPException(400, "unknown scenario or policy")
    res = run_one({"policy": req.policy, "scenario": req.scenario, "seed": req.seed, "detection_delay": req.detection_delay})
    return {k: v for k, v in res.items() if k not in ("events", "damage_curve")}


# ------------------------------------------------------------------------------------------ decision re-evaluation
class DecisionRequest(BaseModel):
    tail: str
    criticality: str = "training"
    theta: float | None = Field(None, gt=0, lt=1)


@app.post("/api/decision")
def decision(req: DecisionRequest) -> dict[str, Any]:
    from pratirakshak.decide.__main__ import estimates_for
    from pratirakshak.decide.rule import Context, decide_aircraft
    from pratirakshak.decide.spares import Logistics

    world = _world()
    a = next((x for x in world["aircraft"] if x["tail"] == req.tail), None)
    if a is None:
        raise HTTPException(404, "unknown tail")
    ctx = Context(Logistics(world), {p["lru"]: p for p in world["parts"]})
    theta = req.theta if req.theta is not None else ctx.policies["theta"].get(req.criticality, 0.3)
    st = PROCESSED_DIR / "state"
    est = estimates_for(req.tail, pd.read_parquet(st / "d0_systems.parquet"), read_json(st / "explanations.json"),
                        pd.read_parquet(st / "trust_d0.parquet"))
    ac = pd.read_parquet(st / "d0_aircraft.parquet")
    vahak = set(ac[(ac["type"] == "VAH") & (ac["status"] != "PULL")]["base"])
    on = date.fromisoformat(load_config("world")["calendar"]["sim_start"])
    return decide_aircraft(a, est, theta, req.criticality, on, vahak, ctx)


# ------------------------------------------------------------------------------------------ vendor (U8)
@app.get("/api/vendor/demands")
def vendor_demands() -> dict[str, Any]:
    """Vendor role: serves ONLY the vendor subset built at export time (no tail ids, health or readiness)."""
    return read_json(FRONTEND_DATA_DIR / "vendor.json")
