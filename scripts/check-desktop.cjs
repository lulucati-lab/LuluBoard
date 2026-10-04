const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..");
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), "luluboard-desktop-test-"),
  );
  const env = { ...process.env, LULUBOARD_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: path.join(
        root,
        "desktop/node_modules/electron/dist/electron.exe",
      ),
      args: [path.join(root, "desktop")],
      env,
    });
  let app;
  try {
    app = await launch();
    let page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.locator(".board-top-actions .primary").waitFor();
    const api = (action, data = {}) =>
      page.evaluate(
        async ({ action, data }) => {
          const response = await fetch("/api/local-boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...data }),
          });
          if (!response.ok) throw new Error(await response.text());
          return response.json();
        },
        { action, data },
      );
    const initial = await api("list");
    assert.equal(initial.boards.length, 0);
    assert.equal(initial.folders.length, 0);
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    await page.screenshot({ path: path.join(root, ".git/desktop-home.png") });
    await page.locator(".board-top-actions .primary").click();
    await page.locator(".excalidraw").waitFor();
    await page
      .getByRole("button", { name: "素材库", exact: true })
      .count()
      .then(async (count) => {
        if (count)
          await page
            .getByRole("button", { name: "素材库", exact: true })
            .click();
        else await page.locator(".default-sidebar-trigger").click();
      });
    await page.waitForFunction(async () => {
      const r = await fetch("/api/local-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "library-load" }),
      });
      const data = await r.json();
      return data?.libraryItems?.length >= 205;
    });
    await page.keyboard.press("Escape");
    // Real pointer editing followed immediately by native window close.
    await page.keyboard.press("r");
    await page.mouse.move(350, 320);
    await page.mouse.down();
    await page.mouse.move(510, 420);
    await page.mouse.up();
    const boardDirs = await fs.readdir(
      path.join(profile, "boards-data/boards"),
    );
    const boardFile = path.join(
      profile,
      "boards-data/boards",
      boardDirs[0],
      "board.excalidraw",
    );
    const original = boardFile + ".smoke-original";
    await fs.rename(boardFile, original);
    await fs.mkdir(boardFile);
    await app.evaluate(({ dialog, BrowserWindow }) => {
      global.__originalDialog = dialog.showMessageBox;
      dialog.showMessageBox = async () => {
        global.__saveFailureShown = true;
        return { response: 0 };
      };
      BrowserWindow.getAllWindows()[0].close();
    });
    await page.waitForTimeout(800);
    assert.equal(await app.evaluate(() => global.__saveFailureShown), true);
    await fs.rmdir(boardFile);
    await fs.rename(original, boardFile);
    assert.equal(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
      1,
    );
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = global.__originalDialog;
    });
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    app = null;
    const dirs = await fs.readdir(path.join(profile, "boards-data/boards"));
    assert.equal(dirs.length, 1);
    app = await launch();
    page = await app.firstWindow();
    await page.locator(".board-card").first().waitFor();
    const restored = await api("list");
    const doc = await api("read", { id: restored.boards[0].id });
    assert.ok(
      doc.scene.elements.some((el) => el.type === "rectangle"),
      "close must flush drawn rectangle",
    );
    const library = await api("library-load");
    assert.ok(library.libraryItems.length >= 205);
    await page.getByRole("button", { name: "关于画布", exact: true }).click();
    assert.equal(
      await page.locator('a[href="https://github.com/lulucati-lab"]').count(),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: isolated desktop startup, clean workspace, 205 local materials, failed save prevents close, close-save retry, restart persistence, author address, renderer isolation",
    );
  } finally {
    if (app) await app.close();
    console.log("Isolated test profile:", profile);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
