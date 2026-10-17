import { expect, test } from "@playwright/test";

// Sheet 11: the sheet still renders with the network blocked (service worker + cached snapshot).
test("offline mode with network blocked @shot", async ({ page, context }) => {
  await page.goto("/offline?age=24");
  await expect(page.getByTestId("offline")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.reload();
  await expect(page.getByTestId("offline")).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline")).toHaveAttribute("data-online", "0", { timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "../docs/shots/s11_offline.png" });
});
