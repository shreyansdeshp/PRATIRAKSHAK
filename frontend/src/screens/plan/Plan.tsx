import { useMemo, useState } from "react";

import { BarCI, ChartFrame, TimelineStrips } from "../../charts/kit";
import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { CI, PolicyId, Results, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import p from "./Plan.module.css";

/* ----- local types for snapshot shapes not in types.ts ----- */
interface PlanVisit {
  id: string;
  tail: string;
  base: string;
  type: string;
  start: number;
  end: number;
  duration: number;
  bay: number;
  hours: number;
  pulled: boolean;
  tasks: { system: string; lru: string; hours: number; due: number }[];
}
interface PlanData {
  horizon_days: number;
  capacity: Record<string, { bays: number; tech_hours: number }>;
  visits: PlanVisit[];
}
interface DemoEvent {
  day: number;
  tail: string;
  base?: string;
  kind: "failure" | "visit_start" | "pull";
  system?: string;
  in_flight?: boolean;
  duration?: number;
  planned?: boolean;
  systems?: string[];
}
interface DemoRun {
  events: DemoEvent[];
  planned_hours: number;
  unplanned_hours: number;
  cost: number;
}
interface DemoData {
  runs: Record<string, DemoRun>;
}

const POLICY_LABELS: Record<PolicyId, string> = { P0: "Run-to-failure", P1: "Fixed interval", P2: "Threshold alarms", P3: "Pratirakshak" };
const POLICY_COLORS: Record<PolicyId, string> = {
  P0: "var(--series-p0)", P1: "var(--series-p1)", P2: "var(--series-p2)", P3: "var(--series-p3)",
};
const SYS_NAME: Record<string, string> = {
  engines: "Engines", hydraulics: "Hydraulics", landing_gear: "Landing gear", flight_controls: "Flight controls",
  electrical: "Electrical", avionics: "Avionics", fuel: "Fuel", structure: "Structure",
};

/** S6 — Planning timeline: Gantt, planned vs unplanned, cost comparison. */
export function Plan() {
  const { data } = useSnapshots<{ plan: PlanData; demo: DemoData; results: Results; world: World }>(["plan", "demo", "results", "world"]);
  const [selectedBase, setSelectedBase] = useState<string | null>(null);

  if (!data) return <div className={p.loading} />;
  const { plan, demo, results, world } = data;

  const bases = world.bases;
  const baseIds = bases.map((b) => b.id);
  const filteredBases = selectedBase ? baseIds.filter((id) => id === selectedBase) : baseIds;

  return (
    <div className={p.sheet} data-testid="plan">
      <RegistrationMarks />
      <SheetHeader
        sheet="06"
        title="Planning timeline"
        subtitle={`Hangar schedule · planned vs unplanned downtime · ${plan.horizon_days}-day horizon`}
        right={<SheetIndex />}
      />

      {/* Base tabs */}
      <div className={p.tabs}>
        <button
          type="button"
          className={`${p.tab} ${selectedBase === null ? p.tabActive : ""}`}
          onClick={() => setSelectedBase(null)}
        >
          All bases
        </button>
        {bases.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`${p.tab} ${selectedBase === b.id ? p.tabActive : ""}`}
            onClick={() => setSelectedBase(b.id)}
          >
            {b.name.replace(" Air Base", "")}
          </button>
        ))}
      </div>

      <div className={p.body}>
        {/* Left: Gantt + legend */}
        <div className={p.left}>
          <GanttSection plan={plan} filteredBases={filteredBases} bases={bases} />
        </div>

        {/* Right: Timeline comparison + BarCI */}
        <div className={p.right}>
          <TimelineComparison demo={demo} />
          <BarCIComparison results={results} />
          <div className={p.prov}>
            <span>Schedule <ProvenanceChip kind="SIMULATED" /></span>
            <span>Costs <ProvenanceChip kind="ILLUSTRATIVE" /></span>
          </div>
        </div>
      </div>
      <CornerTag />
    </div>
  );
}

/* ========================== Per-base Gantt ========================== */

function GanttSection({ plan, filteredBases, bases }: { plan: PlanData; filteredBases: string[]; bases: World["bases"] }) {
  // zoom to the days that actually hold visits (the solver front-loads work), not the full horizon
  const horizon = Math.min(plan.horizon_days, Math.max(7, Math.ceil(Math.max(0, ...plan.visits.map((v) => v.end))) + 1));
  const tickStep = horizon <= 10 ? 1 : 5;
  const visitsByBase = useMemo(() => {
    const m: Record<string, PlanVisit[]> = {};
    for (const v of plan.visits) {
      (m[v.base] ??= []).push(v);
    }
    return m;
  }, [plan.visits]);

  const [tip, setTip] = useState<{ x: number; y: number; visit: PlanVisit } | null>(null);

  return (
    <div className={p.ganttSection}>
      <div className={p.ganttWrap}>
        {filteredBases.map((baseId) => {
          const bays = plan.capacity[baseId]?.bays ?? 4;
          const visits = visitsByBase[baseId] ?? [];
          const baseName = bases.find((b) => b.id === baseId)?.name.replace(" Air Base", "") ?? baseId;

          return (
            <div key={baseId} className={p.ganttBase}>
              <div className={p.ganttBaseHead}>
                <span className={p.ganttBaseName}>{baseName}</span>
                <span className={p.ganttBaseMeta}>{bays} bays · {visits.length} visits</span>
              </div>
              {/* Day tick header */}
              <div className={p.ganttDayRow}>
                <span />
                <div className={p.ganttDays}>
                  {Array.from({ length: Math.floor(horizon / tickStep) + 1 }, (_, i) => i * tickStep).map((d) => (
                    <span key={d} className={p.ganttDayTick} style={{ left: `${(d / horizon) * 100}%` }}>
                      D+{d}
                    </span>
                  ))}
                </div>
              </div>
              {/* Bay rows */}
              {Array.from({ length: bays }, (_, bay) => {
                const bayVisits = visits.filter((v) => v.bay === bay);
                return (
                  <div key={bay} className={p.ganttRow}>
                    <span className={p.ganttBayLabel}>Bay {bay + 1}</span>
                    <div className={p.ganttTrack}>
                      {bayVisits.map((v) => {
                        const left = (v.start / horizon) * 100;
                        const width = Math.max(1, ((v.end - v.start) / horizon) * 100);
                        const isBundled = v.tasks.length > 1;
                        return (
                          <div
                            key={v.id}
                            className={`${p.ganttVisit} ${v.pulled ? p.ganttVisitPulled : ""} ${isBundled ? p.ganttVisitBundled : ""}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${v.tail} D+${v.start}–${v.end} ${v.tasks.map((t) => t.system).join(", ")}`}
                            onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, visit: v })}
                            onMouseLeave={() => setTip(null)}
                          >
                            {v.tail.replace("PR-", "")}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {/* Legend */}
        <div className={p.ganttLegend}>
          <span><i style={{ background: "var(--ink-soft)" }} /> Scheduled visit</span>
          <span><i style={{ background: "var(--pull)" }} /> Aircraft already pulled</span>
          <span><i style={{ background: "var(--paper-hi)", border: "1.5px solid var(--olive)" }} /> Bundled (multiple tasks)</span>
        </div>
      </div>
      {tip && (
        <div className={p.visitTip} style={{ left: tip.x + 12, top: tip.y - 10 }}>
          <dl>
            <dt>Aircraft</dt>
            <dd>{tip.visit.tail} ({tip.visit.type})</dd>
            <dt>Schedule</dt>
            <dd>D+{tip.visit.start} – D+{tip.visit.end} ({tip.visit.duration} d, {tip.visit.hours} h)</dd>
            <dt>Tasks ({tip.visit.tasks.length})</dt>
            {tip.visit.tasks.map((t, i) => (
              <dd key={i}>{SYS_NAME[t.system] ?? t.system} — {t.lru} ({t.hours} h, due D+{t.due})</dd>
            ))}
            {tip.visit.pulled && <dd style={{ color: "var(--pull)" }}>■ Aircraft already pulled from line</dd>}
          </dl>
        </div>
      )}
    </div>
  );
}

/* ========================== Planned vs Unplanned Timeline ========================== */

/** The tail with the most in-flight failures under P0 and no unplanned visit under P3 — the clearest before/after. */
function pickTail(demo: DemoData): string {
  const p0 = demo.runs.P0?.events ?? [], p3 = demo.runs.P3?.events ?? [];
  const bad = new Set(p3.filter((e) => e.kind === "visit_start" && !e.planned).map((e) => e.tail));
  const score = new Map<string, number>();
  for (const e of p0) if (e.kind === "failure" && e.in_flight && !bad.has(e.tail)) score.set(e.tail, (score.get(e.tail) ?? 0) + 1);
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "PR-G295";
}

function TimelineComparison({ demo }: { demo: DemoData }) {
  const horizon = 90; // demo events span 90 days; the plan is the first 30
  const TIMELINE_TAIL = useMemo(() => pickTail(demo), [demo]);

  const makeBlocks = (events: DemoEvent[], tail: string) => {
    const blocks: { start: number; end: number; kind: "planned" | "unplanned"; label?: string }[] = [];
    const markers: { day: number; label: string }[] = [];
    for (const e of events) {
      if (e.tail !== tail) continue;
      if (e.kind === "visit_start") {
        const dur = e.duration ?? 1;
        blocks.push({
          start: e.day,
          end: e.day + dur,
          kind: e.planned ? "planned" : "unplanned",
          label: (e.systems ?? []).map((s) => SYS_NAME[s] ?? s).join(", "),
        });
      } else if (e.kind === "failure" && e.in_flight) {
        markers.push({ day: e.day, label: `In-flight failure: ${SYS_NAME[e.system ?? ""] ?? e.system}` });
      }
    }
    return { blocks, markers };
  };

  const p0 = makeBlocks(demo.runs.P0?.events ?? [], TIMELINE_TAIL);
  const p3 = makeBlocks(demo.runs.P3?.events ?? [], TIMELINE_TAIL);

  return (
    <div className={p.timelineSection}>
      <div className={p.timelineTitle}>Planned vs unplanned — {TIMELINE_TAIL}</div>
      <ChartFrame
        title={`${TIMELINE_TAIL}: without vs with Pratirakshak`}
        subtitle="Same aircraft, same 90-day horizon. Planned visits are solid; unplanned (on failure) are hatched; ■ marks in-flight failures."
        provenance="SIMULATED"
        legend={[
          { label: "Planned visit", color: "var(--ink-soft)", kind: "line" },
          { label: "Unplanned (on failure)", color: "var(--pull)", kind: "hatch" },
          { label: "In-flight failure", color: "var(--pull)", kind: "dot" },
        ]}
        table={{
          columns: ["Policy", "Blocks", "In-flight failures"],
          rows: [
            ["P0 Run-to-failure", p0.blocks.length, p0.markers.length],
            ["P3 Pratirakshak", p3.blocks.length, p3.markers.length],
          ],
        }}
      >
        <TimelineStrips
          rows={[
            { label: "P0 Run-to-failure", blocks: p0.blocks, markers: p0.markers },
            { label: "P3 Pratirakshak", blocks: p3.blocks, markers: p3.markers },
          ]}
          days={horizon}
          width={780}
          rowHeight={32}
          labelWidth={140}
        />
      </ChartFrame>
    </div>
  );
}

/* ========================== BarCI Policy Comparison ========================== */

function BarCIComparison({ results }: { results: Results }) {
  const base = results.summary.base;
  if (!base) return null;

  const metrics: { key: string; label: string; unit: string }[] = [
    { key: "planned_hours", label: "Planned downtime (h)", unit: "h" },
    { key: "unplanned_hours", label: "Unplanned downtime (h)", unit: "h" },
    { key: "cost", label: "Total cost (₵ ILLUSTRATIVE)", unit: "₵" },
  ];

  return (
    <div className={p.barSection}>
      {metrics.map(({ key, label, unit }) => {
        const rows = (["P0", "P1", "P2", "P3"] as PolicyId[]).map((pid) => {
          const ci: CI = (base[pid] as Record<string, CI>)?.[key] ?? { mean: 0, lo: 0, hi: 0, sd: 0, n: 0 };
          return {
            label: `${pid} ${POLICY_LABELS[pid]}`,
            mean: ci.mean,
            lo: ci.lo,
            hi: ci.hi,
            color: POLICY_COLORS[pid],
          };
        });
        return (
          <ChartFrame
            key={key}
            title={label}
            subtitle={`Mean with 95 % CI across ${results.seeds} seeds`}
            provenance={key === "cost" ? "ILLUSTRATIVE" : "SIMULATED"}
            table={{
              columns: ["Policy", `Mean (${unit})`, "95 % CI lo", "95 % CI hi"],
              rows: rows.map((r) => [r.label, Math.round(r.mean), Math.round(r.lo), Math.round(r.hi)]),
            }}
          >
            <BarCI
              rows={rows}
              width={380}
              format={(v) => (key === "cost" ? `₵${Math.round(v / 1000)}k` : `${Math.round(v)}`)}
            />
          </ChartFrame>
        );
      })}
    </div>
  );
}
