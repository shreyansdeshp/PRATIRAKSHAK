import { ChartDefs } from "../charts/kit";
import { CornerTag, RegistrationMarks } from "../components/primitives";
import { DevData } from "../screens/dev/DevData";
import { Primitives } from "../screens/dev/Primitives";
import { Showroom } from "../screens/aircraft/Showroom";
import { BaseView } from "../screens/base/BaseView";
import { Fleet } from "../screens/fleet/Fleet";
import { Hero } from "../screens/hero/Hero";
import { Stage } from "../stage/Stage";
import { useApp } from "../store/app";
import { StoryController } from "../story/StoryController";
import { useStory } from "../story/story";
import styles from "./App.module.css";

/** App shell: routes screens inside the 1920×1080 stage; storyline mode adds keyboard control + captions. */
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
    case "dev-primitives": return <Primitives />;
    default: return <Placeholder name={screen} />;
  }
}

function Placeholder({ name }: { name: string }) {
  return (
    <main className={styles.sheet} data-testid="sheet">
      <RegistrationMarks />
      <header className={styles.titleBlock}>
        <h1>Pratirakshak</h1>
        <p className={styles.motto}>Sheet “{name}” is built in a later stage.</p>
      </header>
      <CornerTag />
    </main>
  );
}
