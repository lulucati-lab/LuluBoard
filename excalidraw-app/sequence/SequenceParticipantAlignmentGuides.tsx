import { useMemo } from "react";
import {
  useExcalidrawAppState,
  useExcalidrawElements,
} from "../../packages/excalidraw/components/App";
import type { ExcalidrawElement } from "../../packages/excalidraw/element/types";
import { AlignmentGuides } from "../AlignmentGuides";
import { getSequenceParticipantAlignmentGuides } from "./sequenceParticipantAlignment";

export const SequenceParticipantAlignmentGuides = () => {
  const appState = useExcalidrawAppState();
  const elements = useExcalidrawElements() as readonly ExcalidrawElement[];

  const guides = useMemo(() => {
    if (
      !appState.selectedElementsAreBeingDragged ||
      appState.objectsSnapModeEnabled ||
      appState.viewModeEnabled ||
      appState.activeTool.type !== "selection"
    ) {
      return [];
    }

    return getSequenceParticipantAlignmentGuides({
      elements,
      selectedElementIds: appState.selectedElementIds,
      zoomValue: appState.zoom.value,
    });
  }, [
    appState.activeTool.type,
    appState.objectsSnapModeEnabled,
    appState.selectedElementIds,
    appState.selectedElementsAreBeingDragged,
    appState.viewModeEnabled,
    appState.zoom.value,
    elements,
  ]);

  return <AlignmentGuides guides={guides} />;
};
