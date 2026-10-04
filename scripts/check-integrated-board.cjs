// Run with Playwright on NODE_PATH and an isolated Vite test server on port 3107.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `${process.env.BOARD_TEST_URL || "http://127.0.0.1:3107"}/?lng=zh-CN`,
    );
    await page.locator(".board-top-actions .primary").click();
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await page.getByTestId("dropdown-menu-button").click();
    await page.getByTestId("toolbar-markdown-mindmap").click();
    await page
      .locator(".ttd-dialog textarea")
      .fill("# 课程大纲\n## 内容定位\n### 用户需求\n## 选题方法");
    await page
      .getByRole("combobox", { name: "字体", exact: true })
      .selectOption("13");
    await page.getByRole("button", { name: /^插入/ }).click();
    await page.waitForFunction(() =>
      window.h.elements.some((e) => e.text === "课程大纲"),
    );
    assert.ok(
      await page.evaluate(() =>
        window.h.elements
          .filter((e) => e.type === "text")
          .every((e) => e.fontFamily === 13),
      ),
    );
    console.log("PASS Markdown import with Chinese font");
    async function sidebar(name) {
      if (!(await page.getByRole("tab", { name, exact: true }).isVisible()))
        await page.locator(".sidebar-trigger").click();
      await page.getByRole("tab", { name, exact: true }).click();
    }
    await sidebar("思维导图");
    let before = await page.evaluate(() => window.h.elements.length);
    await page.getByRole("button", { name: /横向时间线:/ }).click();
    await page.mouse.click(700, 700);
    await page.waitForFunction((n) => window.h.elements.length > n, before);
    console.log("PASS timeline insertion");
    await sidebar("时序图");
    before = await page.evaluate(() => window.h.elements.length);
    await page.getByRole("button", { name: /空白时序图/ }).click();
    await page.mouse.click(800, 500);
    await page.waitForFunction((n) => window.h.elements.length > n, before);
    console.log("PASS sequence insertion");
    // Import the previously downloaded library into an isolated browser profile.
    const expectedIds = await page.evaluate(async () => {
      const data = await (
        await fetch("/libraries/creator-kit/creator-all.excalidrawlib")
      ).json();
      await window.h.app.library.updateLibrary({
        libraryItems: data.libraryItems,
        merge: true,
      });
      return data.libraryItems.map((i) => i.id);
    });
    assert.equal(expectedIds.length, 197);
    // Wait for the existing persistence pipeline, then reload.
    await page
      .getByRole("status")
      .filter({ hasText: "已保存到本机" })
      .waitFor();
    await page.reload();
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      window.h.elements.some((e) => e.text === "课程大纲"),
    );
    const actualIds = await page.evaluate(async () =>
      (await window.h.app.library.getLatestLibrary()).map((i) => i.id),
    );
    assert.ok(expectedIds.every((id) => actualIds.includes(id)));
    console.log("PASS existing scene and 197 library items survive reload");
    await page.evaluate(() => {
      const text = window.h.elements.find((e) => e.text === "课程大纲");
      window.h.setState({
        openSidebar: null,
        selectedElementIds: { [text.id]: true },
        selectedGroupIds: {},
      });
    });
    await page.getByTestId("font-family-show-fonts").click();
    for (const name of [
      "小赖字体",
      "悠哉字体",
      "霞鹜文楷屏幕阅读版",
      "辰宇落雁体",
    ])
      await page.getByText(name, { exact: true }).waitFor({ state: "visible" });
    await page.getByText("悠哉字体", { exact: true }).click();
    await page.waitForFunction(
      () =>
        window.h.elements.find((e) => e.text === "课程大纲").fontFamily === 12,
    );
    assert.ok(
      await page.evaluate(() =>
        window.h.elements.some((e) => e.type === "text" && e.fontFamily === 13),
      ),
    );
    console.log("PASS per-text Chinese font selection");
    await page.getByTestId("dropdown-menu-button").click();
    await page.getByText("Mermaid 至 Excalidraw", { exact: true }).click();
    await page
      .locator(".ttd-dialog textarea")
      .fill("flowchart LR\n A[输入] --> B[处理] --> C[输出]");
    await page.getByRole("combobox").selectOption("11");
    await page.locator(".ttd-dialog-output-canvas-container canvas").waitFor();
    await page.getByRole("button", { name: /^插入/ }).click();
    await page.waitForFunction(() =>
      window.h.elements.some((e) => e.text === "处理"),
    );
    console.log("PASS Mermaid import");
    const math = await page.evaluate(async (base) => {
      const { ensureSubtypesLoaded } = await import(
        `${base}/packages/excalidraw/element/subtypes/index.ts`
      );
      const { convertToExcalidrawElements } = await import(
        `${base}/packages/excalidraw/data/transform.ts`
      );
      const { exportToSvg } = await import(
        `${base}/packages/excalidraw/scene/export.ts`
      );
      await ensureSubtypesLoaded(["math"]);
      const elements = convertToExcalidrawElements([
        {
          type: "text",
          x: 0,
          y: 0,
          text: "\\(\\frac{1}{2}\\)",
          subtype: "math",
          customData: { useTex: true },
        },
      ]);
      const svg = await exportToSvg(
        elements,
        { ...window.h.state, exportBackground: false },
        {},
      );
      return { count: elements.length, svg: svg.outerHTML };
    }, "/@fs/" + process.cwd().replaceAll("\\", "/"));
    assert.ok(math.svg.includes("data-mml-node"));
    console.log("PASS MathJax formula SVG rendering");
    await page.getByTestId("main-menu-trigger").click();
    for (const name of [
      "GitHub",
      "Follow us",
      "Discord chat",
      "Sign up",
      "Excalidraw+",
    ])
      assert.equal(
        await page
          .locator(".dropdown-menu-container")
          .getByText(name, { exact: true })
          .count(),
        0,
      );
    assert.ok(
      await page.getByText("自定义字体...", { exact: true }).isVisible(),
    );
    console.log("PASS clean menu and legacy custom font entry");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
