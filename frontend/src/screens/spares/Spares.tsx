import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader, StatusGlyph } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { Route, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { ChartMap } from "../../map/ChartMap";
import { useApp } from "../../store/app";
import p from "./Spares.module.css";

interface Source { node: string; name: string; kind: string; qty: number; mode: string; eta_hours: number | null; distance_km: number; route_id: string | null; note: string }
interface Spares { verdict: "SOURCE" | "PULL"; deadline_hours: number; install_hours: number; sources: Source[]; chosen: Source | null }
interface DecisionRow { tail: string; type: string; base: string; action: string; headline: { system: string; lru: string; lru_name: string; spares: Spares | null; cannibalise_from?: string[] | null } }
interface Profiles { routes: Record<string, { distance_km: number[]; elevation_m: number[]; max_m: number; max_at_km: number; length_km: number }> }
interface Leg { id: string; coords: [number, number][]; mode: "air" | "road"; role: "chosen" | "alt" | "road"; label: string; node: string; eta: number | null; closure?: Route["closure"] }

const fmtH = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")} min`;

/** S5 — spares & logistics: nearest sources with ETAs, navigation line, elevation profile, SOURCE vs PULL. */
export function Spares({ tail }: { tail: string }) {
  const { data } = useSnapshots<{ decisions: DecisionRow[]; world: World & { stock: { node: string; lru: string; qty: number }[] }; profiles: Profiles }>(["decisions", "world", "profiles"]);
  const navigate = useApp((s) => s.navigate);
  const still = new URLSearchParams(window.location.search).has("still");
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [map, setMap] = useState<MLMap | null>(null);

  const withSpares = useMemo(() => (data?.decisions ?? []).filter((x) => x.headline.spares?.chosen && x.headline.spares.chosen.mode !== "local"), [data]);
  const row = data ? (data.decisions.find((x) => x.tail === tail && x.headline.spares?.chosen) ?? withSpares[0]) : undefined;

  // resolve route geometries: chosen + alternatives (air great circles / cached OSRM roads) + fastest open road
  useEffect(() => {
    if (!data || !row?.headline.spares) return;
    const sp = row.headline.spares;
    const routeById = Object.fromEntries(data.world.routes.map((r) => [r.id, r]));
    // cached routes are stored in either direction; always draw (and animate) source → destination
    const orient = (c: [number, number][], node: string) => {
      const n = data.world.nodes.find((x) => x.id === node)!;
      const dist = (q: [number, number]) => (q[0] - n.lon) ** 2 + (q[1] - n.lat) ** 2;
      return dist(c[0]!) <= dist(c[c.length - 1]!) ? c : [...c].reverse();
    };
    (async () => {
      const air = await fetch("/data/routes/air.geojson").then((r) => r.json());
      const airCoords = (id: string) => air.features.find((f: { properties: { id: string } }) => f.properties.id === id)?.geometry.coordinates as [number, number][] | undefined;
      const roadCoords = async (r: Route) => r.geometry ? (await fetch(`/${r.geometry}`).then((x) => x.json())).geometry.coordinates as [number, number][] : undefined;
      const out: Leg[] = [];
      for (const [i, s] of sp.sources.slice(0, 3).entries()) {
        if (!s.route_id) continue;
        const r = routeById[s.route_id];
        const coords = s.mode === "air" ? airCoords(s.route_id) : r ? await roadCoords(r) : undefined;
        if (coords) out.push({ id: s.route_id, coords: orient(coords, s.node), mode: s.mode as "air" | "road", role: i === 0 ? "chosen" : "alt", label: s.name, node: s.node, eta: s.eta_hours });
      }
      if (!sp.sources.some((s) => s.mode === "road" && s.eta_hours !== null)) {
        const holders = new Set(data.world.stock.filter((x) => x.lru === row.headline.lru && x.qty > 0).map((x) => x.node));
        const road = data.world.routes.filter((r) => r.mode === "road" && r.geometry && (r.from_node === row.base || r.to_node === row.base))
          .filter((r) => holders.has(r.from_node === row.base ? r.to_node : r.from_node)).sort((a, b) => a.minutes - b.minutes)[0];
        if (road) {
          const coords = await roadCoords(road);
          const other = road.from_node === row.base ? road.to_node : road.from_node;
          if (coords) out.push({ id: road.id, coords: orient(coords, other), mode: "road", role: "road", label: data.world.nodes.find((n) => n.id === other)!.name, node: other, eta: road.minutes / 60, closure: road.closure });
        }
      }
      setLegs(out);
    })();
  }, [data, row]);

  // fit the camera to all legs; tilt over high terrain
  useEffect(() => {
    if (!map || !legs?.length) return;
    // frame the chosen route + the road comparison; far-away alternatives may run off the sheet
    const framed = legs.filter((l) => l.role !== "alt");
    const all = (framed.length ? framed : legs).flatMap((l) => l.coords);
    const lons = all.map((c) => c[0]), lats = all.map((c) => c[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: { top: 110, bottom: 90, left: 140, right: 300 }, duration: 0, pitch: row?.base === "HIM" ? 40 : 0, bearing: row?.base === "HIM" ? -14 : 0, maxZoom: 7.6 });
  }, [map, legs, row]);

  if (!data || !row?.headline.spares) return <div className={p.loading} />;
  const { world, profiles } = data;
  const sp = row.headline.spares;
  const dest = world.nodes.find((n) => n.id === row.base)!;
  const chosenLeg = legs?.find((l) => l.role === "chosen");
  const profileLeg = legs?.find((l) => l.mode === "road");
  const profile = profileLeg ? profiles.routes[profileLeg.id] : undefined;
  const vendor = world.nodes.find((n) => n.kind === "vendor_hub")!;
  const eta = sp.chosen?.eta_hours ?? null;
  const arrive = eta !== null ? new Date(Date.UTC(2026, 5, 1, 6, 0) + eta * 3600e3) : null;
  const slack = eta !== null ? sp.deadline_hours - eta - sp.install_hours : null;

  return (
    <div className={p.sheet} data-testid="spares" data-tail={row.tail}>
      <RegistrationMarks />
      <SheetHeader sheet="05" title={`Spares for ${row.tail} · ${row.headline.lru}`}
        subtitle={`${row.headline.lru_name} → ${dest.name} · nearest sources by road (cached OSM routing) or Vahak airlift`} right={<SheetIndex />} />

      <div className={p.grid}>
        <section className={p.mapCol}>
          <ChartMap key={row.tail} camera={{ center: [dest.lon, dest.lat], zoom: 5 }} width={1180} height={640} terrain interactive={false} onReady={(m) => setMap(m)}
            overlay={(project) => (
              <>
                <svg className={p.routes} width={1180} height={640} aria-hidden>
                  {(legs ?? []).map((l) => {
                    const d = l.coords.map((c, i) => { const [x, y] = project(c); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join("");
                    return <path key={l.id} d={d} className={`${p.leg} ${p[l.role]} ${l.mode === "air" ? p.airLeg : p.roadLeg}`} pathLength={1} />;
                  })}
                </svg>
                {chosenLeg && <Vehicle coords={chosenLeg.coords} project={project} still={still} />}
                {Object.values((legs ?? []).reduce<Record<string, Leg[]>>((acc, l) => { (acc[l.label] ??= []).push(l); return acc; }, {})).map((group) => {
                  const l = group[0]!;
                  const n = world.nodes.find((x) => x.id === l.node)!; const [x, y] = project([n.lon, n.lat]);
                  if (x < -50 || x > 1230 || y < -20 || y > 660) return null;
                  const chosen = group.some((g) => g.role === "chosen");
                  return <div key={`n-${l.label}`} className={`${p.src} ${chosen ? p.srcChosen : ""}`} style={{ left: x, top: y }}>
                    <i />{l.label}<em>{group.map((g) => (g.eta !== null ? `${g.eta.toFixed(1)} h ${g.mode}` : `${g.mode} closed`)).join(" · ")}</em></div>;
                })}
                {(() => { const [x, y] = project([vendor.lon, vendor.lat]); return x > 0 && x < 1180 && y > 0 && y < 640 ? <div className={p.vendor} style={{ left: x, top: y }}><i />{vendor.name}</div> : null; })()}
                {(() => { const [x, y] = project([dest.lon, dest.lat]); return (
                  <div className={p.dest} style={{ left: x, top: y }}>
                    <span className={p.destPin} />
                    {eta !== null && arrive && <span className={p.etaChip} data-testid="eta-chip"><b>ETA {fmtH(eta)}</b>arrives D+0 {String(arrive.getUTCHours()).padStart(2, "0")}:{String(arrive.getUTCMinutes()).padStart(2, "0")}Z · {dest.name.replace(" Air Base", "")}</span>}
                  </div>
                ); })()}
              </>
            )} />
          {profile && profileLeg && <ElevationStrip profile={profile} leg={profileLeg} />}
        </section>

        <aside className={p.side}>
          <div className={`${p.verdict} ${sp.verdict === "SOURCE" ? p.source : p.pull}`} data-testid="verdict">
            <span className={p.verdictWord}>{sp.verdict}</span>
            <span>{sp.verdict === "SOURCE"
              ? `The ${row.headline.lru} arrives and is fitted ${slack !== null ? fmtH(Math.max(0, slack)) : ""} before the earliest plausible failure.`
              : `No source can deliver and fit it before the earliest plausible failure (${sp.deadline_hours.toFixed(0)} h): pull the aircraft.`}</span>
          </div>
          <div className={p.timing}>
            <div><span>Earliest plausible failure</span><b>{sp.deadline_hours.toFixed(0)} h</b></div>
            <div><span>Fastest delivery</span><b>{eta !== null ? fmtH(eta) : "—"}</b></div>
            <div><span>Fitting time</span><b>{sp.install_hours} h</b></div>
          </div>
          <h2 className={p.h2}>Nearest sources</h2>
          <table className={p.table}>
            <thead><tr><th>Source</th><th>Mode</th><th>ETA</th><th>Qty</th></tr></thead>
            <tbody>
              {sp.sources.map((s) => (
                <tr key={`${s.node}-${s.mode}`} className={s === sp.sources[0] ? p.best : ""}>
                  <td>{s.name}<em>{s.note}</em></td><td>{s.mode}</td><td>{s.eta_hours === null ? "closed" : `${s.eta_hours.toFixed(1)} h`}</td><td>{s.qty}</td>
                </tr>
              ))}
              {profileLeg && profileLeg.role === "road" && (
                <tr><td>{profileLeg.label}<em>road alternative{profileLeg.closure ? ` · closed ${profileLeg.closure.start_mmdd}→${profileLeg.closure.end_mmdd}` : ""}</em></td><td>road</td><td>{profileLeg.eta?.toFixed(1)} h</td><td>—</td></tr>
              )}
            </tbody>
          </table>
          {row.headline.cannibalise_from && <p className={p.note}>Cannibalisation option: {row.headline.cannibalise_from[0]} (already grounded), flagged for engineering approval.</p>}
          <div className={p.legend}>
            <span><svg width="30" height="8"><line x1="0" y1="4" x2="30" y2="4" stroke="var(--series-p3)" strokeWidth="3" strokeDasharray="7 5" /></svg> Chosen route</span>
            <span><svg width="30" height="8"><line x1="0" y1="4" x2="30" y2="4" stroke="var(--ink-soft)" strokeWidth="1.5" strokeDasharray="5 4" /></svg> Alternative airlift</span>
            <span><svg width="30" height="8"><line x1="0" y1="4" x2="30" y2="4" stroke="var(--khaki)" strokeWidth="3" /></svg> Road (OSM routing)</span>
          </div>
          <div className={p.chips}><span>Routes, terrain <ProvenanceChip kind="REAL-ANCHORED" /></span><span>Stock, times <ProvenanceChip kind="ILLUSTRATIVE" /></span></div>
          <h2 className={p.h2}>Other spares in motion</h2>
          <div className={p.others}>
            {withSpares.map((x) => (
              <button key={x.tail} type="button" className={x.tail === row.tail ? p.on : ""} onClick={() => navigate(`/spares/${x.tail}`)}>
                <StatusGlyph status={x.headline.spares!.verdict === "SOURCE" ? "WATCH" : "PULL"} size={9} />{x.tail} · {x.headline.lru}
              </button>
            ))}
          </div>
        </aside>
      </div>
      <CornerTag />
    </div>
  );
}

/** Vehicle marker travelling along the chosen route (10 s loop; fixed at 62 % for stills / reduced motion). */
function Vehicle({ coords, project, still }: { coords: [number, number][]; project: (ll: [number, number]) => [number, number]; still: boolean }) {
  const [t, setT] = useState(0.62);
  const raf = useRef(0);
  useEffect(() => {
    if (still || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    const loop = (now: number) => { setT((Math.max(0, now - t0) / 10000) % 1); /* rAF time can precede t0 */ raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [still]);
  if (coords.length < 2) return null;
  const seg = Math.max(0, Math.min(coords.length - 2, Math.floor(t * (coords.length - 1))));
  const f = t * (coords.length - 1) - seg;
  const a = coords[seg]!, b = coords[seg + 1]!;
  const [x, y] = project([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
  return <span className={p.vehicle} style={{ left: x, top: y }} aria-label="consignment in transit" />;
}

function ElevationStrip({ profile, leg }: { profile: Profiles["routes"][string]; leg: Leg }) {
  const W = 1180, H = 150, m = { l: 56, r: 16, t: 22, b: 24 };
  const maxE = Math.max(1000, Math.ceil(profile.max_m / 1000) * 1000);
  const x = (km: number) => m.l + (km / profile.length_km) * (W - m.l - m.r);
  const y = (e: number) => H - m.b - (e / maxE) * (H - m.t - m.b);
  const pts = profile.distance_km.map((d, i) => `${x(d).toFixed(1)},${y(profile.elevation_m[i]!).toFixed(1)}`);
  return (
    <div className={p.profile} data-testid="elevation-profile">
      <svg width={W} height={H} aria-label={`elevation profile, highest point ${profile.max_m} m`}>
        {[0, maxE / 2, maxE].map((e) => (
          <g key={e}><line x1={m.l} x2={W - m.r} y1={y(e)} y2={y(e)} stroke="var(--grid)" /><text x={m.l - 6} y={y(e)} dy="0.32em" textAnchor="end" className={p.tick}>{e.toLocaleString("en-IN")} m</text></g>
        ))}
        <path d={`M${x(0)},${y(0)} L${pts.join(" L")} L${x(profile.length_km)},${y(0)} Z`} fill="var(--khaki)" opacity={0.35} />
        <path d={`M${pts.join(" L")}`} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        <line x1={x(profile.max_at_km)} x2={x(profile.max_at_km)} y1={y(profile.max_m)} y2={m.t - 6} stroke="var(--ink)" />
        <text x={x(profile.max_at_km) + 6} y={m.t - 8} className={p.peak}>highest point {profile.max_m.toLocaleString("en-IN")} m at km {profile.max_at_km.toFixed(0)}</text>
        <text x={m.l} y={H - 6} className={p.tick}>0 km</text>
        <text x={W - m.r} y={H - 6} textAnchor="end" className={p.tick}>{profile.length_km.toFixed(0)} km · {leg.label} → destination by road{leg.closure ? ` · closed ${leg.closure.start_mmdd} → ${leg.closure.end_mmdd} (${leg.closure.reason})` : ""}</text>
      </svg>
    </div>
  );
}
