// Isolated browser test; every WebDAV request is mocked, no external files are written.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    let saved = null;
    const requests = [];
    const remote = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
      appState: { name: "云端测试" },
      files: {},
    };
    await p.route("**/__testdav/**", async (route) => {
      const req = route.request();
      requests.push({
        method: req.method(),
        path: new URL(req.url()).pathname,
      });
      if (req.method() === "PROPFIND")
        return route.fulfill({
          status: 207,
          contentType: "application/xml",
          body: '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/__testdav/drawings/demo.excalidraw</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>100</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>',
        });
      if (req.method() === "GET")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(remote),
        });
      if (req.method() === "PUT") {
        saved = JSON.parse(req.postData());
        return route.fulfill({ status: 201, body: "" });
      }
      return route.fulfill({ status: 204, body: "" });
    });
    await p.goto("http://127.0.0.1:3000/?lng=zh-CN");
    await p.locator("canvas").first().waitFor({ state: "visible" });
    await p
      .getByRole("button", { name: "在线模式", exact: true })
      .last()
      .click();
    const inputs = p.locator(".WebDAVDialog input");
    await inputs.nth(0).fill("http://127.0.0.1:3000/__testdav");
    await inputs.nth(1).fill("/drawings");
    await inputs.nth(2).fill("test-user");
    await inputs.nth(3).fill("test-only");
    await p.getByRole("button", { name: "登录", exact: true }).click();
    await p.getByRole("button", { name: "管理文件", exact: true }).click();
    await p.getByText("demo.excalidraw", { exact: true }).waitFor();
    console.log("PASS WebDAV login and list");
    await p.getByText("demo.excalidraw", { exact: true }).click();
    await p.waitForFunction(() =>
      document.body.innerText.includes("正在编辑："),
    );
    console.log("PASS WebDAV open remote document");
    assert.ok(
      requests.some(
        (r) =>
          r.method === "GET" &&
          r.path === "/__testdav/drawings/demo.excalidraw",
      ),
    );
    await p.getByRole("button", { name: /保存到云端/ }).click();
    assert.ok(saved && saved.type === "excalidraw");
    console.log("PASS WebDAV save to mocked server");
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
