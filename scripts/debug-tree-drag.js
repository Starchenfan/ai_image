// 调试：打开 /history，点二次创作，进入版本树画布，尝试拖拽根节点。
// 每一步打印节点位置 + RF 内部状态，定位拖拽失效原因。
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("DEBUG")) console.log("[page]", m.text());
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto("http://localhost:3001/history", { waitUntil: "networkidle" });

  // 点第一张卡片的「二次创作」按钮
  await page.locator('button[title*="二次创作"]').first().click();
  await page.waitForTimeout(1500);

  const rfNode = page.locator(".react-flow__node").first();
  await rfNode.waitFor({ state: "visible", timeout: 5000 });

  const before = await rfNode.boundingBox();
  console.log("node box before:", JSON.stringify(before));
  const cls = await rfNode.getAttribute("class");
  console.log("node class:", cls);
  // draggable class 由 RF 依据 isDraggable 设置
  console.log("has draggable class:", cls.includes("draggable"));

  // 模拟拖拽：pointerdown → 多次 mousemove（带位移）→ mouseup
  const cx = before.x + before.width / 2;
  const cy = before.y + before.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + i * 12, cy + i * 6, { steps: 1 });
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await rfNode.boundingBox();
  console.log("node box after:", JSON.stringify(after));
  console.log(
    "MOVED:",
    Math.abs(after.x - before.x) > 3 || Math.abs(after.y - before.y) > 3
  );

  await browser.close();
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
