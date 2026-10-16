# PRATIRAKSHAK

**Predict. Prepare. Protect.** — a fleet readiness command console for Smart India Hackathon 2026, problem statement **SIH26249: Air Power – Predictive Maintenance & Fleet Availability**.

It fuses real turbofan degradation data (NASA C-MAPSS) with a simulated fleet of 72 aircraft across 4 fictional bases. It predicts remaining useful life with calibrated confidence and turns that into one transparent decision rule: service now, schedule, pull from the line, or source a spare.

> All bases, aircraft types, tail numbers and costs are **fictional**. Engine degradation data is real (NASA). Everything else is simulated and labelled as such. This is not Indian Air Force data.

The build contract is [`SPEC.md`](SPEC.md). Progress is tracked in [`HANDOFF.md`](HANDOFF.md).

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
| Record storyline | `./tasks.ps1 record` | `make record` |
| Tests | `./tasks.ps1 test` | `make test` |

Global seed: **26249**. The same command gives the same output.
