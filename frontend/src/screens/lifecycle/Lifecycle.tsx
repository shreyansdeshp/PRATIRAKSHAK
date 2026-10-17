import { useMemo } from "react";

import { CornerTag, HealthBar, NumberTick, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile, StatusGlyph } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import { useSnapshots } from "../../data/useSnapshots";
import type { FleetState, Meta, Status, World } from "../../data/types";
import { useApp } from "../../store/app";
import l from "./Lifecycle.module.css";

/* ----- local narrow types for world.json engines ----- */
interface WorldEngine {
  position: number;
  subset: string;
  time_since_overhaul_h: number;
}

interface WorldAircraftWithEngines {
  tail: string;
  type: string;
  base: string;
  age_years: number;
  airframe_hours: number;
  airframe_life_hours: number;
  engines?: WorldEngine[];
}

interface WorldWithEngines extends Omit<World, "aircraft"> {
  aircraft: WorldAircraftWithEngines[];
}

interface MergedAircraft {
  tail: string;
  type: string;
  base: string;
  age_years: number;
  airframe_hours: number;
  airframe_life_hours: number;
  life_used_pct: number;
  body_health: number;
  status: Status;
  engines: WorldEngine[];
}

interface EngineEntry {
  tail: string;
  base: string;
  type: string;
  position: number;
  subset: string;
  time_since_overhaul_h: number;
}

const AGE_BUCKETS = [
  { label: "25–30 yr", min: 25, max: 30 },
  { label: "20–25 yr", min: 20, max: 25 },
  { label: "15–20 yr", min: 15, max: 20 },
  { label: "10–15 yr", min: 10, max: 15 },
  { label: "5–10 yr", min: 5, max: 10 },
  { label: "0–5 yr", min: 0, max: 5 },
];

/** Sheet 13 — Lifecycle: airframe design life, engine overhaul intervals, and fleet age pyramid. */
export function Lifecycle() {
  const { data } = useSnapshots<{ world: WorldWithEngines; state: FleetState; meta: Meta }>([
    "world",
    "state",
    "meta",
  ]);
  const navigate = useApp((s) => s.navigate);

  const { allEngines, byType, pyramidData, stats } = useMemo(() => {
    if (!data) return { allEngines: [], byType: {}, pyramidData: [], stats: null };

    const stateMap = new Map(data.state.aircraft.map((a) => [a.tail, a]));

    const merged: MergedAircraft[] = data.world.aircraft.map((wa) => {
      const sa = stateMap.get(wa.tail);
      const lifePct = sa?.airframe_life_used
        ? sa.airframe_life_used * 100
        : (wa.airframe_hours / wa.airframe_life_hours) * 100;
      return {
        tail: wa.tail,
        type: wa.type,
        base: wa.base,
        age_years: wa.age_years,
        airframe_hours: wa.airframe_hours,
        airframe_life_hours: wa.airframe_life_hours,
        life_used_pct: lifePct,
        body_health: sa?.body_health ?? 100,
        status: sa?.status ?? "READY",
        engines: wa.engines ?? [],
      };
    });

    // Group by type
    const grouped: Record<string, MergedAircraft[]> = {};
    for (const a of merged) {
      (grouped[a.type] ??= []).push(a);
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => b.life_used_pct - a.life_used_pct);
    }

    // Collect all engines across fleet
    const engines: EngineEntry[] = [];
    for (const a of merged) {
      for (const e of a.engines) {
        engines.push({
          tail: a.tail,
          base: a.base,
          type: a.type,
          position: e.position,
          subset: e.subset,
          time_since_overhaul_h: e.time_since_overhaul_h,
        });
      }
    }
    engines.sort((a, b) => b.time_since_overhaul_h - a.time_since_overhaul_h);

    // Fleet age pyramid
    const pyramid = AGE_BUCKETS.map((b) => {
      const inBucket = merged.filter((a) => a.age_years >= b.min && a.age_years < b.max);
      const gar = inBucket.filter((a) => a.type === "GAR").length;
      const pra = inBucket.filter((a) => a.type === "PRA").length;
      const vah = inBucket.filter((a) => a.type === "VAH").length;
      const shi = inBucket.filter((a) => a.type === "SHI").length;
      return {
        label: b.label,
        total: inBucket.length,
        gar,
        pra,
        vah,
        shi,
      };
    });

    // Stats
    const totalAc = merged.length;
    const avgAge = totalAc > 0 ? merged.reduce((acc, a) => acc + a.age_years, 0) / totalAc : 0;
    const avgLifeUsed = totalAc > 0 ? merged.reduce((acc, a) => acc + a.life_used_pct, 0) / totalAc : 0;
    const nearOverhaul = engines.filter((e) => e.time_since_overhaul_h >= 300).length;

    return {
      mergedAircraft: merged,
      allEngines: engines,
      byType: grouped,
      pyramidData: pyramid,
      stats: { totalAc, avgAge, avgLifeUsed, totalEngines: engines.length, nearOverhaul },
    };
  }, [data]);

  if (!data || !stats) return <div className={l.loading} />;
  const { world } = data;

  const maxEngineHours = Math.max(...allEngines.map((e) => e.time_since_overhaul_h), 500);

  return (
    <div className={l.sheet} data-testid="lifecycle">
      <RegistrationMarks />
      <SheetHeader
        sheet="13"
        title="Fleet lifecycle & structural life"
        subtitle={`${stats.totalAc} aircraft · airframe design life, engine intervals, and fleet age distribution`}
        right={<SheetIndex />}
      />

      <div className={l.tiles}>
        <StatTile label="Fleet size" value={<NumberTick value={stats.totalAc} />} unit="aircraft" accent />
        <StatTile label="Average fleet age" value={<NumberTick value={stats.avgAge} format={(v) => v.toFixed(1)} />} unit="years" />
        <StatTile label="Avg airframe life used" value={<NumberTick value={stats.avgLifeUsed} format={(v) => `${Math.round(v)}%`} />} note="hours vs design limit" />
        <StatTile label="Engines tracked" value={<NumberTick value={stats.totalEngines} />} unit="units" note="across 72 airframes" />
        <StatTile label="Near overhaul (≥300h)" value={<NumberTick value={stats.nearOverhaul} />} note="inspection priority" />
      </div>

      <div className={l.body}>
        {/* Left Column: Age Pyramid & Engine Overhaul */}
        <div className={l.leftCol}>
          {/* Fleet Age Pyramid */}
          <div className={l.card}>
            <div className={l.cardHeader}>
              <span className={l.cardTitle}>Fleet age pyramid</span>
              <span className={l.cardMeta}>5-year cohorts × 4 types</span>
            </div>
            <div className={l.pyramidGrid}>
              {pyramidData.map((row) => (
                <div key={row.label} className={l.pyramidRow}>
                  <span className={l.bucketLabel}>{row.label}</span>
                  <div className={l.stackedTrack}>
                    {row.gar > 0 && (
                      <div
                        className={l.segGAR}
                        style={{ width: `${(row.gar / 25) * 100}%` }}
                        title={`Garjan: ${row.gar}`}
                      />
                    )}
                    {row.pra > 0 && (
                      <div
                        className={l.segPRA}
                        style={{ width: `${(row.pra / 25) * 100}%` }}
                        title={`Prahar: ${row.pra}`}
                      />
                    )}
                    {row.vah > 0 && (
                      <div
                        className={l.segVAH}
                        style={{ width: `${(row.vah / 25) * 100}%` }}
                        title={`Vahak: ${row.vah}`}
                      />
                    )}
                    {row.shi > 0 && (
                      <div
                        className={l.segSHI}
                        style={{ width: `${(row.shi / 25) * 100}%` }}
                        title={`Shikshak: ${row.shi}`}
                      />
                    )}
                  </div>
                  <span className={l.bucketTotal}>{row.total} ac</span>
                </div>
              ))}
            </div>
            <div className={l.typeLegend}>
              <span><span className={`${l.legendDot} ${l.segGAR}`} />Garjan</span>
              <span><span className={`${l.legendDot} ${l.segPRA}`} />Prahar</span>
              <span><span className={`${l.legendDot} ${l.segVAH}`} />Vahak</span>
              <span><span className={`${l.legendDot} ${l.segSHI}`} />Shikshak</span>
            </div>
          </div>

          {/* Engine Time Since Overhaul */}
          <div className={l.card} style={{ flex: 1 }}>
            <div className={l.cardHeader}>
              <span className={l.cardTitle}>Engine time since overhaul</span>
              <span className={l.cardMeta}>{allEngines.length} engines (sorted)</span>
            </div>
            <div className={l.engineScroll}>
              {allEngines.map((e) => {
                const pct = Math.min(100, (e.time_since_overhaul_h / maxEngineHours) * 100);
                const isHigh = e.time_since_overhaul_h >= 350;
                const isMed = e.time_since_overhaul_h >= 200 && !isHigh;
                return (
                  <div
                    key={`${e.tail}-${e.position}`}
                    className={l.engineRow}
                    onClick={() => navigate(`/aircraft/${e.tail}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter" || evt.key === " ") navigate(`/aircraft/${e.tail}`);
                    }}
                  >
                    <span className={l.engineTail}>
                      {e.tail} #{e.position}
                    </span>
                    <span className={l.engineSubset}>{e.subset}</span>
                    <div className={l.engineTrack}>
                      <div
                        className={`${l.engineFill} ${isHigh ? l.engineFillHigh : isMed ? l.engineFillMed : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={l.engineHours}>{e.time_since_overhaul_h.toFixed(1)} h</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: 4 Type Panels for Airframe Life Used */}
        <div className={l.rightCol}>
          {world.types.map((t) => {
            const list = byType[t.id] ?? [];
            const avgTypeLife = list.length > 0 ? list.reduce((acc, a) => acc + a.life_used_pct, 0) / list.length : 0;
            return (
              <div key={t.id} className={l.typePanel}>
                <div className={l.typePanelHeader}>
                  <div className={l.typeTitleGroup}>
                    <span className={`${l.typeBadge} ${l[`typeBadge${t.id}`]}`}>{t.letter}</span>
                    <span className={l.typeName}>{t.name}</span>
                    <span className={l.typeRole}>{t.role}</span>
                  </div>
                  <span className={l.typeLifeMeta}>
                    {list.length} ac · {t.airframe_life_hours.toLocaleString()} h life · avg {Math.round(avgTypeLife)}%
                  </span>
                </div>

                <div className={l.aircraftList}>
                  {list.map((a) => {
                    const isHighLife = a.life_used_pct >= 50;
                    const isMedLife = a.life_used_pct >= 30 && !isHighLife;
                    return (
                      <div
                        key={a.tail}
                        data-tail={a.tail}
                        className={l.aircraftRow}
                        onClick={() => navigate(`/aircraft/${a.tail}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(evt) => {
                          if (evt.key === "Enter" || evt.key === " ") navigate(`/aircraft/${a.tail}`);
                        }}
                      >
                        <StatusGlyph status={a.status} size={10} />
                        <span className={l.tail}>{a.tail}</span>
                        <span className={l.baseBadge}>{a.base}</span>
                        <span className={l.age}>{a.age_years.toFixed(1)} y</span>
                        <div className={l.lifeCell}>
                          <div className={l.lifeBar}>
                            <div
                              className={`${l.lifeFill} ${isHighLife ? l.lifeFillHigh : isMedLife ? l.lifeFillMed : ""}`}
                              style={{ width: `${Math.min(100, a.life_used_pct)}%` }}
                            />
                          </div>
                          <span className={l.lifePct}>{Math.round(a.life_used_pct)}%</span>
                        </div>
                        <span className={l.hours}>
                          {Math.round(a.airframe_hours).toLocaleString()} h
                        </span>
                        <div className={l.bodyHealth}>
                          <HealthBar value={a.body_health} width={50} showValue={false} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={l.footer}>
        <div className={l.prov}>
          <span>Ages &amp; airframe hours <ProvenanceChip kind="ILLUSTRATIVE" /></span>
          <span>Body health &amp; systems <ProvenanceChip kind="SIMULATED" /></span>
        </div>
      </div>
      <CornerTag />
    </div>
  );
}
