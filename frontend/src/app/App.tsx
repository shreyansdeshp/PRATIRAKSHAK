import { Component, type ReactNode } from "react";

import { ChartDefs } from "../charts/kit";
import { NavBar, navHeight } from "../components/NavBar";
import { CornerTag, RegistrationMarks } from "../components/primitives";
import { Showroom } from "../screens/aircraft/Showroom";
import { BaseView } from "../screens/base/BaseView";
import { Decision } from "../screens/decision/Decision";
import { DevData } from "../screens/dev/DevData";
import { Primitives } from "../screens/dev/Primitives";
import { Fleet } from "../screens/fleet/Fleet";
import { Hero } from "../screens/hero/Hero";
import { Intel } from "../screens/intel/Intel";
import { Late } from "../screens/late/Late";
import { Lifecycle } from "../screens/lifecycle/Lifecycle";
import { Offline } from "../screens/offline/Offline";
import { Plan } from "../screens/plan/Plan";
import { Results } from "../screens/results/Results";
import { Spares } from "../screens/spares/Spares";
import { Stress } from "../screens/stress/Stress";
import { Vendor } from "../screens/vendor/Vendor";
import { Stage } from "../stage/Stage";
import { useSnapshotError } from "../data/useSnapshots";
import { SHEETS } from "../components/SheetIndex";
import { useApp } from "../store/app";
import { StoryController } from "../story/StoryController";
import { useStory } from "../story/story";
import styles from "./App.module.css";

/**
 * App shell: routes screens inside the 1920×1080 stage; storyline mode adds keyboard control + captions.
 * Every sheet is wired here once — screen owners edit only their own folder (docs/FRONTEND_CONVENTIONS.md).
 */
export function App() {
  const route = useApp((s) => s.route);
  const story = useStory((s) => s.active);
  const loadError = useSnapshotError((s) => s.error);
  if (route.screen === "dev-data") return <DevData />;
  const navShown = !story || useStory.getState().chrome;
  return (
    <>
    <NavBar />
    <Stage top={navShown ? navHeight(route.screen, route.param) : 0} footer={<TitleBlock screen={route.screen} />}>
      <ChartDefs />
      {loadError ? <SheetError detail={loadError} /> : (
        <Boundary key={`${route.screen}/${route.param ?? ""}`}><Screen screen={route.screen} param={route.param} /></Boundary>
      )}
      {story && <StoryController />}
    </Stage>
    </>
  );
}

function Screen({ screen, param }: { screen: string; param: string | null }) {
  switch (screen) {
    case "hero": return <Hero />;
    case "fleet": return <Fleet />;
    case "base": return <BaseView id={param ?? "HIM"} />;
    case "aircraft": return <Showroom tail={param ?? "PR-S149"} />;
    case "decision": return <Decision tail={param ?? "PR-S149"} />;
    case "spares": return <Spares tail={param ?? "PR-S350"} />;
    case "plan": return <Plan />;
    case "stress": return <Stress />;
    case "late": return <Late />;
    case "intel": return <Intel />;
    case "results": return <Results />;
    case "offline": return <Offline />;
    case "vendor": return <Vendor />;
    case "lifecycle": return <Lifecycle />;
    case "dev-primitives": return <Primitives />;
    default: return <NotFound name={screen} />;
  }
}

function NotFound({ name }: { name: string }) {
  return (
    <main className={styles.sheet} data-testid="sheet">
      <RegistrationMarks />
      <header className={styles.titleBlock}>
        <h1>Pratirakshak</h1>
        <p className={styles.motto}>No sheet called “{name}”.</p>
      </header>
      <CornerTag />
    </main>
  );
}

/** Shown instead of a blank page when a snapshot file is missing or a sheet fails to render. */
function SheetError({ detail }: { detail: string }) {
  return (
    <main className={styles.sheet} data-testid="sheet-error">
      <RegistrationMarks />
      <header className={styles.titleBlock}>
        <h1>Sheet unavailable</h1>
        <p className={styles.motto}>The data for this sheet could not be read. Re-run <code>./tasks.ps1 export</code> (or <code>make export</code>) and reload.</p>
        <p className={styles.motto}><small>{detail}</small></p>
      </header>
      <CornerTag />
    </main>
  );
}

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: String(e) }; }
  render() { return this.state.error ? <SheetError detail={this.state.error} /> : this.props.children; }
}

/** Title-block footer printed on every sheet. */
function TitleBlock({ screen }: { screen: string }) {
  const sh = SHEETS.find((x) => x.screen === screen);
  return (
    <>
      <span><b>PRATIRAKSHAK</b> · SIH26249</span>
      <span>Sheet {sh?.no ?? "—"} / 13 · {sh?.label ?? ""}</span>
      <span>Rev A · Simulated data · 2026-06-01</span>
    </>
  );
}
