import { defaultLang } from "../../packages/excalidraw/i18n";
import { UI } from "../../packages/excalidraw/tests/helpers/ui";
import {
  screen,
  fireEvent,
  waitFor,
  render,
} from "../../packages/excalidraw/tests/test-utils";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { appLangCodeAtom } from "../app-language/language-state";
import { act } from "../../packages/excalidraw/tests/test-utils";

describe("Test LanguageList", () => {
  it("rerenders UI on language change", async () => {
    await render(<ExcalidrawApp />);

    // select rectangle tool to show properties menu
    UI.clickTool("rectangle");
    // english lang should display `thin` label
    expect(screen.queryByTitle(/thin/i)).not.toBeNull();
    fireEvent.click(document.querySelector(".dropdown-menu-button")!);

    expect(document.querySelector(".dropdown-select__language")).toBeNull();
    act(() => appJotaiStore.set(appLangCodeAtom, "de-DE"));
    // switching to german, `thin` label should no longer exist
    await waitFor(() => expect(screen.queryByTitle(/thin/i)).toBeNull());
    // reset language
    act(() => appJotaiStore.set(appLangCodeAtom, defaultLang.code));
    // switching back to English
    await waitFor(() => expect(screen.queryByTitle(/thin/i)).not.toBeNull());
  });
});
