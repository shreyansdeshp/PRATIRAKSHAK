import { expect, test } from "@playwright/test";

test("empty sheet renders on the paper background @shot", async ({ page }) => {
  await page.goto("/no-such-sheet"); // "/" is the hero now; the not-found sheet is the bare paper page
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(244, 239, 227)"); // #F4EFE3

  await page.screenshot({ path: "../docs/shots/stage0_empty_1920x1080.png" });
});
