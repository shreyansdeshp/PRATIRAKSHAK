import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useState } from "react";

import { LineChart } from "../../charts/kit";
import { ProvenanceChip, SheetHeader } from "../../components/primitives";
import type { CI, PolicyId, Results as ResultsData } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useBeatParams } from "../../story/story";
import r from "./Results.module.css";

interface HeadlinePol { mean: number[]; min: number[]; max: number[]; final: number; life_used: number[]; life_median: number | null }
type Full = ResultsData & { ablation: Record<string, Record<string, CI>>; headline: { policies: Record<PolicyId, HeadlinePol> } };
type View = "headline" | "scenarios" | "parts";
const VIEWS: [View, string][] = [["headline", "Headline"], ["scenarios", "Scenarios"], ["parts", "What each part adds"]];
const SCEN = ["base", "surge", "strike", "supply", "weather"];
const COLOR: Record<PolicyId, string> = { P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)" };

/** S10 — results, in three calm views: Headline · Scenarios · What each part adds. */
export function Results() {
  const { data } = useSnapshots<{ results: Full }>(["results"]);
  const beat = useBeatParams();
  const q = new URLSearchParams(window.location.search);
  const start = (beat.get("view") ?? q.get("view") ?? "headline") as View;
  const [view, setView] = useState<View>(VIEWS.some(([v]) => v === start) ? start : "headline");
  const [sc, setSc] = useState<string>(beat.get("sc") ?? q.get("sc") ?? "base");
  if (!data) return <div className={r.loading} />;
  const res = data.results;

  return (
    <div className={r.sheet} data-testid="results" data-view={view}>
      <SheetHeader sheet="10" title="Does it work?" subtitle={`${res.seeds} simulated 90-day runs per policy, same random events for every policy`} />
      <div className={r.seg} role="tablist">
        {VIEWS.map(([v, label]) => <button key={v} type="button" role="tab" aria-selected={v === view} className={v === view ? r.segOn : ""} onClick={() => setView(v)}>{label}</button>)}
      </div>
      {view === "headline" && <Headline res={res} />}
      {view === "scenarios" && <Scenarios res={res} sc={sc} setSc={setSc} />}
      {view === "parts" && <Parts res={res} />}
    </div>
  );
}

function Headline({ res }: { res: Full }) {
  const bb = res.best_baseline.base!;
  const a = res.summary.base![bb]!, b = res.summary.base!.P3!;
  const pb = res.paired.base!;
  const fa = a.unplanned_failures!.mean, fb = b.unplanned_failures!.mean;
  const wa = a.wasted_life_pct!.mean, wb = b.wasted_life_pct!.mean;
  const noDiff = (m: string) => { const d = pb[m] as CI | undefined; return !d || (d.lo <= 0 && d.hi >= 0); };
  const base = res.policies[bb];
  return (
    <div className={r.headline} data-testid="headline">
      <div className={r.bigRow}>
        <div className={r.big}>
          <span className={r.bigLabel}>Unplanned failures in 90 days</span>
          <span className={r.bigNum}><span className={r.without}>{fa.toFixed(0)}</span> <i>→</i> <b>{fb.toFixed(0)}</b></span>
          <span className={r.bigNote}>{base} {fa.toFixed(0)} → Pratirakshak {fb.toFixed(0)}</span>
        </div>
        <div className={r.big}>
          <span className={r.bigLabel}>Component life thrown away</span>
          <span className={r.bigNum}><span className={r.without}>{wa.toFixed(1)}%</span> <i>→</i> <b>{wb.toFixed(1)}%</b></span>
          <span className={r.bigNote}>{base} {wa.toFixed(1)}% → Pratirakshak {wb.toFixed(1)}%</span>
        </div>
      </div>
      <p className={r.sentence}>Against {base}, the best alternative, Pratirakshak avoids almost every unplanned failure and replaces parts closer to the end of their useful life.</p>
      <div className={r.statRow}>
        <div><span>Ready aircraft</span><b>{a.ready_pct!.mean.toFixed(1)}% → {b.ready_pct!.mean.toFixed(1)}%</b>{noDiff("ready_pct") && <em>no clear difference</em>}</div>
        <div><span>Cost (₵, illustrative)</span><b>{Math.round(a.cost!.mean / 1000)}k → {Math.round(b.cost!.mean / 1000)}k</b>{noDiff("cost") && <em>no clear difference</em>}</div>
      </div>
      <FailChart h={res.headline.policies} names={res.policies} />
      <LifeStrip h={res.headline.policies} bb={bb} names={res.policies} />
      <p className={r.limit}>Limitation: the model and the simulated data share one generator, and fault-detection scores use injected faults.</p>
    </div>
  );
}

const ORDER: PolicyId[] = ["P0", "P1", "P2", "P3"];

function FailChart({ h, names }: { h: Record<PolicyId, HeadlinePol>; names: Record<string, string> }) {
  const W = 1700, H = 250, m = { l: 56, r: 230, t: 8, b: 30 };
  const n = h.P3.mean.length;
  const xs = scaleLinear().domain([0, n]).range([m.l, W - m.r]);
  const top = Math.max(...ORDER.map((p) => Math.max(...h[p].max)));
  const ys = scaleLinear().domain([0, top]).nice().range([H - m.b, m.t]);
  const days = Array.from({ length: n }, (_, i) => i + 1);
  const ln = line<number>().x((_, i) => xs(days[i]!)).y((v) => ys(v));
  return (
    <section className={r.chart} data-testid="fail-chart">
      <div className={r.chartHead}><h2>Failures pile up without prediction; Pratirakshak stays near zero</h2><ProvenanceChip kind="SIMULATED" /></div>
      <svg width={W} height={H} role="img" aria-label="Cumulative unplanned failures over 90 days, one line per policy">
        {ys.ticks(4).map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={ys(t)} y2={ys(t)} stroke="var(--grid)" /><text x={m.l - 8} y={ys(t)} dy="0.32em" textAnchor="end" className={r.tick}>{t}</text></g>)}
        {[0, 30, 60, 90].map((d) => <text key={d} x={xs(d)} y={H - 8} textAnchor="middle" className={r.tick}>{d === 0 ? "day 0" : d}</text>)}
        {ORDER.map((p) => {
          const band = area<number>().x((_, i) => xs(days[i]!)).y0((_, i) => ys(h[p].min[i]!)).y1((_, i) => ys(h[p].max[i]!));
          return <path key={`b${p}`} d={band(h[p].mean) ?? ""} fill={`var(--series-${p.toLowerCase()})`} opacity={0.14} />;
        })}
        {ORDER.map((p) => <path key={p} d={ln(h[p].mean) ?? ""} fill="none" stroke={`var(--series-${p.toLowerCase()})`} strokeWidth={p === "P3" ? 4 : 2.5} />)}
        {ORDER.map((p) => (
          <text key={`l${p}`} x={W - m.r + 10} y={ys(h[p].mean[n - 1]!)} dy="0.32em" className={r.endLabel} fill={`var(--series-${p.toLowerCase()})`}>{names[p]} · {Math.round(h[p].final)}</text>
        ))}
      </svg>
    </section>
  );
}

function LifeStrip({ h, bb, names }: { h: Record<PolicyId, HeadlinePol>; bb: PolicyId; names: Record<string, string> }) {
  const W = 1700, H = 150, m = { l: 230, r: 40, t: 4, b: 34 };
  const xs = scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
  const rows: PolicyId[] = [bb, "P3"];
  return (
    <section className={r.chart} data-testid="life-strip">
      <div className={r.chartHead}><h2>Parts are replaced closer to end of life</h2><ProvenanceChip kind="SIMULATED" /></div>
      <svg width={W} height={H} role="img" aria-label="Share of part life used at replacement">
        {rows.map((p, ri) => {
          const cy = m.t + 28 + ri * 52;
          const pts = h[p].life_used;
          return (
            <g key={p}>
              <text x={m.l - 14} y={cy} dy="0.32em" textAnchor="end" className={r.rowLabel}>{names[p]}</text>
              <line x1={m.l} x2={W - m.r} y1={cy} y2={cy} stroke="var(--grid)" />
              {pts.map((v, i) => <circle key={i} cx={xs(v)} cy={cy + ((i * 7) % 15) - 7} r={3} fill={`var(--series-${p.toLowerCase()})`} opacity={0.45} />)}
              {h[p].life_median !== null && (
                <g>
                  <line x1={xs(h[p].life_median!)} x2={xs(h[p].life_median!)} y1={cy - 20} y2={cy + 20} stroke="var(--ink)" strokeWidth={3} />
                  <text x={xs(h[p].life_median!) + 8} y={cy - 16} className={r.tick}>median {Math.round(h[p].life_median! * 100)}%</text>
                </g>
              )}
            </g>
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <text key={v} x={xs(v)} y={H - 8} textAnchor="middle" className={r.tick}>{Math.round(v * 100)}%</text>)}
        <text x={m.l - 14} y={H - 8} textAnchor="end" className={r.tick}>life used at replacement</text>
      </svg>
    </section>
  );
}

function Scenarios({ res, sc, setSc }: { res: Full; sc: string; setSc: (s: string) => void }) {
  const bb = res.best_baseline[sc]!;
  const cur = res.curves[sc]!;
  const days = cur.P3.fleet.map((_, i) => i);
  const s3 = res.summary[sc]!.P3!, sb = res.summary[sc]![bb]!;
  const dF = sb.unplanned_failures!.mean - s3.unplanned_failures!.mean;
  const dR = s3.ready_pct!.mean - sb.ready_pct!.mean;
  const takeaway = Math.abs(dR) < 1.5
    ? `${res.scenarios[sc]}: about the same share of aircraft ready, with ${dF.toFixed(0)} fewer unplanned failures`
    : dR > 0 ? `${res.scenarios[sc]}: ${dR.toFixed(0)} points more aircraft ready, and ${dF.toFixed(0)} fewer failures`
      : `${res.scenarios[sc]}: ${Math.abs(dR).toFixed(0)} points fewer aircraft ready, but ${dF.toFixed(0)} fewer failures`;
  return (
    <div className={r.scen} data-testid="scenarios">
      <div className={r.tabs}>{SCEN.map((k) => <button key={k} type="button" className={k === sc ? r.tabOn : ""} onClick={() => setSc(k)}>{res.scenarios[k]}</button>)}</div>
      <h2 className={r.takeaway}>{takeaway}</h2>
      <LineChart x={days} width={1500} height={520} xLabel="day" yLabel="aircraft ready" yFormat={(v) => `${Math.round(v)}%`} yDomain={[0, 100]}
        series={[{ id: "P0", label: res.policies.P0 ?? "P0", color: COLOR.P0, values: cur.P0.fleet.map((v) => v * 100) },
                 { id: bb, label: `${res.policies[bb]} (best alternative)`, color: COLOR[bb], values: cur[bb].fleet.map((v) => v * 100) },
                 { id: "P3", label: "Pratirakshak", color: COLOR.P3, values: cur.P3.fleet.map((v) => v * 100), emphasis: true }]} />
    </div>
  );
}

function Parts({ res }: { res: Full }) {
  const abl = res.ablation;
  const rows: [string, string][] = [["no_trust", "Sensor trust"], ["no_bundling", "Bundling of jobs"], ["no_spares", "Spares awareness"]];
  const sep = (k: string, m: string) => abl.full![m]!.hi < abl[k]![m]!.lo || abl[k]![m]!.hi < abl.full![m]!.lo;
  return (
    <div className={r.parts} data-testid="parts">
      <h2 className={r.takeaway}>Taking one part out at a time</h2>
      <table className={r.table}>
        <thead><tr><th>Part removed</th><th>Unplanned failures</th><th>Ready aircraft</th><th>What it adds</th></tr></thead>
        <tbody>
          {rows.map(([k, label]) => {
            const matters = sep(k, "unplanned_failures") || sep(k, "ready_pct");
            return (
              <tr key={k}>
                <td>{label}</td>
                <td>{abl[k]!.unplanned_failures!.mean.toFixed(1)}</td>
                <td>{abl[k]!.ready_pct!.mean.toFixed(1)}%</td>
                <td className={matters ? r.matters : r.safe}>{matters ? "clear benefit" : "safeguard, no measurable effect"}</td>
              </tr>
            );
          })}
          <tr className={r.ref}><td>Everything on</td><td>{abl.full!.unplanned_failures!.mean.toFixed(1)}</td><td>{abl.full!.ready_pct!.mean.toFixed(1)}%</td><td>reference</td></tr>
        </tbody>
      </table>
    </div>
  );
}
