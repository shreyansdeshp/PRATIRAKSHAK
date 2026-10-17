import { expect, test } from "@playwright/test";

// Sheet 09: importance ranking and trust counts come from intelligence.json.
for (const sys of ["engines", "electrical"]) {
  test(`intelligence — ${sys} @shot`, async ({ page, request }) => {
    const intel = await (await request.get("/data/intelligence.json")).json();
    const top = intel.graph.nodes.filter((n: { kind: string; system: string }) => n.kind === "sensor" && n.system === sys)
      .sort((a: { importance: number }, b: { importance: number }) => b.importance - a.importance)[0];
    await page.goto(`/intel?sys=${sys}`);
    await expect(page.getByTestId("intel")).toHaveAttribute("data-system", sys, { timeout: 20_000 });
    await expect(page.getByTestId("intel")).toContainText(`${(top.importance * 100).toFixed(1)} %`);
    await expect(page.getByTestId("intel")).toContainText(`${intel.fleet_trust.untrusted}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `../docs/shots/s09_intel_${sys}.png` });
  });
}
