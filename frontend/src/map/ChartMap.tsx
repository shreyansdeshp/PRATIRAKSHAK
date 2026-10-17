import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { type ReactNode, useEffect, useRef, useState } from "react";

import m from "./ChartMap.module.css";
import { paperChartStyle } from "./style";

export interface Camera { center: [number, number]; zoom: number; pitch?: number; bearing?: number }

/** Is the terrain tile service reachable? (one cheap probe; offline → static hillshade only) */
let onlinePromise: Promise<boolean> | null = null;
export function terrainOnline(): Promise<boolean> {
  if (!onlinePromise) {
    onlinePromise = new Promise((resolve) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return resolve(false);
      const ctl = new AbortController();
      const timer = setTimeout(() => { ctl.abort(); resolve(false); }, 2500);
      fetch("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/4/11/6.png", { signal: ctl.signal, mode: "cors" })
        .then((r) => resolve(r.ok)).catch(() => resolve(false)).finally(() => clearTimeout(timer));
    });
  }
  return onlinePromise;
}

/**
 * MapLibre map in the paper-chart style with chart furniture (scale bar, north arrow) and an HTML overlay layer.
 * `overlay(project)` renders labels/symbols positioned in screen space; it re-renders on every camera move.
 */
export function ChartMap({ camera, width, height, overlay, terrain = false, interactive = true, onReady, flyTo, children }:
  { camera: Camera; width: number; height: number; overlay?: (project: (lngLat: [number, number]) => [number, number], map: MLMap) => ReactNode;
    terrain?: boolean; interactive?: boolean; onReady?: (map: MLMap, online: boolean) => void; flyTo?: Camera & { duration?: number };
    children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => { terrainOnline().then(setOnline); }, []);

  useEffect(() => {
    if (!ref.current || online === null) return;
    const map = new maplibregl.Map({
      container: ref.current, style: paperChartStyle({ online, base: import.meta.env.BASE_URL ?? "/" }),
      center: camera.center, zoom: camera.zoom, pitch: camera.pitch ?? 0, bearing: camera.bearing ?? 0,
      interactive, attributionControl: false, fadeDuration: 0, maxPitch: 70,
      preserveDrawingBuffer: true,  // screenshots
    });
    mapRef.current = map;
    const bump = () => setTick((t) => t + 1);
    map.on("move", bump);
    map.on("load", () => {
      if (terrain && online) map.setTerrain({ source: "dem", exaggeration: 1.4 });
      setReady(true);
      bump();
      onReady?.(map, online);
    });
    return () => { map.remove(); mapRef.current = null; setReady(false); };
    // camera/terrain are initial values; later changes go through flyTo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flyTo) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({ center: flyTo.center, zoom: flyTo.zoom, pitch: flyTo.pitch ?? 0, bearing: flyTo.bearing ?? 0,
      duration: reduce ? 0 : flyTo.duration ?? 2400, curve: 1.2, essential: true });
  }, [flyTo, ready]);

  const map = mapRef.current;
  const project = (ll: [number, number]): [number, number] => {
    if (!map) return [-999, -999];
    const p = map.project(ll);
    return [p.x, p.y];
  };
  const zoom = map?.getZoom() ?? camera.zoom;
  const lat = map?.getCenter().lat ?? camera.center[1];
  const bearing = map?.getBearing() ?? 0;

  return (
    <div className={m.wrap} style={{ width, height }} data-testid="chart-map" data-map-ready={ready ? "1" : "0"}
         data-terrain={online ? "online" : "offline"}>
      <div ref={ref} className={m.map} />
      {ready && map && <div className={m.overlay}>{overlay?.(project, map)}</div>}
      <ScaleBar zoom={zoom} lat={lat} />
      <NorthArrow bearing={bearing} />
      {children}
    </div>
  );
}

function ScaleBar({ zoom, lat }: { zoom: number; lat: number }) {
  const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const target = mpp * 140;
  const pow = 10 ** Math.floor(Math.log10(target));
  const nice = [1, 2, 5, 10].map((n) => n * pow).reverse().find((n) => n <= target) ?? pow;
  const px = nice / mpp;
  const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  return (
    <div className={m.scale} aria-label={`scale ${label}`}>
      <svg width={px + 2} height={10} aria-hidden>
        <rect x={1} y={4} width={px / 2} height={4} fill="var(--ink)" />
        <rect x={1 + px / 2} y={4} width={px / 2} height={4} fill="var(--paper-hi)" stroke="var(--ink)" strokeWidth={1} />
        <rect x={1} y={4} width={px} height={4} fill="none" stroke="var(--ink)" strokeWidth={1} />
      </svg>
      <span>0</span><span className={m.scaleEnd}>{label}</span>
    </div>
  );
}

function NorthArrow({ bearing }: { bearing: number }) {
  return (
    <div className={m.north} style={{ transform: `rotate(${-bearing}deg)` }} aria-label="north arrow">
      <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden>
        <path d="M11 2 L18 26 L11 21 L4 26 Z" fill="var(--paper-hi)" stroke="var(--ink)" strokeWidth="1" />
        <path d="M11 2 L11 21 L4 26 Z" fill="var(--ink)" />
        <text x="11" y="33" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink)">N</text>
      </svg>
    </div>
  );
}
