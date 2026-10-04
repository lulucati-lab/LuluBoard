import { register } from "./register";
import { StoreAction } from "../store";

export const actionCustomFonts = register({
  name: "customFonts",
  label: "customFontsDialog.title",
  viewMode: true,
  trackEvent: false,
  perform: (_elements, appState) => ({
    appState: { ...appState, openDialog: { name: "customFonts" } },
    storeAction: StoreAction.NONE,
  }),
});
