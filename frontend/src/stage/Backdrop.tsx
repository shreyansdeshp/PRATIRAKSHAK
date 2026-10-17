const ticks = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Restrained technical-drawing margin for the letterbox: fine graticule, hairline range arcs, scale ticks, vertical running titles. */
export function Backdrop() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden
      style={{ position: "absolute", inset: 0, fontFamily: "var(--font-mono)" }}>
      <g stroke="var(--grid)" strokeWidth={0.8}>
        {ticks(33).map((i) => <line key={`v${i}`} x1={i * 50} x2={i * 50} y1={0} y2={900} />)}
        {ticks(19).map((i) => <line key={`h${i}`} x1={0} x2={1600} y1={i * 50} y2={i * 50} />)}
      </g>
      <g stroke="var(--fold)" strokeWidth={1.2}>
        {ticks(9).map((i) => <line key={`mv${i}`} x1={i * 200} x2={i * 200} y1={0} y2={900} />)}
        {ticks(5).map((i) => <line key={`mh${i}`} x1={0} x2={1600} y1={i * 225} y2={i * 225} />)}
      </g>
      {/* hairline range arcs, one corner each side */}
      <g fill="none" stroke="var(--fold)" strokeWidth={1}>
        {[120, 200, 280, 360, 440].map((r) => <circle key={`a${r}`} cx={0} cy={900} r={r} />)}
        {[120, 200, 280, 360, 440].map((r) => <circle key={`b${r}`} cx={1600} cy={0} r={r} />)}
      </g>
      {/* ruler ticks */}
      <g stroke="var(--ink-mute)" strokeWidth={1.2} opacity={0.7}>
        {ticks(46).map((i) => <line key={`tl${i}`} x1={0} x2={i % 5 === 0 ? 20 : 10} y1={i * 20} y2={i * 20} />)}
        {ticks(46).map((i) => <line key={`tr${i}`} x1={1600} x2={i % 5 === 0 ? 1580 : 1590} y1={i * 20} y2={i * 20} />)}
      </g>
      {/* running titles */}
      <g fill="var(--ink-mute)" fontSize={13} letterSpacing={5} opacity={0.85}>
        <text transform="translate(34,450) rotate(-90)" textAnchor="middle">PRATIRAKSHAK · FLEET READINESS CONSOLE</text>
        <text transform="translate(1572,450) rotate(90)" textAnchor="middle">SIH26249 · PREDICTIVE MAINTENANCE</text>
      </g>
    </svg>
  );
}
