import { useState } from "react";

import { LineChart } from "../../charts/kit";
import { SheetHeader } from "../../components/primitives";
import type { CI, PolicyId, Results as ResultsData } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useBeatParams } from "../../story/story";
import r from "./Results.module.css";

type Full = ResultsData & { ablation: Record<string, Record<string, CI>> };
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
  const fa = a.unplanned_failures!.mean, fb = b.unplanned_failures!.mean;
  const wa = a.wasted_life_pct!.mean, wb = b.wasted_life_pct!.mean;
  return (
    <div className={r.headline} data-testid="headline">
      <div className={r.bigRow}>
        <div className={r.big}>
          <span className={r.bigLabel}>Unplanned failures in 90 days</span>
          <span className={r.bigNum}>{fa.toFixed(0)} <i>→</i> <b>{fb.toFixed(0)}</b></span>
          <span className={r.bigNote}>without → with Pratirakshak</span>
        </div>
        <div className={r.big}>
          <span className={r.bigLabel}>Component life thrown away</span>
          <span className={r.bigNum}>{wa.toFixed(1)}% <i>→</i> <b>{wb.toFixed(1)}%</b></span>
          <span className={r.bigNote}>wasted before replacement</span>
        </div>
      </div>
      <p className={r.sentence}>Against the best alternative ({res.policies[bb]}), Pratirakshak avoids almost every unplanned failure and replaces parts closer to the end of their useful life.</p>
      <p className={r.line}>Ready aircraft and cost are about equal to the best baseline.</p>
      <p className={r.limit}>Limitation: the model and the simulated data share one generator, and fault-detection scores use injected faults.</p>
    </div>
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
