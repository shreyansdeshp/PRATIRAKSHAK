import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { CornerTag, FlightStrip, HealthBar, ProvenanceChip, RegistrationMarks, SheetHeader, StatusGlyph, type StatusLike } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { AircraftState, FleetState, SystemState, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useApp } from "../../store/app";
import { useBeatParams, useStory } from "../../story/story";
import { Airframe, hotspots, type SystemKey, type TypeId } from "../../three/airframes";
import s from "./Showroom.module.css";

const SYS: Record<SystemKey, string> = { engines: "Engines", hydraulics: "Hydraulics", landing_gear: "Gear & brakes", flight_controls: "Flight controls",
  electrical: "Electrical", avionics: "Avionics", fuel: "Fuel", structure: "Structure" };
const PRESETS: Record<string, [number, number, number]> = { "Front ¾": [6.2, 2.4, 6.6], Side: [0.01, 1.0, 9.6], Top: [0.01, 10.5, 0.02], Under: [2.0, -6.0, 4.0] };
const sysStatus = (p: number): StatusLike => (p >= 0.3 ? "PULL" : p >= 0.1 ? "WATCH" : "READY");

interface Mission { id: string; name: string; base: string; type: string; candidates: { tail: string; p_complete: number; excluded: boolean; reasons: string[] }[] }

/** S3 — aircraft showroom: turntable, camera presets, part health hotspots, exploded view, body health, spec sheet, part drawer. */
export function Showroom({ tail }: { tail: string }) {
  const { data } = useSnapshots<{ world: World & { stock: { node: string; lru: string; qty: number }[] }; state: FleetState; plan: { missions: Mission[] } }>(["world", "state", "plan"]);
  const navigate = useApp((st) => st.navigate);
  const [preset, setPreset] = useState("Front ¾");
  const exploded = false; // exploded view removed from the UI
  const body = false; // body-health overlay removed from the UI
  const [open, setOpen] = useState<SystemKey | null>(null);
  const params = new URLSearchParams(window.location.search);
  const still = params.has("still");
  const beatPart = useBeatParams().get("part");
  useEffect(() => { setOpen((params.get("part") as SystemKey) ?? null); }, [tail]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (beatPart !== null) setOpen(beatPart as SystemKey); else if (useStory.getState().active) setOpen(null); }, [beatPart]);

  if (!data) return <div className={s.loading} />;
  const { world, state, plan } = data;
  const a = state.aircraft.find((x) => x.tail === tail) ?? state.aircraft[0]!;
  const type = world.types.find((t) => t.id === a.type)!;
  const peers = state.aircraft.filter((x) => x.base === a.base);
  const sys = Object.fromEntries(a.systems.map((x) => [x.id, x])) as Record<SystemKey, SystemState>;
  const mission = plan.missions.find((m) => m.base === a.base && m.type === a.type);
  const fit = mission?.candidates.find((c) => c.tail === a.tail);
  const meta = world.aircraft.find((x) => x.tail === a.tail)!;

  return (
    <div className={s.sheet} data-testid="showroom">
      <RegistrationMarks />
      <SheetHeader sheet="03" title={`${a.tail} · ${type.name}`} subtitle={`${type.role} · ${world.bases.find((b) => b.id === a.base)!.name} · ${a.age_years.toFixed(1)} years`}
        right={<SheetIndex />} />

      <div className={s.grid}>
        <aside className={s.carousel} aria-label="Garage">
          <span className={s.kicker}>GARAGE · {a.base} · {peers.length} AIRCRAFT</span>
          <div className={s.carouselList}>
            {peers.map((p) => (
              <FlightStrip key={p.tail} compact status={p.status} callsign={p.tail} active={p.tail === a.tail}
                onClick={() => navigate(`/aircraft/${p.tail}`)}
                fields={[{ label: world.types.find((t) => t.id === p.type)!.name, value: <HealthBar value={p.weighted_health} width={46} /> }]} />
            ))}
          </div>
        </aside>

        <section className={s.studio}>
          <Canvas key={a.tail} resize={{ offsetSize: true }} dpr={[1, 1.5]} camera={{ position: PRESETS[preset], fov: 34 }} gl={{ preserveDrawingBuffer: true, antialias: true }}
                  frameloop={still ? "demand" : "always"} data-testid="three-canvas">
            <color attach="background" args={["#e9e3d4"]} />
            <hemisphereLight args={["#fbf8f0", "#9a907a", 0.85]} />
            <directionalLight position={[5, 8, 4]} intensity={1.15} />
            <directionalLight position={[-6, 3, -5]} intensity={0.35} />
            <Suspense fallback={null}>
              <group position={[0, 0.25, 0]}>
                <Airframe type={a.type as TypeId} exploded={exploded ? 1 : 0} bodyHealth={a.body_health} showBody={body} />
                <Hotspots type={a.type as TypeId} systems={sys} open={open} onOpen={setOpen} exploded={exploded} />
              </group>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]}>
                <circleGeometry args={[7.5, 64]} />
                <meshStandardMaterial color="#ddd5c2" roughness={1} />
              </mesh>
              <ContactShadows position={[0, -0.7, 0]} scale={14} blur={2.4} opacity={0.42} far={3} frames={1} key={`${exploded}`} />
            </Suspense>
            <CameraRig preset={PRESETS[preset]!} />
            <OrbitControls makeDefault enablePan={false} autoRotate={!still && !open} autoRotateSpeed={0.55} minDistance={5} maxDistance={16} />
            <FpsProbe />
          </Canvas>
          <div className={s.controls}>
            {Object.keys(PRESETS).map((k) => (
              <button key={k} type="button" className={preset === k ? s.on : ""} onClick={() => setPreset(k)}>{k}</button>
            ))}
            <span className={s.sep} />
          </div>
          {body && (
            <div className={s.bodyLegend}>
              <span>Body health {Math.round(a.body_health)}</span>
              <span className={s.bodyRamp} />
              <span className={s.bodyEnds}><em>0 · corroded / fatigued</em><em>100 · as new</em></span>
              <ProvenanceChip kind="SIMULATED" />
            </div>
          )}
          <div className={s.studioCaption}>Procedural model · fictional type · not a real aircraft</div>
        </section>

        <aside className={s.right}>
          {open ? (
            <PartDrawer a={a} system={sys[open]} sysKey={open} world={world} onClose={() => setOpen(null)} />
          ) : (
            <SpecSheet a={a} fit={fit} mission={mission} lifeUsed={a.airframe_life_used} meta={meta} onOpen={setOpen} />
          )}
        </aside>
      </div>
      <CornerTag />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ 3D helpers */
function CameraRig({ preset }: { preset: [number, number, number] }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(...preset));
  const moving = useRef(true);
  useEffect(() => { target.current.set(...preset); moving.current = true; }, [preset]);
  useFrame(() => {
    if (!moving.current) return;
    camera.position.lerp(target.current, 0.08);
    camera.lookAt(0, 0.1, 0);
    if (camera.position.distanceTo(target.current) < 0.02) moving.current = false;
  });
  return null;
}

/** Writes the measured frame rate to a data attribute (Stage 11 fps check). */
function FpsProbe() {
  const frames = useRef(0);
  const t0 = useRef(performance.now());
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - t0.current > 1000) {
      document.body.dataset.fps = String(Math.round((frames.current * 1000) / (now - t0.current)));
      frames.current = 0; t0.current = now;
    }
  });
  return null;
}

function Hotspots({ type, systems, open, onOpen, exploded }: { type: TypeId; systems: Record<SystemKey, SystemState>; open: SystemKey | null; onOpen: (k: SystemKey) => void; exploded: boolean }) {
  const pts = useMemo(() => hotspots(type), [type]);
  return (
    <>
      {(Object.keys(pts) as SystemKey[]).map((k) => {
        const p = pts[k];
        const off: [number, number, number] = exploded ? (k === "engines" ? [-1.4, 0, 0] : k === "landing_gear" ? [0, -0.8, 0] : k === "avionics" ? [0.9, 0.55, 0] : [0, 0, 0]) : [0, 0, 0];
        const st = sysStatus(systems[k].p_fail);
        return (
          <Html key={k} position={[p[0] + off[0], p[1] + off[1], p[2] + off[2]]} zIndexRange={[20, 0]} style={{ pointerEvents: "auto" }}>
            <button type="button" className={`${s.hot} ${open === k ? s.hotOpen : ""}`} onClick={() => onOpen(k)} data-status={st}>
              <span className={s.hotDot} style={{ borderColor: `var(--${st.toLowerCase()})` }} />
              <span className={s.hotLine} />
              <span className={s.hotTag}><StatusGlyph status={st} size={9} />{SYS[k]}<b>{Math.round(systems[k].health)}</b></span>
            </button>
          </Html>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------------------------ side panels */
function Stat({ label, value, pct, tone = "olive", note }: { label: string; value: string; pct: number; tone?: "olive" | "watch" | "pull" | "ink"; note?: string }) {
  return (
    <div className={s.stat}>
      <div className={s.statTop}><span>{label}</span><b>{value}</b></div>
      <HealthBar value={pct} width={360} showValue={false} tone={tone} />
      {note && <span className={s.statNote}>{note}</span>}
    </div>
  );
}

function SpecSheet({ a, fit, mission, lifeUsed, meta, onOpen }: { a: AircraftState; fit?: Mission["candidates"][number]; mission?: Mission; lifeUsed: number;
  meta: { airframe_hours: number; airframe_life_hours: number }; onOpen: (k: SystemKey) => void }) {
  const tone = a.status === "PULL" ? "pull" : a.status === "WATCH" ? "watch" : "olive";
  return (
    <div className={s.spec}>
      <div className={s.statusBlock}>
        <StatusGlyph status={a.status} size={18} label />
        <span>limited by <b>{SYS[a.limiting_system as SystemKey]}</b> · {Math.round(a.limiting_p * 100)} % risk in 14 days</span>
        <span className={s.action}>Next action: {a.action.replace(/_/g, " ").toLowerCase()}</span>
      </div>
      <Stat label="Health" value={`${Math.round(a.weighted_health)}`} pct={a.weighted_health} note="criticality-weighted across 8 systems" />
      <Stat label="Readiness" value={a.status === "READY" ? "Ready" : a.status === "WATCH" ? "Watch" : "In repair"} pct={100 - a.limiting_p * 100} tone={tone}
            note={`gated by the worst critical system (${SYS[a.limiting_system as SystemKey]})`} />
      <Stat label="Mission fit" value={fit ? `${Math.round(fit.p_complete * 100)} %` : "—"} pct={fit ? fit.p_complete * 100 : 0} tone={fit?.excluded ? "watch" : "olive"}
            note={fit && mission ? `${mission.name}: ${fit.excluded ? "excluded — " + fit.reasons.join("; ") : "eligible"}` : "no mission template for this base and type"} />
      <Stat label="Airframe life used" value={`${Math.round(lifeUsed * 100)} %`} pct={lifeUsed * 100} tone="ink"
            note={`${Math.round(meta.airframe_hours).toLocaleString("en-IN")} of ${meta.airframe_life_hours.toLocaleString("en-IN")} h · body health ${Math.round(a.body_health)}`} />
      <Stat label="Risk (14 days)" value={`${Math.round(a.risk_window * 100)} %`} pct={a.risk_window * 100} tone={a.risk_window >= 0.3 ? "pull" : a.risk_window >= 0.1 ? "watch" : "ink"}
            note="chance any system fails: 1 − Π(1 − pᵢ)" />
      <div className={s.sysList}>
        {a.systems.map((x) => (
          <button key={x.id} type="button" onClick={() => onOpen(x.id as SystemKey)}>
            <span className={s.sysTop}>
              <StatusGlyph status={sysStatus(x.p_fail)} size={16} />
              <span className={s.sysName}>{SYS[x.id as SystemKey]}</span>
              <span className={s.sysProv}>{x.provenance === "REAL-ANCHORED" ? "anchored" : x.provenance.toLowerCase()}</span>
            </span>
            <HealthBar value={x.health} width={170} />
          </button>
        ))}
      </div>
    </div>
  );
}

function PartDrawer({ a, system, sysKey, world, onClose }: { a: AircraftState; system: SystemState; sysKey: SystemKey;
  world: World & { stock: { node: string; lru: string; qty: number }[] }; onClose: () => void }) {
  const st = sysStatus(system.p_fail);
  const lrus = world.parts.filter((p) => p.system === sysKey);
  const stock = Object.fromEntries(world.stock.filter((x) => x.node === a.base).map((x) => [x.lru, x.qty]));
  const [p10, p50, p90] = system.rul_days;
  const span = Math.max(p90, 30);
  const verdict = st === "PULL" ? "Needs action now" : st === "WATCH" ? "Keep an eye on it" : "Healthy";
  const inStock = lrus.filter((p) => (stock[p.lru] ?? 0) > 0).length;
  const W = 440;
  return (
    <div className={s.drawer} data-testid="part-drawer">
      <button type="button" className={s.back} onClick={onClose}>← Back to summary</button>
      <div className={s.drawerHead}>
        <StatusGlyph status={st} size={26} />
        <h2>{SYS[sysKey]}</h2>
      </div>
      <p className={s.verdict}>{verdict}: {Math.round(system.p_fail * 100)} % chance of failing in the next 14 days.</p>
      <div className={s.bigNums}>
        <div><b>{Math.round(system.health)}</b><span>health out of 100</span></div>
        <div><b>{Math.round(system.p_fail * 100)} %</b><span>failure risk</span></div>
        <div><b>{system.confidence.level}</b><span>confidence</span></div>
      </div>
      <div className={s.rul}>
        <span className={s.rulLabel}>Likely to last about <b>{p50.toFixed(0)} more days</b> (range {p10.toFixed(0)}–{p90.toFixed(0)})</span>
        <svg width={W} height={52} aria-hidden>
          <line x1={0} x2={W} y1={30} y2={30} stroke="var(--fold)" strokeWidth={2} />
          <rect x={(p10 / span) * (W - 20)} y={20} width={Math.max(3, ((p90 - p10) / span) * (W - 20))} height={20} fill="var(--series-p3)" opacity={0.25} />
          <line x1={(p50 / span) * (W - 20)} x2={(p50 / span) * (W - 20)} y1={14} y2={46} stroke="var(--series-p3)" strokeWidth={4} />
          <line x1={(14 / span) * (W - 20)} x2={(14 / span) * (W - 20)} y1={6} y2={52} stroke="var(--pull)" strokeWidth={2} strokeDasharray="4 3" />
          <text x={(14 / span) * (W - 20) + 6} y={14} fontSize={15} fontFamily="var(--font-sans)" fill="var(--pull)">14-day check</text>
        </svg>
      </div>
      <div className={s.drivers}>
        <span className={s.kicker}>WHAT IS DRIVING THIS</span>
        {system.drivers.length
          ? system.drivers.slice(0, 2).map((d) => <p key={d.sensor}>{d.text.split(";")[0]}.</p>)
          : <p>No single sensor is pulling the estimate down.</p>}
      </div>
      <div className={s.lrus}>
        <span className={s.kicker}>SPARE PARTS AT {a.base}</span>
        <p className={s.stockLine}><b>{inStock}</b> of {lrus.length} replaceable units in stock{inStock < lrus.length ? ` — ${lrus.length - inStock} would need to be flown in or trucked` : ""}.</p>
      </div>
    </div>
  );
}
