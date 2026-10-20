import { create } from "zustand";

import beatsFile from "./beats.json";

export interface Beat { id: string; path: string; heroStep?: number; caption: string; param?: string }

/**
 * Storyline beats = beats.json (sheets 00–03) + one file per later sheet in ./beats/NN-name.json, merged in filename
 * order. Each screen owner adds only their own beats file, so parallel work never conflicts.
 */
const extra = import.meta.glob<{ beats: Beat[] }>("./beats/*.json", { eager: true, import: "default" });
export const BEATS: Beat[] = [
  ...beatsFile.beats,
  ...Object.keys(extra).sort().flatMap((k) => extra[k]!.beats),
];

interface StoryState {
  active: boolean;
  index: number;
  captions: boolean;
  chrome: boolean;
  heroStep: number;
  go: (i: number) => void;
}

const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
const startAt = Math.max(0, BEATS.findIndex((b) => b.id === params.get("beat")));

/** ?auto=1 advances beats on a timer (for screen recording); ?pace=1.2 slows it by 20 %. */
export const AUTO = params.get("auto") === "1";
const PACE = Math.max(0.25, Number(params.get("pace")) || 1);
/** Autoplay waits this long on the first beat so the recorder can be started; ?delay=0 skips it. */
export const START_DELAY_MS = params.has("delay") ? Math.max(0, Number(params.get("delay")) || 0) * 1000 : 10000;

/** How long a beat stays up in autoplay: read-aloud time of its caption (~2.4 words/s) plus a pause. */
export function holdMs(b: Beat): number {
  if (!b.caption) return 3000 * PACE;
  const words = b.caption.split(/\s+/).length;
  return Math.max(4000, (words / 2.4) * 1000 + 2000) * PACE;
}

/** Storyline state (SPEC §11.7): deterministic beats; no randomness at render time. */
export const useStory = create<StoryState>((set) => ({
  active: params.get("mode") === "story",
  index: startAt,
  captions: true,
  chrome: true,
  heroStep: BEATS[startAt]?.heroStep ?? 0,
  go: (i) => {
    const idx = Math.max(0, Math.min(BEATS.length - 1, i));
    set({ index: idx, heroStep: BEATS[idx]?.heroStep ?? 7 });
  },
}));

/** Current beat's extra query parameters (e.g. "part=hydraulics") while storyline mode is on; empty otherwise. */
export function useBeatParams(): URLSearchParams {
  const p = useStory((s) => (s.active ? BEATS[s.index]?.param ?? "" : ""));
  return new URLSearchParams(p);
}
