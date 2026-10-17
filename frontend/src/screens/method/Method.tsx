import { CornerTag, ProvenanceChip, RegistrationMarks, SheetHeader } from "../../components/primitives";
import { SheetIndex } from "../../components/SheetIndex";
import type { FleetState, Provenance } from "../../data/types";
import { useSnapshots } from "../../data/useSnapshots";
import s from "./Method.module.css";

interface Meta { seed: number; demo_seed: number; horizon_days: number; provenance_legend: Record<Provenance, string> }

const ACTIONS: [string, string][] = [
  ["Serve normally", "risk below the watch line"],
  ["Monitor closely", "watch line crossed, nothing due yet"],
  ["Schedule service", "fits a hangar slot before the risk peaks"],
  ["Expedite spare", "the part will not arrive in time by the normal route"],
  ["Pull from line", "risk over the limit for a mission-critical system"],
  ["Verify sensor", "the reading itself is not trusted"],
];

const REAL_VS_SIM: [string, Provenance][] = [
  ["Engine wear and remaining life (NASA C-MAPSS run-to-failure)", "REAL"],
  ["Hydraulics sensor ranges (UCI hydraulic test rig)", "REAL-ANCHORED"],
  ["Base climate (ERA5 via Open-Meteo), road routes (OSM/OSRM), terrain", "REAL-ANCHORED"],
  ["Seven non-engine systems, the fleet, its 90 days of flying", "SIMULATED"],
  ["Costs (₵), stock levels, delivery times, airframe ages", "ILLUSTRATIVE"],
];

/** S14 — method & provenance: the rule, the models, the assumptions, what is real, what is not. */
export function Method() {
  const { data } = useSnapshots<{ meta: Meta; state: FleetState }>(["meta", "state"]);
  if (!data) return <div className={s.loading} />;
  const { meta, state } = data;
  return (
    <div className={s.sheet} data-testid="method">
      <RegistrationMarks />
      <SheetHeader sheet="14" title="Method & provenance" subtitle="How a decision is made, what it rests on, and where it stops being real" right={<SheetIndex />} />
      <div className={s.cols}>
        <section>
          <h2>1 · The rule</h2>
          <div className={s.rule}>
            <span>sensor readings</span><i>→</i><span>trust check</span><i>→</i><span>remaining life<br /><small>p10 · p50 · p90</small></span><i>→</i>
            <span className={s.key}>P(fail within {state.window_days} d)</span><i>→</i><span>action</span>
          </div>
          <p>Every system on every aircraft gets a chance of failing inside the next {state.window_days} days. Above <b>{state.risk.watch * 100} %</b> it is watched; above <b>{state.risk.pull * 100} %</b> on a mission-critical system the aircraft is pulled. The weakest system decides, so an average health score can never hide a single no-go.</p>
          <ul className={s.actions}>{ACTIONS.map(([a, w]) => <li key={a}><b>{a}</b><span>{w}</span></li>)}</ul>
          <h2>2 · The models</h2>
          <p><b>Engines</b> — gradient-boosted trees (LightGBM) on real C-MAPSS sensor windows, with split-conformal intervals so the 80 % band is checked against held-out engines. A sequence model was tried and kept only if ≥ 3 % better; it was not. <ProvenanceChip kind="REAL" /></p>
          <p><b>Other systems</b> — the same model family trained on a physics-flavoured wear generator (gamma-process degradation, shared usage and climate drivers). Validated only against its own synthetic truth. <ProvenanceChip kind="SIMULATED" /></p>
          <p><b>Planning</b> — a constraint solver (OR-Tools CP-SAT) packs services into hangar bays and technician hours; spares are routed by road or air on real route geometry.</p>
        </section>

        <section>
          <h2>3 · Assumptions, stated</h2>
          <ol className={s.assume}>
            <li><b>Time scaling.</b> Engine degradation shapes are real; time-scaling is a simulation parameter. One C-MAPSS cycle stands for several sorties so that 90 days contain real end-of-life events. <small>SPEC §3.3</small></li>
            <li><b>Synthetic systems.</b> C-MAPSS covers engines only. The other seven systems are generated — plausible and coupled to usage and weather, but never presented as fleet data. <small>SPEC §7.1</small></li>
            <li><b>Independence.</b> Aircraft risk = 1 − Π(1 − pᵢ): systems are treated as independent once shared drivers (usage, climate, age) are accounted for. Couplings live in the generator and the features, not in this formula. <small>SPEC §7.6</small></li>
          </ol>
          <h2>4 · How it was tested</h2>
          <p>Four policies — run to failure, fixed intervals, threshold alarms, Pratirakshak — fly the same {meta.horizon_days}-day fleet on 10 seeds with common random numbers, so every difference comes from decisions. Seed {meta.seed}; the story uses seed {meta.demo_seed}, the median run.</p>
          <h2>5 · Limits</h2>
          <ul className={s.limits}>
            <li>Gains over a good threshold-alarm policy are modest in availability; the clear win is far fewer unplanned and in-flight failures.</li>
            <li>Sensor-trust scoring and bundled maintenance showed no measurable effect in the ablations.</li>
            <li>One engine subset (FD003) under-covers its interval: flagged, not hidden.</li>
            <li>No real military data, logistics or costs were used. Numbers are a demonstration of method, not a forecast.</li>
          </ul>
        </section>

        <section>
          <h2>6 · Real or not</h2>
          <table className={s.prov}><tbody>{REAL_VS_SIM.map(([w, k]) => <tr key={w}><td><ProvenanceChip kind={k} /></td><td>{w}</td></tr>)}</tbody></table>
          <dl className={s.legend}>{(Object.keys(meta.provenance_legend) as Provenance[]).map((k) => <div key={k}><dt>{k}</dt><dd>{meta.provenance_legend[k]}</dd></div>)}</dl>
          <h2>7 · Credits</h2>
          <p className={s.credits}>NASA Ames PCoE — C-MAPSS (Saxena &amp; Goebel, 2008) · UCI hydraulic systems #447, CC BY 4.0 (Helwig et al.) · Open-Meteo / ERA5, CC BY 4.0 · Natural Earth, public domain · AWS Terrain Tiles (Terrarium) · OpenFreeMap / OpenStreetMap contributors, ODbL · OSRM · Source Serif 4, IBM Plex — SIL OFL 1.1. Full list in CREDITS.md.</p>
        </section>
      </div>
      <CornerTag />
    </div>
  );
}
