import { expect, test } from "@playwright/test";

// Stage 8 check: with NO API running, the data layer loads every snapshot from static files.
test("data layer loads all snapshots with the API off", async ({ page }) => {
  // make sure nothing answers on the API port, even if a dev API happens to be running
  await page.route("http://localhost:8000/**", (route) => route.abort());
  await page.goto("/dev/data");
  await expect(page.getByTestId("data-ok")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("api-state")).toContainText("offline");
  const text = await page.getByTestId("data-ok").innerText();
  console.log(text);
});
