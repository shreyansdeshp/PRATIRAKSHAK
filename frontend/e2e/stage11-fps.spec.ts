import { expect, test } from "@playwright/test";

// Stage 11 check: one fps reading of the 3D showroom. Ask Chromium for the real GPU — headless defaults to
// software rendering (SwiftShader), which is not representative of a laptop.
test.use({ launchOptions: { args: ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11"] } });

test("fps while the turntable rotates", async ({ page }) => {
  await page.goto("/aircraft/PR-G340");
  await expect(page.getByTestId("showroom")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4000);
  const fps = await page.evaluate(() => Number(document.body.dataset.fps ?? 0));
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  console.log(`showroom fps: ${fps} · renderer: ${renderer}`);
  expect(fps).toBeGreaterThan(0);
});
