/**
 * Hand-built D3/SVG chart kit (SPEC §11.5, dataviz method): hairline solid axes, 2px lines, ≥8px markers with a 2px
 * paper ring, bars ≤24px with a 4px rounded data end, direct labels used sparingly, a legend for ≥2 series,
 * a crosshair tooltip on lines and per-mark tooltips elsewhere, and a table view behind every chart.
 * Text always wears ink tokens; colour lives only on marks.
 */
import { extent, max, min } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { type ReactNode, useMemo, useState } from "react";

import { Legend, ProvenanceChip } from "../components/primitives";
import type { Provenance } from "../data/types";
import k from "./kit.module.css";

const INK_SOFT = "var(--ink-soft)";
const GRID = "var(--grid)";

/* ------------------------------------------------------------------------------------------ frame */
export function ChartFrame({ title, subtitle, provenance, legend, table, children, width }:
  { title: string; subtitle?: string; provenance?: Provenance; legend?: { label: string; color: string; kind?: "line" | "dot" | "band" | "hatch" }[];
    table?: { columns: string[]; rows: (string | number)[][] }; children: ReactNode; width?: number }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className={k.frame} style={width ? { width } : undefined}>
      <figcaption className={k.caption}>
        <div>
          <div className={k.title}>{title}</div>
          {subtitle && <div className={k.subtitle}>{subtitle}</div>}
        </div>
        <div className={k.captionRight}>
          {provenance && <ProvenanceChip kind={provenance} />}
          {table && (
            <button type="button" className={k.tableBtn} onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? "chart" : "table"}
            </button>
          )}
        </div>
      </figcaption>
      {legend && legend.length > 1 && <div className={k.legendRow}><Legend items={legend} /></div>}
      {showTable && table ? (
        <table className={k.table}>
          <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : v}</td>)}</tr>)}</tbody>
        </table>
      ) : children}
    </figure>
  );
}

function Tip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = x > width - 180 ? x - 172 : x + 12;
  return <div className={k.tip} style={{ left, top: Math.max(0, y - 10) }}>{children}</div>;
}

function YAxis({ scale, width, ticks = 4, format = (v: number) => `${v}`, x0 }:
  { scale: (v: number) => number; width: number; ticks?: number; format?: (v: number) => string; x0: number } & { domain?: never }) {
  const s = scale as unknown as { ticks: (n: number) => number[] };
  return (
    <g>
      {s.ticks(ticks).map((t) => (
        <g key={t} transform={`translate(0,${scale(t)})`}>
          <line x1={x0} x2={width} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={x0 - 6} dy="0.32em" textAnchor="end" className={k.tick}>{format(t)}</text>
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------------------------------ sparkline */
/** Tiny trend line with an optional healthy-baseline rule (0) and an end dot. */
export function Sparkline({ values, width = 120, height = 28, color = "var(--ink)", baseline, band }:
  { values: (number | null)[]; width?: number; height?: number; color?: string; baseline?: number; band?: [number, number] }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null && Number.isFinite(p[1]));
  if (pts.length < 2) return <svg width={width} height={height} aria-label="no data" />;
  const ys = pts.map((p) => p[1]).concat(baseline !== undefined ? [baseline] : []);
  const y = scaleLinear().domain([min(ys)!, max(ys)!]).nice().range([height - 4, 4]);
  const x = scaleLinear().domain([0, values.length - 1]).range([2, width - 6]);
  const d = line<readonly [number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(curveMonotoneX)(pts) ?? "";
  const last = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} className={k.spark} role="img" aria-label={`trend, last value ${last[1].toFixed(2)}`}>
      {band && <rect x={0} width={width} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--sand)" />}
      {baseline !== undefined && <line x1={0} x2={width} y1={y(baseline)} y2={y(baseline)} stroke={INK_SOFT} strokeWidth={1} strokeDasharray="2 3" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last[0])} cy={y(last[1])} r={3} fill={color} stroke="var(--paper)" strokeWidth={1.5} />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------ line chart */
export interface Series { id: string; label: string; color: string; values: number[]; emphasis?: boolean }

/** Multi-series line chart, one y-axis, crosshair tooltip, direct end labels with leader lines when crowded. */
export function LineChart({ x, series, width = 640, height = 260, yDomain, yFormat = (v) => `${v}`, xLabel, yLabel, markers = [] }:
  { x: number[]; series: Series[]; width?: number; height?: number; yDomain?: [number, number]; yFormat?: (v: number) => string;
    xLabel?: string; yLabel?: string; markers?: { x: number; label: string }[] }) {
  const m = { t: 12, r: 128, b: 30, l: 44 };
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const xs = scaleLinear().domain(extent(x) as [number, number]).range([m.l, width - m.r]);
  const ys = scaleLinear().domain(yDomain ?? [min(all)!, max(all)!]).nice().range([height - m.b, m.t]);
  const path = (vals: number[]) => line<number>().x((_, i) => xs(x[i]!)).y((v) => ys(v)).curve(curveMonotoneX)(vals) ?? "";
  // end labels: place at last value, push apart to ≥ 14 px, draw a leader when moved
  const labels = useMemo(() => {
    const raw = series.map((s) => ({ s, y0: ys(s.values[s.values.length - 1]!) })).sort((a, b) => a.y0 - b.y0);
    let prev = -Infinity;
    return raw.map((r) => { const y = Math.max(r.y0, prev + 14); prev = y; return { ...r, y }; });
  }, [series, ys]);
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * (width - m.l - m.r) + m.l;
    const v = xs.invert(px);
    let best = 0;
    x.forEach((xv, i) => { if (Math.abs(xv - v) < Math.abs(x[best]! - v)) best = i; });
    setHover(best);
  };
  return (
    <div className={k.plotWrap} style={{ width, height }}>
      <svg width={width} height={height} role="img" aria-label={`${yLabel ?? "values"} over ${xLabel ?? "x"}`}>
        <YAxis scale={ys} width={width - m.r} x0={m.l} format={yFormat} />
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} shapeRendering="crispEdges" />
        {xs.ticks(6).map((t) => (
          <text key={t} x={xs(t)} y={height - m.b + 16} textAnchor="middle" className={k.tick}>{t}</text>
        ))}
        {xLabel && <text x={width - m.r} y={height - 2} textAnchor="end" className={k.axisLabel}>{xLabel}</text>}
        {yLabel && <text x={m.l} y={m.t - 2} className={k.axisLabel}>{yLabel}</text>}
        {markers.map((mk) => (
          <g key={mk.label} transform={`translate(${xs(mk.x)},0)`}>
            <line y1={m.t} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} />
            <text y={m.t + 10} x={4} className={k.marker}>{mk.label}</text>
          </g>
        ))}
        {series.filter((s) => !s.emphasis).map((s) => <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {series.filter((s) => s.emphasis).map((s) => <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />)}
        {labels.map(({ s, y0, y }) => (
          <g key={s.id}>
            {Math.abs(y - y0) > 1 && <line x1={width - m.r + 2} x2={width - m.r + 8} y1={y0} y2={y} stroke={INK_SOFT} strokeWidth={1} />}
            <circle cx={width - m.r} cy={y0} r={4} fill={s.color} stroke="var(--paper)" strokeWidth={2} />
            <text x={width - m.r + 10} y={y} dy="0.32em" className={k.endLabel}>{s.label} {yFormat(s.values[s.values.length - 1]!)}</text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={xs(x[hover]!)} x2={xs(x[hover]!)} y1={m.t} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} />
            {series.map((s) => <circle key={s.id} cx={xs(x[hover]!)} cy={ys(s.values[hover]!)} r={4} fill={s.color} stroke="var(--paper)" strokeWidth={2} />)}
          </g>
        )}
        <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tip x={xs(x[hover]!)} y={m.t} width={width}>
          <div className={k.tipHead}>{xLabel ?? "x"} {x[hover]}</div>
          {series.map((s) => (
            <div key={s.id} className={k.tipRow}><i style={{ background: s.color }} />{s.label}<b>{yFormat(s.values[hover]!)}</b></div>
          ))}
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ fan chart */
/** RUL / health fan: p10–p90 band, median line, threshold rule and optional failure marker. */
export function FanChart({ x, p10, p50, p90, width = 520, height = 200, color = "var(--series-p3)", threshold, failureAt,
  xLabel = "days", yLabel, yDomain }:
  { x: number[]; p10: number[]; p50: number[]; p90: number[]; width?: number; height?: number; color?: string;
    threshold?: { value: number; label: string }; failureAt?: { x: number; label: string }; xLabel?: string; yLabel?: string; yDomain?: [number, number] }) {
  const m = { t: 14, r: 16, b: 30, l: 44 };
  const [hover, setHover] = useState<number | null>(null);
  const xs = scaleLinear().domain(extent(x) as [number, number]).range([m.l, width - m.r]);
  const ys = scaleLinear().domain(yDomain ?? [min(p10)!, max(p90)!]).nice().range([height - m.b, m.t]);
  const band = area<number>().x((_, i) => xs(x[i]!)).y0((_, i) => ys(p10[i]!)).y1((_, i) => ys(p90[i]!)).curve(curveMonotoneX)(p50) ?? "";
  const mid = line<number>().x((_, i) => xs(x[i]!)).y((v) => ys(v)).curve(curveMonotoneX)(p50) ?? "";
  return (
    <div className={k.plotWrap} style={{ width, height }}>
      <svg width={width} height={height} role="img" aria-label={`${yLabel ?? "estimate"} fan: median and 80 % band`}>
        <YAxis scale={ys} width={width - m.r} x0={m.l} />
        <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} shapeRendering="crispEdges" />
        {xs.ticks(6).map((t) => <text key={t} x={xs(t)} y={height - m.b + 16} textAnchor="middle" className={k.tick}>{t}</text>)}
        <text x={width - m.r} y={height - 2} textAnchor="end" className={k.axisLabel}>{xLabel}</text>
        {yLabel && <text x={m.l} y={m.t - 3} className={k.axisLabel}>{yLabel}</text>}
        <path d={band} fill={color} opacity={0.16} />
        <path d={mid} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        {threshold && (
          <g>
            <line x1={m.l} x2={width - m.r} y1={ys(threshold.value)} y2={ys(threshold.value)} stroke="var(--pull)" strokeWidth={1} />
            <text x={width - m.r} y={ys(threshold.value) - 4} textAnchor="end" className={k.marker}>{threshold.label}</text>
          </g>
        )}
        {failureAt && (
          <g transform={`translate(${xs(failureAt.x)},0)`}>
            <line y1={m.t} y2={height - m.b} stroke="var(--pull)" strokeWidth={1.5} />
            <rect x={-4} y={height - m.b - 4} width={8} height={8} fill="var(--pull)" />
            <text x={6} y={m.t + 10} className={k.marker}>{failureAt.label}</text>
          </g>
        )}
        {hover !== null && <line x1={xs(x[hover]!)} x2={xs(x[hover]!)} y1={m.t} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} />}
        <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} fill="transparent"
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const v = xs.invert(((e.clientX - r.left) / r.width) * (width - m.l - m.r) + m.l);
                let b = 0; x.forEach((xv, i) => { if (Math.abs(xv - v) < Math.abs(x[b]! - v)) b = i; }); setHover(b);
              }} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tip x={xs(x[hover]!)} y={m.t} width={width}>
          <div className={k.tipHead}>{xLabel} {x[hover]}</div>
          <div className={k.tipRow}>median<b>{p50[hover]!.toFixed(1)}</b></div>
          <div className={k.tipRow}>80 % range<b>{p10[hover]!.toFixed(1)} – {p90[hover]!.toFixed(1)}</b></div>
        </Tip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ timeline strips */
export interface Block { start: number; end: number; kind: "planned" | "unplanned"; label?: string }

/** Gantt-like strips: planned work = solid blocks, unplanned = hatched; mission-impact markers as small squares. */
export function TimelineStrips({ rows, days, width = 900, rowHeight = 26, labelWidth = 150, dayLabel = (d: number) => `D+${d}` }:
  { rows: { label: string; sub?: string; blocks: Block[]; markers?: { day: number; label: string }[] }[]; days: number;
    width?: number; rowHeight?: number; labelWidth?: number; dayLabel?: (d: number) => string }) {
  const m = { t: 24, r: 44 };
  const xs = scaleLinear().domain([0, days]).range([labelWidth, width - m.r]);
  const height = m.t + rows.length * rowHeight + 6;
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  return (
    <div className={k.plotWrap} style={{ width, height }}>
      <svg width={width} height={height} role="img" aria-label="maintenance timeline">
        {xs.ticks(9).map((t) => (
          <g key={t}>
            <line x1={xs(t)} x2={xs(t)} y1={m.t - 4} y2={height - 6} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={xs(t)} y={m.t - 7} textAnchor="middle" className={k.tick}>{dayLabel(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = m.t + i * rowHeight;
          return (
            <g key={r.label} transform={`translate(0,${y})`}>
              <line x1={labelWidth} x2={width - m.r} y1={rowHeight / 2} y2={rowHeight / 2} stroke={GRID} strokeWidth={1} />
              <text x={0} y={rowHeight / 2} dy="0.32em" className={k.rowLabel}>{r.label}{r.sub && <tspan className={k.rowSub} dx={8}>{r.sub}</tspan>}</text>
              {r.blocks.map((b, j) => {
                const bx = xs(b.start); const bw = Math.max(3, xs(b.end) - xs(b.start));
                return (
                  <rect key={j} x={bx} y={5} width={bw} height={rowHeight - 10} rx={2}
                        fill={b.kind === "planned" ? "var(--olive)" : "url(#hatch-unplanned)"}
                        stroke={b.kind === "planned" ? "none" : "var(--khaki)"} strokeWidth={1}
                        onMouseEnter={() => setTip({ x: bx, y, text: `${b.kind === "planned" ? "Planned" : "Unplanned"} · D+${b.start}–${b.end}${b.label ? " · " + b.label : ""}` })}
                        onMouseLeave={() => setTip(null)} />
                );
              })}
              {(r.markers ?? []).map((mk, j) => (
                <g key={j}>
                  <rect x={xs(mk.day) - 7} y={rowHeight / 2 - 7} width={14} height={14} fill="var(--pull)" stroke="var(--paper)" strokeWidth={2}><title>{mk.label}</title></rect>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      {tip && <Tip x={tip.x} y={tip.y} width={width}><div className={k.tipRow}>{tip.text}</div></Tip>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ dumbbell / slope */
/** Before → after per row on one scale (e.g. without vs with Pratirakshak). */
export function Dumbbell({ rows, domain, width = 520, rowHeight = 30, aLabel, bLabel, aColor = "var(--series-p0)", bColor = "var(--series-p3)",
  format = (v: number) => v.toFixed(1), labelWidth = 150 }:
  { rows: { label: string; a: number; b: number }[]; domain: [number, number]; width?: number; rowHeight?: number;
    aLabel: string; bLabel: string; aColor?: string; bColor?: string; format?: (v: number) => string; labelWidth?: number }) {
  const m = { l: labelWidth, r: 48, t: 8 };
  const xs = scaleLinear().domain(domain).range([m.l, width - m.r]);
  const height = m.t + rows.length * rowHeight + 22;
  const nTicks = Math.max(2, Math.floor((width - m.l - m.r) / 60));  // ≥ 60 px per tick label
  return (
    <svg width={width} height={height} role="img" aria-label={`${aLabel} versus ${bLabel}`}>
      {xs.ticks(nTicks).map((t) => (
        <g key={t}>
          <line x1={xs(t)} x2={xs(t)} y1={m.t} y2={height - 22} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={xs(t)} y={height - 8} textAnchor="middle" className={k.tick}>{format(t)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = m.t + i * rowHeight + rowHeight / 2;
        return (
          <g key={r.label}>
            <text x={0} y={y} dy="0.32em" className={k.rowLabel}>{r.label}</text>
            <line x1={xs(r.a)} x2={xs(r.b)} y1={y} y2={y} stroke="var(--khaki)" strokeWidth={2} />
            <circle cx={xs(r.a)} cy={y} r={5} fill={aColor} stroke="var(--paper)" strokeWidth={2}><title>{aLabel}: {format(r.a)}</title></circle>
            <circle cx={xs(r.b)} cy={y} r={5} fill={bColor} stroke="var(--paper)" strokeWidth={2}><title>{bLabel}: {format(r.b)}</title></circle>
            <text x={width - m.r + 8} y={y} dy="0.32em" className={k.endLabel}>{format(r.b)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function SlopeChart({ rows, leftLabel, rightLabel, width = 360, height = 220, format = (v: number) => v.toFixed(0) }:
  { rows: { label: string; a: number; b: number; color: string }[]; leftLabel: string; rightLabel: string; width?: number; height?: number; format?: (v: number) => string }) {
  const m = { t: 24, b: 16, l: 90, r: 120 };
  const all = rows.flatMap((r) => [r.a, r.b]);
  const ys = scaleLinear().domain([min(all)!, max(all)!]).nice().range([height - m.b, m.t]);
  return (
    <svg width={width} height={height} role="img" aria-label={`${leftLabel} to ${rightLabel}`}>
      <text x={m.l} y={12} textAnchor="middle" className={k.axisLabel}>{leftLabel}</text>
      <text x={width - m.r} y={12} textAnchor="middle" className={k.axisLabel}>{rightLabel}</text>
      <line x1={m.l} x2={m.l} y1={m.t} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} />
      <line x1={width - m.r} x2={width - m.r} y1={m.t} y2={height - m.b} stroke={INK_SOFT} strokeWidth={1} />
      {rows.map((r) => (
        <g key={r.label}>
          <line x1={m.l} x2={width - m.r} y1={ys(r.a)} y2={ys(r.b)} stroke={r.color} strokeWidth={2} />
          <circle cx={m.l} cy={ys(r.a)} r={4} fill={r.color} stroke="var(--paper)" strokeWidth={2} />
          <circle cx={width - m.r} cy={ys(r.b)} r={4} fill={r.color} stroke="var(--paper)" strokeWidth={2} />
          <text x={m.l - 8} y={ys(r.a)} dy="0.32em" textAnchor="end" className={k.tick}>{format(r.a)}</text>
          <text x={width - m.r + 8} y={ys(r.b)} dy="0.32em" className={k.endLabel}>{r.label} {format(r.b)}</text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------ reliability / CI bars */
/** Reliability diagram: nominal vs empirical interval coverage, diagonal = perfect calibration. */
export function Reliability({ series, size = 220 }: { series: { label: string; color: string; points: { nominal: number; empirical: number }[] }[]; size?: number }) {
  const m = 34;
  const s = scaleLinear().domain([0.4, 1]).range([m, size - 8]);
  const sy = scaleLinear().domain([0.4, 1]).range([size - m, 8]);
  return (
    <svg width={size} height={size} role="img" aria-label="calibration: nominal versus empirical coverage">
      {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => (
        <g key={t}>
          <line x1={s(t)} x2={s(t)} y1={8} y2={size - m} stroke={GRID} strokeWidth={1} />
          <line x1={m} x2={size - 8} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
          <text x={s(t)} y={size - m + 14} textAnchor="middle" className={k.tick}>{Math.round(t * 100)}</text>
          <text x={m - 6} y={sy(t)} dy="0.32em" textAnchor="end" className={k.tick}>{Math.round(t * 100)}</text>
        </g>
      ))}
      <line x1={s(0.4)} y1={sy(0.4)} x2={s(1)} y2={sy(1)} stroke={INK_SOFT} strokeWidth={1} />
      <text x={size - 8} y={size - 4} textAnchor="end" className={k.axisLabel}>nominal %</text>
      <text x={m} y={6} className={k.axisLabel} dy="0.6em">empirical %</text>
      {series.map((se) => (
        <g key={se.label}>
          <path d={line<{ nominal: number; empirical: number }>().x((p) => s(p.nominal)).y((p) => sy(p.empirical))(se.points) ?? ""}
                fill="none" stroke={se.color} strokeWidth={2} />
          {se.points.map((p) => <circle key={p.nominal} cx={s(p.nominal)} cy={sy(p.empirical)} r={4} fill={se.color} stroke="var(--paper)" strokeWidth={2}>
            <title>{se.label}: nominal {Math.round(p.nominal * 100)} % → empirical {(p.empirical * 100).toFixed(1)} %</title></circle>)}
        </g>
      ))}
    </svg>
  );
}

/** Horizontal bars (≤ 24 px, 4 px rounded data end) with 95 % CI whiskers; value at the tip. */
export function BarCI({ rows, width = 420, format = (v: number) => v.toFixed(1), domain }:
  { rows: { label: string; mean: number; lo: number; hi: number; color: string }[]; width?: number; format?: (v: number) => string; domain?: [number, number] }) {
  const m = { l: 190, r: 70 };
  const rowH = 30;
  const height = rows.length * rowH + 8;
  const xs = scaleLinear().domain(domain ?? [0, max(rows, (r) => r.hi)!]).nice().range([m.l, width - m.r]);
  const band = scaleBand().domain(rows.map((r) => r.label)).range([4, height - 4]).paddingInner(0.3);
  const bh = Math.min(20, band.bandwidth());
  return (
    <svg width={width} height={height} role="img" aria-label="bars with 95 % confidence intervals">
      <line x1={xs(0)} x2={xs(0)} y1={0} y2={height} stroke={INK_SOFT} strokeWidth={1} />
      {rows.map((r) => {
        const y = band(r.label)! + (band.bandwidth() - bh) / 2;
        const w = Math.max(0, xs(r.mean) - xs(0));
        return (
          <g key={r.label}>
            <text x={0} y={y + bh / 2} dy="0.32em" className={k.rowLabel}>{r.label}</text>
            <path d={`M${xs(0)},${y} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${bh - 8} a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} Z`} fill={r.color}>
              <title>{r.label}: {format(r.mean)} (95 % CI {format(r.lo)}–{format(r.hi)})</title>
            </path>
            <line x1={xs(r.lo)} x2={xs(r.hi)} y1={y + bh / 2} y2={y + bh / 2} stroke="var(--ink)" strokeWidth={1} />
            <line x1={xs(r.lo)} x2={xs(r.lo)} y1={y + bh / 2 - 4} y2={y + bh / 2 + 4} stroke="var(--ink)" strokeWidth={1} />
            <line x1={xs(r.hi)} x2={xs(r.hi)} y1={y + bh / 2 - 4} y2={y + bh / 2 + 4} stroke="var(--ink)" strokeWidth={1} />
            <text x={Math.max(xs(r.hi), xs(r.mean)) + 8} y={y + bh / 2} dy="0.32em" className={k.endLabel}>{format(r.mean)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Global SVG defs (hatch patterns) — mounted once by the app shell. */
export function ChartDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <pattern id="hatch-unplanned" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--paper-hi)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--khaki)" strokeWidth="2" />
        </pattern>
        <pattern id="hatch-stale" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--stale)" strokeWidth="1.5" />
        </pattern>
      </defs>
    </svg>
  );
}
