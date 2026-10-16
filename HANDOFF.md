# HANDOFF — Pratirakshak

> Running state of the build. Update at the **start** and **end** of every stage and whenever you stop. A fresh Claude Code session must be able to resume from this file + `SPEC.md` alone.

## Status
- **Current stage:** 4 — Other systems + aircraft combiner (next)
- **Last completed stage:** 3 — Engine RUL models
- **Last commit:** see `git log -1` (Stage 3: engine RUL models)
- **Date/time of last update:** 2026-10-17 06:05
- **Demo seed:** not chosen yet (Stage 7)
- **Global seed:** 26249
- **Remote:** `https://github.com/shreyansdeshp/PRATIRAKSHAK.git` (branch `main`); commits authored as `shreyansdeshp <sndeshpande_b25@it.vjti.ac.in>` (repo-local git config). Push after every stage commit.

## Stage plan (live checklist)
- [x] 0 Scaffold & environment
- [x] 1 Data ingest & verification
- [x] 2 World generator
- [x] 3 Engine RUL models
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
**Stage 3 — Engine RUL models** (one training run; accuracy only needs to be reasonable — rule 15)
1. `config/models.yaml`: window 30, R_max 125, inputs = 14 sensors (12 headline + NRf/NRc), quantiles {.05,.1,.15,.2,.25,.5,.75,.8,.85,.9,.95}, H = 20 cycles, θ = 0.3, ensemble seeds 3 (`--fast`: 1 seed, fewer epochs).
2. `models/engine_data.py`: KMeans(k=6) on op settings (FD002/FD004) + per-condition z-score, both **fit on train units only**; capped RUL; left-padded windows; val calibration windows = 10 seeded truncation points per val unit (mimics the test construction); test = last window per engine. Healthy baseline (RUL > 125 rows) per sensor stored for explanations.
3. Baseline A: Ridge on last-window summary (last/mean/slope + cycle). Baseline B: LightGBM on rolling features (last/mean/std/slope/delta + cycle), early stopping on val.
4. Main: 1D-CNN + GRU with quantile (pinball) head, early stopping on val, 3-seed ensemble (median of members; spread = agreement).
5. `models/conformal.py`: CQR per nominal level 50–90 % on val windows (main); abs-residual conformal for B. Predictive CDF = split-normal through p10/p50/p90 → `P(RUL ≤ H)`.
6. Serving model per subset = main if RMSE ≥ 3 % better than B on test, else B + conformal (stated in report).
7. Explainability: occlusion-to-healthy-baseline per sensor on the main/serving model (per-engine top-3 + global rank); SHAP TreeExplainer global importance for B.
8. Alarm quality on **replay units** (never fitted/calibrated on): sequential `P(RUL≤H) ≥ θ` → false-alarm / miss / lead time; ROC-like sweep over θ on test engines.
9. Precompute serving predictions along every replay trajectory (for Stage 4/7) → `models/engine/<subset>/replay_predictions.parquet`.
10. Artefacts: `models/engine/<subset>/{model.pt (gitignored), scaler.json, conformal.json, metrics.json, feature_spec.json, explain.json}`, `reports/engine_<subset>.md`, `reports/engine_summary.md`. Test: scaler/KMeans fitted only on train units.
11. Checks: one metrics table (RMSE/MAE/score/PICP) for all 4 subsets from one run; split + prep tests pass.

**Stage 2 — World generator** (done)
1. `config/world.yaml`: bases §3.1 (hangar bays, tech-hours, ILLUSTRATIVE dust/salinity, tempo), 3 depots + 1 vendor hub, 4 types §3.2 (C-MAPSS subset, cycle→sorties k, usage, life, age), explicit fleet allocation 20/18/14/20, 8 systems with weights, 35 LRUs with ₵ cost / install h / lead time / mean stock, logistics params, seasonal closure, mission mix.
2. `schema.py`: Pydantic v2 models for every §3.5 entity (world ones filled now; state/decision/plan ones later). `io.py`: LF-only JSON/text writers (fixes Windows CRLF → same bytes on every OS), parquet writer.
3. `world/climate.py`: Open-Meteo archive 2015–2024 per base (4 calls, cached in `data/interim/climate/`), day-of-year normals, elevation from its 90 m DEM, stress indices (heat/cold/humidity/wet/dust/salinity/altitude); committed normals = offline fallback.
4. `world/routes.py`: OSRM demo (≤1 req/s, User-Agent, cached `data/routes/road/*.geojson`, RDP-simplified), great-circle air routes `data/routes/air.geojson`, fallback straight-line × detour if offline.
5. `world/generate.py`: fleet (seeded tails `PR-<L><nnn>`, age, hours, engines → replay units + start phase), Poisson stock per node, routes with HIM seasonal closure, daily missions per base×type, environment per base-day; validate (72 tails, ≥3 types/base, 14–22 per base); write parquet + `world.json`.
6. Checks: fleet totals + types per base; routes cached on disk. Commit + push.

**Stage 1 — Data ingest & verification** (done)
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
**Stage 3**
- `models/engine_data.py` (Normaliser: KMeans k=6 for FD002/FD004 + per-condition z-score, fitted on train units; left-padded windows; 10 seeded truncation windows per val unit for calibration), `engine_seq.py` (CNN-GRU, 11-quantile pinball head, cycle channel), `conformal.py` (CQR, abs-residual conformal, `p_fail_within` = piecewise-linear CDF through the quantiles with split-normal tails), `engine.py` (orchestration), `__main__.py` (reports).
- One `--fast` smoke run on FD001 to debug the pipeline, then **one full run** (3-seed ensemble, ~34 min CPU total).
- **Serving model = LightGBM + conformal on all four subsets**: the CNN-GRU was not ≥3 % better on any subset (rule 15). Reported as such in `reports/engine_summary.md`.
- Outputs: `models/engine/<subset>/{metrics,scaler,conformal,feature_spec,explain}.json`, `replay_predictions.parquet` (every cycle of every replay engine: 11 quantiles + `P(RUL≤20)`; used by Stages 4/7), `model.pt` + `lgbm.txt` (gitignored, regenerate with `train`); `reports/engine_FD00x.md`, `reports/engine_summary.md`.
- Explanations: occlusion-to-healthy-baseline on the serving model ranks HPC sensors first in every subset (Ps30/T30/T50/htBleed), which matches the HPC fault mode; LightGBM SHAP global ranking stored alongside.

**Stage 2**
- Built as planned. Outputs: `data/processed/world/{bases,nodes,types,systems,aircraft,engines,parts,stock,routes,missions,environment,climate_normals}.parquet` + `world.json` (228 KB total); `data/routes/road/*.geojson` (28, 92–574 points each) + `air.geojson` (304 KB total).
- Base coordinates: ARV nudged 28.3,76.9 → 28.22,76.78 and HIM 34.1,77.5 → 33.95,77.75 (away from existing airfields); SAH/KAV kept. Elevations from the DEM: SAH 693, ARV 245, HIM 3623, KAV 90 m.
- Environment sanity (horizon means): SAH RH 84 %, wet 0.44 (monsoon); ARV Tmax 35 °C, dust 0.56; HIM altitude 0.91, Tmin 8.6 °C; KAV salinity 0.49. Plausible.
- `pratirakshak/__init__.py` forces UTF-8 console output (Windows cp1252 crashed on "→").
- Stage 1 writers switched to LF (`io.write_json/write_text`); regenerated outputs are byte-identical apart from line endings.
- `docs/PARAMETER_SOURCES.md` started (environment formulae, logistics, fleet params); `CREDITS.md` has Open-Meteo + OSRM/OSM rows.

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
**Stage 3** — Check (1): one metrics table for all four subsets from a single training run.
```
> python -m pratirakshak.models
  FD001: serving=lgbm · 285.2 s   FD002: serving=lgbm · 535.5 s   FD003: serving=lgbm · 582.8 s   FD004: serving=lgbm · 630.2 s
| Subset | Model | RMSE | RMSE (capped) | MAE | NASA score | PICP 80 % | MPIW 80 % | Serving |
|---|---|---|---|---|---|---|---|---|
| FD001 | Baseline A · Ridge | 17.54 | 16.15 | 14.24 | 459 |  |  |  |
| FD001 | Baseline B · LightGBM | 13.76 | 12.32 | 9.94 | 261 | 0.810 | 28.0 | **yes** |
| FD001 | Main · CNN-GRU quantile | 16.31 | 14.95 | 11.86 | 457 | 0.720 | 28.1 |  |
| FD002 | Baseline A · Ridge | 28.49 | 15.82 | 20.22 | 10342 |  |  |  |
| FD002 | Baseline B · LightGBM | 25.52 | 13.01 | 16.87 | 6724 | 0.795 | 31.8 | **yes** |
| FD002 | Main · CNN-GRU quantile | 25.91 | 14.66 | 17.91 | 6311 | 0.741 | 27.6 |  |
| FD003 | Baseline A · Ridge | 18.28 | 16.66 | 15.24 | 586 |  |  |  |
| FD003 | Baseline B · LightGBM | 15.11 | 13.38 | 10.89 | 354 | 0.640 | 17.7 | **yes** |
| FD003 | Main · CNN-GRU quantile | 15.48 | 13.78 | 10.80 | 404 | 0.670 | 16.7 |  |
| FD004 | Baseline A · Ridge | 31.99 | 20.32 | 24.75 | 9835 |  |  |  |
| FD004 | Baseline B · LightGBM | 26.41 | 14.39 | 18.67 | 4648 | 0.802 | 34.6 | **yes** |
| FD004 | Main · CNN-GRU quantile | 27.61 | 14.98 | 19.27 | 5525 | 0.798 | 27.9 |  |
**Coverage outside 75–85 % for FD003**: flagged, not hidden (see per-subset reports).
```
Check (2): unit-disjoint split test + "scaler fitted on train units only" test.
```
> python -m pytest -v
============================= 9 passed in 13.59s ==============================
```
Replay-engine alarm quality (P(RUL≤20) ≥ 0.3, serving model, engines never fitted/calibrated on):
```
FD001 replay 20 missed 0 premature 0 lead p10/med/p90 20.0 24.5 34.3
FD002 replay 52 missed 0 premature 0 lead p10/med/p90 19.1 24.0 37.0
FD003 replay 20 missed 0 premature 0 lead p10/med/p90 18.7 23.0 27.2
FD004 replay 50 missed 0 premature 0 lead p10/med/p90 15.9 22.0 28.1
```

**Stage 2** — Check (1): fleet totals match (72 tails, every base hosts ≥3 types). Check (2): routes cached on disk.
```
> python -m pratirakshak.world
Fleet by base × type
type   GAR  PRA  SHI  VAH  total
base
ARV      6    5    6    3     20
HIM      8    0    2    5     15
KAV      2    8    7    2     19
SAH      4    5    5    4     18
total   20   18   20   14     72
types per base: {'ARV': 4, 'HIM': 3, 'KAV': 4, 'SAH': 4} → every base ≥3 types: True
sample tails: PR-G118, PR-G131, PR-G144, PR-G176 …

Base elevations (Open-Meteo 90 m DEM): {'SAH': '693 m', 'ARV': '245 m', 'HIM': '3623 m', 'KAV': '90 m'}
Climate source: {'SAH': 'Open-Meteo archive 2015–2024', 'ARV': 'Open-Meteo archive 2015–2024', 'HIM': 'Open-Meteo archive 2015–2024', 'KAV': 'Open-Meteo archive 2015–2024'}

Routes: 56 ({('road', 'osrm'): 28, ('air', 'great_circle'): 28}); cached road GeoJSON files: 28; air.geojson: True
Seasonal-closure road routes (HIM): 7
HIM nearest by road: [('road:CHE-HIM', '683 km', '16.7 h'), ('road:ARV-HIM', '979 km', '20.3 h'), ('road:HIM-VIN', '1713 km', '31.9 h')]

Parts: 35 · stock rows: 280 · missions: 1350 · environment rows: 360
wrote data/processed/world/ (13 files)
```

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
| 2026-10-17 | Sim calendar D+0 = 2026-06-01, 90 days (Jun–Aug) | Monsoon at SAH, heat at ARV, Ladakh roads open, so "supply cut" is a scenario event rather than the default state | Yes (`calendar.sim_start`) |
| 2026-10-17 | Fleet allocation explicit in config: SAH 4/5/4/5, ARV 6/5/3/6, HIM 8/0/5/2, KAV 2/8/2/7 (G/P/V/S) | Meets every §3.2 constraint; user-editable | Yes |
| 2026-10-17 | 3 depots (Vindhya MP, Godavari Telangana, Chenab Jammu) + Nandi vendor hub (Karnataka), fictional names | §9.4 needs depots + vendor hub; Chenab gives Ladakh a near road source | Yes |
| 2026-10-17 | Engine cycle→sorties k: Garjan 1.0, Prahar 1.0, Vahak 0.8, Shikshak 1.5; engine phase U(0.05, 0.70) | §3.3 time scaling; spreads end-of-life events across the horizon. Revisit only if Stage 7 gets no events | Yes |
| 2026-10-17 | Climate/elevation from Open-Meteo (keyless); dust & salinity ILLUSTRATIVE config | No keyless historical dust source used; keeps it honest | Yes |
| 2026-10-17 | Road routes: OSRM full geometry, RDP ε=0.003° (≈300 m); time × 1.35 truck factor + 3 h handling | Small committed GeoJSON that still draws well | Yes |
| 2026-10-17 | Generated artefacts in `data/processed/` and `data/routes/` are committed (small, deterministic) | Front-end + offline fallback need them; only `data/raw` and `data/interim` are ignored | Yes |
| 2026-10-17 | Engine serving model = LightGBM + split conformal (all subsets); CNN-GRU kept for the Results comparison | Main model not ≥ 3 % better on any subset (SPEC rule 15 / §17) | Yes (re-run train) |
| 2026-10-17 | Model inputs = 14 sensors (12 headline + NRf, NRc); explanations restricted to the 12 headline | Standard informative set; NRf/NRc double as trust cross-checks | Yes |
| 2026-10-17 | Calibration set = 10 seeded truncation windows per val unit (not every window) | Mimics how the test set was cut; avoids thousands of highly correlated scores | Yes |
| 2026-10-17 | `P(RUL ≤ H)` = linear CDF through the 11 conformal quantiles + split-normal tails; H = 20 cycles, θ = 0.3 for the alarm report | Simple, monotone, uses the calibrated quantiles directly | Yes (`config/models.yaml`) |
| 2026-10-17 | Per-decision drivers = occlusion of each sensor to its healthy baseline on the **serving** model | Explanation comes from the model that makes the decision; SHAP (LightGBM) kept as global cross-check | Yes |
| 2026-10-17 | `model.pt`/`lgbm.txt` gitignored; replay predictions + metrics committed | Downstream stages run without retraining; weights regenerate with `./tasks.ps1 train` | Yes |

## Defaults used because the user hadn't specified (SPEC §3.4)
- Base names / aircraft names / fleet mix: SPEC defaults (to be written to `config/world.yaml` in Stage 2).
- Map source in use: not yet chosen (Stage 9); keyless first.
- Sim start date: 2026-06-01 (not in SPEC; chosen, see Decisions).
- Depot / vendor-hub names and locations: fictional, chosen in Stage 2 (not in SPEC).
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
| Open-Meteo terms | free, keyless | Non-commercial free tier: 600/min, 5,000/h, 10,000/day; data CC BY 4.0; cite Open-Meteo + ERA5/ERA5-Land + Copernicus line | open-meteo.com/en/terms + historical-weather-api docs, 2026-10-17. Daily `relative_humidity_2m_mean` confirmed working by a live call |
| OSRM demo server policy | polite use | ≤ 1 request/s, reasonable non-commercial use, no uptime guarantee; data © OSM (ODbL) | GitHub wiki "Demo-server", 2026-10-17. 28 requests sent once at 1.1 s spacing, all `Ok` |
| Base elevations | SPEC ~600/220/3300/100 | DEM: 693 / 245 / 3623 / 90 m | HIM differs because of the nudge into the Indus valley |

## Metrics log (append; never overwrite)
| Stage | Date | Item | Value | Notes |
|---|---|---|---|---|
| 3 | 2026-10-17 | Serving (LightGBM) test RMSE FD001/2/3/4 | 13.76 / 25.52 / 15.11 / 26.41 | SPEC sanity 12–16 / 18–28 ✓ |
| 3 | 2026-10-17 | 80 % PICP (serving) FD001/2/3/4 | 0.810 / 0.795 / 0.640 / 0.802 | FD003 flagged (< 0.75) |
| 3 | 2026-10-17 | Replay alarm (H=20, θ=0.3) | 142 engines, 0 missed, 0 premature, median lead 22–24.5 cycles | held-out engines |
| 3 | 2026-10-17 | CNN-GRU vs LightGBM RMSE | worse by 1.5–18.5 % | main not served |

## Open issues / known defects
- [ ] **FD003 interval under-covers** (80 % nominal → 64 % on test). Likely cause: only 16 val units / 160 calibration windows, and FD003's long lifetime tail (up to 525 cycles) makes val and test truncations less exchangeable. Not tuned (rule 15). Effect: Shikshak engine risk is somewhat over-confident. Options if time allows: calibrate on val ∪ part of replay, or widen with a per-subset factor, and say so. Shown on the Results screen as flagged.
- [ ] `mission_critical: role` for avionics: the role-dependent rule (type's `criticality_role` list) is defined in config but only applied from Stage 4/6.
- [ ] Elevation profiles along road routes (for S5) are not computed yet; planned for Stage 9/12 from the Terrarium DEM.
- [ ] npm 11 blocks dependency install scripts by default (`esbuild` postinstall skipped). Build works regardless (esbuild ships platform binaries as optional deps). If a later dependency needs its install script, approve it with `npm approve-scripts <pkg>`.
- [ ] In the Claude Code sandbox, `pip install -e .` failed writing to `%TEMP%`; worked with `TMP/TEMP` pointed at a writable folder. A normal terminal should not hit this.

## Next steps (ordered, concrete)
1. Stage 4: write plan here. `config/couplings.yaml` (driver → system matrix, SPEC §7.3). `synth/`: per-aircraft per-day drivers (sorties from missions, intensity, environment, age), latent health per non-engine system (gamma process with inception point, drift × drivers × couplings), sensor model with faults (stuck/drift/dropout/spike), ground-truth failure day; maintenance reset effect.
2. Engines: advance each aircraft's replay unit by sorties ÷ k cycles per day; read the committed `replay_predictions.parquet` for RUL quantiles/`P(fail)`.
3. Real anchors: check UCI hydraulic (licence, size) and NASA battery data; use them only if quick, otherwise published ranges, marked SIMULATED (rule: no pretending).
4. Non-engine RUL: one LightGBM per system on rolling features + abs-residual conformal (reuse `models/conformal.py`), validated against synthetic truth.
5. Combiner: health 0–100, `R = 1 − Π(1 − p_i)`, readiness gating + limiting system, weighted health, bundling window. Checks: per-system estimate-vs-truth error table (SIMULATED); unit test for `R` and gating.

## How to run (keep current)
```
# setup     ./tasks.ps1 setup        | make setup
# data      ./tasks.ps1 fetch; ./tasks.ps1 data   → docs/DATA_NOTES.md, data/processed/splits.json
# world     ./tasks.ps1 world  → data/processed/world/, data/routes/  (network optional after first run)
# train     ./tasks.ps1 train [-Fast]  → models/engine/, reports/engine_*.md  (~34 min full, CPU; -Fast ≈ 1/4)
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
