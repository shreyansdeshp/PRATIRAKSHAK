"""Light JSON Schemas for the snapshot contract (docs/SNAPSHOT_SCHEMA.md). Required keys and types only —
enough to catch a broken export before the front-end does."""

from __future__ import annotations

from typing import Any

import jsonschema

NUM = {"type": "number"}
STR = {"type": "string"}
STATUS = {"enum": ["READY", "WATCH", "PULL"]}
PROV = {"enum": ["REAL", "REAL-ANCHORED", "SIMULATED", "ILLUSTRATIVE"]}

SCHEMAS: dict[str, dict[str, Any]] = {
    "meta": {"type": "object", "required": ["project", "seed", "demo_seed", "snapshot", "provenance_legend", "roles"]},
    "world": {"type": "object", "required": ["bases", "nodes", "types", "systems", "aircraft", "parts", "stock", "routes"],
              "properties": {"aircraft": {"type": "array", "minItems": 72, "maxItems": 72,
                                          "items": {"type": "object", "required": ["tail", "type", "base", "engines"],
                                                    "properties": {"engines": {"type": "array", "items": {
                                                        "type": "object", "not": {"required": ["unit_life_cycles"]}}}}}}}},
    "state": {"type": "object", "required": ["aircraft", "summary", "window_days"],
              "properties": {"aircraft": {"type": "array", "items": {
                  "type": "object", "required": ["tail", "status", "limiting_system", "weighted_health", "systems", "action"],
                  "properties": {"status": STATUS, "weighted_health": NUM, "systems": {
                      "type": "array", "minItems": 8, "maxItems": 8, "items": {
                          "type": "object", "required": ["id", "health", "p_fail", "rul_days", "provenance", "confidence"],
                          "properties": {"provenance": PROV, "health": NUM, "p_fail": NUM}}}}}}}},
    "history": {"type": "object", "required": ["days", "systems", "engines", "trust", "sensor_meta"]},
    "decisions": {"type": "array", "minItems": 72, "items": {"type": "object", "required": ["tail", "action", "reason", "headline"]}},
    "plan": {"type": "object", "required": ["visits", "capacity", "method", "missions"]},
    "intelligence": {"type": "object", "required": ["graph", "trust_harness", "engine_importance"]},
    "models": {"type": "object", "required": ["engine", "systems", "data"]},
    "results": {"type": "object", "required": ["summary", "paired", "curves", "ablation", "sensitivity", "counterfactuals", "demo_seed"]},
    "demo": {"type": "object", "required": ["seed", "runs"]},
    "twin": {"type": "object", "required": ["days", "tails"]},
    "vendor": {"type": "object", "required": ["role", "demands"], "additionalProperties": True,
               "properties": {"role": {"const": "vendor"}, "demands": {"type": "array", "items": {
                   "type": "object", "required": ["demand_id", "lru", "qty", "priority", "destination", "deliver_by"],
                   "not": {"anyOf": [{"required": ["tail"]}, {"required": ["status"]}, {"required": ["health"]}]}}}}},
}


def validate(name: str, obj: Any) -> None:
    jsonschema.validate(obj, SCHEMAS[name])
