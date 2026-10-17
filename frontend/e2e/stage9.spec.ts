import { expect, test, type Page } from "@playwright/test";

async function mapPixels(page: Page) {
  // sample the WebGL canvas (preserveDrawingBuffer) — a blank map would be one flat colour
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=chart-map] canvas");
    if (!c) return { distinct: 0 };
    const tmp = document.createElement("canvas");
    tmp.width = 64; tmp.height = 48;
    const ctx = tmp.getContext("2d")!;
    ctx.drawImage(c, 0, 0, 64, 48);
    const d = ctx.getImageData(0, 0, 64, 48).data;
    const seen = new Set<string>();
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]! >> 3},${d[i + 1]! >> 3},${d[i + 2]! >> 3}`);
    return { distinct: seen.size };
  });
}

test("primitives sheet renders @shot", async ({ page }) => {
  await page.goto("/dev/primitives");
  await expect(page.getByTestId("primitives")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-map-ready='1']")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // number tick-ups + tiles settle
  await page.screenshot({ path: "../docs/shots/stage9_primitives_1920x1080.png" });
});

test("fallback map renders with the network blocked", async ({ page }) => {
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return u.hostname === "localhost" ? route.continue() : route.abort();
  });
  await page.goto("/dev/primitives");
  const map = page.locator("[data-testid=chart-map]");
  await expect(map).toHaveAttribute("data-map-ready", "1", { timeout: 20_000 });
  await expect(map).toHaveAttribute("data-terrain", "offline");
  await page.waitForTimeout(1500);
  const px = await mapPixels(page);
  console.log("offline map distinct colours:", px.distinct);
  expect(px.distinct).toBeGreaterThan(12); // land, water, hillshade, borders → many colours
  await map.screenshot({ path: "../docs/shots/stage9_map_offline.png" });
});
