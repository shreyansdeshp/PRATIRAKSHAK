import { expect, test } from "@playwright/test";

test("s12_vendor @shot", async ({ page }) => {
  const forbiddenSnapshots = [
    "state.json",
    "decisions.json",
    "history.json",
    "world.json",
    "plan.json",
    "twin.json",
    "results.json",
    "demo.json",
    "models.json",
    "intelligence.json",
  ];
  const requestedUrls: string[] = [];
  page.on("request", (req) => {
    requestedUrls.push(req.url());
  });

  await page.goto("/vendor");
  await expect(page.getByTestId("vendor")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // Assert none of the forbidden commander snapshots were fetched
  for (const forbidden of forbiddenSnapshots) {
    const fetched = requestedUrls.some((u) => u.includes(forbidden));
    expect(fetched, `Forbidden snapshot ${forbidden} was fetched`).toBe(false);
  }

  // Assert the page text has no aircraft registration match
  const pageText = await page.locator("body").innerText();
  expect(pageText).not.toMatch(/PR-[GPVS]\d{3}/);

  // Save screenshot
  await page.screenshot({ path: "../docs/shots/s12_vendor.png" });
});
