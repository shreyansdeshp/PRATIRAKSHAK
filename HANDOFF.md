# HANDOFF — Pratirakshak

> Running state of the build. Update at the **start** and **end** of every stage and whenever you stop. A fresh Claude Code session must be able to resume from this file + `SPEC.md` alone.

## Status
- **Current stage:** 9 — Front-end foundation (next)
- **Last completed stage:** 8 — Export & API
- **Last commit:** see `git log -1` (Stage 8: snapshot export, vendor subset, API, offline)
- **Date/time of last update:** 2026-10-17 09:20
- **Demo seed:** **5** (median rule: base-scenario P3 − best-baseline ready-% gain closest to the median)
- **Global seed:** 26249
- **Remote:** `https://github.com/shreyansdeshp/PRATIRAKSHAK.git` (branch `main`); commits authored as `shreyansdeshp <sndeshpande_b25@it.vjti.ac.in>` (repo-local git config). Push after every stage commit.

## Stage plan (live checklist)
- [x] 0 Scaffold & environment
- [x] 1 Data ingest & verification
- [x] 2 World generator
- [x] 3 Engine RUL models
- [x] 4 Other systems + aircraft combiner
- [x] 5 Intelligence (trust, explanations, mission fit)
- [x] 6 Decision, spares, scheduling
- [x] 7 Simulation & results
- [x] 8 Export & API
- [ ] 9 Front-end foundation
- [ ] 10 Hero & storyline engine
- [ ] 11 Fleet, base, aircraft showroom
- [ ] 12 Decision, spares, planning screens
- [ ] 13 Stress, counterfactuals, intelligence, results, lifecycle, vendor, offline, method
- [ ] 14 Polish (REDUCED by user 2026-10-17: motion pass, copy pass, empty/error states, README only — NO recording, voiceover, video or final 4K shot set; the team does those)

## This stage's plan (10–20 lines, written before coding)
**Stage 8 — Export & API**
1. `export/build.py` (`./tasks.ps1 export`): writes the static snapshot to `frontend/public/data/` — `meta`, `world` (bases + env summary, types, aircraft, nodes, parts, stock, routes; road geometry copied to `data/routes/`), `state` (per tail: status, limiting, risk, health, 8 systems with RUL p10/p50/p90, P(fail), provenance, confidence, drivers; trust per sensor), `history` (60-day system-sensor sparklines + REAL last-60-cycle engine headline sensors with healthy baseline), `decisions`, `plan`, `missions`, `intelligence` (graph, harness, engine importance), `models` (engine + system metrics, calibration), `results` (summary, curves, paired, ablation, sensitivity, counterfactuals, trimmed demo events), `twin` (default 60-day health fans per tail), `manifest` (files, bytes, sha256).
2. `vendor.json`: a **separate** subset built server-side — demand id, LRU, qty, destination, deadline, priority, source, mode, ETA, route — no tail ids, health or readiness. Commander files are never referenced by the vendor shell.
3. `export/schema.py`: light JSON Schemas (required keys/types) validated at export; `docs/SNAPSHOT_SCHEMA.md` documents every file. Deterministic bytes (no wall-clock timestamps); total < 25 MB.
4. `api/app.py` (FastAPI): `/api/health`, `/api/twin` (Monte-Carlo what-if from the simulator's forward model: usage ×, defer n days, environment), `/api/resimulate` (one seed of a scenario × policy), `/api/decision` (re-run the rule at a chosen θ / criticality), `/api/vendor/demands` (vendor subset only). CORS for the dev server.
5. Front-end data layer `src/data/client.ts`: static-first loader with optional API (timeout → silent fallback); `public/sw.js` service worker caching app shell + `/data/*` (registered in production builds).
6. Checks: Playwright with **no API running** loads every snapshot through the data layer (`/dev/data` page); pytest asserts the vendor snapshot has no tail ids / health / readiness fields. Commit + push.

**Stage 7 — Simulation & results** (done)
1. `config/scenarios.yaml`: base · surge (sortie demand ×2, sensor-fault hazard ×1.5) · strike (ARV day 20: bays −60 %, ARV store lost, 3 aircraft damaged) · supply (HIM roads closed all horizon + vendor dispatch +72 h) · weather (dust/humidity/wet up) · late detection d ∈ {1,3,7} (P3 acts on data d days old).
2. `sim/engine.py`: 90-day daily sim from the D+0 truth (`d0_latent.json`; engines continue their REAL replay trajectories, cycles/day from sorties × env acceleration). Each day: sorties from missions spread over available aircraft → damage step → failures (in flight = mission abort; cascade chance) → observations with faults → policy → greedy scheduling with bay/tech-hour/floor limits → services, spares consumption, replenishment from the vendor hub after lead time, orders in transit. **Common random numbers**: a separate RNG per (seed, day, purpose).
3. Policies: P0 run-to-failure; P1 fixed-interval (the fleet's legacy 0.6 × usage-adjusted life; engines at 0.6 × median subset life) — one fair setting; P2 raw-sensor threshold alarms (3-day mean beyond 70 % of the failure signature; engines HPC z-alarm) with no spares-awareness; P3 Pratirakshak (daily RUL estimates → rule → orders ahead → bundled greedy plan; VERIFY_SENSOR on untrusted drivers). Unplanned failures handled identically for all.
4. Metrics per run: mean ready %, sortie fill %, unplanned failures, in-flight failures, planned / unplanned downtime h, wasted life %, stockouts, expedite success, ₵ total; daily ready curves.
5. `sim/__main__.py` (`./tasks.ps1 sim`): policies × scenarios × 10 seeds; 95 % CIs; demo seed = base-scenario seed whose P3-vs-best-baseline availability gain is closest to the median; ablations (no trust / no spares-awareness / no bundling); sensitivity (θ scale, usage, stock, delay; 5 seeds); late-detection and 2×-usage counterfactual data; `reports/results.md` incl. where P3 does **not** help; JSON for the Results screen.
6. Checks: one command regenerates the table with CIs; `reports/results.md` written with demo seed + "where it does not help".

**Stage 6 — Decision, spares, scheduling** (done)
1. `config/policies.yaml`: θ by mission criticality (training 0.30 / routine 0.25 / operational 0.10), monitor band, bundling tolerance 7 d, look-ahead 30 d, sensor→LRU map, vendor dispatch time; `config/costs.yaml` (ILLUSTRATIVE ₵ / hours: planned vs unplanned multipliers, AOG, mission abort, cascade).
2. `decide/spares.py`: local stock → candidate sources (other bases, depots, vendor hub) by ETA: road (OSRM time, closed when the seasonal closure covers the date), airlift (needs a READY Vahak; positioning leg from its base); nearest 2–3. `source_or_pull(eta_h, install_h, deadline_h)`; cannibalisation from an already-grounded tail of the same type.
3. `decide/rule.py`: the one rule per tail × system → action + reason card (what / why / how sure / key sensors / alternatives with consequences / spare route). Untrusted driving sensor → VERIFY_SENSOR instead of a pull. Aircraft action = most severe system action; mission-fit exclusions → SWAP_TAIL_FOR_MISSION.
4. `plan/scheduler.py`: bundle tasks per aircraft (tolerance), visits with release (spare ETA) and due (lower-bound RUL); CP-SAT with cumulative hangar-bay and tech-hour limits per base-day and per-type readiness floors, objective = risk-weighted start + heavy lateness penalty; deterministic time limit; EDF greedy fallback; report CP-SAT vs greedy and solve time. Post-hoc bay assignment for the Gantt.
5. Outputs: `data/processed/plan/{decisions.json, schedule.json, spares_requests.json}`, `reports/plan_d0.md`.
6. Checks: `test_spares_rule.py` (ETA 30 h vs deadline 20 h → PULL; 10 h → SOURCE) and `test_scheduler.py` (never exceeds slot/hour limits). Commit + push.

**Stage 5 — Intelligence (trust, explanations, mission fit)** (done)
1. `config/intelligence.yaml`: trust window 14 days, rule thresholds and penalties, confidence rules, mission templates (length days, environment, criticality → θ, type, count).
2. `intelligence/trust.py`: per-sensor relation model = linear regression of each sensor on its system siblings (+ stress), fitted on **fault-free** synthetic data ("expected relations on healthy segments"); trust 0–100 from stuck-at run, variance collapse, dropout rate, out-of-range, spike, and sibling-residual z (drift). Fault vs degradation: degradation moves siblings consistently (small residual); a fault breaks the relation. Engines: same method on z-scored C-MAPSS inputs with the pairs Nf↔NRf, Nc↔NRc, P30↔Ps30 inside the sibling set.
3. Fault-injection harness: fresh synthetic airframes with the generator's fault process (ground-truth log) + engine replay units with injected stuck/drift/dropout → detection rate (per type), median delay, false-alarm rate per sensor-day. Run once.
4. `intelligence/explain.py`: engines → occlusion on the serving model at each tail's D+0 window (12 headline sensors only), plain text with raw-unit deviation vs healthy baseline over the window; systems → largest standardised deviations from healthy (with env correction). Confidence high/medium/low from interval width, LightGBM-vs-CNN-GRU agreement (engines) and minimum trust of key sensors, with reasons.
5. Global sensor importance + sensor → part → LRU → action graph data (`intelligence/graph.json`).
6. `intelligence/mission.py`: `P(complete) = Π(1 − P(fail_i within mission length))` with environment-adjusted RUL; ranked shortlist with exclusion reasons for each template.
7. Checks: harness detection + false-alarm rate (once); explanations use only headline engine sensors with plain names (asserted). Commit + push.

**Stage 4 — Other systems + aircraft combiner** (done)
1. `config/systems.yaml`: per system life (days at nominal use), gamma-process variability, inception point + acceleration, maintenance restore, sensors (unit, healthy value, effect at failure, nonlinearity, noise, environment terms) per SPEC §7.2; sensor-fault hazards (stuck/drift/dropout/spike); window 14 days, RUL cap 150 days, risk watch/pull limits. `config/couplings.yaml`: usage, intensity, environment, system→system and hard-landing couplings (§7.3), plus engine-cycle acceleration from dust/heat.
2. `synth/anchor_hydraulic.py` (**REAL-ANCHORED**): UCI hydraulic data (CC BY 4.0, 73 MB, gitignored) → cycle features; LightGBM classifiers for pump leakage / accumulator / cooler on a block split (no temporal leak), real validation; extract pressure noise and severe-leak pressure drop and cooler temperature effect → calibrate synthetic hydraulics. NASA battery/actuator data: skipped (size/format), published ranges instead, marked SIMULATED.
3. `synth/model.py`: vectorised forward model — drivers → damage d (gamma increments, inception, accel, couplings) → observed daily sensors with injected faults (ground-truth fault log) → failure when d ≥ 1; `service()` reset with small infant-failure probability. Same model is reused by the Stage 7 simulator and the Stage 8 twin.
4. `synth/train.py`: 240 synthetic airframes × 900 days (renewal on failure, random base climate / type usage) → per-system LightGBM RUL (14-day rolling features + days since service + usage/stress), split by airframe 60/20/20, abs-residual conformal (reuse `models/conformal.py`), metrics vs synthetic truth (SIMULATED).
5. `decide/combine.py`: health 0–100, `R = 1 − Π(1 − p_i)`, readiness gating (critical systems incl. role-dependent avionics), limiting system, criticality-weighted health, task bundling within a tolerance window.
6. `synth/__main__.py`: fleet state at D+0 (60-day history per tail from its base climate + usage; engines from committed replay predictions at their start cycle, cycles → days via usage) → `data/processed/state/`.
7. Checks: one estimate-vs-synthetic-truth table per system; unit test for `R` and gating. Commit + push.

**Stage 3 — Engine RUL models** (done) (one training run; accuracy only needs to be reasonable — rule 15)
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
**Stage 8**
- `export/build.py` + `schema.py` + `__main__.py` (`./tasks.ps1 export`): 13 JSON files + 29 route GeoJSONs in `frontend/public/data/` (**4.11 MB**), validated against light JSON Schemas; `docs/SNAPSHOT_SCHEMA.md`. No future truth exported (engine life lengths, latent damage stay in the backend). Engine sparklines = condition-normalised deviation from healthy baseline in sensor units (raw values jump between the 6 operating conditions).
- `vendor.json` built separately from demand records: 3 P1 expedites + 22 restock demands from the D+0 plan; no tail ids / health / readiness (test `test_vendor_snapshot.py`).
- `twin.json`: default 60-day condition fans (200 Monte-Carlo draws of the simulator's forward model) per tail.
- `api/app.py` (FastAPI): `/api/health`, `/api/twin` (usage ×, defer + service, environment), `/api/resimulate`, `/api/decision`, `/api/vendor/demands`; verified with the test client (added pinned dev dep `httpx==0.28.1`, lock refreshed).
- Front-end: `src/data/client.ts` (static-first, 1.2 s API probe, silent fallback), `public/sw.js` (cache-first snapshot + app shell, registered in production), `/dev/data` check page.

**Stage 7**
- `config/scenarios.yaml`; `sim/engine.py` (daily simulator, CRN via RNG per (seed, day, purpose), P0–P3, unplanned handling identical for all, spares consumption + vendor replenishment, greedy hangar plan in the loop), `sim/runner.py` (worker setup + caches), `sim/__main__.py` (`./tasks.ps1 sim`; grid, CIs, paired diffs, demo seed, ablations, sensitivity, counterfactuals, report; `--report-only`).
- **Laptop crash (twice) — my fault:** first version launched 12 workers that each rebuilt the engine pre-processing (~0.5–1 GB each) with multi-threaded BLAS/OpenMP → RAM + all 16 threads saturated → hard power-off (Windows Kernel-Power 41 at 07:51, no bugcheck). Fix: engine arrays cached once (`data/interim/sim_engine_cache.pkl`), workers measured at **≈ 210 MB peak**, 1 maths thread each, below-normal priority, default ≤ 6 workers (5 on this 16-thread machine). Full run: 310 sims in ~3–4.5 min.
- Speed fixes from profiling (P3 run 27.5 s → 5 s): `score()` re-read YAML each call; `p_fail_within` looped scipy.cdf → vectorised (**verified identical to the old version, max diff 1e-16**, so Stage 4–6 artefacts are unchanged); NaN-safe sort key.
- Fairness fix for **P2** (it was a straw man): condition-corrected limits + 7-day re-alarm cooldown (wasted life 70 % → 53 %).
- Late-detection bug fixed: the lag was also applied to maintenance records (negative days-since-service → re-servicing just-replaced parts) and engine-change cycles; and RUL was "corrected" for the lag, which assumes the operator knows data is stale. Now: only sensor data is stale and treated as current.
- **Determinism evidence:** the main grid gave identical numbers in two full runs with 4 and 5 workers.
- **Honest headline:** vs the best baseline (fair threshold alarms) P3 cuts unplanned failures ≈ 31 / 90 days in every scenario (base 32 → 1), wasted life −15…−18 pts; under surge +3.3 pts ready, +6.3 pts sorties, −₵218k. **Does not help**: base/strike/supply availability and cost (no clear difference), weather availability −1.7 and cost +₵34k (worse). Ablations: sensor trust and bundling show **no measurable effect** in this sim (claimed only as safeguards); spares-awareness trades −4.6 pts ready for −14.5 failures. Late detection raises failures 1.2 → 8.8 (7 d) but *raises* 90-day availability (deferred work falls past the horizon) — S8 must tell the failure story, not an availability story.
- Outputs: `data/processed/results/{runs.parquet, summary.json, curves.json, ablation.json, sensitivity.json, counterfactuals.json, demo.json}` (1.3 MB), `reports/results.md`.

**Stage 6**
- `config/policies.yaml` (θ by criticality 0.30/0.25/0.10, monitor band, bundling 7 d, look-ahead 30 d, sensor→LRU map, CP-SAT limits), `config/costs.yaml` (ILLUSTRATIVE ₵/hours). `decide/spares.py` (Logistics: local → nearest sources by ETA, seasonal closure, airlift needs a non-PULL Vahak + positioning leg, vendor dispatch +24 h; `source_or_pull`), `decide/rule.py` (the rule + reason card: what/why/how sure/key sensors/alternatives with downtime & ₵, cannibalisation donors), `plan/scheduler.py` (visits = bundled tasks; CP-SAT with cumulative bays, tech-hours and per-type readiness floor; EDF greedy; `check_limits`), `decide/__main__.py` (`./tasks.ps1 plan`, new target in Makefile/tasks.ps1).
- D+0 result: 40 SERVE_NORMALLY · 16 SCHEDULE_SERVICE · 10 PULL · 4 MONITOR · 1 VERIFY_SENSOR (PR-G295, trust 3/100) · 1 EXPEDITE_SPARE (PR-S350: GCU airlifted Aravalli → Himshikhar in 5 h, fit 2 h). 41 hangar visits, all scheduled, 1 late; **CP-SAT 3.4 % better than greedy**, no limit violations.
- More PULLs (10) than D+0 status PULLs (7) because θ depends on that day's mission criticality (operational 0.10).
- Fixed after the first run: "pull because a *local* part is 0 h away" read as nonsense → near-zero lower-bound RUL now says "failure plausible at any moment — pull now and fit from the store"; base codes → base names; CP-SAT deterministic limit 8 → 2 (13.6 s → 5.5 s wall, same objective 43,716).
- Outputs: `data/processed/plan/{decisions,schedule,spares_requests}.json`, `reports/plan_d0.md`.

**Stage 5**
- `intelligence/trust.py` (sibling-regression relations fitted on fault-free data; stuck / flat / dropout / out-of-range / isolated-spike / residual-drift components; single-fault localisation), `harness.py` (fault-injection harness + fleet scoring at D+0), `explain.py`, `mission.py`, `graph.py`, `__main__.py`; `config/intelligence.yaml`.
- Fixed along the way (each found by the harness / checks, not by tuning): (1) generator recorded the fault code *after* the end-of-day tick → 1-day spikes and every episode's last day were missing from ground truth; (2) noise estimate inflated by service steps → robust MAD noise; (3) "spike" fired on real step changes → must be an isolated one-step excursion not shared by siblings (false alarms 5.5 % → 0.20 % per sensor-day); (4) engine trust windows were left-padded → looked "stuck" on young engines; (5) confidence was "low" for every pull because relative width explodes near RUL 0 → confidence now measures the *decision*: distance of P(fail) from θ + sensor trust + model agreement (interval width kept as a stated reason).
- Outputs: `data/processed/state/{trust_d0.parquet, explanations.json, mission_fit.json}`, `models/intelligence/{trust_harness,trust_relations,graph}.json`, `reports/trust_harness.md`.
- Story hooks found: **PR-G295** (Garjan) is PULL on avionics but its driving sensor has trust 3/100 → Stage 6 should turn it into VERIFY_SENSOR (U6 "a bad sensor doesn't trigger a false pull"). **PR-S149** hydraulics pull is driven by pressure −19 psi (the REAL-anchored effect size) + fluid temp +23 °C.

**Stage 4**
- `config/systems.yaml`, `config/couplings.yaml`; `synth/model.py` (gamma-process damage, couplings, sensor model, injected stuck/drift/dropout/spike faults with ground-truth log, `service()`), `synth/train.py` (240 synthetic airframes × 900 days, per-system LightGBM + abs-residual conformal, `legacy_intervals()`), `synth/anchor_hydraulic.py`, `synth/fleet.py` (D+0 state), `decide/combine.py` + `tests/test_combine.py`.
- **Hydraulics REAL anchor**: UCI #447 downloaded (73 MB, gitignored). Block-split validation: pump leak 0.921 acc, accumulator 0.594, cooler 0.991, valve 0.907 (paper also calls accumulator the hard target). Rig calibration: severe leak −0.47 % pressure, cooler failure +20.0 °C fluid temp → synthetic hydraulics effects; rig noise is lab-grade so configured noise is the floor. My first version clamped the pressure effect to ≥ 2 % — removed, the data value is used.
- Fleet-plausibility fixes (world setup, not model tuning; predictions matched truth throughout): (1) usage is relative to a fleet reference of 1 sortie/day, not the tail's own rate; (2) the D−60…D0 history runs the fleet's existing fixed-interval practice (`legacy_service_fraction` 0.6, random phase). Before: 33 PULL / 72; after: **53 READY · 12 WATCH · 7 PULL**.
- Outputs: `data/processed/state/{d0_systems,d0_aircraft,sensor_history}.parquet`, `d0_latent.json` (truth, for the simulator), `data/processed/anchors/hydraulics.json`, `models/systems/<system>/{conformal,feature_spec,metrics}.json` (+ gitignored `lgbm.txt`), `reports/system_models.md`.

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
**Stage 8** — Check (1): the front-end data layer loads from static files with the API off; Check (2): the vendor snapshot contains no tail-level health.
```
> npx playwright test e2e/data.spec.ts        (all requests to localhost:8000 aborted)
all 13 snapshot files loaded
  ok 1 data.spec.ts:4:1 › data layer loads all snapshots with the API off (856ms)
  1 passed (17.2s)
> python -m pytest -q                          → 21 passed (incl. test_vendor_snapshot: no PR-xnnn, no health/status/readiness keys)
> python -m pratirakshak.export
snapshot: 41 files, 4.11 MB (limit 25 MB) → frontend/public/data/
```

**Stage 7** — Check (1): the results table regenerates with one command and has intervals across seeds; Check (2): `reports/results.md` records the demo seed and where Pratirakshak does not help.
```
> python -m pratirakshak.sim
running 310 simulations on 5 workers …
  done in 270 s
  demo seed 5 (gain -0.34 pp; median -0.55; range -1.10…+1.34)
(base scenario, mean [95 % CI], 10 seeds)          P0 Run-to-failure     P1 Fixed interval     P2 Threshold alarms   P3 Pratirakshak
| base | Ready aircraft (%)                  | 75.3 [74.4, 76.3] | 75.2 [73.8, 76.6] | 89.1 [88.6, 89.6] | 88.8 [88.3, 89.3] |
| base | Unplanned failures                  | 181 [178, 185]    | 98 [96, 101]      | 32 [29, 35]       | 1 [0, 2]          |
| base | In-flight failures (mission aborts) | 170 [166, 174]    | 94 [91, 98]       | 32 [29, 34]       | 1 [0, 2]          |
| base | Wasted life (%)                     | 0.0               | 26.0 [25.5, 26.6] | 52.6 [51.9, 53.3] | 35.0 [34.9, 35.2] |
| base | Cost (₵, ILLUSTRATIVE)              | 709433            | 795073            | 510388            | 524030            |
P3 − best baseline (paired): surge ready +3.3 [+2.5, +4.2], sorties +6.3 [+5.3, +7.2], failures −110.4; weather ready −1.7 [−2.5, −1.0] (worse)
reports/results.md §4 "Where Pratirakshak does NOT help (computed, not hand-picked)": 8 entries + 2 standing caveats.
> python -m pytest -q   → 20 passed
```

**Stage 6** — Check (1): hand-checkable SOURCE/PULL test; Check (2): scheduler never exceeds slot/hour limits.
```
> python -m pytest -v backend/tests/test_spares_rule.py backend/tests/test_scheduler.py
backend\tests\test_spares_rule.py ..      (ETA 30 h + 5 h fit vs 20 h → PULL; 10 h → SOURCE; winter closure → airlift only; no Vahak → unreachable)
backend\tests\test_scheduler.py ..        (greedy and CP-SAT: check_limits(...) == [] on an over-subscribed 40-task instance)
============================== 4 passed in 7.09s ==============================
> python -m pratirakshak.decide
Scheduler: **cp-sat** · visits 41 (scheduled 41, late 1) · greedy objective 45251.0 · CP-SAT {'status': 'FEASIBLE', 'wall_seconds': 5.472, 'deterministic_time': 2.0, 'best_bound': 13154.0, 'objective': 43716.0, 'improvement_vs_greedy': 0.0339}
Limit check (bays, tech-hours, readiness floor per base-day): no violations
> python -m pytest -q   → 20 passed
```

**Stage 5** — Check (1): fault-injection harness, detection + false-alarm rate (run once after the fixes).
```
> python -m pratirakshak.intelligence
  systems: 1094 faults · detection 70.3% · median delay 2.0 d · false alarms 0.20% per sensor-day
  engines: 43 faults · detection 100.0% · median delay 22.0 cycles · false alarms 0.70% per sensor-cycle
  by type (systems): {'stuck': '85% of 326', 'drift': '58% of 337', 'dropout': '59% of 279', 'spike': '86% of 152'}
  fleet at D+0: 3220 sensors scored, 35 untrusted
explanations …
  engine driver sensors used: ['BPR', 'Nc', 'Nf', 'P30', 'Ps30', 'T24', 'T30', 'T50', 'W31', 'W32', 'htBleed', 'phi'] (all headline: True)
mission fit …
  HIMKAVACH: assigned ['PR-G281', 'PR-G354', 'PR-G321', 'PR-G340'] (shortfall 0); excluded 1/8
  SAGARDRISHTI: assigned ['PR-P351', 'PR-P363', 'PR-P371', 'PR-P322'] (shortfall 0); excluded 1/8
  AIRBRIDGE: assigned ['PR-V106', 'PR-V108'] (shortfall 0); excluded 0/4
graph: 95 nodes, 195 edges; top engine sensors ['Ps30', 'T50', 'T30', 'htBleed', 'Nc']
```
Explanation check (asserted in code: engine drivers ⊆ 12 headline sensors and text contains the plain name). Example (most-driven engine, PR-G340):
`HPC outlet static pressure (Ps30) is +0.298 psia from its healthy baseline over the last 10 cycles; resetting it to healthy would add 25 cycles to the estimate / LPT outlet temperature (T50) is +9.35 °R … / HPC outlet temperature (T30) is +5.34 °R …`
Decision confidence for the 7 PULL aircraft (after the confidence fix): 3 high, 3 medium, 1 low (PR-G295: driving sensor trust 3/100).

**Stage 4** — Check (1): estimate-vs-synthetic-truth error per system (SIMULATED), from `reports/system_models.md`.
```
| System | Failures simulated | Test rows | RMSE (days) | MAE (days) | MAE when RUL ≤ 30 d | PICP 80 % | MPIW 80 % (days) |
| hydraulics | 854 | 12,561 | 15.60 | 10.22 | 8.018 | 0.797 | 34.7 |
| landing_gear | 1518 | 12,989 | 16.18 | 11.84 | 7.363 | 0.834 | 41.9 |
| flight_controls | 877 | 12,687 | 16.11 | 11.12 | 8.573 | 0.821 | 40.3 |
| electrical | 1023 | 12,798 | 16.54 | 11.65 | 8.141 | 0.818 | 40.3 |
| avionics | 1270 | 12,846 | 19.45 | 14.26 | 7.577 | 0.810 | 46.6 |
| fuel | 979 | 12,605 | 15.92 | 11.23 | 7.582 | 0.807 | 39.0 |
| structure | 100 | 11,978 | 10.97 | 3.41 | 28.801 | 0.824 | 1.3 |   ← rare failures; low MAE = mostly capped rows (caveat in report)
```
Check (2): unit tests for `R = 1 − Π(1−p)` and readiness gating.
```
> python -m pytest -q
................                                                         [100%]   (16 passed: 7 combiner + 9 earlier)
```
D+0 fleet (python -m pratirakshak.synth --skip-train):
```
status  PULL  READY  WATCH
ARV        2     16      2
HIM        1     12      2
KAV        3     10      6
SAH        1     15      2
Limiting systems: {'electrical': 21, 'avionics': 15, 'fuel': 14, 'landing_gear': 13, 'flight_controls': 7, 'hydraulics': 2}
Weighted health: mean 77.1, min 50.7
```

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
| 2026-10-17 | Non-engine systems: damage d (failure at 1), gamma process with inception/acceleration; daily observations; p_fail window 14 days; RUL cap 150 days | Simple, documented, reusable by sim + twin | Yes (`config/systems.yaml`) |
| 2026-10-17 | Usage multiplier relative to fleet reference 1 sortie/day | Usage must matter across types (SPEC 2× usage counterfactual) | Yes |
| 2026-10-17 | Pre-D+0 history uses the fleet's existing fixed-interval practice (0.6 × usage-adjusted life, random phase) | Unmaintained history gave an implausible 46 % PULL fleet; this is also the P1 baseline logic for Stage 7 | Yes |
| 2026-10-17 | Engine "system" for a 2-engine Vahak: p = 1 − Π(1 − p_engine), RUL/health of the worse engine | Either engine failing grounds the aircraft | Yes |
| 2026-10-17 | Health = 100 · clip(RUL_p50 / ref) (ref 125 cycles engines, 150 days systems) | Monotone, explainable; limiting system shown beside it | Yes |
| 2026-10-17 | Battery/actuator NASA data not used | Large MATLAB archives; time better spent on front-end; labelled SIMULATED | Yes |
| 2026-10-17 | Trust = product of component penalties; relations = linear+quadratic regression on siblings (+ stress) fitted on fault-free data; single-fault-per-group localisation | Transparent, data-driven thresholds; separates sensor fault (relation breaks) from degradation (siblings move together) | Yes |
| 2026-10-17 | Confidence = decision confidence (margin of P(fail) from θ, min trust of driving sensors, LightGBM-vs-CNN-GRU agreement on engines) | Relative interval width made every near-failure decision "low" | Yes (`config/intelligence.yaml`) |
| 2026-10-17 | Engine explanations: occlusion on serving LightGBM at each tail's D+0 window; only sensors that lower the estimate are drivers | Model-consistent; empty list = "no sensor pulling the estimate down" | Yes |
| 2026-10-17 | Mission fit adjusts RUL by the ratio of degradation-rate multipliers (mission vs home environment) from couplings.yaml; 3 ILLUSTRATIVE mission templates | Same physics as the generator | Yes |
| 2026-10-17 | Act-now resolution: local spare & fits before lower-bound RUL → service now; local but RUL lower bound too short → PULL + fit from store; remote & in time → EXPEDITE_SPARE; else PULL (+ cannibalisation offer) | Literal reading of the SPEC §1.1 rule with the §9.4 deadline | Yes |
| 2026-10-17 | Readiness floor allowance per base-type = max(floor(n·(1−0.5)), already-pulled count, 1) | Keeps the model feasible when more aircraft are already grounded than the floor allows | Yes |
| 2026-10-17 | CP-SAT single worker + deterministic time 2.0 + seed → reproducible; Stage 7 uses greedy inside the daily sim loop, CP-SAT gain reported at D+0 | 5.5 s per solve is fine for the demo, too slow for 90 days × policies × scenarios × seeds | Yes |
| 2026-10-17 | One fair setting per baseline: P1 = legacy 0.6 interval (orders a week ahead); P2 = 70 % of failure signature, condition-corrected, 7-day cooldown | SPEC: no straw men, no tuning loop | Yes (`config/scenarios.yaml`) |
| 2026-10-17 | In the sim an engine action = quick engine change (fresh REAL replay trajectory) | Keeps engine truth REAL after maintenance | Yes |
| 2026-10-17 | Sim parallelism ≤ 6 workers, single-threaded, below-normal priority, shared caches | 12 heavy workers crashed the user's laptop twice | Yes |
| 2026-10-17 | S8 (late detection) tells the failure/in-flight-abort story; availability goes *up* with delay over 90 days (horizon effect) and is shown with that caveat | Honest reading of the data | — |
| 2026-10-17 | **Scope (user instruction):** recording, voiceover and the video are done by the team. Stage 14 = motion + copy + empty/error states + README. Storyline mode (beats, captions, keys) is still built so the team can record; the Playwright `record` script and `docs/voiceover.md` are dropped; stage reviews keep one round of 1920×1080 screenshots only | User decision | Yes (user) |

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
| UCI hydraulic / NASA battery / actuator data availability & licence | — | UCI #447: available, **CC BY 4.0**, 73 MB zip (sha256 24128aad…79af1f2), 2,205 cycles, 17 sensors — matches docs. NASA battery/actuator: not pursued | UCI page + documentation.txt, 2026-10-17 |
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
| 4 | 2026-10-17 | Non-engine RUL RMSE (days, cap 150) | 15.6–19.5 (structure 11.0, caveated) | SIMULATED truth |
| 4 | 2026-10-17 | Non-engine 80 % PICP | 0.797–0.834 | SIMULATED truth |
| 4 | 2026-10-17 | UCI hydraulic real validation (acc) | pump 0.921 · accumulator 0.594 · cooler 0.991 · valve 0.907 | REAL, block split |
| 4 | 2026-10-17 | D+0 fleet | 53 READY · 12 WATCH · 7 PULL | after world fixes |
| 5 | 2026-10-17 | Trust harness, systems | detection 70.3 %, FA 0.20 %/sensor-day, delay 2 d | SIMULATED |
| 5 | 2026-10-17 | Trust harness, engines | detection 100 % (43 faults), FA 0.70 %/sensor-cycle, delay 22 cycles | REAL signals + injected faults |
| 5 | 2026-10-17 | Fleet sensors untrusted at D+0 | 35 / 3220 | |
| 6 | 2026-10-17 | D+0 aircraft actions | 40 serve · 16 schedule · 10 pull · 4 monitor · 1 verify · 1 expedite | θ by criticality |
| 6 | 2026-10-17 | CP-SAT vs greedy (D+0) | 3.4 % lower objective, 5.5 s wall, 0 violations | |
| 7 | 2026-10-17 | Base: ready % P0/P1/P2/P3 | 75.3 / 75.2 / 89.1 / 88.8 | 10 seeds |
| 7 | 2026-10-17 | Base: unplanned failures P0/P1/P2/P3 | 181 / 98 / 32 / 1 | |
| 7 | 2026-10-17 | Surge: P3 − P2 ready / sorties / failures | +3.3 / +6.3 pts / −110 | paired |
| 7 | 2026-10-17 | Weather: P3 − P2 ready | −1.7 pts (worse) | reported in §4 |
| 7 | 2026-10-17 | Demo seed | 5 | median rule |

## Open issues / known defects
- [ ] **FD003 interval under-covers** (80 % nominal → 64 % on test). Likely cause: only 16 val units / 160 calibration windows, and FD003's long lifetime tail (up to 525 cycles) makes val and test truncations less exchangeable. Not tuned (rule 15). Effect: Shikshak engine risk is somewhat over-confident. Options if time allows: calibrate on val ∪ part of replay, or widen with a per-subset factor, and say so. Shown on the Results screen as flagged.
- [ ] `mission_critical: role` for avionics: the role-dependent rule (type's `criticality_role` list) is defined in config but only applied from Stage 4/6.
- [ ] Elevation profiles along road routes (for S5) are not computed yet; planned for Stage 9/12 from the Terrarium DEM.
- [ ] npm 11 blocks dependency install scripts by default (`esbuild` postinstall skipped). Build works regardless (esbuild ships platform binaries as optional deps). If a later dependency needs its install script, approve it with `npm approve-scripts <pkg>`.
- [ ] In the Claude Code sandbox, `pip install -e .` failed writing to `%TEMP%`; worked with `TMP/TEMP` pointed at a writable folder. A normal terminal should not hit this.

## Next steps (ordered, concrete)
1. Stage 9: write plan here. Tokens already in `tokens.css`; add stage scaler (1920×1080 letterboxed), router (Zustand + simple path router), primitives (FlightStrip, HealthBar, StatusGlyph, Chip/ProvenanceChip, SheetHeader, RegistrationMarks, NumberTick), D3 chart kit (fan, timeline strip, dumbbell, slope, reliability, sparkline, small multiples), MapLibre custom paper-chart style + offline fallback (Natural Earth GeoJSON bundled; Terrarium hillshade online); `/dev/primitives` page. Checks: one screenshot of `/dev/primitives` reviewed; fallback map renders with the network blocked.

## How to run (keep current)
```
# setup     ./tasks.ps1 setup        | make setup
# data      ./tasks.ps1 fetch; ./tasks.ps1 data   → docs/DATA_NOTES.md, data/processed/splits.json
# world     ./tasks.ps1 world  → data/processed/world/, data/routes/  (network optional after first run)
# train     ./tasks.ps1 train [-Fast]  → models/engine/, reports/engine_*.md  (~34 min full, CPU; -Fast ≈ 1/4)
# synth     ./tasks.ps1 synth  → models/systems/, data/processed/state/ (~40 s; needs UCI data for a fresh anchor, else committed anchor)
# intel     ./tasks.ps1 intelligence  → trust, explanations, mission fit, graph (~2 min)
# plan      ./tasks.ps1 plan   → data/processed/plan/ (D+0 decisions, CP-SAT schedule, spares requests)
# sim       ./tasks.ps1 sim    → data/processed/results/, reports/results.md (~4 min, ≤ 6 workers; --report-only to rewrite report)
# export    ./tasks.ps1 export → frontend/public/data/ (4.1 MB snapshot; vendor.json separate)
# api       python -m uvicorn pratirakshak.api.app:app --port 8000   (optional; UI falls back to static)
# dev       ./tasks.ps1 dev   (UI only for now: cd frontend; npm run dev → http://localhost:5173)
# shots     ./tasks.ps1 shots  → docs/shots/
# test      ./tasks.ps1 test   | make test
```

## Things the user must do (only the human can)
- [x] Put C-MAPSS files in `data/raw/cmapss/` (present in `data/raw/cmapss/CMAPSSData/`).
- [ ] (Optional) Add `MAPTILER_KEY` to `.env`.
- [ ] (Optional) Confirm/rename bases and aircraft in `config/world.yaml`.
- [ ] Convert the recorded `.webm` to MP4 and upload to YouTube.
