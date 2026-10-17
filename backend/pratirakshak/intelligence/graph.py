"""'What the model watches' (SPEC §11.9 S9): global sensor importance and the sensor → part → LRU → action graph."""

from __future__ import annotations

from collections import Counter
from typing import Any

import lightgbm as lgb

from pratirakshak.ingest.cmapss import HEADLINE_SENSORS, SENSOR_NAMES
from pratirakshak.io import load_config, read_json
from pratirakshak.settings import MODELS_DIR, PROCESSED_DIR
from pratirakshak.synth.model import SYSTEMS, SynthModel

ENGINE_PART_LRU = {  # illustrative grouping (SPEC §6.2); LPC has no separate LRU here — fan & booster module
    "Fan": "ENG-FAN", "Low-pressure compressor": "ENG-FAN", "High-pressure compressor": "ENG-HPC",
    "Combustor": "ENG-CMB", "High-pressure turbine": "ENG-HPT", "Low-pressure turbine": "ENG-LPT",
}
ACTIONS = ["SCHEDULE_SERVICE", "EXPEDITE_SPARE", "PULL_FROM_LINE", "VERIFY_SENSOR"]


def build_graph() -> dict[str, Any]:
    world = read_json(PROCESSED_DIR / "world" / "world.json")
    syscfg = load_config("systems")
    engines_per_subset = Counter(e["cmapss_subset"] for a in world["aircraft"] for e in a["engines"])
    total = sum(engines_per_subset.values())
    imp: Counter[str] = Counter()
    for sub, n in engines_per_subset.items():
        ex = read_json(MODELS_DIR / "engine" / sub / "explain.json")
        for r in ex["global_ranking"]:
            if r["sensor"] in HEADLINE_SENSORS:
                imp[r["sensor"]] += r["mean_abs_delta_rul"] * n / total
    s_tot = sum(imp.values()) or 1.0
    nodes, edges = [], []
    for s, v in sorted(imp.items(), key=lambda kv: -kv[1]):
        sym, desc, unit = SENSOR_NAMES[s]
        nodes.append({"id": f"sensor:{s}", "kind": "sensor", "system": "engines", "label": sym, "name": desc, "unit": unit,
                      "importance": round(v / s_tot, 4), "provenance": "REAL",
                      "support": "model-supported" if HEADLINE_SENSORS[s] in ("Fan", "High-pressure compressor")
                      else "indicative (sensor-group index)"})
        edges.append({"from": f"sensor:{s}", "to": f"part:{HEADLINE_SENSORS[s]}"})
        edges.append({"from": f"sensor:{s}", "to": "action:VERIFY_SENSOR"})
    for part, lru in ENGINE_PART_LRU.items():
        nodes.append({"id": f"part:{part}", "kind": "part", "system": "engines", "label": part})
        edges.append({"from": f"part:{part}", "to": f"lru:{lru}"})

    model = SynthModel()
    for s in SYSTEMS:
        path = MODELS_DIR / "systems" / s / "lgbm.txt"
        gains: Counter[str] = Counter()
        if path.exists():
            b = lgb.Booster(model_file=str(path))
            for f, g in zip(b.feature_name(), b.feature_importance("gain"), strict=True):
                if "__" in f:
                    gains[f.split("__")[0]] += float(g)
        g_tot = sum(gains.values()) or 1.0
        nodes.append({"id": f"part:{s}", "kind": "part", "system": s, "label": s.replace("_", " ")})
        for sen in model.sensors:
            if sen["system"] != s:
                continue
            nodes.append({"id": f"sensor:{sen['id']}", "kind": "sensor", "system": s, "label": sen["name"], "unit": sen["unit"],
                          "importance": round(gains.get(sen["id"], 0.0) / g_tot, 4),
                          "provenance": "REAL-ANCHORED" if sen.get("anchored") else "SIMULATED"})
            edges.append({"from": f"sensor:{sen['id']}", "to": f"part:{s}"})
        for lru in syscfg["systems"][s]["lru"]:
            edges.append({"from": f"part:{s}", "to": f"lru:{lru}"})
    for p in load_config("world")["parts"]:
        nodes.append({"id": f"lru:{p['lru']}", "kind": "lru", "system": p["system"], "label": p["name"], "lru": p["lru"]})
        for act in ("SCHEDULE_SERVICE", "EXPEDITE_SPARE", "PULL_FROM_LINE"):
            edges.append({"from": f"lru:{p['lru']}", "to": f"action:{act}"})
    nodes += [{"id": f"action:{a}", "kind": "action", "label": a} for a in ACTIONS]
    return {"nodes": nodes, "edges": edges,
            "note": "Engine importance = mean |ΔRUL| when a sensor is reset to its healthy baseline (serving model), "
                    "weighted by the fleet's engines per C-MAPSS subset. System importance = LightGBM gain share."}
