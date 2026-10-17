import { ChartDefs } from "../charts/kit";
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
import { Method } from "../screens/method/Method";
import { Offline } from "../screens/offline/Offline";
import { Plan } from "../screens/plan/Plan";
import { Results } from "../screens/results/Results";
import { Spares } from "../screens/spares/Spares";
import { Stress } from "../screens/stress/Stress";
import { Vendor } from "../screens/vendor/Vendor";
import { Stage } from "../stage/Stage";
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
  if (route.screen === "dev-data") return <DevData />;
  return (
    <Stage>
      <ChartDefs />
      <Screen screen={route.screen} param={route.param} />
      {story && <StoryController />}
    </Stage>
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
    case "method": return <Method />;
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
