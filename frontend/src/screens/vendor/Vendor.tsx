import { useEffect, useMemo, useState } from "react";

import { CornerTag, FlightStrip, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile, NumberTick } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import { ChartMap, type Camera } from "../../map/ChartMap";
import type { Meta } from "../../data/types";
import v from "./Vendor.module.css";

/* ----- local types (vendor.json only) ----- */
interface VendorDemand {
  demand_id: string;
  kind: string;
  lru: string;
  part: string;
  qty: number;
  priority: "P1" | "P2" | "P3";
  destination: { id: string; name: string; lat: number; lon: number };
  deliver_by: string;
  source: { id: string; name: string };
  mode: "road" | "air";
  eta_hours: number;
  route_id: string;
}
interface VendorNode {
  id: string;
  kind: "base" | "depot" | "vendor_hub";
  name: string;
  lat: number;
  lon: number;
}
interface VendorRoute {
  id: string;
  from_node: string;
  to_node: string;
  mode: "road" | "air";
  minutes: number;
  geometry_file: string | null;
}
interface VendorStock { lru: string; qty: number }
interface VendorData {
  role: string;
  snapshot: string;
  vendor_hub: { id: string; name: string; lat: number; lon: number };
  demands: VendorDemand[];
  stock_at_hub: VendorStock[];
  nodes: VendorNode[];
  routes: VendorRoute[];
  note: string;
}

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
const BASE = typeof import.meta !== "undefined" ? (import.meta.env.BASE_URL ?? "/") : "/";

/** Sheet 12 — Spares vendor: deliveries only, no aircraft health or readiness. */
export function Vendor() {
  const [data, setData] = useState<{ vendor: VendorData; meta: Meta } | null>(null);
  const [routeGeos, setRouteGeos] = useState<Record<string, GeoJSON.FeatureCollection>>({});

  // Load ONLY vendor.json and meta.json — never load state/decisions/history/world/plan/twin/results/demo
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${BASE}data/vendor.json`).then((r) => r.json()),
      fetch(`${BASE}data/meta.json`).then((r) => r.json()),
    ]).then(([vendor, meta]) => {
      if (alive) setData({ vendor, meta });
    });
    return () => { alive = false; };
  }, []);

  // Load route GeoJSON files referenced by deliveries
  useEffect(() => {
    if (!data) return;
    const files = new Set<string>();
    for (const route of data.vendor.routes) {
      if (route.geometry_file) files.add(route.geometry_file);
    }
    const promises = [...files].map((f) =>
      fetch(`${BASE}${f}`).then((r) => r.ok ? r.json() : null).catch(() => null).then((geo) => [f, geo] as const)
    );
    Promise.all(promises).then((results) => {
      const map: Record<string, GeoJSON.FeatureCollection> = {};
      for (const [f, geo] of results) {
        if (geo) map[f] = geo;
      }
      setRouteGeos(map);
    });
  }, [data]);

  if (!data) return <div className={v.loading} />;
  const { vendor } = data;
  const demands = useMemo(
    () => [...vendor.demands].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)),
    [vendor.demands],
  );

  const p1Count = demands.filter((d) => d.priority === "P1").length;
  const p2Count = demands.filter((d) => d.priority === "P2").length;
  const p3Count = demands.filter((d) => d.priority === "P3").length;
  const expedites = demands.filter((d) => d.kind === "expedite").length;

  // Camera centered on India showing all nodes
  const camera: Camera = { center: [77.5, 22], zoom: 4.2 };

  // Build node lookup for map overlay
  const nodeMap = useMemo(() => {
    const m = new Map<string, VendorNode>();
    for (const n of vendor.nodes) m.set(n.id, n);
    return m;
  }, [vendor.nodes]);

  return (
    <div className={v.sheet} data-testid="vendor">
      <RegistrationMarks />
      <SheetHeader
        sheet="12"
        title="Spares vendor — deliveries"
        subtitle={`${vendor.snapshot} · ${demands.length} delivery demands from the maintenance plan`}
        right={<SheetIndex />}
      />

      <div className={v.tiles}>
        <StatTile label="Total demands" value={<NumberTick value={demands.length} />} accent />
        <StatTile label="P1 Expedites" value={<NumberTick value={p1Count} />} note="urgent, same day" />
        <StatTile label="P2 Priority" value={<NumberTick value={p2Count} />} />
        <StatTile label="P3 Restock" value={<NumberTick value={p3Count} />} />
        <StatTile label="Air / road" value={`${expedites} / ${demands.length - expedites}`} note="delivery mode" />
      </div>

      <div className={v.body}>
        {/* Map column */}
        <div className={v.mapCol}>
          <ChartMap
            camera={camera}
            width={540}
            height={400}
            overlay={(project) => (
              <>
                {/* Hub */}
                <span
                  className={`${v.mapLabel} ${v.mapLabelHub}`}
                  style={{ left: project([vendor.vendor_hub.lon, vendor.vendor_hub.lat])[0], top: project([vendor.vendor_hub.lon, vendor.vendor_hub.lat])[1] }}
                >
                  ◆ {vendor.vendor_hub.name}
                </span>
                {/* Destinations */}
                {vendor.nodes.filter((n) => n.kind === "base").map((n) => {
                  const [x, y] = project([n.lon, n.lat]);
                  return (
                    <span key={n.id} className={`${v.mapLabel} ${v.mapLabelBase}`} style={{ left: x, top: y }}>
                      ● {n.name.replace(" Air Base", "")}
                    </span>
                  );
                })}
              </>
            )}
            onReady={(map, online) => {
              if (!online) return;
              // Draw route lines from GeoJSON
              const addRoutes = () => {
                for (const route of vendor.routes) {
                  if (!route.geometry_file) continue;
                  const geo = routeGeos[route.geometry_file];
                  if (!geo) continue;
                  const srcId = `route-${route.id}`;
                  if (map.getSource(srcId)) continue;
                  map.addSource(srcId, { type: "geojson", data: geo });
                  map.addLayer({
                    id: srcId,
                    type: "line",
                    source: srcId,
                    paint: {
                      "line-color": route.mode === "air" ? "#4B5632" : "#A89F7A",
                      "line-width": route.mode === "air" ? 2 : 1.5,
                      "line-dasharray": route.mode === "air" ? [6, 4] : [3, 3],
                    },
                  });
                }
                // Air routes as great-circle arcs
                for (const route of vendor.routes) {
                  if (route.mode !== "air") continue;
                  const from = nodeMap.get(route.from_node);
                  const to = nodeMap.get(route.to_node);
                  if (!from || !to) continue;
                  const srcId = `air-${route.id}`;
                  if (map.getSource(srcId)) continue;
                  map.addSource(srcId, {
                    type: "geojson",
                    data: { type: "Feature", geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] }, properties: {} },
                  });
                  map.addLayer({
                    id: srcId,
                    type: "line",
                    source: srcId,
                    paint: { "line-color": "#4B5632", "line-width": 1.5, "line-dasharray": [8, 6] },
                  });
                }
              };
              // Add routes once style is loaded
              if (map.isStyleLoaded()) addRoutes();
              else map.once("style.load", addRoutes);
            }}
          />
          {/* Hub stock */}
          <div className={v.stockSection}>
            <div className={v.stockTitle}>Hub stock ({vendor.vendor_hub.name})</div>
            <div className={v.stockGrid}>
              {vendor.stock_at_hub.map((s) => (
                <div key={s.lru} className={`${v.stockItem} ${s.qty === 0 ? v.stockEmpty : ""}`}>
                  <span>{s.lru}</span>
                  <span>{s.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deliveries list */}
        <div className={v.listCol}>
          <div className={v.deliveries}>
            {demands.map((d) => (
              <FlightStrip
                key={d.demand_id}
                status={d.priority === "P1" ? "PULL" : d.priority === "P2" ? "WATCH" : "READY"}
                callsign={d.demand_id}
                sub={d.part}
                fields={[
                  { label: "Priority", value: <span className={`${v.badge} ${v[`badge${d.priority}`]}`}>{d.priority}</span>, width: 60 },
                  { label: "Qty", value: d.qty, width: 40 },
                  { label: "Destination", value: d.destination.name.replace(" Air Base", ""), width: 100 },
                  { label: "Source", value: d.source.name.replace(" Air Base", "").replace(" Logistics Depot", "").replace(" Forward Depot", "").replace(" Vendor Hub", "Hub"), width: 80 },
                  { label: "Mode", value: d.mode === "air" ? "✈ Air" : "🚛 Road", width: 60 },
                  { label: "ETA", value: `${d.eta_hours.toFixed(1)} h`, width: 60 },
                  { label: "Deliver by", value: new Date(d.deliver_by).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), width: 70 },
                ]}
                compact
              />
            ))}
          </div>
        </div>
      </div>

      <div className={v.prov}>
        <span>Deliveries <ProvenanceChip kind="ILLUSTRATIVE" /></span>
      </div>
      <CornerTag />
    </div>
  );
}
