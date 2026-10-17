import { useEffect, useState } from "react";

import { TimelineStrips } from "../../charts/kit";
import { CornerTag, FlightStrip, HealthBar, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile, StatusGlyph } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { FleetState, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { ChartMap } from "../../map/ChartMap";
import { useApp } from "../../store/app";
import v from "./BaseView.module.css";

const SYS: Record<string, string> = { engines: "Engines", hydraulics: "Hydraulics", landing_gear: "Landing gear", flight_controls: "Flight controls",
  electrical: "Electrical", avionics: "Avionics", fuel: "Fuel", structure: "Structure" };
const ORDER = { PULL: 0, WATCH: 1, READY: 2 } as const;
const STRESS = [["heat", "Heat"], ["cold", "Cold"], ["humidity", "Humidity"], ["wet", "Monsoon rain"], ["dust", "Dust"], ["salinity", "Salt air"], ["altitude", "Altitude"]] as const;

interface PlanVisit { id: string; tail: string; base: string; start: number | null; end: number | null; bay: number | null; pulled: boolean; tasks: { system: string; lru: string }[] }

/** S2 — base view: local chart, headline numbers, every tail as a flight strip, garage slots, spares on hand, environment. */
export function BaseView({ id }: { id: string }) {
  const { data } = useSnapshots<{ world: World & { stock: { node: string; lru: string; qty: number }[] }; state: FleetState; plan: { visits: PlanVisit[]; capacity: Record<string, { bays: number }> } }>(["world", "state", "plan"]);
  const navigate = useApp((s) => s.navigate);
  const [roads, setRoads] = useState<{ id: string; coords: [number, number][]; to: string }[]>([]);
  const base = data?.world.bases.find((b) => b.id === id) ?? data?.world.bases[0];

  useEffect(() => {
    if (!data || !base) return;
    const nodes = new Set(data.world.nodes.filter((n) => n.kind !== "base").map((n) => n.id));
    const rs = data.world.routes.filter((r) => r.mode === "road" && r.geometry && (r.from_node === base.id || r.to_node === base.id))
      .filter((r) => nodes.has(r.from_node === base.id ? r.to_node : r.from_node)).sort((a, b) => a.minutes - b.minutes).slice(0, 2);
    Promise.all(rs.map((r) => fetch(`/${r.geometry}`).then((x) => x.json()).then((g) => ({ id: r.id, coords: g.geometry.coordinates, to: r.from_node === base.id ? r.to_node : r.from_node }))))
      .then(setRoads).catch(() => setRoads([]));
  }, [data, base]);

  if (!data || !base) return <div className={v.loading} />;
  const { world, state, plan } = data;
  const all = state.aircraft.filter((a) => a.base === base.id)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.weighted_health - b.weighted_health);
  // show 10 varied rows: worst of each aircraft type, then one per distinct next action, then the rest by priority
  const picked: typeof all = [];
  const take = (a?: (typeof all)[number]) => { if (a && !picked.includes(a) && picked.length < 10) picked.push(a); };
  new Set(all.map((a) => a.type)).forEach((ty) => take(all.find((a) => a.type === ty)));
  new Set(all.map((a) => a.action)).forEach((ac) => take(all.find((a) => a.action === ac)));
  all.forEach(take);
  const tails = picked.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.weighted_health - b.weighted_health);
  const r = state.summary.by_base[base.id]!;
  const typeName = Object.fromEntries(world.types.map((t) => [t.id, t.name]));
  const bays = plan.capacity[base.id]?.bays ?? 4;
  const visits = plan.visits.filter((x) => x.base === base.id && x.start !== null && x.start < 14);
  const stock = world.stock.filter((s) => s.node === base.id);
  const parts = Object.fromEntries(world.parts.map((p) => [p.lru, p]));
  const env = base.env_d0;

  return (
    <div className={v.sheet} data-testid="base">
      <RegistrationMarks />
      <SheetHeader sheet="02" title={base.name} subtitle={`${base.region} · ${Math.round(base.elevation_m)} m · ${base.character}`}
        right={<SheetIndex />} />
      <div className={v.switch}>
        {world.bases.map((b) => (
          <button key={b.id} type="button" className={b.id === base.id ? v.on : ""} onClick={() => navigate(`/base/${b.id}`)}>{b.name.replace(" Air Base", "")}</button>
        ))}
      </div>

      <div className={v.grid}>
        <section className={v.left}>
          <ChartMap key={base.id} camera={{ center: [base.lon, base.lat], zoom: 6.3 }} width={600} height={430} interactive={false}
            overlay={(project) => (
              <>
                <svg width={600} height={430} className={v.roads} aria-hidden>
                  {roads.map((rd) => (
                    <path key={rd.id} d={rd.coords.map((c, i) => { const [x, y] = project(c); return `${i ? "L" : "M"}${x},${y}`; }).join("")}
                          fill="none" stroke="var(--khaki)" strokeWidth={3} strokeLinecap="round" />
                  ))}
                </svg>
                {(() => { const [x, y] = project([base.lon, base.lat]); return (
                  <div className={v.airfield} style={{ left: x, top: y }}>
                    <svg width={44} height={44} viewBox="-22 -22 44 44" aria-hidden>
                      <circle r={17} fill="var(--paper-hi)" stroke="var(--ink)" strokeWidth={2.5} />
                      <rect x={-3} y={-15} width={6} height={30} fill="var(--ink)" transform="rotate(35)" />
                      <rect x={-2} y={-10} width={4} height={20} fill="var(--ink)" transform="rotate(-55)" />
                    </svg>
                    <span>{base.name.replace(" Air Base", "")}</span>
                  </div>
                ); })()}
                {roads.map((rd) => { const n = world.nodes.find((x) => x.id === rd.to)!; const [x, y] = project([n.lon, n.lat]); return (
                  <div key={rd.id} className={v.node} style={{ left: x, top: y }}><i />{n.name}</div>
                ); })}
              </>
            )} />
          <div className={v.env}>
            <div className={v.envHead}>
              <span>Environment today</span>
              <span className={v.chips}><ProvenanceChip kind="REAL-ANCHORED" /></span>
            </div>
            <div className={v.envNums}>
              <span><b>{env.t_max_c!.toFixed(0)}°</b> max</span><span><b>{env.t_min_c!.toFixed(0)}°</b> min</span>
              <span><b>{env.rh_pct!.toFixed(0)} %</b> humidity</span><span><b>{env.precip_mm!.toFixed(1)}</b> mm rain</span>
            </div>
            {STRESS.map(([k, label]) => (
              <div key={k} className={v.stress}>
                <span>{label}</span>
                <span className={v.stressBar}><span style={{ width: `${Math.min(1, env[k] ?? 0) * 100}%` }} /></span>
                <span className={v.stressN}>{(env[k] ?? 0).toFixed(2)}</span>
              </div>
            ))}
            <p className={v.envNote}>Stress index 0–1 drives wear in the simulator. Climate: Open-Meteo / ERA5 normals. Dust and salt indices are illustrative <ProvenanceChip kind="ILLUSTRATIVE" /></p>
          </div>
        </section>

        <section className={v.mid}>
          <div className={v.tiles}>
            <StatTile label="Aircraft" value={r.aircraft} accent />
            <StatTile label="Average health" value={Math.round(r.avg_health)} />
            <StatTile label="Ready" value={<span className={v.glyphNum}><StatusGlyph status="READY" size={16} />{r.ready}</span>} />
            <StatTile label="Watch" value={<span className={v.glyphNum}><StatusGlyph status="WATCH" size={16} />{r.watch}</span>} />
            <StatTile label="Pull" value={<span className={v.glyphNum}><StatusGlyph status="PULL" size={16} />{r.pull}</span>} />
          </div>
          <div className={v.strips}>
            {tails.map((a) => (
              <FlightStrip key={a.tail} compact status={a.status} callsign={a.tail} sub={typeName[a.type]} onClick={() => navigate(`/aircraft/${a.tail}`)}
                fields={[
                  { label: "Health", value: <HealthBar value={a.weighted_health} width={64} />, width: 120 },
                  { label: "Limited by", value: SYS[a.limiting_system], width: 132 },
                  { label: "Risk", value: `${Math.round(a.limiting_p * 100)} %`, width: 70 },
                  { label: "Next action", value: a.action.replace(/_/g, " ").toLowerCase() },
                ]} />
            ))}
          </div>
        </section>

        <section className={v.right}>
          <h2 className={v.h2}>Planned garage work</h2>
          <p className={v.small}>Next 14 days · {bays} bays · each bar is an aircraft being worked on · ▣ = already pulled from flying</p>
          <TimelineStrips days={14} width={400} labelWidth={58} rowHeight={34} dayLabel={(d) => (d === 0 ? "Today" : `${d}`)}
            rows={Array.from({ length: bays }, (_, bay) => ({
              label: `Bay ${bay + 1}`,
              blocks: visits.filter((x) => x.bay === bay).map((x) => ({ start: x.start!, end: Math.min(14, x.end!), kind: "planned" as const, label: `${x.tail} · ${x.tasks.map((t) => t.lru).join(", ")}` })),
            }))} />
          <ul className={v.visitList}>
            {[...visits].sort((a, b) => a.start! - b.start!).slice(0, 6).map((x) => (
              <li key={x.id}><span className={v.mono}>{x.start === 0 ? "Today" : `Day ${x.start}`}</span> <b>{x.tail}</b> {x.pulled ? "▣" : ""} <em>{x.tasks.map((t) => SYS[t.system]).join(" + ")}</em></li>
            ))}
            {visits.length === 0 && <li>No garage work planned in the next 14 days.</li>}
          </ul>
          <h2 className={v.h2}>Spares at this base</h2>
          <div className={v.stock}>
            {stock.filter((s) => s.qty > 0).sort((a, b) => b.qty - a.qty).map((s) => (
              <span key={s.lru} className={v.part} title={parts[s.lru]?.name}><b>{s.qty}</b>{s.lru}</span>
            ))}
          </div>
          <p className={v.small}>Out of stock: {stock.filter((s) => s.qty === 0).length} part types</p>
          <p className={v.small}>Stock levels are illustrative</p>
        </section>
      </div>
      <CornerTag />
    </div>
  );
}
