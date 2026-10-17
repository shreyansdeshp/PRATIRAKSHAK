import { FanChart, Sparkline } from "../../charts/kit";
import { CornerTag, HealthBar, ProvenanceChip, RegistrationMarks, SheetHeader, StatusGlyph, type StatusLike } from "../../components/primitives";
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
  const { decisions, state, history, twin, world } = data;
  const row = decisions.find((x) => x.tail === tail) ?? decisions[0]!;
  const h = row.headline;
  const ac = state.aircraft.find((a) => a.tail === row.tail)!;
  const act = ACTION[row.action] ?? ACTION.SERVE_NORMALLY!;
  const typeName = world.types.find((t) => t.id === row.type)?.name ?? row.type;
  const baseName = world.bases.find((b) => b.id === row.base)?.name ?? row.base;
  const conf = h.confidence;
  const notable = decisions.filter((x) => x.action !== "SERVE_NORMALLY").sort((a, b) => b.headline.p_fail - a.headline.p_fail);
  const fan = h.system !== "engines" ? twin.tails[row.tail]?.systems[h.system] : undefined;
  const [p10, p50, p90] = h.rul_days;

  return (
    <div className={d.sheet} data-testid="decision" data-tail={row.tail}>
      <RegistrationMarks />
      <SheetHeader sheet="04" title={act.title(row.tail)} subtitle={`${typeName} · ${baseName} · decision at D+0 06:00Z · ${SYS[h.system]} · ${h.criticality} flying`}
        right={<SheetIndex />} />

      {/* ---------------------------------------------------------------- the rule, restated with this tail's numbers */}
      <section className={d.rule}>
        <div className={d.ruleText}>
          <span className={d.kicker}>THE RULE</span>
          <p>
            If the chance that <b>{SYS[h.system]?.toLowerCase()}</b> fails before the next maintenance opportunity
            (<b>{state.window_days} days</b>) exceeds <b>θ = {Math.round(h.theta * 100)} %</b> for <b>{h.criticality}</b> flying, act now:
            get the spare if it can arrive in time, otherwise take the aircraft in for repair. If not, schedule the work before the earliest plausible failure.
          </p>
        </div>
        <RiskGauge p={h.p_fail} theta={h.theta} />
        <div className={d.verdict} data-testid="verdict">
          <span className={d.kicker}>DECISION</span>
          <span className={d.verdictWord}><StatusGlyph status={act.status} size={22} />{act.label}</span>
          <span className={d.verdictLru}>{h.lru} · {h.lru_name}</span>
        </div>
      </section>

      <div className={d.grid}>
        {/* ---------------------------------------------------------------- left: reason + confidence */}
        <section className={d.col}>
          <h2 className={d.h2}>Reason</h2>
          <p className={d.reason} data-testid="reason">{row.reason}</p>
          <h2 className={d.h2}>How sure</h2>
          {conf && (
            <div className={d.confidence} data-testid="confidence">
              <div className={d.confMeter}>
                {(["low", "medium", "high"] as const).map((lv) => (
                  <span key={lv} className={`${d.confSeg} ${["low", "medium", "high"].indexOf(lv) <= ["low", "medium", "high"].indexOf(conf.level) ? d.confOn : ""}`} />
                ))}
              </div>
              <span className={d.confWord}>{conf.level} confidence</span>
              <ul className={d.confReasons}>{conf.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          <div className={d.aircraftBox}>
            <span className={d.kicker}>AIRCRAFT TODAY</span>
            <div className={d.acRow}><span>Status</span><StatusGlyph status={ac.status} label /></div>
            <div className={d.acRow}><span>Health</span><HealthBar value={ac.weighted_health} width={140} /></div>
            <div className={d.acRow}><span>Risk, any system, 14 d</span><b>{Math.round(ac.risk_window * 100)} %</b></div>
            <button type="button" className={d.link} onClick={() => navigate(`/aircraft/${row.tail}`)}>Open in showroom →</button>
          </div>
        </section>

        {/* ---------------------------------------------------------------- middle: evidence */}
        <section className={d.col}>
          <h2 className={d.h2}>Key sensors <ProvenanceChip kind={h.system === "engines" ? "REAL" : h.system === "hydraulics" ? "REAL-ANCHORED" : "SIMULATED"} /></h2>
          <div className={d.sensors}>
            {h.key_sensors.length === 0 && <p className={d.muted}>No sensor is pulling the estimate down.</p>}
            {h.key_sensors.map((k) => {
              const eng = h.system === "engines" ? history.engines[row.tail]?.[0]?.sensors[k.sensor] : undefined;
              const series = eng ? eng.deviation : history.systems[row.tail]?.[k.sensor] ?? [];
              const tkey = eng ? Object.keys(history.trust[row.tail] ?? {}).find((x) => x.startsWith(`${k.sensor}:`)) : k.sensor;
              const trust = tkey ? history.trust[row.tail]?.[tkey]?.trust : undefined;
              return (
                <div key={k.sensor} className={d.sensor}>
                  <p>{k.text}</p>
                  <div className={d.sensorViz}>
                    <Sparkline values={series} width={250} height={34} baseline={eng ? 0 : undefined} color="var(--ink)" />
                    <span className={`${d.trust} ${trust !== undefined && trust < 60 ? d.untrusted : ""}`}>sensor trust {trust !== undefined ? Math.round(trust) : "—"}/100</span>
                  </div>
                </div>
              );
            })}
          </div>
          <h2 className={d.h2}>When it may fail</h2>
          <div className={d.rul}>
            <span>Remaining useful life: 80 % range <b>{p10.toFixed(0)}–{p90.toFixed(0)} days</b>, median <b>{p50.toFixed(0)}</b> · window {state.window_days} days</span>
            <RulBar p10={p10} p50={p50} p90={p90} window={state.window_days} />
          </div>
          {fan && (
            <FanChart x={twin.days} p10={fan.p10} p50={fan.p50} p90={fan.p90} width={560} height={170} yDomain={[-5, 100]}
              yLabel="projected condition (twin)" threshold={{ value: 0, label: "failure" }} xLabel="days ahead" />
          )}
        </section>

        {/* ---------------------------------------------------------------- right: options + spare */}
        <section className={d.col}>
          <h2 className={d.h2}>Alternatives considered</h2>
          <ul className={d.alts}>
            {h.alternatives.map((a) => <li key={a.option}><b>{a.option}</b><span>{a.consequence}</span></li>)}
            {h.alternatives.length === 0 && <li><span className={d.muted}>Risk is below the watch band; no action needed.</span></li>}
          </ul>
          {h.spares && (
            <>
              <h2 className={d.h2}>The spare · {h.lru}</h2>
              <SpareSummary s={h.spares} />
              {h.cannibalise_from && <p className={d.cann}>Cannibalisation option: {h.cannibalise_from[0]} (already grounded) — needs engineering approval.</p>}
              <button type="button" className={d.link} onClick={() => navigate(`/spares/${row.tail}`)}>Open the spares map →</button>
            </>
          )}
          <div className={d.cost}>
            <span className={d.kicker}>DOWNTIME IF IT FAILS IN SERVICE vs PLANNED</span>
            <div><b>{Math.round(h.downtime_cost.unplanned_hours)} h</b> unplanned · <b>{Math.round(h.downtime_cost.planned_hours)} h</b> planned</div>
            <div className={d.muted}>≈ ₵{Math.round(h.downtime_cost.unplanned_cost).toLocaleString("en-IN")} vs ₵{Math.round(h.downtime_cost.planned_cost).toLocaleString("en-IN")} <ProvenanceChip kind="ILLUSTRATIVE" /></div>
          </div>
          <div className={d.others}>
            <span className={d.kicker}>OTHER DECISIONS TODAY</span>
            <div className={d.otherList}>
              {notable.slice(0, 8).map((x) => (
                <button key={x.tail} type="button" className={x.tail === row.tail ? d.on : ""} onClick={() => navigate(`/decision/${x.tail}`)}>
                  <StatusGlyph status={(ACTION[x.action] ?? ACTION.SERVE_NORMALLY!).status} size={9} />{x.tail}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
      <CornerTag />
    </div>
  );
}

function RiskGauge({ p, theta }: { p: number; theta: number }) {
  const W = 520;
  const x = (v: number) => Math.min(1, v) * W;
  const over = p >= theta;
  return (
    <div className={d.gauge} data-testid="risk-gauge">
      <div className={d.gaugeNums}>
        <span><b className={over ? d.overText : ""}>{Math.round(p * 100)} %</b> chance of failure within the window</span>
        <span>θ <b>{Math.round(theta * 100)} %</b></span>
      </div>
      <svg width={W} height={46} aria-hidden>
        <rect x={0} y={16} width={W} height={12} rx={2} fill="var(--sand)" />
        <rect x={0} y={16} width={Math.max(3, x(p))} height={12} rx={2} fill={over ? "var(--pull)" : p >= theta / 2 ? "var(--watch)" : "var(--ready)"} />
        <line x1={x(theta)} x2={x(theta)} y1={6} y2={38} stroke="var(--ink)" strokeWidth={2} />
        <text x={x(theta) + 6} y={12} fontFamily="var(--font-mono)" fontSize={11} fill="var(--ink)">θ · act-now line</text>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={x(t)} y={44} fontFamily="var(--font-mono)" fontSize={10} fill="var(--ink-mute)" textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}>{Math.round(t * 100)}%</text>)}
      </svg>
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

function SpareSummary({ s }: { s: NonNullable<Headline["spares"]> }) {
  const best = s.chosen;
  const eta = best?.eta_hours ?? null;
  const W = 380;
  const max = Math.max(s.deadline_hours, (eta ?? 0) + s.install_hours, 12) * 1.15;
  const x = (v: number) => (v / max) * W;
  return (
    <div className={d.spare} data-testid="spare">
      <div className={`${d.spareVerdict} ${s.verdict === "SOURCE" ? d.source : d.pull}`}>{s.verdict === "SOURCE" ? "SOURCE · arrives in time" : "REPAIR · part cannot arrive in time"}</div>
      <svg width={W} height={58} aria-hidden>
        {eta !== null && <rect x={0} y={8} width={Math.max(2, x(eta))} height={12} fill="var(--ink-soft)" />}
        {eta !== null && <rect x={x(eta)} y={8} width={Math.max(2, x(s.install_hours))} height={12} fill="var(--khaki)" />}
        <line x1={x(s.deadline_hours)} x2={x(s.deadline_hours)} y1={2} y2={34} stroke="var(--pull)" strokeWidth={2} />
        <text x={0} y={34} fontFamily="var(--font-sans)" fontSize={11} fill="var(--ink-soft)">{eta === null ? "no open route" : `ETA ${eta.toFixed(0)} h + fit ${s.install_hours} h`}</text>
        <text x={Math.min(W - 4, x(s.deadline_hours) + 4)} y={50} fontFamily="var(--font-sans)" fontSize={11} fill="var(--ink)" textAnchor={x(s.deadline_hours) > W - 120 ? "end" : "start"}>
          earliest plausible failure {s.deadline_hours.toFixed(0)} h
        </text>
      </svg>
      <table className={d.srcTable}>
        <tbody>
          {s.sources.slice(0, 3).map((src) => (
            <tr key={`${src.node}-${src.mode}`}><td>{src.name}</td><td>{src.mode}</td><td>{src.eta_hours === null ? "closed" : `${src.eta_hours.toFixed(1)} h`}</td><td>qty {src.qty}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
