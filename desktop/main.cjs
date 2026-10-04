const {
  app,
  BrowserWindow,
  protocol,
  net,
  dialog,
  shell,
  Menu,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { createBoardService } = require("./server.cjs");

app.setName("LuluBoard");
// A separate profile is available for development smoke tests only.
if (!app.isPackaged && process.env.LULUBOARD_TEST_PROFILE) {
  app.setPath("userData", path.resolve(process.env.LULUBOARD_TEST_PROFILE));
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "luluboard",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const origin = "luluboard://app";
const isApp = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "luluboard:" && u.host === "app";
  } catch {
    return false;
  }
};
let win;
let closing = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const service = createBoardService(
        path.join(app.getPath("userData"), "boards-data"),
      );
      const web = path.join(__dirname, "web");
      Menu.setApplicationMenu(null);
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      protocol.handle("luluboard", async (req) => {
        try {
          if (
            !isApp(req.url) ||
            (req.initiatorOrigin && !isApp(req.initiatorOrigin))
          )
            return new Response("Forbidden", { status: 403 });
          const url = new URL(req.url);
          if (url.pathname === "/api/local-boards") {
            if (
              req.method !== "POST" ||
              !req.headers.get("content-type")?.startsWith("application/json")
            )
              return new Response("Invalid request", { status: 405 });
            const reader = req.body.getReader();
            const chunks = [];
            let length = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              length += value.length;
              if (length > 256 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("文件超过 256MB");
              }
              chunks.push(Buffer.from(value));
            }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!input || typeof input !== "object" || Array.isArray(input))
              throw new Error("无效请求");
            let result;
            if (input.action === "choose-folder") {
              const choice = await dialog.showOpenDialog(win, {
                title: "选择新的画布保存文件夹（空文件夹）",
                properties: ["openDirectory", "createDirectory"],
              });
              result = { path: choice.canceled ? "" : choice.filePaths[0] };
            } else if (input.action === "open-folder") {
              const { dataPath } = await service({ action: "settings" });
              await service({ action: "list" });
              const error = await shell.openPath(dataPath);
              if (error) throw new Error(error);
              result = { opened: true };
            } else result = await service(input);
            return Response.json(result, {
              headers: { "Cache-Control": "no-store" },
            });
          }
          if (req.method !== "GET")
            return new Response("Method not allowed", { status: 405 });
          const file = path.resolve(
            web,
            `.${decodeURIComponent(
              url.pathname === "/" ? "/index.html" : url.pathname,
            )}`,
          );
          const relative = path.relative(web, file);
          if (
            !relative ||
            relative.startsWith("..") ||
            path.isAbsolute(relative) ||
            relative.includes(":")
          )
            return new Response("Forbidden", { status: 403 });
          return await net.fetch(pathToFileURL(file).href);
        } catch (error) {
          return Response.json(
            { error: error.message || "本机文件读写失败" },
            { status: error.status || 500 },
          );
        }
      });
      win = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 760,
        minHeight: 560,
        title: "LuluBoard · 画板",
        icon: path.join(web, "board-logo.png"),
        backgroundColor: "#fafaff",
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      const openExternal = async (url) => {
        if (
          isApp(url) &&
          ["/licenses/excalidraw-MIT.txt", "/licenses/NOTICE.txt"].includes(
            new URL(url).pathname,
          )
        ) {
          const detail = await fs.readFile(
            path.join(web, new URL(url).pathname),
            "utf8",
          );
          await dialog.showMessageBox(win, {
            title: "开源许可与署名",
            message: "LuluBoard · 画板",
            detail,
            buttons: ["关闭"],
          });
          return;
        }
        if (!/^https:\/\//i.test(url)) return;
        await shell.openExternal(url);
      };
      win.webContents.setWindowOpenHandler(({ url }) => {
        void openExternal(url);
        return { action: "deny" };
      });
      win.webContents.on("will-navigate", (event, url) => {
        if (!isApp(url)) {
          event.preventDefault();
          void openExternal(url);
        }
      });
      win.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      win.on("close", (event) => {
        if (closing) return;
        event.preventDefault();
        if (win.__saving) return;
        win.__saving = true;
        win.webContents
          .executeJavaScript(
            `(async () => {
        const pending = [];
        window.dispatchEvent(new CustomEvent('luluboard-before-close', { detail: pending }));
        await Promise.all(pending);
      })()`,
          )
          .then(async () => {
            await service({ action: "settings" });
            closing = true;
            win.close();
          })
          .catch(async () => {
            win.__saving = false;
            await dialog.showMessageBox(win, {
              type: "error",
              message: "尚未完成保存",
              detail: "窗口已保留。请检查保存错误，重试或导出备份后再关闭。",
            });
          });
      });
      win.once("ready-to-show", () => win.show());
      await win.loadURL(`${origin}/?lng=zh-CN`);
    })
    .catch((error) => {
      dialog.showErrorBox("LuluBoard 无法启动", error.message);
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
}
