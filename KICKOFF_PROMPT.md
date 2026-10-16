# Paste this as your first message to Claude Code

(Put `SPEC.md` and `HANDOFF.md` in an empty project folder named `pratirakshak/`, open Claude Code in that folder, then paste everything below.)

---

You are building **Pratirakshak**, an entry for Smart India Hackathon 2026 (problem statement SIH26249: Air Power – Predictive Maintenance & Fleet Availability). I am a student working solo with you.

1. Read `SPEC.md` completely, then `HANDOFF.md`. `SPEC.md` is the contract; `HANDOFF.md` is the running state you must keep updated.
2. Follow Section 0 (operating rules) strictly. In particular: one stage at a time, run only the one or two major checks each stage lists and paste the output into `HANDOFF.md`, commit after each stage, no hard-coded results, honest provenance labels, deterministic seeds (26249). **Model accuracy is not what gets judged**, so do not tune, sweep or re-verify; save tokens for the front-end and the story.
3. The NASA C-MAPSS files are on my machine; I will place them in `data/raw/cmapss/`. If they are not there when Stage 1 starts, run `scripts/fetch_cmapss.py` and tell me what you did.
4. Where the spec says "verify", verify against the real files or live docs and record what you found.
5. The front-end is the part that wins, and it must **not** look like a generic AI dashboard (no black/navy/blue-neon, no glow, no glassmorphism). It follows the "aviation chart meets flight strip" direction in Section 11. The demo is a YouTube video plus PPT screenshots, so every screen must be a strong still at 1920×1080 and the fleet map hero (S0) must open strongly.
6. Start with **Stage 0**. First write your plan for the stage into `HANDOFF.md` (10–20 lines), then build it. When Stage 0's checks pass, commit, update `HANDOFF.md`, and tell me in a few lines what is done and what Stage 1 will do. Then continue stage by stage; stop and ask me only if you need a secret or a decision that cannot be undone.

If anything in the spec is ambiguous, use the defaults in Section 3.4, record the choice in `HANDOFF.md`, and keep going.
