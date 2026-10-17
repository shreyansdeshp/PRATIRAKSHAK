# Parameter sources

Where each world/simulation parameter comes from. Provenance tags follow SPEC §0.5. Values live in `config/*.yaml`; this file explains them.

## Base environment (Stage 2) — `REAL-ANCHORED` + `ILLUSTRATIVE`

- **Climate normals:** Open-Meteo historical archive API (ERA5 / ERA5-Land / ECMWF IFS reanalysis), daily 2015–2024, one request per base. Day-of-year means smoothed over ±3 days. Variables: `temperature_2m_max`, `temperature_2m_min`, `relative_humidity_2m_mean`, `precipitation_sum`, `wind_speed_10m_max`.
- **Elevation:** the `elevation` field of the same response (Open-Meteo 90 m DEM). It replaces the SPEC §3.1 estimates: SAH 693 m (SPEC ~600), ARV 245 m (~220), HIM 3623 m (~3300, after the nudge), KAV 90 m (~100).
- **Stress indices (0–1),** computed in `backend/pratirakshak/world/climate.py`. These are design choices, not physical constants:

| Index | Formula | Drives (Stage 4 couplings) |
|---|---|---|
| heat | clip((Tmax − 30 °C) / 15) | engines, avionics |
| cold | clip((5 °C − Tmin) / 25) | hydraulic fluid, battery |
| humidity | clip((RH − 50 %) / 45) | corrosion, electrical |
| wet | clip(precip / 15 mm) | dust suppression, corrosion |
| dust | dust_index × (1 − 0.7·wet) × (0.7 + 0.3·clip(wind/30 km/h)) | engines (erosion), avionics cooling |
| salinity | salinity_index × (0.6 + 0.4·humidity) | structure corrosion |
| altitude | clip(elevation / 4000 m) | hydraulics, electrical, engine margins |

- `dust_index` and `salinity_index` per base are **ILLUSTRATIVE** config values. No keyless historical dust source was used.

## Logistics (Stage 2)

- **Road time** = OSRM car duration × 1.35 (truck factor, ILLUSTRATIVE) + 3 h handling (ILLUSTRATIVE). Distances and geometry are from OSRM over OpenStreetMap (`REAL-ANCHORED`).
- **Air time** = great-circle distance ÷ 450 km/h (Vahak cruise, ILLUSTRATIVE) + 4 h handling.
- **Seasonal closure:** Himshikhar road routes closed 15 Nov – 15 May (ILLUSTRATIVE calendar, modelled on the real winter closure of high Himalayan passes). The default horizon (1 Jun – 29 Aug 2026) is in the open season.

## Fleet (Stage 2) — `ILLUSTRATIVE` / `SIMULATED`

- Type life, annual hours, age ranges, sortie rates and durations are in `config/world.yaml` (`aircraft_types`). They are plausible round numbers for each role, not data on any real aircraft.
- **Engine phase:** each engine starts its REAL C-MAPSS replay trajectory at a seeded fraction of its life, drawn from U(0.05, 0.70) (`engine_phase_range`).
- **Parts:** costs in ₵ (cost units), install hours, lead times and mean stock per node kind are all ILLUSTRATIVE. Per-node stock is drawn as Poisson(mean) with a seed per (node, part).

## Typical system ranges (Stage 4)

`config/systems.yaml` holds every sensor's healthy value, effect at failure, nonlinearity and noise.

| Quantity | Value used | Basis |
|---|---|---|
| Hydraulic system pressure | 3000 psi healthy | Conventional military/transport aircraft hydraulic class. SAE AS5440 (formerly MIL-H-5440) covers 3000 psi systems. |
| Hydraulic pressure noise / leak effect, fluid-temperature effect | from the UCI rig (see below) | `REAL-ANCHORED` |
| DC bus / battery | 27.8 V healthy | 28 V DC aircraft power, MIL-STD-704 |
| AC generation | 115 V (400 Hz) | 115/200 V 400 Hz aircraft AC power, MIL-STD-704 |
| Tyre pressure, strut pressure, brake wear-pin length, actuator lag/backlash, fuel-pump pressure, radar power fade, structural indices | round illustrative numbers | `ILLUSTRATIVE`. No specific source; they only need to be plausible and consistent. |

**Hydraulics anchor (UCI #447, real test-rig data):**
- Pressure noise: relative cycle-to-cycle noise under identical conditions.
- Leak effect: mean pressure change from no leak to severe internal pump leakage.
- Temperature effect: rise in fluid temperature when the cooler is near failure.
- Mapping: the "severe" rig state counts as damage 0.8. The rig's laboratory noise is below in-flight levels, so the configured noise is kept as a floor.
- Values: `data/processed/anchors/hydraulics.json` and `reports/system_models.md`.

**Not used:** the NASA PCoE Li-ion battery and electromechanical-actuator datasets (multi-hundred-MB MATLAB archives; not worth the time for this build). Battery and actuator degradation shapes use the gamma-process defaults instead and are labelled `SIMULATED`.

## Fleet maintenance history (Stage 4)

- `legacy_service_fraction` = 0.6. The fleet's existing practice before Pratirakshak is fixed-interval servicing of each system every 0.6 × its life at that tail's usage. The 60-day history before D+0 is simulated with this practice, and each system starts at a random phase of its cycle.
- Result at D+0: 53 READY, 12 WATCH, 7 PULL out of 72.
- Earlier settings left the history unmaintained and gave a fleet with a third of aircraft pulled. That was not plausible, so they were replaced. The predictions were accurate both times; only the world setup changed.
- Usage is measured against a fleet reference of 1 sortie/day (`couplings.yaml`), so a trainer flying 1.6 sorties/day wears faster than a transport flying 0.8.
