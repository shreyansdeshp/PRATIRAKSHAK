const BAND = ["#FF9933", "#FFFFFF", "#138808"]; // saffron · white · green

/** Light surround, minimal and sharp: two angular blades cutting opposite corners, tricolour hairlines at the edges. */
export function Backdrop() {
  const band = (pos: "top" | "bottom") => (
    <div style={{ position: "absolute", left: 0, right: 0, [pos]: 0, display: "flex", flexDirection: pos === "top" ? "column" : "column-reverse" }}>
      {BAND.map((c) => <div key={c} style={{ height: 3, background: c }} />)}
    </div>
  );
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, background: "var(--backdrop)" }}>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {/* navy corner fill inside the bands */}
        <polygon points="0,900 0,750 150,900" fill="#0e2547" />
        <polygon points="1600,0 1600,150 1450,0" fill="#0e2547" />
        {/* diagonal tricolour bands cutting opposite corners (saffron · white · green, Ashoka-blue edges) */}
        {[["#FF9933", 0], ["#FFFFFF", 1], ["#138808", 2]].map(([c, i]) => {
          const k = Number(i), w = 34, o = 150 + k * w, ob = 150 + (2 - k) * w; // bottom-left reversed so saffron stays on top
          return (
            <g key={String(c)}>
              <polygon points={`0,${900 - ob} 0,${900 - ob - w} ${ob + w},900 ${ob},900`} fill={String(c)} />
              <polygon points={`1600,${o} 1600,${o + w} ${1600 - o - w},0 ${1600 - o},0`} fill={String(c)} />
            </g>
          );
        })}
        <g stroke="#06038D" strokeWidth={1.5} opacity={0.75}>
          <line x1={0} y1={750} x2={150} y2={900} /><line x1={0} y1={648} x2={252} y2={900} />
          <line x1={1600} y1={150} x2={1450} y2={0} /><line x1={1600} y1={252} x2={1348} y2={0} />
        </g>
      </svg>
      {band("top")}
      {band("bottom")}
    </div>
  );
}
