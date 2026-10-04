const fs = require("node:fs/promises");
const path = require("node:path");
const { build } = require("esbuild");

(async () => {
  const root = path.resolve(__dirname, "..");
  const web = path.join(__dirname, "web");
  // Only this generated directory is replaced; user data is outside the app.
  await fs.rm(web, { recursive: true, force: true });
  await fs.cp(path.join(root, "excalidraw-app/build"), web, {
    recursive: true,
    filter: (file) => !file.endsWith(".map"),
  });
  await fs.copyFile(
    path.join(root, "LICENSE"),
    path.join(web, "licenses/LICENSE.txt"),
  );
  // Include installed dependency license texts, also covering bundled web code.
  const notices = [];
  const collect = async (modules) => {
    for (const entry of await fs.readdir(modules, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const dir = path.join(modules, entry.name);
      if (entry.name.startsWith("@")) {
        await collect(dir);
        continue;
      }
      try {
        const info = JSON.parse(
          await fs.readFile(path.join(dir, "package.json"), "utf8"),
        );
        const licenses = (await fs.readdir(dir)).filter((name) =>
          /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
        );
        for (const name of licenses) {
          const file = path.join(dir, name);
          if ((await fs.stat(file)).isFile())
            notices.push(
              `\n\n--- ${info.name}@${
                info.version
              } / ${name} ---\n${await fs.readFile(file, "utf8")}`,
            );
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      try {
        await collect(path.join(dir, "node_modules"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  };
  await collect(path.join(root, "node_modules"));
  await fs.writeFile(
    path.join(web, "licenses/DEPENDENCIES.txt"),
    notices.join(""),
  );
  await build({
    entryPoints: [path.join(root, "excalidraw-app/boards/server.ts")],
    outfile: path.join(__dirname, "server.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
  });
})();
