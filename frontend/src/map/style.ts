import type { StyleSpecification } from "maplibre-gl";

import hillshade from "./hillshade.json";

/**
 * Paper-chart basemap (SPEC §11.3): terrain-first, thin ink borders, desaturated sand land, pale water, graticule.
 * Built in code — not a stock theme. No symbol/text layers (labels are HTML overlays in our own fonts), so the map
 * needs no glyph server and renders fully offline from /fallback-map/*. Online, a Terrarium DEM adds detailed
 * hillshade and optional 3D terrain.
 */
const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

// corner coordinates written by scripts/make_fallback_map.py (never hand-copied)
export const HILLSHADE_COORDS = hillshade.coordinates as [[number, number], [number, number], [number, number], [number, number]];

function graticule(step = 5): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let lon = 55; lon <= 105; lon += step) {
    features.push({ type: "Feature", properties: { kind: "meridian", v: lon },
      geometry: { type: "LineString", coordinates: Array.from({ length: 41 }, (_, i) => [lon, -2 + i]) } });
  }
  for (let lat = 0; lat <= 40; lat += step) {
    features.push({ type: "Feature", properties: { kind: "parallel", v: lat },
      geometry: { type: "LineString", coordinates: Array.from({ length: 51 }, (_, i) => [55 + i, lat]) } });
  }
  return { type: "FeatureCollection", features };
}

export function paperChartStyle({ online, base = "/" }: { online: boolean; base?: string }): StyleSpecification {
  const fm = `${base}fallback-map`;
  return {
    version: 8,
    name: "Pratirakshak paper chart",
    sources: {
      land: { type: "geojson", data: `${fm}/land.geojson` },
      countries: { type: "geojson", data: `${fm}/countries.geojson` },
      states: { type: "geojson", data: `${fm}/india_states.geojson` },
      rivers: { type: "geojson", data: `${fm}/rivers.geojson` },
      graticule: { type: "geojson", data: graticule(5) },
      hillshadeStatic: { type: "image", url: `${fm}/hillshade.png`, coordinates: HILLSHADE_COORDS },
      ...(online ? { dem: { type: "raster-dem", tiles: [TERRARIUM], encoding: "terrarium", tileSize: 256, maxzoom: 12,
        attribution: "Terrain Tiles (AWS Open Data); SRTM/GMTED courtesy USGS" } } : {}),
    },
    layers: [
      { id: "water", type: "background", paint: { "background-color": "#d3dbd5" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": "#efe8d6" } },
      { id: "foreign", type: "fill", source: "countries", filter: ["!=", ["get", "adm0_a3"], "IND"],
        paint: { "fill-color": "#e9e2cf" } },
      { id: "hillshade-static", type: "raster", source: "hillshadeStatic",
        paint: { "raster-opacity": online ? ["interpolate", ["linear"], ["zoom"], 5.5, 0.95, 7, 0] : 0.95, "raster-fade-duration": 0 } },
      ...(online ? [{ id: "hillshade-dem", type: "hillshade" as const, source: "dem", minzoom: 5,
        paint: { "hillshade-shadow-color": "#3a3226", "hillshade-highlight-color": "#fcf9f0", "hillshade-accent-color": "#6b5e48",
          "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 5, 0, 6.5, 0.55] as unknown as number } }] : []),
      { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#b9ad8e", "line-width": 0.6, "line-opacity": 0.8 } },
      { id: "rivers", type: "line", source: "rivers", paint: { "line-color": "#93a9a6", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 1.4] } },
      { id: "states", type: "line", source: "states", paint: { "line-color": "#a99c7c", "line-width": 0.6 } },
      { id: "borders", type: "line", source: "countries", paint: { "line-color": "#2e3234", "line-width": 0.9 } },
      { id: "coast", type: "line", source: "land", paint: { "line-color": "#4a4f52", "line-width": 0.7 } },
    ],
  } as StyleSpecification;
}
