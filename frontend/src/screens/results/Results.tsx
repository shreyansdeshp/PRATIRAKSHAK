import { useState } from "react";

import { BarCI, ChartFrame, Reliability } from "../../charts/kit";
import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { CI, PolicyId, Results as ResultsData } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import r from "./Results.module.css";

const POLICIES: PolicyId[] = ["P0", "P1", "P2", "P3"];
const COLOR: Record<PolicyId, string> = { P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)" };
const LABEL: Record<string, string> = { ready_pct: "Ready aircraft (%)", sortie_fill_pct: "Sorties flown (%)", unplanned_failures: "Unplanned failures",
  inflight_failures: "In-flight failures", unplanned_hours: "Unplanned downtime (h)", wasted_life_pct: "Wasted life (%)", cost: "Cost (₵)" };
const HIGHER = new Set(["ready_pct", "sortie_fill_pct"]);
const SCEN_ORDER = ["base", "surge", "strike", "supply", "weather"];

type Full = ResultsData & {
  ablation: Record<string, Record<string, CI>>;
  sensitivity: { theta: Record<string, Record<string, CI>>; detection_delay: Record<string, Record<string, CI>> };
};
interface EngineModel { subset: string; serving_model: string; metrics: Record<string, { rmse: number; rmse_capped: number; mae: number; nasa_score: number }>;
  intervals: { lgbm: { nominal: number; empirical: number; mean_width: number }[] }; headline_interval: Record<string, { empirical: number; mean_width: number }>;
  alarm_test_roc: { theta: number; false_alarm_rate: number; miss_rate: number }[]; alarm_replay: { units: number; missed: number; premature_gt_3H: number; lead_median: number } }
interface Models { engine: EngineModel[]; systems: { system: string; rmse_days: number; mae_days: number; mae_days_when_rul_le_30: number | null; picp80: number; failures_observed: number }[];
  hydraulics_anchor: { cycles: number; validation: { targets: Record<string, { accuracy: number; macro_f1: number }> } } }

const ci = (c: CI, d = 1) => `${c.mean.toFixed(d)} [${c.lo.toFixed(d)}, ${c.hi.toFixed(d)}]`;
const signed = (c: CI, d = 1) => `${c.mean >= 0 ? "+" : ""}${c.mean.toFixed(d)}`;

/** S10 — results & validation (SPEC §10). Two sheet tabs; every number computed from the snapshot. */
export function Results() {
  const { data } = useSnapshots<{ results: Full; models: Models }>(["results", "models"]);
  const initial = new URLSearchParams(window.location.search).get("tab") === "models" ? "models" : "fleet";
  const [tab, setTab] = useState<"fleet" | "models">(initial);
  if (!data) return <div className={r.loading} />;
  const { results, models } = data;

  return (
    <div className={r.sheet} data-testid="results" data-tab={tab}>
      <RegistrationMarks />
      <SheetHeader sheet="10" title="Results & validation"
        subtitle={`${results.seeds} seeds per policy × scenario · 90 days · common random numbers · mean [95 % CI] · demo run = seed ${results.demo_seed}`}
        right={<SheetIndex />} />
      <div className={r.tabs}>
        <button type="button" className={tab === "fleet" ? r.on : ""} onClick={() => setTab("fleet")}>Fleet outcomes</button>
        <button type="button" className={tab === "models" ? r.on : ""} onClick={() => setTab("models")}>Models &amp; validation</button>
      </div>
      {tab === "fleet" ? <FleetTab res={results} /> : <ModelsTab m={models} />}
      <CornerTag />
    </div>
  );
}

/* ============================================================================================ fleet outcomes */
function FleetTab({ res }: { res: Full }) {
  const base = res.summary.base!;
  const pb = res.paired.base!;
  const bb = pb.best_baseline;
  const notHelp: string[] = [];
  for (const sc of SCEN_ORDER) {
    const p = res.paired[sc]!;
    for (const m of ["ready_pct", "cost", "wasted_life_pct", "unplanned_failures"]) {
      const c = p[m] as CI;
      const worse = HIGHER.has(m) ? c.hi < 0 : c.lo > 0;
      const tie = c.lo <= 0 && c.hi >= 0;
      if (worse) notHelp.push(`${sc}: ${LABEL[m]} worse than ${res.policies[p.best_baseline]} (${signed(c)})`);
      else if (tie && m !== "unplanned_failures") notHelp.push(`${sc}: ${LABEL[m]} — no clear difference (${signed(c)})`);
    }
  }
  const gains = (pb.ready_pct as CI & { per_seed: number[] }).per_seed;
  const abl = res.ablation;
  const names: Record<string, string> = { no_trust: "Sensor trust", no_spares: "Spares-awareness", no_bundling: "Bundling" };

  return (
    <div className={r.fleetGrid}>
      <section className={r.headline}>
        <span className={r.kicker}>PRATIRAKSHAK vs THE BEST BASELINE ({res.policies[bb].toUpperCase()}) · BASE SCENARIO · PAIRED BY SEED</span>
        <div className={r.tiles}>
          <Tile label="Unplanned failures in 90 days" from={base[bb]!.unplanned_failures!.mean} to={base.P3!.unplanned_failures!.mean} d={pb.unplanned_failures as CI} digits={0} />
          <Tile label="In-flight failures (mission aborts)" from={base[bb]!.inflight_failures!.mean} to={base.P3!.inflight_failures!.mean} d={pb.inflight_failures as CI} digits={0} />
          <Tile label="Wasted component life" from={base[bb]!.wasted_life_pct!.mean} to={base.P3!.wasted_life_pct!.mean} d={pb.wasted_life_pct as CI} unit="%" />
          <Tile label="Ready aircraft" from={base[bb]!.ready_pct!.mean} to={base.P3!.ready_pct!.mean} d={pb.ready_pct as CI} unit="%" higher />
        </div>
        <p className={r.under}>Under surge (sorties ×2) the availability gap opens: {signed(res.paired.surge!.ready_pct as CI)} pts ready,
          {" "}{signed(res.paired.surge!.sortie_fill_pct as CI)} pts sorties flown, {signed(res.paired.surge!.unplanned_failures as CI, 0)} failures.</p>
      </section>

      <section className={r.bars}>
        {(["ready_pct", "unplanned_failures", "wasted_life_pct", "cost"] as const).map((m) => (
          <ChartFrame key={m} title={LABEL[m]!} subtitle="base scenario · 10 seeds" provenance={m === "cost" ? "ILLUSTRATIVE" : "SIMULATED"}
            table={{ columns: ["policy", "mean", "95 % CI low", "95 % CI high"], rows: POLICIES.map((p) => [res.policies[p], base[p]![m]!.mean, base[p]![m]!.lo, base[p]![m]!.hi]) }}>
            <BarCI width={430} format={(v) => (m === "cost" ? `${Math.round(v / 1000)}k` : v.toFixed(m === "unplanned_failures" ? 0 : 1))}
              domain={m === "ready_pct" ? [0, 100] : undefined}
              rows={POLICIES.map((p) => ({ label: `${p} ${res.policies[p]}`, color: COLOR[p], ...base[p]![m]! }))} />
          </ChartFrame>
        ))}
      </section>

      <section className={r.scen}>
        <div className={r.secHead}><span>Ready aircraft over 90 days, by scenario</span><ProvenanceChip kind="SIMULATED" /></div>
        <div className={r.legendRow}>{(["P3", "P2", "P1", "P0"] as PolicyId[]).map((p) => <span key={p}><i style={{ background: COLOR[p] }} />{p} {res.policies[p]}</span>)}</div>
        <div className={r.multiples}>
          {SCEN_ORDER.map((sc) => <Mini key={sc} title={res.scenarios[sc] ?? sc} curves={res.curves[sc]!} p3={res.summary[sc]!.P3!.ready_pct!.mean} />)}
        </div>
      </section>

      <section className={r.bottom}>
        <div className={r.block}>
          <div className={r.secHead}><span>What each idea buys (ablation)</span><ProvenanceChip kind="SIMULATED" /></div>
          <table className={r.table}>
            <thead><tr><th>Without…</th><th>Ready %</th><th>Unplanned failures</th><th>Verdict</th></tr></thead>
            <tbody>
              {Object.keys(names).map((k) => {
                const a = abl[k]!; const f = abl.full!;
                const sep = (m: string) => f[m]!.hi < a[m]!.lo || a[m]!.hi < f[m]!.lo;
                const verdict = sep("unplanned_failures") || sep("ready_pct")
                  ? `with it: ${signed({ ...f.unplanned_failures!, mean: f.unplanned_failures!.mean - a.unplanned_failures!.mean }, 1)} failures, ${signed({ ...f.ready_pct!, mean: f.ready_pct!.mean - a.ready_pct!.mean })} pts ready`
                  : "no measurable effect — kept as a safeguard";
                return <tr key={k}><td>{names[k]}</td><td>{ci(a.ready_pct!)}</td><td>{ci(a.unplanned_failures!)}</td><td>{verdict}</td></tr>;
              })}
              <tr className={r.ref}><td>Full Pratirakshak</td><td>{ci(abl.full!.ready_pct!)}</td><td>{ci(abl.full!.unplanned_failures!)}</td><td>reference</td></tr>
            </tbody>
          </table>
        </div>
        <div className={r.block}>
          <div className={r.secHead}><span>Sensitivity (Pratirakshak)</span><ProvenanceChip kind="SIMULATED" /></div>
          <table className={r.table}>
            <thead><tr><th>Setting</th><th>Ready %</th><th>Failures</th><th>Wasted life %</th></tr></thead>
            <tbody>
              {Object.entries(res.sensitivity.theta).map(([k, v]) => <tr key={`t${k}`}><td>risk limit θ × {k}</td><td>{v.ready_pct!.mean.toFixed(1)}</td><td>{v.unplanned_failures!.mean.toFixed(1)}</td><td>{v.wasted_life_pct!.mean.toFixed(1)}</td></tr>)}
              {Object.entries(res.sensitivity.detection_delay).map(([k, v]) => <tr key={`d${k}`}><td>data {k} day{k === "1" ? "" : "s"} late</td><td>{v.ready_pct!.mean.toFixed(1)}</td><td>{v.unplanned_failures!.mean.toFixed(1)}</td><td>{v.wasted_life_pct!.mean.toFixed(1)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className={r.block}>
          <div className={r.secHead}><span>Where it does not help</span></div>
          <ul className={r.noHelp}>{notHelp.map((t) => <li key={t}>{t}</li>)}</ul>
          <div className={r.secHead}><span>Demo run disclosure</span></div>
          <p className={r.small}>Ready-% gain vs the best baseline for each seed. The demo run (seed {res.demo_seed}) is the seed closest to the median — typical, not the best.</p>
          <SeedStrip gains={gains} demo={res.demo_seed} />
        </div>
      </section>
    </div>
  );
}

function Tile({ label, from, to, d, unit = "", digits = 1, higher }: { label: string; from: number; to: number; d: CI; unit?: string; digits?: number; higher?: boolean }) {
  const clear = d.lo > 0 || d.hi < 0;
  const good = higher ? d.mean > 0 : d.mean < 0;
  return (
    <div className={r.tile}>
      <span className={r.tileLabel}>{label}</span>
      <span className={r.tileVal}>{from.toFixed(digits)}{unit} <em>→</em> <b>{to.toFixed(digits)}{unit}</b></span>
      <span className={`${r.tileDelta} ${clear ? (good ? r.good : r.bad) : r.tie}`}>
        {clear ? `${d.mean >= 0 ? "+" : ""}${d.mean.toFixed(digits)}${unit} · 95 % CI [${d.lo.toFixed(digits)}, ${d.hi.toFixed(digits)}]` : `no clear difference · CI [${d.lo.toFixed(digits)}, ${d.hi.toFixed(digits)}]`}
      </span>
    </div>
  );
}

function Mini({ title, curves, p3 }: { title: string; curves: Record<PolicyId, { fleet: number[] }>; p3: number }) {
  const W = 300, H = 128, m = { l: 30, r: 8, t: 8, b: 18 };
  const n = curves.P0.fleet.length;
  const x = (i: number) => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - 0.3) / 0.7) * (H - m.t - m.b);
  return (
    <figure className={r.mini}>
      <figcaption>{title}<b>{p3.toFixed(1)} %</b></figcaption>
      <svg width={W} height={H} role="img" aria-label={`${title}: ready share over 90 days by policy`}>
        {[0.4, 0.6, 0.8, 1].map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" /><text x={m.l - 4} y={y(t)} dy="0.32em" textAnchor="end" className={r.tick}>{Math.round(t * 100)}</text></g>)}
        {[0, 30, 60, 89].map((d) => <text key={d} x={x(d)} y={H - 4} textAnchor="middle" className={r.tick}>{d}</text>)}
        {(["P0", "P1", "P2", "P3"] as PolicyId[]).map((p) => (
          <path key={p} d={curves[p].fleet.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")} fill="none" stroke={COLOR[p]} strokeWidth={p === "P3" ? 2.4 : 1.5} />
        ))}
      </svg>
    </figure>
  );
}

function SeedStrip({ gains, demo }: { gains: number[]; demo: number }) {
  const W = 340, lo = Math.min(-2, ...gains), hi = Math.max(2, ...gains);
  const x = (v: number) => 20 + ((v - lo) / (hi - lo)) * (W - 40);
  const med = [...gains].sort((a, b) => a - b)[Math.floor(gains.length / 2)]!;
  return (
    <svg width={W} height={54} aria-label="ready-% gain per seed">
      <line x1={x(0)} x2={x(0)} y1={6} y2={34} stroke="var(--ink-soft)" />
      <text x={x(0)} y={48} textAnchor="middle" className={r.tick}>0</text>
      <text x={20} y={48} className={r.tick}>{lo.toFixed(1)} pts</text>
      <text x={W - 20} y={48} textAnchor="end" className={r.tick}>+{hi.toFixed(1)} pts</text>
      <line x1={x(med)} x2={x(med)} y1={10} y2={30} stroke="var(--ink)" strokeDasharray="2 2" />
      {gains.map((g, i) => <circle key={i} cx={x(g)} cy={20} r={i === demo ? 7 : 5} fill={i === demo ? "var(--series-p3)" : "var(--paper-hi)"} stroke="var(--ink)" strokeWidth={1.5}><title>seed {i}: {g.toFixed(2)} pts</title></circle>)}
    </svg>
  );
}

/* ============================================================================================ models & validation */
function ModelsTab({ m }: { m: Models }) {
  const MODEL: Record<string, string> = { ridge: "Ridge (A)", lgbm: "LightGBM (B)", main: "CNN-GRU (main)" };
  return (
    <div className={r.modelGrid}>
      <section className={r.block}>
        <div className={r.secHead}><span>Engine RUL accuracy · official NASA test set</span><ProvenanceChip kind="REAL" /></div>
        <table className={r.table}>
          <thead><tr><th>Subset</th><th>Model</th><th>RMSE</th><th>RMSE (capped)</th><th>MAE</th><th>NASA score</th><th>80 % coverage</th></tr></thead>
          <tbody>
            {m.engine.flatMap((e) => (["ridge", "lgbm", "main"] as const).map((k) => {
              const mt = e.metrics[k]!; const iv = e.headline_interval[k];
              const serving = e.serving_model === k;
              return (
                <tr key={`${e.subset}-${k}`} className={serving ? r.ref : ""}>
                  <td>{k === "ridge" ? e.subset : ""}</td><td>{MODEL[k]}{serving ? " · serving" : ""}</td>
                  <td>{mt.rmse.toFixed(2)}</td><td>{mt.rmse_capped.toFixed(2)}</td><td>{mt.mae.toFixed(2)}</td><td>{Math.round(mt.nasa_score).toLocaleString("en-IN")}</td>
                  <td className={iv && (iv.empirical < 0.75 || iv.empirical > 0.85) ? r.flag : ""}>{iv ? `${(iv.empirical * 100).toFixed(1)} %${iv.empirical < 0.75 ? " · flagged" : ""}` : ""}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
        <p className={r.small}>The sequence model was not ≥ 3 % better than LightGBM on any subset, so LightGBM + split-conformal intervals serves (SPEC rule 15). FD003 under-covers (64 % for a nominal 80 %): flagged, not hidden.</p>
      </section>

      <section className={r.block}>
        <div className={r.secHead}><span>Calibration · nominal vs empirical coverage (serving model)</span><ProvenanceChip kind="REAL" /></div>
        <div className={r.relRow}>
          {m.engine.map((e) => (
            <figure key={e.subset} className={r.relFig}>
              <figcaption>{e.subset}</figcaption>
              <Reliability size={200} series={[{ label: e.subset, color: "var(--series-p3)", points: e.intervals.lgbm }]} />
            </figure>
          ))}
        </div>
        <div className={r.secHead}><span>Alarm quality · alarm when P(RUL ≤ 20 cycles) ≥ θ</span><ProvenanceChip kind="REAL" /></div>
        <div className={r.alarmRow}>
          <RocCurve engine={m.engine} />
          <table className={r.table}>
            <thead><tr><th>Subset</th><th>Held-out engines</th><th>Missed</th><th>Too early</th><th>Median warning</th></tr></thead>
            <tbody>{m.engine.map((e) => <tr key={e.subset}><td>{e.subset}</td><td>{e.alarm_replay.units}</td><td>{e.alarm_replay.missed}</td><td>{e.alarm_replay.premature_gt_3H}</td><td>{e.alarm_replay.lead_median} cycles</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className={r.block}>
        <div className={r.secHead}><span>Other seven systems · vs synthetic ground truth</span><ProvenanceChip kind="SIMULATED" /></div>
        <table className={r.table}>
          <thead><tr><th>System</th><th>RMSE (days)</th><th>MAE (days)</th><th>MAE when RUL ≤ 30 d</th><th>80 % coverage</th></tr></thead>
          <tbody>{m.systems.map((s) => <tr key={s.system}><td>{s.system.replace("_", " ")}</td><td>{s.rmse_days.toFixed(1)}</td><td>{s.mae_days.toFixed(1)}</td><td>{s.mae_days_when_rul_le_30?.toFixed(1) ?? "—"}</td><td>{(s.picp80 * 100).toFixed(1)} %</td></tr>)}</tbody>
        </table>
        <p className={r.small}>Structure rarely fails within the simulated span; its low MAE mostly reflects capped targets, not skill.</p>
      </section>

      <section className={r.block}>
        <div className={r.secHead}><span>Hydraulics real anchor · UCI test rig ({m.hydraulics_anchor.cycles.toLocaleString("en-IN")} cycles)</span><ProvenanceChip kind="REAL" /></div>
        <table className={r.table}>
          <thead><tr><th>Real target</th><th>Accuracy</th><th>Macro-F1</th></tr></thead>
          <tbody>{Object.entries(m.hydraulics_anchor.validation.targets).map(([k, v]) => <tr key={k}><td>{k.replace("_", " ")}</td><td>{(v.accuracy * 100).toFixed(1)} %</td><td>{v.macro_f1.toFixed(3)}</td></tr>)}</tbody>
        </table>
        <div className={r.secHead}><span>Provenance of every figure</span></div>
        <table className={r.table}>
          <tbody>
            <tr><td><ProvenanceChip kind="REAL" /></td><td>Engine degradation (NASA C-MAPSS), engine model accuracy and calibration, hydraulic rig validation</td></tr>
            <tr><td><ProvenanceChip kind="REAL-ANCHORED" /></td><td>Base climate (Open-Meteo / ERA5), elevations and terrain (DEM), road routes (OSRM / OpenStreetMap), hydraulics sensor effect sizes</td></tr>
            <tr><td><ProvenanceChip kind="SIMULATED" /></td><td>Seven non-engine systems, fleet outcomes, scenarios, policies, counterfactuals</td></tr>
            <tr><td><ProvenanceChip kind="ILLUSTRATIVE" /></td><td>Base and aircraft names, tail numbers, costs (₵), stock levels, dust and salt indices</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RocCurve({ engine }: { engine: EngineModel[] }) {
  const W = 300, H = 210, m = { l: 40, r: 10, t: 10, b: 30 };
  // false-alarm rates are small: zoom the x-axis to the data (one shared scale for all subsets)
  const xMax = Math.max(0.05, Math.ceil(Math.max(...engine.flatMap((e) => e.alarm_test_roc.map((p) => p.false_alarm_rate))) * 20) / 20);
  const x = (v: number) => m.l + (v / xMax) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - v * (H - m.t - m.b);
  const colors = ["var(--series-p3)", "var(--series-p2)", "var(--series-p1)", "var(--series-p0)"];
  return (
    <figure className={r.roc}>
      <svg width={W} height={H} role="img" aria-label="detection rate against false-alarm rate as θ varies">
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={x(0)} x2={x(xMax)} y1={y(t)} y2={y(t)} stroke="var(--grid)" /><text x={m.l - 5} y={y(t)} dy="0.32em" textAnchor="end" className={r.tick}>{t * 100}</text>
          <text x={x(t * xMax)} y={H - m.b + 14} textAnchor="middle" className={r.tick}>{Math.round(t * xMax * 100)}</text></g>)}
        <text x={x(xMax)} y={H - 2} textAnchor="end" className={r.axis}>false alarms %</text>
        <text x={m.l} y={m.t - 2} className={r.axis} dy="0.8em">caught %</text>
        {engine.map((e, i) => (
          <path key={e.subset} d={[...e.alarm_test_roc].sort((a, b) => a.false_alarm_rate - b.false_alarm_rate).map((p, j) => `${j ? "L" : "M"}${x(p.false_alarm_rate)},${y(1 - p.miss_rate)}`).join("")}
                fill="none" stroke={colors[i]} strokeWidth={2} />
        ))}
      </svg>
      <figcaption className={r.legendRow}>{engine.map((e, i) => <span key={e.subset}><i style={{ background: colors[i] }} />{e.subset}</span>)}</figcaption>
    </figure>
  );
}
