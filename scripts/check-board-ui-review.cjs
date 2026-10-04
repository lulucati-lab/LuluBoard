const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 862, height: 764 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3107/?lng=zh-CN");
    await page
      .getByRole("button", { name: "新建画布", exact: true })
      .first()
      .waitFor();
    assert.equal(
      await page.getByText("把想法画下来，让知识看得见。").count(),
      0,
    );
    assert.equal(await page.locator(".board-brand svg").count(), 1);
    assert.equal(
      await page
        .getByRole("button", { name: "未分类", exact: true })
        .locator("svg")
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "导入画布", exact: true })
        .locator("svg")
        .count(),
      1,
    );
    await page
      .getByRole("button", { name: "新建画布", exact: true })
      .first()
      .click();
    await page.locator("canvas").first().waitFor();
    assert.equal(
      await page
        .locator(".board-editor-bar")
        .getByRole("button", { name: "历史版本" })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(".board-save-status")
        .evaluate((e) => getComputedStyle(e).clipPath),
      "inset(50%)",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "主页", exact: true })
        .locator("svg")
        .count(),
      1,
    );
    await page.getByTestId("main-menu-trigger").click();
    await page.getByTestId("json-export-button").click();
    await page.locator(".ExportDialog--json").waitFor();
    assert.equal(await page.locator(".ExportDialog--json .Card").count(), 2);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".top-right-ui button").count(), 0);
    await page.getByTestId("main-menu-trigger").click();
    assert.equal(await page.locator(".dropdown-select__language").count(), 0);
    const colors = await page
      .locator(".dropdown-menu-container .color-picker__button")
      .evaluateAll((es) => es.map((e) => getComputedStyle(e).backgroundColor));
    assert.ok(new Set(colors).size > 2, JSON.stringify(colors));
    await page.screenshot({ path: ".git/ui-reviewed-menu.png" });
    await page.getByTestId("image-export-button").click();
    await page.locator(".ImageExportModal").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+/");
    await page.getByText("历史版本", { exact: true }).click();
    await page.getByRole("dialog", { name: "历史版本" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "主页", exact: true }).click();
    await page.locator(".board-home").waitFor();
    await page.screenshot({ path: ".git/ui-reviewed-home.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS original theme/background styles, native export/image, no share button, hidden language/status/history, SVG icons, homepage copy, history via command palette",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
