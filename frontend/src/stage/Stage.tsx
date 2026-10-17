import { type ReactNode, useEffect, useState } from "react";

import styles from "./Stage.module.css";

const W = 1920;
const H = 1080;

/**
 * The 1920×1080 design space, scaled to fit the window and letterboxed on paper (SPEC §11.7).
 * Every screen is composed for 16:9, so any screenshot is slide-ready.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className={styles.viewport}>
      <div className={styles.stage} style={{ transform: `translate(-50%, -50%) scale(${scale})` }} data-testid="stage">
        {children}
      </div>
    </div>
  );
}
