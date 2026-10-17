# HANDOFF — Antigravity agent

> Running state for the Antigravity branch. Protocol: `docs/FRONTEND_CONVENTIONS.md`.

## Status
- **Branch:** `antigravity` (worktree `D:\githubrepos\pratikrakshak-ag`)
- **Current sheet:** 12 Spares vendor (in progress)
- **Sheets owned:** 06 Plan (done), 12 Vendor (in progress), 13 Lifecycle, 09 Intelligence, 11 Offline
- **Date/time of last update:** 2026-10-17 09:47

---

## Sheet 06 — Planning timeline (`/plan`)

### Plan (5–10 lines)
1. Load `plan.json` (visits, capacity per base), `demo.json` (P0/P3 runs with events), `results.json` (summary.base metrics).
2. **Per-base Gantt**: group visits by base, draw bays as rows, visits as solid blocks. Mark `pulled` aircraft. Show bundled jobs (visits with >1 task).
3. **Planned vs unplanned timeline**: pick PR-G295 (has in-flight failure under P0). Two `TimelineStrips` rows: P0 events (failures hatched, in-flight markers) vs P3 events (planned visits solid).
4. **BarCI comparison**: planned_hours, unplanned_hours, cost (₵ ILLUSTRATIVE) for P0–P3 from results.json → summary.base.
5. Provenance chip: SIMULATED. Policy colours from tokens.
6. CSS module, test, story beats, commit.

---

## Sheet 12 — Spares vendor (`/vendor`)

### Plan (5–10 lines)
1. Load ONLY vendor.json (+ meta.json for title, fallback-map assets, route GeoJSONs). Never import state/decisions/history etc.
2. Shell title: "Spares vendor — deliveries". No tail numbers, health, or readiness.
3. Deliveries table/flight-strip list sorted by priority (P1 first), showing demand_id, part, qty, priority, destination, deliver_by, source, mode, eta_hours.
4. ChartMap with vendor hub (NAN), destination bases, route lines from route GeoJSONs.
5. Hub stock list from vendor.json stock_at_hub.
6. E2e test: record all requests on /vendor, assert no commander snapshot fetched, no PR-[GPVS]\d{3} in page text. Screenshot.

---

## Sheet 13 — Lifecycle (`/lifecycle`)

### Plan (5–10 lines)
1. Load world.json (aircraft ages, airframe_hours/life_hours, engines with time_since_overhaul_h) and state.json (airframe_life_used, body_health).
2. **Airframe age vs design life** scatter/bar by type and base.
3. **Engine time since overhaul** bars from world.json aircraft[].engines[].time_since_overhaul_h.
4. **Fleet age pyramid**: horizontal bars of age buckets × type.
5. Link each aircraft to body health; click navigates to /aircraft/<tail>.
6. Provenance: ILLUSTRATIVE (fleet ages) / SIMULATED (body health).

---

## Sheet 09 — Intelligence (`/intel`)

### Plan (5–10 lines)
1. Load intelligence.json (graph, trust_harness, fleet_trust) and models.json (engine intervals).
2. **12 headline sensors** ranked by importance from graph nodes (kind "sensor", system "engines").
3. **Connected diagram** sensor → part → LRU → action from graph nodes/edges, SVG columns with links.
4. **Sensor trust board** from trust_harness (systems & engines: detection_rate, false_alarm_rate, by_type) and fleet_trust.flagged.
5. **Calibration glimpse**: Reliability chart from models.json engine intervals.lgbm (nominal vs empirical).
6. Provenance: engines REAL; other systems SIMULATED; hydraulics REAL-ANCHORED.

---

## Sheet 11 — Offline mode (`/offline`)

### Plan (5–10 lines)
1. Load state.json for current system health data to re-apply rules.
2. **Network/offline toggle** visible on screen + **data-age badge** "Snapshot D+0 06:00Z · age HH:MM" with slider 0–72 h.
3. **Confidence widening**: ILLUSTRATIVE formula p10' = p50 − (p50 − p10)·(1 + age_h/48), p90' = p50 + (p90 − p50)·(1 + age_h/48). Recompute P(RUL ≤ 14 d) with split normal σ_lo/σ_hi.
4. **Decision layer**: re-apply rule client-side for tails with risk ≥ 0.30 → act, ≥ 0.10 → watch. Show "sync pending" marker.
5. E2e test: load app, setOffline(true), reload /offline, assert renders with snapshot numbers + screenshot.

---

## Requests for Claude
_(none yet)_

## Checks log
### 2026-10-17 — Sheet 06 (Planning timeline)
- `npx tsc --noEmit -p .`: PASS (0 errors)
- `npx playwright test e2e/sheet06-plan.spec.ts`: PASS (1 passed)
- Screenshot: `docs/shots/s06_plan.png` captured and verified (Gantt, 90-day comparison, BarCI metrics)
- Status: Ready
