import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BoardWorkspace from "./boards/BoardWorkspace";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";
window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
if (location.protocol !== "luluboard:") registerSW();
root.render(
  <StrictMode>
    <BoardWorkspace />
  </StrictMode>,
);
