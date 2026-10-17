import { useEffect, useMemo, useState } from "react";

import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader, StatusGlyph } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { AircraftState, FleetState, Status } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import { useBeatParams } from "../../story/story";
import s from "./Offline.module.css";

const BASES: Record<string, string> = { SAH: "Sahyadri", ARV: "Aravalli", HIM: "Himshikhar", KAV: "Kaveri" };
const RANK: Record<Status, number> = { READY: 0, WATCH: 1, PULL: 2 };
const Z80 = 1.2816;

// standard normal CDF (Abramowitz–Stegun 7.1.26)
function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
}

/** ILLUSTRATIVE ageing rule: time passes (median shifts by age/24 days) and the 80 % band widens by (1 + age/48). */
function aged([p10, p50, p90]: [number, number, number], age: number): [number, number, number] {
  const k = 1 + age / 48, m = p50 - age / 24;
  return [m - (p50 - p10) * k, m, m + (p90 - p50) * k];
}
function pWithin(q: [number, number, number], w: number) {
  const sd = (w < q[1] ? q[1] - q[0] : q[2] - q[1]) / Z80;
  return phi((w - q[1]) / Math.max(sd, 1e-6));
}

interface Row { a: AircraftState; snap: Status; now: Status; p0: number; p: number; sys: string }

function evaluate(fleet: FleetState, age: number): Row[] {
  const { watch, pull } = fleet.risk;
  return fleet.aircraft.map((a) => {
    let best = { p: -1, p0: 0, sys: a.limiting_system as string };
    for (const sy of a.systems) {
      // offline estimate = snapshot risk + the extra risk from age; at age 0 it equals the snapshot exactly
      const p = Math.min(1, sy.p_fail + Math.max(0, pWithin(aged(sy.rul_days, age), fleet.window_days) - pWithin(sy.rul_days, fleet.window_days)));
      if (p > best.p) best = { p, p0: sy.p_fail, sys: sy.id };
    }
    const level = (p: number): Status => (p >= pull ? "PULL" : p >= watch ? "WATCH" : "READY");
    // escalate only when age pushes risk across a threshold it had not crossed at the snapshot; never relax
    const calc = RANK[level(best.p)] > RANK[level(best.p0)] ? level(best.p) : a.status;
    const now = RANK[calc] > RANK[a.status] ? calc : a.status;
    return { a, snap: a.status, now, p0: best.p0, p: best.p, sys: best.sys };
  });
}

const fmtAge = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** S11 — offline / edge mode: decisions keep working from the cached snapshot; confidence widens with data age. */
export function Offline() {
  const { data } = useSnapshots<{ state: FleetState }>(["state"]);
  const beat = useBeatParams();
  const [age, setAge] = useState<number>(Number(beat.get("age") ?? new URLSearchParams(window.location.search).get("age") ?? 7.7));
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const rows = useMemo(() => (data ? evaluate(data.state, age) : []), [data, age]);
  if (!data) return <div className={s.loading} />;
  const st = data.state;
  const changed = rows.filter((r) => r.now !== r.snap).sort((x, y) => y.p - x.p);
  const focus = changed[0] ?? [...rows].sort((x, y) => y.p - y.p0 - (x.p - x.p0))[0]!;
  const count = (k: "snap" | "now", v: Status) => rows.filter((r) => r[k] === v).length;

  return (
    <div className={s.sheet} data-testid="offline" data-online={online ? "1" : "0"}>
      <RegistrationMarks />
      <SheetHeader sheet="11" title="Offline at the edge" subtitle="No network at the base? Decisions still run on the last snapshot — and say how old it is" right={<SheetIndex />} />

      <div className={s.bar}>
        <span className={`${s.net} ${online ? s.netOn : s.netOff}`}><i />{online ? "Network connected" : "No network — running from cached snapshot"}</span>
        <span className={s.age}>Snapshot {st.snapshot} · age <b>{fmtAge(age)}</b></span>
        <label className={s.slider}>data age
          <input type="range" min={0} max={72} step={0.5} value={age} onChange={(e) => setAge(Number(e.target.value))} aria-label="data age in hours" />
          <span>{Math.round(age)} h</span>
        </label>
        <span className={s.chip}><ProvenanceChip kind="ILLUSTRATIVE" /></span>
      </div>

      <div className={s.grid}>
        <section className={s.board}>
          <div className={s.counts}>
            {(["READY", "WATCH", "PULL"] as Status[]).map((v) => (
              <div key={v} className={s.count}><StatusGlyph status={v} size={14} label /><b>{count("now", v)}</b><small>was {count("snap", v)}</small></div>
            ))}
          </div>
          {Object.keys(BASES).map((b) => (
            <div key={b} className={s.base}>
              <span className={s.baseName}>{BASES[b]}</span>
              <div className={s.cells}>
                {rows.filter((r) => r.a.base === b).map((r) => (
                  <span key={r.a.tail} className={`${s.cell} ${r.now !== r.snap ? s.raised : ""} ${r === focus ? s.focus : ""}`} title={`${r.a.tail} · ${r.now}`}>
                    <StatusGlyph status={r.now} size={11} /><em>{r.a.tail.slice(3)}</em>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className={s.small}><span className={s.ring} /> raised since the snapshot. The rule only ever tightens offline: a stale reading can move an aircraft to watch or repair, never back to ready.</p>
        </section>

        <section className={s.focusCard}>
          <div className={s.secHead}><span>{focus.a.tail} · {focus.sys.replace("_", " ")}</span><StatusGlyph status={focus.now} label /></div>
          <Band label="At snapshot" q={focus.a.systems.find((x) => x.id === focus.sys)!.rul_days} w={st.window_days} />
          <Band label={`Now, ${Math.round(age)} h later`} q={aged(focus.a.systems.find((x) => x.id === focus.sys)!.rul_days, age)} w={st.window_days} wide />
          <div className={s.risk}>
            <span>Chance of failure within {st.window_days} days</span>
            <b>{Math.round(focus.p0 * 100)} % → {Math.round(focus.p * 100)} %</b>
            <small>watch at {st.risk.watch * 100} % · pull at {st.risk.pull * 100} %</small>
          </div>
          <p className={s.small}>Without fresh readings the model cannot see whether wear sped up or slowed down, so the remaining-life band is widened and moved forward by the elapsed time. Rule shown here is illustrative: band × (1 + age/48 h).</p>
        </section>

        <section className={s.sync}>
          <div className={s.secHead}><span>Sync pending</span><span className={s.pending}>{changed.length}</span></div>
          <p className={s.small}>Decisions taken offline are queued and sent to the depot when the link returns.</p>
          <ol className={s.queue}>
            {changed.slice(0, 12).map((r) => (
              <li key={r.a.tail}><code>{r.a.tail}</code><span>{r.snap.toLowerCase()} → <b>{r.now.toLowerCase()}</b></span><small>{r.sys.replace("_", " ")} · {Math.round(r.p * 100)} %</small><i>⟳</i></li>
            ))}
            {changed.length === 0 && <li className={s.empty}>Nothing to sync — at this age no decision changes.</li>}
          </ol>
        </section>
      </div>
      <CornerTag />
    </div>
  );
}

function Band({ label, q, w, wide }: { label: string; q: [number, number, number]; w: number; wide?: boolean }) {
  const W = 520, max = 120, x = (d: number) => (Math.max(0, Math.min(max, d)) / max) * W;
  return (
    <div className={s.band}>
      <span className={s.bandLabel}>{label}</span>
      <svg width={W} height={40} aria-label={`${label}: remaining life ${Math.round(q[0])}–${Math.round(q[2])} days`}>
        <rect x={0} y={10} width={x(w)} height={20} fill="var(--pull)" opacity={0.12} />
        <line x1={x(w)} x2={x(w)} y1={4} y2={36} stroke="var(--pull)" strokeDasharray="3 2" />
        <rect x={x(q[0])} y={14} width={Math.max(2, x(q[2]) - x(q[0]))} height={12} rx={2} fill={wide ? "var(--watch)" : "var(--series-p3)"} opacity={0.5} />
        <line x1={x(q[1])} x2={x(q[1])} y1={10} y2={30} stroke="var(--ink)" strokeWidth={2} />
        <text x={x(q[1]) + 4} y={9} className={s.bandTxt}>{Math.round(q[1])} d</text>
      </svg>
    </div>
  );
}
