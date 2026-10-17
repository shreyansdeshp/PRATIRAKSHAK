const ticks = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Solid navy surround for the letterbox: the sheet sits on it like a framed document. */
export function Backdrop() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden
      style={{ position: "absolute", inset: 0, fontFamily: "var(--font-mono)" }}>
      <defs>
        <radialGradient id="bd-glow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="var(--nav-bg)" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.35} />
        </radialGradient>
      </defs>
      <rect width={1600} height={900} fill="var(--nav-bg)" />
      <rect width={1600} height={900} fill="url(#bd-glow)" />
      <g stroke="var(--nav-ink)" strokeOpacity={0.05} strokeWidth={1}>
        {ticks(33).map((i) => <line key={`v${i}`} x1={i * 50} x2={i * 50} y1={0} y2={900} />)}
        {ticks(19).map((i) => <line key={`h${i}`} x1={0} x2={1600} y1={i * 50} y2={i * 50} />)}
      </g>
      <g stroke="var(--nav-accent)" strokeOpacity={0.5} strokeWidth={1.2}>
        {ticks(46).map((i) => <line key={`tl${i}`} x1={0} x2={i % 5 === 0 ? 18 : 9} y1={i * 20} y2={i * 20} />)}
        {ticks(46).map((i) => <line key={`tr${i}`} x1={1600} x2={i % 5 === 0 ? 1582 : 1591} y1={i * 20} y2={i * 20} />)}
      </g>
      <g fill="var(--nav-ink)" fillOpacity={0.4} fontSize={12} letterSpacing={6}>
        <text transform="translate(34,450) rotate(-90)" textAnchor="middle">PRATIRAKSHAK · FLEET READINESS CONSOLE</text>
        <text transform="translate(1572,450) rotate(90)" textAnchor="middle">SIH26249 · PREDICTIVE MAINTENANCE</text>
      </g>
    </svg>
  );
}
