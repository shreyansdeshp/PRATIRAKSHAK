import { expect, test } from "@playwright/test";

test("s06_plan @shot", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByTestId("plan")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "../docs/shots/s06_plan.png" });
});
