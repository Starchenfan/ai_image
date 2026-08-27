/**
 * One-off UI check for the history "reuse params" flow. Run with:
 *   node scripts/probe-reuse-params.cjs
 * Requires the dev server on :3001. Not part of the app.
 */
const { chromium } = require("@playwright/test");

(async () => {
  // The bundled playwright shell version does not match what is installed
  // locally; drive the system Chrome instead.
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

  // SSE / polling keeps the network busy, so networkidle never settles.
  await page.goto("http://localhost:3010/history", { waitUntil: "domcontentloaded" });
  await page.locator("article").first().waitFor({ timeout: 60000 });

  const card = page.locator("article").first();
  const promptText = (await card.locator("p").first().innerText()).trim();
  console.log("history card prompt:", promptText.slice(0, 40));

  // copy recipe JSON — clipboard permission first
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await card.getByRole("button", { name: /复制参数 JSON/ }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const parsed = JSON.parse(clip);
  console.log("clipboard keys:", Object.keys(parsed).join(","));
  console.log("clipboard seeds:", JSON.stringify(parsed.seeds), "model:", parsed.model);

  // reuse params → should land on the studio with the prompt refilled
  await card.getByRole("button", { name: /复用参数/ }).click();
  await page.waitForURL("http://localhost:3010/");
  const box = page.locator("textarea").first();
  const filled = (await box.inputValue()).trim();
  console.log("studio prompt filled:", filled.slice(0, 40));
  console.log("prompt matches card:", filled.startsWith(promptText.slice(0, 20)));

  const seedField = page.locator('input[type="number"]');
  const n = await seedField.count();
  for (let i = 0; i < n; i++) {
    console.log(`number input[${i}] =`, await seedField.nth(i).inputValue());
  }

  await page.screenshot({ path: "scripts/reuse-params.png", fullPage: false });
  await browser.close();
})();
