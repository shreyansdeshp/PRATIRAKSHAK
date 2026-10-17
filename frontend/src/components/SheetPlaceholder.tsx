import { CornerTag, RegistrationMarks, SheetHeader } from "./primitives";
import { SheetIndex } from "./SheetIndex";

/** Temporary sheet shown until its owner builds the screen (see docs/FRONTEND_CONVENTIONS.md → ownership). */
export function SheetPlaceholder({ sheet, title, owner, spec }: { sheet: string; title: string; owner: "Claude" | "Antigravity"; spec: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "40px 64px 48px", display: "flex", flexDirection: "column", gap: 24 }} data-testid={`placeholder-${sheet}`}>
      <RegistrationMarks />
      <SheetHeader sheet={sheet} title={title} subtitle={`In progress · owner: ${owner} · ${spec}`} right={<SheetIndex />} />
      <CornerTag />
    </div>
  );
}
