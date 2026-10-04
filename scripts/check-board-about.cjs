const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1183, height: 764 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3107/?lng=zh-CN");
    await page.getByRole("button", { name: "关于画布", exact: true }).waitFor();
    assert.equal(
      await page.getByText("文件保存在本机", { exact: true }).count(),
      0,
    );
    const about = await page
      .getByRole("button", { name: "关于画布", exact: true })
      .boundingBox();
    const trash = await page
      .getByRole("button", { name: "回收站", exact: true })
      .boundingBox();
    assert.ok(about.y >= trash.y + trash.height);
    assert.equal(
      await page.locator(".board-brand img").getAttribute("src"),
      "/board-logo.png",
    );
    await page.getByRole("button", { name: "关于画布", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes("lulucati"));
    const text = await dialog.innerText();
    assert.ok(
      text.indexOf("为知识分享而设计") < text.indexOf("开源来源与致谢"),
    );
    assert.ok(text.includes("常用素材") && text.includes("查看模式"));
    assert.ok((await dialog.innerText()).includes("独立衍生版本"));
    assert.equal(await dialog.locator('a[href^="http"]').count(), 0);
    for (const path of [
      "/licenses/excalidraw-MIT.txt",
      "/licenses/NOTICE.txt",
      "/board-logo.png",
      "/favicon.ico",
    ]) {
      const response = await page.request.get("http://127.0.0.1:3107" + path);
      assert.equal(response.status(), 200);
    }
    const license = await (
      await page.request.get(
        "http://127.0.0.1:3107/licenses/excalidraw-MIT.txt",
      )
    ).text();
    assert.ok(license.includes("Copyright (c) 2020 Excalidraw"));
    await page.screenshot({ path: ".git/about-desktop.png" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "关于画布", exact: true }).click();
    await dialog.waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: ".git/about-mobile.png" });
    await page.getByRole("button", { name: "关闭对话框" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS logo, subtle About below trash, lulucati and sources, license assets, Escape/close, mobile layout",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
