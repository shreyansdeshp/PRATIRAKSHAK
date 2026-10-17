import { expect, test } from "@playwright/test";

test("s13_lifecycle @shot", async ({ page }) => {
  await page.goto("/lifecycle");
  await expect(page.getByTestId("lifecycle")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // Assert the sheet displays all 72 aircraft
  const aircraftElements = page.locator("[data-tail]");
  await expect(aircraftElements).toHaveCount(72);

  // Save screenshot to docs/shots/s13_lifecycle.png
  await page.screenshot({ path: "../docs/shots/s13_lifecycle.png" });
});
