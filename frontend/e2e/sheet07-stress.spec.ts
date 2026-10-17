import { expect, test } from "@playwright/test";

// Sheet 07: stress-test outcomes come from results.json.
for (const sc of ["surge", "strike"]) {
  test(`stress test — ${sc} @shot`, async ({ page, request }) => {
    const res = await (await request.get("/data/results.json")).json();
    const p3 = res.summary[sc].P3.ready_pct.mean.toFixed(1);
    await page.goto(`/stress?sc=${sc}`);
    await expect(page.getByTestId("stress")).toHaveAttribute("data-scenario", sc, { timeout: 20_000 });
    await expect(page.getByTestId("stress")).toContainText(p3);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `../docs/shots/s07_stress_${sc}.png` });
  });
}
