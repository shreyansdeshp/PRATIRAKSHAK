import { useEffect, useMemo, useState } from "react";

import { NumberTick, ProvenanceChip, StatusGlyph } from "../../components/primitives";
import { loadSnapshot } from "../../data/client";
import type { AircraftState, FleetState, Meta, Route, World } from "../../data/types";
import { ChartMap } from "../../map/ChartMap";
import { useApp } from "../../store/app";
import { useStory } from "../../story/story";
import h from "./Hero.module.css";

/** S0 — the fleet map comes alive (SPEC §11.9). Eight steps, all numbers from the snapshot. */
export const HERO_STEPS = 8;
const STEP_AT_MS = [0, 600, 2600, 4800, 7200, 10800, 14600, 18400];
const CAMERA = { center: [80.4, 22.3] as [number, number], zoom: 4.5 };

interface Geo { id: string; coords: [number, number][]; mode: "road" | "air" }

export function Hero() {
  const story = useStory();
  const navigate = useApp((st) => st.navigate);
  const params = new URLSearchParams(window.location.search);
  const fixed = params.has("step") ? Math.min(HERO_STEPS - 1, Math.max(0, Number(params.get("step")))) : null;
  const [auto, setAuto] = useState(fixed ?? 0);
  const step = story.active ? story.heroStep : fixed ?? auto;
  const still = fixed !== null || story.active;

  const [data, setData] = useState<{ world: World; state: FleetState; meta: Meta; geos: Geo[] } | null>(null);
  useEffect(() => {
    (async () => {
      const [world, state, meta] = await Promise.all([loadSnapshot<World>("world"), loadSnapshot<FleetState>("state"), loadSnapshot<Meta>("meta")]);
      const geos = await routeGeometry(world);
      setData({ world, state, meta, geos });
    })();
  }, []);

  // autoplay the 25-second opening (normal mode only)
  useEffect(() => {
    if (fixed !== null || story.active || !data) return;
    const timers = STEP_AT_MS.map((t, i) => setTimeout(() => setAuto(i), t));
    return () => timers.forEach(clearTimeout);
  }, [data, fixed, story.active]);

  // the Himshikhar tail whose 06:00Z data arrives last (a real WATCH aircraft there)
  const pending = useMemo<AircraftState | null>(() => {
    if (!data) return null;
    return [...data.state.aircraft].filter((a) => a.base === "HIM" && a.status === "WATCH")
      .sort((a, b) => b.risk_window - a.risk_window)[0] ?? null;
  }, [data]);

  if (!data) return <div className={h.loading} />;
  const { world, state, meta, geos } = data;
  const counts = (baseId: string) => {
    const r = state.summary.by_base[baseId]!;
    const awaiting = step < 6 && pending && pending.base === baseId ? 1 : 0;
    return { ...r, watch: r.watch - awaiting, awaiting };
  };
  const fleet = state.summary.fleet;
  const fleetAwaiting = step < 6 && pending ? 1 : 0;

  return (
    <div className={`${h.sheet} ${still ? h.still : ""}`} data-testid="hero" data-step={step}>

      {/* ---------------------------------------------------------------- map sheet */}
      <div className={h.mapSheet}>
        <div className={`${h.mapFade} ${step >= 1 ? h.on : ""}`}>
          <ChartMap camera={CAMERA} width={1380} height={984} interactive={!still}
            overlay={(project) => (
              <>
                <svg className={h.arcs} width={1380} height={984} aria-hidden>
                  {geos.map((g, i) => {
                    const d = g.coords.map((c, j) => { const [x, y] = project(c); return `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join("");
                    return <path key={g.id} d={d} pathLength={1} className={`${h.arc} ${g.mode === "air" ? h.air : h.road} ${step >= 4 ? h.drawn : ""}`}
                                 style={{ transitionDelay: still ? "0ms" : `${i * 120}ms` }} />;
                  })}
                </svg>
                {world.nodes.filter((n) => n.kind !== "base").map((n) => {
                  const [x, y] = project([n.lon, n.lat]);
                  return (
                    <div key={n.id} className={`${h.node} ${step >= 4 ? h.on : ""} ${/godavari/i.test(n.name) ? h.nodeBelow : ""}`} style={{ left: x, top: y }}>
                      <span className={n.kind === "vendor_hub" ? h.vendor : h.depot} />
                      <span className={h.nodeLabel}>{n.name.replace(" Logistics", "")}</span>
                    </div>
                  );
                })}
                {world.bases.map((b, i) => {
                  const [x, y] = project([b.lon, b.lat]);
                  const c = counts(b.id);
                  const changed = step >= 6 && pending?.base === b.id;
                  return (
                    <div key={b.id} className={`${h.base} ${step >= 2 ? h.dropped : ""}`} onClick={() => navigate(`/base/${b.id}`)} title={`Open ${b.name}`} style={{ left: x, top: y, transitionDelay: still ? "0ms" : `${i * 180}ms` }}>
                      {step === 2 && !still && <span className={h.ripple} style={{ animationDelay: `${i * 180}ms` }} />}
                      {changed && !still && <span key="chg" className={`${h.ripple} ${h.rippleWatch}`} />}
                      <BaseRing ready={c.ready} watch={c.watch} pull={c.pull} awaiting={c.awaiting} show={step >= 5} />
                      <div className={h.baseLabel}>
                        <span className={h.baseName}>{b.name.replace(" Air Base", "")}</span>
                        <span className={h.baseMeta}>{b.region.toUpperCase()} · {Math.round(b.elevation_m)} M</span>
                        <span className={`${h.baseCount} ${step >= 3 ? h.on : ""}`}>
                          {step >= 3 ? <NumberTick value={c.aircraft} duration={still ? 0 : 1100} delay={still ? 0 : i * 150} /> : 0} aircraft
                        </span>
                        <span className={`${h.baseStatus} ${step >= 5 ? h.on : ""}`}>
                          <StatusGlyph status="READY" size={9} />{c.ready}
                          <StatusGlyph status="WATCH" size={9} />{c.watch}
                          <StatusGlyph status="PULL" size={9} />{c.pull}
                          {c.awaiting > 0 && <><StatusGlyph status="STALE" size={9} />{c.awaiting}</>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )} />
        </div>
        <div className={h.edition}>
          SHEET 00 · INDIA · FLEET READINESS · EDITION {meta.snapshot} · SEED {meta.seed} · DEMO RUN {meta.demo_seed}
        </div>
      </div>

      {/* ---------------------------------------------------------------- marginalia */}
      <aside className={h.margin}>
        <div className={`${h.lockup} ${h.lockupOn}`}>
          <span className={h.kicker}>SIH26249 · AIR POWER — PREDICTIVE MAINTENANCE &amp; FLEET AVAILABILITY</span>
          <h1 className={h.wordmark}>Pratirakshak</h1>
          <p className={h.motto}>Predict. Prepare. Protect.</p>
        </div>
        <div className={h.preTitle} style={{ display: "none" }}>
          <span className={h.kicker}>SHEET 00</span>
          <span className={h.preTitleText}>Fleet readiness</span>
          <span className={h.snapshotLine}>Snapshot {meta.snapshot}</span>
        </div>

        <div className={`${h.totals} ${step >= 3 ? h.on : ""}`}>
          <div className={h.totalRow}><span>Aircraft</span><b>{step >= 3 ? <NumberTick value={fleet.aircraft} duration={still ? 0 : 1200} /> : "—"}</b></div>
          <div className={h.totalRow}><span>Bases</span><b>{world.bases.length}</b></div>
          <div className={`${h.totalRow} ${step >= 5 ? "" : h.dim}`}><span><StatusGlyph status="READY" label /></span><b>{step >= 5 ? fleet.ready : "—"}</b></div>
          <div className={`${h.totalRow} ${step >= 5 ? "" : h.dim}`}><span><StatusGlyph status="WATCH" label /></span><b>{step >= 5 ? fleet.watch - fleetAwaiting : "—"}</b></div>
          <div className={`${h.totalRow} ${step >= 5 ? "" : h.dim}`}><span><StatusGlyph status="PULL" label /></span><b>{step >= 5 ? fleet.pull : "—"}</b></div>
          {fleetAwaiting > 0 && step >= 5 && <div className={h.totalRow}><span><StatusGlyph status="STALE" label /></span><b>1</b></div>}
          <div className={h.totalRow}><span>Average health</span><b>{step >= 5 ? Math.round(fleet.avg_health) : "—"}</b></div>
        </div>

        <div className={`${h.dataAge} ${step >= 5 ? h.on : ""}`}>
          {step >= 6 && pending ? (
            <>
              <span className={h.dataAgeHead}>06:00Z · Himshikhar link received</span>
              <span>{pending.tail} → <StatusGlyph status="WATCH" size={10} label /> limited by {pending.limiting_system.replace("_", " ")}{" "}
                ({Math.round(pending.limiting_p * 100)} % risk in {state.window_days} d)</span>
            </>
          ) : (
            <>
              <span className={h.dataAgeHead}>Awaiting 06:00Z snapshot · Himshikhar</span>
              <span>High-altitude link · last data D−1 18:00Z</span>
            </>
          )}
        </div>

        {!story.active && (
          <div className={h.enter}>
            <button type="button" onClick={() => navigate("/fleet")}>Open the fleet board →</button>
            <span>or click a base · sheet index on every page · <a href="/?mode=story">guided story</a></span>
          </div>
        )}

        <div className={h.legend}>
          <span className={h.legendHead}>LEGEND</span>
          <span><span className={h.lgAirfield} /> Air base (ring = readiness share)</span>
          <span><span className={h.depot} /> Logistics depot</span>
          <span><span className={h.vendor} /> Vendor hub</span>
          <span><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--ink-soft)" strokeWidth="1.4" strokeDasharray="5 4" /></svg> Airlift (Vahak)</span>
          <span><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--khaki)" strokeWidth="2" /></svg> Road (OSM routing)</span>
        </div>

        <div className={h.prov}>
          <span>Engines <ProvenanceChip kind="REAL" /></span>
          <span>Other systems <ProvenanceChip kind="SIMULATED" /></span>
          <span>Climate, roads <ProvenanceChip kind="REAL-ANCHORED" /></span>
          <span>Bases, tails <ProvenanceChip kind="ILLUSTRATIVE" /></span>
        </div>
      </aside>
    </div>
  );
}

/** Airfield symbol inside a readiness ring (share of ready / watch / pull / awaiting, 2 px paper gaps). */
function BaseRing({ ready, watch, pull, awaiting, show }: { ready: number; watch: number; pull: number; awaiting: number; show: boolean }) {
  const total = ready + watch + pull + awaiting;
  const R = 26, r = 19;
  const segs = [
    { n: ready, fill: "var(--ready)" }, { n: watch, fill: "var(--watch)" }, { n: pull, fill: "var(--pull)" }, { n: awaiting, fill: "url(#hatch-stale)" },
  ].filter((s) => s.n > 0);
  let a0 = -Math.PI / 2;
  const gap = 0.07;
  return (
    <svg className={h.ring} width={64} height={64} viewBox="-32 -32 64 64" aria-hidden>
      <circle r={R + 0.5} fill="var(--paper-hi)" stroke="var(--fold)" />
      {show && segs.map((sg, i) => {
        const a1 = a0 + (sg.n / total) * Math.PI * 2;
        const s0 = a0 + gap / 2, s1 = a1 - gap / 2;
        a0 = a1;
        const large = s1 - s0 > Math.PI ? 1 : 0;
        const p = (rad: number, ang: number) => `${(rad * Math.cos(ang)).toFixed(2)},${(rad * Math.sin(ang)).toFixed(2)}`;
        return <path key={i} className={h.seg} fill={sg.fill} stroke={sg.fill.startsWith("url") ? "var(--stale)" : "none"}
                     d={`M${p(R, s0)} A${R},${R} 0 ${large} 1 ${p(R, s1)} L${p(r, s1)} A${r},${r} 0 ${large} 0 ${p(r, s0)} Z`} />;
      })}
      {/* airfield symbol: circle + runway */}
      <circle r={11} fill="var(--paper-hi)" stroke="var(--ink)" strokeWidth={2} />
      <rect x={-2} y={-9} width={4} height={18} fill="var(--ink)" transform="rotate(35)" />
    </svg>
  );
}

async function routeGeometry(world: World): Promise<Geo[]> {
  const air = await fetch(`${import.meta.env.BASE_URL ?? "/"}data/routes/air.geojson`).then((r) => r.json());
  const bases = new Set(world.bases.map((b) => b.id));
  const out: Geo[] = [];
  for (const f of air.features as { properties: { from: string; to: string; id: string }; geometry: { coordinates: [number, number][] } }[]) {
    if (bases.has(f.properties.from) && bases.has(f.properties.to)) out.push({ id: f.properties.id, coords: f.geometry.coordinates, mode: "air" });
  }
  // each base → its fastest non-base source by road (cached OSRM geometry)
  for (const b of world.bases) {
    const roads = world.routes.filter((r: Route) => r.mode === "road" && r.geometry && (r.from_node === b.id || r.to_node === b.id))
      .filter((r) => { const other = r.from_node === b.id ? r.to_node : r.from_node; return !bases.has(other); })
      .sort((a, z) => a.minutes - z.minutes);
    const best = roads[0];
    if (best?.geometry) {
      const g = await fetch(`${import.meta.env.BASE_URL ?? "/"}${best.geometry}`).then((r) => r.json());
      out.push({ id: best.id, coords: g.geometry.coordinates, mode: "road" });
    }
  }
  return out;
}
