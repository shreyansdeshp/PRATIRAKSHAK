import { useMemo, useState } from "react";

import { BarCI, TimelineStrips } from "../../charts/kit";
import { Legend, ProvenanceChip, SheetHeader } from "../../components/primitives";
import type { PolicyId, Results, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useApp } from "../../store/app";
import { formatDuration } from "../../util/duration";
import p from "./Plan.module.css";

interface PlanVisit {
  id: string; tail: string; base: string; type: string; start: number; end: number; duration: number; bay: number; hours: number; pulled: boolean;
  tasks: { system: string; lru: string; hours: number; due: number }[];
}
interface PlanData { horizon_days: number; capacity: Record<string, { bays: number; tech_hours: number }>; visits: PlanVisit[] }
interface DemoEvent { day: number; tail: string; kind: "failure" | "visit_start" | "pull"; system?: string; in_flight?: boolean; duration?: number; planned?: boolean; systems?: string[] }
interface DemoData { runs: Record<string, { events: DemoEvent[] }> }

const SHOW_DAYS = 14;
const POLICY_LABELS: Record<PolicyId, string> = { P0: "Run-to-failure", P1: "Fixed interval", P2: "Threshold alarms", P3: "Pratirakshak" };
const POLICY_COLORS: Record<PolicyId, string> = { P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)" };
const SYS_NAME: Record<string, string> = {
  engines: "Engines", hydraulics: "Hydraulics", landing_gear: "Landing gear", flight_controls: "Flight controls",
  electrical: "Electrical", avionics: "Avionics", fuel: "Fuel", structure: "Structure",
};

/** The tail with the most in-flight failures under P0 and no unplanned visit under P3 — the clearest before/after. */
function pickTail(demo: DemoData): string {
  const p0 = demo.runs.P0?.events ?? [], p3 = demo.runs.P3?.events ?? [];
  const bad = new Set(p3.filter((e) => e.kind === "visit_start" && !e.planned).map((e) => e.tail));
  const score = new Map<string, number>();
  for (const e of p0) if (e.kind === "failure" && e.in_flight && !bad.has(e.tail)) score.set(e.tail, (score.get(e.tail) ?? 0) + 1);
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "PR-G295";
}

/** S6 — Planning: planned vs unplanned timeline first, then the garage schedule by base. */
export function Plan() {
  const { data } = useSnapshots<{ plan: PlanData; demo: DemoData; results: Results; world: World }>(["plan", "demo", "results", "world"]);
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useApp((s) => s.navigate);
  const tail = useMemo(() => (data ? pickTail(data.demo) : ""), [data]);
  if (!data) return <div className={p.loading} />;
  const { plan, demo, results, world } = data;

  const blocksOf = (events: DemoEvent[]) => {
    const blocks: { start: number; end: number; kind: "planned" | "unplanned"; label?: string }[] = [];
    const markers: { day: number; label: string }[] = [];
    for (const e of events) {
      if (e.tail !== tail) continue;
      if (e.kind === "visit_start") blocks.push({ start: e.day, end: e.day + (e.duration ?? 1), kind: e.planned ? "planned" : "unplanned", label: (e.systems ?? []).map((s) => SYS_NAME[s] ?? s).join(", ") });
      else if (e.kind === "failure" && e.in_flight) markers.push({ day: e.day, label: `In-flight failure: ${SYS_NAME[e.system ?? ""] ?? e.system}` });
    }
    return { blocks, markers };
  };
  const r0 = blocksOf(demo.runs.P0?.events ?? []), r3 = blocksOf(demo.runs.P3?.events ?? []);
  const unplanned0 = r0.blocks.filter((b) => b.kind === "unplanned").length;
  const planned3 = r3.blocks.filter((b) => b.kind === "planned").length;
  const takeaway = `${tail}: ${r0.markers.length} in-flight failure${r0.markers.length === 1 ? "" : "s"} and ${unplanned0} breakdown repairs without prediction; ${r3.markers.length} and ${r3.blocks.length - planned3} with Pratirakshak, using ${planned3} planned visits`;

  const bases = world.bases;
  const shown = selected ? bases.filter((b) => b.id === selected) : bases;
  const util = bases.map((b) => {
    const n = plan.visits.filter((v) => v.base === b.id && v.start < SHOW_DAYS).length;
    const bays = plan.capacity[b.id]?.bays ?? 1;
    return { id: b.id, n, bays, ratio: n / bays };
  });
  const busiest = util.reduce((a, b) => (b.ratio > a.ratio ? b : a), util[0]!).id;

  const sum = results.summary.base!;
  const dh0 = sum.P0!.unplanned_hours!.mean, dh3 = sum.P3!.unplanned_hours!.mean;
  const fewer = (1 - dh3 / dh0) * 100;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

  return (
    <div className={p.sheet} data-testid="plan">
      <SheetHeader sheet="06" title="Planning timeline" />

      <section className={p.timeline} data-testid="timeline">
        <div className={p.sectionHead}>
          <h2 className={p.takeaway}>{takeaway}</h2>
          <ProvenanceChip kind="SIMULATED" />
        </div>
        <p className={p.sub}>Same aircraft, same 90-day horizon, day by day.</p>
        <TimelineStrips days={90} width={1700} labelWidth={230} rowHeight={92} dayLabel={(d) => (d === 0 ? "Day 0" : `${d}`)}
          rows={[
            { label: POLICY_LABELS.P0, blocks: r0.blocks, markers: r0.markers },
            { label: POLICY_LABELS.P3, blocks: r3.blocks, markers: r3.markers },
          ]} />
        <Legend items={[{ label: "Planned visit", color: "var(--olive)", kind: "band" }, { label: "Repair after a breakdown", color: "var(--khaki)", kind: "hatch" }, { label: "In-flight failure", color: "var(--pull)", kind: "dot" }]} />
      </section>

      <div className={p.lower}>
        <section className={p.bay} data-testid="bay-schedule">
          <div className={p.sectionHead}>
            <h2 className={p.h2}>Garage schedule · next {SHOW_DAYS} days</h2>
            <div className={p.tabs}>
              <button type="button" className={!selected ? p.tabOn : ""} onClick={() => setSelected(null)}>All bases</button>
              {bases.map((b) => <button key={b.id} type="button" className={selected === b.id ? p.tabOn : ""} onClick={() => setSelected(b.id)}>{b.name.replace(" Air Base", "")}</button>)}
            </div>
          </div>
          <div className={p.baseList}>
            {shown.map((b) => <BaseBlock key={b.id} name={b.name.replace(" Air Base", "")} u={util.find((x) => x.id === b.id)!} busiest={b.id === busiest}
              visits={plan.visits.filter((v) => v.base === b.id)} onOpen={(t) => navigate(`/decision/${t}`)} />)}
          </div>
          <Legend items={[{ label: "Scheduled visit", color: "var(--olive)", kind: "band" }, { label: "Aircraft already in repair", color: "var(--khaki)", kind: "hatch" }]} />
        </section>

        <aside className={p.card} data-testid="downtime">
          <h2 className={p.h2}>Unplanned downtime (aircraft-hours)</h2>
          <BarCI width={470}
            rows={(["P0", "P1", "P2", "P3"] as PolicyId[]).map((pid) => { const c = sum[pid]!.unplanned_hours!; return { label: POLICY_LABELS[pid], mean: c.mean, lo: c.lo, hi: c.hi, color: POLICY_COLORS[pid] }; })}
            format={(v) => fmt(v)} />
          <p className={p.callout}><b>{fmt(dh3)} vs {fmt(dh0)}</b>{fewer.toFixed(1)}% fewer ({formatDuration(dh3)} vs {formatDuration(dh0)} of aircraft downtime across the fleet)</p>
          <p className={p.small}>Mean of {results.seeds} runs, 95% interval shown.</p>
        </aside>
      </div>
    </div>
  );
}

function BaseBlock({ name, u, busiest, visits, onOpen }: { name: string; u: { n: number; bays: number }; busiest: boolean; visits: PlanVisit[]; onOpen: (tail: string) => void }) {
  const byTail = new Map<string, PlanVisit[]>();
  for (const v of visits) byTail.set(v.tail, [...(byTail.get(v.tail) ?? []), v].sort((a, b) => a.start - b.start));
  const followOn = (v: PlanVisit) => { const seq = byTail.get(v.tail)!; const i = seq.indexOf(v); return i > 0 && seq[i - 1]!.pulled && !v.pulled; };
  const ticks = Array.from({ length: SHOW_DAYS / 2 + 1 }, (_, i) => i * 2);
  const bays = Array.from({ length: u.bays }, (_, i) => i);
  return (
    <div className={p.baseBlock}>
      <div className={p.baseHead}>
        <span className={p.baseName}>{name}</span>
        <span className={`${p.util} ${busiest ? p.utilBusy : ""}`}>{u.n} visits · {u.bays} bays{busiest ? " · busiest" : ""}</span>
      </div>
      <div className={p.axis}>
        {ticks.map((d) => <span key={d} className={p.tick} style={{ left: `${(d / SHOW_DAYS) * 100}%` }}>{d === 0 ? "Today" : d}</span>)}
      </div>
      {bays.map((b) => (
        <div key={b} className={p.bayRow}>
          <span className={p.bayLabel}>Bay {b + 1}</span>
          <div className={p.track}>
            {visits.filter((v) => v.bay === b && v.start < SHOW_DAYS).map((v) => {
              const fo = followOn(v);
              const tip = `${v.tail} · ${v.tasks.map((t) => SYS_NAME[t.system] ?? t.system).join(" + ")} · ${formatDuration(v.hours)}${v.pulled ? " · aircraft already in repair" : ""}${fo ? " · repair, then scheduled check" : ""}`;
              return (
                <button key={v.id} type="button" title={tip} onClick={() => onOpen(v.tail)}
                  className={`${p.visit} ${v.pulled ? p.visitRepair : ""} ${fo ? p.visitFollow : ""}`}
                  style={{ left: `${(v.start / SHOW_DAYS) * 100}%`, width: `${Math.max(3, ((v.end - v.start) / SHOW_DAYS) * 100)}%` }}>
                  {fo ? "↳ " : ""}{v.tail.slice(4)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
