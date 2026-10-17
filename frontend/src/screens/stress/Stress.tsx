import { interpolateRgb } from "d3-interpolate";
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
const SYSTEMS = ["hydraulics", "landing_gear", "flight_controls", "electrical", "avionics", "fuel", "structure"];
const COLOR: Record<PolicyId, string> = { P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)" };
const ramp = interpolateRgb("#e7dfcb", "#4b5632"); // sequential: one hue, light → dark (sand → olive)

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

      <div className={s.top}>
        <ChartFrame title="Share of the fleet ready to deploy" subtitle="Mean of 10 seeds, daily"
          legend={[{ label: `${res.policies.P3} (with)`, color: COLOR.P3 }, { label: `${res.policies[bb]} (without)`, color: COLOR[bb] }, { label: res.policies.P0, color: COLOR.P0 }]}
          table={{ columns: ["day", res.policies.P0, res.policies[bb], res.policies.P3], rows: days.filter((d) => d % 10 === 0).map((d) => [d, +(cur.P0.fleet[d]! * 100).toFixed(1), +(cur[bb].fleet[d]! * 100).toFixed(1), +(cur.P3.fleet[d]! * 100).toFixed(1)]) }}>
          <LineChart x={days} width={1100} height={380} xLabel="day" yLabel="ready %" yFormat={(v) => `${Math.round(v)}%`} markers={markers} yDomain={[0, 100]}
            series={[{ id: "P0", label: "P0", color: COLOR.P0, values: cur.P0.fleet.map((v) => v * 100) },
                     { id: bb, label: bb, color: COLOR[bb], values: cur[bb].fleet.map((v) => v * 100) },
                     { id: "P3", label: "P3", color: COLOR.P3, values: cur.P3.fleet.map((v) => v * 100), emphasis: true }]} />
        </ChartFrame>
        <div className={s.outcomes}>
          <span className={s.kicker}>WITHOUT → WITH · PAIRED BY SEED</span>
          {(["ready_pct", "sortie_fill_pct", "unplanned_failures", "inflight_failures", "cost"] as const).map((m) => (
            <Outcome key={m} m={m} a={sum[bb]![m]!} b={sum.P3![m]!} d={pd[m] as CI} />
          ))}
        </div>
      </div>

      <div className={s.bottom}>
        <section className={s.heat}>
          <div className={s.secHead}><span>Ready share by base, day by day</span><span className={s.rampKey}>30 %<i />100 %</span></div>
          {Object.keys(BASES).map((b) => (
            <div key={b} className={s.heatBase}>
              <span className={s.baseName}>{BASES[b]}</span>
              <Strip label="without" values={cur[bb].by_base[b]!} />
              <Strip label="with" values={cur.P3.by_base[b]!} />
            </div>
          ))}
          {markers.length > 0 && <p className={s.small}>Strike lands on day {markers[0]!.x}: Aravalli loses {Math.round(Number(def.bay_loss_fraction ?? 0) * 100)} % of its garage bays and its store; {String(def.damaged_aircraft ?? 0)} aircraft are damaged.</p>}
        </section>
        {sc === "surge" ? <UsagePanel u={res.counterfactuals.usage_2x} /> : (
          <section className={s.note}>
            <div className={s.secHead}><span>What this scenario changes</span></div>
            <p>{describe(sc, def)}</p>
            <p className={s.small}>Same seeds and the same random draws for every policy, so differences come from decisions, not luck. Pratirakshak beats the best alternative where the line and the strips separate; where they overlap, it does not — see Results for every scenario.</p>
          </section>
        )}
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

function Outcome({ m, a, b, d }: { m: string; a: CI; b: CI; d: CI }) {
  const L: Record<string, [string, number, string]> = { ready_pct: ["Ready aircraft", 1, "%"], sortie_fill_pct: ["Sorties flown ÷ demanded", 1, "%"], unplanned_failures: ["Unplanned failures", 0, ""],
    inflight_failures: ["In-flight failures", 0, ""], cost: ["Cost (₵, illustrative)", 0, ""] };
  const [label, dg, unit] = L[m]!;
  const higher = m === "ready_pct" || m === "sortie_fill_pct";
  const clear = d.lo > 0 || d.hi < 0;
  const good = higher ? d.mean > 0 : d.mean < 0;
  const f = (v: number) => (m === "cost" ? `${Math.round(v / 1000)}k` : v.toFixed(dg));
  return (
    <div className={s.outcome}>
      <span className={s.oLabel}>{label}</span>
      <span className={s.oVal}>{f(a.mean)}{unit} <em>→</em> <b>{f(b.mean)}{unit}</b></span>
      <span className={`${s.oDelta} ${clear ? (good ? s.good : s.bad) : ""}`}>{clear ? `${d.mean > 0 ? "+" : ""}${f(d.mean)}${unit}` : "no clear difference"} <small>[{f(d.lo)}, {f(d.hi)}]</small></span>
      {m === "sortie_fill_pct" && Math.max(a.mean, b.mean) > 100 && <span className={s.oNote}>Above 100 % because daily sorties are random draws around demand.</span>}
    </div>
  );
}

function Strip({ label, values }: { label: string; values: number[] }) {
  const W = 680, cell = W / values.length;
  return (
    <div className={s.strip}>
      <span className={s.stripLabel}>{label}</span>
      <svg width={W} height={18} role="img" aria-label={`${label}: ready share ${Math.round(Math.min(...values) * 100)}–${Math.round(Math.max(...values) * 100)} %`}>
        {values.map((v, i) => <rect key={i} x={i * cell} y={0} width={cell + 0.4} height={18} fill={ramp(Math.max(0, Math.min(1, (v - 0.3) / 0.7)))} />)}
      </svg>
    </div>
  );
}

function UsagePanel({ u }: { u: Full["counterfactuals"]["usage_2x"] }) {
  const n = u.P3.base.damage_curve.length;
  const pair = (k: keyof Omit<Usage, "damage_curve">, d = 0) => `${u.P3.base[k].mean.toFixed(d)} → ${u.P3.surge[k].mean.toFixed(d)}`;
  return (
    <section className={s.usage}>
      <div className={s.secHead}><span>2× usage counterfactual · same fleet under Pratirakshak</span><ProvenanceChip kind="SIMULATED" /></div>
      <div className={s.usageNums}>
        <span><b>{pair("hangar_days")}</b> garage days</span>
        <span><b>{pair("planned_hours")}</b> planned work hours</span>
        <span><b>{pair("sensor_fault_onsets")}</b> sensor faults</span>
        <span><b>{pair("verify_actions")}</b> verify-sensor actions</span>
        <span><b>{u.P0.base.unplanned_failures.mean.toFixed(0)} → {u.P0.surge.unplanned_failures.mean.toFixed(0)}</b> failures if run to failure</span>
      </div>
      <div className={s.wear}>
        {SYSTEMS.map((sys, j) => {
          const W = 112, H = 84, all = [...u.P3.base.damage_curve, ...u.P3.surge.damage_curve].map((r) => r[j]!);
          const lo = Math.min(...all), top = Math.max(...all, lo + 1e-6);
          const y = (v: number) => H - 4 - ((v - lo) / (top - lo)) * (H - 12);
          const line = (curve: number[][]) => curve.map((row, i) => `${i ? "L" : "M"}${((i / (n - 1)) * W).toFixed(1)},${y(row[j]!).toFixed(1)}`).join("");
          return (
            <figure key={sys} className={s.wearFig}>
              <figcaption>{sys.replace("_", " ")} <small>{lo.toFixed(2)}–{top.toFixed(2)}</small></figcaption>
              <svg width={W} height={H} aria-label={`${sys} mean wear, normal vs doubled use`}>
                <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--grid)" />
                <path d={line(u.P3.base.damage_curve)} fill="none" stroke="var(--series-p3)" strokeWidth={1.8} />
                <path d={line(u.P3.surge.damage_curve)} fill="none" stroke="var(--series-p1)" strokeWidth={1.8} />
              </svg>
            </figure>
          );
        })}
      </div>
      <p className={s.small}><i className={s.keyN} /> normal use · <i className={s.keyS} /> doubled use — fleet-mean wear per system over 90 days (0 = new, 1 = failure; each panel scaled to its own range). Heavier use wears systems faster, fills hangars and produces more sensor faults; trust scoring flags more of them for verification.</p>
    </section>
  );
}
