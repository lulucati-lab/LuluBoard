import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { LiveCollaborationTrigger } from "../packages/excalidraw";
import { ShareableLinkDialog } from "../packages/excalidraw/components/ShareableLinkDialog";
import { getDefaultAppState } from "../packages/excalidraw/appState";
import polyfill from "../packages/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "../packages/excalidraw/analytics";
import { ErrorDialog } from "../packages/excalidraw/components/ErrorDialog";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { useMathSubtype } from "../packages/excalidraw/element/subtypes/mathjax";
import {
  APP_NAME,
  EVENT,
  THEME,
  TITLE_TIMEOUT,
  VERSION_TIMEOUT,
} from "../packages/excalidraw/constants";
import {
  loadFromBlob,
  loadLibraryFromBlob,
} from "../packages/excalidraw/data/blob";
import type { ClipboardData } from "../packages/excalidraw/clipboard";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "../packages/excalidraw/element/types";
import { useCallbackRefState } from "../packages/excalidraw/hooks/useCallbackRefState";
import { t } from "../packages/excalidraw/i18n";
import {
  Excalidraw,
  TTDDialog,
  StoreAction,
  reconcileElements,
} from "../packages/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "../packages/excalidraw/types";
import type { ResolvablePromise } from "../packages/excalidraw/utils";
import {
  debounce,
  getVersion,
  getFrame,
  isInputLike,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isRunningInIframe,
} from "../packages/excalidraw/utils";
import {
  FIREBASE_STORAGE_PREFIXES,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import type { CollabAPI } from "./collab/Collab";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import {
  exportToBackend,
  getCollaborationLinkData,
  isCollaborationLink,
  loadScene,
} from "./data";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage,
} from "./data/localStorage";
import CustomStats from "./CustomStats";
import type { RestoredDataState } from "../packages/excalidraw/data/restore";
import type { ImportedDataState } from "../packages/excalidraw/data/types";
import { restore, restoreAppState } from "../packages/excalidraw/data/restore";
import { updateStaleImageStatuses } from "./data/FileManager";
import { newElementWith } from "../packages/excalidraw/element/mutateElement";
import { isInitializedImageElement } from "../packages/excalidraw/element/typeChecks";
import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "../packages/excalidraw/data/library";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { AppFooter } from "./components/AppFooter";
import { Provider, useAtom, useAtomValue } from "jotai";
import { useAtomWithInitialValue } from "../packages/excalidraw/jotai";
import { appJotaiStore } from "./app-jotai";

import "./index.scss";
import type { ResolutionType } from "../packages/excalidraw/utility-types";
import { openConfirmModal } from "../packages/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { OverwriteConfirmDialog } from "../packages/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import type { RemoteExcalidrawElement } from "../packages/excalidraw/data/reconcile";
import { KEYS } from "../packages/excalidraw/keys";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "../packages/excalidraw/components/CommandPalette/CommandPalette";
import Trans from "../packages/excalidraw/components/Trans";
import {
  XBrandIcon,
  DiscordIcon,
} from "../packages/excalidraw/components/icons";
import { appThemeAtom, useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import { ElementAlignmentGuides } from "./ElementAlignmentGuides";
import { getGeneralElementAlignmentSnapOffset } from "./elementAlignment";
import {
  AlignmentAidsSettings,
  AlignmentAidsSettingsIcon,
} from "./components/AlignmentAidsSettings";
import {
  SequenceDiagramSidebar,
  SequenceDiagramMenuIcon,
  getSequencePasteAnchor,
} from "./sequence/SequenceDiagramSidebar";
import { MindMapMenuIcon } from "./mindmap/MindMapSidebar";
import { MIND_MAP_SIDEBAR_TAB } from "./mindmap/mindMapStencils";
import { getMindMapPasteAnchor } from "./mindmap/MindMapSidebar";
import { MarkdownToMindMapDialog } from "./mindmap/MarkdownToMindMapDialog";
import { MindMapKeyboardShortcuts } from "./mindmap/MindMapKeyboardShortcuts";
import { MindMapNodeHandles } from "./mindmap/MindMapNodeHandles";
import { synchronizeMindMapElements } from "./mindmap/mindMapSystem";
import { SequenceActivationHandles } from "./sequence/SequenceActivationHandles";
import { SequenceFragmentHandles } from "./sequence/SequenceFragmentHandles";
import { SequenceParticipantAlignmentGuides } from "./sequence/SequenceParticipantAlignmentGuides";
import { getSequenceParticipantAlignmentSnapTargets } from "./sequence/sequenceParticipantAlignment";
import { replaceManagedDefaultLibraryItems } from "./defaultLibraryItems";
import {
  DEFAULT_SEQUENCE_REQUEST_DIRECTION,
  SEQUENCE_DIAGRAM_SIDEBAR_TAB,
  type SequenceRequestDirection,
} from "./sequence/sequenceStencils";
import { synchronizeSequenceDiagramElements } from "./sequence/sequenceSystem";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const renderExternalSceneOverwriteDescription = () => (
  <Trans
    i18nKey="overwriteConfirm.modal.shareableLink.description"
    bold={(text) => <strong>{text}</strong>}
    br={() => <br />}
  />
);

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
  localDataState?: ImportedDataState | null;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState =
    opts.localDataState !== undefined
      ? opts.localDataState
      : importFromLocalStorage();

  let scene: RestoredDataState & {
    scrollToContent?: boolean;
  } = await loadScene(null, null, localDataState);

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal({
        title: t("overwriteConfirm.modal.shareableLink.title"),
        description: renderExternalSceneOverwriteDescription(),
        actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
        color: "danger",
      })) === "confirm"
    ) {
      if (jsonBackendMatch) {
        scene = await loadScene(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
          localDataState,
        );
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      // https://github.com/excalidraw/excalidraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal({
          title: t("overwriteConfirm.modal.shareableLink.title"),
          description: renderExternalSceneOverwriteDescription(),
          actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
          color: "danger",
        })) === "confirm"
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

export type ManagedBoardProps = {
  initialData: ExcalidrawInitialDataState;
  onChange: (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
  onAPI: (api: ExcalidrawImperativeAPI) => void;
  onHistory: () => void;
};

const ExcalidrawWrapper = ({ managed }: { managed?: ManagedBoardProps }) => {
  const [sequenceRequestDirection, setSequenceRequestDirection] =
    useState<SequenceRequestDirection>(() => {
      const stored = window.localStorage.getItem("sequence-request-direction");
      return stored === "rtl" ? "rtl" : DEFAULT_SEQUENCE_REQUEST_DIRECTION;
    });
  const [alignmentAidsEnabled, setAlignmentAidsEnabled] = useState(() => {
    return window.localStorage.getItem("alignment-aids-enabled") !== "false";
  });
  const [isAlignmentAidsSettingsOpen, setAlignmentAidsSettingsOpen] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isCollabDisabled = !!managed || isRunningInIframe();

  const [appTheme, setAppTheme] = useAtom(appThemeAtom);
  const { editorTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  const isApplyingSequenceSyncRef = useRef(false);
  const isApplyingMindMapSyncRef = useRef(false);
  const isApplyingElementAlignmentRef = useRef(false);
  const isDefaultLibrarySeedPendingRef = useRef(false);
  const sequenceResizeHandleTypeRef = useRef<string | boolean | null>(null);
  const sequenceResizeOriginalElementsRef = useRef<Map<string, any> | null>(
    null,
  );

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  useEffect(() => {
    if (managed && excalidrawAPI) managed.onAPI(excalidrawAPI);
  }, [managed, excalidrawAPI]);

  useMathSubtype(excalidrawAPI);

  useEffect(() => {
    window.localStorage.setItem(
      "sequence-request-direction",
      sequenceRequestDirection,
    );
  }, [sequenceRequestDirection]);

  useEffect(() => {
    window.localStorage.setItem(
      "alignment-aids-enabled",
      alignmentAidsEnabled ? "true" : "false",
    );
  }, [alignmentAidsEnabled]);

  const [collabAPI] = useAtom(collabAPIAtom);
  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const collabError = useAtomValue(collabErrorIndicatorAtom);
  const isOffline = useAtomValue(isOfflineAtom);

  const getInitialLocalDataState = useCallback((): ImportedDataState | null => {
    const localDataState = importFromLocalStorage();
    return localDataState;
  }, []);

  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });

  const openAlignmentAidsSettings = useCallback(() => {
    setAlignmentAidsSettingsOpen(true);
  }, []);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  useEffect(() => {
    if (!excalidrawAPI || isDefaultLibrarySeedPendingRef.current) {
      return;
    }

    isDefaultLibrarySeedPendingRef.current = true;

    excalidrawAPI
      .updateLibrary({
        libraryItems: async (currentLibraryItems) => {
          // Restore the downloaded creator kit once without replacing personal items.
          if (
            localStorage.getItem("excalidraw-creator-kit-restored-v1") !==
            "true"
          ) {
            const response = await fetch(
              "/libraries/creator-kit/creator-all.excalidrawlib",
            );
            if (!response.ok) throw new Error("本地素材包加载失败");
            const creatorItems = await loadLibraryFromBlob(
              await response.blob(),
              "published",
            );
            const existingIds = new Set(
              currentLibraryItems.map((item) => item.id),
            );
            currentLibraryItems = [
              ...currentLibraryItems,
              ...creatorItems.filter((item) => !existingIds.has(item.id)),
            ];
          }
          return replaceManagedDefaultLibraryItems(
            currentLibraryItems,
            langCode,
          );
        },
      })
      .then(() => {
        localStorage.setItem("excalidraw-creator-kit-restored-v1", "true");
        isDefaultLibrarySeedPendingRef.current = false;
      })
      .catch((error) => {
        console.error("Failed to seed default library items", error);
        setErrorMessage(
          "本地素材库加载失败，请刷新重试。已有个人素材不会被覆盖。",
        );
        isDefaultLibrarySeedPendingRef.current = false;
      });
  }, [excalidrawAPI, langCode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !event[KEYS.CTRL_OR_CMD] ||
        (event.key !== KEYS.COMMA && event.code !== "Comma") ||
        isInputLike(event.target)
      ) {
        return;
      }

      event.preventDefault();

      if (
        isAlignmentAidsSettingsOpen ||
        excalidrawAPI?.getAppState().openDialog ||
        document.querySelector(".excalidraw-modal-container .Modal")
      ) {
        return;
      }

      openAlignmentAidsSettings();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [excalidrawAPI, isAlignmentAidsSettingsOpen, openAlignmentAidsSettings]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    if (managed) {
      initialStatePromiseRef.current.promise.resolve(managed.initialData);
      return;
    }

    const loadImages = (
      data: ResolutionType<typeof initializeScene>,
      isInitialLoad = false,
    ) => {
      if (!data.scene) {
        return;
      }
      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: fileIds });
        }
      }
    };

    initializeScene({
      collabAPI,
      excalidrawAPI,
      localDataState: getInitialLocalDataState(),
    }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({
          collabAPI,
          excalidrawAPI,
          localDataState: getInitialLocalDataState(),
        }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              ...data.scene,
              ...restore(data.scene, null, null, { repairBindings: true }),
              storeAction: StoreAction.CAPTURE,
            });
          }
        });
      }
    };

    const titleTimeout = setTimeout(
      () => (document.title = APP_NAME),
      TITLE_TIMEOUT,
    );

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            storeAction: StoreAction.UPDATE,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          collabAPI?.setUsername(username || "");
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
      clearTimeout(titleTimeout);
    };
  }, [
    managed,
    getInitialLocalDataState,
    isCollabDisabled,
    collabAPI,
    excalidrawAPI,
    setLangCode,
  ]);

  useEffect(() => {
    if (managed) return;
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        preventUnload(event);
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI, managed]);

  const applyDiagramSyncs = useCallback(
    (
      nextElements: readonly OrderedExcalidrawElement[],
      selectedElementIds: AppState["selectedElementIds"],
      storeAction?: "update",
      resizeHandleType?: string | boolean | null,
      alignmentSnapTopYByLaneKey?: Map<string, number>,
    ) => {
      if (!excalidrawAPI) {
        return false;
      }

      const sequenceSynced = synchronizeSequenceDiagramElements(
        nextElements,
        selectedElementIds,
        {
          resizeHandleType,
          originalElements: sequenceResizeOriginalElementsRef.current,
          alignmentSnapTopYByLaneKey,
        },
      );
      const sequenceElements = sequenceSynced.changed
        ? sequenceSynced.elements
        : nextElements;
      const mindMapSynced = synchronizeMindMapElements(
        sequenceElements,
        selectedElementIds,
      );

      if (!sequenceSynced.changed && !mindMapSynced.changed) {
        return false;
      }

      isApplyingSequenceSyncRef.current = sequenceSynced.changed;
      isApplyingMindMapSyncRef.current = mindMapSynced.changed;
      excalidrawAPI.updateScene(
        storeAction
          ? {
              elements: mindMapSynced.changed
                ? mindMapSynced.elements
                : sequenceElements,
              storeAction,
            }
          : {
              elements: mindMapSynced.changed
                ? mindMapSynced.elements
                : sequenceElements,
            },
      );
      return true;
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    let cancelled = false;

    initialStatePromiseRef.current.promise.then(() => {
      if (cancelled || !excalidrawAPI) {
        return;
      }

      applyDiagramSyncs(
        excalidrawAPI.getSceneElementsIncludingDeleted() as readonly OrderedExcalidrawElement[],
        excalidrawAPI.getAppState().selectedElementIds,
        StoreAction.UPDATE,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [applyDiagramSyncs, excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (excalidrawAPI) {
      const isInternalSceneUpdate =
        isApplyingSequenceSyncRef.current ||
        isApplyingMindMapSyncRef.current ||
        isApplyingElementAlignmentRef.current;

      if (isApplyingSequenceSyncRef.current) {
        isApplyingSequenceSyncRef.current = false;
      }
      if (isApplyingMindMapSyncRef.current) {
        isApplyingMindMapSyncRef.current = false;
      }
      if (isApplyingElementAlignmentRef.current) {
        isApplyingElementAlignmentRef.current = false;
      }

      if (
        !isInternalSceneUpdate &&
        applyDiagramSyncs(
          elements,
          appState.selectedElementIds,
          StoreAction.UPDATE,
          appState.isResizing ? sequenceResizeHandleTypeRef.current : null,
          alignmentAidsEnabled &&
            appState.selectedElementsAreBeingDragged &&
            !appState.objectsSnapModeEnabled &&
            !appState.isResizing &&
            !appState.viewModeEnabled &&
            appState.activeTool.type === "selection"
            ? getSequenceParticipantAlignmentSnapTargets({
                elements,
                selectedElementIds: appState.selectedElementIds,
                zoomValue: appState.zoom.value,
              })
            : undefined,
        )
      ) {
        return;
      } else if (
        !isInternalSceneUpdate &&
        alignmentAidsEnabled &&
        appState.selectedElementsAreBeingDragged &&
        !appState.objectsSnapModeEnabled &&
        !appState.isResizing &&
        !appState.viewModeEnabled &&
        appState.activeTool.type === "selection"
      ) {
        const snapOffset = getGeneralElementAlignmentSnapOffset({
          elements,
          selectedElementIds: appState.selectedElementIds,
          zoomValue: appState.zoom.value,
        });

        if (snapOffset) {
          const nextElements = elements.map((element) =>
            snapOffset.movableElementIds.has(element.id)
              ? (newElementWith(element, {
                  x: element.x + snapOffset.offsetX,
                  y: element.y + snapOffset.offsetY,
                }) as OrderedExcalidrawElement)
              : element,
          );

          isApplyingElementAlignmentRef.current = true;
          excalidrawAPI.updateScene({ elements: nextElements });
          return;
        }
      }
    }

    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (managed) {
      if (!appState.isLoading) managed.onChange(elements, appState, files);
    } else if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              storeAction: StoreAction.UPDATE,
            });
          }
        }
      });
    }
  };

  const onPointerUpAfterFinalize = (
    _activeTool: AppState["activeTool"],
    pointerDownState: Parameters<
      NonNullable<
        NonNullable<
          React.ComponentProps<typeof Excalidraw>["onPointerUpAfterFinalize"]
        >
      >
    >[1],
  ) => {
    if (
      !excalidrawAPI ||
      isApplyingSequenceSyncRef.current ||
      isApplyingMindMapSyncRef.current
    ) {
      return;
    }

    applyDiagramSyncs(
      excalidrawAPI.getSceneElementsIncludingDeleted() as readonly OrderedExcalidrawElement[],
      excalidrawAPI.getAppState().selectedElementIds,
      undefined,
      pointerDownState.resize.handleType,
    ) ||
      (() => {
        sequenceResizeHandleTypeRef.current = null;
        sequenceResizeOriginalElementsRef.current = null;
      })();
    sequenceResizeHandleTypeRef.current = null;
    sequenceResizeOriginalElementsRef.current = null;
  };

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  const onExportToBackend = async (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage } = await exportToBackend(
        exportedElements,
        {
          ...appState,
          viewBackgroundColor: appState.exportBackground
            ? appState.viewBackgroundColor
            : getDefaultAppState().viewBackgroundColor,
        },
        files,
      );

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio,
        });
        throw new Error(error.message);
      }
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  const openSequenceDiagramSidebar = () => {
    excalidrawAPI?.updateScene({
      appState: {
        openSidebar: {
          name: "default",
          tab: SEQUENCE_DIAGRAM_SIDEBAR_TAB,
        },
      },
      storeAction: StoreAction.NONE,
    });
  };

  const openMindMapSidebar = () => {
    excalidrawAPI?.updateScene({
      appState: {
        openSidebar: {
          name: "default",
          tab: MIND_MAP_SIDEBAR_TAB,
        },
      },
      storeAction: StoreAction.NONE,
    });
  };

  const handleSequencePaste = (
    data: ClipboardData,
    event: ClipboardEvent | null,
  ) => {
    // Let plain-text paste keep its default behavior even when clipboard
    // payload also contains serialized Excalidraw elements.
    if (
      !excalidrawAPI ||
      !data?.elements ||
      data.programmaticAPI ||
      data.text
    ) {
      return true;
    }

    const anchor =
      getMindMapPasteAnchor(data.elements) ||
      getSequencePasteAnchor(data.elements);
    if (!anchor) {
      return true;
    }

    event?.preventDefault();
    excalidrawAPI.addElementsFromPasteOrLibrary({
      elements: data.elements,
      files: data.files || null,
      position: "cursor",
      anchor,
    });
    return false;
  };

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <Excalidraw
        excalidrawAPI={excalidrawRefCallback}
        aiEnabled={false}
        onChange={onChange}
        onPaste={handleSequencePaste}
        onPointerDown={(_activeTool, pointerDownState) => {
          sequenceResizeHandleTypeRef.current =
            pointerDownState.resize.handleType;
          sequenceResizeOriginalElementsRef.current =
            pointerDownState.originalElements;
        }}
        onPointerUpAfterFinalize={onPointerUpAfterFinalize}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        onPointerUpdate={collabAPI?.onPointerUpdate}
        UIOptions={{
          isLocalFile: true,
          canvasActions: {
            loadScene: !managed,
            saveToActiveFile: !managed,
            toggleTheme: true,
            export: { onExportToBackend },
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        renderTopRightUI={(isMobile) => {
          if (isMobile || managed) {
            return null;
          }
          return (
            <div className="top-right-ui">
              {!isCollabDisabled && collabAPI && (
                <>
                  {collabError.message && (
                    <CollabError collabError={collabError} />
                  )}
                  <LiveCollaborationTrigger
                    isCollaborating={isCollaborating}
                    onSelect={() =>
                      setShareDialogState({ isOpen: true, type: "share" })
                    }
                  />
                </>
              )}
            </div>
          );
        }}
      >
        <AppMainMenu
          isCollabEnabled={!isCollabDisabled}
          isCollaborating={isCollaborating}
          onCollabDialogOpen={() =>
            setShareDialogState({ isOpen: true, type: "collaborationOnly" })
          }
          onOpenAlignmentAidsSettings={openAlignmentAidsSettings}
          theme={appTheme}
          setTheme={(theme) => setAppTheme(theme)}
        />
        <AppWelcomeScreen isManaged={!!managed} />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter />
        <AlignmentAidsSettings
          isOpen={isAlignmentAidsSettingsOpen}
          onClose={() => setAlignmentAidsSettingsOpen(false)}
          enabled={alignmentAidsEnabled}
          onEnabledChange={setAlignmentAidsEnabled}
        />
        <SequenceDiagramSidebar
          requestDirection={sequenceRequestDirection}
          onRequestDirectionChange={setSequenceRequestDirection}
        />
        <MindMapKeyboardShortcuts />
        <MindMapNodeHandles />
        <SequenceActivationHandles
          requestDirection={sequenceRequestDirection}
        />
        <SequenceFragmentHandles />
        {alignmentAidsEnabled && <ElementAlignmentGuides />}
        {alignmentAidsEnabled && <SequenceParticipantAlignmentGuides />}
        <MarkdownToMindMapDialog />
        <TTDDialog
          disableTextToDiagram={true}
          onTextSubmit={async (input) => {
            try {
              const response = await fetch(
                `${
                  import.meta.env.VITE_APP_AI_BACKEND
                }/v1/ai/text-to-diagram/generate`,
                {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ prompt: input }),
                },
              );

              const rateLimit = response.headers.has("X-Ratelimit-Limit")
                ? parseInt(response.headers.get("X-Ratelimit-Limit") || "0", 10)
                : undefined;

              const rateLimitRemaining = response.headers.has(
                "X-Ratelimit-Remaining",
              )
                ? parseInt(
                    response.headers.get("X-Ratelimit-Remaining") || "0",
                    10,
                  )
                : undefined;

              const json = await response.json();

              if (!response.ok) {
                if (response.status === 429) {
                  return {
                    rateLimit,
                    rateLimitRemaining,
                    error: new Error(
                      "Too many requests today, please try again tomorrow!",
                    ),
                  };
                }

                throw new Error(json.message || "Generation failed...");
              }

              const generatedResponse = json.generatedResponse;
              if (!generatedResponse) {
                throw new Error("Generation failed...");
              }

              return { generatedResponse, rateLimit, rateLimitRemaining };
            } catch (err: any) {
              throw new Error("Request failed");
            }
          }}
        />

        {isCollaborating && isOffline && (
          <div className="collab-offline-warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {latestShareableLink && (
          <ShareableLinkDialog
            link={latestShareableLink}
            onCloseRequest={() => setLatestShareableLink(null)}
            setErrorMessage={setErrorMessage}
          />
        )}
        {excalidrawAPI && !isCollabDisabled && (
          <Collab excalidrawAPI={excalidrawAPI} />
        )}

        <ShareDialog
          collabAPI={managed ? null : collabAPI}
          onExportToBackend={async () => {
            if (excalidrawAPI) {
              try {
                await onExportToBackend(
                  excalidrawAPI.getSceneElements(),
                  excalidrawAPI.getAppState(),
                  excalidrawAPI.getFiles(),
                );
              } catch (error: any) {
                setErrorMessage(error.message);
              }
            }
          }}
        />

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            ...(managed
              ? [
                  {
                    label: "历史版本",
                    category: DEFAULT_CATEGORIES.app,
                    predicate: true,
                    perform: managed.onHistory,
                  },
                ]
              : []),
            {
              label: t("buttons.settings"),
              category: DEFAULT_CATEGORIES.app,
              icon: AlignmentAidsSettingsIcon,
              predicate: true,
              keywords: [
                "settings",
                "preferences",
                "alignment",
                "language",
                "设置",
              ],
              perform: openAlignmentAidsSettings,
            },
            {
              label: t("mindMap.menu"),
              category: DEFAULT_CATEGORIES.tools,
              icon: MindMapMenuIcon,
              predicate: true,
              keywords: [
                "mind map",
                "mindmap",
                "tree",
                "timeline",
                "思维导图",
                "树状图",
              ],
              perform: openMindMapSidebar,
            },
            {
              label: t("sequenceDiagram.menu"),
              category: DEFAULT_CATEGORIES.tools,
              icon: SequenceDiagramMenuIcon,
              predicate: true,
              keywords: ["sequence", "diagram", "uml", "时序图", "lifeline"],
              perform: openSequenceDiagramSidebar,
            },
            {
              ...CommandPalette.defaultItems.toggleTheme,
              perform: () => {
                setAppTheme(
                  editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                );
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        />
      </Excalidraw>
    </div>
  );
};

const ExcalidrawApp = ({ managed }: { managed?: ManagedBoardProps }) => {
  return (
    <TopErrorBoundary>
      <Provider unstable_createStore={() => appJotaiStore}>
        <ExcalidrawWrapper managed={managed} />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
