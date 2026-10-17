/** Typed views of the snapshot files (docs/SNAPSHOT_SCHEMA.md). Only fields the UI reads are declared. */

export type Status = "READY" | "WATCH" | "PULL";
export type Provenance = "REAL" | "REAL-ANCHORED" | "SIMULATED" | "ILLUSTRATIVE";
export type PolicyId = "P0" | "P1" | "P2" | "P3";
export type SystemId =
  | "engines"
  | "hydraulics"
  | "landing_gear"
  | "flight_controls"
  | "electrical"
  | "avionics"
  | "fuel"
  | "structure";

export interface Meta {
  project: string;
  tagline: string;
  seed: number;
  demo_seed: number;
  snapshot: string;
  sim_start: string;
  horizon_days: number;
  provenance_legend: Record<Provenance, string>;
  roles: { commander: string[]; vendor: string[] };
}

export interface Base {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  elevation_m: number;
  character: string;
  hangar_bays: number;
  tech_hours_per_day: number;
  env_d0: Record<string, number>;
}

export interface WorldNode {
  id: string;
  kind: "base" | "depot" | "vendor_hub";
  name: string;
  region: string;
  lat: number;
  lon: number;
}

export interface AircraftType {
  id: string;
  name: string;
  letter: string;
  role: string;
  engines: number;
  cmapss_subset: string;
  silhouette: string;
  airframe_life_hours: number;
}

export interface Route {
  id: string;
  from_node: string;
  to_node: string;
  mode: "road" | "air";
  distance_km: number;
  minutes: number;
  geometry: string | null;
  closure: { start_mmdd: string; end_mmdd: string; reason: string } | null;
}

export interface World {
  bases: Base[];
  nodes: WorldNode[];
  types: AircraftType[];
  systems: { id: SystemId; name: string; weight: number; mission_critical: boolean | "role"; provenance: Provenance }[];
  aircraft: { tail: string; type: string; base: string; age_years: number; airframe_hours: number; airframe_life_hours: number }[];
  parts: { lru: string; system: SystemId; name: string; cost: number; install_hours: number; lead_time_days: number }[];
  routes: Route[];
}

export interface Driver {
  sensor: string;
  name?: string;
  symbol?: string;
  text: string;
  unit?: string;
  part?: string;
  trust?: number | null;
}

export interface Confidence {
  level: "high" | "medium" | "low";
  reasons: string[];
  decision_margin: number;
  min_trust: number;
}

export interface SystemState {
  id: SystemId;
  health: number;
  p_fail: number;
  rul_days: [number, number, number];
  provenance: Provenance;
  confidence: Confidence;
  drivers: Driver[];
  action: string;
}

export interface AircraftState {
  tail: string;
  type: string;
  base: string;
  status: Status;
  limiting_system: SystemId;
  limiting_p: number;
  risk_window: number;
  weighted_health: number;
  body_health: number;
  age_years: number;
  airframe_life_used: number;
  action: string;
  action_system: SystemId;
  systems: SystemState[];
}

export interface Rollup {
  aircraft: number;
  ready: number;
  watch: number;
  pull: number;
  avg_health: number;
}

export interface FleetState {
  snapshot: string;
  window_days: number;
  aircraft: AircraftState[];
  summary: {
    fleet: Rollup;
    by_base: Record<string, Rollup>;
    by_type: Record<string, Rollup>;
    by_base_type: Record<string, Rollup>;
    limiting: Record<string, number>;
  };
}

export interface CI {
  mean: number;
  lo: number;
  hi: number;
  sd: number;
  n: number;
}

export interface Results {
  seeds: number;
  demo_seed: number;
  scenarios: Record<string, string>;
  policies: Record<PolicyId, string>;
  best_baseline: Record<string, PolicyId>;
  summary: Record<string, Record<PolicyId, Record<string, CI>>>;
  paired: Record<string, Record<string, CI & { per_seed?: number[] }> & { best_baseline: PolicyId }>;
  curves: Record<string, Record<PolicyId, { fleet: number[]; by_base: Record<string, number[]> }>>;
}
