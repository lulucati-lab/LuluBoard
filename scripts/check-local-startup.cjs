// Run with Playwright available on NODE_PATH and the local server running.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const failFont of [false, true]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.abort());
      if (failFont) {
        await page.route("**/fonts/Xiaolai.woff2", (route) => route.abort());
      }
      await page.goto(
        `${process.env.BOARD_TEST_URL || "http://127.0.0.1:3107"}/?lng=zh-CN`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      await page.locator(".board-top-actions .primary").click();
      await page
        .locator("canvas")
        .first()
        .waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.getByText("Loading scene...").count(), 0);
      assert.deepEqual(errors, []);
      if (!failFont) {
        await page.evaluate(() => document.fonts.load('16px "Virgil"'));
        assert.ok(
          await page.evaluate(() => document.fonts.check('16px "Virgil"')),
        );
      }
      console.log(
        `PASS: canvas visible with ${failFont ? "failed" : "local"} font`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
