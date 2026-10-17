import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

import { useApp } from "../store/app";
import { BEATS, useStory } from "./story";
import c from "./Story.module.css";

/** Keyboard + lower-third captions for storyline mode. Mounted only when ?mode=story. */
export function StoryController() {
  const { index, captions, chrome, go } = useStory();
  const navigate = useApp((s) => s.navigate);
  const beat = BEATS[index]!;

  useEffect(() => { if (window.location.pathname !== beat.path) navigate(beat.path); }, [beat.path, navigate]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "arrowright" || k === "pagedown") { e.preventDefault(); go(index + 1); }
      else if (k === "arrowleft" || k === "pageup") { e.preventDefault(); go(index - 1); }
      else if (k === "r") go(0);
      else if (k === "h") useStory.setState((s) => ({ chrome: !s.chrome }));
      else if (k === "c") useStory.setState((s) => ({ captions: !s.captions }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);
  useEffect(() => { document.body.style.cursor = chrome ? "" : "none"; }, [chrome]);

  return (
    <>
      <AnimatePresence mode="wait">
        {captions && beat.caption && (
          <motion.div key={beat.id} className={c.caption} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }} data-testid="caption">
            <span className={c.rule} />
            {beat.caption}
          </motion.div>
        )}
      </AnimatePresence>
      {chrome && <div className={c.counter}>{String(index + 1).padStart(2, "0")} / {String(BEATS.length).padStart(2, "0")}</div>}
    </>
  );
}
