"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { cx } from "./cx";
import PixelIcon from "./PixelIcon";
import styles from "./Dialog.module.css";
import ui from "./ui.module.css";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  /** false면 ESC·배경·× 로 닫히지 않는다 (예: 저장 중) */
  closable?: boolean;
};

/**
 * 네이티브 <dialog>.showModal(): 바깥이 inert가 되어 포커스가 안에 갇히고, ESC는 cancel 이벤트로 온다.
 * 열릴 때 포커스를 가졌던 요소로 닫힐 때 돌려준다. 열려 있는 동안 게임 키 입력을 막는다.
 * 마운트 = 열림. 닫으려면 부모가 언마운트한다 (onClose).
 */
export default function Dialog({ title, onClose, children, size = "md", closable = true }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  useBlockingLayer();

  // 크롬은 ESC를 거듭 누르면 cancel을 막아도 대화상자를 직접 닫는다. 마운트된 채 닫히면 상태를 맞춘다
  const onBrowserClose = useEffectEvent((dialog: HTMLDialogElement) => {
    if (closable) onClose();
    else dialog.showModal();
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleClose = () => onBrowserClose(dialog);
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-size={size}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (closable) onClose();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (closable && pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.frame}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={cx(ui.button, ui.quiet, ui.icon)}
            onClick={onClose}
            disabled={!closable}
            aria-label="닫기"
          >
            <PixelIcon name="close" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
