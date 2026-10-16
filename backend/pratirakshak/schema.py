"""Typed relational model (SPEC §3.5). World entities are produced in Stage 2; state/decision/plan
entities are filled by later stages. Every entity that carries numbers carries a provenance tag."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Provenance = Literal["REAL", "REAL-ANCHORED", "SIMULATED", "ILLUSTRATIVE"]
NodeKind = Literal["base", "depot", "vendor_hub"]
SystemKind = Literal[
    "engines", "hydraulics", "landing_gear", "flight_controls", "electrical", "avionics", "fuel", "structure"
]
Action = Literal[
    "SERVE_NORMALLY", "MONITOR_CLOSELY", "SCHEDULE_SERVICE", "EXPEDITE_SPARE",
    "PULL_FROM_LINE", "VERIFY_SENSOR", "SWAP_TAIL_FOR_MISSION",
]


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# ------------------------------------------------------------------------------------------ world
class Node(_M):
    id: str
    kind: NodeKind
    name: str
    region: str
    lat: float
    lon: float
    elevation_m: float | None = None


class Base(Node):
    kind: NodeKind = "base"
    character: str
    hangar_bays: int = Field(gt=0)
    tech_hours_per_day: float = Field(gt=0)
    dust_index: float = Field(ge=0, le=1)
    salinity_index: float = Field(ge=0, le=1)
    tempo: float = Field(gt=0)


class AircraftType(_M):
    id: str
    name: str
    letter: str
    role: str
    engines: int = Field(ge=1)
    cmapss_subset: Literal["FD001", "FD002", "FD003", "FD004"]
    engine_cycle_to_sorties: float = Field(gt=0)
    sorties_per_day: float
    sortie_hours: float
    intensity: float = Field(ge=0, le=1)
    airframe_life_hours: float
    silhouette: str


class EngineInstall(_M):
    position: int
    cmapss_subset: str
    replay_unit: int           # fleet-replay holdout unit (REAL trajectory)
    unit_life_cycles: int
    start_cycle: int           # cycles of that trajectory already consumed at D+0
    time_since_overhaul_h: float


class Aircraft(_M):
    tail: str
    type: str
    base: str
    age_years: float
    airframe_hours: float
    airframe_life_hours: float
    engines: list[EngineInstall]

    @property
    def engine_unit_ids(self) -> list[int]:
        return [e.replay_unit for e in self.engines]


class SystemDef(_M):
    id: SystemKind
    name: str
    weight: float
    mission_critical: bool | Literal["role"]
    provenance: Provenance


class Part(_M):
    lru: str
    system: SystemKind
    name: str
    cost: float                # ₵ ILLUSTRATIVE
    install_hours: float
    lead_time_days: float
    criticality: int = Field(ge=1, le=3)


class StockLevel(_M):
    node: str
    lru: str
    qty: int = Field(ge=0)


class SeasonalClosure(_M):
    start_mmdd: str
    end_mmdd: str
    reason: str


class Route(_M):
    id: str
    from_node: str
    to_node: str
    mode: Literal["road", "air"]
    distance_km: float
    minutes: float             # door-to-door incl. handling
    geometry_file: str | None  # data/routes/... GeoJSON (road) or None (air: great circle)
    source: Literal["osrm", "great_circle", "fallback"]
    seasonal_closure: SeasonalClosure | None = None


class Mission(_M):
    day: int
    date: str
    base: str
    type: str
    sorties: int
    duration_h: float
    criticality: Literal["training", "routine", "operational"]


# ------------------------------------------------------------------------- state / decisions / plans
class SystemState(_M):
    tail: str
    system: SystemKind
    health: float = Field(ge=0, le=100)
    rul_p10: float
    rul_p50: float
    rul_p90: float
    p_fail_window: float = Field(ge=0, le=1)
    drivers: list[str] = []
    provenance: Provenance


class WorkOrder(_M):
    tail: str
    tasks: list[str]
    base: str
    slot_day: int
    hours: float
    kind: Literal["planned", "unplanned"]


class Decision(_M):
    tail: str
    action: Action
    reason: str
    key_sensors: list[str]
    confidence: Literal["high", "medium", "low"]


class Scenario(_M):
    name: str
    events: list[dict]  # type: ignore[type-arg]


class PolicyRun(_M):
    policy: Literal["P0", "P1", "P2", "P3"]
    scenario: str
    seed: int
    metrics: dict[str, float]
