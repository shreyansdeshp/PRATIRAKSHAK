import { useEffect, useState } from "react";

import { useApp } from "../store/app";
import { useStory } from "../story/story";
import { Crest } from "./Crest";
import s from "./NavBar.module.css";

const MAIN_H = 56, LINE_H = 8, SUB_H = 40;

interface Tab { label: string; path: string; screens: string[] }
const TABS: Tab[] = [
  { label: "Map", path: "/", screens: ["hero"] },
  { label: "Fleet", path: "/fleet", screens: ["fleet", "base"] },
  { label: "Aircraft", path: "/aircraft/PR-S149", screens: ["aircraft", "intel"] },
  { label: "Decision", path: "/decision/PR-S149", screens: ["decision"] },
  { label: "Spares", path: "/spares/PR-S350", screens: ["spares"] },
  { label: "Plan", path: "/plan", screens: ["plan"] },
  { label: "Proof", path: "/results", screens: ["results", "stress", "late"] },
];

const BASES = [["SAH", "Sahyadri"], ["ARV", "Aravalli"], ["HIM", "Himshikhar"], ["KAV", "Kaveri"]] as const;

interface Sub { label: string; path: string; on: boolean }
function subItems(screen: string, param: string | null): Sub[] {
  if (screen === "fleet" || screen === "base") {
    return [{ label: "All bases", path: "/fleet", on: screen === "fleet" },
      ...BASES.map(([id, name]) => ({ label: name, path: `/base/${id}`, on: screen === "base" && param === id }))];
  }
  if (screen === "aircraft" || screen === "intel") {
    return [{ label: "Showroom", path: `/aircraft/${screen === "aircraft" && param ? param : "PR-S149"}`, on: screen === "aircraft" },
      { label: "Evidence", path: "/intel", on: screen === "intel" }];
  }
  if (screen === "results" || screen === "stress" || screen === "late") {
    return [{ label: "Results", path: "/results", on: screen === "results" },
      { label: "Surge & stress tests", path: "/stress", on: screen === "stress" },
      { label: "Late data", path: "/late", on: screen === "late" }];
  }
  return [];
}

/** Total height of the fixed header for a screen (main bar + tricolour line + optional sub-bar). */
export function navHeight(screen: string, param: string | null): number {
  if (screen === "vendor") return MAIN_H;
  return MAIN_H + LINE_H + (subItems(screen, param).length ? SUB_H : 0);
}

/** Paper-chart header: brand, story-order tabs, offline chip, role switch; tricolour as a 3 px line beneath. */
export function NavBar() {
  const { route, navigate } = useApp();
  const show = useStory((st) => !st.active || st.chrome);
  const [more, setMore] = useState(false);
  const vendor = route.screen === "vendor";
  useEffect(() => { document.documentElement.dataset.role = vendor ? "vendor" : "commander"; }, [vendor]);
  if (!show) return null;
  const subs = subItems(route.screen, route.param);
  const offline = route.screen === "offline";

  const role = (
    <div className={s.role} role="group" aria-label="Role">
      <button type="button" className={!vendor ? s.roleOn : ""} onClick={() => navigate("/")}>Commander</button>
      <button type="button" className={vendor ? s.roleOn : ""} onClick={() => navigate("/vendor")}>Spares vendor</button>
    </div>
  );

  if (vendor) {
    return (
      <header className={`${s.wrap} ${s.vwrap}`} data-testid="vendor-header">
        <nav className={s.vbar} style={{ height: MAIN_H }} aria-label="Vendor portal">
          <span className={s.vlogo}>◈</span>
          <span className={s.vbrand}>SpareLink<em>Vendor Portal</em></span>
          <span className={s.vnav}><b>Deliveries</b><span>Inventory</span><span>Invoices</span><span>Support</span></span>
          <span className={s.vuser}>Nandi Vendor Hub · Bengaluru</span>
          <button type="button" className={s.vback} onClick={() => navigate("/")}>← Back to Pratirakshak</button>
        </nav>
      </header>
    );
  }
  return (
    <header className={s.wrap}>
      <nav className={s.bar} style={{ height: MAIN_H }} aria-label="Sheets">
        <button type="button" className={s.brand} onClick={() => navigate(vendor ? "/vendor" : "/")}><Crest size={32} />PRATIRAKSHAK{vendor && <em>· Spares vendor</em>}</button>
        {!vendor && (
          <div className={s.items}>
            {TABS.map((tb) => (
              <button key={tb.label} type="button" className={`${s.item} ${tb.screens.includes(route.screen) ? s.active : ""}`} onClick={() => navigate(tb.path)}>{tb.label}</button>
            ))}
            <div className={s.moreWrap}>
              <button type="button" className={`${s.item} ${route.screen === "lifecycle" ? s.active : ""}`} onClick={() => setMore((v) => !v)} aria-expanded={more}>More ▾</button>
              {more && <div className={s.menu}><button type="button" onClick={() => { setMore(false); navigate("/lifecycle"); }}>Fleet lifecycle</button></div>}
            </div>
          </div>
        )}
        <div className={s.right}>
          {!vendor && (
            <button type="button" className={`${s.chip} ${offline ? s.chipOff : ""}`} onClick={() => navigate(offline ? "/fleet" : "/offline")} title="Switch offline mode on or off">
              <i />{offline ? "Offline · cached data" : "Online"}
            </button>
          )}
          {role}
        </div>
      </nav>
      <div className={s.tricolour} />
      {!vendor && subs.length > 0 && (
        <nav className={s.sub} style={{ height: SUB_H }} aria-label="Section">
          {subs.map((x) => <button key={x.label} type="button" className={x.on ? s.subOn : ""} onClick={() => navigate(x.path)}>{x.label}</button>)}
        </nav>
      )}
    </header>
  );
}
