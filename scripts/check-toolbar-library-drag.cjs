const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const moduleRoot = "/@fs/" + process.cwd().replaceAll("\\", "/");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3107/?lng=zh-CN");
    await page.locator(".board-top-actions .primary").click();
    await page.locator("canvas").first().waitFor();
    for (const width of [1440, 1183, 862]) {
      await page.setViewportSize({ width, height: 900 });
      const boxes = await Promise.all(
        [".board-editor-bar", ".App-toolbar", ".sidebar-trigger"].map((sel) =>
          page.locator(sel).first().boundingBox(),
        ),
      );
      assert.ok(Math.abs(boxes[0].y - boxes[1].y) <= 1);
      assert.ok(Math.abs(boxes[1].x + boxes[1].width / 2 - width / 2) <= 1);
      const back = await page.locator(".board-return").boundingBox();
      const menu = await page.locator(".main-menu-trigger").boundingBox();
      assert.equal(back.width, back.height);
      assert.equal(back.y, menu.y);
      assert.ok(back.x + back.width < menu.x);
      assert.equal(
        (await page.locator(".board-return").innerText()).trim(),
        "",
      );
      assert.ok(Math.abs(boxes[1].y - boxes[2].y) < 12);
      assert.ok(boxes[0].x + boxes[0].width <= boxes[1].x + 3);
      assert.ok(boxes[1].x + boxes[1].width <= boxes[2].x + 3);
      await page.screenshot({ path: `.git/toolbar-${width}.png` });
    }
    assert.equal(await page.locator(".board-editor-bar button").count(), 2);
    assert.equal(await page.locator(".top-right-ui button").count(), 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() =>
      window.h.app.updateScene({ appState: { viewModeEnabled: true } }),
    );
    await page.locator('[aria-label="画布名称"]').waitFor({ state: "hidden" });
    await page.evaluate(() =>
      window.h.app.updateScene({ appState: { viewModeEnabled: false } }),
    );
    await page.locator('[aria-label="画布名称"]').waitFor();
    await page.locator(".main-menu-trigger").click();
    await page.locator(".dropdown-menu-container").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      async () =>
        (await window.h.app.library.getLatestLibrary()).length === 205,
    );
    await page.locator(".sidebar-trigger").click();
    await page.locator("[data-library-drop-target]").waitFor();
    const openToolbar = await page.locator(".App-toolbar").boundingBox();
    assert.ok(Math.abs(openToolbar.x + openToolbar.width / 2 - 720) <= 1);
    assert.equal(
      await page.locator(".library-drop-target, .library-drag-hint").count(),
      0,
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".library-unit__dragger svg").length > 8,
    );
    const visiblePreviews = await page
      .locator(".library-unit__dragger svg")
      .count();
    const totalItems = await page.evaluate(
      async () => (await window.h.app.library.getLatestLibrary()).length,
    );
    assert.ok(
      visiblePreviews < totalItems / 2,
      `${visiblePreviews}/${totalItems} initial previews`,
    );
    const scroller = page.locator(".library-menu-items-container__items");
    const scrollHeight = await scroller.evaluate((el) => el.scrollHeight);
    for (let y = 0; y < scrollHeight; y += 250) {
      await scroller.evaluate((el, top) => {
        el.scrollTop = top;
      }, y);
      await page.waitForTimeout(50);
    }
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll(".library-unit__dragger svg").length === n,
      totalItems,
    );
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    console.log(
      `197 creator items plus 8 defaults restored without import; ${visiblePreviews} initial previews; all ${totalItems} render after scrolling.`,
    );
    const original = await page.evaluate(async (root) => {
      const { convertToExcalidrawElements } = await import(
        `${root}/packages/excalidraw/data/transform.ts`
      );
      const elements = convertToExcalidrawElements([
        {
          type: "rectangle",
          x: 400,
          y: 230,
          width: 180,
          height: 100,
          backgroundColor: "#d0bfff",
          fillStyle: "solid",
          label: { text: "自定义模块" },
        },
      ]);
      window.h.app.updateScene({
        elements,
        appState: {
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 },
          selectedElementIds: Object.fromEntries(
            elements.map((e) => [e.id, true]),
          ),
        },
      });
      return elements.map((e) => ({ id: e.id, x: e.x, y: e.y, type: e.type }));
    }, moduleRoot);
    await page.waitForFunction(() => window.h.elements.length >= 2);
    const source = await page.evaluate(async (root) => {
      const { sceneCoordsToViewportCoords } = await import(
        `${root}/packages/excalidraw/utils.ts`
      );
      return sceneCoordsToViewportCoords(
        { sceneX: 440, sceneY: 255 },
        window.h.state,
      );
    }, moduleRoot);
    const target = await page
      .locator("[data-library-drop-target]")
      .boundingBox();
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 18 },
    );
    await page.mouse.up();
    await page.waitForFunction(async () =>
      (
        await window.h.app.library.getLatestLibrary()
      ).some((i) => i.elements.some((e) => e.text === "自定义模块")),
    );
    assert.deepEqual(
      await page.evaluate(() =>
        window.h.elements.map((e) => ({
          id: e.id,
          x: e.x,
          y: e.y,
          type: e.type,
        })),
      ),
      original,
    );
    const lib = await page.evaluate(
      async () => await window.h.app.library.getLatestLibrary(),
    );
    const custom = lib.find((i) =>
      i.elements.some((e) => e.text === "自定义模块"),
    );
    assert.equal(custom.status, "unpublished");
    assert.equal(custom.elements.length, original.length);
    const count = await page.evaluate(() => window.h.elements.length);
    const dragger = page
      .locator('.library-unit__dragger[draggable="true"]')
      .filter({ hasText: "自定义模块" })
      .last();
    await dragger.dragTo(page.locator("canvas.interactive"), {
      targetPosition: { x: 580, y: 450 },
    });
    await page.waitForFunction((n) => window.h.elements.length > n, count);
    const center = await page.evaluate(
      ({ ids }) => {
        const es = window.h.elements.filter((e) => !ids.includes(e.id));
        return {
          x:
            (Math.min(...es.map((e) => e.x)) +
              Math.max(...es.map((e) => e.x + e.width))) /
            2,
          y:
            (Math.min(...es.map((e) => e.y)) +
              Math.max(...es.map((e) => e.y + e.height))) /
            2,
        };
      },
      { ids: original.map((e) => e.id) },
    );
    assert.ok(
      Math.abs(center.x - 580) < 10 && Math.abs(center.y - 450) < 10,
      JSON.stringify(center),
    );
    await page
      .getByRole("status")
      .filter({ hasText: "已保存到本机" })
      .waitFor();
    await page.evaluate(() =>
      localStorage.removeItem("excalidraw-creator-kit-restored-v1"),
    );
    await page.reload();
    await page.locator("canvas").first().waitFor();
    await page.waitForFunction(
      async () =>
        (await window.h.app.library.getLatestLibrary()).length === 206,
    );
    await page.waitForFunction(async () =>
      (
        await window.h.app.library.getLatestLibrary()
      ).some((i) => i.elements.some((e) => e.text === "自定义模块")),
    );
    await page.locator(".sidebar-trigger").click();
    const personal = page
      .locator(".library-personal-section .library-unit__dragger")
      .filter({ hasText: "自定义模块" })
      .last();
    await personal.waitFor();
    await personal.click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除素材" }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.ok(await personal.count());
    await personal.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: "删除素材" }).click();
    const beforeDelete = await page.evaluate(() =>
      window.h.elements.map((e) => e.id),
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await page.waitForFunction(
      async () =>
        !(
          await window.h.app.library.getLatestLibrary()
        ).some((i) => i.elements.some((e) => e.text === "自定义模块")),
    );
    assert.deepEqual(
      await page.evaluate(() => window.h.elements.map((e) => e.id)),
      beforeDelete,
    );
    await page.waitForFunction(async (root) => {
      const { LibraryIndexedDBAdapter } = await import(
        `${root}/excalidraw-app/data/LocalData.ts`
      );
      const data = await LibraryIndexedDBAdapter.load();
      return (
        data?.libraryItems.length === 205 &&
        !data.libraryItems.some((i) =>
          i.elements.some((e) => e.text === "自定义模块"),
        )
      );
    }, moduleRoot);
    await page.reload();
    await page.locator("canvas").first().waitFor();
    await page.waitForFunction(
      async () =>
        (await window.h.app.library.getLatestLibrary()).length === 205,
    );
    assert.ok(
      !(await page.evaluate(async () =>
        (
          await window.h.app.library.getLatestLibrary()
        ).some((i) => i.elements.some((e) => e.text === "自定义模块")),
      )),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS centered aligned header at1440/1183/862, view mode hides title, lazy previews, removed buttons, canvas to library copy preserving coordinates, library to canvas drop location, refresh persistence",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
