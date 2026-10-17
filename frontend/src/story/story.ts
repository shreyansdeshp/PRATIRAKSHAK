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
