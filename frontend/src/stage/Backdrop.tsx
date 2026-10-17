const BAND = ["#FF9933", "#FFFFFF", "#138808"]; // saffron · white · green

/** Light surround, minimal and sharp: two angular blades cutting opposite corners, tricolour hairlines at the edges. */
export function Backdrop() {
  const band = (pos: "top" | "bottom") => (
    <div style={{ position: "absolute", left: 0, right: 0, [pos]: 0, display: "flex", flexDirection: pos === "top" ? "column" : "column-reverse" }}>
      {BAND.map((c) => <div key={c} style={{ height: 3, background: c }} />)}
    </div>
  );
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, background: "#f3f5f8" }}>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {/* bottom-left blade */}
        <polygon points="0,900 0,720 200,900" fill="#0e2547" />
        <polygon points="0,700 0,684 236,900 220,900" fill="#FF9933" />
        <polygon points="0,662 0,659 260,900 256,900" fill="#0e2547" opacity={0.6} />
        {/* top-right blade */}
        <polygon points="1600,0 1600,180 1400,0" fill="#0e2547" />
        <polygon points="1600,200 1600,216 1364,0 1380,0" fill="#FF9933" />
        <polygon points="1600,238 1600,241 1340,0 1344,0" fill="#0e2547" opacity={0.6} />
      </svg>
      {band("top")}
      {band("bottom")}
    </div>
  );
}
