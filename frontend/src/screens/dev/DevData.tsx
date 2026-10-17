import { useEffect, useState } from "react";

import { apiAvailable, loadSnapshot, type SnapshotName } from "../../data/client";

interface Meta {
  roles: { commander: SnapshotName[]; vendor: SnapshotName[] };
  demo_seed: number;
  snapshot: string;
}

type Row = { name: SnapshotName; ok: boolean; detail: string };

function describe(obj: unknown): string {
  if (Array.isArray(obj)) return `${obj.length} items`;
  if (obj && typeof obj === "object") return `${Object.keys(obj).length} keys`;
  return typeof obj;
}

/** Developer check page: loads every snapshot through the data layer (Stage 8 acceptance check). */
export function DevData() {
  const [rows, setRows] = useState<Row[]>([]);
  const [api, setApi] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await loadSnapshot<Meta>("meta");
      const names: SnapshotName[] = ["meta", ...meta.roles.commander, ...meta.roles.vendor, "manifest"];
      const out = await Promise.all(
        names.map(async (name) => {
          try {
            return { name, ok: true, detail: describe(await loadSnapshot(name)) };
          } catch (e) {
            return { name, ok: false, detail: String(e) };
          }
        }),
      );
      const up = await apiAvailable();
      if (alive) {
        setRows(out);
        setApi(up);
        setDone(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const allOk = done && rows.every((r) => r.ok);
  return (
    <main style={{ padding: 48, fontFamily: "var(--font-mono)", fontSize: 14 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, marginBottom: 16 }}>Data layer check</h1>
      <p data-testid="api-state">API: {api === null ? "probing…" : api ? "online" : "offline — static snapshot in use"}</p>
      <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} style={{ borderTop: "1px solid var(--fold)" }}>
              <td style={{ padding: "4px 16px 4px 0" }}>{r.ok ? "●" : "■"}</td>
              <td style={{ padding: "4px 16px 4px 0" }}>{r.name}</td>
              <td style={{ padding: "4px 0" }}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {done && (
        <p data-testid={allOk ? "data-ok" : "data-failed"} style={{ marginTop: 16 }}>
          {allOk ? `all ${rows.length} snapshot files loaded` : "some snapshot files failed"}
        </p>
      )}
    </main>
  );
}
