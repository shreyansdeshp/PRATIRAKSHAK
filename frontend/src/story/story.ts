import { create } from "zustand";

import beatsFile from "./beats.json";

export interface Beat { id: string; path: string; heroStep?: number; caption: string; param?: string }
export const BEATS: Beat[] = beatsFile.beats;

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
