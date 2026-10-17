import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import type { Provenance, Status } from "../data/types";
import s from "./primitives.module.css";

/* ------------------------------------------------------------------------------------------ status */
export type StatusLike = Status | "STALE";
const STATUS_LABEL: Record<StatusLike, string> = { READY: "Ready", WATCH: "Watch", PULL: "Pull", STALE: "Stale" };

/** Status = shape + lightness + colour (never colour alone): ● ready · ▲ watch · ■ pull · ◇ stale (hatched). */
export function StatusGlyph({ status, size = 12, label = false }: { status: StatusLike; size?: number; label?: boolean }) {
  const c = `var(--${status.toLowerCase()})`;
  const h = size;
  const shape =
    status === "READY" ? (
      <circle cx={h / 2} cy={h / 2} r={h / 2 - 0.5} fill={c} />
    ) : status === "WATCH" ? (
      <path d={`M${h / 2} 0.5 L${h - 0.5} ${h - 0.5} L0.5 ${h - 0.5} Z`} fill={c} />
    ) : status === "PULL" ? (
      <rect x={0.5} y={0.5} width={h - 1} height={h - 1} fill={c} />
    ) : (
      <>
        <defs>
          <pattern id="stale-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="3" stroke={c} strokeWidth="1.4" />
          </pattern>
        </defs>
        <path d={`M${h / 2} 0.5 L${h - 0.5} ${h / 2} L${h / 2} ${h - 0.5} L0.5 ${h / 2} Z`} fill="url(#stale-hatch)" stroke={c} />
      </>
    );
  return (
    <span className={s.glyph} role="img" aria-label={STATUS_LABEL[status]}>
      <svg width={h} height={h} viewBox={`0 0 ${h} ${h}`} aria-hidden>
        {shape}
      </svg>
      {label && <span className={s.glyphLabel} style={{ color: `var(--${status === "WATCH" ? "watch-ink" : status === "STALE" ? "stale-ink" : status.toLowerCase()})` }}>{STATUS_LABEL[status]}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ health bar */
/** Thin health bar (0–100) on a sand track; the number sits beside it in tabular mono. */
export function HealthBar({ value, width = 120, showValue = true, tone = "olive" }:
  { value: number; width?: number; showValue?: boolean; tone?: "olive" | "watch" | "pull" | "ink" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={s.health} style={{ width: showValue ? width + 36 : width }}>
      <span className={s.healthTrack} style={{ width }}>
        <span className={s.healthFill} style={{ width: `${v}%`, background: `var(--${tone === "ink" ? "ink-soft" : tone})` }} />
      </span>
      {showValue && <span className={s.healthValue}>{Math.round(v)}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ provenance */
const PROV_SHORT: Record<Provenance, string> = { REAL: "NASA C-MAPSS DATA", "REAL-ANCHORED": "PUBLIC-DATA BASED", SIMULATED: "SIMULATED", ILLUSTRATIVE: "ILLUSTRATIVE" };

/** Provenance chip (SPEC §11.8): REAL / REAL-ANCHORED / SIMULATED / ILLUSTRATIVE. */
export function ProvenanceChip({ kind }: { kind: Provenance }) {
  return (
    <span className={`${s.chip} ${s[`chip_${kind.replace("-", "_")}`]}`} title={kind}>
      {PROV_SHORT[kind]}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ sheet furniture */
export function RegistrationMarks({ inset = 24 }: { inset?: number }) {
  const st = (pos: CSSProperties) => <span className={s.reg} style={pos} aria-hidden />;
  return (
    <>
      {st({ top: inset, left: inset })}
      {st({ top: inset, right: inset })}
      {st({ bottom: inset, left: inset })}
      {st({ bottom: inset, right: inset })}
    </>
  );
}

/** Double-rule sheet header: sheet number · title · edition line. */
export function SheetHeader({ title, subtitle, edition, right }:
  { sheet: string; title: string; subtitle?: string; edition?: string; right?: ReactNode }) {
  return (
    <header className={s.sheetHeader}>
      <div className={s.sheetTitle}>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className={s.sheetRight}>
        {right}
        {edition && <span className={s.edition}>{edition}</span>}
      </div>
    </header>
  );
}

export function CornerTag() {
  return null;
}

/* ------------------------------------------------------------------------------------------ flight strip */
/** Air-traffic flight-progress strip: status edge, callsign block, then hairline-separated fields. */
export function FlightStrip({ status, callsign, sub, fields, onClick, active, compact }:
  { status: StatusLike; callsign: string; sub?: string; fields: { label: string; value: ReactNode; width?: number }[];
    onClick?: () => void; active?: boolean; compact?: boolean }) {
  return (
    <div className={`${s.strip} ${active ? s.stripActive : ""} ${compact ? s.stripCompact : ""}`} onClick={onClick}
         role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
         onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) onClick(); }}>
      <span className={s.stripEdge} style={{ background: `var(--${status.toLowerCase()})` }} aria-hidden />
      <span className={s.stripCall}>
        <StatusGlyph status={status} size={compact ? 10 : 12} />
        <span className={s.callsign}>{callsign}</span>
        {sub && <span className={s.callSub}>{sub}</span>}
      </span>
      {fields.map((f) => (
        <span key={f.label} className={s.stripField} style={f.width ? { width: f.width, flex: "none" } : undefined}>
          <span className={s.fieldLabel}>{f.label}</span>
          <span className={s.fieldValue}>{f.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ numbers */
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Number that ticks up once when it first appears (SPEC §11.6); instant under reduced motion. */
export function NumberTick({ value, format = (v) => Math.round(v).toLocaleString("en-IN"), duration = 1200, delay = 0 }:
  { value: number; format?: (v: number) => string; duration?: number; delay?: number }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setShown(value); return; }
    let raf = 0;
    const start = performance.now() + delay;
    const a = from.current;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (value - a) * e);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);
  return <>{format(shown)}</>;
}

export function StatTile({ label, value, unit, note, accent }:
  { label: string; value: ReactNode; unit?: string; note?: ReactNode; accent?: boolean }) {
  return (
    <div className={`${s.stat} ${accent ? s.statAccent : ""}`}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}{unit && <span className={s.statUnit}>{unit}</span>}</span>
      {note && <span className={s.statNote}>{note}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ legend */
export function Legend({ items }: { items: { label: string; color: string; kind?: "line" | "dot" | "band" | "hatch" }[] }) {
  return (
    <ul className={s.legend}>
      {items.map((it) => (
        <li key={it.label}>
          <svg width="18" height="10" aria-hidden>
            {it.kind === "dot" ? <circle cx="9" cy="5" r="4" fill={it.color} />
              : it.kind === "band" ? <rect x="0" y="1" width="18" height="8" fill={it.color} opacity="0.18" />
              : it.kind === "hatch" ? <rect x="0" y="1" width="18" height="8" fill="url(#hatch-unplanned)" stroke={it.color} />
              : <line x1="0" y1="5" x2="18" y2="5" stroke={it.color} strokeWidth="2" strokeLinecap="round" />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
