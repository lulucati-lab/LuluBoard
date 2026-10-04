const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "board-launch-settings-"),
  );
  const scripts = path.join(root, "project", "scripts");
  await fs.mkdir(scripts, { recursive: true });
  const launcher = path.join(scripts, "open-board.ps1");
  await fs.copyFile("scripts/open-board.ps1", launcher);
  const moved = path.join(root, "new-location");
  await fs.mkdir(moved);
  await fs.writeFile(
    path.join(root, "画布数据.settings.json"),
    JSON.stringify({ version: 1, dataPath: moved }),
  );
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ boards: [], dataPath: moved }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        launcher,
        "-Port",
        String(server.address().port),
        "-NoBrowser",
      ],
      { windowsHide: true, timeout: 10000 },
    );
    console.log("PASS Windows launcher reads migrated location from config");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("board-launch-settings-"));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
