"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { cx } from "./cx";
import { backdropCloses, escapeAction } from "./dialogDismiss";
import { watchMoreBelow } from "./moreBelow";
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
  /**
   * 11/22 폰·태블릿(터치)에서 화면 전체로 위에 붙지 않고 가운데 뜨는 카드 창 (내용 높이, 좌우 16px, 최대 화면 높이 약 85%, 넘치면 본문 스크롤 + 아래 흐림).
   * 짧은 내용의 작은 창용 (새 이웃 꾸러미·마을 첫 걸음). 데스크톱은 fitHeight 그대로
   */
  phoneCard?: boolean;
  /** false면 ESC·배경·× 로 닫히지 않는다 (예: 저장 중) */
  closable?: boolean;
  /** false면 배경(창 바깥) 클릭·터치로는 닫히지 않는다 (Esc·×는 그대로). 실수로 닫히면 안 되는 진행 중 창용 */
  backdropClose?: boolean;
  /** 주면 Esc가 바로 닫지 않고 이걸 부른다 (예: "그만둘까요?" 확인). ×는 그대로 onClose */
  onEscape?: () => void;
  /** 창 하나만의 추가 클래스 (예: 사냥터 창은 데스크톱에서 세로로 더 길게 — HuntLobby). 크기 규칙은 되도록 kind로 */
  className?: string;
  /**
   * 11/22 열려 있는 동안 아래에 먼저 열린 창들을 감춘다 (가방 → 아이템 페이지 → 염색 창처럼 한 단계씩 들어가는 화면).
   * 위 창이 내용 높이(fitHeight)라 아래 창보다 작아도 뒤 창이 위아래로 삐져나와 보이지 않는다. 닫히면 다시 보인다
   */
  coverBelow?: boolean;
  /** 11/22 주면 제목 앞에 [뒤로] 단추 (창 안에서 한 단계 들어간 화면 — 가방 아이템 페이지·염색 창). Esc·×는 그대로 onClose */
  onBack?: () => void;
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
export default function Dialog({ title, onClose, children, kind = "window", fitHeight = false, phoneCard = false, className, closable = true, backdropClose = true, onEscape, onBack, coverBelow = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 11/20 아래에 더 있으면 본문 맨 아래를 살짝 흐리게 (data-more, 맥·폰은 스크롤바가 숨어 있어 더 있는지 모른다)
  useEffect(() => watchMoreBelow(bodyRef.current), []);
  const titleId = useId();
  useBlockingLayer();

  // 11/22 아래 창 감추기: 먼저 열린 창마다 덮은 수(data-covered)를 하나씩 올리고, 닫힐 때 내린다 (여러 겹이어도 맨 위만 보인다)
  useEffect(() => {
    const me = ref.current;
    if (!coverBelow || !me) return;
    const below = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((d) => d !== me);
    for (const d of below) d.dataset.covered = String(Number(d.dataset.covered ?? 0) + 1);
    return () => {
      for (const d of below) {
        const n = Number(d.dataset.covered ?? 1) - 1;
        if (n > 0) d.dataset.covered = String(n);
        else delete d.dataset.covered;
      }
    };
  }, [coverBelow]);

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
      className={cx(styles.dialog, className)}
      data-kind={kind}
      data-fit={fitHeight || undefined}
      data-card={phoneCard || undefined}
      data-cover={coverBelow || undefined}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        const act = escapeAction(closable, !!onEscape, e.target === e.currentTarget);
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
        <header className={styles.header} data-back={onBack ? "" : undefined}>
          {onBack && (
            <button type="button" className={cx(ui.button, ui.quiet, ui.icon, styles.back)} onClick={onBack} disabled={!closable} aria-label="뒤로">
              <PixelIcon name="back" />
            </button>
          )}
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
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
