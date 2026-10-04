// Start a separate Vite with BOARD_DATA_DIR set to a disposable test directory.
// NODE_PATH must point to the existing Playwright installation.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");
const base = process.env.BOARD_TEST_URL || "http://127.0.0.1:3107";
const moduleRoot = "/@fs/" + process.cwd().replaceAll("\\", "/");
const stamp = Date.now();
const title = `课程测试-${stamp}`;
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV3sAAAAASUVORK5CYII=";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const rpc = async (action, data = {}) => {
    const response = await context.request.post(`${base}/api/local-boards`, {
      data: { action, ...data },
    });
    assert.equal(response.ok(), true, await response.text());
    return response.json();
  };
  const saved = () =>
    page
      .getByRole("status")
      .filter({ hasText: "已保存到本机" })
      .waitFor({ timeout: 30000 });
  const home = async () => {
    await page.getByRole("button", { name: "主页", exact: true }).click();
    await page
      .getByRole("heading", { name: "全部画布", exact: true })
      .waitFor();
  };
  const option = async (label, action) => {
    const card = page
      .locator(".board-card")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await card.locator("summary").click();
    await card.getByRole("button", { name: action, exact: true }).click();
  };
  try {
    const info = await rpc("list");
    assert.equal(
      path.dirname(info.dataPath),
      path.resolve(os.tmpdir()),
      "Use a disposable test data directory",
    );
    assert.ok(
      path.basename(info.dataPath).startsWith("excalidraw-home-browser-"),
    );
    if (!info.folders.length)
      info.folders.push(await rpc("folder-create", { name: "测试文件夹" }));
    await page.goto(`${base}/?lng=zh-CN`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "全部画布", exact: true })
      .waitFor();
    await page.locator(".board-top-actions .primary").click();
    await page.locator("canvas").first().waitFor({ state: "visible" });
    const id = new URL(page.url()).searchParams.get("board");
    await page
      .getByRole("textbox", { name: "画布名称", exact: true })
      .fill(title);
    await page
      .getByRole("textbox", { name: "画布名称", exact: true })
      .press("Enter");
    await page.evaluate(
      async ({ moduleRoot, png }) => {
        const { convertToExcalidrawElements } = await import(
          `${moduleRoot}/packages/excalidraw/data/transform.ts`
        );
        const elements = convertToExcalidrawElements([
          {
            type: "rectangle",
            x: 100,
            y: 120,
            width: 220,
            height: 100,
            backgroundColor: "#e5dbff",
            fillStyle: "solid",
          },
          { type: "text", x: 125, y: 150, text: "课程内容", fontFamily: 13 },
          {
            type: "image",
            x: 380,
            y: 120,
            width: 100,
            height: 100,
            fileId: "test-image",
            status: "saved",
          },
        ]);
        window.h.app.addFiles([
          {
            id: "test-image",
            dataURL: png,
            mimeType: "image/png",
            created: Date.now(),
          },
        ]);
        window.h.app.updateScene({ elements });
      },
      { moduleRoot, png },
    );
    await saved();
    let doc = await rpc("read", { id });
    assert.equal(doc.name, title);
    assert.equal(doc.scene.elements.length, 3);
    assert.equal(doc.scene.files["test-image"].dataURL, png);
    assert.ok(doc.thumbnail.startsWith("data:image/png"));
    const diskFile = path.join(info.dataPath, "boards", id, "board.excalidraw");
    assert.equal(
      JSON.parse(await fs.readFile(diskFile, "utf8")).type,
      "excalidraw",
    );
    console.log(
      "PASS new / rename / autosave / thumbnail / embedded images on disk",
    );

    const second = await context.newPage();
    await second.goto(page.url(), { waitUntil: "domcontentloaded" });
    await second.getByText(/正在另一个标签页编辑/).waitFor();
    await second.close();
    console.log("PASS second tab cannot overwrite the active editor");

    await home();
    await page
      .getByRole("button", { name: `打开 ${title}`, exact: true })
      .click();
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await page.waitForFunction(() => window.h.elements.length === 3);
    assert.equal(
      await page.evaluate(() => window.h.app.files["test-image"].dataURL),
      png,
    );
    await saved();
    const raw = JSON.parse(await fs.readFile(diskFile, "utf8"));
    raw.localBoard.snapshotAt = 0;
    await fs.writeFile(diskFile, JSON.stringify(raw));
    await page
      .getByRole("textbox", { name: "画布名称", exact: true })
      .fill(`${title}-新版`);
    await page
      .getByRole("textbox", { name: "画布名称", exact: true })
      .press("Enter");
    await saved();
    await page.keyboard.press("Control+/");
    await page.getByText("历史版本", { exact: true }).click();
    await page.getByRole("dialog").getByRole("radio").first().check();
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      page.getByRole("button", { name: "备份当前并恢复所选版本" }).click(),
    ]);
    await page.locator("canvas").first().waitFor({ state: "visible" });
    assert.ok((await rpc("versions", { id })).length >= 2);
    console.log(
      "PASS reopening retains image and history restoration backs up current version",
    );

    await page.route("**/api/local-boards", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === "save")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "测试磁盘不可用" }),
        });
      return route.continue();
    });
    await page
      .getByRole("textbox", { name: "画布名称", exact: true })
      .fill(`${title}-恢复`);
    await page
      .getByRole("textbox", { name: "画布名称", exact: true })
      .press("Enter");
    await page.getByRole("status").filter({ hasText: "保存失败" }).waitFor();
    assert.ok(
      await page
        .getByRole("button", { name: "导出备份", exact: true })
        .isVisible(),
    );
    await page.unroute("**/api/local-boards");
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await saved();
    assert.equal((await rpc("read", { id })).name, `${title}-恢复`);
    console.log(
      "PASS failed save is visible and browser draft recovers after reload",
    );

    await home();
    const currentTitle = `${title}-恢复`;
    await option(currentTitle, "复制画布");
    await page
      .getByRole("heading", { name: `${currentTitle} 副本`, exact: true })
      .waitFor();
    await option(currentTitle, "移动到…");
    await page
      .getByRole("combobox", { name: "选择文件夹" })
      .selectOption(info.folders[0].id);
    await page.getByRole("button", { name: "确定", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await rpc("read", { id })).folderId, info.folders[0].id);
    await option(currentTitle, "移入回收站");
    await page.getByRole("button", { name: "确定", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /回收站/ }).click();
    await option(currentTitle, "恢复画布");
    await page.locator("nav button").first().click();
    await page
      .getByRole("heading", { name: currentTitle, exact: true })
      .waitFor();
    await page.getByRole("textbox", { name: "搜索画布" }).fill(currentTitle);
    assert.equal(await page.locator(".board-card").count(), 2);
    await page.getByRole("textbox", { name: "搜索画布" }).fill("");
    console.log("PASS copy / move / trash / restore / search");

    const beforeImport = (await rpc("list")).boards.length;
    const exported = (await rpc("read", { id })).scene;
    await page.locator('input[type="file"]').setInputFiles({
      name: `${currentTitle}.excalidraw`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page.waitForFunction(
      async (before) =>
        (await (await fetch("/api/local-boards")).json()).boards.length ===
        before + 1,
      beforeImport,
    );
    assert.equal(
      (await rpc("read", { id })).scene.files["test-image"].dataURL,
      png,
    );
    console.log("PASS importing the same name creates a separate document");
    await page.screenshot({ path: ".git/board-home-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({ path: ".git/board-home-mobile.png" });
    console.log("PASS mobile layout without horizontal overflow");
    const rejected = await context.request.post(`${base}/api/local-boards`, {
      headers: { Origin: "https://evil.example" },
      data: { action: "create", name: "must reject" },
    });
    assert.equal(rejected.status(), 403);
    assert.deepEqual(errors, []);
    console.log("PASS cross-origin write rejected and no browser exceptions");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
