import { useEffect, useState } from "react";

import { BarCI, ChartFrame, Dumbbell, FanChart, LineChart, Reliability, Sparkline, TimelineStrips, type Block } from "../../charts/kit";
import { CornerTag, FlightStrip, HealthBar, NumberTick, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile, StatusGlyph } from "../../components/primitives";
import { loadSnapshot } from "../../data/client";
import type { FleetState, PolicyId, Results, World } from "../../data/types";
import { ChartMap } from "../../map/ChartMap";
import p from "./Primitives.module.css";

const POLICY_COLOR: Record<PolicyId, string> = { P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)" };

interface Bundle { world: World; state: FleetState; results: Results; history: any; twin: any; models: any; demo: any }

/** Stage 9 review sheet: every primitive and chart type, rendered on real snapshot data. */
export function Primitives() {
  const [b, setB] = useState<Bundle | null>(null);
  useEffect(() => {
    Promise.all(["world", "state", "results", "history", "twin", "models", "demo"].map((n) => loadSnapshot(n as never)))
      .then(([world, state, results, history, twin, models, demo]) => setB({ world, state, results, history, twin, models, demo } as Bundle));
  }, []);
  if (!b) return <div className={p.loading}>Loading snapshot…</div>;

  const { world, state, results, history, twin, models, demo } = b;
  const strips = ["PR-S149", "PR-G295", "PR-S350", "PR-G118"].map((t) => state.aircraft.find((a) => a.tail === t)!).filter(Boolean);
  const curves = results.curves.base!;
  const days = curves.P0.fleet.map((_, i) => i);
  const tw = twin.tails["PR-G118"];
  const eng = history.engines["PR-G340"]?.[0];
  const fd = models.engine.find((m: any) => m.subset === "FD001");
  const timeline = (pol: string, tail: string): Block[] =>
    demo.runs[pol].events.filter((e: any) => e.tail === tail && e.kind === "visit_start")
      .map((e: any) => ({ start: e.day, end: e.day + e.duration, kind: e.planned ? "planned" : "unplanned" }));
  const failTail = (() => {
    const f = demo.runs.P0.events.find((e: any) => e.kind === "failure" && demo.runs.P3.events.some((x: any) => x.tail === e.tail && x.kind === "visit_start"));
    return f?.tail ?? "PR-G118";
  })();

  return (
    <div className={p.sheet} data-testid="primitives">
      <RegistrationMarks />
      <CornerTag />
      <SheetHeader sheet="DEV" title="Primitives & chart kit" subtitle="Every building block, on the real snapshot (demo seed, D+0)" edition={`EDITION ${state.snapshot}`} />

      <div className={p.grid}>
        <section className={p.col}>
          <h2 className={p.h2}>Status, health, provenance</h2>
          <div className={p.row}>
            <StatusGlyph status="READY" label /> <StatusGlyph status="WATCH" label /> <StatusGlyph status="PULL" label /> <StatusGlyph status="STALE" label />
          </div>
          <div className={p.row}>
            <HealthBar value={92} /> <HealthBar value={58} tone="watch" /> <HealthBar value={23} tone="pull" />
          </div>
          <div className={p.row}>
            <ProvenanceChip kind="REAL" /> <ProvenanceChip kind="REAL-ANCHORED" /> <ProvenanceChip kind="SIMULATED" /> <ProvenanceChip kind="ILLUSTRATIVE" />
          </div>
          <div className={p.stats}>
            <StatTile label="Ready to deploy" value={<NumberTick value={state.summary.fleet.ready} />} unit={`/ ${state.summary.fleet.aircraft}`} accent />
            <StatTile label="Average health" value={<NumberTick value={state.summary.fleet.avg_health} />} />
            <StatTile label="Pulled from line" value={<NumberTick value={state.summary.fleet.pull} />} note="limiting system named" />
          </div>
          <h2 className={p.h2}>Flight strips</h2>
          <div className={p.strips}>
            {strips.map((a) => (
              <FlightStrip key={a.tail} status={a.status} callsign={a.tail} sub={a.base} fields={[
                { label: "Health", value: <HealthBar value={a.weighted_health} width={70} />, width: 130 },
                { label: "Limited by", value: a.limiting_system.replace("_", " "), width: 130 },
                { label: "Next action", value: a.action.replace(/_/g, " ").toLowerCase() },
              ]} />
            ))}
          </div>
          <h2 className={p.h2}>Sparklines vs healthy baseline</h2>
          <div className={p.sparks}>
            {eng && ["s11", "s3", "s4"].map((s) => (
              <div key={s} className={p.spark}>
                <span className={p.sparkLabel}>{eng.sensors[s].symbol} · {eng.sensors[s].unit}</span>
                <Sparkline values={eng.sensors[s].deviation} baseline={0} width={150} color="var(--ink)" />
              </div>
            ))}
            <div className={p.spark}>
              <span className={p.sparkLabel}>hyd A psi</span>
              <Sparkline values={history.systems["PR-S149"].hyd_press_a} width={150} color="var(--ink)" />
            </div>
          </div>
        </section>

        <section className={p.col}>
          <ChartFrame title="Fleet ready aircraft, 90 days" subtitle="Mean of 10 seeds · base scenario" provenance="SIMULATED"
            legend={(["P3", "P2", "P1", "P0"] as PolicyId[]).map((k) => ({ label: `${k} ${results.policies[k]}`, color: POLICY_COLOR[k] }))}
            table={{ columns: ["day", "P0", "P1", "P2", "P3"], rows: days.filter((d) => d % 10 === 0).map((d) => [d, ...(["P0", "P1", "P2", "P3"] as PolicyId[]).map((k) => +(curves[k].fleet[d]! * 100).toFixed(1))]) }}>
            <LineChart x={days} width={640} height={250} yFormat={(v) => `${Math.round(v)}%`} xLabel="day" yLabel="ready %"
              series={(["P0", "P1", "P2", "P3"] as PolicyId[]).map((k) => ({ id: k, label: k, color: POLICY_COLOR[k], values: curves[k].fleet.map((v) => v * 100), emphasis: k === "P3" }))} />
          </ChartFrame>
          <ChartFrame title="PR-G118 hydraulics — projected condition" subtitle="Twin: 200 runs of the simulator's forward model" provenance="SIMULATED">
            <FanChart x={twin.days} p10={tw.systems.hydraulics.p10} p50={tw.systems.hydraulics.p50} p90={tw.systems.hydraulics.p90}
              width={640} height={190} yLabel="condition (0–100)" threshold={{ value: 0, label: "failure" }} yDomain={[-5, 100]} />
          </ChartFrame>
          <ChartFrame title={`${failTail} · run-to-failure vs Pratirakshak`} subtitle="Demo seed: planned (solid) vs unplanned (hatched) hangar time" provenance="SIMULATED"
            legend={[{ label: "planned", color: "var(--ink-soft)", kind: "band" }, { label: "unplanned", color: "var(--pull)", kind: "hatch" }]}>
            <TimelineStrips days={90} width={640} rows={[
              { label: "P0", sub: "run-to-failure", blocks: timeline("P0", failTail),
                markers: demo.runs.P0.events.filter((e: any) => e.tail === failTail && e.kind === "failure" && e.in_flight).map((e: any) => ({ day: e.day, label: "in-flight failure" })) },
              { label: "P3", sub: "Pratirakshak", blocks: timeline("P3", failTail) },
            ]} />
          </ChartFrame>
        </section>

        <section className={p.col}>
          <ChartMap camera={{ center: [80.5, 22.4], zoom: 3.1 }} width={560} height={360} interactive={false}
            overlay={(project) => world.bases.map((base) => {
              const [x, y] = project([base.lon, base.lat]);
              const r = state.summary.by_base[base.id]!;
              return (
                <div key={base.id} className={p.baseMark} style={{ left: x, top: y }}>
                  <span className={p.baseDot} />
                  <span className={p.baseLabel}>{base.name.replace(" Air Base", "")}<em>{r.ready}/{r.aircraft} ready</em></span>
                </div>
              );
            })} />
          <div className={p.twoUp}>
            <ChartFrame title="Calibration · FD001" subtitle="nominal vs empirical coverage" provenance="REAL">
              <Reliability size={240} series={[{ label: "LightGBM + conformal", color: "var(--series-p3)", points: fd.intervals.lgbm }]} />
            </ChartFrame>
            <ChartFrame title="Ready %, P3 vs best baseline" subtitle="paired by seed" provenance="SIMULATED">
              <Dumbbell width={300} labelWidth={64} domain={[55, 95]} format={(v) => v.toFixed(0)} aLabel="best baseline" bLabel="Pratirakshak"
                rows={Object.keys(results.paired).map((sc) => ({ label: sc, a: results.summary[sc]![results.paired[sc]!.best_baseline]!.ready_pct!.mean, b: results.summary[sc]!.P3!.ready_pct!.mean }))} />
            </ChartFrame>
          </div>
          <ChartFrame title="Unplanned failures in 90 days" subtitle="base scenario · mean and 95 % CI" provenance="SIMULATED">
            <BarCI width={560} format={(v) => v.toFixed(0)} rows={(["P0", "P1", "P2", "P3"] as PolicyId[]).map((k) => ({
              label: `${k} ${results.policies[k]}`, color: POLICY_COLOR[k], ...results.summary.base![k]!.unplanned_failures! }))} />
          </ChartFrame>
        </section>
      </div>
    </div>
  );
}
