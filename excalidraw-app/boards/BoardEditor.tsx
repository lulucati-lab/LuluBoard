import {
  ArrowRightIcon,
  ExcalLogo,
} from "../../packages/excalidraw/components/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExcalidrawApp from "../App";
import type { ManagedBoardProps } from "../App";
import { clearAppStateForLocalStorage } from "../../packages/excalidraw/appState";
import { clearElementsForLocalStorage } from "../../packages/excalidraw/element";
import type { ExcalidrawImperativeAPI } from "../../packages/excalidraw/types";
import { exportToCanvas } from "../../packages/utils/export";
import { BoardDialog } from "./BoardDialog";
import { downloadScene, readDraft, request, writeDraft } from "./client";
import type { BoardDoc, BoardScene, Version } from "./client";

export function BoardEditor({
  id,
  onHome,
}: {
  id: string;
  onHome: () => Promise<void>;
}) {
  const [doc, setDoc] = useState<BoardDoc | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    let release: (() => void) | undefined;
    setError("");
    setDoc(null);
    if (!navigator.locks) {
      setError("当前浏览器不支持安全的多标签编辑，请使用新版 Chrome 或 Edge。");
      return;
    }
    // React StrictMode runs setup/cleanup/setup; don't let the discarded setup
    // briefly own the lock and make the real mount look like a second tab.
    void Promise.resolve()
      .then(async () => {
        if (!live) return;
        await navigator.locks.request(
          `local-board-${id}`,
          { ifAvailable: true },
          async (lock) => {
            if (!live) return;
            if (!lock) {
              setError(
                "这张画布正在另一个标签页编辑。请回到原页面，或关闭原页面后重试。",
              );
              return;
            }
            const held = new Promise<void>((resolve) => {
              release = resolve;
            });
            try {
              let loaded = await request("open", { id });
              if (loaded.deletedAt)
                throw new Error("画布已在回收站，请先恢复。");
              const draft = await readDraft(id);
              if (
                draft?.dirty &&
                JSON.stringify(draft.scene) !== JSON.stringify(loaded.scene)
              ) {
                if (draft.revision === loaded.revision) {
                  loaded = { ...loaded, scene: draft.scene };
                  if (live)
                    setNotice("已找回上次未保存的内容，正在重新保存到本机。");
                } else {
                  await request("create", {
                    name: `${loaded.name.slice(0, 108)}（恢复的副本）`,
                    scene: draft.scene,
                    migrationKey: `draft-${id}-${draft.updatedAt}`,
                  });
                  await writeDraft(id, {
                    scene: loaded.scene,
                    revision: loaded.revision,
                    updatedAt: Date.now(),
                    dirty: false,
                  });
                  if (live)
                    setNotice(
                      "发现不同版本的未保存内容，已另存为恢复副本，可在主页查看。",
                    );
                }
              }
              if (live) {
                setDoc(loaded);
                await held;
              }
            } catch (err: any) {
              if (live) setError(err.message);
            }
          },
        );
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
      release?.();
    };
  }, [id, attempt]);
  if (!doc)
    return (
      <div className="board-gate">
        <span className="board-brand-icon" aria-hidden="true">
          {ExcalLogo}
        </span>
        <h1>{error ? "暂时无法打开画布" : "正在打开画布…"}</h1>
        {error && <p role="alert">{error}</p>}
        <div>
          <button onClick={() => void onHome()}>返回主页</button>
          {error && (
            <button
              className="primary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              重新打开
            </button>
          )}
        </div>
      </div>
    );
  return <EditorSession initial={doc} notice={notice} onHome={onHome} />;
}

function EditorSession({
  initial,
  notice,
  onHome,
}: {
  initial: BoardDoc;
  notice: string;
  onHome: () => Promise<void>;
}) {
  const [viewMode, setViewMode] = useState(false);
  const [api, setAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [name, setName] = useState(initial.scene.appState.name || initial.name);
  const [status, setStatus] = useState("已保存到本机");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<string | null>(null);
  const [banner, setBanner] = useState(notice);
  const state = useRef({
    doc: initial,
    scene: initial.scene,
    saved: notice.includes("正在重新保存") ? "" : JSON.stringify(initial.scene),
    current: JSON.stringify(initial.scene),
    timer: 0,
    draftTimer: 0,
    inFlight: null as Promise<void> | null,
    drafts: Promise.resolve(),
    mounted: true,
  });

  const persistDraft = useCallback(
    (dirty: boolean) => {
      const s = state.current;
      clearTimeout(s.draftTimer);
      const draft = {
        scene: JSON.parse(s.current) as BoardScene,
        revision: s.doc.revision,
        dirty,
        updatedAt: Date.now(),
      };
      s.drafts = s.drafts
        .catch(() => {})
        .then(() => writeDraft(initial.id, draft));
      void s.drafts.catch(() => {
        if (s.mounted) setError("浏览器暂存失败，请保持页面打开并保存到本机。");
      });
      return s.drafts;
    },
    [initial.id],
  );

  const save = useCallback(async (): Promise<void> => {
    const s = state.current;
    clearTimeout(s.timer);
    if (s.inFlight) {
      await s.inFlight;
      if (s.current !== s.saved) return save();
      return;
    }
    if (s.current === s.saved) {
      if (s.mounted) setStatus("已保存到本机");
      return;
    }
    const scene = JSON.parse(s.current) as BoardScene;
    const serialized = s.current;
    if (s.mounted) {
      setStatus("保存中…");
      setError("");
    }
    // A failed browser draft must not prevent a healthy disk save.
    const operation = (async () => {
      await persistDraft(true).catch(() => {});
      let thumbnail: string | undefined;
      try {
        const canvas = await exportToCanvas({
          elements: scene.elements,
          appState: {
            ...scene.appState,
            exportBackground: true,
            exportWithDarkMode: false,
            exportEmbedScene: false,
          },
          files: scene.files,
          maxWidthOrHeight: 480,
        });
        thumbnail = canvas.toDataURL("image/png");
      } catch {
        /* A preview failure must not block saving the actual document. */
      }
      const updated = await request("save", {
        id: initial.id,
        revision: s.doc.revision,
        scene,
        thumbnail,
      });
      s.doc = updated;
      s.saved = serialized;
      await persistDraft(s.current !== s.saved).catch(() => {});
      if (s.mounted)
        setStatus(s.current === s.saved ? "已保存到本机" : "有更改待保存");
    })();
    s.inFlight = operation;
    try {
      await operation;
    } catch (err: any) {
      if (s.mounted) {
        setStatus("保存失败");
        setError(
          err.message ||
            "无法连接本机保存服务。内容仍在当前页面，请重试或导出备份。",
        );
      }
      throw err;
    } finally {
      s.inFlight = null;
    }
  }, [initial.id, persistDraft]);

  const change = useCallback<ManagedBoardProps["onChange"]>(
    (elements, appState, files) => {
      setViewMode(appState.viewModeEnabled);
      const s = state.current;
      const cleanElements = clearElementsForLocalStorage(elements).map((el) =>
        el.type === "image" && el.fileId && files[el.fileId]
          ? { ...el, status: "saved" as const }
          : el,
      );
      const fileIds = new Set(
        cleanElements.flatMap((el) =>
          el.type === "image" && el.fileId ? [el.fileId] : [],
        ),
      );
      const scene: BoardScene = {
        type: "excalidraw",
        version: 2,
        elements: cleanElements,
        appState: {
          ...clearAppStateForLocalStorage(appState),
          name: appState.name || s.doc.name,
        },
        files: Object.fromEntries(
          Object.entries(files).filter(([id]) => fileIds.has(id as any)),
        ),
      };
      const serialized = JSON.stringify(scene);
      if (serialized === s.current) return;
      s.scene = scene;
      s.current = serialized;
      setName(scene.appState.name || s.doc.name);
      setStatus("有更改待保存");
      clearTimeout(s.draftTimer);
      s.draftTimer = window.setTimeout(() => {
        void persistDraft(true);
      }, 300);
      clearTimeout(s.timer);
      s.timer = window.setTimeout(() => {
        void save().catch(() => {});
      }, 2000);
    },
    [persistDraft, save],
  );
  const showHistory = useCallback(async () => {
    setBusy(true);
    try {
      await save();
      setHistory(await request<Version[]>("versions", { id: initial.id }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [save, initial.id]);
  const managed = useMemo<ManagedBoardProps>(
    () => ({
      initialData: {
        ...initial.scene,
        appState: {
          ...initial.scene.appState,
          name: initial.scene.appState.name || initial.name,
        },
      },
      onAPI: setAPI,
      onHistory: showHistory,
      onChange: change,
    }),
    [initial, change, showHistory],
  );

  useEffect(() => {
    const s = state.current;
    s.mounted = true;
    const timer = window.setInterval(() => {
      void save().catch(() => {});
    }, 30000);
    const onBlur = () => {
      if (s.current !== s.saved) void save().catch(() => {});
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (s.current !== s.saved || s.inFlight) {
        void persistDraft(true);
        void save().catch(() => {});
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const visibility = () => {
      if (document.hidden) onBlur();
    };
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void save().catch(() => {});
      }
    };
    window.addEventListener("blur", onBlur);
    const beforeClose = (event: Event) => {
      (event as CustomEvent<Promise<void>[]>).detail.push(
        (async () => {
          await save();
          if (s.current !== s.saved) await save();
        })(),
      );
    };
    window.addEventListener("luluboard-before-close", beforeClose);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", shortcut, true);
    return () => {
      s.mounted = false;
      clearTimeout(s.timer);
      clearTimeout(s.draftTimer);
      clearInterval(timer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("luluboard-before-close", beforeClose);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", shortcut, true);
    };
  }, [save, persistDraft]);
  const leave = async () => {
    setBusy(true);
    try {
      await save();
      if (state.current.current !== state.current.saved) await save();
      await onHome();
    } catch {
      /* Leave the editor open so failed saves can be recovered. */
    } finally {
      setBusy(false);
    }
  };
  const commitName = () => {
    const label = name.trim();
    if (!label) {
      setName(state.current.scene.appState.name || initial.name);
      return;
    }
    api?.updateScene({ appState: { name: label } });
  };

  return (
    <div className="board-editor">
      <header className="board-editor-bar">
        <button
          className="board-return"
          aria-label="主页"
          title="返回主页"
          onClick={() => void leave()}
          disabled={busy}
        >
          <span className="board-icon" aria-hidden="true">
            {ArrowRightIcon}
          </span>
        </button>
        <span className="board-editor-divider" />
        <button
          className="board-view-toggle"
          aria-label={viewMode ? "退出查看模式" : "进入查看模式"}
          title={viewMode ? "退出查看模式" : "进入查看模式"}
          aria-pressed={viewMode}
          onClick={() =>
            api?.updateScene({
              appState: { viewModeEnabled: !api.getAppState().viewModeEnabled },
            })
          }
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="6.5" cy="14" r="4.5" />
            <circle cx="17.5" cy="14" r="4.5" />
            <path d="M11 13h2M2 13l1.5-7H6m16 7-1.5-7H18" />
          </svg>
        </button>
        <input
          aria-label="画布名称"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing)
              e.currentTarget.blur();
          }}
        />
        <span
          role="status"
          className={`board-save-status ${error ? "failed" : ""}`}
        >
          {status}
        </span>
      </header>
      {banner && (
        <div className="board-notice">
          {banner}
          <button aria-label="关闭恢复提示" onClick={() => setBanner("")}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="board-error" role="alert">
          {error}
          <button onClick={() => void save().catch(() => {})}>重试保存</button>
          <button onClick={() => downloadScene(state.current.scene, name)}>
            导出备份
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request("create", {
                  name: `${name.slice(0, 110)}（保存副本）`,
                  scene: state.current.scene,
                });
                await persistDraft(false);
                state.current.saved = state.current.current;
                await onHome();
              } catch (err: any) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            另存副本并返回
          </button>
        </div>
      )}
      <div className="board-editor-canvas">
        <ExcalidrawApp managed={managed} />
      </div>
      {history && (
        <BoardDialog
          title="历史版本"
          onClose={() => {
            setHistory(null);
            setRestoreVersion(null);
          }}
        >
          <p>
            有内容变化时每 5 分钟保留一个版本，最多 20
            版。恢复前会先备份当前画布。
          </p>
          {!history.length ? (
            <p className="board-history-empty">
              还没有历史版本，继续编辑后会自动保留。
            </p>
          ) : (
            <div className="board-history-list">
              {history.map((version) => (
                <label key={version.id}>
                  <input
                    type="radio"
                    name="version"
                    value={version.id}
                    checked={restoreVersion === version.id}
                    onChange={() => setRestoreVersion(version.id)}
                  />
                  <span>
                    {new Date(version.savedAt).toLocaleString("zh-CN")}
                    <small>{version.name}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="danger-text">
              {error}
            </p>
          )}
          <div className="board-dialog-actions">
            <button
              onClick={() => {
                setHistory(null);
                setRestoreVersion(null);
              }}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={!restoreVersion || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await save();
                  await request("restore-version", {
                    id: initial.id,
                    revision: state.current.doc.revision,
                    version: restoreVersion,
                  });
                  await writeDraft(initial.id, {
                    scene: state.current.scene,
                    revision: state.current.doc.revision,
                    dirty: false,
                    updatedAt: Date.now(),
                  });
                  window.location.reload();
                } catch (err: any) {
                  setError(err.message);
                  setBusy(false);
                }
              }}
            >
              备份当前并恢复所选版本
            </button>
          </div>
        </BoardDialog>
      )}
    </div>
  );
}
