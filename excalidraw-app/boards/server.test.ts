import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBoardStore, createBoardService } from "./server";

const roots: string[] = [];
const setup = async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "excalidraw-board-test-"),
  );
  roots.push(root);
  let now = Date.now();
  return {
    root,
    store: createBoardStore(root, () => now),
    tick: () => {
      now += 301000;
    },
  };
};
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith("excalidraw-board-test-")
    )
      throw new Error("Unsafe test cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});
const scene = (label: string) => ({
  type: "excalidraw",
  version: 2,
  elements: [{ id: label, type: "image", fileId: "image1" }],
  appState: { name: label },
  files: { image1: { dataURL: "data:image/png;base64,test", id: "image1" } },
});

describe("local board persistence", () => {
  it("starts clean and moves the durable desktop library with the workspace", async () => {
    const { root } = await setup();
    const source = path.join(root, "source");
    const service = createBoardService(source);
    const initial = await service({ action: "list" });
    expect(initial.boards).toEqual([]);
    expect(initial.folders).toEqual([]);
    const data = {
      libraryItems: [
        {
          id: "personal",
          created: Date.now(),
          status: "unpublished",
          elements: [{ id: "shape" }],
        },
      ],
    };
    await service({ action: "library-save", data });
    await expect(
      service({ action: "library-save", data: {} }),
    ).rejects.toThrow();
    const target = path.join(root, "target");
    await service({ action: "storage-migrate", path: target });
    const restarted = createBoardService(source);
    expect(await restarted({ action: "library-load" })).toEqual(data);
    expect(
      JSON.parse(await fs.readFile(path.join(source, "library.json"), "utf8")),
    ).toEqual(data);
  });
  it("keeps boards and embedded images independent, rejects stale writes", async () => {
    const { store } = await setup();
    const a = await store({ action: "create", name: "A", scene: scene("A") });
    const b = await store({ action: "create", name: "B", scene: scene("B") });
    const saved = await store({
      action: "save",
      id: a.id,
      revision: 1,
      scene: scene("A2"),
    });
    expect(saved.revision).toBe(2);
    await expect(
      store({ action: "save", id: a.id, revision: 1, scene: scene("stale") }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await store({ action: "read", id: b.id })).scene.elements[0].id,
    ).toBe("B");
    expect(
      (await store({ action: "read", id: a.id })).scene.files.image1,
    ).toBeTruthy();
    await expect(
      store({ action: "read", id: "../outside" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      store({ action: "purge", id: a.id, revision: 2 }),
    ).rejects.toThrow("回收站");
  });
  it("preserves versions, backs up before restoring and caps history at 20", async () => {
    const { store, tick } = await setup();
    let doc = await store({ action: "create", name: "v0", scene: scene("v0") });
    tick();
    doc = await store({
      action: "save",
      id: doc.id,
      revision: doc.revision,
      scene: scene("v1"),
    });
    const history = await store({ action: "versions", id: doc.id });
    expect(history).toHaveLength(1);
    doc = await store({
      action: "restore-version",
      id: doc.id,
      revision: doc.revision,
      version: history[0].id,
    });
    expect(doc.scene.elements[0].id).toBe("v0");
    expect(await store({ action: "versions", id: doc.id })).toHaveLength(2);
    for (let i = 0; i < 22; i++) {
      tick();
      doc = await store({
        action: "save",
        id: doc.id,
        revision: doc.revision,
        scene: scene(`v${i + 2}`),
      });
    }
    expect(await store({ action: "versions", id: doc.id })).toHaveLength(20);
  });
  it("migrates once with a file backup, retains data through folder removal and trash", async () => {
    const { store, root } = await setup();
    const folder = await store({ action: "folder-create", name: "课程" });
    const doc = await store({
      action: "create",
      name: "原画布",
      scene: scene("原画布"),
      folderId: folder.id,
      migrationKey: "old-browser-1",
    });
    const duplicate = await store({
      action: "create",
      name: "原画布",
      scene: scene("原画布"),
      migrationKey: "old-browser-1",
    });
    expect(duplicate.id).toBe(doc.id);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, "backups", "old-browser-1.excalidraw"),
          "utf8",
        ),
      ).files.image1,
    ).toBeTruthy();
    await store({ action: "folder-delete", id: folder.id });
    const unfiled = await store({ action: "read", id: doc.id });
    expect(unfiled.folderId).toBeNull();
    const trashed = await store({
      action: "trash",
      id: doc.id,
      revision: unfiled.revision,
    });
    expect(trashed.deletedAt).toBeTruthy();
    const restored = await store({
      action: "restore",
      id: doc.id,
      revision: trashed.revision,
    });
    expect(restored.scene.files.image1).toBeTruthy();
    const again = await store({
      action: "trash",
      id: doc.id,
      revision: restored.revision,
    });
    await store({ action: "purge", id: doc.id, revision: again.revision });
    await expect(store({ action: "read", id: doc.id })).rejects.toMatchObject({
      status: 404,
    });
  });
  it("serializes simultaneous edits so only one revision wins", async () => {
    const { store } = await setup();
    const doc = await store({ action: "create", name: "A" });
    const results = await Promise.allSettled([
      store({ action: "save", id: doc.id, revision: 1, scene: scene("one") }),
      store({ action: "save", id: doc.id, revision: 1, scene: scene("two") }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });
});

describe("settings storage and backup", () => {
  it("migrates and verifies files, queues writes into the new location and remembers it", async () => {
    const { root } = await setup();
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    const service = createBoardService(source);
    const doc = await service({
      action: "create",
      name: "original",
      scene: scene("picture"),
    });
    const [moved] = await Promise.all([
      service({ action: "storage-migrate", path: target }),
      service({
        action: "update",
        id: doc.id,
        revision: doc.revision,
        name: "after migration",
      }),
    ]);
    expect(moved.dataPath).toBe(target);
    const original = await createBoardStore(source)({
      action: "read",
      id: doc.id,
    });
    expect(original.name).toBe("original");
    const restarted = createBoardService(source);
    expect((await restarted({ action: "settings" })).dataPath).toBe(target);
    const current = await restarted({ action: "read", id: doc.id });
    expect(current.name).toBe("after migration");
    expect(current.scene.files.image1.dataURL).toBe(
      original.scene.files.image1.dataURL,
    );
    await expect(
      restarted({
        action: "storage-migrate",
        path: path.join(target, "child"),
      }),
    ).rejects.toThrow("子目录");
    await expect(
      restarted({ action: "storage-migrate", path: source }),
    ).rejects.toThrow("空文件夹");
    expect((await restarted({ action: "settings" })).dataPath).toBe(target);
    const config = JSON.parse(
      await fs.readFile(`${source}.settings.json`, "utf8"),
    );
    await fs.writeFile(
      `${source}.settings.json`,
      JSON.stringify({ ...config, dataPath: path.join(root, "missing-disk") }),
    );
    await expect(
      createBoardService(source)({ action: "list" }),
    ).rejects.toThrow();
  });
  it("restores backup copies with images, trash and history, rejects invalid archives without writes", async () => {
    const { root, store, tick } = await setup();
    const folder = await store({ action: "folder-create", name: "my folder" });
    let doc = await store({
      action: "create",
      name: "A",
      folderId: folder.id,
      scene: scene("A"),
    });
    tick();
    doc = await store({
      action: "save",
      id: doc.id,
      revision: doc.revision,
      scene: scene("B"),
    });
    doc = await store({ action: "trash", id: doc.id, revision: doc.revision });
    const archive = await store({ action: "backup" });
    archive.libraryItems = [
      {
        id: "personal_item",
        created: Date.now(),
        status: "unpublished",
        elements: [{ id: "test", type: "rectangle" }],
      },
    ];
    const result = await store({ action: "backup-restore", backup: archive });
    expect(result.boards).toBe(1);
    const listed = await store({ action: "list" });
    expect(listed.boards).toHaveLength(2);
    const copy = listed.boards.find((b: any) => b.id !== doc.id);
    expect(copy.deletedAt).toBe(doc.deletedAt);
    expect(copy.folderId).not.toBe(folder.id);
    expect(
      (await store({ action: "read", id: copy.id })).scene.files.image1,
    ).toEqual(doc.scene.files.image1);
    const originalVersions = await store({ action: "versions", id: doc.id });
    const copiedVersions = await store({ action: "versions", id: copy.id });
    expect(copiedVersions.map((v: any) => v.savedAt)).toEqual(
      originalVersions.map((v: any) => v.savedAt),
    );
    const invalid = JSON.parse(JSON.stringify(archive));
    invalid.boards[0].doc.scene.elements = null;
    await expect(
      store({ action: "backup-restore", backup: invalid }),
    ).rejects.toThrow();
    expect((await store({ action: "list" })).boards).toHaveLength(2);
    expect((await store({ action: "read", id: doc.id })).revision).toBe(
      doc.revision,
    );
    const service = createBoardService(root);
    expect(
      (await service({ action: "backup-preview", backup: archive }))
        .libraryItems,
    ).toBe(1);
  });
});

it("does not switch on a failed config commit, rejects symlinked sources and unsafe backups", async () => {
  const { root } = await setup();
  const source = path.join(root, "source");
  const config = path.join(root, "config-is-a-directory");
  const svc = createBoardService(source, config);
  const doc = await svc({ action: "create", name: "Keep me" });
  await fs.mkdir(config);
  await expect(
    svc({ action: "storage-migrate", path: path.join(root, "target") }),
  ).rejects.toThrow();
  expect((await svc({ action: "settings" })).dataPath).toBe(source);
  expect((await svc({ action: "read", id: doc.id })).name).toBe("Keep me");
  const linked = path.join(root, "linked");
  await fs.mkdir(linked);
  await fs.symlink(linked, path.join(source, "link"), "junction");
  await expect(
    svc({ action: "storage-migrate", path: path.join(root, "target2") }),
  ).rejects.toThrow("链接");
  const archive = await svc({ action: "backup" });
  archive.libraryItems = [
    { id: "bad", created: 1, status: "unpublished", elements: null },
  ];
  await expect(
    svc({ action: "backup-preview", backup: archive }),
  ).rejects.toThrow();
  expect((await svc({ action: "list" })).boards).toHaveLength(1);
});
