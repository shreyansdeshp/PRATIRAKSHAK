import { useState } from "react";

import { ChartFrame, LineChart } from "../../charts/kit";
import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { CI, PolicyId, Results } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useBeatParams } from "../../story/story";
import s from "./Stress.module.css";

const SCEN = ["surge", "strike", "supply", "weather"] as const;
const BASES: Record<string, string> = { SAH: "Sahyadri", ARV: "Aravalli", HIM: "Himshikhar", KAV: "Kaveri" };
const COLOR: Record<PolicyId, string> = { P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)" };

interface Usage { damage_curve: number[][]; visits: CI; hangar_days: CI; planned_hours: CI; unplanned_failures: CI; sensor_fault_onsets: CI; verify_actions: CI }
type Full = Results & { scenario_defs: Record<string, Record<string, unknown>>; counterfactuals: { usage_2x: Record<"P0" | "P3", Record<"base" | "surge", Usage>> } };

/** S7 — stress test: scenario × policy, without vs with Pratirakshak, per-base heat strips, 2× usage counterfactual. */
export function Stress() {
  const { data } = useSnapshots<{ results: Full }>(["results"]);
  const beat = useBeatParams();
  const [sc, setSc] = useState<string>(beat.get("sc") ?? new URLSearchParams(window.location.search).get("sc") ?? "surge");
  if (!data) return <div className={s.loading} />;
  const res = data.results;
  const bb = res.best_baseline[sc]!;
  const cur = res.curves[sc]!;
  const sum = res.summary[sc]!;
  const pd = res.paired[sc]!;
  const def = res.scenario_defs[sc] ?? {};
  const days = cur.P3.fleet.map((_, i) => i);
  const dRdy = sum.P3!.ready_pct!.mean - sum[bb]!.ready_pct!.mean, dFail = sum[bb]!.unplanned_failures!.mean - sum.P3!.unplanned_failures!.mean;
  const takeaway = Math.abs(dRdy) < 1.5 ? `${res.scenarios[sc]}: about the same aircraft ready, ${dFail.toFixed(0)} fewer unplanned failures`
    : dRdy > 0 ? `${res.scenarios[sc]}: ${dRdy.toFixed(0)} points more aircraft ready and ${dFail.toFixed(0)} fewer failures` : `${res.scenarios[sc]}: ${Math.abs(dRdy).toFixed(0)} points fewer aircraft ready, but ${dFail.toFixed(0)} fewer failures`;
  const markers = sc === "strike" ? [{ x: Number(def.day ?? 20), label: `strike on ${BASES[String(def.base ?? "ARV")]}` }] : [];

  return (
    <div className={s.sheet} data-testid="stress" data-scenario={sc}>
      <RegistrationMarks />
      <SheetHeader sheet="07" title={`Stress test · ${res.scenarios[sc]}`} subtitle={`Without vs with Pratirakshak · best alternative here: ${res.policies[bb]} · 10 seeds, common random numbers`}
        right={<SheetIndex />} />
      <div className={s.controls}>
        {SCEN.map((k) => <button key={k} type="button" className={k === sc ? s.on : ""} onClick={() => setSc(k)}>{res.scenarios[k]}</button>)}
        <span className={s.desc}>{describe(sc, def)}</span>
        <span className={s.chip}><ProvenanceChip kind="SIMULATED" /></span>
      </div>

      <h2 className={s.takeaway}>{takeaway}</h2>
      <ChartFrame title="Share of the fleet ready to deploy" subtitle="Mean of 10 seeds, daily"
        legend={[{ label: `${res.policies.P3} (with)`, color: COLOR.P3 }, { label: `${res.policies[bb]} (without)`, color: COLOR[bb] }, { label: res.policies.P0, color: COLOR.P0 }]}
        table={{ columns: ["day", res.policies.P0, res.policies[bb], res.policies.P3], rows: days.filter((d) => d % 10 === 0).map((d) => [d, +(cur.P0.fleet[d]! * 100).toFixed(1), +(cur[bb].fleet[d]! * 100).toFixed(1), +(cur.P3.fleet[d]! * 100).toFixed(1)]) }}>
        <LineChart x={days} width={1700} height={400} xLabel="day" yLabel="ready %" yFormat={(v) => `${Math.round(v)}%`} markers={markers} yDomain={[0, 100]}
          series={[{ id: "P0", label: "P0", color: COLOR.P0, values: cur.P0.fleet.map((v) => v * 100) },
                   { id: bb, label: bb, color: COLOR[bb], values: cur[bb].fleet.map((v) => v * 100) },
                   { id: "P3", label: "P3", color: COLOR.P3, values: cur.P3.fleet.map((v) => v * 100), emphasis: true }]} />
      </ChartFrame>
      <div className={s.threeRow} data-testid="three">
        <Big label="Ready aircraft" a={sum[bb]!.ready_pct!} b={sum.P3!.ready_pct!} d={pd.ready_pct as CI} unit="%" digits={1} higher />
        <Big label="Unplanned failures" a={sum[bb]!.unplanned_failures!} b={sum.P3!.unplanned_failures!} d={pd.unplanned_failures as CI} unit="" digits={0} />
        <Big label="In-flight failures" a={sum[bb]!.inflight_failures!} b={sum.P3!.inflight_failures!} d={pd.inflight_failures as CI} unit="" digits={0} />
      </div>
      <CornerTag />
    </div>
  );
}

function describe(sc: string, def: Record<string, unknown>): string {
  if (sc === "surge") return `Sortie demand × ${def.sortie_multiplier ?? 2} from day ${def.from_day ?? 0}; heavier use also raises the sensor-fault rate × ${def.fault_hazard_multiplier ?? 1.5}.`;
  if (sc === "strike") return `Day ${def.day}: strike on ${BASES[String(def.base)]} — ${Math.round(Number(def.bay_loss_fraction) * 100)} % of garage bays and the base store lost, ${def.damaged_aircraft} aircraft damaged.`;
  if (sc === "supply") return `All roads into ${(def.road_closed_nodes as string[] | undefined)?.map((n) => BASES[n]).join(", ")} closed for the whole horizon; vendor dispatch +${def.vendor_extra_hours} h. Airlift still works.`;
  if (sc === "weather") return `Dust storms at Aravalli and Himshikhar, an intense monsoon at Sahyadri, more salt and humidity at Kaveri — every wear rate goes up.`;
  return "";
}

function Big({ label, a, b, d, unit, digits, higher }: { label: string; a: CI; b: CI; d: CI; unit: string; digits: number; higher?: boolean }) {
  const clear = d.lo > 0 || d.hi < 0;
  const good = higher ? d.mean > 0 : d.mean < 0;
  return (
    <div className={s.big}>
      <span className={s.bigLabel}>{label}</span>
      <span className={s.bigNum}>{a.mean.toFixed(digits)}{unit} <i>→</i> <b>{b.mean.toFixed(digits)}{unit}</b></span>
      <span className={`${s.bigNote} ${clear ? (good ? s.good : s.bad) : ""}`}>{clear ? (good ? "clear improvement" : "worse") : "no clear difference"}</span>
    </div>
  );
}
