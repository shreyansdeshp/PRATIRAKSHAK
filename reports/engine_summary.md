# Engine RUL — all subsets  `REAL`

_One training run, default settings (SPEC §0 rule 15). Generated; do not edit._

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
