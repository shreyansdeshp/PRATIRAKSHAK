import { expect, test } from "@playwright/test";

// Sheet 08: late-detection numbers come from results.json counterfactuals.
for (const tab of ["aircraft", "base", "fleet"]) {
  test(`late detection — ${tab} @shot`, async ({ page, request }) => {
    const res = await (await request.get("/data/results.json")).json();
    const f3 = res.counterfactuals.late_detection.fleet["7"].unplanned_failures.mean.toFixed(1);
    await page.goto(`/late?d=7&tab=${tab}`);
    await expect(page.getByTestId("late")).toHaveAttribute("data-tab", tab, { timeout: 20_000 });
    await expect(page.getByTestId("late")).toContainText(f3);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `../docs/shots/s08_late_${tab}.png` });
  });
}
