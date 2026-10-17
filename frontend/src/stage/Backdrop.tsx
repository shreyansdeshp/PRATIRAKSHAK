const BAND = ["#FF9933", "#FFFFFF", "#138808"]; // saffron · white · green

/** Plain surround with a thin tricolour band along the top and bottom edges of the screen. */
export function Backdrop() {
  const band = (pos: "top" | "bottom") => (
    <div style={{ position: "absolute", left: 0, right: 0, [pos]: 0, display: "flex", flexDirection: pos === "top" ? "column" : "column-reverse" }}>
      {BAND.map((c) => <div key={c} style={{ height: 4, background: c }} />)}
    </div>
  );
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--sand)" }}>
      {band("top")}
      {band("bottom")}
    </div>
  );
}
