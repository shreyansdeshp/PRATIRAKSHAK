# PRATIRAKSHAK

**Predict. Prepare. Protect.** — a fleet readiness command console for Smart India Hackathon 2026, problem statement **SIH26249: Air Power – Predictive Maintenance & Fleet Availability**.

It fuses real turbofan degradation data (NASA C-MAPSS) with a simulated fleet of 72 aircraft across 4 fictional bases. It predicts remaining useful life with calibrated confidence and turns that into one transparent decision rule: service now, schedule, pull from the line, or source a spare.

> All bases, aircraft types, tail numbers and costs are **fictional**. Engine degradation data is real (NASA). Everything else is simulated and labelled as such. This is not Indian Air Force data.

The build contract is [`SPEC.md`](SPEC.md). Progress is tracked in [`HANDOFF.md`](HANDOFF.md).

## Quick start — just the console (no Python needed)

The exported snapshot (`frontend/public/data/`, ~4 MB) is committed, so the front-end runs on its own:

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173  (dev server)
# or: npm run build && npm run preview   →  http://localhost:4173  (production build, service worker on)
```

Open `/?mode=story` for the guided storyline (→ / space next, ← back, R restart, H hide controls, C toggle captions). The stage is fixed at 1920×1080 and scales to the window.

## Requirements

- Python **3.11**
- Node.js **20+** (tested with 24), npm 10+
- ~3 GB disk (PyTorch CPU, Playwright Chromium)

## Setup

**Windows (PowerShell)**
```powershell
./tasks.ps1 setup          # if blocked: powershell -ExecutionPolicy Bypass -File tasks.ps1 setup
```

**macOS / Linux**
```bash
make setup
```

**Raw commands (any OS)**
```bash
python3.11 -m venv .venv                       # Windows: py -3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt   # Windows: .venv\Scripts\python.exe
.venv/bin/python -m pip install -e . --no-deps
cd frontend && npm ci && npx playwright install chromium
```

## Data

Put the NASA C-MAPSS files in `data/raw/cmapss/` (`train_FD00x.txt`, `test_FD00x.txt`, `RUL_FD00x.txt`, `readme.txt`), or run `./tasks.ps1 fetch` / `make fetch`. Raw data is never committed.

## Pipeline

| Step | Windows | macOS/Linux |
|---|---|---|
| Fetch data | `./tasks.ps1 fetch` | `make fetch` |
| Ingest + EDA | `./tasks.ps1 data` | `make data` |
| World | `./tasks.ps1 world` | `make world` |
| Synthetic systems | `./tasks.ps1 synth` | `make synth` |
| Train | `./tasks.ps1 train [-Fast]` | `make train [FAST=1]` |
| Intelligence | `./tasks.ps1 intelligence` | `make intelligence` |
| Simulate | `./tasks.ps1 sim` | `make sim` |
| Export snapshot | `./tasks.ps1 export` | `make export` |
| Dev (API + UI) | `./tasks.ps1 dev` | `make dev` |
| Screenshots | `./tasks.ps1 shots` | `make shots` |
| Tests | `./tasks.ps1 test` | `make test` |

Global seed: **26249**. The same command gives the same output.

### Laptop safety

The simulator runs single-threaded workers at low priority. Keep `--workers` at **6 or fewer** on a laptop (`python -m pratirakshak.sim --workers 4`; the default is already laptop-safe); 12 heavy workers crashed a 16 GB machine once. Heavy pre-processing is cached, so re-runs are much faster than the first.

## The sheets

| # | Sheet | What it answers |
|---|---|---|
| 00 | Map | Where the fleet is, terrain and supply routes |
| 01 | Fleet | Who can fly today, who is limited by what |
| 02 | Base | One base: hangar bays, aircraft, stores |
| 03 | Aircraft | One tail: every system's health and remaining life, the 3D twin |
| 04 | Decision | Why the rule says serve / service / pull, with confidence |
| 05 | Spares | Where the part comes from and how long it takes, by road or air |
| 06 | Plan | Hangar schedule from the solver; planned vs unplanned downtime |
| 07 | Stress | Surge, strike, supply cut, weather — with vs without Pratirakshak |
| 08 | Late | What happens when the same data arrives 1–7 days late |
| 09 | Intel | What the model watches; sensor → part → unit → action; sensor trust |
| 10 | Results | All policies, all scenarios, paired CIs; model calibration |
| 11 | Offline | Decisions without network; confidence widens with data age |
| 12 | Vendor | The supplier's view — deliveries only, no tail-level health |
| 13 | Lifecycle | Airframe life, engine overhaul, fleet age |

Every number on screen is read from the snapshot; every panel carries a provenance chip — **REAL**, **REAL-ANCHORED**, **SIMULATED** or **ILLUSTRATIVE** (see Sheet 14).

## Offline mode

Run the production build (`npm run build && npm run preview`), open the app once, then switch the network off (browser DevTools → Network → Offline). The service worker serves the cached snapshot; Sheet 11 shows the data-age badge and the tightened decisions. `npx playwright test e2e/sheet11-offline.spec.ts` checks this with the network blocked.

## Screenshots and checks

`./tasks.ps1 shots` / `make shots` writes 1920×1080 stills of every sheet to `docs/shots/`. The Playwright specs in `frontend/e2e/` compare on-screen numbers to the snapshot. Voice-over and video are recorded by the team, outside this repo.
