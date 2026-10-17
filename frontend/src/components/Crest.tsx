/** Original Pratirakshak crest: a shield with a rising chevron and star, flanked by stylised wings. Not an official insignia. */
export function Crest({ size = 36 }: { size?: number }) {
  return (
    <svg width={size * 1.9} height={size} viewBox="0 0 76 40" aria-label="Pratirakshak crest" role="img">
      <g fill="var(--nav-accent)">
        {/* wings: three tapering feathers each side */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path d={`M26 ${14 + i * 5} L${4 + i * 4} ${10 + i * 6} L${8 + i * 4} ${15 + i * 5} Z`} opacity={1 - i * 0.2} />
            <path d={`M50 ${14 + i * 5} L${72 - i * 4} ${10 + i * 6} L${68 - i * 4} ${15 + i * 5} Z`} opacity={1 - i * 0.2} />
          </g>
        ))}
      </g>
      {/* shield */}
      <path d="M38 3 L52 8 L52 20 C52 29 46 35 38 38 C30 35 24 29 24 20 L24 8 Z" fill="var(--nav-bg)" stroke="var(--nav-accent)" strokeWidth={2} />
      <path d="M30 26 L38 18 L46 26" fill="none" stroke="var(--nav-accent)" strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M38 8.5 L39.5 12.2 L43.4 12.4 L40.3 14.8 L41.4 18.6 L38 16.4 L34.6 18.6 L35.7 14.8 L32.6 12.4 L36.5 12.2 Z" fill="var(--nav-ink)" />
    </svg>
  );
}
