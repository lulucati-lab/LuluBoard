import { createStore, get, set, del } from "idb-keyval";
import type { ExcalidrawElement } from "../../packages/excalidraw/element/types";
import type { AppState, BinaryFiles } from "../../packages/excalidraw/types";

export type BoardScene = {
  type: "excalidraw";
  version: number;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};
export type BoardDoc = {
  id: string;
  name: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  revision: number;
  deletedAt: number | null;
  thumbnail: string;
  scene: BoardScene;
  lastOpenedAt?: number | null;
};
export type BoardMeta = Omit<BoardDoc, "scene">;
export type Folder = { id: string; name: string };
export type BoardList = {
  boards: BoardMeta[];
  folders: Folder[];
  dataPath: string;
};
export type Version = { id: string; name: string; savedAt: number };
export async function request<T = BoardDoc>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/local-boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "本机保存服务不可用"), {
      status: response.status,
    });
  return result;
}
const drafts = createStore("local-board-drafts", "drafts");
export type Draft = {
  scene: BoardScene;
  revision: number;
  dirty: boolean;
  updatedAt: number;
};
export const readDraft = (id: string) => get<Draft>(id, drafts);
export const writeDraft = (id: string, draft: Draft) => set(id, draft, drafts);
export const clearDraft = (id: string) => del(id, drafts);

export function downloadScene(scene: BoardScene, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(scene)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[<>:"/\\|?*]/g, "_")}.excalidraw`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
