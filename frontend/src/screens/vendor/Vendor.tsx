import { useEffect, useState } from "react";

import { CornerTag, FlightStrip, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile, NumberTick } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import { ChartMap, type Camera } from "../../map/ChartMap";
import { useSnapshots } from "../../data/useSnapshots";
import type { Meta } from "../../data/types";
import v from "./Vendor.module.css";
import { formatDuration } from "../../util/duration";

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

interface VendorStock {
  lru: string;
  qty: number;
}

interface VendorData {
  role: string;
  snapshot: string;
  vendor_hub: { id: string; name: string };
  demands: VendorDemand[];
  stock_at_hub: VendorStock[];
  nodes: VendorNode[];
  routes: VendorRoute[];
  note: string;
}

interface RouteCoord {
  id: string;
  mode: "road" | "air";
  coords: [number, number][];
}

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
const BASE = typeof import.meta !== "undefined" ? (import.meta.env.BASE_URL ?? "/") : "/";

/** Sheet 12 — Spares vendor: deliveries only, no aircraft health or readiness. */
export function Vendor() {
  const { data } = useSnapshots<{ vendor: VendorData; meta: Meta }>(["vendor", "meta"]);
  const [routeCoords, setRouteCoords] = useState<RouteCoord[]>([]);

  // Load route geometries (road geojsons + air.geojson)
  useEffect(() => {
    if (!data) return;
    let alive = true;

    async function loadRoutes() {
      if (!data) return;
      const nodeMap = new Map<string, VendorNode>();
      for (const n of data.vendor.nodes) nodeMap.set(n.id, n);

      // Load air.geojson
      const airData = await fetch(`${BASE}data/routes/air.geojson`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const airMap = new Map<string, [number, number][]>();
      if (airData && Array.isArray(airData.features)) {
        for (const feat of airData.features) {
          const id = feat.properties?.id;
          const coords = feat.geometry?.coordinates;
          if (id && coords) airMap.set(id, coords);
        }
      }

      // Load road routes
      const loaded: RouteCoord[] = [];
      for (const r of data.vendor.routes) {
        if (r.mode === "air") {
          const coords = airMap.get(r.id);
          if (coords) {
            loaded.push({ id: r.id, mode: "air", coords });
          } else {
            const from = nodeMap.get(r.from_node);
            const to = nodeMap.get(r.to_node);
            if (from && to) {
              loaded.push({ id: r.id, mode: "air", coords: [[from.lon, from.lat], [to.lon, to.lat]] });
            }
          }
        } else if (r.mode === "road" && r.geometry_file) {
          const path = r.geometry_file.replace("routes/road/", "routes/");
          const roadGeo = await fetch(`${BASE}${path}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
          if (roadGeo?.coordinates) {
            loaded.push({ id: r.id, mode: "road", coords: roadGeo.coordinates });
          } else if (roadGeo?.geometry?.coordinates) {
            loaded.push({ id: r.id, mode: "road", coords: roadGeo.geometry.coordinates });
          }
        }
      }

      if (alive) {
        setRouteCoords(loaded);
      }
    }

    loadRoutes();
    return () => {
      alive = false;
    };
  }, [data]);

  if (!data) return <div className={v.loading} />;
  const { vendor } = data;

  const demands = [...vendor.demands].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  );

  const p1Count = demands.filter((d) => d.priority === "P1").length;
  const p2Count = demands.filter((d) => d.priority === "P2").length;
  const p3Count = demands.filter((d) => d.priority === "P3").length;
  const expedites = demands.filter((d) => d.kind === "expedite").length;

  // Zoom framed to display all 4 bases, 3 depots, and Nandi hub from north to south
  const camera: Camera = { center: [78.0, 22.5], zoom: 3.75 };
  const hubNode = vendor.nodes.find((n) => n.id === vendor.vendor_hub.id || n.kind === "vendor_hub");

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
        <StatTile label="P1 Expedites" value={<NumberTick value={p1Count} />} note="urgent delivery" />
        <StatTile label="P2 Priority" value={<NumberTick value={p2Count} />} />
        <StatTile label="P3 Restock" value={<NumberTick value={p3Count} />} />
        <StatTile label="Air / Road" value={`${expedites} / ${demands.length - expedites}`} note="transport mode" />
      </div>

      <div className={v.body}>
        {/* Map column */}
        <div className={v.mapCol}>
          <div className={v.mapWrapper}>
            <ChartMap
              camera={camera}
              width={620}
              height={440}
              interactive={false}
              overlay={(project) => (
                <>
                  {/* SVG routes overlay */}
                  <svg className={v.routesSvg} width={620} height={440} aria-hidden>
                    {routeCoords.map((rc) => {
                      const d = rc.coords
                        .map((c, idx) => {
                          const [px, py] = project(c);
                          return `${idx ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
                        })
                        .join("");
                      return (
                        <path
                          key={rc.id}
                          d={d}
                          className={rc.mode === "air" ? v.airRoute : v.roadRoute}
                        />
                      );
                    })}
                  </svg>

                  {/* Hub marker and label */}
                  {hubNode && (
                    <div
                      className={`${v.mapLabel} ${v.mapLabelHub}`}
                      style={{
                        left: project([hubNode.lon, hubNode.lat])[0],
                        top: project([hubNode.lon, hubNode.lat])[1],
                      }}
                    >
                      ◆ {hubNode.name.replace(" Vendor Hub", " Hub")}
                    </div>
                  )}

                  {/* Bases and Depots */}
                  {vendor.nodes
                    .filter((n) => n.kind !== "vendor_hub")
                    .map((n) => {
                      const [x, y] = project([n.lon, n.lat]);
                      return (
                        <div
                          key={n.id}
                          className={`${v.mapLabel} ${n.kind === "base" ? v.mapLabelBase : v.mapLabelDepot}`}
                          style={{ left: x, top: y }}
                        >
                          {n.kind === "base" ? "● " : "▲ "}
                          {n.name.replace(" Air Base", "").replace(" Logistics Depot", " Depot").replace(" Forward Depot", " Depot")}
                        </div>
                      );
                    })}
                </>
              )}
            />
          </div>

          {/* Hub stock list */}
          <div className={v.stockSection}>
            <div className={v.stockTitle}>
              Hub inventory · {vendor.vendor_hub.name} ({vendor.stock_at_hub.length} LRUs)
            </div>
            <div className={v.stockGrid}>
              {vendor.stock_at_hub.map((s) => (
                <div key={s.lru} className={`${v.stockItem} ${s.qty === 0 ? v.stockEmpty : ""}`}>
                  <span className={v.stockLru}>{s.lru}</span>
                  <span className={v.stockQty}>{s.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deliveries flight-strip list */}
        <div className={v.listCol}>
          <div className={v.listHeader}>
            <span className={v.listTitle}>Scheduled deliveries ({demands.length})</span>
            <span className={v.legendBar}>
              <span className={v.legendItem}><span className={`${v.badge} ${v.badgeP1}`}>P1</span> Expedite</span>
              <span className={v.legendItem}><span className={`${v.badge} ${v.badgeP2}`}>P2</span> Priority</span>
              <span className={v.legendItem}><span className={`${v.badge} ${v.badgeP3}`}>P3</span> Restock</span>
            </span>
          </div>
          <div className={v.deliveries}>
            {demands.map((d) => (
              <FlightStrip
                key={d.demand_id}
                status={d.priority === "P1" ? "PULL" : d.priority === "P2" ? "WATCH" : "READY"}
                callsign={d.demand_id}
                sub={d.part}
                fields={[
                  { label: "Priority", value: <span className={`${v.badge} ${v[`badge${d.priority}`]}`}>{d.priority}</span>, width: 75 },
                  { label: "Qty", value: d.qty, width: 55 },
                  { label: "Destination", value: d.destination.name.replace(" Air Base", "") },
                  { label: "Source", value: d.source.name.replace(" Air Base", "").replace(" Logistics Depot", " Depot").replace(" Forward Depot", " Depot").replace(" Vendor Hub", " Hub") },
                  { label: "Mode", value: d.mode === "air" ? "Air" : "Road", width: 75 },
                  { label: "ETA", value: formatDuration(d.eta_hours), width: 85 },
                  {
                    label: "Deliver by",
                    value: new Date(d.deliver_by).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    }),
                    width: 105,
                  },
                ]}
                compact
              />
            ))}
          </div>
        </div>
      </div>

      <div className={v.footer}>
        <div className={v.prov}>
          <span>Stock, times <ProvenanceChip kind="ILLUSTRATIVE" /></span>
          <span>Routes <ProvenanceChip kind="REAL-ANCHORED" /></span>
        </div>
      </div>
      <CornerTag />
    </div>
  );
}
