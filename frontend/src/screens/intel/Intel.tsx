import { useMemo, useState } from "react";

import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { Provenance } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useBeatParams } from "../../story/story";
import s from "./Intel.module.css";

interface Node { id: string; kind: "sensor" | "part" | "lru" | "action"; system?: string; label: string; name?: string; unit?: string; importance?: number; provenance?: Provenance; support?: string }
interface Harness { episodes: number; detection_rate: number; by_type: Record<string, { episodes: number; detection_rate: number }>; median_delay_steps?: number; median_delay_cycles?: number;
  false_alarm_rate_per_sensor_step: number; clean_sensor_steps: number }
interface Intelligence { graph: { nodes: Node[]; edges: { from: string; to: string }[]; note: string };
  trust_harness: { systems: Harness; engines: Harness };
  fleet_trust: { sensors: number; untrusted: number; flagged: { tail: string; group: string; sensor: string; trust: number; reasons: string }[] } }

const SYSTEMS = ["engines", "hydraulics", "landing_gear", "flight_controls", "electrical", "avionics", "fuel", "structure"];
const ACTION: Record<string, string> = { SCHEDULE_SERVICE: "Schedule service", EXPEDITE_SPARE: "Expedite spare", PULL_FROM_LINE: "Repair", VERIFY_SENSOR: "Verify sensor" };
const nice = (k: string) => k.replace(/_/g, " ");

/** S9 — what the model watches: sensor importance, sensor → part → LRU → action, and the sensor-trust harness. */
export function Intel() {
  const { data } = useSnapshots<{ intelligence: Intelligence }>(["intelligence"]);
  const beat = useBeatParams();
  const [sys, setSys] = useState<string>(beat.get("sys") ?? new URLSearchParams(window.location.search).get("sys") ?? "engines");
  const [hover, setHover] = useState<string | null>(null);
  if (!data) return <div className={s.loading} />;
  const intel = data.intelligence;
  const sensors = intel.graph.nodes.filter((n) => n.kind === "sensor" && n.system === sys).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  const top = sensors[0]!;

  return (
    <div className={s.sheet} data-testid="intel" data-system={sys}>
      <RegistrationMarks />
      <SheetHeader sheet="09" title="What the model watches" subtitle="Which sensors drive each prediction, what they point to, and when a sensor itself is not trusted"
        right={<SheetIndex />} />
      <div className={s.controls}>
        {SYSTEMS.map((k) => <button key={k} type="button" className={k === sys ? s.on : ""} onClick={() => { setSys(k); setHover(null); }}>{nice(k)}</button>)}
        <span className={s.chip}><ProvenanceChip kind={sys === "engines" ? "REAL" : sys === "hydraulics" ? "REAL-ANCHORED" : "SIMULATED"} /></span>
      </div>

      <div className={s.grid}>
        <section className={s.rank}>
          <div className={s.secHead}><span>Sensor importance · {nice(sys)}</span></div>
          <p className={s.small}>{sys === "engines"
            ? "Mean change in predicted remaining life when the sensor is reset to its healthy baseline, on NASA C-MAPSS engines. Share of the total."
            : "Share of the model's split gain taken by features built from each sensor (last value, mean, trend). Trained on simulated degradation."}</p>
          <ol className={s.bars}>
            {sensors.map((n) => (
              <li key={n.id} className={hover === n.id ? s.hot : ""} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                <span className={s.bLabel}>{n.name ?? n.label}</span>
                <span className={s.bTrack}><i style={{ width: `${((n.importance ?? 0) / (top.importance || 1)) * 100}%` }} /></span>
                <span className={s.bVal}>{((n.importance ?? 0) * 100).toFixed(1)} %</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.flow}>
          <div className={s.secHead}><span>From reading to action</span><span className={s.hint}>hover a sensor</span></div>
          <p className={s.caption} data-testid="path-caption">{pathCaption(intel, hover ?? top.id)}</p>
          <Flow intel={intel} sys={sys} hot={hover ?? top.id} onHover={setHover} />
        </section>

        <section className={s.trust}>
          <div className={s.secHead}><span>Can the sensor be trusted?</span></div>
          <p className={s.small}>Before any prediction, every reading is scored for missing data, physical range, stuck values, spikes and disagreement with sibling sensors. Faults were injected into held-out data to test it.</p>
          <HarnessBlock title="Engines (NASA C-MAPSS data, injected faults)" h={intel.trust_harness.engines} unit="cycles" prov="REAL" />
          <HarnessBlock title="Other systems (simulated)" h={intel.trust_harness.systems} unit="days" prov="SIMULATED" />
          <div className={s.secHead}><span>Today in the fleet</span></div>
          <p className={s.today}><b>{intel.fleet_trust.untrusted}</b> of {intel.fleet_trust.sensors.toLocaleString("en-IN")} sensors not trusted — their readings are left out and a “verify sensor” task is raised.</p>
          <table className={s.flagged}>
            <tbody>
              {intel.fleet_trust.flagged.slice(0, 7).map((f) => (
                <tr key={f.tail + f.sensor}><td className={s.tail}>{f.tail}</td><td>{nice(f.group)} · <code>{f.sensor}</code></td><td className={s.reason}>{f.reasons.split(";")[0]}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <CornerTag />
    </div>
  );
}

function HarnessBlock({ title, h, unit, prov }: { title: string; h: Harness; unit: string; prov: Provenance }) {
  const delay = h.median_delay_cycles ?? h.median_delay_steps ?? 0;
  return (
    <div className={s.harness}>
      <div className={s.hTitle}><span>{title}</span><ProvenanceChip kind={prov} /></div>
      <div className={s.hNums}>
        <span><b>{Math.round(h.detection_rate * 100)} %</b> of {h.episodes.toLocaleString("en-IN")} faults caught</span>
        <span><b>{delay}</b> {unit} median delay</span>
        <span><b>{(h.false_alarm_rate_per_sensor_step * 100).toFixed(1)} %</b> false alarms</span>
      </div>
      <div className={s.types}>
        {Object.entries(h.by_type).map(([k, v]) => (
          <span key={k} className={s.type}><em>{k}</em><span className={s.tTrack}><i style={{ width: `${v.detection_rate * 100}%` }} /></span><small>{Math.round(v.detection_rate * 100)} %</small></span>
        ))}
      </div>
    </div>
  );
}

const COLS = [0, 250, 470, 690];
const labelOf = (n: Node) => {
  const l = n.kind === "action" ? ACTION[n.label] ?? nice(n.label) : n.kind === "part" && n.system !== "engines" ? `${nice(n.label)} system` : n.kind === "sensor" ? n.name ?? n.label : n.label;
  return l.length > 30 ? `${l.slice(0, 29)}…` : l;
};
const textW = (l: string) => l.length * 6.4 + 12; // ~12px sans
const W = 860, H = 740;

function Flow({ intel, sys, hot, onHover }: { intel: Intelligence; sys: string; hot: string; onHover: (id: string | null) => void }) {
  const { nodes, edges, pos, lit, byId } = useMemo(() => {
    const g = intel.graph;
    const sensors = g.nodes.filter((n) => n.kind === "sensor" && n.system === sys).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 5);
    const sIds = new Set(sensors.map((n) => n.id));
    const parts = g.nodes.filter((n) => n.kind === "part" && g.edges.some((e) => sIds.has(e.from) && e.to === n.id));
    const pIds = new Set(parts.map((n) => n.id));
    const lrus = g.nodes.filter((n) => n.kind === "lru" && g.edges.some((e) => pIds.has(e.from) && e.to === n.id));
    const actions = g.nodes.filter((n) => n.kind === "action");
    const cols = [sensors, parts, lrus, actions];
    const pos = new Map<string, { x: number; y: number }>();
    const longest = Math.max(...cols.map((c) => c.length));
    const step = Math.min(52, (H - 50) / longest);
    cols.forEach((col, c) => {
      const y0 = 50 + (step * (longest - col.length)) / 2; // top-anchored, columns centred on the longest
      col.forEach((n, i) => pos.set(n.id, { x: COLS[c]!, y: y0 + i * step }));
    });
    const edges = g.edges.filter((e) => pos.has(e.from) && pos.has(e.to));
    // what lights up for the hovered sensor: everything reachable downstream
    const lit = new Set([hot]);
    for (let k = 0; k < 3; k++) for (const e of edges) if (lit.has(e.from)) lit.add(e.to);
    return { nodes: cols.flat(), edges, pos, lit, byId: new Map(g.nodes.map((n) => [n.id, n])) };
  }, [intel, sys, hot]);

  return (
    <svg width={W} height={H} className={s.flowSvg} role="img" aria-label={`Sensor to part to replaceable unit to action, ${sys}`}>
      {["SENSOR", "PART", "REPLACEABLE UNIT", "ACTION"].map((t, i) => <text key={t} x={COLS[i]} y={12} className={s.colHead}>{t}</text>)}
      {edges.map((e) => {
        const a = pos.get(e.from)!, b = pos.get(e.to)!, on = lit.has(e.from) && lit.has(e.to);
        if (e.from.startsWith("sensor") && e.to.startsWith("action") && !on) return null; // only the hovered sensor's direct "verify" link
        const x1 = a.x + textW(labelOf(byId.get(e.from)!)), mx = (x1 + b.x) / 2;
        return <path key={e.from + e.to} d={`M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x - 6},${b.y}`} className={on ? s.edgeOn : s.edge} />;
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!, on = lit.has(n.id);
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} className={on ? s.nodeOn : s.node}
            onMouseEnter={n.kind === "sensor" ? () => onHover(n.id) : undefined} onMouseLeave={n.kind === "sensor" ? () => onHover(null) : undefined}>
            <circle r={4} cx={-2} />
            <text x={6} y={4}>{labelOf(n)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function pathCaption(intel: Intelligence, id: string): string {
  const g = intel.graph, byId = new Map(g.nodes.map((n) => [n.id, n]));
  const sensor = byId.get(id);
  const part = byId.get(g.edges.find((e) => e.from === id && e.to.startsWith("part:"))?.to ?? "");
  const lru = byId.get(g.edges.find((e) => part && e.from === part.id && e.to.startsWith("lru:"))?.to ?? "");
  if (!sensor || !part || !lru) return "Hover a sensor to see where it leads.";
  const acts = g.edges.filter((e) => e.from === lru.id && e.to.startsWith("action:")).map((e) => (ACTION[byId.get(e.to)!.label] ?? "").toLowerCase()).filter(Boolean);
  return `Example: ${sensor.name ?? sensor.label} → ${nice(part.label)} → ${lru.label}. If it drifts, the options are: ${acts.join(", ")}.`;
}
