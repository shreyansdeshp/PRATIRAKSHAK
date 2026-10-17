"""The single decision rule (SPEC §1.1) and its reason card (U1).

For each system on each aircraft: if P(fail before the next maintenance opportunity) ≥ θ for the mission, act now —
get the spare if it can arrive (and be fitted) before the lower-bound RUL, otherwise pull the aircraft from the line.
If not, schedule the work into the cheapest slot before the earliest plausible failure, bundled with the aircraft's
other jobs. A low-trust driving sensor turns "act now" into "verify the sensor first".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pratirakshak.decide.spares import Logistics, source_or_pull
from pratirakshak.intelligence.graph import ENGINE_PART_LRU
from pratirakshak.io import load_config

SYSTEM_NAME = {"engines": "Engine", "hydraulics": "Hydraulics", "landing_gear": "Landing gear & brakes",
               "flight_controls": "Flight controls", "electrical": "Electrical", "avionics": "Avionics / radar",
               "fuel": "Fuel", "structure": "Structure"}


@dataclass
class Context:
    """Everything the rule needs that is not per-system state."""

    logistics: Logistics
    parts: dict[str, dict[str, Any]]
    policies: dict[str, Any] = field(default_factory=lambda: load_config("policies"))
    costs: dict[str, Any] = field(default_factory=lambda: load_config("costs"))
    systems_cfg: dict[str, Any] = field(default_factory=lambda: load_config("systems"))
    untrusted_below: float = field(default_factory=lambda: load_config("intelligence")["trust"]["untrusted_below"])

    def __post_init__(self) -> None:
        self.window = self.systems_cfg["window_days"]
        self.severity = {a: i for i, a in enumerate(self.policies["action_severity"])}


def pick_lru(system: str, drivers: list[dict[str, Any]], ctx: Context) -> str:
    if system == "engines":
        part = drivers[0]["part"] if drivers else "High-pressure compressor"  # HPC fault mode is in every subset
        return ENGINE_PART_LRU.get(part, "ENG-HPC")
    for d in drivers:
        if d["sensor"] in ctx.policies["sensor_lru"]:
            return ctx.policies["sensor_lru"][d["sensor"]]
    return ctx.systems_cfg["systems"][system]["lru"][0]


def downtime_and_cost(lru: str, ctx: Context) -> dict[str, float]:
    p, c, pol = ctx.parts[lru], ctx.costs, ctx.policies
    tech_h = p["install_hours"] * pol["tech_hours_factor"]
    planned_h = c["planned"]["setup_hours"] + p["install_hours"]
    unplanned_h = c["unplanned"]["aog_wait_hours"] + p["install_hours"] * c["unplanned"]["downtime_multiplier"]
    planned_cost = p["cost"] + tech_h * c["planned"]["labour_cost_per_hour"]
    unplanned_cost = planned_cost * c["unplanned"]["cost_multiplier"] + c["unplanned"]["mission_abort_cost"]
    return {"planned_hours": planned_h, "unplanned_hours": unplanned_h, "planned_cost": round(planned_cost, 1),
            "unplanned_cost": round(unplanned_cost, 1), "tech_hours": tech_h}


def decide_system(est: dict[str, Any], theta: float, criticality: str, base: str, on: date, vahak_bases: set[str],
                  ctx: Context, stock: dict[tuple[str, str], int] | None = None) -> dict[str, Any]:
    """est: tail, system, p_fail, rul_p10/p50/p90 (days), drivers, min_trust, trust_note, confidence, failed."""
    s, p = est["system"], float(est["p_fail"])
    drivers = est.get("drivers", [])
    lru = pick_lru(s, drivers, ctx)
    part = ctx.parts[lru]
    dc = downtime_and_cost(lru, ctx)
    p10_h = max(float(est["rul_p10"]), 0.0) * 24
    name = SYSTEM_NAME[s]
    W = ctx.window
    out: dict[str, Any] = {"system": s, "lru": lru, "lru_name": part["name"], "p_fail": round(p, 4), "theta": theta,
                           "criticality": criticality, "rul_days": [round(float(est[k]), 1) for k in ("rul_p10", "rul_p50", "rul_p90")],
                           "key_sensors": drivers, "confidence": est.get("confidence"), "spares": None, "alternatives": []}
    risk_txt = f"{name} has a {p:.0%} chance of failing within the next {W} days"
    later = {"option": "Service later", "consequence": f"{p:.0%} risk of an in-service failure: ~{dc['unplanned_hours']:.0f} h "
             f"unplanned downtime and ≈₵{dc['unplanned_cost']:.0f} vs {dc['planned_hours']:.0f} h / ≈₵{dc['planned_cost']:.0f} planned"}

    if est.get("failed"):
        out.update(action="PULL_FROM_LINE", reason=f"{name} has failed. The aircraft is grounded until the {part['name']} is replaced.")
    elif p >= theta and est.get("min_trust", 100) < ctx.untrusted_below:
        out.update(action="VERIFY_SENSOR",
                   reason=f"{risk_txt}, above the {theta:.0%} limit for {criticality} flying, but the sensor driving that estimate "
                          f"has trust {est['min_trust']:.0f}/100 ({est.get('trust_note') or 'inconsistent readings'}). "
                          "Verify the sensor before pulling the aircraft; keep it on restricted duty meanwhile.")
        out["alternatives"] = [{"option": "Pull now on the current reading",
                                "consequence": "may ground a healthy aircraft on a faulty sensor"}, later]
    elif p >= theta:
        srcs = ctx.logistics.sources(lru, base, on, vahak_bases, stock=stock)
        best = srcs[0] if srcs and srcs[0].eta_hours != float("inf") else None
        eta = best.eta_hours if best else float("inf")
        verdict = source_or_pull(eta, part["install_hours"], p10_h)
        out["spares"] = {"verdict": verdict, "deadline_hours": round(p10_h, 1), "install_hours": part["install_hours"],
                         "sources": [x.to_json() for x in srcs], "chosen": best.to_json() if best else None}
        base_name = ctx.logistics.nodes[base]["name"]
        local = best is not None and best.mode == "local"
        if local and verdict == "SOURCE":
            out.update(action="SCHEDULE_SERVICE", urgent=True,
                       reason=f"{risk_txt}, above the {theta:.0%} limit for {criticality} flying. A {part['name']} is in the "
                              f"{base_name} store: service now, before the earliest plausible failure in {p10_h:.0f} h.")
        elif local:
            out.update(action="PULL_FROM_LINE",
                       reason=f"{risk_txt}, above the {theta:.0%} limit for {criticality} flying, and failure is plausible "
                              f"{'at any moment' if p10_h < 1 else f'within {p10_h:.0f} h'} — too soon to keep flying until "
                              "the fix. Pull the aircraft now and fit the "
                              f"{part['name']} from the {base_name} store ({part['install_hours']:g} h).")
        elif verdict == "SOURCE":
            out.update(action="EXPEDITE_SPARE",
                       reason=f"{risk_txt}, above the {theta:.0%} limit. The {part['name']} can reach {base_name} from "
                              f"{best.name} by {best.mode} in {eta:.0f} h and be fitted in {part['install_hours']:g} h, before "  # type: ignore[union-attr]
                              f"the earliest plausible failure ({p10_h:.0f} h). Source it; restricted duty until fitted.")
        else:
            why = (f"the fastest {part['name']} is {eta:.0f} h away ({best.name}, by {best.mode})" if best
                   else f"no {part['name']} can reach {base_name} by any open route")
            out.update(action="PULL_FROM_LINE",
                       reason=f"{risk_txt}, above the {theta:.0%} limit for {criticality} flying, and {why} — later than "
                              f"the earliest plausible failure ({p10_h:.0f} h). Pull the aircraft from the line and order the part.")
        out["alternatives"] = [later, {"option": "Source the spare",
                                       "consequence": (f"arrives in {eta:.0f} h + {part['install_hours']:g} h fit vs {p10_h:.0f} h "
                                                       "to earliest plausible failure") if best else "no open route"}]
    elif p >= ctx.policies["monitor_band"] * theta:
        out.update(action="MONITOR_CLOSELY",
                   reason=f"{risk_txt} — below the {theta:.0%} limit but within the watch band. Monitor daily and schedule the "
                          f"{part['name']} before day {int(est['rul_p10'])} (earliest plausible failure).")
    elif float(est["rul_p10"]) <= ctx.policies["schedule_lookahead_days"]:
        out.update(action="SCHEDULE_SERVICE",
                   reason=f"{name} risk is low now ({p:.0%}), but its earliest plausible failure is around day "
                          f"{int(est['rul_p10'])}. Schedule the {part['name']} into the cheapest slot before then, bundled "
                          "with this aircraft's other jobs.")
    else:
        out.update(action="SERVE_NORMALLY", reason=f"{name} risk {p:.0%}; nothing due within "
                                                     f"{ctx.policies['schedule_lookahead_days']} days.")
    out["downtime_cost"] = dc
    return out


def decide_aircraft(tail: dict[str, Any], estimates: list[dict[str, Any]], theta: float, criticality: str, on: date,
                    vahak_bases: set[str], ctx: Context, stock: dict[tuple[str, str], int] | None = None) -> dict[str, Any]:
    per = [decide_system(e, theta, criticality, tail["base"], on, vahak_bases, ctx, stock) for e in estimates]
    per.sort(key=lambda d: (ctx.severity[d["action"]], -d["p_fail"]))
    top = per[0]
    return {"tail": tail["tail"], "type": tail["type"], "base": tail["base"], "action": top["action"],
            "system": top["system"], "reason": top["reason"], "headline": top, "systems": per}


def add_cannibalisation(decisions: list[dict[str, Any]]) -> None:
    """For PULL decisions, offer a donor: an already-grounded tail of the same type and base whose same system is fine."""
    grounded = [d for d in decisions if d["action"] == "PULL_FROM_LINE"]
    for d in grounded:
        h = d["headline"]
        donors = [g["tail"] for g in grounded if g["tail"] != d["tail"] and g["type"] == d["type"] and g["base"] == d["base"]
                  and next((x for x in g["systems"] if x["system"] == h["system"]), {"p_fail": 1})["p_fail"] < 0.05]
        h["cannibalise_from"] = donors[:1] or None
        if donors:
            h["alternatives"].append({"option": f"Cannibalise from {donors[0]}",
                                      "consequence": f"{donors[0]} is already grounded; its {h['lru_name']} is healthy — "
                                                     "flagged, needs engineering approval"})
