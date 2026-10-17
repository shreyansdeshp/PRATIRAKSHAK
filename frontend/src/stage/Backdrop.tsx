const ticks = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Aeronautical-chart backdrop for the letterbox around the stage: graticule, range rings, flight arcs, scale ticks. */
const JET = "M0,-34 C3,-26 4,-14 4,-6 L30,12 L30,18 L5,10 L4,24 L12,31 L12,35 L0,32 L-12,35 L-12,31 L-4,24 L-5,10 L-30,18 L-30,12 L-4,-6 C-4,-14 -3,-26 0,-34 Z";
const jets: [number, number, number, number][] = [[70, 250, 28, 1.5], [130, 330, 28, 1.1], [40, 360, 28, 1.1], [1535, 170, -32, 1.3], [1490, 660, 200, 0.9], [90, 760, 10, 0.9]];

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
        <circle cx={0} cy={450} r={410} strokeDasharray="2 6" />
      </g>
      {/* bearing spokes */}
      <g stroke="var(--fold)" strokeWidth={1}>
        {ticks(12).map((i) => { const a = (i * 15 - 90) * Math.PI / 180; return (
          <g key={i}>
            <line x1={0} y1={450} x2={Math.cos(a) * 410} y2={450 + Math.sin(a) * 410} />
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
      {/* aircraft with contrails */}
      {jets.map(([x, y, rot, s], i) => (
        <g key={i} transform={`translate(${x},${y}) rotate(${rot}) scale(${s})`}>
          <line x1={-5} x2={-5} y1={36} y2={300} stroke="var(--fold)" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
          <line x1={5} x2={5} y1={36} y2={260} stroke="var(--fold)" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
          <path d={JET} fill="var(--olive)" opacity={0.55} stroke="var(--paper)" strokeWidth={1.5} />
        </g>
      ))}
      {/* edge scale ticks */}
      <g stroke="var(--ink-mute)" strokeWidth={1.4}>
        {ticks(46).map((i) => <line key={`tl${i}`} x1={0} x2={i % 5 === 0 ? 22 : 11} y1={i * 20} y2={i * 20} />)}
        {ticks(46).map((i) => <line key={`tr${i}`} x1={1600} x2={i % 5 === 0 ? 1578 : 1589} y1={i * 20} y2={i * 20} />)}
      </g>
      <g fill="var(--ink-mute)" fontSize={13} letterSpacing={2}>
        <text x={30} y={118}>N 34°09′</text><text x={30} y={448}>N 28°36′</text><text x={30} y={778}>N 13°00′</text>
        <text x={1500} y={448} textAnchor="middle">E 77°12′</text><text x={1500} y={778} textAnchor="middle">E 80°10′</text>
        <text x={24} y={870}>VHF 121.5 · SEED 26249</text>
        <text x={1576} y={870} textAnchor="end">SIH26249 · FICTIONAL EXERCISE</text>
      </g>
    </svg>
  );
}
