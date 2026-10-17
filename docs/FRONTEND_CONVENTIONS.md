# Front-end conventions & parallel-work protocol

Two agents build the remaining sheets in parallel: **Claude Code** works in `D:\githubrepos\pratikrakshak` on branch `main`, and **Antigravity** works in `D:\githubrepos\pratikrakshak-ag` (a git worktree) on branch `antigravity`. Read `SPEC.md` (the contract: §0 rules, §11 front-end) and `HANDOFF.md` (state) first. These rules exist so the two never edit the same file.

## 1. Ownership: edit only your own files

| Sheet | Path | Folder / files | Owner |
|---|---|---|---|
| 04 Decision card | `/decision/:tail` | `src/screens/decision/` | Claude |
| 05 Spares & logistics | `/spares/:tail` | `src/screens/spares/` | Claude |
| 06 Planning timeline | `/plan` | `src/screens/plan/` | **Antigravity** |
| 07 Stress test | `/stress` | `src/screens/stress/` | Claude |
| 08 Late detection | `/late` | `src/screens/late/` | Claude |
| 09 Intelligence | `/intel` | `src/screens/intel/` | Claude (reassigned 2026-10-17) |
| 10 Results | `/results` | `src/screens/results/` | Claude |
| 11 Offline mode | `/offline` | `src/screens/offline/` | Claude (reassigned 2026-10-17) |
| 12 Spares vendor | `/vendor` | `src/screens/vendor/` | **Antigravity** |
| 13 Lifecycle | `/lifecycle` | `src/screens/lifecycle/` | **Antigravity** |
| 14 Method & provenance | `/method` | `src/screens/method/` | Claude |
| Stage 14 polish, README, merges into `main`, any backend / snapshot change | — | everything else | Claude |

The owner of a sheet also owns its story beats file `src/story/beats/NN-<name>.json` (e.g. `06-plan.json`), its Playwright spec `e2e/sheetNN-<name>.spec.ts` and its screenshots `docs/shots/sNN_*.png`.

**Frozen shared files: do not edit.** These are `src/app/App.tsx` (every route is already wired), `src/components/*`, `src/charts/*`, `src/map/*`, `src/three/*`, `src/styles/*`, `src/data/*`, `src/store/*`, `src/stage/*`, `src/story/story.ts`, `src/story/StoryController.tsx`, `src/story/beats.json`, `package.json`, `package-lock.json`, all configs, `backend/`, `data/`, `frontend/public/**`, `SPEC.md`, `HANDOFF.md`.

If you need a shared change (a new primitive, a new field in a snapshot, a dependency), do **not** make it. Build a local component inside your own screen folder, or write the request under "Requests for Claude" in your handoff file.

## 2. Look and feel (SPEC §11): reuse, don't reinvent

- **Stage:** every sheet renders inside the 1920×1080 stage. Root element: `position:absolute; inset:0; padding:40px 64px 48px`. It must look good as a still screenshot.
- **Header:** `SheetHeader` with `sheet="NN"`, a serif title, a one-line subtitle and `right={<SheetIndex />}`. Also include `RegistrationMarks` and `CornerTag`.
- **Primitives** (`src/components/primitives.tsx`): `StatusGlyph` (always shape + colour), `HealthBar`, `ProvenanceChip`, `FlightStrip`, `StatTile`, `NumberTick`, `Legend`.
- **Charts** (`src/charts/kit.tsx`): `ChartFrame` (title, subtitle, provenance chip, legend, table view), `LineChart`, `FanChart`, `TimelineStrips` (planned = solid, unplanned = hatched), `Dumbbell`, `SlopeChart`, `Reliability`, `BarCI`, `Sparkline`. Every chart sits in a `ChartFrame` with a `table` prop.
- **Maps:** `ChartMap` (`src/map/ChartMap.tsx`) only. Labels are HTML overlays; no MapLibre symbol layers.
- **Colours:** CSS variables in `src/styles/tokens.css` only, never raw hex.
  - Policies: `--series-p3` (Pratirakshak, the accent), `--series-p2`, `--series-p1`, `--series-p0` (recessive grey). These were validated for colour-blind safety; do not add hues.
  - Status: `--ready / --watch / --pull / --stale`. Use them only for status, and never for text; text uses `--watch-ink` and `--stale-ink`.
- **Type:** headings in `var(--font-serif)`; labels in `var(--font-sans)`; numbers and IDs in `var(--font-mono)` (tabular). Big hero numbers use sans, not serif.
- **Banned (SPEC §11.1):** dark or navy backgrounds, neon, glow, glassmorphism, gradients (except map hillshade), emoji, big rounded cards (radius ≤ 4 px), idle animations. Respect `prefers-reduced-motion`.
- **Data:** read the snapshot through `useSnapshots([...])` from `src/data/useSnapshots.ts`. Types are in `src/data/types.ts`; declare narrow local types for anything missing. **Never hard-code a number that is in the data.**
- **Honesty (SPEC §0.5):** every chart, table and figure carries a provenance chip (REAL / REAL-ANCHORED / SIMULATED / ILLUSTRATIVE). Never call synthetic data real. Costs are "₵ (ILLUSTRATIVE)".
- **Stills:** support a deterministic state for screenshots via URL params (e.g. `?tab=base`). Never use randomness at render time.

## 3. Working rhythm (both agents)

1. **Before a sheet:** append a 5–10-line plan for it to your handoff file.
2. **Build it** (one sheet at a time).
3. **Checks:**
   - `npm run typecheck` is clean.
   - Your own spec passes: `npx playwright test e2e/sheetNN-<name>.spec.ts`. It must save a 1920×1080 screenshot to `docs/shots/sNN_<name>.png`.
   - Open that screenshot and fix clearly visible defects once: overlap, clipping, overflow past the margins, unreadable text, empty panels. One review pass, not endless polishing.
4. **Commit** only your own paths, using `git add <paths>`, never `git add -A`. Message: `[AG] Sheet NN: <what>` (Antigravity) or `Sheet NN: <what>` (Claude).
5. **Sync and push.** Antigravity:
   ```
   git fetch origin
   git merge origin/main
   npm run typecheck
   git push origin antigravity
   ```
   No rebase, no force-push. Claude merges `antigravity` into `main`.
6. **Log it:** add the check output and what you did to your handoff file, then commit and push it.

## 4. Laptop safety (16 GB RAM)

- **Ports:** Antigravity always sets `PREVIEW_PORT=4273` and `DEV_PORT=5273` before running dev, preview or Playwright, because Claude uses 4173/5173.
  - PowerShell: `$env:PREVIEW_PORT=4273; $env:DEV_PORT=5273`
  - Bash: `export PREVIEW_PORT=4273 DEV_PORT=5273`
- **No Python:** do not run the Python pipeline (`train`, `synth`, `sim`, `export`). The data is frozen in `frontend/public/data/`.
- **One at a time:** run one Playwright spec at a time, never the whole suite in parallel with the other agent.
