import React from "react";
import { getShortcutFromShortcutName } from "../../packages/excalidraw/actions/shortcuts";
import type { Theme } from "../../packages/excalidraw/element/types";
import { useI18n } from "../../packages/excalidraw/i18n";
import { MainMenu } from "../../packages/excalidraw/index";
import { AlignmentAidsSettingsIcon } from "./AlignmentAidsSettings";

export const AppMainMenu: React.FC<{
  isCollabEnabled: boolean;
  isCollaborating: boolean;
  onCollabDialogOpen: () => void;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  onOpenAlignmentAidsSettings: () => void;
}> = React.memo((props) => {
  const { t } = useI18n();

  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Item
        icon={AlignmentAidsSettingsIcon}
        onSelect={props.onOpenAlignmentAidsSettings}
        shortcut={getShortcutFromShortcutName("openSettings")}
      >
        {t("buttons.settings")}
      </MainMenu.Item>
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={props.onCollabDialogOpen}
        />
      )}
      <MainMenu.DefaultItems.CustomFonts />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
