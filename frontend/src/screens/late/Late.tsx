import { useState } from "react";

import { BarCI, ChartFrame, LineChart, TimelineStrips, type Block } from "../../charts/kit";
import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { CI } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useBeatParams } from "../../story/story";
import l from "./Late.module.css";

interface Ev { day: number; tail: string; base: string; kind: string; system?: string; in_flight?: boolean; duration?: number; planned?: boolean }
interface Run { events: Ev[]; ready_curve: number[]; ready_by_base: Record<string, number[]>; hangar_by_base: Record<string, number[]>; unplanned_failures: number }
interface Demo { seed: number; runs: Record<string, Run> }
interface LateCF { fleet: Record<string, { ready_curve: number[]; cumulative_gap_aircraft_days: number[]; unplanned_failures: CI; inflight_failures: CI }> }
const DELAYS = [1, 3, 7] as const;
const BASES: Record<string, string> = { SAH: "Sahyadri", ARV: "Aravalli", HIM: "Himshikhar", KAV: "Kaveri" };

/** S8 — late-detection counterfactual: what if the same data reached us d days later? (SPEC U4a) */
export function Late() {
  const { data } = useSnapshots<{ results: { counterfactuals: { late_detection: LateCF } }; demo: Demo }>(["results", "demo"]);
  const url = new URLSearchParams(window.location.search);
  const beat = useBeatParams();
  const [d, setD] = useState<number>(Number(beat.get("d") ?? url.get("d") ?? 7));
  const [tab, setTab] = useState<string>(beat.get("tab") ?? url.get("tab") ?? "aircraft");
  if (!data) return <div className={l.loading} />;
  const cf = data.results.counterfactuals.late_detection.fleet;
  const onTime = data.demo.runs.P3!;
  const late = data.demo.runs[`P3_late${d}`]!;
  const f0 = cf["0"]!, fd = cf[String(d)]!;
  const gap = fd.cumulative_gap_aircraft_days[fd.cumulative_gap_aircraft_days.length - 1]!;

  return (
    <div className={l.sheet} data-testid="late" data-d={d} data-tab={tab}>
      <RegistrationMarks />
      <SheetHeader sheet="08" title={`What if we noticed ${d} day${d > 1 ? "s" : ""} later?`}
        subtitle="Same fleet, same seeds — only the sensor data arrives late and is treated as current · Pratirakshak (P3)" right={<SheetIndex />} />

      <div className={l.controls}>
        <span className={l.kicker}>DELAY</span>
        {DELAYS.map((x) => <button key={x} type="button" className={x === d ? l.on : ""} onClick={() => setD(x)}>{x} day{x > 1 ? "s" : ""}</button>)}
        <span className={l.sep} />
        {(["aircraft", "base", "fleet"] as const).map((t) => <button key={t} type="button" className={t === tab ? l.on : ""} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
        <span className={l.chip}><ProvenanceChip kind="SIMULATED" /></span>
      </div>

      <div className={l.tiles}>
        <StatTile accent label={`Unplanned failures in 90 days · ${d} d late`} value={<>{f0.unplanned_failures.mean.toFixed(1)} → <b className={l.bad}>{fd.unplanned_failures.mean.toFixed(1)}</b></>}
          note={`95 % CI [${fd.unplanned_failures.lo.toFixed(1)}, ${fd.unplanned_failures.hi.toFixed(1)}] · 10 seeds`} />
        <StatTile label="In-flight failures (mission aborts)" value={<>{f0.inflight_failures.mean.toFixed(1)} → <b className={l.bad}>{fd.inflight_failures.mean.toFixed(1)}</b></>}
          note={`95 % CI [${fd.inflight_failures.lo.toFixed(1)}, ${fd.inflight_failures.hi.toFixed(1)}]`} />
        <div className={l.caveat}>
          <b>Waiting looks cheaper but causes about {(fd.unplanned_failures.mean / Math.max(0.1, f0.unplanned_failures.mean)).toFixed(0)}x more failures.</b>{" "}
          The fleet is ready {gap < 0 ? `${Math.abs(gap).toFixed(0)} aircraft-days more` : `${gap.toFixed(0)} aircraft-days less`} over 90 days, because later action means fewer garage visits, but the extra failures include aircraft that fail in the air.
        </div>
      </div>

      {tab === "aircraft" && <AircraftTab onTime={onTime} late={late} d={d} seed={data.demo.seed} cf={cf} />}
      {tab === "base" && <BaseTab onTime={onTime} late={late} d={d} />}
      {tab === "fleet" && <FleetTab cf={cf} />}
      <CornerTag />
    </div>
  );
}

const blocks = (run: Run, tail: string): Block[] => run.events.filter((e) => e.tail === tail && e.kind === "visit_start")
  .map((e) => ({ start: e.day, end: e.day + (e.duration ?? 1), kind: e.planned ? "planned" as const : "unplanned" as const, label: e.planned ? "planned work" : "repair after failure" }));
const fails = (run: Run, tail: string) => run.events.filter((e) => e.tail === tail && e.kind === "failure")
  .map((e) => ({ day: e.day, label: `${e.system?.replace("_", " ")} failed${e.in_flight ? " in flight" : ""}` }));

function AircraftTab({ onTime, late, d, seed, cf }: { onTime: Run; late: Run; d: number; seed: number; cf: LateCF["fleet"] }) {
  const failedOnTime = new Set(onTime.events.filter((e) => e.kind === "failure").map((e) => e.tail));
  const newly = late.events.filter((e) => e.kind === "failure" && !failedOnTime.has(e.tail));
  const tails = [...new Set(newly.map((e) => e.tail))].slice(0, 5);
  return (
    <div className={l.panel}>
      <ChartFrame title={`Aircraft that only fail when the data is ${d} day${d > 1 ? "s" : ""} late`} subtitle={`Demo run (seed ${seed}, the median-representative run) · each pair: on time (top) vs late (bottom) · solid = planned work, hatched = repair after failure, ■ = failure`}
        provenance="SIMULATED" legend={[{ label: "planned work", color: "var(--ink-soft)", kind: "band" }, { label: "repair after failure", color: "var(--pull)", kind: "hatch" }, { label: "failure", color: "var(--pull)", kind: "dot" }]}>
        {tails.length === 0 ? <p className={l.empty}>In the demo run a {d}-day delay causes no extra failure. Across all 10 seeds it adds {(cf[String(d)]!.unplanned_failures.mean - cf["0"]!.unplanned_failures.mean).toFixed(1)} failures on average (Fleet tab); try 7 days.</p> : (
          <TimelineStrips days={90} width={1780} labelWidth={230} rowHeight={30}
            rows={tails.flatMap((t) => [
              { label: t, sub: "data on time", blocks: blocks(onTime, t), markers: fails(onTime, t) },
              { label: "", sub: `data ${d} d late`, blocks: blocks(late, t), markers: fails(late, t) },
            ])} />
        )}
      </ChartFrame>
      <ul className={l.story}>
        {newly.slice(0, 5).map((e, i) => <li key={i}><b>{e.tail}</b> · D+{e.day}: {e.system?.replace("_", " ")} failed{e.in_flight ? " in flight — mission aborted" : " on the ground"}. With current data it was serviced in time.</li>)}
      </ul>
    </div>
  );
}

function BaseTab({ onTime, late, d }: { onTime: Run; late: Run; d: number }) {
  const fb = (run: Run) => run.events.filter((e) => e.kind === "failure").reduce<Record<string, number>>((a, e) => ({ ...a, [e.base]: (a[e.base] ?? 0) + 1 }), {});
  const lf = fb(late), of = fb(onTime);
  const base = Object.keys(BASES).sort((a, b) => ((lf[b] ?? 0) - (of[b] ?? 0)) - ((lf[a] ?? 0) - (of[a] ?? 0)))[0]!;
  const days = onTime.ready_curve.map((_, i) => i);
  return (
    <div className={l.twoUp}>
      <ChartFrame title={`${BASES[base]} · aircraft in the garage`} subtitle={`Demo run · failures here: ${of[base] ?? 0} on time vs ${lf[base] ?? 0} with ${d}-day-late data`} provenance="SIMULATED"
        legend={[{ label: "data on time", color: "var(--series-p3)" }, { label: `${d} d late`, color: "var(--series-p1)" }]}
        table={{ columns: ["day", "on time", "late"], rows: days.filter((x) => x % 10 === 0).map((x) => [x, onTime.hangar_by_base[base]![x]!, late.hangar_by_base[base]![x]!]) }}>
        <LineChart x={days} width={860} height={300} xLabel="day" yLabel="aircraft in garage"
          series={[{ id: "on", label: "on time", color: "var(--series-p3)", values: onTime.hangar_by_base[base]!, emphasis: true },
                   { id: "late", label: `${d} d late`, color: "var(--series-p1)", values: late.hangar_by_base[base]! }]} />
      </ChartFrame>
      <ChartFrame title={`${BASES[base]} · share of aircraft ready`} subtitle="Demo run · daily" provenance="SIMULATED"
        legend={[{ label: "data on time", color: "var(--series-p3)" }, { label: `${d} d late`, color: "var(--series-p1)" }]}
        table={{ columns: ["day", "on time %", "late %"], rows: days.filter((x) => x % 10 === 0).map((x) => [x, +(onTime.ready_by_base[base]![x]! * 100).toFixed(1), +(late.ready_by_base[base]![x]! * 100).toFixed(1)]) }}>
        <LineChart x={days} width={860} height={300} xLabel="day" yLabel="ready %" yFormat={(v) => `${Math.round(v)}%`}
          series={[{ id: "on", label: "on time", color: "var(--series-p3)", values: onTime.ready_by_base[base]!.map((v) => v * 100), emphasis: true },
                   { id: "late", label: `${d} d late`, color: "var(--series-p1)", values: late.ready_by_base[base]!.map((v) => v * 100) }]} />
      </ChartFrame>
    </div>
  );
}

function FleetTab({ cf }: { cf: LateCF["fleet"] }) {
  const days = cf["0"]!.ready_curve.map((_, i) => i);
  const colors: Record<string, string> = { "1": "var(--series-p2)", "3": "var(--series-p1)", "7": "var(--series-p0)" };
  return (
    <div className={l.twoUp}>
      <ChartFrame title="Unplanned failures in 90 days by detection delay" subtitle="Pratirakshak · mean and 95 % CI across 10 seeds" provenance="SIMULATED"
        table={{ columns: ["delay (days)", "mean", "95 % CI low", "95 % CI high"], rows: ["0", "1", "3", "7"].map((k) => [k, cf[k]!.unplanned_failures.mean, cf[k]!.unplanned_failures.lo, cf[k]!.unplanned_failures.hi]) }}>
        <BarCI width={820} format={(v) => v.toFixed(1)}
          rows={["0", "1", "3", "7"].map((k) => ({ label: k === "0" ? "data on time" : `${k} day${k === "1" ? "" : "s"} late`, color: k === "0" ? "var(--series-p3)" : colors[k]!, ...cf[k]!.unplanned_failures }))} />
        <BarCI width={820} format={(v) => v.toFixed(1)}
          rows={["0", "1", "3", "7"].map((k) => ({ label: k === "0" ? "in flight, on time" : `in flight, ${k} d late`, color: k === "0" ? "var(--series-p3)" : colors[k]!, ...cf[k]!.inflight_failures }))} />
      </ChartFrame>
      <ChartFrame title="Cumulative availability difference (aircraft-days)" subtitle="Positive = availability lost vs data on time. Negative = gained (deferred work falls past day 90)." provenance="SIMULATED"
        legend={DELAYS.map((k) => ({ label: `${k} d late`, color: colors[String(k)]! }))}
        table={{ columns: ["day", "1 d", "3 d", "7 d"], rows: days.filter((x) => x % 15 === 0).map((x) => [x, ...DELAYS.map((k) => cf[String(k)]!.cumulative_gap_aircraft_days[x]!)]) }}>
        <LineChart x={days} width={860} height={300} xLabel="day" yLabel="aircraft-days"
          series={DELAYS.map((k) => ({ id: String(k), label: `${k} d`, color: colors[String(k)]!, values: cf[String(k)]!.cumulative_gap_aircraft_days }))} />
      </ChartFrame>
    </div>
  );
}
