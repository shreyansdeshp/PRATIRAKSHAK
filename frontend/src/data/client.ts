/**
 * Static-first data layer (SPEC §12): every screen reads the exported snapshot in /data/*.json.
 * The live API only adds what-ifs; if it is down or slow, calls resolve to null and the UI keeps working.
 */

export type SnapshotName =
  | "meta"
  | "world"
  | "state"
  | "history"
  | "decisions"
  | "plan"
  | "intelligence"
  | "models"
  | "results"
  | "demo"
  | "twin"
  | "vendor"
  | "manifest";

const BASE = import.meta.env.BASE_URL ?? "/";
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
const cache = new Map<SnapshotName, Promise<unknown>>();

export function loadSnapshot<T>(name: SnapshotName): Promise<T> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`${BASE}data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`snapshot ${name}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(name)); // allow a retry after a failure
    cache.set(name, p);
  }
  return p as Promise<T>;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let apiUp: Promise<boolean> | null = null;

/** One cheap probe per page load; false when offline, blocked or not running. */
export function apiAvailable(): Promise<boolean> {
  if (!apiUp) {
    apiUp = withTimeout((signal) => fetch(`${API}/api/health`, { signal }).then((r) => r.ok), 1200).then(
      (ok) => ok === true,
    );
  }
  return apiUp;
}

/** POST to the live API; resolves to null (never throws) so callers fall back to static data. */
export async function apiPost<T>(path: string, body: unknown, ms = 15000): Promise<T | null> {
  if (!(await apiAvailable())) return null;
  return withTimeout(
    (signal) =>
      fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      }).then((r) => (r.ok ? (r.json() as Promise<T>) : null)),
    ms,
  );
}
