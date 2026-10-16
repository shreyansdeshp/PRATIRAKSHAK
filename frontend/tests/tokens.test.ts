import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guard the art direction: the paper ground and status colours must stay as specified (SPEC §11.2).
describe("design tokens", () => {
  const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

  it("uses the paper ground and specified status colours", () => {
    expect(css).toMatch(/--paper:\s*#f4efe3/i);
    expect(css).toMatch(/--ready:\s*#2f6b3f/i);
    expect(css).toMatch(/--watch:\s*#a66a00/i);
    expect(css).toMatch(/--pull:\s*#b83a26/i);
  });
});
