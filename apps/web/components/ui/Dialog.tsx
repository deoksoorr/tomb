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
  /**
   * 탭이 있는 큰 창(상점·가방·사냥터 등): 탭을 바꿔도 창 크기가 그대로인 고정 높이.
   * 내용은 본문 안에서 스크롤되고, 좁은 화면(폰)에서는 화면 전체를 쓴다.
   * 자식이 `flex: 1; min-height: 0`이면 자식 안에서 스크롤을 나눌 수 있다.
   */
  fixed?: boolean;
};

/**
 * 네이티브 <dialog>.showModal(): 바깥이 inert가 되어 포커스가 안에 갇히고, ESC는 cancel 이벤트로 온다.
 * 열릴 때 포커스를 가졌던 요소로 닫힐 때 돌려준다. 열려 있는 동안 게임 키 입력을 막는다.
 * 마운트 = 열림. 닫으려면 부모가 언마운트한다 (onClose).
 */
export default function Dialog({ title, onClose, children, size = "md", closable = true, fixed = false }: Props) {
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
    // close 이벤트는 비동기로 온다. StrictMode 재마운트처럼 닫았다 곧바로 다시 연 경우의 늦은 이벤트는 무시한다
    const handleClose = () => {
      if (!dialog.open) onBrowserClose(dialog);
    };
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
      data-fixed={fixed || undefined}
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
