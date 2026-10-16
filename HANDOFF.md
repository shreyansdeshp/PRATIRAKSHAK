# HANDOFF — Pratirakshak

> Running state of the build. Update at the **start** and **end** of every stage and whenever you stop. A fresh Claude Code session must be able to resume from this file + `SPEC.md` alone.

## Status
- **Current stage:** 1 — Data ingest & verification (next)
- **Last completed stage:** 0 — Scaffold & environment
- **Last commit:** see `git log -1` (Stage 0: scaffold & environment)
- **Date/time of last update:** 2026-10-17 04:21
- **Demo seed:** not chosen yet (Stage 7)
- **Global seed:** 26249
- **Remote:** `https://github.com/shreyansdeshp/PRATIRAKSHAK.git` (branch `main`); commits authored as `shreyansdeshp <sndeshpande_b25@it.vjti.ac.in>` (repo-local git config). Push after every stage commit.

## Stage plan (live checklist)
- [x] 0 Scaffold & environment
- [ ] 1 Data ingest & verification
- [ ] 2 World generator
- [ ] 3 Engine RUL models
- [ ] 4 Other systems + aircraft combiner
- [ ] 5 Intelligence (trust, explanations, mission fit)
- [ ] 6 Decision, spares, scheduling
- [ ] 7 Simulation & results
- [ ] 8 Export & API
- [ ] 9 Front-end foundation
- [ ] 10 Hero & storyline engine
- [ ] 11 Fleet, base, aircraft showroom
- [ ] 12 Decision, spares, planning screens
- [ ] 13 Stress, counterfactuals, intelligence, results, lifecycle, vendor, offline, method
- [ ] 14 Polish & delivery

## This stage's plan (10–20 lines, written before coding)
**Stage 0 — Scaffold & environment**
1. `git init`; `.gitignore` (raw data, `.env`, venv, node_modules, large model weights, Playwright output).
2. Create §13 layout: `config/ data/{raw,interim,processed,routes} docs/shots backend/pratirakshak/<10 subpackages> backend/tests models reports frontend scripts` (+ `.gitkeep`).
3. Python: `pyproject.toml` (package in `backend/`, ruff/mypy/pytest config), `requirements.txt` with exact pins for the whole stack (pandas, sklearn, LightGBM, torch CPU, SHAP, OR-Tools, FastAPI, DuckDB, pyarrow…), and after install a full `requirements.lock.txt` (`pip freeze`). Python 3.11 venv via `py -3.11` (uv not installed → pip).
4. `backend/pratirakshak/settings.py`: `SEED = 26249`, `seed_everything()`, repo paths. One sanity pytest.
5. Front-end: Vite + React 18 + TS strict, exact pins, `@fontsource` Source Serif 4 / IBM Plex Sans / IBM Plex Mono, `tokens.css` from §11.2, an empty paper-sheet page. Other front-end libs (MapLibre, R3F, D3, GSAP) are added in the stages that use them.
6. Playwright smoke test: page loads, body background = paper `#F4EFE3`, screenshot to `docs/shots/stage0_empty_1920x1080.png`. One Vitest unit placeholder.
7. `Makefile` (macOS/Linux) + `tasks.ps1` (Windows) with every §12 target; unbuilt targets print "not yet implemented (Stage N)".
8. `.env.example`, `README.md` (setup), `CREDITS.md` skeleton seeded with §19.
9. Check: fresh venv `pip install` + `npm ci` + Playwright render test; paste output; commit.

## What I did (this session)
- Stage 0 complete as planned. Layout per §13; `backend/pratirakshak/settings.py` (SEED, `derive_seed`, `seed_everything`, paths); stage entry points are placeholders (`python -m pratirakshak.<stage>` prints "not yet implemented (Stage N)").
- Front-end: Vite 5.4.11 / React 18.3.1 / TS 5.6.3 strict, tokens from §11.2, paper grain (static SVG, 3% opacity), registration marks, "SIMULATED EXERCISE DATA" corner tag. Screenshot: `docs/shots/stage0_empty_1920x1080.png` (reviewed: paper ground, fonts load, no defects).
- Remote set to the user's GitHub repo; local `main` rebased onto its existing 2 commits (README only); README expanded.

## Acceptance checks — **real output pasted**
Check (1): clean install works (venv + `npm ci`) and the empty Vite page renders on the paper background.
```
> py -3.11 -m venv .venv && pip install -r requirements.txt && pip install -e . --no-deps
Successfully installed ... duckdb-1.1.3 fastapi-0.115.6 lightgbm-4.5.0 ... ortools-9.11.4210 pandas-2.2.3 ...
  scikit-learn-1.5.2 shap-0.46.0 torch-2.5.1 uvicorn-0.32.1

> python -c "import numpy, pandas, sklearn, lightgbm, torch, shap, ortools, fastapi, duckdb, pyarrow ..."
python 3.11.4
numpy 1.26.4 | pandas 2.2.3 | sklearn 1.5.2 | lightgbm 4.5.0
torch 2.5.1+cpu | shap 0.46.0 | ortools 9.11.4210 | fastapi 0.115.6 | duckdb 1.1.3

> cd frontend && rm -rf node_modules dist && npm ci
added 107 packages in 36s

> npx playwright test
Running 1 test using 1 worker
  ok 1 smoke.spec.ts:3:1 › empty sheet renders on the paper background @shot (3.1s)
  1 passed (18.8s)
  (asserts getComputedStyle(body).backgroundColor === "rgb(244, 239, 227)")

> ./tasks.ps1 test
2 passed in 2.32s            (pytest: seed + reproducibility)
Test Files  1 passed (1)     (vitest: tokens)
Tests  1 passed (1)
```

## Decisions made (and why)
| Date | Decision | Reason | Reversible? |
|---|---|---|---|
| 2026-10-17 | Project folder stays `pratikrakshak/` (typo vs spec `pratirakshak/`); Python package is `pratirakshak` | Renaming an open workspace folder is disruptive; nothing depends on the folder name | Yes |
| 2026-10-17 | pip + `requirements.txt` (exact direct pins) + `requirements.lock.txt` (full freeze) instead of uv | uv not installed on the user's machine; pip is universal | Yes |
| 2026-10-17 | `tasks.ps1` is the primary Windows runner; `Makefile` for macOS/Linux | `make` not installed on Windows | Yes |
| 2026-10-17 | Front-end libs beyond React/Vite/fonts (MapLibre, R3F/drei, D3, Zustand, GSAP) are added with exact pins in the stage that first uses them | Keeps Stage 0 install light and each stage's diff reviewable | Yes |
| 2026-10-17 | `tsc --noEmit -p .` for typecheck (not `tsc -b`) | single tsconfig, no project references | Yes |
| 2026-10-17 | Commits are authored by `shreyansdeshp` and pushed to `origin/main` after each stage | User instruction | — |

## Defaults used because the user hadn't specified (SPEC §3.4)
- Base names / aircraft names / fleet mix: SPEC defaults (to be written to `config/world.yaml` in Stage 2).
- Map source in use: not yet chosen (Stage 9); keyless first.
- Currency: cost units (₵), ILLUSTRATIVE.

## Verified facts (record results of every "verify" in the SPEC)
| Item | Expected | Found | Notes |
|---|---|---|---|
| C-MAPSS files present | `data/raw/cmapss/` | Present, but nested at `data/raw/cmapss/CMAPSSData/` (12 txt + readme + PDF) | Stage 1 loader must search `cmapss/` and `cmapss/CMAPSSData/` |
| C-MAPSS engine counts (readme.txt) | SPEC §3.2: FD004 249/248 | readme says FD004 **train 248 / test 249** (reverse of SPEC) | Count from files in Stage 1 |
| C-MAPSS engine/row counts (files) | SPEC §3.2 | _Stage 1_ | |
| Constant sensors per subset | — | _Stage 1_ | |
| Tile source availability & licence | — | | |
| UCI hydraulic / NASA battery / actuator data availability & licence | — | | |
| OSRM / Open-Meteo usage limits | — | | |

## Metrics log (append; never overwrite)
| Stage | Date | Item | Value | Notes |
|---|---|---|---|---|
| | | | | |

## Open issues / known defects
- [ ] npm 11 blocks dependency install scripts by default (`esbuild` postinstall skipped). Build works regardless (esbuild ships platform binaries as optional deps). If a later dependency needs its install script, approve it with `npm approve-scripts <pkg>`.
- [ ] In the Claude Code sandbox, `pip install -e .` failed writing to `%TEMP%`; worked with `TMP/TEMP` pointed at a writable folder. A normal terminal should not hit this.

## Next steps (ordered, concrete)
1. Stage 1: write plan here; `scripts/fetch_cmapss.py` (download + sha256 verify if absent; handle the nested `CMAPSSData/` folder); copy `Damage Propagation Modeling.pdf` → `docs/`.
2. `pratirakshak.ingest`: load all 12 files (26 cols), count rows/engines vs §3.2 and readme, constant sensors per subset, lifetime distributions → `docs/DATA_NOTES.md` + figures/JSON.
3. Unit-disjoint split (80/20 train/val by unit, lifetime-stratified) + fleet-replay holdout; test asserting no unit appears in two splits.

## How to run (keep current)
```
# setup     ./tasks.ps1 setup        | make setup
# data      ./tasks.ps1 fetch; ./tasks.ps1 data   (Stage 1)
# train     ./tasks.ps1 train [-Fast]             (Stage 3)
# sim       ./tasks.ps1 sim                       (Stage 7)
# export    ./tasks.ps1 export                    (Stage 8)
# dev       ./tasks.ps1 dev   (UI only for now: cd frontend; npm run dev → http://localhost:5173)
# shots     ./tasks.ps1 shots  → docs/shots/
# test      ./tasks.ps1 test   | make test
```

## Things the user must do (only the human can)
- [x] Put C-MAPSS files in `data/raw/cmapss/` (present in `data/raw/cmapss/CMAPSSData/`).
- [ ] (Optional) Add `MAPTILER_KEY` to `.env`.
- [ ] (Optional) Confirm/rename bases and aircraft in `config/world.yaml`.
- [ ] Convert the recorded `.webm` to MP4 and upload to YouTube.
