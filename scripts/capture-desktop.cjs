const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = path.resolve(__dirname, "..");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "luluboard-promo-"));
  const env = { ...process.env, LULUBOARD_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: path.join(
      root,
      "desktop/node_modules/electron/dist/electron.exe",
    ),
    args: [path.join(root, "desktop")],
    env,
  });
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 940),
    );
    const page = await app.firstWindow();
    const output = path.join(root, "docs/images");
    await fs.mkdir(output, { recursive: true });
    await page.locator(".board-top-actions .primary").waitFor();
    await page.screenshot({ path: path.join(output, "home.png") });
    const elements = [];
    let serial = 0;
    const base = (type, x, y, width, height, color = "#242235") => ({
      id: `promo-${++serial}`,
      type,
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: color,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: serial,
      version: 1,
      versionNonce: serial,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    });
    const label = (text, x, y, size = 24, color) =>
      elements.push({
        ...base("text", x, y, text.length * size, size * 1.3, color),
        text,
        originalText: text,
        fontSize: size,
        fontFamily: 13,
        textAlign: "left",
        verticalAlign: "top",
        containerId: null,
        autoResize: true,
        lineHeight: 1.3,
      });
    label("把知识讲清楚", 220, 175, 46);
    label("从一个问题，到一张能讲解的画布", 222, 242, 22, "#77728b");
    const titles = ["选题", "结构", "表达"];
    const captions = [
      "找到观众真正的问题",
      "拆出三个关键知识点",
      "用图形让观点看得见",
    ];
    for (let i = 0; i < 3; i++) {
      const x = 220 + i * 315;
      elements.push({
        ...base("rectangle", x, 355, 260, 195, "#b6afea"),
        backgroundColor: "#f2efff",
        roundness: { type: 3 },
      });
      label(`0${i + 1}`, x + 24, 379, 20, "#7165d8");
      label(titles[i], x + 24, 414, 32);
      label(captions[i], x + 24, 481, 18, "#625d76");
      if (i < 2)
        elements.push({
          ...base("arrow", x + 272, 452, 30, 0, "#8b81d8"),
          points: [
            [0, 0],
            [30, 0],
          ],
          startArrowhead: null,
          endArrowhead: "arrow",
          startBinding: null,
          endBinding: null,
        });
    }
    label("lulucati   /   知识创作者的本地画板", 222, 640, 20, "#8b859b");
    const doc = await page.evaluate(
      async (elements) =>
        (
          await fetch("/api/local-boards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create",
              name: "把知识讲清楚 · 演示",
              scene: {
                type: "excalidraw",
                version: 2,
                elements,
                appState: { viewBackgroundColor: "#ffffff" },
                files: {},
              },
            }),
          })
        ).json(),
      elements,
    );
    await page.goto(`luluboard://app/?lng=zh-CN&board=${doc.id}`);
    await page.locator(".App-toolbar").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(output, "canvas.png") });
    await page.locator(".default-sidebar-trigger").click();
    await page.locator(".library-unit").first().waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, "library.png") });
    await page.getByTestId("sidebar-close").click();
    await page
      .getByRole("button", { name: "进入查看模式", exact: true })
      .click();
    await page.mouse.move(500, 600);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(output, "presentation.png") });
    await page.getByRole("button", { name: "主页", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.screenshot({ path: path.join(output, "settings.png") });
    console.log(
      "Saved five real UI screenshots; promo data remains only in isolated temporary profile.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
