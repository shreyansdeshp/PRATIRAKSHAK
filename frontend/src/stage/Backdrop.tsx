const BAND = ["#FF9933", "#FFFFFF", "#138808"]; // saffron · white · green

/* Flat recognition-chart silhouettes (side profiles, 100×40 box, nose to the right). */
const FIGHTER = "M4 21 L10 4 L18 4 L26 18 L58 17 L70 11 L80 11 L86 16 L99 21 L86 25 L56 27 L44 33 L36 33 L40 26 L22 25 L4 24 Z";
const TRANSPORT = "M6 18 L10 2 L18 2 L26 15 L84 15 C92 15 97 18 98 21 C97 25 92 26 84 26 L22 26 C12 26 6 23 6 18 Z M44 20 L64 20 L58 31 L48 31 Z";
const HELI = "M8 7 L76 7 L76 9 L43 9 L43 13 L41 13 L41 9 L8 9 Z M20 24 C20 15 30 13 42 13 C56 13 62 18 62 24 C62 29 56 31 42 31 C30 31 20 29 20 24 Z M60 20 L94 19 L94 22 L60 25 Z M92 13 L96 13 L96 27 L92 27 Z M24 35 L60 35 L60 37 L24 37 Z M30 31 L32 31 L32 35 L30 35 Z M50 31 L52 31 L52 35 L50 35 Z";
const RADAR = "M30 6 C48 10 60 22 62 36 L18 14 C22 10 26 7 30 6 Z M38 22 L44 25 L46 34 L42 34 L41 27 Z M30 36 L58 36 L58 39 L30 39 Z";

function Silhouettes({ side }: { side: "left" | "right" }) {
  const shapes = side === "left" ? [FIGHTER, HELI, TRANSPORT] : [RADAR, FIGHTER, HELI];
  return (
    <div style={{ position: "absolute", top: 0, bottom: 0, [side]: 10, width: 72, display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center" }}>
      {shapes.map((d, i) => (
        <svg key={i} viewBox="0 0 100 40" width={68} height={27} style={{ transform: side === "right" && d !== RADAR ? "scaleX(-1)" : undefined }}>
          <path d={d} fill="#0e2547" fillOpacity={0.4} fillRule="evenodd" />
        </svg>
      ))}
    </div>
  );
}

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
      <Silhouettes side="left" />
      <Silhouettes side="right" />
      {band("top")}
      {band("bottom")}
    </div>
  );
}
