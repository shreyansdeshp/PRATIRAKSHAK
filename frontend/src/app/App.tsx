import { ChartDefs } from "../charts/kit";
import { CornerTag, RegistrationMarks } from "../components/primitives";
import { DevData } from "../screens/dev/DevData";
import { Primitives } from "../screens/dev/Primitives";
import { Stage } from "../stage/Stage";
import { useApp } from "../store/app";
import styles from "./App.module.css";

/** App shell: routes screens inside the 1920×1080 stage. Screens arrive in Stages 10–13. */
export function App() {
  const route = useApp((s) => s.route);
  if (route.screen === "dev-data") return <DevData />;
  return (
    <Stage>
      <ChartDefs />
      {route.screen === "dev-primitives" ? <Primitives /> : <Placeholder />}
    </Stage>
  );
}

function Placeholder() {
  return (
    <main className={styles.sheet} data-testid="sheet">
      <RegistrationMarks />
      <header className={styles.titleBlock}>
        <h1>Pratirakshak</h1>
        <p className={styles.motto}>Predict. Prepare. Protect.</p>
      </header>
      <CornerTag />
    </main>
  );
}
