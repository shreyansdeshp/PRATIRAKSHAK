# HANDOFF — Pratirakshak

> Running state of the build. Update at the **start** and **end** of every stage and whenever you stop. A fresh Claude Code session must be able to resume from this file + `SPEC.md` alone.

## Status
- **Current stage:** 2 — World generator (next)
- **Last completed stage:** 1 — Data ingest & verification
- **Last commit:** see `git log -1` (Stage 1: data ingest & verification)
- **Date/time of last update:** 2026-10-17 04:40
- **Demo seed:** not chosen yet (Stage 7)
- **Global seed:** 26249
- **Remote:** `https://github.com/shreyansdeshp/PRATIRAKSHAK.git` (branch `main`); commits authored as `shreyansdeshp <sndeshpande_b25@it.vjti.ac.in>` (repo-local git config). Push after every stage commit.

## Stage plan (live checklist)
- [x] 0 Scaffold & environment
- [x] 1 Data ingest & verification
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
**Stage 1 — Data ingest & verification**
1. `scripts/fetch_cmapss.py`: if files exist (in `data/raw/cmapss/` or nested `CMAPSSData/`), verify sha256 against `scripts/cmapss_sha256.json`; else download the PHM mirror zip, extract (handles nested zips) and verify. Copy `Damage Propagation Modeling.pdf` → `docs/` (gitignored: licence unstated).
2. `ingest/cmapss.py`: `cmapss_dir()` (resolves nested folder), `load_subset()` → train/test frames with `unit, cycle, op1–3, s1–s21` + `RUL` vector; per-row train RUL.
3. `ingest/splits.py`: per subset, sort train units by lifetime, chunk in groups of 5, seeded pick → 20% **fleet-replay holdout**; repeat on the rest → 20% **validation**; remainder **train**. Lifetime-stratified, unit-disjoint, saved to `data/processed/splits.json`.
4. `ingest/__main__.py` (`./tasks.ps1 data`): counts (rows, units, RUL lines) vs SPEC §3.2 and readme; constant sensors per subset (within operating condition, empirical rule); lifetime stats; writes `docs/DATA_NOTES.md` (generated, no hand-typed numbers), `reports/data/cmapss_eda.json`, figures `docs/figures/lifetimes.png` + `trajectories_FD00x.png` (12 headline sensors, paper palette).
5. Test `backend/tests/test_splits.py`: splits disjoint + cover all train units, deterministic.
6. Checks: (1) counts printed and compared with §3.2; (2) unit-disjoint test passes. Commit + push.

**Stage 0 — Scaffold & environment** (done)
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
**Stage 1**
- `ingest/cmapss.py` (loader, sensor dictionary, 12 headline sensors → parts, EDA condition labels), `ingest/splits.py` (lifetime-stratified 1-in-5 picks: replay, then val), `ingest/__main__.py` (counts vs SPEC/readme, constant sensors, Spearman vs capped RUL, lifetimes, figures, generated `docs/DATA_NOTES.md`, `reports/data/cmapss_eda.json`, `data/processed/splits.json`).
- `scripts/fetch_cmapss.py`: verifies sha256 of local files against `scripts/cmapss_sha256.json` (manifest recorded from the user's copy on 2026-10-17); download path (mirror zip, nested-zip extraction, flat writes) exists but was **not exercised** because the files are present.
- Sensor names checked against Table 2 of the bundled Saxena et al. (2008) PDF (readme has no names): same 21 symbols, same order as SPEC §6.1.
- Figures: `docs/figures/lifetimes.png`, `docs/figures/trajectories_FD00x.png` (reviewed FD001: wear trends visible on 11 of 12 headline sensors; Nc weak in FD001).

**Stage 0**
- Stage 0 complete as planned. Layout per §13; `backend/pratirakshak/settings.py` (SEED, `derive_seed`, `seed_everything`, paths); stage entry points are placeholders (`python -m pratirakshak.<stage>` prints "not yet implemented (Stage N)").
- Front-end: Vite 5.4.11 / React 18.3.1 / TS 5.6.3 strict, tokens from §11.2, paper grain (static SVG, 3% opacity), registration marks, "SIMULATED EXERCISE DATA" corner tag. Screenshot: `docs/shots/stage0_empty_1920x1080.png` (reviewed: paper ground, fonts load, no defects).
- Remote set to the user's GitHub repo; local `main` rebased onto its existing 2 commits (README only); README expanded.

## Acceptance checks — **real output pasted**
**Stage 1** — Check (1): row/engine counts printed and compared with §3.2.
```
> python -m pratirakshak.ingest
C-MAPSS source: D:\githubrepos\pratikrakshak\data\raw\cmapss\CMAPSSData
subset  train eng test eng  RUL train rows test rows  SPEC 3.2 (train/test, rows) readme   verdict
FD001         100      100  100     20,631    13,096  100/100, 20,631              100/100  OK
FD002         260      259  259     53,759    33,991  260/259, 53,759              260/259  OK
FD003         100      100  100     24,720    16,596  100/100, 24,720              100/100  OK
FD004         249      248  248     61,249    41,214  249/248, 61,249              248/249  DIFF: readme says 248/249

constant sensors: {'FD001': ['s1', 's5', 's6', 's10', 's16', 's18', 's19'], 'FD002': ['s1', 's5', 's10', 's16', 's18', 's19'], 'FD003': ['s1', 's5', 's16', 's18', 's19'], 'FD004': ['s1', 's5', 's16', 's18', 's19']}
splits (train/val/replay): {'FD001': (64, 16, 20), 'FD002': (166, 42, 52), 'FD003': (64, 16, 20), 'FD004': (159, 40, 50)}
```
Check (2): no engine unit appears in two splits.
```
> python -m pytest -v
============================== 7 passed in 8.05s ==============================
(test_splits_are_unit_disjoint_and_complete[FD001..FD004], test_saved_splits_match_generator, 2× settings)
```

**Stage 0** — Check (1): clean install works (venv + `npm ci`) and the empty Vite page renders on the paper background.
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
| 2026-10-17 | Splits: 20 % fleet-replay holdout, then 20 % of the rest validation, rest train (FD001 64/16/20, FD002 166/42/52, FD003 64/16/20, FD004 159/40/50) | Replay pool must be untouched by fitting; sim samples replay trajectories with replacement + random phase offsets so 20 FD001 engines can drive 28 Vahak engines | Yes (re-run `data`) |
| 2026-10-17 | "Constant sensor" rule = ≤ 2 distinct values within every operating condition; Spearman vs capped RUL reported alongside | Relative-std rule wrongly flags Nf/NRf (≈10⁻⁵ variation but clear wear trend) | Yes |
| 2026-10-17 | `Damage Propagation Modeling.pdf` copied to `docs/` but gitignored | NASA licence not stated (SPEC §0.10) | Yes |
| 2026-10-17 | ruff ignores E501 (line length) | Long markdown strings in report writers; formatter owns line length | Yes |

## Defaults used because the user hadn't specified (SPEC §3.4)
- Base names / aircraft names / fleet mix: SPEC defaults (to be written to `config/world.yaml` in Stage 2).
- Map source in use: not yet chosen (Stage 9); keyless first.
- Currency: cost units (₵), ILLUSTRATIVE.

## Verified facts (record results of every "verify" in the SPEC)
| Item | Expected | Found | Notes |
|---|---|---|---|
| C-MAPSS files present | `data/raw/cmapss/` | Present, but nested at `data/raw/cmapss/CMAPSSData/` (12 txt + readme + PDF) | Stage 1 loader must search `cmapss/` and `cmapss/CMAPSSData/` |
| C-MAPSS engine counts (readme.txt) | SPEC §3.2: FD004 249/248 | readme says FD004 **train 248 / test 249** (reverse of SPEC) | readme is wrong; files agree with SPEC |
| C-MAPSS engine/row counts (files) | SPEC §3.2 | **All match SPEC exactly** (engines + train rows, all 4 subsets); 26 columns; RUL lines = test engines | `docs/DATA_NOTES.md` §1 |
| Sensor dictionary | SPEC §6.1 | Matches Table 2 of Saxena et al. 2008 (bundled PDF), same order | readme has no names |
| Operating conditions | 1/6/1/6 | 1/6/1/6 | rounded op settings |
| Constant sensors per subset | — | FD001: s1 s5 s6 s10 s16 s18 s19 · FD002: s1 s5 s10 s16 s18 s19 · FD003/FD004: s1 s5 s16 s18 s19 | within-condition rule |
| Lifetimes (train, cycles) | ≈130–360 (SPEC §3.3) | FD001 128–362, FD002 128–378, FD003 145–525, FD004 128–543 | FD003/FD004 longer tail |
| Shortest test sequence | some < 30 | FD001 31, FD002 21, FD003 38, FD004 19 | left-pad needed for FD002/FD004 |
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
1. Stage 2: write plan here; `config/world.yaml` (bases §3.1, types §3.2, fleet mix 20/18/14/20 → 72 tails `PR-<T><nnn>`, base hangar bays / tech-hours / stores, environment profiles, parts catalogue ≈35 LRUs, depots + vendor hub, missions, seasonal closure calendar).
2. `pratirakshak.world`: generate fleet (every base ≥3 types; Himshikhar leans Garjan/Vahak, Kaveri leans Shikshak/Prahar), stock, missions; environment from Open-Meteo archive (verify terms; cache to `data/interim/climate/*.json` with fallback constants); routes via OSRM demo (polite, cached to `data/routes/*.geojson`) + straight-line airlift.
3. Checks: 72 tails, every base hosts ≥3 types; routes cached on disk.

## How to run (keep current)
```
# setup     ./tasks.ps1 setup        | make setup
# data      ./tasks.ps1 fetch; ./tasks.ps1 data   → docs/DATA_NOTES.md, data/processed/splits.json
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
