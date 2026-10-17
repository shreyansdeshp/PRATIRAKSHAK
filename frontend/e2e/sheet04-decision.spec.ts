import { expect, test } from "@playwright/test";

// Stage 12 check: the decision card shows the numbers from the snapshot (not hand-typed).
for (const tail of ["PR-S149", "PR-G295", "PR-S350"]) {
  test(`decision card for ${tail} matches decisions.json @shot`, async ({ page, request }) => {
    const decisions = await (await request.get("/data/decisions.json")).json();
    const row = decisions.find((d: { tail: string }) => d.tail === tail);
    await page.goto(`/decision/${tail}`);
    await expect(page.getByTestId("decision")).toHaveAttribute("data-tail", tail, { timeout: 20_000 });
    const gauge = page.getByTestId("risk-gauge");
    await expect(gauge).toContainText(`${Math.round(row.headline.p_fail * 100)} %`);
    await expect(gauge).toContainText(`${Math.round(row.headline.theta * 100)} %`);
    await expect(page.getByTestId("reason")).toHaveText(row.reason);
    if (row.headline.confidence) await expect(page.getByTestId("confidence")).toContainText(row.headline.confidence.level);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `../docs/shots/s04_decision_${tail}.png` });
  });
}
