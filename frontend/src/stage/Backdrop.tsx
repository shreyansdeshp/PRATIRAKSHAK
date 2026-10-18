/** Plain paper surround: no ribbons, no pattern. */
export function Backdrop() {
  return <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--backdrop)" }} />;
}
