import { CornerTag, HealthBar, NumberTick, ProvenanceChip, RegistrationMarks, SheetHeader, StatTile, StatusGlyph } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { FleetState, Rollup, World } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useApp } from "../../store/app";
import f from "./Fleet.module.css";

const SYS_NAME: Record<string, string> = { engines: "Engines", hydraulics: "Hydraulics", landing_gear: "Landing gear", flight_controls: "Flight controls",
  electrical: "Electrical", avionics: "Avionics", fuel: "Fuel", structure: "Structure" };

/** S1 — fleet readiness board: ready to deploy by type × base, average health, readiness floor, what limits readiness. */
export function Fleet() {
  const { data } = useSnapshots<{ world: World & { readiness_floor: number }; state: FleetState }>(["world", "state"]);
  const navigate = useApp((s) => s.navigate);
  if (!data) return <div className={f.loading} />;
  const { world, state } = data;
  const floor = world.readiness_floor ?? 0.5;
  const sum = state.summary;
  const notReady = state.aircraft.filter((a) => a.status !== "READY");
  const limiting = Object.entries(sum.limiting).sort((a, b) => b[1] - a[1]);
  const maxLim = Math.max(...limiting.map(([, n]) => n), 1);
  const belowFloor = world.types.flatMap((t) => world.bases.map((b) => ({ t, b, r: sum.by_base_type[`${b.id}|${t.id}`] })))
    .filter((x) => x.r && x.r.aircraft > 0 && x.r.ready / x.r.aircraft < floor);

  return (
    <div className={f.sheet} data-testid="fleet">
      <RegistrationMarks />
      <SheetHeader sheet="01" title="Fleet readiness board" subtitle={`Ready to deploy by type and base · ${state.snapshot} · readiness floor ${Math.round(floor * 100)} % per type per base`}
        right={<SheetIndex />} />

      <div className={f.tiles}>
        <StatTile label="Ready to deploy" value={<NumberTick value={sum.fleet.ready} />} unit={`/ ${sum.fleet.aircraft}`} accent
          note={`${Math.round((sum.fleet.ready / sum.fleet.aircraft) * 100)} % of the fleet`} />
        <StatTile label="On watch" value={<NumberTick value={sum.fleet.watch} />} note="flying; risk rising" />
        <StatTile label="Pulled from line" value={<NumberTick value={sum.fleet.pull} />} note="grounded for work" />
        <StatTile label="Average health" value={<NumberTick value={sum.fleet.avg_health} />} note="criticality-weighted, 0–100" />
        <StatTile label="Cells below floor" value={belowFloor.length} note={belowFloor.length ? belowFloor.map((x) => `${x.t.name} @ ${x.b.id}`).join(" · ") : "none"} />
      </div>

      <div className={f.body}>
        <section className={f.board} aria-label="Readiness by type and base">
          <div className={f.headRow}>
            <span className={f.typeHead}>Type</span>
            {world.bases.map((b) => (
              <button key={b.id} type="button" className={f.baseHead} onClick={() => navigate(`/base/${b.id}`)}>
                <span className={f.baseHeadName}>{b.name.replace(" Air Base", "")}</span>
                <span className={f.baseHeadMeta}>{b.region}</span>
              </button>
            ))}
            <span className={f.totalHead}>Fleet</span>
          </div>

          {world.types.map((t) => {
            const tr = sum.by_type[t.id]!;
            return (
              <div key={t.id} className={f.row}>
                <div className={f.typeCell}>
                  <span className={f.typeName}>{t.name}</span>
                  <span className={f.typeRole}>{t.role} · {t.engines} engine{t.engines > 1 ? "s" : ""}</span>
                  <span className={f.typeData}>engine data {t.cmapss_subset} <ProvenanceChip kind="REAL" /></span>
                </div>
                {world.bases.map((b) => {
                  const r = sum.by_base_type[`${b.id}|${t.id}`];
                  return <Cell key={b.id} r={r} floor={floor} onClick={() => navigate(`/base/${b.id}`)} />;
                })}
                <div className={f.totalCell}>
                  <span className={f.big}>{tr.ready}<small>/{tr.aircraft}</small></span>
                  <span className={f.cellLabel}>ready</span>
                  <HealthBar value={tr.avg_health} width={110} />
                  <span className={f.cellLabel}>average health</span>
                </div>
              </div>
            );
          })}

          <div className={`${f.row} ${f.totalRow}`}>
            <div className={f.typeCell}><span className={f.typeName}>All types</span></div>
            {world.bases.map((b) => {
              const r = sum.by_base[b.id]!;
              return (
                <div key={b.id} className={f.baseTotal}>
                  <span className={f.big}>{r.ready}<small>/{r.aircraft}</small></span>
                  <HealthBar value={r.avg_health} width={110} />
                </div>
              );
            })}
            <div className={f.totalCell}>
              <span className={f.big}>{sum.fleet.ready}<small>/{sum.fleet.aircraft}</small></span>
              <HealthBar value={sum.fleet.avg_health} width={110} />
            </div>
          </div>
        </section>

        <aside className={f.side}>
          <h2 className={f.h2}>What limits readiness</h2>
          <p className={f.note}>Limiting system of the {notReady.length} aircraft not ready. The average health bar never hides a single no-go: each aircraft is gated by its worst critical system.</p>
          <ul className={f.limits}>
            {limiting.map(([sys, n]) => (
              <li key={sys}>
                <span className={f.limName}>{SYS_NAME[sys] ?? sys}</span>
                <span className={f.limBar}><span style={{ width: `${(n / maxLim) * 100}%` }} /></span>
                <span className={f.limN}>{n}</span>
              </li>
            ))}
          </ul>
          <h2 className={f.h2}>Most at risk now</h2>
          <ul className={f.atRisk}>
            {[...notReady].sort((a, b) => b.limiting_p - a.limiting_p).slice(0, 7).map((a) => (
              <li key={a.tail}>
                <button type="button" onClick={() => navigate(`/aircraft/${a.tail}`)}>
                  <StatusGlyph status={a.status} />
                  <span className={f.tail}>{a.tail}</span>
                  <span className={f.riskSys}>{SYS_NAME[a.limiting_system]}</span>
                  <span className={f.riskP}>{Math.round(a.limiting_p * 100)} %</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={f.foot}>Risk = chance the limiting system fails within {state.window_days} days. Status: <StatusGlyph status="READY" /> below 10 % · <StatusGlyph status="WATCH" /> 10–30 % · <StatusGlyph status="PULL" /> 30 % or more.</p>
          <div className={f.prov}><span>Engines <ProvenanceChip kind="REAL" /></span><span>Other systems <ProvenanceChip kind="SIMULATED" /></span></div>
        </aside>
      </div>
      <CornerTag />
    </div>
  );
}

function Cell({ r, floor, onClick }: { r?: Rollup; floor: number; onClick: () => void }) {
  if (!r || r.aircraft === 0) return <div className={`${f.cell} ${f.empty}`}><span className={f.cellLabel}>not based here</span></div>;
  const share = r.ready / r.aircraft;
  const below = share < floor;
  const w = 168;
  const seg = (n: number) => (n / r.aircraft) * w;
  return (
    <button type="button" className={`${f.cell} ${below ? f.below : ""}`} onClick={onClick} aria-label={`${r.ready} of ${r.aircraft} ready`}>
      <span className={f.big}>{r.ready}<small>/{r.aircraft}</small></span>
      <svg width={w} height={18} className={f.mini} aria-hidden>
        {[["ready", r.ready], ["watch", r.watch], ["pull", r.pull]].reduce<{ x: number; els: JSX.Element[] }>((acc, [k, n]) => {
          const ww = seg(n as number);
          if (ww > 0) acc.els.push(<rect key={k as string} x={acc.x} y={4} width={Math.max(0, ww - 2)} height={10} rx={1.5} fill={`var(--${k})`} />);
          acc.x += ww;
          return acc;
        }, { x: 0, els: [] }).els}
        <line x1={floor * w} x2={floor * w} y1={0} y2={18} stroke="var(--ink)" strokeWidth={1.5} />
      </svg>
      <span className={f.counts}>
        <StatusGlyph status="READY" size={9} />{r.ready}<StatusGlyph status="WATCH" size={9} />{r.watch}<StatusGlyph status="PULL" size={9} />{r.pull}
        {below && <em>below floor</em>}
      </span>
    </button>
  );
}
