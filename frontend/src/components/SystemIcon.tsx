/** One thin-line icon set for the eight systems: 24×24 grid, 1.6 stroke, round caps, no fill. */
const PATHS: Record<string, JSX.Element> = {
  engines: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M12 3.5V10M12 14v6.5M3.5 12H10M14 12h6.5M6 6l4.2 4.2M13.8 13.8L18 18M18 6l-4.2 4.2M10.2 13.8L6 18" /></>),
  hydraulics: (<><path d="M12 3.5c3.2 4 5.5 6.7 5.5 10a5.5 5.5 0 0 1-11 0c0-3.3 2.3-6 5.5-10Z" /><path d="M9.5 14.5a2.7 2.7 0 0 0 2.5 2.2" /></>),
  landing_gear: (<><path d="M12 3.5v9" /><path d="M8.5 6h7" /><circle cx="12" cy="17" r="4" /><circle cx="12" cy="17" r="1" /></>),
  flight_controls: (<><path d="M4 9.5h10l6-3v11l-6-3H4Z" /><path d="M8 9.5v5" /></>),
  electrical: (<><path d="M13 3.5 6.5 13.2H12l-1 7.3 6.5-9.7H12Z" /></>),
  avionics: (<><path d="M12 20.5v-7" /><circle cx="12" cy="11" r="2" /><path d="M7.3 15.7a6.6 6.6 0 0 1 0-9.4M16.7 6.3a6.6 6.6 0 0 1 0 9.4" /><path d="M4.5 18.5a10.5 10.5 0 0 1 0-15M19.5 3.5a10.5 10.5 0 0 1 0 15" /></>),
  fuel: (<><path d="M6 20.5V5.5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 15 5.5v15" /><path d="M4.5 20.5h12" /><path d="M8 8h5" /><path d="M15 9.5h2a1.5 1.5 0 0 1 1.5 1.5v5a1.2 1.2 0 0 0 2.4 0V9l-2.4-2.5" /></>),
  structure: (<><path d="M3.5 18.5 12 4l8.5 14.5Z" /><path d="M7.7 11.3h8.6M5.6 15h12.8M12 4v14.5M12 4 7.7 11.3 12 18.5l4.3-7.2Z" /></>),
};

export function SystemIcon({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "none" }}>
      {PATHS[id] ?? PATHS.structure}
    </svg>
  );
}
