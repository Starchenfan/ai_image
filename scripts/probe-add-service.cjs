const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch({
    executablePath:
      "C:\\Users\\32455\\AppData\\Local\\ms-playwright\\chromium-1148\\chrome-win\\chrome.exe",
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE ERROR: " + m.text());
  });
  page.on("pageerror", (e) => errors.push("PAGE ERROR: " + e.message));

  console.log("==> goto /admin");
  await page.goto("http://localhost:3001/admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // list current services
  const beforeCount = await page.locator("a[href^='/admin/services/']").count();
  console.log("services visible before:", beforeCount);

  // click 添加服务 button
  const addBtn = page.getByRole("button", { name: /添加服务/ });
  console.log("add button count:", await addBtn.count());
  await addBtn.first().click();
  await page.waitForTimeout(800);

  // is dialog open?
  const dialogVisible = await page
    .locator("[role='dialog']")
    .count();
  console.log("dialog open after click:", dialogVisible);

  if (dialogVisible > 0) {
    // fill form — locate by placeholder inside dialog (Label isn't wired to Input via htmlFor)
    const dlg = page.locator("[role='dialog']");
    await dlg.getByPlaceholder("例如: Replicate Relay").fill("Playwright Test Svc");
    await dlg.getByPlaceholder("https://api.example.com/v1").fill("https://pw.test/v1");
    await dlg.getByPlaceholder("仅服务器存储，前端只展示掩码").fill("sk-pw-key-1234567890");

    // submit
    const submitBtn = dlg.getByRole("button", { name: /^添加$/ });
    console.log("submit button count:", await submitBtn.count());
    await submitBtn.click();
    await page.waitForTimeout(1500);

    const afterCount = await page.locator("a[href^='/admin/services/']").count();
    console.log("services visible after submit:", afterCount);

    // verify via API
    const api = await page.evaluate(async () => {
      const r = await fetch("/api/admin/services");
      return (await r.json()).services.map((s) => s.name);
    });
    console.log("API services after:", JSON.stringify(api));
  } else {
    console.log("!!! DIALOG DID NOT OPEN — that's the bug");
  }

  if (errors.length) {
    console.log("\n--- BROWSER ERRORS ---");
    errors.forEach((e) => console.log(e));
  }

  await browser.close();
})().catch((e) => {
  console.error("SCRIPT FAILED:", e.message);
  process.exit(1);
});
