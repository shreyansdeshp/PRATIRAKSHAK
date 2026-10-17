import { DevData } from "../screens/dev/DevData";
import styles from "./App.module.css";

/** Placeholder shell until Stage 9 adds the router and screens; /dev/data checks the data layer. */
export function App() {
  if (window.location.pathname.startsWith("/dev/data")) return <DevData />;
  return (
    <main className={styles.sheet} data-testid="sheet">
      <span className={`${styles.reg} ${styles.tl}`} aria-hidden />
      <span className={`${styles.reg} ${styles.tr}`} aria-hidden />
      <span className={`${styles.reg} ${styles.bl}`} aria-hidden />
      <span className={`${styles.reg} ${styles.br}`} aria-hidden />

      <header className={styles.titleBlock}>
        <h1>Pratirakshak</h1>
        <p className={styles.motto}>Predict. Prepare. Protect.</p>
      </header>

      <footer className={styles.edition}>
        <span className="mono">SHEET 00 · SCAFFOLD · EDITION D+00</span>
        <span className={styles.tag}>SIMULATED EXERCISE DATA</span>
      </footer>
    </main>
  );
}
