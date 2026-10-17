import { expect, test } from "@playwright/test";

// Sheet 05: the spares map renders the chosen source's ETA and the verdict from decisions.json, plus the elevation profile.
test("spares map for PR-S350 @shot", async ({ page, request }) => {
  const decisions = await (await request.get("/data/decisions.json")).json();
  const sp = decisions.find((d: { tail: string }) => d.tail === "PR-S350").headline.spares;
  await page.goto("/spares/PR-S350?still=1");
  await expect(page.getByTestId("spares")).toHaveAttribute("data-tail", "PR-S350", { timeout: 20_000 });
  await expect(page.getByTestId("verdict")).toContainText(sp.verdict);
  await expect(page.getByTestId("eta-chip")).toContainText(`${Math.floor(sp.chosen.eta_hours)} h`, { timeout: 15_000 });
  await expect(page.getByTestId("elevation-profile")).toBeVisible();
  await page.locator("[data-map-idle='1']").waitFor({ timeout: 25_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "../docs/shots/s05_spares_PR-S350.png" });
});
