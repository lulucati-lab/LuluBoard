// Run with Playwright on NODE_PATH and the local server running.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://**/*", (route) => route.abort());
    await page.goto(
      `${process.env.BOARD_TEST_URL || "http://127.0.0.1:3107"}/?lng=zh-CN`,
    );
    await page.locator(".board-top-actions .primary").click();
    const openFonts = async () => {
      await page.locator("canvas").first().waitFor({ state: "visible" });
      if (!(await page.locator(".dropdown-menu-container").isVisible())) {
        await page.getByTestId("main-menu-trigger").click();
      }
      await page.getByText("自定义字体...", { exact: true }).click();
    };
    await openFonts();
    const urls = await page
      .getByLabel("本地手写字体")
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => option.value).filter(Boolean),
      );
    assert.equal(urls.length, 4);
    const renderedFonts = [];
    for (const url of urls) {
      await page.getByLabel("本地手写字体").selectOption(url);
      await Promise.all([
        page.waitForEvent("framenavigated", {
          predicate: (frame) => frame === page.mainFrame(),
        }),
        page.getByRole("button", { name: "确认", exact: true }).click(),
      ]);
      await page.locator("canvas").first().waitFor({ state: "visible" });
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("custom-fonts")).handwriting,
        ),
        url,
      );
      renderedFonts.push(
        await page.evaluate(async () => {
          await document.fonts.load('24px "Virgil"');
          const canvas = document.createElement("canvas");
          canvas.width = 700;
          canvas.height = 60;
          const context = canvas.getContext("2d");
          context.font = '24px "Virgil"';
          context.fillText(
            "用户路径：单条作品、账号主页、封面点击 ABC 123",
            5,
            40,
          );
          return canvas.toDataURL();
        }),
      );
      await openFonts();
      assert.equal(await page.getByLabel("本地手写字体").inputValue(), url);
      console.log(`PASS saved and reloaded: ${url}`);
    }
    assert.equal(
      new Set(renderedFonts).size,
      4,
      "All four fonts must render differently",
    );
    await page
      .locator(".CustomFonts input")
      .first()
      .fill("/fonts/missing-font.ttf");
    await page.getByRole("button", { name: "确认", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("custom-fonts")).handwriting,
      ),
      urls.at(-1),
    );
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.getByLabel("本地手写字体").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    console.log("PASS failure keeps saved settings; mobile picker fits");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
