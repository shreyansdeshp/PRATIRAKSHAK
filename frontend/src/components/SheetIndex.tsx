
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
];

/** Superseded by the global NavBar (one taskbar on every page); kept so sheet headers need no edits. */
export function SheetIndex(): null {
  return null;
}
