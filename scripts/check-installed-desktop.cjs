const { _electron: electron } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const executablePath = path.join(
  process.env.LOCALAPPDATA,
  "Programs/LuluBoard/LuluBoard.exe",
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath, env });
(async () => {
  let app, page;
  const api = (action, data = {}) =>
    page.evaluate(
      async ({ action, data }) => {
        const r = await fetch("/api/local-boards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      },
      { action, data },
    );
  try {
    app = await launch();
    page = await app.firstWindow();
    await page.locator(".board-top-actions .primary").waitFor();
    const initial = await api("list");
    assert.deepEqual(
      initial.boards,
      [],
      "Only run this installer smoke check against a pristine first installation",
    );
    assert.deepEqual(initial.folders, []);
    const runtime = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      version: app.getVersion(),
      data: app.getPath("userData"),
    }));
    assert.equal(runtime.packaged, true);
    assert.equal(runtime.version, "0.1.0-beta.1");
    const doc = await api("create", { name: "安装升级检查（临时）" });
    await app.close();
    app = null;
    const installer = path.join(
      root,
      "release/LuluBoard-0.1.0-beta.1-windows-x64-setup.exe",
    );
    await new Promise((resolve, reject) => {
      const proc = spawn(installer, ["/S"], { windowsHide: true });
      proc.once("error", reject);
      proc.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Installer exit ${code}`)),
      );
    });
    app = await launch();
    page = await app.firstWindow();
    await page.locator(".board-card").first().waitFor();
    const saved = await api("read", { id: doc.id });
    assert.equal(saved.id, doc.id);
    assert.equal(saved.revision, doc.revision);
    const trashed = await api("trash", { id: doc.id, revision: doc.revision });
    await api("purge", { id: doc.id, revision: trashed.revision });
    assert.equal((await api("list")).boards.length, 0);
    console.log(
      "PASS: installed executable, clean initial state, in-place reinstall retains board ID/revision; only temporary test board removed.",
    );
    console.log("User data:", runtime.data);
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
