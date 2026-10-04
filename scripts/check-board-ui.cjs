// Run with Playwright on NODE_PATH and an isolated Vite test server on port 3107.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1183, height: 764 },
    });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__removed_webdav/**", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "excalidraw-webdav",
        JSON.stringify({
          serverUrl: "http://127.0.0.1:3000/__removed_webdav",
          basePath: "/",
          username: "test",
          password: "test-only",
          activeFilePath: "/old.excalidraw",
          restoreMode: "remote",
        }),
      );
    });
    await page.goto(
      `${process.env.BOARD_TEST_URL || "http://127.0.0.1:3107"}/?lng=zh-CN`,
    );
    await page.locator(".board-top-actions .primary").click();
    await page.locator("canvas").first().waitFor({ state: "visible" });
    assert.equal(await page.getByText("在线模式", { exact: true }).count(), 0);
    await page.keyboard.press("t");
    await page.mouse.click(500, 350);
    await page.keyboard.type("Local canvas");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const text = window.h.elements.find((e) => e.type === "text");
      window.h.setState({ selectedElementIds: { [text.id]: true } });
    });
    const picker = page.locator(".FontPicker__container");
    await picker.waitFor();
    assert.equal(await picker.locator("button").count(), 4);
    const boxes = await picker.locator("button").evaluateAll((buttons) =>
      buttons.map((b) => ({
        x: b.getBoundingClientRect().x,
        y: b.getBoundingClientRect().y,
      })),
    );
    assert.ok(boxes.every((b) => Math.abs(b.y - boxes[0].y) < 2));
    assert.equal(await page.getByTestId("font-family-yutong").count(), 0);
    const color = page.locator(".color-picker__top-picks .active").first();
    assert.equal(
      await color
        .locator(".color-picker__button-outline")
        .evaluate((e) => getComputedStyle(e).boxShadow),
      "none",
    );
    await page.getByTestId("font-family-show-fonts").click();
    await page.getByText("悠哉字体", { exact: true }).click();
    await page.waitForFunction(() =>
      window.h.elements.some((e) => e.fontFamily === 12),
    );
    await page
      .getByRole("status")
      .filter({ hasText: "已保存到本机" })
      .waitFor();
    await page.reload();
    await page.waitForFunction(() =>
      window.h?.elements?.some((e) => e.text === "Local canvas"),
    );
    await page.getByTestId("main-menu-trigger").click();
    assert.equal(await page.getByText("在线模式", { exact: true }).count(), 0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+/");
    assert.equal(await page.getByText(/WebDAV|在线模式/).count(), 0);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS four inline font buttons, no color ring, local persistence, no online entries or reconnection",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
