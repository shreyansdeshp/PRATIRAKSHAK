import { expect, test } from "@playwright/test";

// S0 hero frames at 1920×1080 (deterministic ?step=N stills) — Stage 10 check.
for (let step = 0; step < 8; step++) {
  test(`S0 hero step ${step} @shot`, async ({ page }) => {
    await page.goto(`/?step=${step}`);
    await expect(page.getByTestId("hero")).toHaveAttribute("data-step", String(step), { timeout: 20_000 });
    await expect(page.locator("[data-map-ready='1']")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `../docs/shots/s0_step${step}.png` });
  });
}

test("storyline mode shows captions and advances with the keyboard", async ({ page }) => {
  await page.goto("/?mode=story&beat=s0-1");
  await expect(page.getByTestId("caption")).toContainText("seventy-two aircraft", { ignoreCase: true, timeout: 20_000 });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("hero")).toHaveAttribute("data-step", "2");
  await page.keyboard.press("c");
  await expect(page.getByTestId("caption")).toHaveCount(0);
});
