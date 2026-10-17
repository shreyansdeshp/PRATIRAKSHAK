# HANDOFF — Antigravity agent

> Running state for the Antigravity branch. Protocol: `docs/FRONTEND_CONVENTIONS.md`.

## Status
- **Branch:** `antigravity` (worktree `D:\githubrepos\pratikrakshak-ag`)
- **Current sheet:** 13 Lifecycle (in progress)
- **Sheets owned:** 06 Plan (done), 12 Vendor (done), 13 Lifecycle (in progress)
- **Date/time of last update:** 2026-10-17 10:05

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
1. Load ONLY `vendor.json` (+ `meta.json`, fallback-map, `data/routes/*.geojson`) via `useSnapshots(["vendor", "meta"])`.
2. Title: "Spares vendor — deliveries"; Chips: ILLUSTRATIVE (stock, times), REAL-ANCHORED (routes). No tail numbers, health, or readiness.
3. Deliveries list sorted by priority (P1 first) with `demand_id`, `part`, `qty`, `priority`, `destination`, `deliver_by`, `source`, `mode`, `eta_hours`.
4. `ChartMap` with vendor hub (NAN), destination bases, and routes overlay.
5. Hub stock list from `vendor.json` `stock_at_hub`.
6. E2E test `e2e/sheet12-vendor.spec.ts`: assert no commander snapshot fetched, assert `/PR-[GPVS]\d{3}/` not in text, screenshot `docs/shots/s12_vendor.png`.
7. Story beats in `src/story/beats/12-vendor.json`.

---

## Sheet 13 — Lifecycle (`/lifecycle`)

### Plan (5–10 lines)
1. Load `world.json` (aircraft ages, airframe_hours/life_hours, engines with time_since_overhaul_h) and `state.json` (airframe_life_used, body_health, status) via `useSnapshots(["world", "state", "meta"])`.
2. (a) **Airframe life used vs age**: by aircraft type (small panels / strips with HealthBar), base marked.
3. (b) **Engine time since overhaul**: simple sorted bars for all engines across the fleet.
4. (c) **Fleet age pyramid**: 5-year age buckets × aircraft type horizontal bars.
5. Clicking an aircraft navigates to `/aircraft/<tail>`.
6. Provenance chips: ILLUSTRATIVE (ages, hours), SIMULATED (body health).
7. E2E test `e2e/sheet13-lifecycle.spec.ts`: assert sheet shows 72 aircraft, screenshot to `docs/shots/s13_lifecycle.png`.
8. Story beats in `src/story/beats/13-lifecycle.json`.

---

## Requests for Claude
_(none yet)_

## Checks log
### 2026-10-17 — Sheet 06 (Planning timeline)
- `npx tsc --noEmit -p .`: PASS (0 errors)
- `npx playwright test e2e/sheet06-plan.spec.ts`: PASS (1 passed)
- Screenshot: `docs/shots/s06_plan.png` captured and verified (Gantt, 90-day comparison, BarCI metrics)
- Status: Ready

### 2026-10-17 — Sheet 12 (Spares vendor)
- `npx tsc --noEmit -p .`: PASS (0 errors)
- `npx playwright test e2e/sheet12-vendor.spec.ts`: PASS (1 passed)
- Zero commander snapshots requested (asserted: state, decisions, history, world, plan, twin, results, demo, models, intelligence)
- Zero aircraft tail registrations rendered (/PR-[GPVS]\d{3}/ not in text)
- Screenshot: `docs/shots/s12_vendor.png` captured and verified (framed map, full node labels, unclipped delivery flight strips, hub stock)
- Status: Ready
