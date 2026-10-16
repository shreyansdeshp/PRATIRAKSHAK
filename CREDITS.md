# Credits & licences

Every external asset (data, fonts, tiles, 3D models, icons) is recorded here with source, licence and attribution. If a licence is unclear, the asset is not shipped and a procedural/fallback option is used instead.

## Data

| Asset | Source | Licence | Attribution | Used for | Status |
|---|---|---|---|---|---|
| NASA C-MAPSS Turbofan Engine Degradation Simulation Data Set | NASA Prognostics Data Repository, NASA Ames — mirror `https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip` | **Not stated on the NASA page** (US Government work; treated as public, never redistributed in this repo) | A. Saxena, K. Goebel (2008). *Turbofan Engine Degradation Simulation Data Set.* NASA Prognostics Data Repository, NASA Ames Research Center. · A. Saxena, K. Goebel, D. Simon, N. Eklund (2008). *Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation.* PHM 2008. | Engine RUL (REAL) | in use (local, gitignored) |
| UCI Condition Monitoring of Hydraulic Systems | Helwig, Pignanelli, Schütze — UCI ML Repository | _verify on source page_ | _to add_ | Hydraulics real anchor | to verify (Stage 4) |
| NASA PCoE Li-ion Battery Ageing | Saha & Goebel — NASA Prognostics Data Repository | _verify_ | _to add_ | Battery degradation shape | to verify (Stage 4) |
| NASA PCoE electromechanical actuator data | NASA Prognostics Data Repository | _verify_ | _to add_ | Actuator signatures | to verify (Stage 4) |
| Open-Meteo historical archive | open-meteo.com | _verify terms_ | _to add_ | Base climatology | to verify (Stage 2) |
| Natural Earth | naturalearthdata.com | Public domain | Made with Natural Earth. | Offline fallback map | to add (Stage 9) |

## Maps, terrain, routing

| Asset | Source | Licence | Attribution | Status |
|---|---|---|---|---|
| AWS Terrain Tiles (Terrarium) | `elevation-tiles-prod` | _verify_ | _to add_ | to verify (Stage 9) |
| OpenFreeMap vector tiles | openfreemap.org | _verify_ | _to add_ | to verify (Stage 9) |
| EOX Sentinel-2 cloudless | s2maps.eu | _verify (non-commercial terms)_ | _to add_ | to verify (Stage 9) |
| OSRM public demo server (precomputed, cached routes only) | project-osrm.org | _verify usage policy_ | © OpenStreetMap contributors | to verify (Stage 2) |

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
