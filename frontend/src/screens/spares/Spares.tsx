import { SheetPlaceholder } from "../../components/SheetPlaceholder";

/** Sheet 05 — Spares & logistics. Owner: Claude. Placeholder until built (docs/FRONTEND_CONVENTIONS.md). */
export function Spares({ tail }: { tail: string }) {
  return <SheetPlaceholder sheet="05" title="Spares & logistics" owner="Claude" spec={`SPEC §11.9 S5 · ${tail}`} />;
}
