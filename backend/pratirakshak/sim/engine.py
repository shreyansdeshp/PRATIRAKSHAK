"""90-day fleet simulation (SPEC §9.6). SIMULATED.

Truth comes from the generator (non-engine damage) and from REAL C-MAPSS replay trajectories (engines). Policies only
see what a real operator would: observed sensors (with faults) and, for P3, the trained models' estimates.
Common random numbers: every random draw comes from an RNG keyed by (seed, day, purpose), so all policies face the same
sorties, wear increments, sensor noise and sensor faults until their actions make the fleets differ.
"""

from __future__ import annotations

import copy
import math
from collections import Counter, deque
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from pratirakshak.decide.combine import critical_systems
from pratirakshak.decide.rule import Context, decide_system
from pratirakshak.decide.spares import Logistics
from pratirakshak.intelligence.trust import GroupRelation, score
from pratirakshak.io import load_config, read_json
from pratirakshak.models import conformal as C
from pratirakshak.plan.scheduler import BaseCapacity, Task, Visit, greedy, make_visits
from pratirakshak.settings import MODELS_DIR, PROCESSED_DIR, derive_seed
from pratirakshak.synth.model import STRESSES, SYSTEMS, Drivers, FaultState, SynthModel
from pratirakshak.synth.train import QUANTILES, SystemPredictor, window_features

ENGINE_LRU = "ENG-QEC"  # in the sim an engine action is a quick engine change (fresh REAL trajectory)
POLICIES = ["P0", "P1", "P2", "P3"]
POLICY_LABEL = {"P0": "Run-to-failure", "P1": "Fixed interval", "P2": "Threshold alarms", "P3": "Pratirakshak"}


# ============================================================================================ shared data
@dataclass
class SimData:
    """Everything loaded once per process (read-only during runs)."""

    world: dict[str, Any]
    wcfg: dict[str, Any]
    syscfg: dict[str, Any]
    coup: dict[str, Any]
    policies: dict[str, Any]
    costs: dict[str, Any]
    scen: dict[str, Any]
    env: pd.DataFrame
    missions: pd.DataFrame
    d0: np.ndarray
    dss0: np.ndarray
    replay_q: dict[str, dict[int, np.ndarray]]     # subset → unit → (life, Q) serving quantiles per cycle
    replay_z: dict[str, dict[int, np.ndarray]]     # subset → unit → (life, 14) z-scored inputs (for P2 alarms)
    replay_life: dict[str, dict[int, int]]
    inputs: list[str]
    predictor: SystemPredictor
    relations: dict[str, GroupRelation]

    @property
    def aircraft(self) -> list[dict[str, Any]]:
        return self.world["aircraft"]


def build_engine_cache() -> dict[str, Any]:
    """Replay-engine arrays the simulator needs (serving quantiles + z-scored inputs per cycle). Built ONCE in the
    parent process: workers load this small cache instead of re-running the full pre-processing (memory!)."""
    from pratirakshak.models.engine_data import prepare

    world = read_json(PROCESSED_DIR / "world" / "world.json")
    rq, rz, rl = {}, {}, {}
    inputs: list[str] = []
    for sub in sorted({e["cmapss_subset"] for a in world["aircraft"] for e in a["engines"]}):
        df = pd.read_parquet(MODELS_DIR / "engine" / sub / "replay_predictions.parquet")
        qcols = [f"q{int(round(q * 100)):02d}" for q in QUANTILES]
        rq[sub] = {int(u): g.sort_values("cycle")[qcols].to_numpy() for u, g in df.groupby("unit")}
        rl[sub] = {u: len(v) for u, v in rq[sub].items()}
        p = prepare(sub)
        inputs = p.cfg["inputs"]
        rz[sub] = {int(u): p.replay_z[(p.replay_df["unit"] == u).to_numpy()] for u in p.replay_df["unit"].unique()}
        del p
    return {"replay_q": rq, "replay_z": rz, "replay_life": rl, "inputs": inputs}


def load_sim_data(relations: dict[str, GroupRelation], engine_cache: dict[str, Any]) -> SimData:
    world = read_json(PROCESSED_DIR / "world" / "world.json")
    latent = read_json(PROCESSED_DIR / "state" / "d0_latent.json")
    assert latent["tails"] == [a["tail"] for a in world["aircraft"]]
    rq, rz, rl, inputs = (engine_cache[k] for k in ("replay_q", "replay_z", "replay_life", "inputs"))
    return SimData(world, load_config("world"), load_config("systems"), load_config("couplings"), load_config("policies"),
                   load_config("costs"), load_config("scenarios"),
                   pd.read_parquet(PROCESSED_DIR / "world" / "environment.parquet"),
                   pd.read_parquet(PROCESSED_DIR / "world" / "missions.parquet"),
                   np.array(latent["damage"], dtype=float), np.array(latent["days_since_service"], dtype=float),
                   rq, rz, rl, inputs, SystemPredictor(), relations)


# ============================================================================================ run options
@dataclass
class RunOptions:
    policy: str
    scenario: str = "base"
    seed: int = 0
    detection_delay: int = 0          # P3 acts on data this many days old
    use_trust: bool = True            # P3 ablation
    spares_aware: bool = True         # P3 ablation
    bundling: bool = True             # P3 ablation
    theta_scale: float = 1.0          # sensitivity
    usage_scale: float = 1.0          # sensitivity (on top of the scenario)
    stock_scale: float = 1.0          # sensitivity
    log_events: bool = False


# ============================================================================================ simulator
@dataclass
class Pending:
    tail_i: int
    system: str
    lru: str
    hours: float
    due: int
    release: int
    weight: float
    kind: str                 # preventive | unplanned | verify
    pulled: bool = False
    ordered: bool = False


@dataclass
class Simulator:
    data: SimData
    opt: RunOptions
    log: list[dict[str, Any]] = field(default_factory=list)

    # ---------------------------------------------------------------------------------- setup
    def __post_init__(self) -> None:
        D, o = self.data, self.opt
        self.sc = D.scen["scenarios"][o.scenario]
        self.H = D.scen["horizon_days"]
        self.start = date.fromisoformat(D.wcfg["calendar"]["sim_start"])
        self.A = len(D.aircraft)
        self.tails = [a["tail"] for a in D.aircraft]
        self.types = {t["id"]: t for t in D.wcfg["aircraft_types"]}
        self.base_of = [a["base"] for a in D.aircraft]
        self.type_of = [a["type"] for a in D.aircraft]
        tempo = {b["id"]: b["tempo"] for b in D.wcfg["bases"]}
        self.spd = np.array([self.types[t]["sorties_per_day"] * tempo[b] for t, b in zip(self.type_of, self.base_of, strict=True)])
        self.k = np.array([self.types[t]["engine_cycle_to_sorties"] for t in self.type_of])
        self.intensity = np.array([self.types[t]["intensity"] for t in self.type_of])
        syscfg = copy.deepcopy(D.syscfg)
        if "fault_hazard_multiplier" in self.sc:
            syscfg["sensor_faults"]["hazard_per_sensor_day"] *= self.sc["fault_hazard_multiplier"]
        self.model = SynthModel(cfg=syscfg)
        world = copy.deepcopy(D.world)
        if "road_closed_nodes" in self.sc:
            for r in world["routes"]:
                if r["mode"] == "road" and ({r["from_node"], r["to_node"]} & set(self.sc["road_closed_nodes"])):
                    r["seasonal_closure"] = {"start_mmdd": "01-01", "end_mmdd": "12-31", "reason": "supply cut (scenario)"}
        pol = copy.deepcopy(D.policies)
        pol["vendor_dispatch_hours"] += self.sc.get("vendor_extra_hours", 0)
        self.logistics = Logistics(world, pol)
        self.parts = {p["lru"]: p for p in world["parts"]}
        self.ctx = Context(self.logistics, self.parts, policies=pol, costs=D.costs, systems_cfg=D.syscfg)
        self.stock: dict[tuple[str, str], int] = {k: int(round(v * o.stock_scale)) if self.logistics.nodes[k[0]]["kind"] != "vendor_hub"
                                                  else v for k, v in self.logistics.stock.items()}
        self.bays = {b["id"]: b["hangar_bays"] for b in D.wcfg["bases"]}
        self.tech = {b["id"]: b["tech_hours_per_day"] for b in D.wcfg["bases"]}
        n_type = Counter(zip(self.base_of, self.type_of, strict=True))
        self.allow = {(b, t): max(int(math.floor(n * (1 - D.wcfg["readiness_floor"]))), 1) for (b, t), n in n_type.items()}
        self.trust_cfg = load_config("intelligence")["trust"]
        self.crit = {s["id"]: s["mission_critical"] for s in D.wcfg["systems"]}
        self.critical = [critical_systems(self.crit, self.types[t]["criticality_role"]) for t in self.type_of]

        # state
        self.d = D.d0.copy()
        self.dss = D.dss0.copy()
        self.fs = FaultState.empty(self.A, len(self.model.sensors))
        self.engines = [[{"sub": e["cmapss_subset"], "unit": e["replay_unit"], "cycle": float(max(e["start_cycle"], 1))}
                         for e in a["engines"]] for a in D.aircraft]
        self.status = ["up"] * self.A           # up | hangar | aog | grounded
        self.busy_until = [0] * self.A
        self.visits: list[tuple[int, Visit, list[Pending]]] = []
        self.pending: list[Pending] = []
        self.transit: list[tuple[int, str, str, int]] = []   # (arrive day, node, lru, qty)
        W = D.syscfg["feature_window_days"]
        self.buf_obs: deque[np.ndarray] = deque(maxlen=W + 8)
        self.buf_stress: deque[np.ndarray] = deque(maxlen=W + 8)
        self.buf_usage: deque[np.ndarray] = deque(maxlen=W + 8)
        self.buf_engine: deque[list[list[float]]] = deque(maxlen=10)  # per aircraft, per engine cycle
        self._seed_history()
        self.m = Counter()
        self.ready_curve: list[float] = []
        self.ready_by_base: dict[str, list[float]] = {b: [] for b in self.bays}
        self.hangar_by_base: dict[str, list[int]] = {b: [] for b in self.bays}
        self.damage_curve: list[list[float]] = []
        self.wasted: list[float] = []
        self._prev_fault = np.zeros((self.A, len(self.model.sensors)), dtype=bool)

    def rng(self, day: int, purpose: str) -> np.random.Generator:
        return np.random.default_rng(derive_seed("sim", self.opt.scenario, self.opt.seed, day, purpose))

    def _seed_history(self) -> None:
        """Warm the 14-day buffers with the real D+0 sensor history (same for every policy)."""
        hist = pd.read_parquet(PROCESSED_DIR / "state" / "sensor_history.parquet")
        cube = hist.pivot_table(index=["day", "tail"], columns="sensor", values="value", dropna=False)
        cube = cube.reindex(columns=self.model.sensor_ids)
        days = sorted(hist["day"].unique())[-(self.buf_obs.maxlen or 22):]
        env0 = self._stress(0)
        for dd in days:
            self.buf_obs.append(cube.loc[dd].reindex(self.tails).to_numpy(dtype=float))
            self.buf_stress.append(env0)
            self.buf_usage.append(np.ones(self.A))
        self.buf_engine.append([[e["cycle"] for e in es] for es in self.engines])

    # ---------------------------------------------------------------------------------- helpers
    def _stress(self, day: int) -> np.ndarray:
        e = self.data.env
        row = e[e["day"] == min(day, e["day"].max())].set_index("base")
        out = np.array([[row.loc[b, s] for s in STRESSES] for b in self.base_of], dtype=float)
        for b, add in self.sc.get("stress_add", {}).items():
            for s, v in add.items():
                out[np.array(self.base_of) == b, STRESSES.index(s)] += v
        return np.clip(out, 0, 1.5)

    def _event(self, day: int, i: int, kind: str, **kw: Any) -> None:
        if self.opt.log_events:
            self.log.append({"day": day, "tail": self.tails[i], "base": self.base_of[i], "kind": kind, **kw})

    def _take_part(self, i: int, lru: str, day: int) -> tuple[int, float]:
        """Get one LRU to aircraft i's base: (ready day, expedite ₵). Consumes stock; orders vendor replenishment."""
        base = self.base_of[i]
        vahak = {self.base_of[j] for j in range(self.A) if self.type_of[j] == "VAH" and self.status[j] == "up"}
        srcs = self.logistics.sources(lru, base, self.start + timedelta(days=day), vahak, stock=self.stock)
        usable = [s for s in srcs if s.eta_hours != float("inf")]
        if not usable:
            self.m["stockouts"] += 1
            return day + math.ceil(self.parts[lru]["lead_time_days"]), 0.0
        s = usable[0]
        self.stock[(s.node, lru)] -= 1
        vendor = next(n for n, v in self.logistics.nodes.items() if v["kind"] == "vendor_hub")
        if s.node != vendor and self.stock.get((vendor, lru), 0) > 0:
            self.stock[(vendor, lru)] -= 1
            self.transit.append((day + math.ceil(self.parts[lru]["lead_time_days"]), s.node, lru, 1))
        cost = 0.0
        if s.mode == "road":
            cost = s.distance_km * self.data.costs["expedite"]["road_cost_per_km"]
            self.m["expedites"] += 1
        elif s.mode == "air":
            cost = s.eta_hours * self.data.costs["expedite"]["air_cost_per_hour"]
            self.m["expedites"] += 1
        return day + math.ceil(s.eta_hours / 24), cost

    def _has_pending(self, i: int, system: str) -> Pending | None:
        for p in self.pending:
            if p.tail_i == i and p.system == system:
                return p
        for _, _, ps in self.visits:
            for p in ps:
                if p.tail_i == i and p.system == system:
                    return p
        return None

    def _add_task(self, day: int, i: int, system: str, lru: str, kind: str, due: int, weight: float,
                  pulled: bool = False, order_now: bool = False) -> None:
        ex = self._has_pending(i, system)
        if ex is not None:
            ex.due = min(ex.due, due)
            ex.weight = max(ex.weight, weight)
            ex.pulled = ex.pulled or pulled
            return
        part = self.parts[lru]
        hours = 2.0 if kind == "verify" else part["install_hours"] * self.data.policies["tech_hours_factor"]
        if kind == "unplanned":
            hours *= self.data.costs["unplanned"]["downtime_multiplier"]
        p = Pending(i, system, lru, hours, due, day, weight, kind, pulled)
        if order_now and kind != "verify":
            p.release, cost = self._take_part(i, lru, day)
            p.release += (math.ceil(self.data.costs["unplanned"]["aog_wait_hours"] / 24) if kind == "unplanned" else 0)
            p.ordered = True
            self.m["cost_expedite"] += cost
        self.pending.append(p)

    # ---------------------------------------------------------------------------------- day steps
    def _scenario_events(self, t: int) -> None:
        sc = self.sc
        if self.opt.scenario == "strike" and t == sc["day"]:
            b = sc["base"]
            self.bays[b] = max(1, math.ceil(self.bays[b] * (1 - sc["bay_loss_fraction"])))
            if sc.get("store_lost"):
                for key in list(self.stock):
                    if key[0] == b:
                        self.stock[key] = 0
            idx = [i for i in range(self.A) if self.base_of[i] == b and self.status[i] in ("up", "grounded")]
            rng = self.rng(t, "strike")
            for i in rng.choice(idx, size=min(sc["damaged_aircraft"], len(idx)), replace=False):
                self.d[i, SYSTEMS.index("structure")] += 0.5
                self.d[i, int(rng.integers(0, len(SYSTEMS) - 1))] = 1.0
                self._event(t, int(i), "strike_damage")

    def _arrivals(self, t: int) -> None:
        keep = []
        for arr, node, lru, q in self.transit:
            if arr <= t:
                self.stock[(node, lru)] = self.stock.get((node, lru), 0) + q
            else:
                keep.append((arr, node, lru, q))
        self.transit = keep
        still = []
        for end, v, ps in self.visits:
            if end > t:
                still.append((end, v, ps))
                continue
            i = ps[0].tail_i
            mask = np.zeros((self.A, len(SYSTEMS)), dtype=bool)
            for p in ps:
                if p.system == "engines":
                    for e in self.engines[i]:
                        if p.kind != "unplanned":
                            self.wasted.append(max(0.0, 1 - e["cycle"] / self.data.replay_life[e["sub"]][e["unit"]]))
                        pool = sorted(self.data.replay_life[e["sub"]])
                        e["unit"] = int(self.rng(t, f"engine-{i}").choice(pool))
                        e["cycle"] = 1.0
                elif p.kind == "verify":
                    cols = np.where(self.model.sensor_system == SYSTEMS.index(p.system))[0]
                    self.fs.code[i, cols] = 0
                    self.fs.offset[i, cols] = 0
                else:
                    j = SYSTEMS.index(p.system)
                    if p.kind != "unplanned":
                        self.wasted.append(max(0.0, 1 - float(self.d[i, j])))
                    mask[i, j] = True
                    self.dss[i, j] = 0
            if mask.any():
                self.d = self.model.service(self.d, mask, self.rng(t, f"service-{i}"))
                self.d[mask] = np.minimum(self.d[mask], 0.05) if any(p.kind == "unplanned" for p in ps) else self.d[mask]
            self.status[i] = "up"
            self._event(t, i, "visit_end", visit=v.id)
        self.visits = still

    def _fly(self, t: int) -> tuple[np.ndarray, np.ndarray]:
        M = self.data.missions
        md = M[M["day"] == t]
        mult = self.sc.get("sortie_multiplier", 1.0) if t >= self.sc.get("from_day", 0) else 1.0
        mult *= self.opt.usage_scale
        rng = self.rng(t, "sorties")
        sorties = np.zeros(self.A)
        nominal = np.zeros(self.A)
        for _, r in md.iterrows():
            idx = [i for i in range(self.A) if self.base_of[i] == r["base"] and self.type_of[i] == r["type"]]
            up = [i for i in idx if self.status[i] == "up"]
            demand = r["sorties"] * mult
            self.m["sorties_demanded"] += demand
            for i in idx:
                nominal[i] = self.spd[i]
            if not up or demand <= 0:
                continue
            rate = min(demand / len(up), 3 * float(np.mean(self.spd[up])))
            draw = rng.poisson(rate, size=len(up)).astype(float)
            sorties[up] = draw
            self.m["sorties_flown"] += float(draw.sum())
        return sorties, nominal

    def _fail(self, t: int, flew: np.ndarray) -> None:
        rng = self.rng(t, "cascade")
        for i in range(self.A):
            if self.status[i] in ("hangar", "aog"):
                continue
            failed = [SYSTEMS[j] for j in range(len(SYSTEMS)) if self.d[i, j] >= 1]
            failed += ["engines"] * any(e["cycle"] >= self.data.replay_life[e["sub"]][e["unit"]] for e in self.engines[i])
            if not failed:
                continue
            self.m["unplanned_failures"] += len(failed)
            if flew[i] > 0:
                self.m["inflight_failures"] += 1
                self.m["cost_abort"] += self.data.costs["unplanned"]["mission_abort_cost"]
            self.status[i] = "aog"
            for s in failed:
                lru = ENGINE_LRU if s == "engines" else self.ctx.systems_cfg["systems"][s]["lru"][0]
                self._add_task(t, i, s, lru, "unplanned", due=t, weight=500, order_now=True)
                self._event(t, i, "failure", system=s, in_flight=bool(flew[i] > 0))
                if rng.random() < self.data.costs["unplanned"]["cascade_probability"] and s != "engines":
                    src = SYSTEMS.index(s)
                    tgt = [x for x in self.data.coup["systems"].get(s, {})] or [SYSTEMS[(src + 1) % len(SYSTEMS)]]
                    self.d[i, SYSTEMS.index(tgt[0])] += 0.3
                    self.m["cascades"] += 1

    # ---------------------------------------------------------------------------------- policies
    def _policy(self, t: int) -> None:
        o, D = self.opt, self.data
        bl = D.scen["baselines"]
        if o.policy == "P0":
            return
        if o.policy == "P1":
            interval = self._legacy_interval(bl["p1_fraction"])
            med = {sub: float(np.median(list(v.values()))) for sub, v in D.replay_life.items()}
            for i in range(self.A):
                if self.status[i] != "up":
                    continue
                for j, s in enumerate(SYSTEMS):
                    if self.dss[i, j] >= interval[i, j] - 7:
                        due = t + max(0, int(interval[i, j] - self.dss[i, j]))
                        self._add_task(t, i, s, self.ctx.systems_cfg["systems"][s]["lru"][0], "preventive", due, 5, order_now=True)
                if any(e["cycle"] >= bl["p1_engine_fraction"] * med[e["sub"]] for e in self.engines[i]):
                    self._add_task(t, i, "engines", ENGINE_LRU, "preventive", t + 3, 5, order_now=True)
            return
        if o.policy == "P2":
            self._p2(t)
            return
        self._p3(t)

    def _legacy_interval(self, frac: float) -> np.ndarray:
        if not hasattr(self, "_interval"):
            from pratirakshak.synth.train import legacy_intervals

            self._interval = legacy_intervals(self.model, self.type_of, self.base_of, frac)
        return self._interval

    def _p2(self, t: int) -> None:
        """Threshold alarms on raw readings (faults included). Limit tables allow for ambient conditions, and a
        system just serviced is not re-alarmed for 7 days (a fair, not straw-man, alarm practice)."""
        D = self.data
        frac = D.scen["baselines"]["p2_signature_fraction"]
        recent = np.nanmean(np.stack(list(self.buf_obs)[-3:]), axis=0)  # (A, M) 3-day mean, faults included
        env = np.stack(list(self.buf_stress)[-3:]).mean(0)              # (A, 7)
        for k, sen in enumerate(self.model.sensors):
            if sen["kind"] != "analog":
                continue
            expected = sen["healthy"] + sum(c * env[:, STRESSES.index(e)] for e, c in sen.get("env", {}).items())
            moved = (recent[:, k] - expected) / sen["effect"]
            j = SYSTEMS.index(sen["system"])
            for i in np.where(moved >= frac)[0]:
                if self.status[i] == "up" and self.dss[i, j] >= 7:
                    self._add_task(t, int(i), sen["system"], self.data.policies["sensor_lru"].get(sen["id"],
                                   self.ctx.systems_cfg["systems"][sen["system"]]["lru"][0]), "preventive", t, 20)
        idx = {s: D.inputs.index(s) for s in ("s3", "s11", "s7")}
        for i in range(self.A):
            if self.status[i] != "up":
                continue
            for e in self.engines[i]:
                if e["cycle"] < 20:  # freshly changed engine
                    continue
                z = D.replay_z[e["sub"]][e["unit"]]
                c = int(min(e["cycle"], len(z))) - 1
                w = z[max(0, c - 2) : c + 1]
                score_ = float(np.mean(w[:, idx["s3"]] + w[:, idx["s11"]] - w[:, idx["s7"]]) / 3)
                if score_ >= D.scen["baselines"]["p2_engine_z"]:
                    self._add_task(t, i, "engines", ENGINE_LRU, "preventive", t, 20)

    def _p3(self, t: int) -> None:
        o, D = self.opt, self.data
        lag = o.detection_delay
        W = D.syscfg["feature_window_days"]
        obs = np.stack(list(self.buf_obs))
        stress = np.stack(list(self.buf_stress))
        usage = np.stack(list(self.buf_usage))
        end = len(obs) - lag
        if end < W:
            return
        win, st, us = obs[end - W : end], stress[end - W : end], usage[end - W : end]
        up = [i for i in range(self.A) if self.status[i] == "up"]
        if not up:
            return
        est: dict[int, list[dict[str, Any]]] = {i: [] for i in up}
        # Late detection = sensor data arrives `lag` days late and is (naively) treated as current. Maintenance records
        # are current: a system serviced within the lag has no post-service readings yet, so it is not re-assessed.
        for j, s in enumerate(SYSTEMS):
            cols = np.where(self.model.sensor_system == j)[0]
            X = window_features(np.moveaxis(win[:, up][:, :, cols], 0, 2), np.maximum(self.dss[up, j] - lag, 0),
                                us[:, up].mean(0), st[:, up].mean(0), self.intensity[up])
            q = D.predictor.quantiles(s, X)
            pf = C.p_fail_within(q, QUANTILES, D.syscfg["window_days"])
            rel = D.relations[s]
            acols = [self.model.sensor_ids.index(n) for n in rel.names]
            comp = score(rel, np.moveaxis(win[:, up][:, :, acols], 0, 1), np.moveaxis(st[:, up], 0, 1), self.trust_cfg)
            mean7 = np.nanmean(win[-7:, up][:, :, acols], axis=0)
            env = st[-1, up]
            for n_i, i in enumerate(up):
                if lag and self.dss[i, j] <= lag:
                    continue  # readings predate the last service
                devs = []
                for a_k, name in enumerate(rel.names):
                    sen = self.model.sensors[acols[a_k]]
                    exp = sen["healthy"] + sum(c * env[n_i, STRESSES.index(e)] for e, c in sen.get("env", {}).items())
                    devs.append(((mean7[n_i, a_k] - exp) / sen["effect"], name, comp["trust"][n_i, a_k]))
                devs.sort(key=lambda x: 9.0 if math.isnan(x[0]) else -x[0])
                drivers = [{"sensor": n} for _, n, _ in devs[:3]]
                min_trust = min(tr for _, _, tr in devs[:3]) if o.use_trust else 100.0
                est[i].append({"system": s, "p_fail": float(pf[n_i]), "rul_p10": q[n_i, 1], "rul_p50": q[n_i, 5],
                               "rul_p90": q[n_i, 9], "drivers": drivers, "min_trust": min_trust, "failed": False})
        eng_hist = list(self.buf_engine)
        cyc_then = eng_hist[-1 - min(lag, len(eng_hist) - 1)]
        for i in up:
            cpd = max(float(self.spd[i] / self.k[i]), 0.2)
            worst = None
            for k_e, e in enumerate(self.engines[i]):
                qs = D.replay_q[e["sub"]][e["unit"]]
                then = cyc_then[i][k_e]
                cyc = then if (lag and then <= e["cycle"]) else e["cycle"]  # engine changed within the lag → current
                c = int(min(max(cyc, 1), len(qs))) - 1
                qd = qs[c] / cpd
                p = float(C.p_fail_within(qd[None], QUANTILES, D.syscfg["window_days"])[0])
                if worst is None or p > worst[0]:
                    worst = (p, qd)
            assert worst is not None
            est[i].append({"system": "engines", "p_fail": worst[0], "rul_p10": worst[1][1], "rul_p50": worst[1][5],
                           "rul_p90": worst[1][9], "drivers": [{"sensor": "s11", "part": "High-pressure compressor"}],
                           "min_trust": 100.0, "failed": False})
        crit_today = self.data.missions[self.data.missions["day"] == t].set_index(["base", "type"])["criticality"].to_dict()
        vahak = {self.base_of[j] for j in range(self.A) if self.type_of[j] == "VAH" and self.status[j] == "up"}
        on = self.start + timedelta(days=t)
        for i in up:
            crit = crit_today.get((self.base_of[i], self.type_of[i]), "training")
            theta = min(0.95, self.ctx.policies["theta"][crit] * o.theta_scale)
            for e_ in est[i]:
                if e_["system"] == "engines":
                    dec = self._engine_decision(e_, theta)
                else:
                    if e_["p_fail"] < self.ctx.policies["monitor_band"] * theta and e_["rul_p10"] > self.ctx.policies["schedule_lookahead_days"]:
                        continue
                    dec = decide_system(e_, theta, crit, self.base_of[i], on, vahak, self.ctx, stock=self.stock)
                self._apply_decision(t, i, e_, dec)

    def _engine_decision(self, e_: dict[str, Any], theta: float) -> dict[str, Any]:
        p, p10 = e_["p_fail"], e_["rul_p10"]
        if p >= theta:
            return {"action": "PULL_FROM_LINE" if p10 * 24 < self.parts[ENGINE_LRU]["install_hours"] else "EXPEDITE_SPARE",
                    "lru": ENGINE_LRU}
        if p >= self.ctx.policies["monitor_band"] * theta or p10 <= self.ctx.policies["schedule_lookahead_days"]:
            return {"action": "SCHEDULE_SERVICE", "lru": ENGINE_LRU}
        return {"action": "SERVE_NORMALLY", "lru": ENGINE_LRU}

    def _apply_decision(self, t: int, i: int, e_: dict[str, Any], dec: dict[str, Any]) -> None:
        a = dec["action"]
        if a == "SERVE_NORMALLY":
            return
        due = t + max(0, int(e_["rul_p10"]))
        w = e_["p_fail"] * 100 + 1
        aware = self.opt.spares_aware
        if a == "VERIFY_SENSOR":
            self._add_task(t, i, e_["system"], dec["lru"], "verify", t + 2, w)
            self.m["verify_actions"] += 1
            return
        if not aware and a in ("PULL_FROM_LINE", "EXPEDITE_SPARE"):
            # ablation: no spares-awareness → no ETA-vs-deadline reasoning, no ordering ahead; keep flying until the visit
            self._add_task(t, i, e_["system"], dec["lru"], "preventive", t, w, order_now=False)
            return
        if a == "PULL_FROM_LINE":
            self.status[i] = "grounded"
            self.m["pulls"] += 1
            self._add_task(t, i, e_["system"], dec["lru"], "preventive", t, w + 50, pulled=True, order_now=True)
            self._event(t, i, "pull", system=e_["system"], p_fail=round(e_["p_fail"], 3))
            return
        urgent = a in ("EXPEDITE_SPARE",) or dec.get("urgent")
        self._add_task(t, i, e_["system"], dec["lru"], "preventive", t if urgent else due, w, order_now=aware)

    # ---------------------------------------------------------------------------------- scheduling
    def _schedule(self, t: int) -> None:
        if not self.pending:
            return
        pol = self.ctx.policies
        tasks, back = [], {}
        for p in self.pending:
            if not p.ordered and p.kind != "verify" and self.stock.get((self.base_of[p.tail_i], p.lru), 0) <= 0:
                p.release, cost = self._take_part(p.tail_i, p.lru, t)
                p.ordered = True
                self.m["cost_expedite"] += cost
            tk = Task(self.tails[p.tail_i], self.base_of[p.tail_i], self.type_of[p.tail_i], p.system, p.lru, p.hours,
                      max(0, p.release - t), max(0, p.due - t), p.weight, p.pulled)
            tasks.append(tk)
            back[(tk.tail, tk.system)] = p
        tol = pol["bundle_tolerance_days"] if (self.opt.bundling or self.opt.policy != "P3") else 0
        visits = make_visits(tasks, tol, self.data.costs["planned"]["setup_hours"], pol["crew_hours_per_bay_day"])
        # capacity left after visits already in progress
        cap = {}
        for b in self.bays:
            occupied = [v for _, v, _ in self.visits if v.base == b]
            used_bays = len(occupied)
            used_h = sum(v.hours / v.duration for v in occupied)
            allow = {ty: max(n - sum(1 for v in occupied if v.type == ty), 0) for (bb, ty), n in self.allow.items() if bb == b}
            cap[b] = BaseCapacity(max(self.bays[b] - used_bays, 0), max(self.tech[b] - used_h, 0), allow)
        for v in visits:  # unplanned/AOG work may use the readiness allowance (aircraft is down anyway)
            if any(back[(v.tail, tk.system)].kind == "unplanned" or back[(v.tail, tk.system)].pulled for tk in v.tasks):
                cap[v.base].type_allowance[v.type] = cap[v.base].type_allowance.get(v.type, 0) + 1
        greedy(visits, cap, 30)
        started = set()
        for v in visits:
            if v.start != 0:
                continue
            i = self.tails.index(v.tail)
            if self.status[i] == "hangar":
                continue
            ps = [back[(v.tail, tk.system)] for tk in v.tasks]
            for p in ps:
                if self.stock.get((self.base_of[i], p.lru), 0) > 0 and p.kind != "verify" and not p.ordered:
                    self.stock[(self.base_of[i], p.lru)] -= 1
                    vendor = next(n for n, x in self.logistics.nodes.items() if x["kind"] == "vendor_hub")
                    if self.stock.get((vendor, p.lru), 0) > 0:
                        self.stock[(vendor, p.lru)] -= 1
                        self.transit.append((t + math.ceil(self.parts[p.lru]["lead_time_days"]), self.base_of[i], p.lru, 1))
                planned = p.kind != "unplanned"
                part = self.parts[p.lru]
                labour = p.hours * self.data.costs["planned"]["labour_cost_per_hour"]
                if planned:
                    self.m["planned_hours"] += p.hours
                    self.m["cost_planned"] += part["cost"] + labour if p.kind != "verify" else labour
                else:
                    self.m["unplanned_hours"] += p.hours + self.data.costs["unplanned"]["aog_wait_hours"]
                    self.m["cost_unplanned"] += (part["cost"] + labour) * self.data.costs["unplanned"]["cost_multiplier"]
                started.add(id(p))
            self.status[i] = "hangar"
            self.visits.append((t + v.duration, v, ps))
            self.m["visits"] += 1
            self.m["hangar_days"] += v.duration
            self._event(t, i, "visit_start", visit=v.id, duration=v.duration, planned=all(p.kind != "unplanned" for p in ps),
                        systems=[p.system for p in ps])
        self.pending = [p for p in self.pending if id(p) not in started]

    # ---------------------------------------------------------------------------------- run
    def run(self) -> dict[str, Any]:
        for t in range(self.H):
            self._scenario_events(t)
            self._arrivals(t)
            stress = self._stress(t)
            sorties, nominal = self._fly(t)
            eng_d = np.array([np.mean([e["cycle"] / self.data.replay_life[e["sub"]][e["unit"]] for e in es]) for es in self.engines])
            dr = Drivers(sorties, nominal, self.intensity, {s: stress[:, k] for k, s in enumerate(STRESSES)}, eng_d)
            dr.hard_landings = self.model.hard_landings(dr, self.rng(t, "landings"))
            idle = np.array([s in ("hangar",) for s in self.status])
            new_d = self.model.step(self.d, dr, self.rng(t, "damage"))
            self.d = np.where(idle[:, None], self.d, new_d)
            accel = 1 + sum(c * stress[:, STRESSES.index(e)] for e, c in self.data.coup["engine_cycle_acceleration"].items())
            for i, es in enumerate(self.engines):
                for e in es:
                    e["cycle"] += sorties[i] / self.k[i] * accel[i]
            self.dss += 1
            self._fail(t, sorties)
            y = self.model.observe(self.d, dr, self.rng(t, "observe"), self.fs)
            now_fault = self.fs.applied > 0
            self.m["sensor_fault_onsets"] += int((now_fault & ~self._prev_fault).sum())
            self._prev_fault = now_fault
            self.buf_obs.append(y)
            self.buf_stress.append(stress)
            self.buf_usage.append(np.where(nominal > 0, sorties / np.maximum(nominal, 1e-6), 0.0))
            self.buf_engine.append([[float(e["cycle"]) for e in es] for es in self.engines])
            self._policy(t)
            self._schedule(t)
            up = np.array([s == "up" for s in self.status])
            self.ready_curve.append(float(up.mean()))
            for b in self.ready_by_base:
                m = np.array(self.base_of) == b
                self.ready_by_base[b].append(float(up[m].mean()))
                self.hangar_by_base[b].append(int(sum(1 for i in np.where(m)[0] if self.status[i] == "hangar")))
            self.damage_curve.append([round(float(x), 4) for x in np.minimum(self.d, 1.2).mean(0)])
        m = self.m
        out = {
            "policy": self.opt.policy, "scenario": self.opt.scenario, "seed": self.opt.seed,
            "ready_pct": round(100 * float(np.mean(self.ready_curve)), 3),
            "sortie_fill_pct": round(100 * m["sorties_flown"] / max(m["sorties_demanded"], 1e-9), 3),
            "unplanned_failures": int(m["unplanned_failures"]), "inflight_failures": int(m["inflight_failures"]),
            "planned_hours": round(m["planned_hours"], 1), "unplanned_hours": round(m["unplanned_hours"], 1),
            "wasted_life_pct": round(100 * float(np.mean(self.wasted)), 2) if self.wasted else 0.0,
            "stockouts": int(m["stockouts"]), "expedites": int(m["expedites"]), "pulls": int(m["pulls"]),
            "verify_actions": int(m["verify_actions"]), "cascades": int(m["cascades"]), "visits": int(m["visits"]),
            "cost": round(m["cost_planned"] + m["cost_unplanned"] + m["cost_abort"] + m["cost_expedite"], 1),
            "sensor_fault_onsets": int(m["sensor_fault_onsets"]), "hangar_days": int(m["hangar_days"]),
            "ready_curve": [round(x, 4) for x in self.ready_curve],
            "ready_by_base": {b: [round(x, 4) for x in v] for b, v in self.ready_by_base.items()},
            "hangar_by_base": self.hangar_by_base,
            "damage_curve": self.damage_curve,
        }
        if self.opt.log_events:
            out["events"] = self.log
        return out
