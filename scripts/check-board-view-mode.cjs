const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1183, height: 764 },
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3107/?lng=zh-CN");
    await page.locator(".board-top-actions .primary").click();
    await page.locator("canvas").first().waitFor();
    const toggle = page.locator(".board-view-toggle");
    const toolbar = page.locator(".App-toolbar").first();
    assert.equal(await page.locator("footer .help-icon").count(), 0);
    const menu = await page.locator(".main-menu-trigger").boundingBox();
    const glasses = await toggle.boundingBox();
    assert.equal(glasses.width, glasses.height);
    assert.equal(menu.y, glasses.y);
    assert.ok(glasses.x >= menu.x + menu.width);
    await toggle.click();
    await page.waitForFunction(() =>
      document.querySelector(".excalidraw--view-mode"),
    );
    await page.locator('[aria-label="画布名称"]').waitFor({ state: "hidden" });
    await page
      .locator(".layer-ui__wrapper__footer-left")
      .waitFor({ state: "hidden" });
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await page.mouse.move(600, 300);
    await page.waitForTimeout(400);
    let box = await toolbar.boundingBox();
    assert.ok(box.y + box.height <= 0, JSON.stringify(box));
    await page.mouse.move(590, 5);
    await page.waitForTimeout(400);
    box = await toolbar.boundingBox();
    assert.ok(box.y >= 15, JSON.stringify(box));
    assert.equal(
      await page.evaluate(() => window.h.app.state.viewModeEnabled),
      true,
    );
    const count = await page.evaluate(
      () => window.h.app.scene.getNonDeletedElements().length,
    );
    await page.mouse.move(500, 300);
    await page.mouse.down();
    await page.mouse.move(650, 450);
    await page.mouse.up();
    assert.equal(
      await page.evaluate(
        () => window.h.app.scene.getNonDeletedElements().length,
      ),
      count,
    );
    await page.waitForTimeout(400);
    box = await toolbar.boundingBox();
    assert.ok(box.y + box.height <= 0);
    await page.screenshot({ path: ".git/view-collapsed.png" });
    await page.mouse.move(590, 5);
    await page.waitForTimeout(400);
    await page.screenshot({ path: ".git/view-revealed.png" });
    await page
      .locator(".App-toolbar label")
      .filter({ has: page.locator('input[aria-label="矩形"]') })
      .click();
    await page.waitForFunction(
      () => !document.querySelector(".excalidraw--view-mode"),
    );
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    await page.locator(".layer-ui__wrapper__footer-left").waitFor();
    await toggle.click();
    await toggle.click();
    await page.waitForFunction(
      () => !document.querySelector(".excalidraw--view-mode"),
    );
    await page.locator(".excalidraw").focus();
    await page.keyboard.press("Alt+r");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".board-view-toggle")
          .getAttribute("aria-pressed") === "true",
    );
    await page.keyboard.press("Alt+r");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".board-view-toggle")
          .getAttribute("aria-pressed") === "false",
    );
    await page.evaluate(() =>
      window.h.app.setState({ openDialog: { name: "help" } }),
    );
    await page.locator(".HelpDialog").waitFor();
    assert.equal(await page.locator('.HelpDialog a[href^="http"]').count(), 0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+/");
    await page.locator(".commands").waitFor();
    assert.ok(
      !(await page.locator(".commands").innerText()).includes("GitHub"),
    );
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".shapes-section > div")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS glasses toggle, readonly hover, retract/reveal, explicit editing, hidden footer/title, no Help/GitHub links, reduced motion",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
