# Credits & licences

Every external asset (data, fonts, tiles, 3D models, icons) is recorded here with source, licence and attribution. If a licence is unclear, the asset is not shipped and a procedural/fallback option is used instead.

## Data

| Asset | Source | Licence | Attribution | Used for | Status |
|---|---|---|---|---|---|
| NASA C-MAPSS Turbofan Engine Degradation Simulation Data Set | NASA Prognostics Data Repository, NASA Ames — mirror `https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip` | **Not stated on the NASA page** (US Government work; treated as public, never redistributed in this repo) | A. Saxena, K. Goebel (2008). *Turbofan Engine Degradation Simulation Data Set.* NASA Prognostics Data Repository, NASA Ames Research Center. · A. Saxena, K. Goebel, D. Simon, N. Eklund (2008). *Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation.* PHM 2008. | Engine RUL (REAL) | in use (local, gitignored) |
| UCI Condition Monitoring of Hydraulic Systems (#447) | `https://archive.ics.uci.edu/dataset/447` (zip 73 MB, local, gitignored) | **CC BY 4.0** (checked on the source page 2026-10-17) | Helwig, N., Pignanelli, E., & Schütze, A. (2015). *Condition monitoring of hydraulic systems* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CW21 | Hydraulics real anchor: validation + sensor calibration | in use (Stage 4) |
| NASA PCoE Li-ion Battery Ageing | Saha & Goebel — NASA Prognostics Data Repository | — | — | Battery degradation shape | **not used** (size/format); SIMULATED defaults instead |
| NASA PCoE electromechanical actuator data | NASA Prognostics Data Repository | — | — | Actuator signatures | **not used**; SIMULATED defaults instead |
| Open-Meteo historical archive API (ERA5, ERA5-Land, ECMWF IFS) | `https://archive-api.open-meteo.com/v1/archive` — terms checked 2026-10-17: free for non-commercial use, no key, 600/min · 5,000/h · 10,000/day | Data: CC BY 4.0 | Weather data by Open-Meteo.com (Zippenfenig, P. 2023, Zenodo). Hersbach et al. (2023) ERA5; Muñoz Sabater (2019) ERA5-Land. Generated using Copernicus Climate Change Service information. | Base climatology + elevation (4 requests, cached) | in use (Stage 2) |
| Natural Earth | naturalearthdata.com | Public domain | Made with Natural Earth. | Offline fallback map | to add (Stage 9) |

## Maps, terrain, routing

| Asset | Source | Licence | Attribution | Status |
|---|---|---|---|---|
| AWS Terrain Tiles (Terrarium) | `elevation-tiles-prod` | _verify_ | _to add_ | to verify (Stage 9) |
| OpenFreeMap vector tiles | openfreemap.org | _verify_ | _to add_ | to verify (Stage 9) |
| EOX Sentinel-2 cloudless | s2maps.eu | _verify (non-commercial terms)_ | _to add_ | to verify (Stage 9) |
| OSRM public demo server (precomputed once, 28 routes cached in `data/routes/road/`) | `router.project-osrm.org`, sponsored by FOSSGIS — policy checked 2026-10-17: ≤ 1 request/s, reasonable non-commercial use, no uptime guarantee | Route geometry derived from OpenStreetMap: ODbL 1.0 | Routing: OSRM (FOSSGIS demo server). Map data © OpenStreetMap contributors, ODbL. | in use (Stage 2) |

## Fonts (self-hosted via @fontsource)

| Font | Package | Licence |
|---|---|---|
| Source Serif 4 | `@fontsource/source-serif-4@5.1.0` | SIL Open Font License 1.1 |
| IBM Plex Sans | `@fontsource/ibm-plex-sans@5.1.0` | SIL Open Font License 1.1 |
| IBM Plex Mono | `@fontsource/ibm-plex-mono@5.1.0` | SIL Open Font License 1.1 |

## 3D models & icons

Procedural only (built in code). Status glyphs are Unicode shapes. No third-party models or icon sets so far.

## Software

Open-source libraries listed in `requirements.txt` / `frontend/package.json` under their own licences.
