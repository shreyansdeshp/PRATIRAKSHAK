# PRATIRAKSHAK — Fleet Readiness Command Console
**Predict. Prepare. Protect.**

Master build specification for Claude Code. Read this whole file before writing any code. Re-read the relevant section before each stage. `HANDOFF.md` is the running state; `SPEC.md` is the contract.

- Competition: Smart India Hackathon 2026, **SIH26249 — "Air Power – Predictive Maintenance & Fleet Availability"** (Ministry of Defence, Defence Services Staff College; Software; theme Transportation & Logistics).
- Idea submission deadline: **20 October 2026**. Prototype is shown to judges as a **YouTube demo link + screenshots in a PPT** (not live). Design for that.
- Builder: one student, working with you (Claude Code). Optimise for a result that is **correct, honest, and visually unforgettable**, in that order of non-negotiability.

---

## 0. Operating rules for Claude Code (non-negotiable)

1. **One stage at a time** (Section 14). Each stage has **one or two major checks** only. Run those, paste the real output into `HANDOFF.md`, and move on. **Verification budget: model accuracy is NOT what is being judged** — the idea, the decision logic and the visuals are. Do not spend tokens on repeated re-runs, extra diagnostics, sweeps, exhaustive tests or re-verifying things that already work. Never claim a check passed without running it, but never run more checks than the stage lists.
2. **Plan before you build.** At the start of each stage, write a 10–20 line plan into `HANDOFF.md`, then execute. Keep the diff of each stage reviewable.
3. **Commit after every stage** (and after any big sub-step) with a clear message. Never commit `.env`, raw data, model weights over 50 MB, or API keys.
4. **Determinism.** Global seed `26249`. Every generator, split, simulation and screenshot must be reproducible from a seed. Same command → same bytes (or same numbers to 6 decimals).
5. **Honesty labelling is a feature, not a footnote.** Everything is tagged as one of: `REAL` (NASA / public dataset), `REAL-ANCHORED` (synthetic, calibrated on a real dataset), `SIMULATED` (synthetic, our design), `ILLUSTRATIVE` (placeholder values e.g. costs). The UI shows this (Section 11.8). Never describe synthetic data as Indian Air Force data. Bases, aircraft types, tail numbers and costs are **fictional**.
6. **No leakage.** Split by *engine unit*, never by row. Fit scalers/clusterers on training units only. Test-set RUL files are used only for final evaluation.
7. **No hard-coded results.** Every number in the Results screen must be computed by code from artefacts on disk. If a number looks too good, investigate before showing it.
8. **Don't cherry-pick.** The demo scenario seed is chosen *objectively* (Section 9.6): the seed whose improvement is closest to the median across ≥10 seeds.
9. **When blocked on a user input, use the default in Section 3.4 and note it in `HANDOFF.md`.** Do not stop to ask unless a decision is irreversible or needs a secret.
10. **Licences.** Record every external asset (data, fonts, tiles, 3D models, icons) in `CREDITS.md` with source URL, licence, and attribution text. If a licence is unclear, do not ship the asset; use the procedural/fallback option.
11. **Verify external facts you depend on** (dataset counts, file layouts, tile URLs, API limits) from the actual files / live docs at build time. Where this spec says "verify", do so and record the result.
12. **UI stages:** take **one** round of Playwright screenshots at 1920×1080 for the stage's screens, look at them, and fix only clearly visible defects (overlap, clipping, unreadable contrast, empty states). One review pass per stage, not an iterate-until-perfect loop (the final polish stage gets one extra pass).
14. **Tests:** write only a handful of tests for things that could silently corrupt results (unit-disjoint splits, the risk formula `1 − Π(1−p)`, vendor-view data leak). No exhaustive suites, no coverage targets.
15. **Model effort:** model quality only needs to be *reasonable and honest*. Train once with sensible defaults, report the metrics you get, and move on. Do not tune hyperparameters, sweep `R_max`, or chase leaderboard numbers. If the main model is not clearly better than the tree baseline after one reasonable attempt, ship the baseline with conformal intervals and say so.
13. Prefer boring, well-known libraries. Pin versions. No exotic dependencies that may fail to install on a student's laptop (Windows or macOS). Provide `make` targets *and* equivalent `npm`/`python -m` commands (Windows-friendly: also provide a `tasks.ps1` or `justfile`; at minimum document the raw commands).

---

## 1. What we are building (one paragraph)

A command console that fuses **real turbofan degradation data (NASA C-MAPSS)** with a **simulated fleet of 72 aircraft across 4 bases and 4 aircraft types and 8 aircraft systems**, predicts **remaining useful life (RUL) with calibrated confidence** for every system, converts predictions into **one transparent decision rule** (service now / schedule / pull from the line / source a spare), plans maintenance into **hangar slots with bundling**, finds **nearest spares and route times**, and then **proves** its value by simulating **surge, attack, supply disruption and late detection** against three baselines. The front-end is the star: a distinctive **paper-chart / flight-strip** interface, a **map that comes alive** as the hero opening, a **Forza-style 3D aircraft showroom** with part-level health, and a **scripted storyline mode** designed to be recorded for YouTube and screenshotted for slides.

### 1.1 The single decision rule (judges must be able to repeat it)
> **For each system on each aircraft we estimate when it will fail (with a confidence range). If the chance it fails before the next maintenance opportunity exceeds the threshold θ for that mission, we act now: get the spare if it can arrive in time, otherwise pull the aircraft from the line. If not, we schedule the work into the cheapest slot that lands before the earliest plausible failure — bundled with other jobs on that aircraft.**

Everything in the product is an explanation, a stress test, or a visualisation of that rule.

### 1.2 What wins (priority order)
1. **Problem solving** (Tier 1, Section 4) — correct, complete, defensible.
2. **Unique solving** (Tier 2, Section 5) — what no other team will have.
3. **Visual storytelling** (Tier 3, Section 11) — integrated with 1 and 2, never decoration.
4. Backend sophistication is *only* as deep as needed to make 1–3 true.

---

## 2. Problem statement coverage map

Source problem (SIH26249): predictive maintenance and fleet availability for air power — unify heterogeneous data, predict component-level degradation / RUL, plan condition-based maintenance and reduce unplanned downtime, optimise spares across bases, schedule against hangar/resource limits, and present fleet readiness to commanders.

| Need | Where satisfied |
|---|---|
| Integrated data model (bases, types, tails, systems, parts, spares) | §3, §7 |
| Component RUL with calibrated confidence | §6, §8 |
| Condition-based plan; planned vs unplanned downtime | §9.3, §11 S6 |
| Spares: nearest sources, route time, source-or-pull | §9.4, §11 S5 |
| Scheduling with hangar-slot limits | §9.5 |
| Fleet overview: ready by type, average health | §11 S1 |
| Results & validation vs baselines | §9.6, §10, §11 S10 |

---

## 3. The world (data model & fictional setting)

### 3.1 Bases (fictional names, real regions)
Place each base in open terrain in the stated region, **not** on a real station. Coordinates are approximate placeholders — nudge to open land using the DEM/basemap.

| Base | Region | Approx. lat, lon | Elevation (m) | Character |
|---|---|---|---|---|
| **Sahyadri Air Base** | Maharashtra | 19.5, 74.0 | ~600 | Monsoon, humidity, central hub |
| **Aravalli Air Base** | Delhi / NCR | 28.3, 76.9 | ~220 | Heat, dust, high tempo, command seat |
| **Himshikhar Air Base** | Ladakh | 34.1, 77.5 | ~3300 | High altitude, cold, thin air, **supply routes seasonally cut** |
| **Kaveri Air Base** | Tamil Nadu | 10.9, 78.5 | ~100 | Humid, salty/coastal-corrosion tendency |

Each base has: hangar bays (slot capacity), technician-hours/day, a local spares store, an environmental stress profile (Section 7.3), and 14–22 aircraft (total **72**).

### 3.2 Aircraft types (fictional, deliberately different)
Each type is mapped to one C-MAPSS subset so the *real* engine data matches the *character* of the aircraft:

| Type | Role | Engines | Engine data subset | Why this pairing |
|---|---|---|---|---|
| **Garjan** | Multirole fighter | 1 | **FD004** (6 conditions, HPC + fan faults) | Hardest regime = most demanding aircraft |
| **Prahar** | Strike / ground attack | 1 | **FD002** (6 conditions, HPC fault) | Varied flight regimes |
| **Vahak** | Medium transport | 2 | **FD001** (1 condition, HPC fault) | Steady cruise, simple regime; used for airlift of spares |
| **Shikshak** | Advanced trainer / light utility | 1 | **FD003** (1 condition, HPC + fan faults) | Steady regime, two fault modes |

Fleet mix (default, 72 total): Garjan 20, Prahar 18, Vahak 14, Shikshak 20 — spread so every base hosts ≥3 types, Himshikhar leans Garjan/Vahak, Kaveri leans Shikshak/Prahar. Tail numbers: `PR-<type letter><3 digits>` e.g. `PR-G207`.

> Verify before relying on it: C-MAPSS has **26 columns** (unit, cycle, 3 operational settings, 21 sensors). Expected engine counts (train/test): FD001 100/100, FD002 260/259, FD003 100/100, FD004 249/248; rows (train): ≈20,631 / 53,759 / 24,720 / 61,249. **Count them from the actual files and read `readme.txt`; if they differ, trust the files and record it in `docs/DATA_NOTES.md`.**

### 3.3 Time and scale (be explicit — this is the honesty-critical bit)
- C-MAPSS engine "cycles" are complete flights. Real C-MAPSS lifetimes (≈130–360 cycles) are far shorter than real engine lives. We therefore treat one C-MAPSS cycle as **`k` sorties** (config `ENGINE_CYCLE_TO_SORTIES`, default per type) so that a 90-day simulation horizon contains a meaningful number of end-of-life events.
- State this on the Method page: *"Engine degradation shapes are real; time-scaling is a simulation parameter."*
- Simulation clock: day steps (D+0 … D+90) with within-day sortie counts; display as `D+34 06:00Z`.

### 3.4 Defaults when the user hasn't decided (use these; note in HANDOFF)
- Base names, aircraft names, fleet mix: as above (user may rename later via `config/world.yaml` — everything must be driven from this file).
- Map tiles: keyless sources first (Section 11.3). A `MAPTILER_KEY` in `.env` is optional.
- Currency: **"cost units" (₵)** — ILLUSTRATIVE, never rupees.

### 3.5 Key entities (relational model, `backend/pratirakshak/schema.py`)
`Base`, `AircraftType`, `Aircraft(tail, type, base, airframe_hours, airframe_life_hours, age_years, engine_unit_ids)`, `System(kind)`, `SystemState(aircraft, system, health 0–100, rul_p10/p50/p90, p_fail_window, drivers[])`, `Part(lru_id, system, cost, install_hours, lead_time, criticality)`, `StockLevel(node, part, qty)`, `Node(base|depot|vendor_hub)`, `Route(from, to, mode road|air, minutes, geometry, seasonal_closure)`, `Mission(day, base, sorties, duration_h, environment, criticality)`, `WorkOrder(aircraft, tasks[], slot, hours, planned|unplanned)`, `Decision(aircraft, action, reason, key_sensors[], confidence)`, `Scenario(name, events[])`, `PolicyRun(policy, scenario, seed, metrics)`.

---

## 4. TIER 1 — Core problem solving (build and polish first)

- **P1 Integrated data model.** Four bases, four types, 72 tails, 8 systems each, parts catalogue, stock, routes — one consistent store (SQLite/DuckDB + parquet) with a typed schema and exported JSON snapshot.
- **P2 Component RUL with calibrated confidence + body health.** RUL for engines (real-data model) and for the other systems (synthetic, §7); each with p10/p50/p90 and a coverage-checked interval. Airframe "body health" from the structure system + lifecycle (age/life).
- **P3 Condition-based planning; planned vs unplanned downtime.** Replace calendar servicing with condition-driven jobs; quantify and **visualise** planned downtime (cheap, scheduled, bundled) against unplanned downtime (expensive, disruptive).
- **P4 Spares logistics.** For any needed part: local stock → nearest 2–3 sources (other bases, depots, vendor hub) with route time (road and airlift); compute whether it arrives before the aircraft's risk deadline; decide **source** or **pull**.
- **P5 Scheduling under constraints.** Hangar-slot and technician-hour limits per base; bundle tasks per aircraft into one slot; avoid grounding too many of one type at once (readiness floor).
- **P6 Fleet overview.** Ready-to-deploy counts by type, with average health bars; per-base and fleet totals; limiting-system view.
- **P7 Results & validation.** Compare against baselines; validate RUL predictions on held-out engines; show calibration; show sensitivity.

---

## 5. TIER 2 — Unique differentiators

- **U1 Risk-threshold pull decisions** with a plain-language **reason card** (what, why, how sure, which sensors drove it).
- **U2 Mission-aware maintenance.** Given the next mission (length, environment, criticality), compute each aircraft's probability of completing it without a system failure; assign the best-fit aircraft; defer work that doesn't threaten the mission.
- **U3 Surge & disruption simulation.** Fleet usage ×2, base outage, strike on a base (hangar capacity & depot loss), supply-route closure (Ladakh), dust/weather. Show before/after with our methods.
- **U4 Counterfactuals.** (a) *Late detection*: "what if we'd noticed d days later?" for one aircraft, one base, the whole fleet. (b) *2× usage*: how health declines and how maintenance changes the prediction of faulty sensors.
- **U5 Offline / edge mode.** The decision layer runs from a cached snapshot with no network; a **data-age badge** shows staleness and the confidence widens with age.
- **U6 Sensor trust scoring.** Detect and flag untrustworthy sensors (stuck, drifting, dropped, physically inconsistent) so a bad sensor doesn't trigger a false pull or hide a real fault.
- **U7 Digital twin.** Per-aircraft twin with what-if controls (usage rate, defer maintenance n days, base environment) → projected health fan.
- **U8 Two roles.** *Commander* (full access) vs *Spares Vendor* (only what to deliver, where, by when, how many, priority — no tail-level health or readiness).
- **U9 Lifecycle view.** Airframe age vs design life, engine time since overhaul, fleet age pyramid; ties body health to long-horizon planning.

---

## 6. Engine health model (REAL data)

### 6.1 Data
- Source: NASA Prognostics Data Repository — "Turbofan Engine Degradation Simulation Data Set" (C-MAPSS). Mirror: `https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip`. The user already has it locally; expected location `data/raw/cmapss/` (files `train_FD00x.txt`, `test_FD00x.txt`, `RUL_FD00x.txt`, `readme.txt`, `Damage Propagation Modeling.pdf` → `docs/`). **Never commit raw data**; provide `scripts/fetch_cmapss.py` that downloads/verifies by checksum if absent. Licence is not stated on the NASA page — note this in `CREDITS.md`.
- Columns: `unit, cycle, op1, op2, op3, s1…s21`. Whitespace-separated, trailing spaces.
- Sensor dictionary (verify against readme): s1 T2 fan inlet temp · s2 **T24** LPC outlet temp · s3 **T30** HPC outlet temp · s4 **T50** LPT outlet temp · s5 P2 · s6 P15 · s7 **P30** HPC outlet pressure · s8 **Nf** fan speed · s9 **Nc** core speed · s10 EPR · s11 **Ps30** HPC static pressure · s12 **phi** fuel-flow/Ps30 · s13 NRf · s14 NRc · s15 **BPR** · s16 farB · s17 **htBleed** · s18 Nf_dmd · s19 PCNfR_dmd · s20 **W31** HPT coolant bleed · s21 **W32** LPT coolant bleed. Op settings: altitude, Mach, TRA.

### 6.2 The 12 headline sensors → 6 parts (what judges see)
| Part (illustrative grouping) | Headline sensors | Support level in data |
|---|---|---|
| **Fan** | Nf (s8), BPR (s15) | Direct (fan faults in FD003/FD004) |
| **Low-pressure compressor** | T24 (s2) | Indicative |
| **High-pressure compressor** | T30 (s3), P30 (s7), Ps30 (s11), Nc (s9) | **Direct** (HPC fault in all four) |
| **Combustor** | phi (s12) | Indicative |
| **High-pressure turbine** | W31 (s20), htBleed (s17) | Indicative |
| **Low-pressure turbine** | T50 (s4), W32 (s21) | Indicative |

- NRf (s13) and NRc (s14) are used in the background as **redundancy cross-checks** for sensor trust (§8.2).
- Plus the **3 operating settings** shown as a "flight conditions" strip (altitude, Mach, throttle).
- Engineered indicators (validate each, keep only if it helps): `T30−T24`, `Nc/Nf`, rolling slope of `phi`, drift and noise score per sensor.
- **Labelling rule:** the UI marks part-level health for HPC and Fan as *"model-supported"* and the other parts as *"indicative (sensor-group index)"*. Part health = a monotone, training-calibrated **sensor-group degradation index**, not ground-truth component state. Say so on the Method page.
- Constant/near-constant sensors differ by subset (commonly s1, s5, s6, s10, s16, s18, s19 in single-condition sets). Determine empirically per subset and document; do not hard-code from memory.

### 6.3 Pre-processing
- **Six-condition subsets (FD002/FD004):** cluster the 3 operating settings (KMeans, k=6, fit on train units only) and normalise each sensor **per condition cluster** (mean/std from train). Single-condition subsets: global standardisation (or min-max), fit on train.
- **RUL target:** piecewise-linear cap `RUL = min(RUL, R_max)`, default `R_max = 125` (tune on validation; report sensitivity 110–135). Train targets use the cap; evaluation reports both capped and uncapped where meaningful.
- **Windowing:** fixed windows (default 30 cycles; left-pad with first value for shorter sequences — some test engines are shorter than 30). Evaluate the **last window of each test engine** against `RUL_FD00x.txt`.
- **Splits:** train units → 80/20 train/validation **by unit** (stratify by lifetime). Official test set is untouched until final reporting. Also create a **fleet-replay holdout**: a set of full run-to-failure train-style units reserved for the simulation (so true failure time is known when we replay degradation in the fleet). These units are *never* used in fitting.

### 6.4 Models (build in this order; keep all for the Results screen)
1. **Baseline A — Ridge/linear** on summary features of the last window.
2. **Baseline B — Gradient boosting (LightGBM)** on rolling-window features (means, slopes, last-k deltas, per-sensor drift).
3. **Main — sequence model (PyTorch):** 1D-CNN + GRU (or small Transformer-encoder) with a **quantile or heteroscedastic head** (predict median and spread), trained with early stopping on validation units. Keep it small enough to train on a laptop CPU in minutes–tens of minutes; provide a `--fast` flag.
4. **Uncertainty:** primary = **split conformal prediction** on validation units (per subset) wrapped around the main model's median (and/or conformalised quantile regression), giving finite-sample coverage; secondary = deep ensemble (3–5 seeds) variance as an agreement signal. Output **p10/p50/p90** and a **coverage check** (nominal 80% interval should cover ≈80% on held-out units; flag if outside 75–85%).
5. **Failure-probability head:** from the RUL predictive distribution compute `P(RUL ≤ H)` for H = next maintenance window / mission length. This is the number the decision rule uses.
6. **Explainability:** for the tree model use SHAP (TreeExplainer); for the sequence model use integrated gradients or permutation-by-sensor-group on the last window. Map attributions to the 12 headline sensors and their plain-language names. Provide a **global importance ranking** and a **per-decision top-3 drivers**.

### 6.5 Metrics (report on official test for each subset)
- RMSE, MAE, and the **NASA asymmetric score** `s = Σ(e^{−d/13}−1) for d<0, Σ(e^{d/10}−1) for d≥0, d = RUL_pred − RUL_true` (late predictions penalised more).
- Interval metrics: PICP (coverage), MPIW (mean width), a **reliability diagram** (nominal vs empirical coverage at 50/60/70/80/90%).
- Earliness/lateness distribution of alarms: for a fixed alarm rule (`P(RUL≤H)≥θ`) report false-alarm rate, miss rate, and lead time distribution.
- Sanity ranges (approximate, from published work; **not** targets to hard-code): the main model should land roughly RMSE ≈ 12–16 on FD001/FD003 and ≈ 18–28 on FD002/FD004. Being materially worse than Baseline B means something is wrong; investigate leakage/scaling/windowing. Being implausibly better than the literature means investigate leakage.
- Report all four subsets; never drop an unflattering one.

### 6.6 Artefacts
`models/engine/<subset>/{model.pt|.onnx, scaler.json, conformal.json, metrics.json, feature_spec.json}`; `reports/engine_<subset>.md`; plots for the Results screen exported as data (JSON), not images.

---

## 7. The other seven systems (SIMULATED, REAL-ANCHORED where possible)

### 7.1 Why, and what we claim
C-MAPSS is engine-only. A fleet's readiness depends on the whole aircraft, so we add seven more systems **synthetically but physically plausibly**, **connected** to each other and to usage. We validate non-engine models **only against synthetic ground truth** and label them `SIMULATED`/`REAL-ANCHORED` everywhere. We never claim they are real fleet data.

### 7.2 Systems, sensors, and failure semantics
| System | Synthetic sensors (name, unit) | Failure semantics | Critical for mission? |
|---|---|---|---|
| **Engines (REAL)** | the 12 headline sensors (§6) | RUL → 0 | Yes (no-go) |
| **Hydraulics** | system pressure A/B (psi), fluid temp (°C), fluid level (%), pump case-drain flow (L/min) | pump wear / leak → low pressure | Yes |
| **Landing gear & brakes** | brake wear-pin length (mm), brake temp (°C), strut pressure (bar), tyre pressure (bar), hard-landing g count | wear limit / strut leak | Yes |
| **Flight controls** | actuator response lag (ms), backlash (mrad), position error (%), servo current (A) | lag/backlash beyond limit | Yes |
| **Electrical** | generator output (V), generator temp (°C), battery voltage (V), bus ripple (mV), load (%) | generator/battery degradation | Yes |
| **Avionics / radar** | transmitter power (dB rel.), BIT fault count, LRU temp (°C), cooling airflow (%) | power fade / thermal faults | Role-dependent (mission) |
| **Fuel** | pump pressure (kPa), flow imbalance (%), filter ΔP (kPa), tank temp (°C) | filter clog / pump wear | Yes |
| **Structure / airframe** | cumulative fatigue index, corrosion index, vibration level (g), crack-indicator flag | fatigue/corrosion limits; scheduled NDT | Yes (long horizon) |

Each system has 3–6 **line-replaceable units (LRUs)** in the parts catalogue (≈35 total) with illustrative cost, install hours, lead time, criticality and stock levels per node.

### 7.3 Generator design (`backend/pratirakshak/synth/`)
- **Shared drivers** per aircraft per day: flight hours, sorties, intensity (g-load / throttle profile), age, base environment (temperature, humidity, dust, salinity, altitude), maintenance history (last service day per system).
- **Latent health** `h_i(t) ∈ [0,1]` per system via a stochastic degradation process (gamma or Wiener with drift; piece-wise accelerating after an inception point), with drift scaled by the drivers.
- **Couplings** (matrix in `config/couplings.yaml`, documented): hydraulics → flight-control actuators; hard landings → gear/brakes/structure; electrical → avionics; hot/dusty bases → engines & avionics; high altitude/cold → hydraulics fluid & electrical battery; coastal humidity → corrosion index; repeated high-g → structure fatigue.
- **Engine tie-in (REAL):** each simulated engine is assigned a real C-MAPSS trajectory from the fleet-replay holdout of the matching subset, advanced at that aircraft's usage rate (cycle → sorties scale in §3.3). Real sensor readings drive the engine system's observed data.
- **Observed sensors** = true latent state → sensor model (nonlinear mapping + noise + occasional faults: stuck, drift, dropout, spike) so §8.2 trust scoring has something real to catch.
- **Ground truth** for every system: true failure day, true RUL path.
- **Maintenance effect:** a service resets/partially restores latent health (type-specific), with a probability of infant-failure after replacement (small).

### 7.4 REAL anchors (do these — the user wants "make the data real if possible")
Search for and, if available and licence-compatible, use these to calibrate degradation shapes, noise levels and ranges (verify availability, licence and size first; record in `CREDITS.md`; fall back to published parameter ranges if unavailable):
- **Hydraulics:** UCI "Condition monitoring of hydraulic systems" (Helwig et al.; ~2,205 cycles, 17 sensors, labelled cooler/valve/pump/accumulator conditions; CC BY 4.0). Use it to (a) calibrate pressure/temperature/flow relationships and noise, (b) train and **really validate** the hydraulics classifier/regressor, shown with the badge `REAL-ANCHORED`.
- **Electrical (battery):** NASA PCoE Li-ion battery ageing dataset (capacity fade vs cycles) → battery degradation curve shape.
- **Flight-control actuators:** NASA PCoE electromechanical actuator data (if present) → lag/backlash/current signatures.
- **Operating environment:** Open-Meteo historical archive API (free, keyless; verify terms) for base climatology (temperature, humidity, wind, precipitation) → environment stress indices. ERA5 via Copernicus CDS is an alternative if the user has an account.
- **Typical ranges:** hydraulic ≈ 3000 psi systems, 28 V DC aircraft bus, 115 V/400 Hz AC generation, tyre/strut pressures, brake wear limits — cite public sources in `docs/PARAMETER_SOURCES.md`. No claim of matching any specific airframe.

### 7.5 Models for non-engine systems
Gradient-boosted RUL (or survival model) per system on rolling features, conformal intervals like §6.4. Report accuracy against **synthetic truth** with a clear `SIMULATED` label; for hydraulics also report the real-anchor validation.

### 7.6 Combining systems into an aircraft
- Per-system **health score 0–100** (monotone map from latent/estimated state), own RUL p10/p50/p90 and `p_i = P(failure before window)`.
- **Aircraft failure risk** in a window `R = 1 − Π(1 − p_i)` (assumes conditional independence given the shared drivers — **state this assumption** on the Method page; note couplings are handled upstream in the generator and in features).
- **Readiness gating:** an aircraft is *Ready* only if no critical system exceeds its risk limit; the **limiting system** is shown (e.g., "Limited by: hydraulics pump").
- **Overall health bar** = weighted mean of system health with criticality weights (config), displayed alongside the limiting system so the average can't hide a single no-go.
- **Bundled maintenance:** group tasks that fall within a tolerance window into one hangar slot to minimise downtime events.

---

## 8. Intelligence layer

### 8.1 Explainability (U1)
Each decision stores `key_sensors` (top 3 with direction/magnitude in plain language, e.g., "HPC outlet temperature has drifted +18 °R above its healthy baseline over the last 40 cycles"), `confidence` (interval width + ensemble agreement + sensor trust), and the competing options considered.

### 8.2 Sensor trust scoring (U6)
- Learn expected relations on healthy segments: `Nf↔NRf`, `Nc↔NRc`, `phi ≈ f(fuel, Ps30)`, `P30↔Ps30`, and pairs in other systems (A/B hydraulic pressures, generator V vs bus V).
- Trust score 0–100 per sensor = f(stuck-at, flat-line variance collapse, dropout rate, out-of-range, residual vs expected relation). Distinguish **sensor fault** from **real degradation** (a fault shows inconsistency with redundant sensors; degradation shows consistent, monotone drift).
- Trust feeds `confidence`; a low-trust critical sensor yields "verify sensor" tasks instead of a pull.
- Fault-injection harness: inject stuck/drift/dropout at known times; report detection rate and false-alarm rate.

### 8.3 Mission fit (U2)
`P(complete mission m without failure) = Π_i (1 − P(fail_i within mission_length_m))` per aircraft; show the ranked shortlist for a mission, with reasons for exclusion.

### 8.4 Digital twin (U7)
Endpoint + client-side evaluator: given aircraft state, usage multiplier, deferral days, base environment → projected health fan (p10/p50/p90) for each system and the aircraft risk curve. Twin must reproduce the sim's own forward model so what-ifs are consistent.

---

## 9. Decision, planning and simulation engine

### 9.1 Policies compared (same seeds, same events — common random numbers)
- **P0 Run-to-failure** (fix on failure).
- **P1 Fixed-interval** (service every N flight hours/cycles per type; tuned fairly on a separate seed set).
- **P2 Reactive threshold alarm** (raw-sensor limit alarms, no RUL).
- **P3 Pratirakshak** (RUL + calibrated risk + decision rule + bundling + spares-aware).
Tune baselines honestly; a straw-man baseline invalidates the result.

### 9.2 Action set per aircraft per day
`SERVE_NORMALLY` · `MONITOR_CLOSELY` · `SCHEDULE_SERVICE(slot)` · `EXPEDITE_SPARE(source)` · `PULL_FROM_LINE` · `VERIFY_SENSOR` · `SWAP_TAIL_FOR_MISSION`.

### 9.3 Planned vs unplanned downtime
Planned job: shorter (parts on hand/ordered ahead, bundled), cheaper, no mission impact. Unplanned: failure in service → longer (parts hunting, AOG), mission abort/at-risk sortie, cascade damage probability. Parameters in `config/costs.yaml` (ILLUSTRATIVE, documented). Store per-aircraft timelines for the visual (§11 S6).

### 9.4 Spares & logistics
- Parts catalogue × nodes with stock. For a required LRU at base B: if stock at B ≥ 1 → install; else rank other nodes by **ETA** (road via cached OSRM routes, or **airlift** by an available Vahak with its own readiness); show the nearest 2–3.
- **Source vs pull:** if `ETA + install_time ≤ time_until_risk_threshold_crossed (lower-bound RUL)` → expedite spare; else → pull the aircraft (and, if possible, **cannibalise** from a grounded tail, flagged as such).
- Seasonal closure: Ladakh road routes close in winter months (ILLUSTRATIVE calendar in config); airlift remains.
- Routing: **precompute** routes between nodes once (OSRM public demo server is for light use — be polite, cache to `data/routes/*.geojson`, record in `CREDITS.md`), plus straight-line air routes with a speed assumption. No runtime dependency on a routing API.

### 9.5 Scheduling
Per base per day: hangar bays (slots), technician-hours. Formulate as a small CP-SAT/MIP (OR-Tools) over the planning horizon: minimise weighted (risk exposure + downtime + lateness) subject to slots/hours, readiness floors per type per base, and bundling. Provide a **greedy fallback** and report the optimality gap or the improvement of CP-SAT over greedy. Keep solve time < 5 s for the demo horizon.

### 9.6 Simulation & results
- Discrete daily simulation, 90-day horizon, sortie-level failure realisation from the ground-truth latent state.
- **Scenarios:** (S-base) normal ops; (S-surge) fleet usage ×2; (S-attack) strike on one base: −X% hangar capacity, depot stock loss, some aircraft damaged; (S-supply) Himshikhar road closure + vendor delay; (S-weather) dust/monsoon stress; (S-late) detection delayed by d days (d ∈ {1,3,7}).
- Run each policy × scenario × **≥10 seeds**; report mean, 95% CI, and distribution. Metrics: ready-aircraft % over time, unplanned failures, in-service failures/mission aborts, planned/unplanned downtime hours, wasted life %, stockouts, spares expedite success, ₵ cost proxy.
- **Demo-seed rule:** choose the seed whose P3-vs-best-baseline improvement is closest to the median across seeds; record the seed and the distribution on the Results screen ("this run is typical, not the best").
- Counterfactual **late-detection** views: for one aircraft (timeline: what happens if we had acted d days later), for one base (hangar queue, readiness dip), for the fleet (cumulative availability gap).
- **2× usage** counterfactual: health trajectory shifts, maintenance load, and the effect on *faulty-sensor prediction* (sensor-fault rate and detection under heavier usage).

---

## 10. Results & validation (what the Results screen must contain)
1. **RUL accuracy table** per subset: RMSE, MAE, NASA score for Baseline A, Baseline B, Main (official test).
2. **Calibration:** reliability diagram, PICP/MPIW per subset; statement of coverage vs nominal.
3. **Alarm quality:** false-alarm / miss / lead-time distributions at the chosen θ; ROC-like curve over θ.
4. **Fleet outcome bars:** P0/P1/P2/P3 on availability, unplanned failures, unplanned downtime, wasted life, ₵ — with 95% CIs across seeds.
5. **Scenario matrix:** each scenario × policy availability curve.
6. **Sensitivity:** to θ, `R_max`, usage multiplier, detection delay, spares stock levels.
7. **Ablation:** with/without sensor-trust, with/without spares-awareness, with/without bundling — shows which of our "unique" ideas pay off. Report honestly; drop or caveat features that don't.
8. **Validation of non-engine systems** against synthetic truth (labelled), and the real-anchor validation for hydraulics.
9. **Provenance table:** every figure tagged REAL / REAL-ANCHORED / SIMULATED / ILLUSTRATIVE.

---

## 11. FRONT-END (the winner) — art direction, screens, interaction

### 11.1 Direction: "aviation chart meets flight strip"
Explicitly **not** the generic AI look. **Banned:** black or navy backgrounds, blue/cyan/purple neon, glow/blur halos, glassmorphism, animated gradient washes, sparkle icons, emoji, "pulsing" decorative lights, floating cards with huge radii, Inter/Roboto/Arial defaults, shadcn/Material default skins.

**Feels like:** a printed aeronautical chart + an air-traffic flight-progress strip + an engineering manual. Calm, warm, precise, authoritative.

### 11.2 Tokens (`frontend/src/styles/tokens.css`)
- **Ground:** paper `#F4EFE3` · sand `#E7DFCB` · fold-line `#D6CCB1` · ink `#1E2224` · ink-soft `#4A4F52`
- **Structure:** olive `#4B5632` · khaki `#A89F7A` · charcoal `#2E3234`
- **Status (use sparingly, always with a glyph):** READY green `#2F6B3F` (●) · WATCH amber `#A66A00` (▲) · PULL vermilion `#B83A26` (■) · STALE/UNKNOWN hatched grey `#8C8C85` (◇). Verify text contrast ≥ 4.5:1 on paper; statuses differ by **lightness and shape**, not hue alone.
- **Type:** headings *Source Serif 4* (or *Newsreader*); labels *IBM Plex Sans*; numbers/IDs *IBM Plex Mono* with tabular figures. **Self-host fonts** (`@fontsource/*`) so offline works. Type scale: 12/14/16/20/28/44/72.
- **Shape/space:** radii 2–4 px (cards are sheets, not pills); 8 px grid; 1 px ink hairlines; double-rule section headers; corner registration marks on map sheets.
- **Texture:** a very subtle paper grain (CSS/SVG, ≤3% opacity, static). No gradients except hillshade on maps.

### 11.3 Maps (MapLibre GL JS)
- **Basemap style (custom):** terrain-first cartography — hillshade + contour feel, thin ink borders, quiet labels, desaturated olive/sand land, pale water. Build a MapLibre style JSON in code, not a stock theme.
- **Keyless sources to try first (verify live; record licences/attribution in `CREDITS.md`):** AWS Terrain Tiles *Terrarium* DEM (`elevation-tiles-prod`) as `raster-dem` for hillshade + 3D terrain; OpenFreeMap vector tiles for roads/labels; EOX Sentinel-2 cloudless for satellite (check non-commercial terms); OpenTopoMap raster as a last resort (mind usage policy). Optional `MAPTILER_KEY` upgrade.
- **Fallback (no network):** bundled Natural Earth state/country GeoJSON + pre-generated contour/hillshade raster for the four base regions + cached route GeoJSON. The app must still render a handsome map offline.
- **Chart furniture:** graticule, scale bar, north arrow, sheet number & edition line ("SHEET 02 · SAHYADRI · EDITION D+34"), legend with glyphs, marginalia notes.
- **Navigation line (spares screen):** animated dashed route along a cached polyline with a live-moving vehicle marker, ETA label like a navigation app, alternative route(s) in lighter ink, elevation profile strip below the map (from DEM) — especially striking for Ladakh.
- **3D terrain:** pitch/bearing camera move over Himshikhar with exaggeration ≈1.4 for the "terrain" shots.

### 11.4 3D aircraft showroom (React Three Fiber + drei)
- **Procedural-first.** Build four distinct airframes from code (lofted fuselage via extruded/lathe geometry, swept/delta/straight wings, intakes, tails, engine nacelles) so there are zero licence risks and each type reads differently at a glance. Optionally allow glTF replacement only if CC0/CC-BY with attribution recorded. Do not copy a real aircraft's exact design.
- **Showroom (Forza-garage feel):** warm studio-grey floor with soft contact shadow, slow turntable, eased camera presets (front-3/4, side, top, underside), a "garage carousel" of tail numbers as flight strips on the left; right side is a **spec sheet** with stat bars (Health, Readiness, Mission fit, Age/Life, Risk 7d).
- **Part health on the model:** hotspots with leader lines and tags (Engine, Hydraulics, Gear/Brakes, Flight controls, Electrical, Avionics, Fuel, Structure) coloured by status glyph; hover = part tooltip; click = part drawer (sensors with trust, RUL fan, linked LRUs, spares ETA). **Exploded-view** toggle separating engine/gear/avionics bay. **Body health** shown as a surface overlay on the airframe (structure/corrosion index) with a legend.
- Performance: ≥ 50 fps on a mid-range laptop at 1080p; instancing and low poly; no heavy post-processing.

### 11.5 Charts
Hand-built D3/SVG components (not default chart-library skins): direct labels, no heavy gridlines, hairline axes, small multiples, **RUL fan chart** (p10–p90 band + median + failure marker), **timeline strips** (planned = solid bars, unplanned = hatched), **dumbbell** and **slope** charts for before/after, reliability diagram. Colour only where meaning exists. Use the `dataviz` guidance for accessibility.

### 11.6 Motion
Purposeful and slow: map pan/zoom easing, number tick-ups when data loads, colour transitions (≈600 ms) when status changes, route-line drawing, a single soft ripple at a base on a state change. Respect `prefers-reduced-motion`. No idle animations. Use one motion library consistently.

### 11.7 Stage, scale, and recording mode
- Root "stage" is **1920×1080** design space scaled to fit the window (letterboxed paper background). Every screen is composed for 16:9 so any screenshot is slide-ready.
- **Storyline mode** (`?mode=story`): beat-driven timeline defined in `frontend/src/story/beats.json` (screen, camera/zoom, highlighted entity, caption, duration, state mutations). Keyboard: Space/→ next beat, ← previous, `R` restart, `H` hide cursor/UI chrome, `C` toggle captions. Lower-third captions (concise, readable when paused).
- **Deterministic:** story reads the demo seed's snapshot; no randomness at render time.
- `npm run shots` → Playwright captures every named screen/beat at 1920×1080 and 3840×2160 to `docs/shots/` with stable filenames.
- `npm run record` → Playwright `recordVideo` plays the storyline and saves a `.webm` (user converts to MP4 for YouTube). Optional: voiceover script generated from the captions to `docs/voiceover.md`.
- A persistent but tasteful corner tag: **"SIMULATED EXERCISE DATA"** (honesty + military-document vibe). No fake classification markings.

### 11.8 Provenance chips
A small chip system (`REAL`, `REAL-ANCHORED`, `SIMULATED`, `ILLUSTRATIVE`) appears on charts, tables and part tooltips; clicking opens the Method page anchor.

### 11.9 Screens (each must be screenshot-worthy as a still)
**S0 — Hero: the fleet map comes alive.** Opens on an empty paper chart of India. Beat sequence (≈25 s): graticule and relief fade in → four base symbols drop in with a soft ripple → aircraft counts tick up → faint logistics arcs trace between bases and depots → health colours settle (ready/watch/pull rings with glyphs) → a single status change propagates (one base ring shifts amber) → title lock-up "PRATIRAKSHAK · Predict. Prepare. Protect." Final frame is the cover still for slides. The map is *live data*, not a video.
**S1 — Fleet readiness board.** "Ready to deploy" by type × base with **average health bar** per type (flight-strip rows), totals, limiting-system summary, readiness floor markers.
**S2 — Base view.** Local chart of the base (airfield symbology), headline numbers (aircraft count, average health, ready/watch/pull), a **flight-strip list of every tail** with its own health bar, status glyph, limiting system, next action; hangar slot occupancy; spares-on-hand strip; environment profile.
**S3 — Aircraft showroom.** §11.4; includes aircraft body health and 8 system health tags; age/life; mission-fit; twin controls (S3b).
**S4 — Decision card ("Why this aircraft is being pulled").** The rule restated for this tail; reason in plain language; **key sensors** with sparkline vs healthy baseline; RUL fan + `P(fail in window)`; **confidence indicator** (shown prominently; high/medium/low with the reasons); sensor-trust badges; alternatives considered (service later / source spare / swap tail) with consequences; the spare's route summary.
**S5 — Spares & logistics.** Satellite/terrain map; base ↔ 2–3 nearest sources with ETA chips; animated navigation line; elevation profile; table of stock/ETA/mode; verdict banner: **SOURCE** (arrives in time) or **PULL** (cannot); cannibalisation option; vendor hub.
**S6 — Planning timeline.** Gantt across the horizon per base: hangar slots, bundled jobs, readiness floor; the **planned vs unplanned downtime** visual: two parallel timelines of the same aircraft (with Pratirakshak vs without) showing short solid planned blocks versus long hatched unplanned blocks and the mission-impact markers; a bar comparison of hours and ₵.
**S7 — Stress test.** Scenario picker (Surge ×2 · Strike · Supply cut · Weather). Split view *without* vs *with* Pratirakshak: fleet readiness curves, per-base heat strips, events on the timeline. Includes **2× usage counterfactual** (health trajectory shift, maintenance load, faulty-sensor prediction).
**S8 — Late-detection counterfactual.** Slider d = 0/1/3/7 days; three tabs: *Aircraft* (timeline of what would have happened), *Base* (hangar queue, readiness dip), *Fleet* (cumulative availability gap). Strong, simple, emotional.
**S9 — Intelligence.** "What the model watches": the 12 headline sensors ranked by importance and mapped to parts (connected diagram: sensor → part → spare → decision), sensor trust board, calibration glimpse.
**S10 — Results.** §10 in a clean, sheet-like layout; demo-seed disclosure; provenance chips.
**S11 — Offline mode.** Network toggle (real: service worker + cached snapshot). Show the data-age badge ("Snapshot D+34 06:00Z · age 07:42"), confidence widening with age, decision layer still working; "sync pending" marker.
**S12 — Spares Vendor mode.** Role switch changes the shell: only *deliveries* (what, where, by when, qty, priority) and map routes; no tail-level health or readiness. Enforced by a separate endpoint/snapshot subset (not just CSS hiding).
**S13 — Lifecycle.** Age vs design life by type and base, engine time since overhaul, fleet age pyramid; links to body health.
**S14 — Method & provenance.** One page that explains the rule, models, assumptions (independence, time-scaling, synthetic systems), what's real vs simulated, limitations, and credits.

### 11.10 Roles (U8)
`/commander` (full) and `/vendor` (restricted). Vendor sees: part demands with priority, destination base, deadline, quantity, route and ETA; no aircraft identity beyond a demand ID; no readiness counts. Implement filtered data on the server/snapshot builder.

### 11.11 Front-end stack
React 18 + Vite + TypeScript (strict), Zustand (state), MapLibre GL JS, React Three Fiber + drei, D3 (scales/shapes), Framer Motion **or** GSAP (pick one), CSS variables + CSS modules (or vanilla-extract). Vitest for units, Playwright for screenshots/E2E. Fonts via `@fontsource`. No UI kit skins.

---

## 12. Backend and pipeline

- **Python 3.11**, FastAPI, Pydantic v2, pandas/polars, scikit-learn, LightGBM, PyTorch (CPU OK), SHAP, MAPIE or custom conformal, OR-Tools, DuckDB/SQLite + parquet, pytest, ruff, mypy (lenient). Use `uv` or `pip-tools`; lock versions.
- **Pipeline commands** (all idempotent, seed-driven): `make fetch` · `make data` (ingest + EDA report) · `make world` (bases/types/fleet/parts/routes) · `make synth` (non-engine systems) · `make train` (engine + system models, `--fast` option) · `make intelligence` (explainability + trust) · `make sim` (policies × scenarios × seeds) · `make export` (snapshot bundle for the front-end) · `make dev` (API + front-end) · `make shots` · `make record` · `make test`.
- **Static-first delivery:** the front-end must run **entirely from exported snapshot files** (`frontend/public/data/*.json` + parquet-to-JSON). The live API (FastAPI) adds: twin what-if, quick re-simulation of a scenario, decision re-evaluation. If the API is down, the UI silently falls back to static data (this is also the Offline mode).
- **Snapshot contract** (`docs/SNAPSHOT_SCHEMA.md`, validated with JSON Schema): `meta` (seed, build time, versions, provenance), `world` (bases, types, aircraft, parts, nodes, routes), `state` (per-aircraft per-system health/RUL/risk/drivers/trust), `decisions`, `plans` (slots, work orders), `scenarios` (timelines per policy), `results` (all tables for §10), `story` (beats), `roles` (commander/vendor views).
- Keep snapshot size reasonable (< ~25 MB total); compress time series (downsample for display, keep full in parquet).

---

## 13. Repository layout
```
pratirakshak/
  SPEC.md  HANDOFF.md  README.md  CREDITS.md  .env.example  .gitignore  Makefile  tasks.ps1
  config/        world.yaml couplings.yaml costs.yaml policies.yaml story.yaml
  data/          raw/ (gitignored)  interim/  processed/  routes/
  docs/          DATA_NOTES.md PARAMETER_SOURCES.md SNAPSHOT_SCHEMA.md METHOD.md shots/ voiceover.md
  backend/       pratirakshak/{ingest,world,synth,models,intelligence,decide,plan,sim,export,api}/  tests/
  models/        (artefacts, gitignored if large)
  reports/       engine_*.md system_*.md results.md
  frontend/      src/{app,stage,screens,components,map,three,charts,story,styles,store,data}/  public/{data,fonts,fallback-map}/  tests/ e2e/
  scripts/       fetch_cmapss.py  precompute_routes.py  make_fallback_map.py  pick_demo_seed.py
```

---

## 14. Build stages (with acceptance checks)
Run the listed checks and paste real outputs in `HANDOFF.md`. Commit at the end of each stage.

**Stage 0 — Scaffold & environment.** Repo layout, tooling, pinned deps, `Makefile`/`tasks.ps1`, `.env.example`, `CREDITS.md` skeleton, CI-less `make test` runs. *Check (1):* clean install works (venv + `npm ci`) and the empty Vite page renders on the paper background.

**Stage 1 — Data ingest & verification.** Load all C-MAPSS files, verify against `readme.txt`, write `docs/DATA_NOTES.md` (counts, shapes, constant sensors per subset, lifetime distributions). Figures: sensor trajectories, lifetime histograms. *Check (1–2):* row/engine counts printed and compared with §3.2 (note any difference); an assertion that no engine unit appears in two splits.

**Stage 2 — World generator.** `config/world.yaml` drives bases, types, fleet (72), tails, usage profiles, environment stress (using Open-Meteo/DEM where available, with cached fallbacks), parts catalogue, stock, routes (precomputed + seasonal closures), missions. *Check (1–2):* fleet totals match (72 tails, every base hosts ≥3 types) and routes are cached on disk.

**Stage 3 — Engine RUL models.** Baselines A/B, main sequence model, conformal intervals, failure-probability head, explainability. Reports per subset. *Check (1–2):* one metrics table (RMSE/score/interval coverage) for all four subsets from a single training run; the unit-disjoint split test passes. Accuracy only has to be reasonable (see rule 15).

**Stage 4 — Other systems.** Synthetic generator with couplings and sensor faults, real-anchor calibration (hydraulics etc.), RUL models, aircraft-level combiner (risk, gating, limiting system, weighted health, bundling). *Check (1–2):* one summary of estimate-vs-synthetic-truth error per system (labelled SIMULATED); a unit test for `R = 1 − Π(1−p)` and readiness gating.

**Stage 5 — Intelligence.** Sensor trust scoring with fault-injection harness, per-decision explanations, global sensor-importance ranking, mission-fit. *Check (1):* the fault-injection harness reports a detection rate and a false-alarm rate once; explanations use only the 12 headline sensors with plain names.

**Stage 6 — Decision, spares, scheduling.** Decision rule, source-or-pull, nearest-sources with ETAs (road/air, seasonal closure), CP-SAT scheduler + greedy fallback, bundling. *Check (1–2):* one hand-checkable test (ETA 30 h vs risk deadline 20 h → PULL; ETA 10 h → SOURCE); the scheduler's output never exceeds slot/hour limits.

**Stage 7 — Simulation & results.** Four policies × scenarios × ≥10 seeds with common random numbers; counterfactuals (late detection, 2× usage); demo-seed selection by median rule; ablations; sensitivity. *Check (1–2):* the results table regenerates with one command and includes intervals across seeds; `reports/results.md` is written, recording the demo seed and stating where Pratirakshak does **not** help. Baselines get one reasonable fair setting, not a tuning loop.

**Stage 8 — Export & API.** Snapshot bundle (full, vendor-filtered), FastAPI endpoints (twin, resimulate, decision), service-worker offline caching. *Check (1–2):* the front-end data layer loads from static files with the API off; the vendor snapshot contains no tail-level health.

**Stage 9 — Front-end foundation.** Tokens, stage scaler (1920×1080), primitives (FlightStrip, HealthBar, StatusGlyph, Chip, SheetHeader, RegistrationMarks), D3 chart kit, MapLibre custom style + offline fallback, router/state, provenance chips. *Check (1–2):* one screenshot of a `/dev/primitives` page reviewed; the offline fallback map renders with the network blocked.

**Stage 10 — Hero & storyline engine.** S0 fleet map coming alive; beat engine; caption system; keyboard controls; screenshot + recording scripts. *Check (1–2):* `npm run shots` produces the S0 frames at 1920×1080; one visual review that it reads as distinctive and not "AI-generic" (one revision pass allowed).

**Stage 11 — Fleet, base, aircraft.** S1, S2, S3 (procedural aircraft ×4, hotspots, exploded view, body health, spec sheet). *Check (1–2):* the 3D scene runs smoothly (one quick fps reading); one screenshot review of S1–S3.

**Stage 12 — Decision, spares, planning.** S4, S5, S6. *Check (1–2):* the decision card shows the numbers from the snapshot, and the planned-vs-unplanned visual uses real timeline data; one screenshot review of S4–S6.

**Stage 13 — Stress, counterfactuals, intelligence, results, lifecycle, vendor, offline, method.** S7–S14. *Check (1–2):* vendor mode leaks no tail-level data (one test); offline mode works in a network-blocked Playwright context. The Method page lists the assumptions in §§3.3, 7.1, 7.6.

**Stage 14 — Polish & delivery.** Motion pass, copy pass, empty/error states, README with exact run steps (Windows and macOS), final `docs/shots/` set, final recording, voiceover script, `CREDITS.md` complete, `docs/METHOD.md`. *Check (1–2):* one fresh-clone install-and-run; one final full screenshot set reviewed. Tick the §16 checklist from what you already know instead of re-testing each item.

---

## 15. Demo storyline (3–4 minutes, 1080p)
1. **0:00** Fleet map comes alive (S0). VO: the problem — readiness depends on knowing what will fail, and when.
2. **0:25** Fleet readiness board (S1): ready by type, average health.
3. **0:45** Zoom to Himshikhar → base view (S2): one tail turning amber.
4. **1:05** Aircraft showroom (S3): orbit, part health, body health; click hydraulics.
5. **1:30** Decision card (S4): the rule, the reason, key sensors, **confidence high**.
6. **1:55** Spares map (S5): nearest sources, navigation line, elevation profile; **SOURCE vs PULL** verdict.
7. **2:15** Planning timeline (S6): planned vs unplanned downtime, bundling.
8. **2:35** Stress test (S7): strike on a base + 2× usage; with vs without.
9. **2:55** Late detection (S8): "three days later".
10. **3:10** Results (S10) and calibration; offline mode (S11) for 10 s; vendor mode (S12) for 10 s.
11. **3:35** Closing lock-up: Predict. Prepare. Protect.

---

## 16. Definition of done / world-class checklist
- [ ] Everything reproducible from seed 26249; one command rebuilds snapshot and shots.
- [ ] All Results numbers computed, CI-backed, demo seed disclosed as median-representative.
- [ ] Honest provenance chips everywhere; Method page lists assumptions and limitations.
- [ ] The look is unmistakably **paper-chart / flight-strip** — nothing resembles a black/blue glowing dashboard.
- [ ] Hero map opens strong; every screen is a good still at 1920×1080.
- [ ] 3D showroom smooth, part-level health legible, four aircraft distinguishable in silhouette.
- [ ] Spares screen reads like a great navigation app, on terrain/satellite, with ETA and verdict.
- [ ] Planned-vs-unplanned and late-detection visuals understandable without narration.
- [ ] Commander vs vendor roles truly differ in data, not just styling.
- [ ] Offline mode demonstrably works with network blocked.
- [ ] No licence risk: `CREDITS.md` complete.
- [ ] Fresh-clone run works on Windows and macOS.

---

## 17. Risks and fallbacks
- **Tiles blocked/slow at demo time** → recorded video + bundled fallback map; screenshots pre-captured.
- **Sequence model underperforms** → ship Baseline B as main with conformal intervals; report honestly.
- **3D performance** → reduce geometry, disable shadows, static camera presets.
- **Scheduler slow** → greedy fallback.
- **Time pressure** → stage priority: 1, 2, 3, 6, 7, 8, 10, 11, 12, then 4, 5, 9, 13 extras. Ship Tier 1 + S0/S1/S3/S4/S5/S6/S10 first; Tier 2 screens after.
- **Real-anchor datasets unavailable** → use published ranges, mark `SIMULATED`, no pretending.

---

## 18. Idea-submission support (due 20 Oct 2026)
When asked, also produce `docs/IDEA_SUBMISSION.md`: problem understanding, the one rule, architecture (data → models → decisions → plan → proof), the real-vs-simulated data strategy, differentiators (Tier 2), expected impact framed with *simulation-based* evidence only, feasibility/roadmap, and one hero mockup (S0 still). Keep claims modest and sourced.

---

## 19. Credits to seed in `CREDITS.md`
- A. Saxena, K. Goebel (2008). *Turbofan Engine Degradation Simulation Data Set.* NASA Prognostics Data Repository, NASA Ames. · A. Saxena, K. Goebel, D. Simon, N. Eklund (2008). *Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation.* PHM 2008.
- UCI Condition Monitoring of Hydraulic Systems (Helwig, Pignanelli, Schütze) — verify licence text on the source page.
- NASA PCoE Li-ion battery ageing dataset (Saha & Goebel) — verify.
- Map/terrain/satellite providers, Natural Earth, Open-Meteo, OSRM, fonts, icons — add as used.
