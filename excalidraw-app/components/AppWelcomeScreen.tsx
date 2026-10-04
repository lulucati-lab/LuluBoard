import React from "react";
import { useI18n } from "../../packages/excalidraw/i18n";
import { WelcomeScreen } from "../../packages/excalidraw/index";

export const AppWelcomeScreen = React.memo(
  ({ isManaged = false }: { isManaged?: boolean }) => {
    const { t } = useI18n();

    return (
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint>
          {t("welcomeScreen.app.menuHint")}
        </WelcomeScreen.Hints.MenuHint>
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          {isManaged ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              <img src="/board-logo.png" alt="" width={64} height={64} />
              画板
            </div>
          ) : (
            <WelcomeScreen.Center.Logo />
          )}
          <WelcomeScreen.Center.Heading>
            {isManaged
              ? "画布会自动保存到本机，随时返回主页继续创作。"
              : t("welcomeScreen.app.center_heading")}
          </WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu>
            <WelcomeScreen.Center.MenuItemLoadScene />
            <WelcomeScreen.Center.MenuItemHelp />
          </WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    );
  },
);
