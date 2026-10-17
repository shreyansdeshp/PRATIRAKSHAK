import { expect, test } from "@playwright/test";

// Sheet 14: the Method page states the assumptions of SPEC §§3.3, 7.1, 7.6.
test("method page @shot", async ({ page }) => {
  await page.goto("/method");
  const m = page.getByTestId("method");
  await expect(m).toContainText("time-scaling is a simulation parameter", { timeout: 20_000 });
  await expect(m).toContainText("Synthetic systems");
  await expect(m).toContainText("Independence");
  await page.screenshot({ path: "../docs/shots/s14_method.png" });
});
