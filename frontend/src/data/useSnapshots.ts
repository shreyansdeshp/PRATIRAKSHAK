import { useEffect, useState } from "react";
import { create } from "zustand";

import { loadSnapshot, type SnapshotName } from "./client";

/** Last snapshot load failure, shown once by the app shell instead of a blank sheet. */
export const useSnapshotError = create<{ error: string | null }>(() => ({ error: null }));

/** Load several snapshot files; returns null until all are ready (or the error message if one fails). */
export function useSnapshots<T extends Record<string, unknown>>(names: (keyof T & SnapshotName)[]): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = names.join(",");
  useEffect(() => {
    let alive = true;
    Promise.all(names.map((n) => loadSnapshot(n)))
      .then((vals) => { if (alive) setData(Object.fromEntries(names.map((n, i) => [n, vals[i]])) as T); })
      .catch((e) => { if (alive) { setError(String(e)); useSnapshotError.setState({ error: String(e) }); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error };
}
