const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const env = {
  ...process.env,
  VITE_APP_ENABLE_TRACKING: "false",
  VITE_APP_DISABLE_TRACKING: "true",
  VITE_APP_DISABLE_SENTRY: "true",
  VITE_APP_ENABLE_ESLINT: "false",
  VITE_APP_FIREBASE_CONFIG: "{}",
  VITE_APP_AI_BACKEND: "",
  VITE_APP_WS_SERVER_URL: "",
  VITE_APP_BACKEND_V2_GET_URL: "",
  VITE_APP_BACKEND_V2_POST_URL: "",
};
for (const [script, cwd] of [
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    path.join(root, "excalidraw-app"),
  ],
  [path.join(root, "desktop/prepare.cjs"), root],
]) {
  const result = spawnSync(
    process.execPath,
    [
      script,
      ...(script.endsWith("vite.js") ? ["build", "--mode", "desktop"] : []),
    ],
    { cwd, env, stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
