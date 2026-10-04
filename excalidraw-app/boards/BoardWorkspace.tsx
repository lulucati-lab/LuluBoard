import {
  LoadIcon,
  gridIcon,
  PlusIcon,
  TrashIcon,
  searchIcon,
  DotsIcon,
  ExportIcon,
} from "../../packages/excalidraw/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import ExcalidrawApp from "../App";
import { LocalData } from "../data/LocalData";
import { BoardDialog } from "./BoardDialog";
import { BoardSettings } from "./BoardSettings";
import { useHandleAppTheme } from "../useHandleAppTheme";
import { BoardAbout } from "./BoardAbout";
import { BoardEditor } from "./BoardEditor";
import { clearDraft, downloadScene, request } from "./client";
import type { BoardList, BoardMeta, BoardScene, Folder } from "./client";
import "./boards.scss";

let migration: Promise<void> | undefined;
async function migrateLegacy() {
  if (localStorage.getItem("boards-migrated")) return;
  const raw = localStorage.getItem("excalidraw");
  if (!raw || JSON.parse(raw).length === 0) {
    localStorage.setItem("boards-migrated", "empty");
    return;
  }
  const elements = JSON.parse(raw);
  const appState = JSON.parse(localStorage.getItem("excalidraw-state") || "{}");
  const ids = Array.from(
    new Set<string>(
      elements
        .filter((el: any) => el.type === "image" && el.fileId)
        .map((el: any) => el.fileId),
    ),
  );
  const { loadedFiles, erroredFiles } = await LocalData.fileStorage.getFiles(
    ids as any,
  );
  if (erroredFiles.size)
    throw new Error(
      "旧画布中有图片尚未读取成功。已保留原数据，请重新加载后再迁移。",
    );
  let migrationKey = localStorage.getItem("boards-migration-key");
  if (!migrationKey) {
    migrationKey = crypto.randomUUID();
    localStorage.setItem("boards-migration-key", migrationKey);
  }
  const doc = await request("create", {
    migrationKey,
    name: appState.name || "我的第一张画布",
    scene: {
      type: "excalidraw",
      version: 2,
      elements,
      appState,
      files: Object.fromEntries(loadedFiles.map((file) => [file.id, file])),
    },
  });
  localStorage.setItem("boards-migrated", doc.id);
}

type Prompt = {
  title: string;
  message?: string;
  value?: string;
  choices?: Folder[];
  danger?: boolean;
  submit: (value: string) => Promise<void>;
};

export default function BoardWorkspace() {
  const [data, setData] = useState<BoardList>({
    boards: [],
    folders: [],
    dataPath: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [activeId, setActiveId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("board"),
  );
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [value, setValue] = useState("");
  useHandleAppTheme(!activeId);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const refresh = useCallback(
    async () => setData(await request<BoardList>("list")),
    [],
  );
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (err: any) {
      setError(err.message || "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let live = true;
    const init = async () => {
      try {
        await refresh();
        migration ||= migrateLegacy().catch((err) => {
          migration = undefined;
          throw err;
        });
        await migration;
        if (live) await refresh();
      } catch (err: any) {
        if (live) setError(err.message);
      } finally {
        if (live) setLoading(false);
      }
    };
    void init();
    return () => {
      live = false;
    };
  }, [refresh]);
  const open = (id: string) => {
    const url = new URL(location.href);
    url.searchParams.set("board", id);
    history.replaceState(null, "", url);
    setActiveId(id);
  };
  const home = async () => {
    const url = new URL(location.href);
    url.searchParams.delete("board");
    history.replaceState(null, "", url);
    setActiveId(null);
    await refresh();
  };
  const ask = (next: Prompt) => {
    setValue(next.value || "");
    setPrompt(next);
    setError("");
  };
  const create = () =>
    run(async () => {
      const doc = await request("create", {
        folderId: data.folders.some((f) => f.id === filter) ? filter : null,
      });
      open(doc.id);
    });
  const mutate = async (
    action: string,
    board: BoardMeta,
    extra: Record<string, unknown> = {},
  ) => {
    await request(action, { id: board.id, revision: board.revision, ...extra });
    await refresh();
  };
  const boardAction = (action: string, board: BoardMeta) => {
    if (action === "rename")
      ask({
        title: "重命名画布",
        value: board.name,
        submit: async (label) => mutate("update", board, { name: label }),
      });
    if (action === "move")
      ask({
        title: "移动画布",
        value: board.folderId || "",
        choices: data.folders,
        submit: async (id) => mutate("update", board, { folderId: id || null }),
      });
    if (action === "trash")
      ask({
        title: "移入回收站",
        message: `“${board.name}”将保留在回收站，可随时恢复。`,
        submit: async () => mutate("trash", board),
      });
    if (action === "purge")
      ask({
        title: "永久删除画布",
        message: `将永久删除“${board.name}”及其历史版本，无法恢复。`,
        danger: true,
        submit: async () => {
          await mutate("purge", board);
          await clearDraft(board.id);
        },
      });
    if (action === "duplicate")
      void run(async () => {
        await mutate("duplicate", board);
      });
    if (action === "restore")
      void run(async () => {
        await mutate("restore", board);
      });
    if (action === "export")
      void run(async () => {
        const doc = await request("read", { id: board.id });
        downloadScene(doc.scene, doc.name);
      });
  };
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    await run(async () => {
      for (const file of Array.from(files)) {
        const raw = JSON.parse(await file.text());
        if (raw.type !== "excalidraw" || !Array.isArray(raw.elements))
          throw new Error(`“${file.name}”不是有效的画布文件`);
        const scene: BoardScene = {
          ...raw,
          files: raw.files || {},
          appState: raw.appState || {},
        };
        await request("create", {
          name: scene.appState.name || file.name.replace(/\.excalidraw$/i, ""),
          scene,
          folderId: data.folders.some((f) => f.id === filter) ? filter : null,
        });
      }
      await refresh();
    });
    if (upload.current) upload.current.value = "";
  };
  // Shared links keep their original editor flow; the new homepage owns local documents.
  if (/^#(room|json|url)=/.test(location.hash)) return <ExcalidrawApp />;
  if (activeId && !loading)
    return <BoardEditor key={activeId} id={activeId} onHome={home} />;
  const selectedFolder = data.folders.find((f) => f.id === filter);
  const title =
    selectedFolder?.name ||
    (
      {
        all: "全部画布",
        trash: "回收站",
      } as Record<string, string>
    )[filter];
  const boards = data.boards
    .filter(
      (b) =>
        (filter === "trash" ? !!b.deletedAt : !b.deletedAt) &&
        (selectedFolder ? b.folderId === filter : true) &&
        b.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "zh-CN")
        : b.updatedAt - a.updatedAt,
    );
  return (
    <div className="board-home">
      <aside className="board-sidebar">
        <div className="board-brand">
          <span className="board-brand-icon" aria-hidden="true">
            <img src="/board-logo.png" alt="" width={30} height={30} />
          </span>
          我的画布
        </div>
        <div className="board-sidebar-label">工作空间</div>
        <nav aria-label="画布分类">
          <button
            aria-current={filter === "all" ? "page" : undefined}
            onClick={() => setFilter("all")}
          >
            <span className="board-icon" aria-hidden="true">
              {gridIcon}
            </span>
            全部画布
          </button>
          <div className="board-sidebar-label">文件夹</div>
          {data.folders.map((folder) => (
            <button
              key={folder.id}
              aria-current={filter === folder.id ? "page" : undefined}
              onClick={() => setFilter(folder.id)}
            >
              <span className="board-icon" aria-hidden="true">
                {LoadIcon}
              </span>
              {folder.name}
            </button>
          ))}
          <button
            className="board-add-folder"
            onClick={() =>
              ask({
                title: "新建文件夹",
                value: "",
                submit: async (label) => {
                  await request("folder-create", { name: label });
                  await refresh();
                },
              })
            }
          >
            <span className="board-icon" aria-hidden="true">
              {PlusIcon}
            </span>
            新建文件夹
          </button>
        </nav>
        <button
          className="board-settings-link"
          onClick={() => setShowSettings(true)}
        >
          <span className="board-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9.5 3-.6 2.2-2 .9-2-.6-2.4 4.1 1.6 1.6v2.2l-1.6 1.6 2.4 4.1 2-.6 2 .9.6 2.2h5l.6-2.2 2-.9 2 .6 2.4-4.1-1.6-1.6v-2.2l1.6-1.6-2.4-4.1-2 .6-2-.9L14.5 3z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          设置
        </button>
        <button
          className={`board-trash-link ${filter === "trash" ? "active" : ""}`}
          onClick={() => setFilter("trash")}
        >
          <span className="board-icon" aria-hidden="true">
            {TrashIcon}
          </span>
          回收站
        </button>
        <button className="board-about-link" onClick={() => setShowAbout(true)}>
          关于画布
        </button>
      </aside>
      <main className="board-main">
        <header className="board-topbar">
          <div>
            <h1>{title || "我的画布"}</h1>
          </div>
          <div className="board-top-actions">
            <button
              disabled={busy || loading}
              onClick={() => upload.current?.click()}
            >
              <span className="board-icon" aria-hidden="true">
                {ExportIcon}
              </span>
              导入画布
            </button>
            <button
              className="primary"
              disabled={busy || loading}
              onClick={create}
            >
              <span className="board-icon" aria-hidden="true">
                {PlusIcon}
              </span>
              新建画布
            </button>
          </div>
        </header>
        <input
          ref={upload}
          type="file"
          accept=".excalidraw,application/json"
          multiple
          hidden
          onChange={(e) => void importFiles(e.target.files)}
        />
        {error && (
          <div role="alert" className="board-error">
            {error}
            <button onClick={() => void run(refresh)}>重试</button>
          </div>
        )}
        <div className="board-tools">
          <label className="board-search">
            <span className="board-icon" aria-hidden="true">
              {searchIcon}
            </span>
            <input
              aria-label="搜索画布"
              placeholder="搜索画布名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span className="board-count">{boards.length} 张画布</span>
          <select
            aria-label="画布排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">最近修改</option>
            <option value="name">名称排序</option>
          </select>
          {selectedFolder && (
            <details className="board-menu">
              <summary aria-label="文件夹选项">
                <span className="board-icon" aria-hidden="true">
                  {DotsIcon}
                </span>
              </summary>
              <div>
                <button
                  onClick={() =>
                    ask({
                      title: "重命名文件夹",
                      value: selectedFolder.name,
                      submit: async (label) => {
                        await request("folder-rename", {
                          id: selectedFolder.id,
                          name: label,
                        });
                        await refresh();
                      },
                    })
                  }
                >
                  重命名
                </button>
                <button
                  onClick={() =>
                    ask({
                      title: "删除文件夹",
                      message: "其中的画布将保留在全部画布中，作品不会删除。",
                      submit: async () => {
                        await request("folder-delete", {
                          id: selectedFolder.id,
                        });
                        setFilter("all");
                        await refresh();
                      },
                    })
                  }
                >
                  删除文件夹
                </button>
              </div>
            </details>
          )}
        </div>
        {loading ? (
          <div className="board-empty">正在读取本地画布…</div>
        ) : boards.length === 0 ? (
          <div className="board-empty">
            <span className="board-icon" aria-hidden="true">
              {LoadIcon}
            </span>
            <h2>
              {filter === "trash"
                ? "回收站是空的"
                : search
                ? "没有找到这张画布"
                : "从一张空白画布开始"}
            </h2>
            <p>
              {filter === "trash"
                ? "删除的画布会留在这里，直到你手动清理。"
                : search
                ? "换个关键词试试。"
                : "课程大纲、分镜草图、AI 工作流，都可以从这里开始。"}
            </p>
            {!search && filter !== "trash" && (
              <button className="primary" onClick={create}>
                <span className="board-icon" aria-hidden="true">
                  {PlusIcon}
                </span>
                新建画布
              </button>
            )}
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((board) => (
              <article
                className="board-card"
                key={board.id}
                data-board-id={board.id}
              >
                <button
                  className="board-preview"
                  aria-label={`打开 ${board.name}`}
                  disabled={!!board.deletedAt}
                  onClick={() => open(board.id)}
                >
                  {board.thumbnail ? (
                    <img
                      src={board.thumbnail}
                      alt={`${board.name} 预览`}
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="board-placeholder board-icon"
                      aria-hidden="true"
                    >
                      <img
                        src="/board-logo.png"
                        alt=""
                        width={30}
                        height={30}
                      />
                    </span>
                  )}
                </button>
                <div className="board-card-info">
                  <div>
                    <h2 title={board.name}>{board.name}</h2>
                    <p>
                      {new Date(board.updatedAt).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      修改
                    </p>
                  </div>
                  <details className="board-menu">
                    <summary aria-label={`${board.name} 选项`}>
                      <span className="board-icon" aria-hidden="true">
                        {DotsIcon}
                      </span>
                    </summary>
                    <div>
                      {(board.deletedAt
                        ? [
                            ["restore", "恢复画布"],
                            ["export", "导出备份"],
                            ["purge", "永久删除"],
                          ]
                        : [
                            ["rename", "重命名"],
                            ["duplicate", "复制画布"],
                            ["move", "移动到…"],
                            ["export", "导出画布"],
                            ["trash", "移入回收站"],
                          ]
                      ).map(([action, label]) => (
                        <button
                          key={action}
                          disabled={busy}
                          className={
                            action === "purge" || action === "trash"
                              ? "danger-text"
                              : ""
                          }
                          onClick={(e) => {
                            e.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            boardAction(action, board);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        )}
        <footer className="board-home-footer">
          本机保存 · 自动备份 · 你的创作空间 <span>lulucati · LuluBoard</span>
        </footer>
      </main>
      {showSettings && (
        <BoardSettings
          dataPath={data.dataPath}
          onClose={() => setShowSettings(false)}
          onRefresh={refresh}
        />
      )}
      {showAbout && <BoardAbout onClose={() => setShowAbout(false)} />}
      {prompt && (
        <BoardDialog
          title={prompt.title}
          onClose={() => !busy && setPrompt(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await prompt.submit(value);
                setPrompt(null);
              });
            }}
          >
            {prompt.message && <p>{prompt.message}</p>}
            {prompt.choices ? (
              <select
                aria-label="选择文件夹"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">未分类</option>
                {prompt.choices.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              prompt.value !== undefined && (
                <input
                  aria-label="名称"
                  autoFocus
                  required
                  maxLength={120}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )
            )}
            {error && (
              <p role="alert" className="danger-text">
                {error}
              </p>
            )}
            <div className="board-dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPrompt(null)}
              >
                取消
              </button>
              <button
                className={prompt.danger ? "danger" : "primary"}
                disabled={busy}
                type="submit"
              >
                {busy ? "处理中…" : prompt.danger ? "永久删除" : "确定"}
              </button>
            </div>
          </form>
        </BoardDialog>
      )}
    </div>
  );
}
