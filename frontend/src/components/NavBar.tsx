import { useEffect, useState } from "react";

import { useApp } from "../store/app";
import { useStory } from "../story/story";
import { SHEETS } from "./SheetIndex";
import s from "./NavBar.module.css";

export const NAV_H = 56;

const readTheme = () => { try { return localStorage.getItem("theme") ?? "iaf"; } catch { return "iaf"; } };

/** One readable taskbar on every page (outside the scaled stage, so it never shrinks). */
export function NavBar() {
  const { route, navigate } = useApp();
  const show = useStory((st) => !st.active || st.chrome);
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* private mode */ }
  }, [theme]);
  if (!show) return null;
  return (
    <nav className={s.bar} style={{ height: NAV_H }} aria-label="Sheets">
      <button type="button" className={s.brand} onClick={() => navigate("/")}>PRATIRAKSHAK</button>
      <div className={s.items}>
        {SHEETS.map((sh) => (
          <button key={sh.no} type="button" className={`${s.item} ${route.screen === sh.screen ? s.active : ""}`} onClick={() => navigate(sh.path)}>
            {sh.label}
          </button>
        ))}
      </div>
      <button type="button" className={s.theme} onClick={() => setTheme(theme === "iaf" ? "paper" : "iaf")} title="Switch colour theme">
        {theme === "iaf" ? "Air Force theme" : "Paper theme"}
      </button>
    </nav>
  );
}
