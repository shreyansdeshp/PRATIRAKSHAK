import { expect, test } from "@playwright/test";

const shots: [string, string, string][] = [
  ["s1_fleet", "/fleet", "fleet"],
  ["s2_base_HIM", "/base/HIM", "base"],
  ["s3_aircraft_PR-S149", "/aircraft/PR-S149?still=1", "showroom"],
  ["s3_part_hydraulics", "/aircraft/PR-S149?still=1&part=hydraulics", "part-drawer"],
];

for (const [name, path, testid] of shots) {
  test(`${name} @shot`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId(testid)).toBeVisible({ timeout: 20_000 });
    if (testid === "base") await page.locator("[data-map-idle='1']").waitFor({ timeout: 25_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `../docs/shots/${name}.png` });
  });
}
