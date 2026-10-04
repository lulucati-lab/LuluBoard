import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const validId = (id: unknown): string => {
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
    return fail("无效的画布或版本编号");
  }
  return id;
};
const name = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    return fail("名称请填写 1–120 个字符");
  }
  return value.trim();
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const emptyScene = () => ({
  type: "excalidraw",
  version: 2,
  elements: [],
  appState: {},
  files: {},
});
const validateScene = (scene: any) => {
  if (
    !scene ||
    scene.type !== "excalidraw" ||
    !Array.isArray(scene.elements) ||
    scene.elements.length > 100000 ||
    !scene.appState ||
    typeof scene.appState !== "object" ||
    Array.isArray(scene.appState) ||
    !scene.files ||
    typeof scene.files !== "object" ||
    Array.isArray(scene.files) ||
    scene.elements.some(
      (el: any) => !el || typeof el !== "object" || typeof el.id !== "string",
    )
  ) {
    fail("画布文件格式不正确");
  }
  return scene;
};
export const atomicWrite = async (file: string, value: unknown) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(tmp, "wx");
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
};

export function validateBackup(value: any) {
  if (
    !value ||
    value.type !== "lulucati-board-backup" ||
    value.version !== 1 ||
    !Array.isArray(value.boards) ||
    value.boards.length > 5000 ||
    !Array.isArray(value.folders) ||
    value.folders.length > 5000
  )
    fail("不是有效的画板备份文件");
  const ids = new Set<string>();
  for (const folder of value.folders) {
    validId(folder?.id);
    name(folder?.name);
    if (ids.has(folder.id)) fail("备份包含重复文件夹编号");
    ids.add(folder.id);
  }
  const checkDoc = (doc: any) => {
    if (!doc || typeof doc !== "object") fail("备份中的画布损坏");
    name(doc.name);
    validateScene(doc.scene);
    for (const key of ["createdAt", "updatedAt"]) {
      if (!Number.isFinite(doc[key]) || doc[key] < 0) fail("备份中的时间无效");
    }
    if (
      doc.deletedAt !== null &&
      (!Number.isFinite(doc.deletedAt) || doc.deletedAt < 0)
    )
      fail("备份中的回收站状态无效");
    if (doc.folderId && !ids.has(doc.folderId)) fail("备份中的文件夹不存在");
    if (
      doc.thumbnail &&
      (typeof doc.thumbnail !== "string" ||
        !/^data:image\/(png|jpeg|webp);base64,/.test(doc.thumbnail))
    )
      fail("备份缩略图格式无效");
  };
  for (const entry of value.boards) {
    checkDoc(entry?.doc);
    if (!Array.isArray(entry.history) || entry.history.length > 20)
      fail("备份历史版本格式无效");
    for (const doc of entry.history) {
      // Versions may still reference a previously removed folder.
      checkDoc({ ...doc, folderId: null });
      if (
        doc.savedAt !== undefined &&
        (!Number.isSafeInteger(doc.savedAt) || doc.savedAt < 0)
      )
        fail("备份历史时间无效");
    }
  }
  if (value.libraryItems !== undefined) {
    if (!Array.isArray(value.libraryItems) || value.libraryItems.length > 10000)
      fail("备份素材库格式无效");
    for (const item of value.libraryItems) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id ||
        item.id.length > 200
      )
        fail("备份素材编号无效");
      if (
        !["published", "unpublished"].includes(item.status) ||
        !Number.isFinite(item.created)
      )
        fail("备份素材格式无效");
      validateScene({
        type: "excalidraw",
        elements: item.elements,
        appState: {},
        files: {},
      });
    }
  }
  return value;
}

// One local process owns these files; serialize mutations and use revisions to
// reject stale browser writes. Documents include images so other boards cannot
// lose their files when the editor cleans up its legacy image cache.
export function createBoardStore(root: string, clock = () => Date.now()) {
  const boardDir = (id: unknown) => path.join(root, "boards", validId(id));
  const readJSON = async (file: string) =>
    JSON.parse(await fs.readFile(file, "utf8"));
  const read = async (id: unknown) => {
    try {
      try {
        const { localBoard, ...scene } = await readJSON(
          path.join(boardDir(id), "board.excalidraw"),
        );
        if (!localBoard || localBoard.id !== id)
          fail("画布文件元数据损坏", 422);
        return { ...localBoard, scene };
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
        // Preserve the first development format as a recoverable copy.
        return await readJSON(path.join(boardDir(id), "board.json"));
      }
    } catch (error: any) {
      if (error.code === "ENOENT") fail("画布不存在", 404);
      throw error;
    }
  };
  const metadata = ({ scene, ...doc }: any) => doc;
  const foldersFile = path.join(root, "folders.json");
  const folders = async () => {
    try {
      return await readJSON(foldersFile);
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      const items: { id: string; name: string }[] = [];
      await atomicWrite(foldersFile, items);
      return items;
    }
  };
  const list = async () => {
    await fs.mkdir(path.join(root, "boards"), { recursive: true });
    const entries = await fs.readdir(path.join(root, "boards"), {
      withFileTypes: true,
    });
    return Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => read(entry.name)),
    );
  };
  const write = (doc: any) =>
    atomicWrite(path.join(boardDir(doc.id), "board.excalidraw"), {
      ...doc.scene,
      localBoard: metadata(doc),
    });
  const versions = async (id: string) => {
    const dir = path.join(boardDir(id), "history");
    await fs.mkdir(dir, { recursive: true });
    return (await fs.readdir(dir))
      .filter((file) => /^\d+-[a-zA-Z0-9-]+\.json$/.test(file))
      .sort()
      .reverse();
  };
  const snapshot = async (doc: any) => {
    const dir = path.join(boardDir(doc.id), "history");
    await atomicWrite(path.join(dir, `${clock()}-${randomUUID()}.json`), doc);
    for (const file of (await versions(doc.id)).slice(20))
      await fs.unlink(path.join(dir, file));
  };
  const folderId = async (id: unknown) => {
    if (id === null || id === undefined || id === "") return null;
    if (!(await folders()).some((f: any) => f.id === id)) fail("文件夹不存在");
    return id;
  };
  const create = async (input: any) => {
    if (input.migrationKey) {
      validId(input.migrationKey);
      const previous = (await list()).find(
        (doc) => doc.migrationKey === input.migrationKey,
      );
      if (previous) return previous;
    }
    const scene = validateScene(input.scene || emptyScene());
    const doc = {
      id: randomUUID(),
      name: name(input.name || "未命名画布"),
      folderId: await folderId(input.folderId),
      createdAt: clock(),
      updatedAt: clock(),
      lastOpenedAt: null as number | null,
      revision: 1,
      deletedAt: null,
      snapshotAt: clock(),
      thumbnail: "",
      migrationKey: input.migrationKey || null,
      scene,
    };
    doc.scene.appState.name = doc.name;
    if (input.migrationKey)
      await atomicWrite(
        path.join(root, "backups", `${input.migrationKey}.excalidraw`),
        scene,
      );
    await write(doc);
    return doc;
  };
  const run = async (input: any) => {
    switch (input.action) {
      case "list":
        return {
          boards: (await list()).map(metadata),
          folders: await folders(),
          dataPath: root,
        };
      case "backup":
        return {
          type: "lulucati-board-backup",
          version: 1,
          createdAt: clock(),
          folders: await folders(),
          boards: await Promise.all(
            (
              await list()
            ).map(async (doc) => ({
              doc,
              history: await Promise.all(
                (
                  await versions(doc.id)
                ).map(async (file) => ({
                  ...(await readJSON(
                    path.join(boardDir(doc.id), "history", file),
                  )),
                  savedAt: Number(file.split("-")[0]),
                })),
              ),
            })),
          ),
        };
      case "backup-restore": {
        const backup = validateBackup(input.backup);
        const previousFolders = await folders();
        const folderMap = new Map<string, string>();
        const newFolders = backup.folders.map((folder: any) => {
          const id = randomUUID();
          folderMap.set(folder.id, id);
          return { id, name: folder.name };
        });
        const created: string[] = [];
        try {
          await atomicWrite(foldersFile, [...previousFolders, ...newFolders]);
          for (const entry of backup.boards) {
            const doc = await create({
              name: entry.doc.name,
              scene: entry.doc.scene,
              folderId: entry.doc.folderId
                ? folderMap.get(entry.doc.folderId)
                : null,
            });
            created.push(doc.id);
            doc.createdAt = entry.doc.createdAt;
            doc.deletedAt = entry.doc.deletedAt;
            doc.thumbnail = entry.doc.thumbnail || "";
            await write(doc);
            for (const version of entry.history) {
              await atomicWrite(
                path.join(
                  boardDir(doc.id),
                  "history",
                  `${
                    version.savedAt ?? version.updatedAt
                  }-${randomUUID()}.json`,
                ),
                {
                  ...doc,
                  scene: version.scene,
                  name: version.name,
                  updatedAt: version.updatedAt,
                  thumbnail: version.thumbnail || "",
                },
              );
            }
          }
          return { boards: created.length, folders: newFolders.length };
        } catch (error) {
          await atomicWrite(foldersFile, previousFolders);
          for (const id of created)
            await fs.rm(boardDir(id), { recursive: true, force: true });
          throw error;
        }
      }
      case "create":
        return create(input);
      case "folder-create": {
        const items = await folders();
        const label = name(input.name);
        if (items.some((f: any) => f.name === label)) fail("已有同名文件夹");
        const item = { id: randomUUID(), name: label };
        await atomicWrite(foldersFile, [...items, item]);
        return item;
      }
      case "folder-rename":
      case "folder-delete": {
        const items = await folders();
        if (!items.some((f: any) => f.id === input.id))
          fail("文件夹不存在", 404);
        if (input.action === "folder-delete") {
          for (const doc of await list()) {
            if (doc.folderId === input.id) {
              doc.folderId = null;
              doc.revision++;
              await write(doc);
            }
          }
          await atomicWrite(
            foldersFile,
            items.filter((f: any) => f.id !== input.id),
          );
        } else {
          const label = name(input.name);
          if (items.some((f: any) => f.name === label && f.id !== input.id))
            fail("已有同名文件夹");
          await atomicWrite(
            foldersFile,
            items.map((f: any) =>
              f.id === input.id ? { ...f, name: label } : f,
            ),
          );
        }
        return { ok: true };
      }
    }
    const doc = await read(input.id);
    if (input.action === "read") return doc;
    if (input.action === "open") {
      if (doc.deletedAt) fail("画布已在回收站", 409);
      doc.lastOpenedAt = clock();
      await write(doc);
      return doc;
    }
    if (input.action === "versions") {
      return Promise.all(
        (await versions(doc.id)).map(async (file) => {
          const saved = await readJSON(
            path.join(boardDir(doc.id), "history", file),
          );
          return {
            id: file.slice(0, -5),
            savedAt: Number(file.split("-")[0]),
            name: saved.name,
          };
        }),
      );
    }
    if (input.revision !== doc.revision)
      fail(
        "画布已在其他页面修改，请返回主页重新打开；你的未保存内容仍在本地暂存。",
        409,
      );
    if (input.action === "purge") {
      if (!doc.deletedAt) fail("请先将画布移入回收站");
      await fs.rm(boardDir(doc.id), { recursive: true });
      return { ok: true };
    }
    if (input.action === "duplicate")
      return create({
        name: `${doc.name.slice(0, 115)} 副本`,
        folderId: doc.folderId,
        scene: doc.scene,
      });
    if (doc.deletedAt && !["restore", "update"].includes(input.action))
      fail("画布已在回收站", 409);
    switch (input.action) {
      case "save": {
        const scene = validateScene(input.scene);
        const label = name(scene.appState.name || doc.name);
        if (
          hash(scene) !== hash(doc.scene) &&
          clock() - doc.snapshotAt >= 5 * 60 * 1000
        ) {
          await snapshot(doc);
          doc.snapshotAt = clock();
        }
        doc.scene = scene;
        doc.name = label;
        if (
          typeof input.thumbnail === "string" &&
          /^data:image\/png;base64,/.test(input.thumbnail) &&
          input.thumbnail.length < 2000000
        )
          doc.thumbnail = input.thumbnail;
        break;
      }
      case "update":
        if (input.name !== undefined) {
          doc.name = name(input.name);
          doc.scene.appState.name = doc.name;
        }
        if (input.folderId !== undefined)
          doc.folderId = await folderId(input.folderId);
        break;
      case "trash":
        doc.deletedAt = clock();
        break;
      case "restore":
        doc.deletedAt = null;
        break;
      case "restore-version": {
        const version = validId(input.version);
        if (!(await versions(doc.id)).includes(`${version}.json`))
          fail("历史版本不存在", 404);
        const previous = await readJSON(
          path.join(boardDir(doc.id), "history", `${version}.json`),
        );
        await snapshot(doc);
        doc.scene = previous.scene;
        doc.scene.appState.name = doc.name;
        doc.thumbnail = previous.thumbnail;
        doc.snapshotAt = clock();
        break;
      }
      default:
        fail("不支持的操作");
    }
    doc.revision++;
    doc.updatedAt = clock();
    await write(doc);
    return doc;
  };
  let queue = Promise.resolve();
  return (input: any): Promise<any> => {
    const result = queue.then(() => run(input));
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export const localBoardsPlugin = (): Plugin => {
  const defaultRoot = path.resolve(
    process.env.BOARD_DATA_DIR || path.join(process.cwd(), "../../画布数据"),
  );
  const store = createBoardService(defaultRoot);
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.url?.split("?")[0] !== "/api/local-boards") return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
        fail("只允许本机访问", 403);
      if (
        (req.headers.origin && req.headers.origin !== `http://${host}`) ||
        (req.headers["sec-fetch-site"] &&
          !["same-origin", "none"].includes(
            String(req.headers["sec-fetch-site"]),
          ))
      )
        fail("拒绝跨站访问", 403);
      let input: any = { action: "list" };
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          fail("需要 JSON 请求", 415);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 256 * 1024 * 1024)
            fail("文件超过 256MB，请减少图片大小或拆分导入", 413);
          chunks.push(Buffer.from(chunk));
        }
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          fail("无效的 JSON");
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          fail("无效请求");
      } else if (req.method !== "GET") fail("不支持的方法", 405);
      res.end(JSON.stringify(await store(input)));
    } catch (error: any) {
      res.statusCode = error.status || 500;
      res.end(
        JSON.stringify({
          error: error.status
            ? error.message
            : "本机文件读写失败，请检查磁盘空间和目录权限。",
        }),
      );
      if (!error.status) console.error("Local board storage:", error);
    }
  };
  return {
    name: "local-boards",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
};

// The service queue also covers migration, so a queued autosave follows the
// directory switch instead of writing into the old copy.
export function createBoardService(
  defaultRoot: string,
  configFile = `${defaultRoot}.settings.json`,
) {
  let root = path.resolve(defaultRoot);
  let store = createBoardStore(root);
  const ready = (async () => {
    try {
      const config = JSON.parse(await fs.readFile(configFile, "utf8"));
      if (
        config.version !== 1 ||
        typeof config.dataPath !== "string" ||
        !path.isAbsolute(config.dataPath)
      )
        fail("保存位置配置损坏，请从备份恢复配置", 500);
      root = await fs.realpath(config.dataPath);
      if (!(await fs.stat(root)).isDirectory())
        fail("配置的保存位置不可用", 500);
      store = createBoardStore(root);
    } catch (error: any) {
      // Only a missing config means first use. A missing configured disk must
      // never silently create an empty workspace at the original location.
      if (error.code === "ENOENT" && error.path === configFile) return;
      throw error;
    }
  })();
  // No unhandled rejection while the server is starting; requests expose it.
  void ready.catch(() => {});
  const exec = promisify(execFile);
  const manifest = async (
    dir: string,
    prefix = "",
  ): Promise<Record<string, string>> => {
    const result: Record<string, string> = Object.create(null);
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const key = path.join(prefix, entry.name);
      if (entry.isSymbolicLink())
        fail("保存目录含有链接，请先将链接内容移出后再迁移");
      if (entry.isDirectory()) Object.assign(result, await manifest(file, key));
      else if (entry.isFile())
        result[key] = createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex");
      else fail("保存目录含有不支持的文件类型");
    }
    return result;
  };
  const run = async (input: any) => {
    await ready;
    if (input.action === "settings") return { dataPath: root };
    if (input.action === "library-load") {
      try {
        return JSON.parse(
          await fs.readFile(path.join(root, "library.json"), "utf8"),
        );
      } catch (error: any) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }
    if (input.action === "library-save") {
      validateBackup({
        type: "lulucati-board-backup",
        version: 1,
        boards: [],
        folders: [],
        libraryItems: input.data?.libraryItems,
      });
      if (!Array.isArray(input.data?.libraryItems)) fail("素材库格式无效");
      await atomicWrite(path.join(root, "library.json"), input.data);
      return { saved: true };
    }
    if (input.action === "backup-preview") {
      const backup = validateBackup(input.backup);
      return {
        boards: backup.boards.length,
        folders: backup.folders.length,
        versions: backup.boards.reduce(
          (sum: number, item: any) => sum + item.history.length,
          0,
        ),
        libraryItems: backup.libraryItems?.length || 0,
      };
    }
    if (input.action === "open-folder") {
      await fs.mkdir(root, { recursive: true });
      const executable =
        process.platform === "win32"
          ? "explorer.exe"
          : process.platform === "darwin"
          ? "open"
          : "xdg-open";
      // execFile treats the path as one argument, never as shell source.
      execFile(executable, [root], { windowsHide: true }, () => {});
      return { opened: true };
    }
    if (input.action === "storage-migrate") {
      if (typeof input.path !== "string" || !path.isAbsolute(input.path.trim()))
        fail("请输入完整的文件夹路径");
      const requested = path.resolve(input.path.trim());
      if (requested === path.parse(requested).root)
        fail("请选择磁盘内的文件夹，而不是磁盘根目录");
      await fs.mkdir(root, { recursive: true });
      const source = await fs.realpath(root);
      // Resolve the existing ancestor before creating anything, including junctions.
      let ancestor = requested;
      const missing: string[] = [];
      while (true) {
        try {
          ancestor = await fs.realpath(ancestor);
          break;
        } catch (error: any) {
          if (error.code !== "ENOENT") throw error;
          missing.unshift(path.basename(ancestor));
          ancestor = path.dirname(ancestor);
        }
      }
      const target = path.join(ancestor, ...missing);
      const nested = (a: string, b: string) => {
        const relative = path.relative(a, b);
        return (
          !relative ||
          (!relative.startsWith(`..${path.sep}`) &&
            relative !== ".." &&
            !path.isAbsolute(relative))
        );
      };
      if (nested(source, target) || nested(target, source))
        fail("新位置不能是当前目录、其子目录或上级目录");
      try {
        if ((await fs.readdir(target)).length)
          fail("新位置必须是空文件夹，避免覆盖已有文件");
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
      }
      const before = await manifest(source);
      await fs.mkdir(target, { recursive: true });
      for (const entry of await fs.readdir(source)) {
        await fs.cp(path.join(source, entry), path.join(target, entry), {
          recursive: true,
          force: false,
          errorOnExist: true,
        });
      }
      const copied = await manifest(target);
      if (
        Object.keys(before).length !== Object.keys(copied).length ||
        Object.entries(before).some(([key, value]) => copied[key] !== value)
      )
        fail("复制校验未通过，仍使用原保存位置", 500);
      await atomicWrite(configFile, { version: 1, dataPath: target });
      root = target;
      store = createBoardStore(root);
      return { dataPath: root, previousPath: source };
    }
    return store(input);
  };
  let queue: Promise<unknown> = Promise.resolve();
  return (input: any): Promise<any> => {
    // A native chooser may wait for a person; it must not block autosave.
    if (input.action === "choose-folder") {
      if (process.platform !== "win32")
        return Promise.reject(
          Object.assign(new Error("请在下方填写文件夹的完整路径"), {
            status: 400,
          }),
        );
      return exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-STA",
          "-Command",
          'Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "选择新的画布保存文件夹（空文件夹）"; if ($d.ShowDialog() -eq "OK") { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $d.SelectedPath }; $d.Dispose()',
        ],
        { windowsHide: true, timeout: 180000, encoding: "utf8" },
      ).then(({ stdout }) => ({ path: stdout.trim() }));
    }
    const result = queue.then(() => run(input));
    queue = result.catch(() => {});
    return result;
  };
}
