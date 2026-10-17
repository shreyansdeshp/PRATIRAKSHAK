import { useApp } from "../store/app";
import { useStory } from "../story/story";
import s from "./SheetIndex.module.css";

export const SHEETS: { no: string; screen: string; path: string; label: string }[] = [
  { no: "00", screen: "hero", path: "/", label: "Map" },
  { no: "01", screen: "fleet", path: "/fleet", label: "Fleet" },
  { no: "02", screen: "base", path: "/base/HIM", label: "Base" },
  { no: "03", screen: "aircraft", path: "/aircraft/PR-S149", label: "Aircraft" },
  { no: "04", screen: "decision", path: "/decision/PR-S149", label: "Decision" },
  { no: "05", screen: "spares", path: "/spares/PR-S350", label: "Spares" },
  { no: "06", screen: "plan", path: "/plan", label: "Plan" },
  { no: "07", screen: "stress", path: "/stress", label: "Stress" },
  { no: "08", screen: "late", path: "/late", label: "Late" },
  { no: "09", screen: "intel", path: "/intel", label: "Intel" },
  { no: "10", screen: "results", path: "/results", label: "Results" },
  { no: "11", screen: "offline", path: "/offline", label: "Offline" },
  { no: "12", screen: "vendor", path: "/vendor", label: "Vendor" },
  { no: "13", screen: "lifecycle", path: "/lifecycle", label: "Lifecycle" },
  { no: "14", screen: "method", path: "/method", label: "Method" },
];

/** Compact sheet index (chart-series style). Hidden when storyline chrome is off. */
export function SheetIndex() {
  const { route, navigate } = useApp();
  const chrome = useStory((st) => !st.active || st.chrome);
  if (!chrome) return null;
  return (
    <nav className={s.index} aria-label="Sheets">
      {SHEETS.map((sh) => (
        <button key={sh.no} type="button" className={`${s.item} ${route.screen === sh.screen ? s.active : ""}`}
                onClick={() => navigate(sh.path)} title={sh.label}>
          <span className={s.no}>{sh.no}</span>
          <span className={s.label}>{sh.label}</span>
        </button>
      ))}
    </nav>
  );
}
