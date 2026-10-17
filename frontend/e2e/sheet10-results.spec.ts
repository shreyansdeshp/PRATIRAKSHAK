import { expect, test } from "@playwright/test";

// Sheet 10: results come from results.json / models.json (no hand-typed numbers).
test("results — fleet outcomes @shot", async ({ page, request }) => {
  const res = await (await request.get("/data/results.json")).json();
  await page.goto("/results");
  await expect(page.getByTestId("results")).toHaveAttribute("data-tab", "fleet", { timeout: 20_000 });
  const p3 = res.summary.base.P3.unplanned_failures.mean.toFixed(0);
  await expect(page.getByTestId("results")).toContainText(`→ ${p3}`);
  await expect(page.getByTestId("results")).toContainText(`seed ${res.demo_seed}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: "../docs/shots/s10_results_fleet.png" });
});

test("results — models & validation @shot", async ({ page, request }) => {
  const models = await (await request.get("/data/models.json")).json();
  await page.goto("/results?tab=models");
  await expect(page.getByTestId("results")).toHaveAttribute("data-tab", "models", { timeout: 20_000 });
  const fd001 = models.engine.find((e: { subset: string }) => e.subset === "FD001");
  await expect(page.getByTestId("results")).toContainText(fd001.metrics.lgbm.rmse.toFixed(2));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "../docs/shots/s10_results_models.png" });
});
