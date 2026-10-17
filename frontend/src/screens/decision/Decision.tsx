import { CornerTag, RegistrationMarks, SheetHeader, StatusGlyph, type StatusLike } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { FleetState, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useApp } from "../../store/app";
import d from "./Decision.module.css";

const SYS: Record<string, string> = { engines: "Engine", hydraulics: "Hydraulics", landing_gear: "Landing gear & brakes", flight_controls: "Flight controls",
  electrical: "Electrical", avionics: "Avionics / radar", fuel: "Fuel", structure: "Structure" };
const ACTION: Record<string, { label: string; status: StatusLike; title: (t: string) => string }> = {
  PULL_FROM_LINE: { label: "Repair", status: "PULL", title: (t) => `Why ${t} is being sent for repair` },
  EXPEDITE_SPARE: { label: "Expedite spare", status: "WATCH", title: (t) => `Why a spare is being rushed to ${t}` },
  VERIFY_SENSOR: { label: "Verify sensor first", status: "STALE", title: (t) => `Why ${t}'s sensor is checked before any repair` },
  SCHEDULE_SERVICE: { label: "Schedule service", status: "WATCH", title: (t) => `Why ${t} is booked for the garage` },
  MONITOR_CLOSELY: { label: "Monitor closely", status: "WATCH", title: (t) => `Why ${t} is on watch` },
  SWAP_TAIL_FOR_MISSION: { label: "Swap tail for mission", status: "WATCH", title: (t) => `Why ${t} sits out this mission` },
  SERVE_NORMALLY: { label: "Serve normally", status: "READY", title: (t) => `Why ${t} keeps flying` },
};

interface Source { node: string; name: string; kind: string; qty: number; mode: string; eta_hours: number | null; distance_km: number; route_id: string | null; note: string }
interface Headline {
  system: string; lru: string; lru_name: string; p_fail: number; theta: number; criticality: string; rul_days: [number, number, number];
  key_sensors: { sensor: string; text: string; trust?: number | null }[]; confidence: { level: "high" | "medium" | "low"; reasons: string[] } | null;
  spares: { verdict: "SOURCE" | "PULL"; deadline_hours: number; install_hours: number; sources: Source[]; chosen: Source | null } | null;
  alternatives: { option: string; consequence: string }[]; downtime_cost: { planned_hours: number; unplanned_hours: number; planned_cost: number; unplanned_cost: number };
  cannibalise_from?: string[] | null; action: string; reason: string;
}
interface DecisionRow { tail: string; type: string; base: string; action: string; system: string; reason: string; headline: Headline; systems: Headline[] }
interface History { systems: Record<string, Record<string, (number | null)[]>>; trust: Record<string, Record<string, { trust: number; reasons: string }>>;
  sensor_meta: Record<string, { name: string; unit: string; system: string; kind: string }>;
  engines: Record<string, { sensors: Record<string, { symbol: string; name: string; unit: string; deviation: number[] }> }[]> }
interface Twin { days: number[]; tails: Record<string, { systems: Record<string, { p10: number[]; p50: number[]; p90: number[] }> }> }

/** S4 — the decision card: the rule restated for this tail, reason, key sensors, risk vs θ, confidence, alternatives, spare. */
export function Decision({ tail }: { tail: string }) {
  const { data } = useSnapshots<{ decisions: DecisionRow[]; state: FleetState; history: History; twin: Twin; world: World }>(["decisions", "state", "history", "twin", "world"]);
  const navigate = useApp((s) => s.navigate);
  if (!data) return <div className={d.loading} />;
  const { decisions, state, world } = data;
  const row = decisions.find((x) => x.tail === tail) ?? decisions[0]!;
  const h = row.headline;
  const act = ACTION[row.action] ?? ACTION.SERVE_NORMALLY!;
  const typeName = world.types.find((t) => t.id === row.type)?.name ?? row.type;
  const baseName = world.bases.find((b) => b.id === row.base)?.name ?? row.base;
  const conf = h.confidence;
  const [p10, p50, p90] = h.rul_days;

  return (
    <div className={d.sheet} data-testid="decision" data-tail={row.tail}>
      <RegistrationMarks />
      <SheetHeader sheet="04" title={act.title(row.tail)} subtitle={`${typeName} · ${baseName} · decision at D+0 06:00Z · ${SYS[h.system]} · ${h.criticality} flying`}
        right={<SheetIndex />} />

      {/* decision banner: verdict + why, in plain words */}
      <section className={d.nBanner} data-testid="verdict">
        <div className={d.nVerdict}>
          <span className={d.kicker}>DECISION</span>
          <span className={d.nWord}><StatusGlyph status={act.status} size={40} />{act.label}</span>
          <span className={d.nLru}>{h.lru_name}</span>
        </div>
        <p className={d.nReason} data-testid="reason">{row.reason}</p>
        <div className={d.nRisk}>
          <b>{Math.round(h.p_fail * 100)} %</b>
          <span>chance of failing in the next {state.window_days} days</span>
          <small>action limit {Math.round(h.theta * 100)} %</small>
        </div>
      </section>

      <div className={d.nCards}>
        <section className={d.nCard} data-testid="confidence">
          <h2 className={d.nH2}>How sure are we?</h2>
          {conf && (
            <>
              <div className={d.confMeter}>
                {(["low", "medium", "high"] as const).map((lv) => (
                  <span key={lv} className={`${d.confSeg} ${["low", "medium", "high"].indexOf(lv) <= ["low", "medium", "high"].indexOf(conf.level) ? d.confOn : ""}`} />
                ))}
              </div>
              <span className={d.nBig}>{conf.level} confidence</span>
            </>
          )}
        </section>

        <section className={d.nCard}>
          <h2 className={d.nH2}>When might it fail?</h2>
          <span className={d.nBig}>in about {p50.toFixed(0)} days</span>
          <span className={d.nSub}>likely between {p10.toFixed(0)} and {p90.toFixed(0)} days</span>
          <RulBar p10={p10} p50={p50} p90={p90} window={state.window_days} />
        </section>

        <section className={d.nCard}>
          <h2 className={d.nH2}>What the sensors say</h2>
          {h.key_sensors.length === 0 && <p className={d.nText}>No single sensor stands out.</p>}
          {h.key_sensors.slice(0, 2).map((k) => <p key={k.sensor} className={d.nText}>{k.text.replace(/\s*\([^)]*signature\)/, "")}</p>)}
        </section>
      </div>

      <div className={d.nBottom}>
        <section className={d.nCol}>
          <h2 className={d.nH2}>Options we weighed</h2>
          <ul className={d.nAlts}>
            {h.alternatives.map((a) => <li key={a.option}><b>{a.option}</b><span>{a.consequence}</span></li>)}
            {h.alternatives.length === 0 && <li><span>Risk is below the watch band; no action needed.</span></li>}
          </ul>
        </section>
        {h.spares && (
          <section className={d.nCol} data-testid="spare">
            <h2 className={d.nH2}>Can the spare part get here in time?</h2>
            <div className={`${d.nSpare} ${h.spares.verdict === "SOURCE" ? d.source : d.pull}`}>
              {h.spares.verdict === "SOURCE" ? "Yes — it arrives in time" : "No — the part cannot arrive in time"}
            </div>
            <p className={d.nText}>
              {h.spares.chosen ? `Fastest source: ${h.spares.chosen.name}, ${h.spares.chosen.eta_hours?.toFixed(0)} h to deliver + ${h.spares.install_hours.toFixed(0)} h to fit.` : "No open route."}
              {" "}Earliest plausible failure: {h.spares.deadline_hours < 1 ? "could be any time now" : `${h.spares.deadline_hours.toFixed(0)} h`}.
            </p>
            <button type="button" className={d.link} onClick={() => navigate(`/spares/${row.tail}`)}>Open the spares map →</button>
          </section>
        )}
      </div>
      <CornerTag />
    </div>
  );
}

function RulBar({ p10, p50, p90, window }: { p10: number; p50: number; p90: number; window: number }) {
  const W = 560, span = Math.max(p90 * 1.1, window * 2, 30);
  const x = (v: number) => (v / span) * W;
  return (
    <svg width={W} height={40} aria-hidden>
      <line x1={0} x2={W} y1={22} y2={22} stroke="var(--fold)" />
      <rect x={0} y={10} width={x(window)} height={24} fill="url(#hatch-stale)" opacity={0.5} />
      <text x={4} y={8} fontFamily="var(--font-sans)" fontSize={10} fill="var(--ink-soft)">next {window} days</text>
      <rect x={x(p10)} y={15} width={Math.max(2, x(p90) - x(p10))} height={14} fill="var(--series-p3)" opacity={0.22} />
      <line x1={x(p50)} x2={x(p50)} y1={11} y2={33} stroke="var(--series-p3)" strokeWidth={2.5} />
      <text x={x(p50) + 5} y={38} fontFamily="var(--font-mono)" fontSize={10} fill="var(--ink)">median {p50.toFixed(0)} d</text>
    </svg>
  );
}
