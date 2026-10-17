import { SheetPlaceholder } from "../../components/SheetPlaceholder";

/** Sheet 04 — Decision card. Owner: Claude. Placeholder until built (docs/FRONTEND_CONVENTIONS.md). */
export function Decision({ tail }: { tail: string }) {
  return <SheetPlaceholder sheet="04" title="Decision card" owner="Claude" spec={`SPEC §11.9 S4 · ${tail}`} />;
}
