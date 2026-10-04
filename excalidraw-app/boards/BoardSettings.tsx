import { useRef, useState } from "react";
import { useAtom } from "jotai";
import { appThemeAtom } from "../useHandleAppTheme";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
} from "../data/LocalData";
import { restoreLibraryItems } from "../../packages/excalidraw/data/restore";
import type { LibraryItems } from "../../packages/excalidraw/types";
import { BoardDialog } from "./BoardDialog";
import { request } from "./client";

export function BoardSettings({
  dataPath,
  onClose,
  onRefresh,
}: {
  dataPath: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("appearance");
  const [theme, setTheme] = useAtom(appThemeAtom);
  const [path, setPath] = useState("");
  const [confirmMove, setConfirmMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingLibrary, setPendingLibrary] = useState<LibraryItems | null>(
    null,
  );
  const [backup, setBackup] = useState<any>(null);
  const [preview, setPreview] = useState<{
    boards: number;
    folders: number;
    versions: number;
    libraryItems: number;
  } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (error: any) {
      setError(error.message || "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const requireClosedEditors = async () => {
    const locks = await navigator.locks.query();
    if (locks.held?.some((lock) => lock.name?.startsWith("local-board-"))) {
      throw new Error(
        "请先将其他标签页中的画布返回主页，让编辑内容保存完成后再操作。",
      );
    }
  };
  const exportBackup = () =>
    run(async () => {
      await requireClosedEditors();
      const archive = await request<any>("backup");
      archive.libraryItems =
        (await LibraryIndexedDBAdapter.load())?.libraryItems ||
        restoreLibraryItems(
          LibraryLocalStorageMigrationAdapter.load()?.libraryItems || [],
          "unpublished",
        );
      const blob = new Blob([JSON.stringify(archive)], {
        type: "application/json",
      });
      if (blob.size > 256 * 1024 * 1024)
        throw new Error(
          "完整备份超过 256MB，请直接复制保存文件夹，并在素材库中单独导出素材。",
        );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `画板备份-${new Date()
        .toISOString()
        .slice(0, 10)}.boardbackup`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        location.protocol === "luluboard:"
          ? "已生成完整备份，请在系统保存窗口选择位置。"
          : "已生成完整备份，请在浏览器下载列表中查看。",
      );
    });
  const readBackup = (file: File) =>
    run(async () => {
      setBackup(null);
      setPreview(null);
      if (file.size > 256 * 1024 * 1024)
        throw new Error("请选择不超过 256MB 的画板备份文件。");
      let archive;
      try {
        archive = JSON.parse(await file.text());
      } catch {
        throw new Error(
          "无法读取这个文件，请选择画板导出的 .boardbackup 备份。",
        );
      }
      const summary = await request<any>("backup-preview", { backup: archive });
      setBackup(archive);
      setPreview(summary);
    });
  const restoreBackup = () =>
    run(async () => {
      await requireClosedEditors();
      const existing =
        (await LibraryIndexedDBAdapter.load())?.libraryItems ||
        restoreLibraryItems(
          LibraryLocalStorageMigrationAdapter.load()?.libraryItems || [],
          "unpublished",
        );
      const incoming = restoreLibraryItems(
        backup.libraryItems || [],
        "unpublished",
      );
      const ids = new Set(existing.map((item) => item.id));
      const additions = incoming.filter((item) => !ids.has(item.id));
      const result = await request<any>("backup-restore", { backup });
      // Board restore is already committed. Clear the pending archive so a library
      // storage error cannot accidentally re-import the boards on a retry.
      setBackup(null);
      setPreview(null);
      await onRefresh();
      try {
        await LibraryIndexedDBAdapter.save({
          libraryItems: [...existing, ...additions],
        });
      } catch {
        setPendingLibrary(additions);
        throw new Error(
          `已恢复 ${result.boards} 张画布，素材保存失败。请释放浏览器存储空间后点击“重试恢复素材”。`,
        );
      }
      setMessage(
        `已恢复 ${result.boards} 张画布、${result.folders} 个文件夹，合并 ${additions.length} 个素材。原有作品已保留。`,
      );
    });
  return (
    <BoardDialog
      title="设置"
      onClose={onClose}
      className="board-settings-dialog"
      dismissDisabled={busy}
    >
      <div className="board-settings-layout">
        <nav aria-label="设置分类">
          {[
            ["appearance", "外观"],
            ["storage", "文件存储"],
            ["backup", "备份与恢复"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setTab(id);
                setError("");
                setMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="board-settings-panel" aria-busy={busy}>
          {tab === "appearance" && (
            <section>
              <h3>让创作空间适合你</h3>
              <p>主页和编辑器使用同一套外观设置。</p>
              <fieldset>
                <legend>界面主题</legend>
                <div className="board-theme-options">
                  {(
                    [
                      ["light", "浅色"],
                      ["dark", "深色"],
                      ["system", "跟随系统"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="board-theme"
                        value={value}
                        checked={theme === value}
                        onChange={() => setTheme(value)}
                      />
                      <span
                        className={`board-theme-preview ${value}`}
                        aria-hidden="true"
                      >
                        <i />
                      </span>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="board-settings-note">
                设置即时生效并自动记住。每张画布的背景色可在编辑器菜单中单独调整。
              </p>
            </section>
          )}
          {tab === "storage" && (
            <section>
              <h3>画布保存位置</h3>
              <p>画布文件、图片和历史版本保存在这里。</p>
              <output className="board-storage-path">{dataPath}</output>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await request("open-folder");
                  })
                }
              >
                打开文件夹
              </button>
              <hr />
              <h3>更改保存位置</h3>
              <p>
                选择一个空文件夹。复制并校验成功后切换，原文件夹会保留为备份。
              </p>
              <label className="board-settings-label">
                新的保存位置
                <input
                  value={path}
                  disabled={busy}
                  placeholder="选择文件夹，或粘贴完整路径"
                  onChange={(e) => {
                    setPath(e.target.value);
                    setConfirmMove(false);
                  }}
                />
              </label>
              <div className="board-settings-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await request<{ path: string }>(
                        "choose-folder",
                      );
                      if (result.path) {
                        setPath(result.path);
                        setConfirmMove(false);
                      }
                    })
                  }
                >
                  选择文件夹
                </button>
                <button
                  className="primary"
                  disabled={busy || !path.trim()}
                  onClick={() => setConfirmMove(true)}
                >
                  更改位置
                </button>
              </div>
              {confirmMove && (
                <div className="board-settings-confirm">
                  <p>将现有作品复制到：</p>
                  <strong>{path}</strong>
                  <p>完成后，新编辑内容将保存到新位置。</p>
                  <div className="board-settings-actions">
                    <button
                      disabled={busy}
                      onClick={() => setConfirmMove(false)}
                    >
                      取消
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await requireClosedEditors();
                          await request("storage-migrate", { path });
                          await onRefresh();
                          setPath("");
                          setConfirmMove(false);
                          setMessage(
                            "保存位置已切换。所有文件已校验，原目录仍保留。下次启动会使用新位置。",
                          );
                        })
                      }
                    >
                      确认复制并切换
                    </button>
                  </div>
                </div>
              )}
              <p className="board-settings-note">
                {location.protocol === "luluboard:"
                  ? "个人素材与画布一起保存在所选目录中。"
                  : "个人素材保存在当前浏览器中。"}
                换电脑时，请使用“备份与恢复”将它们一并带走。
              </p>
            </section>
          )}
          {tab === "backup" && (
            <section>
              <h3>把创作完整带走</h3>
              <p>
                备份包含全部画布、图片、文件夹、回收站、历史版本，以及本应用中的素材库。
              </p>
              <div className="board-settings-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={exportBackup}
                >
                  下载完整备份
                </button>
                <button disabled={busy} onClick={() => upload.current?.click()}>
                  选择备份恢复
                </button>
              </div>
              <input
                hidden
                ref={upload}
                type="file"
                accept=".boardbackup,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void readBackup(file);
                }}
              />
              {preview && (
                <div className="board-settings-confirm">
                  <h4>确认恢复内容</h4>
                  <p>
                    {preview.boards} 张画布 · {preview.folders} 个文件夹 ·{" "}
                    {preview.versions} 个历史版本 · {preview.libraryItems}{" "}
                    个素材
                  </p>
                  <p>
                    画布与文件夹会导入为新的副本；已有素材优先保留，新增素材合并加入。
                  </p>
                  <div className="board-settings-actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        setPreview(null);
                        setBackup(null);
                      }}
                    >
                      取消
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={restoreBackup}
                    >
                      确认恢复为副本
                    </button>
                  </div>
                </div>
              )}
              <hr />
              <h3>自动保存与历史版本</h3>
              <ul>
                <li>停止编辑 2 秒后保存，持续编辑时每 30 秒保存。</li>
                <li>内容有变化时，每 5 分钟保留历史，最近 20 份。</li>
                <li>回收站不会自动清空；恢复历史前会先备份当前版本。</li>
              </ul>
              <p className="board-settings-note">
                建议定期把备份文件复制到另一块磁盘。单份备份支持最多 256MB。
              </p>
            </section>
          )}
          {pendingLibrary && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await requireClosedEditors();
                  const latest =
                    (await LibraryIndexedDBAdapter.load())?.libraryItems || [];
                  const ids = new Set(latest.map((item) => item.id));
                  await LibraryIndexedDBAdapter.save({
                    libraryItems: [
                      ...latest,
                      ...pendingLibrary.filter((item) => !ids.has(item.id)),
                    ],
                  });
                  setPendingLibrary(null);
                  setMessage("素材已恢复，无需重复导入画布。");
                })
              }
            >
              重试恢复素材
            </button>
          )}
          {busy && <p role="status">正在处理，请稍候…</p>}
          {message && (
            <p role="status" className="board-settings-success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="danger-text">
              {error}
            </p>
          )}
        </div>
      </div>
    </BoardDialog>
  );
}
