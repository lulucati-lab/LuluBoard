import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function BoardDialog({
  title,
  onClose,
  children,
  className = "",
  dismissDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  dismissDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`board-dialog ${className}`}
      aria-labelledby="board-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!dismissDisabled) onClose();
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!dismissDisabled) onClose();
        }
      }}
    >
      <header>
        <h2 id="board-dialog-title">{title}</h2>
        <button
          type="button"
          aria-label="关闭对话框"
          disabled={dismissDisabled}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
