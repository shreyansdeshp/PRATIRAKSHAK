import { create } from "zustand";

/**
 * App state + a tiny path router (no router library). Screens are addressed by path so every view is linkable
 * and every screenshot is reproducible: /, /fleet, /base/HIM, /aircraft/PR-G207, … ; ?mode=story for storyline mode.
 */
export type Route = { screen: string; param: string | null };

export function parsePath(path: string): Route {
  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  if (!parts[0]) return { screen: "hero", param: null };
  if (parts[0] === "dev") return { screen: `dev-${parts[1] ?? "data"}`, param: null };
  return { screen: parts[0], param: parts[1] ? decodeURIComponent(parts[1]) : null };
}

interface AppState {
  route: Route;
  story: boolean;
  role: "commander" | "vendor";
  navigate: (path: string) => void;
}

const initial = typeof window === "undefined" ? "/" : window.location.pathname;
const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const useApp = create<AppState>((set) => ({
  route: parsePath(initial),
  story: params.get("mode") === "story",
  role: initial.startsWith("/vendor") ? "vendor" : "commander",
  navigate: (path) => {
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState(null, "", path + window.location.search);
    }
    set({ route: parsePath(path), role: path.startsWith("/vendor") ? "vendor" : "commander" });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const p = window.location.pathname;
    useApp.setState({ route: parsePath(p), role: p.startsWith("/vendor") ? "vendor" : "commander" });
  });
}
