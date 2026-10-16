import styles from "./App.module.css";

/** Stage 0 placeholder: an empty chart sheet. Screens arrive from Stage 9 on. */
export function App() {
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
