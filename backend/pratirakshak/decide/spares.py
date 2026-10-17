"""Spares & logistics (SPEC §9.4, P4): nearest sources by ETA, and the SOURCE-vs-PULL test.

ETA by road uses the cached OSRM time (× truck factor + handling); a road route is unusable while its seasonal
closure covers the date. Airlift needs a READY Vahak: ETA = positioning leg from the Vahak's base to the source (if
not already there) + the leg from the source to the destination. Vendor-hub stock adds a dispatch delay.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from pratirakshak.io import load_config


@dataclass(frozen=True)
class Source:
    node: str
    name: str
    kind: str
    qty: int
    mode: str               # local | road | air
    eta_hours: float
    distance_km: float
    route_id: str | None
    note: str = ""

    def to_json(self) -> dict[str, Any]:
        d = asdict(self)
        if d["eta_hours"] == float("inf"):
            d["eta_hours"] = None  # JSON has no Infinity; null = unreachable
        return d


def source_or_pull(eta_hours: float, install_hours: float, deadline_hours: float) -> str:
    """The SPEC §9.4 test: SOURCE if the spare arrives and is fitted before the lower-bound RUL, else PULL."""
    return "SOURCE" if eta_hours + install_hours <= deadline_hours else "PULL"


def _in_closure(mmdd: str, start: str, end: str) -> bool:
    return start <= mmdd <= end if start <= end else (mmdd >= start or mmdd <= end)  # wraps the new year


class Logistics:
    def __init__(self, world: dict[str, Any], policies: dict[str, Any] | None = None) -> None:
        self.policies = policies or load_config("policies")
        self.nodes = {n["id"]: n for n in world["nodes"]}
        self.routes: dict[tuple[str, str, str], dict[str, Any]] = {}
        for r in world["routes"]:
            self.routes[(r["from_node"], r["to_node"], r["mode"])] = r
            self.routes[(r["to_node"], r["from_node"], r["mode"])] = r
        self.stock: dict[tuple[str, str], int] = {(s["node"], s["lru"]): s["qty"] for s in world["stock"]}

    def road(self, a: str, b: str, on: date) -> dict[str, Any] | None:
        r = self.routes.get((a, b, "road"))
        if r is None:
            return None
        c = r.get("seasonal_closure")
        if c and _in_closure(on.strftime("%m-%d"), c["start_mmdd"], c["end_mmdd"]):
            return None
        return r

    def air_hours(self, src: str, dst: str, vahak_bases: set[str]) -> tuple[float, str] | None:
        """Best airlift ETA (hours) using a READY Vahak from any base in `vahak_bases`."""
        if src == dst or not vahak_bases:
            return None
        leg = self.routes[(src, dst, "air")]["minutes"] / 60
        best = None
        for vb in sorted(vahak_bases):
            pos = 0.0 if vb == src else self.routes[(vb, src, "air")]["minutes"] / 60
            eta = pos + leg
            if best is None or eta < best[0]:
                best = (eta, vb)
        return best

    def sources(self, lru: str, base: str, on: date, vahak_bases: set[str], k: int = 3,
                stock: dict[tuple[str, str], int] | None = None) -> list[Source]:
        """Local stock first; otherwise the k fastest (node, mode) options holding the part."""
        stock = self.stock if stock is None else stock
        if stock.get((base, lru), 0) > 0:
            n = self.nodes[base]
            return [Source(base, n["name"], n["kind"], stock[(base, lru)], "local", 0.0, 0.0, None, "in local store")]
        out: list[Source] = []
        for node_id, n in sorted(self.nodes.items()):
            qty = stock.get((node_id, lru), 0)
            if node_id == base or qty <= 0:
                continue
            dispatch = self.policies["vendor_dispatch_hours"] if n["kind"] == "vendor_hub" else 0.0
            r = self.road(node_id, base, on)
            if r is not None:
                out.append(Source(node_id, n["name"], n["kind"], qty, "road", round(r["minutes"] / 60 + dispatch, 1),
                                  r["distance_km"], r["id"], "vendor dispatch +24 h" if dispatch else ""))
            elif (node_id, base, "road") in self.routes:
                closed = self.routes[(node_id, base, "road")]
                out.append(Source(node_id, n["name"], n["kind"], qty, "road", float("inf"), closed["distance_km"],
                                  closed["id"], "road closed (seasonal)"))
            air = self.air_hours(node_id, base, vahak_bases)
            if air is not None:
                r_air = self.routes[(node_id, base, "air")]
                note = f"Vahak from {air[1]}" + (" (positioning leg)" if air[1] != node_id else "")
                out.append(Source(node_id, n["name"], n["kind"], qty, "air", round(air[0] + dispatch, 1),
                                  r_air["distance_km"], r_air["id"], note))
        out.sort(key=lambda s: (s.eta_hours, s.node, s.mode))
        usable = [s for s in out if s.eta_hours != float("inf")]
        return usable[:k] + [s for s in out if s.eta_hours == float("inf")][:1]
