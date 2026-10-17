const ticks = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Aeronautical-chart backdrop for the letterbox around the stage: graticule, range rings, flight arcs, scale ticks. */
export function Backdrop() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden
      style={{ position: "absolute", inset: 0, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>
      <g stroke="var(--grid)" strokeWidth={1}>
        {ticks(17).map((i) => <line key={`v${i}`} x1={i * 100} x2={i * 100} y1={0} y2={900} />)}
        {ticks(10).map((i) => <line key={`h${i}`} x1={0} x2={1600} y1={i * 100} y2={i * 100} />)}
      </g>
      {/* range rings, left and right */}
      <g fill="none" stroke="var(--fold)" strokeWidth={1.2}>
        {[90, 170, 250, 330, 410].map((r) => <circle key={`l${r}`} cx={0} cy={450} r={r} />)}
        {[90, 170, 250, 330, 410].map((r) => <circle key={`r${r}`} cx={1600} cy={450} r={r} />)}
        <circle cx={0} cy={450} r={410} strokeDasharray="2 6" />
        <circle cx={1600} cy={450} r={410} strokeDasharray="2 6" />
      </g>
      {/* bearing spokes */}
      <g stroke="var(--fold)" strokeWidth={1}>
        {ticks(12).map((i) => { const a = (i * 15 - 90) * Math.PI / 180; return (
          <g key={i}>
            <line x1={0} y1={450} x2={Math.cos(a) * 410} y2={450 + Math.sin(a) * 410} />
            <line x1={1600} y1={450} x2={1600 - Math.cos(a) * 410} y2={450 + Math.sin(a) * 410} />
          </g>); })}
      </g>
      {/* flight arcs + waypoints */}
      <g fill="none" stroke="var(--olive)" strokeWidth={1.6} strokeDasharray="7 7" opacity={0.7}>
        <path d="M 0 700 Q 140 520 60 330" />
        <path d="M 1600 220 Q 1450 380 1540 600" />
        <path d="M 30 140 Q 180 260 120 420" opacity={0.6} />
        <path d="M 1570 760 Q 1430 700 1500 540" opacity={0.6} />
      </g>
      <g fill="var(--paper)" stroke="var(--olive)" strokeWidth={2}>
        {[[60, 330], [120, 420], [1540, 600], [1500, 540]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={6} />)}
      </g>
      {/* edge scale ticks */}
      <g stroke="var(--ink-mute)" strokeWidth={1.4}>
        {ticks(46).map((i) => <line key={`tl${i}`} x1={0} x2={i % 5 === 0 ? 22 : 11} y1={i * 20} y2={i * 20} />)}
        {ticks(46).map((i) => <line key={`tr${i}`} x1={1600} x2={i % 5 === 0 ? 1578 : 1589} y1={i * 20} y2={i * 20} />)}
      </g>
      <g fill="var(--ink-mute)" fontSize={13} letterSpacing={2}>
        <text x={30} y={118}>N 34°09′</text><text x={30} y={448}>N 28°36′</text><text x={30} y={778}>N 13°00′</text>
        <text x={1500} y={118} textAnchor="middle">E 77°35′</text><text x={1500} y={448} textAnchor="middle">E 77°12′</text><text x={1500} y={778} textAnchor="middle">E 80°10′</text>
        <text x={24} y={870}>VHF 121.5 · SEED 26249</text>
        <text x={1576} y={870} textAnchor="end">SIH26249 · FICTIONAL EXERCISE</text>
      </g>
    </svg>
  );
}
