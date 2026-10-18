"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "@wanted/shared";
import { useExitGhost } from "@/lib/exit-ghost";

export function SettingsModal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  useExitGhost(backdrop);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" ref={backdrop} onMouseDown={onClose}>
      <div
        className={wide ? "modal settings-modal is-wide" : "modal settings-modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="ghost modal-close settings-modal-close"
            type="button"
            aria-label={t("shell.close")}
            title={t("shell.close")}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
