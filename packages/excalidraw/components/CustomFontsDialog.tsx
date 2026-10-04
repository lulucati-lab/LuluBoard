import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { TextField } from "./TextField";
import DialogActionButton from "./DialogActionButton";
import { KEYS } from "../keys";
import { Paragraph } from "./Paragraph";
import { EDITOR_LS_KEYS } from "../constants";
import { EditorLocalStorage } from "../data/EditorLocalStorage";
import { useI18n } from "../i18n";

import "./CustomFontsDialog.scss";
import type { CustomFonts } from "../font";
import { preloadCustomFonts, getCustomFonts, getDefaultFonts } from "../font";

export type fontUrl = string | null;

const handwritingPresets = [
  { name: "小赖字体（原默认）", url: "/fonts/Xiaolai.woff2" },
  { name: "悠哉字体 · 自然板书", url: "/fonts/handwriting/Yozai-Regular.ttf" },
  {
    name: "霞鹜文楷屏幕阅读版 · 清晰正文",
    url: "/fonts/handwriting/LXGWWenKaiScreen.ttf",
  },
  {
    name: "辰宇落雁体 · 细笔手写",
    url: "/fonts/handwriting/ChenYuluoyan-2.0-Thin.ttf",
  },
];

export const CustomFontsDialog = (props: { onClose: () => void }) => {
  const { t } = useI18n();

  const [handwriting, setHandwriting] = useState<string>(
    getDefaultFonts().handwriting || "",
  );
  const [normal, setNormal] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const customFonts = getCustomFonts() || getDefaultFonts();
    if (customFonts.handwriting) {
      setHandwriting(customFonts.handwriting);
    }
    if (customFonts.normal) {
      setNormal(customFonts.normal);
    }
    if (customFonts.code) {
      setCode(customFonts.code);
    }
  }, []);

  const onConfirm = () => {
    setLoadError(false);
    if (!handwriting && !normal && !code) {
      EditorLocalStorage.delete(EDITOR_LS_KEYS.CUSTOM_FONTS);
      window.location.reload();
      return;
    }
    const customFonts = {
      handwriting,
      normal,
      code,
    } as CustomFonts;
    setIsSaving(true);
    preloadCustomFonts(customFonts)
      .then(() => {
        setIsSaving(false);
        EditorLocalStorage.set(EDITOR_LS_KEYS.CUSTOM_FONTS, customFonts);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      })
      .catch((error) => {
        setIsSaving(false);
        setLoadError(true);
        console.error(error);
      });
  };

  return (
    <Dialog
      onCloseRequest={() => {
        props.onClose();
      }}
      title={
        <div style={{ display: "flex" }}>
          {`${t("customFontsDialog.subTitle")}  `}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.1rem 0.5rem",
              marginLeft: "1rem",
              fontSize: 14,
              borderRadius: "12px",
              color: "#000",
              background: "pink",
            }}
          >
            Experimental
          </div>
        </div>
      }
      className="CustomFonts"
      autofocus={false}
    >
      <Paragraph>{`${t("customFontsDialog.paragraph1")}`}</Paragraph>
      {/* <Paragraph>
        {`${t('customFontsDialog.paragraph2')}`}
        <a
          href="https://platform.openai.com/login?launch"
          rel="noopener noreferrer"
          target="_blank"
        >
          {`${t('customFontsDialog.paragraph2Appendix')}`}
        </a>
      </Paragraph> */}
      <Paragraph>{`${t("customFontsDialog.paragraph3")}`}</Paragraph>
      <p />
      <label className="CustomFonts-preset">
        本地手写字体
        <select
          value={
            handwritingPresets.some((font) => font.url === handwriting)
              ? handwriting
              : ""
          }
          onChange={(event) => setHandwriting(event.target.value)}
          disabled={isSaving}
        >
          <option value="" disabled>
            自定义地址
          </option>
          {handwritingPresets.map((font) => (
            <option key={font.url} value={font.url}>
              {font.name}
            </option>
          ))}
        </select>
      </label>
      <Paragraph>
        这里调整旧画布的手写字体（Virgil）。新文字可直接在左侧字体列表选择四款中文字体，各段文字可使用不同字体。
      </Paragraph>
      <TextField
        isRedacted={false}
        value={handwriting}
        placeholder={`${t("customFontsDialog.handwriting.placeholder")}`}
        label={`${t("customFontsDialog.handwriting.label")}`}
        onChange={(value) => {
          setHandwriting(value);
        }}
        selectOnRender
        onKeyDown={(event) => event.key === KEYS.ENTER && onConfirm()}
      />
      <p />
      <TextField
        isRedacted={false}
        value={normal}
        placeholder={`${t("customFontsDialog.normal.placeholder")}`}
        label={`${t("customFontsDialog.normal.label")}`}
        onChange={(value) => {
          setNormal(value);
        }}
        selectOnRender
        onKeyDown={(event) => event.key === KEYS.ENTER && onConfirm()}
      />
      <p />

      <TextField
        isRedacted={false}
        value={code}
        placeholder={`${t("customFontsDialog.code.placeholder")}`}
        label={`${t("customFontsDialog.code.label")}`}
        onChange={(value) => {
          setCode(value);
        }}
        selectOnRender
        onKeyDown={(event) => event.key === KEYS.ENTER && onConfirm()}
      />
      <p />
      {loadError && (
        <p role="alert">
          字体加载失败，请检查地址后重试。已保存的设置保持不变。
        </p>
      )}
      <DialogActionButton
        label={t("customFontsDialog.confirm")}
        actionType="primary"
        isLoading={isSaving}
        onClick={onConfirm}
      />
    </Dialog>
  );
};
