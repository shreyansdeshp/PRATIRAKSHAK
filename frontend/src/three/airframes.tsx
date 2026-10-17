/**
 * Procedural airframes (SPEC §11.4): four fictional types built from code (lathe fuselage, extruded planforms),
 * deliberately different silhouettes, no third-party models (zero licence risk), not copies of any real aircraft.
 * Look: matte paper-grey with ink edges — an engineering-manual drawing, not a glossy render.
 */
import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export type TypeId = "GAR" | "PRA" | "VAH" | "SHI";
export type SystemKey = "engines" | "hydraulics" | "landing_gear" | "flight_controls" | "electrical" | "avionics" | "fuel" | "structure";

const INK = "#2e3234";
const BODY = new THREE.Color("#bdb6a4");
const RUST = new THREE.Color("#b07a55");
const CANOPY = "#59625f";

interface Spec {
  length: number;
  profile: [number, number][];           // [x from nose 0..1, radius]
  wing: { shape: [number, number][]; y: number; x: number; thickness: number };
  tail: { fin: [number, number][]; x: number; y: number; stab?: [number, number][]; stabY?: number; tTail?: boolean };
  canards?: [number, number][];
  canopy: { x: number; len: number; r: number };
  engines: { kind: "internal" | "nacelle"; x: number; y: number; z?: number; r: number; len: number }[];
  gear: { x: number; z: number }[];
}

// planforms are in (x, z): x along the body (nose +), z outboard (half-span), mirrored for the other side
const SPECS: Record<TypeId, Spec> = {
  GAR: { length: 6.2, profile: [[0, 0], [0.04, 0.12], [0.14, 0.3], [0.3, 0.42], [0.6, 0.46], [0.85, 0.42], [0.97, 0.34], [1, 0.3]],
    wing: { shape: [[0.6, 0.3], [-2.2, 0.3], [-2.4, 2.7], [-2.0, 2.75]], y: -0.05, x: 0, thickness: 0.07 },
    tail: { fin: [[-1.9, 0], [-3.0, 0], [-3.05, 1.45], [-2.6, 1.45]], x: 0, y: 0.25 },
    canards: [[1.4, 0.35], [0.9, 0.35], [0.7, 1.05], [0.85, 1.05]],
    canopy: { x: 1.95, len: 1.2, r: 0.3 }, engines: [{ kind: "internal", x: -3.0, y: 0, r: 0.3, len: 0.5 }],
    gear: [{ x: 1.9, z: 0 }, { x: -0.6, z: 0.75 }, { x: -0.6, z: -0.75 }] },
  PRA: { length: 6.6, profile: [[0, 0], [0.05, 0.14], [0.16, 0.34], [0.35, 0.48], [0.62, 0.5], [0.86, 0.44], [0.97, 0.36], [1, 0.33]],
    wing: { shape: [[0.5, 0.4], [-0.9, 0.4], [-2.0, 3.0], [-1.45, 3.0]], y: 0.02, x: 0, thickness: 0.09 },
    tail: { fin: [[-2.1, 0], [-3.2, 0], [-3.35, 1.55], [-2.85, 1.55]], x: 0, y: 0.3, stab: [[-2.4, 0.35], [-3.1, 0.35], [-3.4, 1.55], [-3.1, 1.55]], stabY: 0.05 },
    canopy: { x: 2.0, len: 1.3, r: 0.32 }, engines: [{ kind: "internal", x: -3.25, y: 0, r: 0.33, len: 0.55 }],
    gear: [{ x: 2.0, z: 0 }, { x: -0.4, z: 0.95 }, { x: -0.4, z: -0.95 }] },
  VAH: { length: 7.6, profile: [[0, 0], [0.04, 0.32], [0.12, 0.6], [0.25, 0.72], [0.7, 0.72], [0.86, 0.58], [0.96, 0.36], [1, 0.22]],
    wing: { shape: [[0.95, 0.5], [-0.25, 0.5], [-0.55, 4.6], [0.2, 4.6]], y: 0.62, x: 0.2, thickness: 0.12 },
    tail: { fin: [[-2.5, 0], [-3.6, 0], [-3.9, 1.7], [-3.25, 1.7]], x: 0, y: 0.45, stab: [[-3.25, 0.05], [-3.95, 0.05], [-4.0, 1.7], [-3.6, 1.7]], stabY: 2.12, tTail: true },
    canopy: { x: 3.25, len: 0.6, r: 0.42 },
    engines: [{ kind: "nacelle", x: 0.85, y: 0.35, z: 1.75, r: 0.26, len: 1.3 }, { kind: "nacelle", x: 0.85, y: 0.35, z: -1.75, r: 0.26, len: 1.3 }],
    gear: [{ x: 3.0, z: 0 }, { x: 0.1, z: 0.62 }, { x: 0.1, z: -0.62 }] },
  SHI: { length: 5.0, profile: [[0, 0], [0.06, 0.12], [0.18, 0.28], [0.36, 0.36], [0.6, 0.36], [0.85, 0.27], [1, 0.16]],
    wing: { shape: [[0.55, 0.3], [-0.45, 0.3], [-0.6, 2.6], [-0.05, 2.6]], y: -0.2, x: 0.1, thickness: 0.08 },
    tail: { fin: [[-1.7, 0], [-2.45, 0], [-2.55, 1.0], [-2.15, 1.0]], x: 0, y: 0.2, stab: [[-1.9, 0.12], [-2.45, 0.12], [-2.55, 1.0], [-2.25, 1.0]], stabY: 0.1 },
    canopy: { x: 1.0, len: 1.5, r: 0.27 }, engines: [{ kind: "internal", x: -2.45, y: 0, r: 0.15, len: 0.3 }],
    gear: [{ x: 1.4, z: 0 }, { x: 0, z: 0.85 }, { x: 0, z: -0.85 }] },
};

/** Hotspot anchor per system (world coordinates of the assembled airframe). */
export function hotspots(type: TypeId): Record<SystemKey, [number, number, number]> {
  const s = SPECS[type];
  const L = s.length;
  const eng = s.engines[0]!;
  const engPos: [number, number, number] = eng.kind === "nacelle" ? [eng.x - eng.len / 2, eng.y, eng.z ?? 0] : [-L / 2 + 0.35, 0, 0];
  return {
    engines: engPos,
    hydraulics: [-0.5, -0.32, 0.36],
    landing_gear: [s.gear[1]!.x, -0.95, s.gear[1]!.z],
    flight_controls: [-L / 2 + 0.45, s.tail.y + 1.0, 0],
    electrical: [-L / 2 + 1.25, 0.32, -0.25],
    avionics: [L / 2 - 0.55, 0.05, 0.1],
    fuel: [s.wing.x - 0.6, s.wing.y + 0.06, 1.4],
    structure: [0.3, profileR(s, 0.45) + 0.02, 0],
  };
}

function profileR(s: Spec, t: number): number {
  const p = s.profile;
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i]![0]) {
      const [x0, r0] = p[i - 1]!; const [x1, r1] = p[i]!;
      return r0 + ((t - x0) / (x1 - x0)) * (r1 - r0);
    }
  }
  return p[p.length - 1]![1];
}

function planform(points: [number, number][], thickness: number): THREE.ExtrudeGeometry {
  const sh = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.35, bevelSize: thickness * 0.35, bevelSegments: 1 });
  g.rotateX(Math.PI / 2);          // shape plane (x, y) → (x, z); extrusion along -y
  g.translate(0, thickness / 2, 0);
  return g;
}


/** Canvas textures for the livery decals: tail flag (tricolour + Ashoka chakra) and the "IAF" body lettering. */
function flagTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 256; c.height = 170;
  const g = c.getContext("2d")!;
  const h = c.height / 3;
  g.fillStyle = "#FF9933"; g.fillRect(0, 0, c.width, h);
  g.fillStyle = "#FFFFFF"; g.fillRect(0, h, c.width, h);
  g.fillStyle = "#138808"; g.fillRect(0, 2 * h, c.width, h + 1);
  g.strokeStyle = "#06038D"; g.fillStyle = "#06038D";
  const cx = c.width / 2, cy = c.height / 2, r = h * 0.46;
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function lettersTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 512; c.height = 192;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0e2547"; g.font = "bold 150px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function Decal({ texture, position, size, side }: { texture: THREE.Texture; position: [number, number, number]; size: [number, number]; side: 1 | -1 }) {
  return (
    <mesh position={[position[0], position[1], position[2] * side]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={texture} transparent roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

function Part({ geometry, color, edges = true, position, rotation, scale }:
  { geometry: THREE.BufferGeometry; color: THREE.Color | string; edges?: boolean; position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }) {
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} scale={scale}>
      <meshStandardMaterial color={color} roughness={0.88} metalness={0.04} flatShading={false} />
      {edges && <Edges threshold={22} color={INK} />}
    </mesh>
  );
}

/** Assembled airframe. `exploded` (0–1) separates the engine, landing gear and avionics bay; `bodyHealth` tints for corrosion/fatigue. */
export function Airframe({ type, exploded = 0, bodyHealth = 100, showBody = false }: { type: TypeId; exploded?: number; bodyHealth?: number; showBody?: boolean }) {
  const s = SPECS[type];
  const L = s.length;
  const color = useMemo(() => {
    if (!showBody) return BODY;
    return BODY.clone().lerp(RUST, Math.min(1, Math.max(0, (100 - bodyHealth) / 70)));
  }, [showBody, bodyHealth]);

  const geo = useMemo(() => {
    const pts = s.profile.map(([t, r]) => new THREE.Vector2(Math.max(r, 0.001), t * L));
    const fus = new THREE.LatheGeometry(pts, 28);
    fus.rotateZ(-Math.PI / 2);             // lathe axis y → x (nose at +x after translate)
    fus.translate(-L / 2, 0, 0);
    fus.rotateY(Math.PI);                   // nose toward +x
    const wingR = planform(s.wing.shape, s.wing.thickness);
    const wingL = wingR.clone(); wingL.scale(1, 1, -1);
    const fin = planform(s.tail.fin, 0.06); fin.rotateX(-Math.PI / 2);
    const stabR = s.tail.stab ? planform(s.tail.stab, 0.05) : null;
    const stabL = stabR ? stabR.clone().scale(1, 1, -1) : null;
    const canR = s.canards ? planform(s.canards, 0.04) : null;
    const canL = canR ? canR.clone().scale(1, 1, -1) : null;
    const canopy = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    return { fus, wingR, wingL, fin, stabR, stabL, canR, canL, canopy };
  }, [s, L]);

  const flag = useMemo(() => flagTexture(), []);
  const iaf = useMemo(() => lettersTexture("IAF"), []);
  const fin = s.tail.fin;
  const finX = fin.reduce((a, q) => a + q[0], 0) / fin.length + s.tail.x;
  const finY = fin.reduce((a, q) => a + q[1], 0) / fin.length + s.tail.y;
  const finH = Math.max(...fin.map((q) => q[1])) - Math.min(...fin.map((q) => q[1]));
  const flagW = Math.min(0.42, finH * 0.3), flagH = flagW * 0.66;
  const bx = -L * 0.2;                                    // body lettering station
  const bR = profileR(s, 1 - (bx + L / 2) / L);
  const ex = exploded;
  const group = useRef<THREE.Group>(null);
  useFrame(() => { /* static model; the camera turns (turntable) */ });

  return (
    <group ref={group}>
      {/* structure */}
      <Part geometry={geo.fus} color={color} />
      <Part geometry={geo.wingR} color={color} position={[s.wing.x, s.wing.y, 0]} />
      <Part geometry={geo.wingL} color={color} position={[s.wing.x, s.wing.y, 0]} />
      <Part geometry={geo.fin} color={color} position={[s.tail.x, s.tail.y, 0]} />
      {geo.stabR && <Part geometry={geo.stabR} color={color} position={[0, s.tail.stabY ?? 0, 0]} />}
      {geo.stabL && <Part geometry={geo.stabL} color={color} position={[0, s.tail.stabY ?? 0, 0]} />}
      {geo.canR && <Part geometry={geo.canR} color={color} position={[0, 0.08, 0]} />}
      {geo.canL && <Part geometry={geo.canL} color={color} position={[0, 0.08, 0]} />}
      {/* livery: tail flag + IAF lettering, both sides */}
      {([1, -1] as const).map((side) => (
        <group key={side}>
          <Decal texture={flag} position={[finX, finY, 0.058]} size={[flagW, flagH]} side={side} />
          <Decal texture={iaf} position={[bx, 0.02, bR + 0.012]} size={[0.95, 0.36]} side={side} />
        </group>
      ))}
      <mesh geometry={geo.canopy} position={[s.canopy.x, profileR(s, 1 - (s.canopy.x + L / 2) / L) * 0.72, 0]} scale={[s.canopy.len / 2, s.canopy.r, s.canopy.r * 0.9]}>
        <meshStandardMaterial color={CANOPY} roughness={0.55} metalness={0.1} />
        <Edges threshold={30} color={INK} />
      </mesh>

      {/* engine group (explodes aft / outboard) */}
      <group position={[-ex * 1.4, 0, 0]}>
        {s.engines.map((e, i) => (
          <group key={i} position={[e.x, e.y, (e.z ?? 0) * (1 + ex * 0.25)]}>
            {e.kind === "nacelle" ? (
              <>
                <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[e.r, e.r * 0.85, e.len, 20]} /><meshStandardMaterial color={BODY} roughness={0.85} /><Edges threshold={30} color={INK} /></mesh>
                <mesh position={[e.len / 2 + 0.02, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[e.r * 0.82, e.r * 0.82, 0.04, 20]} /><meshStandardMaterial color={INK} /></mesh>
              </>
            ) : (
              <mesh rotation={[0, 0, Math.PI / 2]} position={[ex * -0.2, 0, 0]}><cylinderGeometry args={[e.r * 0.95, e.r * 0.8, e.len, 20, 1, true]} /><meshStandardMaterial color="#6f6a5e" roughness={0.7} side={THREE.DoubleSide} /><Edges threshold={30} color={INK} /></mesh>
            )}
          </group>
        ))}
      </group>

      {/* landing gear (explodes down) */}
      <group position={[0, -ex * 0.8, 0]}>
        {s.gear.map((g, i) => (
          <group key={i} position={[g.x, -0.5, g.z]}>
            <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.035, 0.035, 0.42, 8]} /><meshStandardMaterial color={INK} /></mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}><cylinderGeometry args={[0.13, 0.13, 0.09, 16]} /><meshStandardMaterial color="#3a3d3e" roughness={0.9} /></mesh>
          </group>
        ))}
      </group>

      {/* avionics bay (explodes forward + up) */}
      <group position={[ex * 0.9, ex * 0.55, 0]}>
        <mesh position={[L / 2 - 0.85, 0.02, 0]}><boxGeometry args={[0.5, 0.22, 0.28]} /><meshStandardMaterial color="#9c9686" roughness={0.9} /><Edges color={INK} /></mesh>
      </group>
    </group>
  );
}
