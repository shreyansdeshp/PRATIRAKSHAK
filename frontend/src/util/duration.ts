/** One shared formatter for durations given in hours (SPEC: never show "7 d 24 h"; whole hours; carry over into days). */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  if (hours < 0) return `-${formatDuration(-hours)}`;
  if (hours < 1) {
    const m = Math.round(hours * 60);
    return m >= 60 ? "1 h" : `${m} min`;
  }
  const h = Math.round(hours);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24), r = h % 24;
  return r === 0 ? `${d} d` : `${d} d ${r} h`;
}

/** Approximate wording ("in about 14 days"): days only. */
export function approxDays(hours: number): string {
  const d = Math.max(1, Math.round(hours / 24));
  return `${d} day${d === 1 ? "" : "s"}`;
}
