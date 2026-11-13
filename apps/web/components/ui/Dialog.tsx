"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { cx } from "./cx";
import { backdropCloses, escapeAction } from "./dialogDismiss";
import PixelIcon from "./PixelIcon";
import styles from "./Dialog.module.css";
import ui from "./ui.module.css";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * 창 종류. 게임 안의 모든 창은 크기가 같다.
   * - "window"(기본): 표준 창 — 데스크톱 760×660 고정, 폰(560px 이하)은 화면 전체.
   *   머리말은 위에 고정되고 본문만 스크롤된다. 자식이 `flex: 1; min-height: 0`이면 자식 안에서 스크롤을 나눌 수 있다.
   * - "confirm": 예/아니요 확인·짧은 알림만. 작은 표준 크기(너비 360, 높이는 내용만큼).
   */
  kind?: "window" | "confirm";
  /** 표준 창인데 데스크톱에서 높이를 내용만큼만 (아래 빈 여백 없이, 화면보다 길면 본문 스크롤). 폰은 그대로 화면 전체 */
  fitHeight?: boolean;
  /** false면 ESC·배경·× 로 닫히지 않는다 (예: 저장 중) */
  closable?: boolean;
  /** false면 배경(창 바깥) 클릭·터치로는 닫히지 않는다 (Esc·×는 그대로). 실수로 닫히면 안 되는 진행 중 창용 */
  backdropClose?: boolean;
  /** 주면 Esc가 바로 닫지 않고 이걸 부른다 (예: "그만둘까요?" 확인). ×는 그대로 onClose */
  onEscape?: () => void;
  /** @deprecated 창 크기는 `kind`로만 정한다 (값은 무시된다 — 예전 코드 호환용) */
  size?: "sm" | "md" | "lg";
  /** @deprecated 모든 표준 창이 고정 크기다 (값은 무시된다 — 예전 코드 호환용) */
  fixed?: boolean;
};

/**
 * 네이티브 <dialog>.showModal(): 바깥이 inert가 되어 포커스가 안에 갇히고, ESC는 cancel 이벤트로 온다.
 * 열릴 때 포커스를 가졌던 요소로 닫힐 때 돌려준다. 열려 있는 동안 게임 키 입력을 막는다.
 * 마운트 = 열림. 닫으려면 부모가 언마운트한다 (onClose).
 */
export default function Dialog({ title, onClose, children, kind = "window", fitHeight = false, closable = true, backdropClose = true, onEscape }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  useBlockingLayer();

  // 크롬은 ESC를 거듭 누르면 cancel을 막아도 대화상자를 직접 닫는다. 마운트된 채 닫히면 상태를 맞춘다
  const onBrowserClose = useEffectEvent((dialog: HTMLDialogElement) => {
    if (closable && !onEscape) onClose();
    else {
      dialog.showModal();
      if (closable) onEscape?.();
    }
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
      data-kind={kind}
      data-fit={fitHeight || undefined}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        const act = escapeAction(closable, !!onEscape);
        if (act === "escape") onEscape?.();
        else if (act === "close") onClose();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropCloses({ closable, backdropClose, pressedBackdrop: pressedBackdrop.current, clickedBackdrop: e.target === e.currentTarget })) onClose();
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
