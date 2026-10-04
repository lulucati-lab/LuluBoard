const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:3107";
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1183, height: 764 },
      acceptDownloads: true,
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const api = async (action, data = {}) => {
      const res = await page.request.post(origin + "/api/local-boards", {
        data: { action, ...data },
      });
      assert.equal(res.status(), 200, await res.text());
      return res.json();
    };
    await page.goto(origin + "/?lng=zh-CN");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("radio", { name: "深色", exact: true }).check();
    await page.waitForFunction(
      () => document.documentElement.dataset.boardTheme === "dark",
    );
    await page.screenshot({ path: ".git/settings-dark.png" });
    await page.keyboard.press("Escape");
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.boardTheme === "dark",
    );
    const settings = await page
      .getByRole("button", { name: "设置", exact: true })
      .boundingBox();
    const trash = await page
      .getByRole("button", { name: "回收站", exact: true })
      .boundingBox();
    assert.ok(settings.y + settings.height <= trash.y + 1);
    await page.locator(".board-top-actions .primary").click();
    await page.locator(".excalidraw.theme--dark").waitFor();
    await page.waitForFunction(
      async () => (await window.h.app.library.getLatestLibrary()).length >= 205,
    );
    const personal = {
      id: "settings-personal",
      created: Date.now(),
      status: "unpublished",
      elements: [],
    };
    await page.evaluate(async (personal) => {
      await window.h.app.library.updateLibrary({
        libraryItems: (items) => [
          ...items,
          { ...personal, elements: items[0].elements },
        ],
      });
    }, personal);
    await page.getByRole("button", { name: "主页", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await page.getByRole("radio", { name: "跟随系统", exact: true }).check();
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(
      () => document.documentElement.dataset.boardTheme === "light",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(
      () => document.documentElement.dataset.boardTheme === "dark",
    );
    await page.getByRole("button", { name: "备份与恢复", exact: true }).click();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载完整备份", exact: true })
      .click();
    const download = await downloadEvent;
    const backup = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.ok(backup.boards.length >= 1);
    assert.ok(backup.libraryItems.length >= 205);
    backup.libraryItems.push({
      ...backup.libraryItems[0],
      id: "settings-restored-material",
      status: "unpublished",
    });
    const before = await api("list");
    await page
      .locator('.board-settings-panel input[type="file"]')
      .setInputFiles({
        name: "backup.boardbackup",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
      });
    await page
      .getByRole("button", { name: "确认恢复为副本", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "确认恢复为副本", exact: true })
      .click();
    await page.getByText(/原有作品已保留/).waitFor();
    const after = await api("list");
    assert.equal(
      after.boards.length,
      before.boards.length + backup.boards.length,
    );
    assert.ok(
      before.boards.every((b) =>
        after.boards.some((a) => a.id === b.id && a.revision === b.revision),
      ),
    );
    await page
      .locator('.board-settings-panel input[type="file"]')
      .setInputFiles({
        name: "bad.boardbackup",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
    await page.getByRole("alert").waitFor();
    assert.equal((await api("list")).boards.length, after.boards.length);
    await page.getByRole("button", { name: "文件存储", exact: true }).click();
    const target = before.dataPath + "-moved";
    assert.ok(before.dataPath.includes("excalidraw-home-browser-"));
    await page.getByLabel("新的保存位置").fill(target);
    await page.getByRole("button", { name: "更改位置", exact: true }).click();
    await page
      .getByRole("button", { name: "确认复制并切换", exact: true })
      .click();
    await page.getByText(/所有文件已校验/).waitFor();
    assert.equal((await api("list")).dataPath, target);
    await page.screenshot({ path: ".git/settings-storage.png" });
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "文件存储", exact: true }).click();
    assert.equal(await page.locator(".board-storage-path").innerText(), target);
    await page.keyboard.press("Escape");
    await page.locator(".board-preview").first().click();
    await page.locator("canvas").first().waitFor();
    await page.waitForFunction(async () =>
      (
        await window.h.app.library.getLatestLibrary()
      ).some((item) => item.id === "settings-restored-material"),
    );
    await page.getByRole("button", { name: "主页", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "文件存储", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await page.getByRole("dialog").boundingBox();
    assert.equal(dialog.width, 390);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: ".git/settings-mobile.png" });
    await page.getByRole("button", { name: "关闭对话框", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS settings placement, light/dark/system persistence, editor theme, complete backup, restore copies, reject invalid archive, verified migration, mobile dialog",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
