"use client";

import { useEffect, useRef, useState } from "react";
import { isOpShout, OP_SHOUT_NAME } from "@/lib/opShout";
import type { MegaphoneEntry } from "@/lib/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import styles from "./MegaphoneSpotlight.module.css";

/** 내려가기 전 사라지는 연출 시간 */
const LEAVE_MS = 450;

/**
 * 23번 확성기 한마디를 화면 가운데에 크게 (몇 초간). 여러 개가 오면 스토어가 차례로 넘겨준다.
 * 게임 조작을 막지 않게 포인터는 통과시킨다 (신고는 왼쪽 위 기록에서).
 */
export default function MegaphoneSpotlight({ entry, until, op = false }: { entry: MegaphoneEntry | null; until: number; /** 11/26 운영자 외치기만 띄우는 칸 (OpShoutSpot). 아니면 운영자 외치기는 빼고 */ op?: boolean }) {
  if (!entry || isOpShout(entry) !== op) return null;
  return <Spot key={entry.id} entry={entry} until={until} />;
}

/** 11/26 관리자 화면 미리 보기: 게임 화면 가운데에 뜨는 운영자 외치기 알림과 같은 그림 (제자리에, 사라지지 않게) */
export function OpShoutPreview({ text }: { text: string }) {
  return (
    <div className={styles.preview}>
      <SpotBody entry={{ id: "ops-preview", name: OP_SHOUT_NAME, text, scope: "all", ch: 0, at: 0, staff: true, system: true }} leaving={false} />
    </div>
  );
}

function Spot({ entry, until }: { entry: MegaphoneEntry; until: number }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), Math.max(0, until - Date.now() - LEAVE_MS));
    return () => clearTimeout(t);
  }, [until]);
  const op = isOpShout(entry);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (op && ref.current ? raiseToTop(ref.current) : undefined), [op]);

  return (
    // 11/26 운영자 외치기는 집·사냥터 안에서도 보이게 월드 HUD 밖(OpShoutSpot)에서 그린다 → 다른 HUD 위로.
    // 결과 창·대화상자(네이티브 <dialog> 최상위 층)보다도 위에 보이게 popover로 최상위 층에 올린다 (포인터는 통과 — 창 단추는 그대로 눌린다)
    <div ref={ref} popover={op ? "manual" : undefined} className={cx(styles.layer, op && styles.opLayer)} aria-hidden={leaving || undefined}>
      <SpotBody entry={entry} leaving={leaving} />
    </div>
  );
}

/**
 * 11/26 운영자 외치기를 최상위 층(top layer)에 올린다: popover로 띄우면 그 전에 열린 모달 <dialog>보다 위에 그려진다.
 * 떠 있는 동안 새 창이 열리면(사냥 결과 창 등) 다시 올려 그 위에 둔다. popover가 없는 옛 브라우저는 z-index만 (아무것도 안 한다). 정리 함수를 돌려준다
 */
function raiseToTop(el: HTMLElement): (() => void) | undefined {
  if (typeof el.showPopover !== "function") return undefined;
  const raise = () => {
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      el.showPopover();
    } catch {
      // 이미 떨어져 나간 요소 등 — 그대로 둔다
    }
  };
  raise();
  const mo = new MutationObserver((list) => {
    if (list.some((m) => m.target !== el && m.target instanceof HTMLDialogElement && m.target.open)) raise();
  });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  return () => mo.disconnect();
}

function SpotBody({ entry, leaving }: { entry: MegaphoneEntry; leaving: boolean }) {
  const all = entry.scope === "all";
  // 11/26 운영자 외치기: 확성기 알림 그대로, 판만 운영자 빛깔(자줏빛 + 금테)에 「운영자」 딱지. 닉네임은 없다
  const op = isOpShout(entry);
  return (
    <div className={cx(styles.spot, all && !op && styles.all, op && styles.op, leaving && styles.leaving)} role="status" aria-live="polite">
      <div className={styles.head}>
        <span className={styles.horn} aria-hidden="true">
          <PixelIcon name={entry.system && !op ? "bell" : "megaphone"} size={21} />
        </span>
        {/* 11/21 마을 공지 줄(시스템)은 「마을 소식」, 보낸 이 이름("공지") 줄은 뺀다 */}
        {op ? (
          <span className={styles.opTag}>{OP_SHOUT_NAME}</span>
        ) : (
          <span className={styles.tag}>{entry.system ? "마을 소식" : all ? "전체 확성기" : `${entry.ch}채널 확성기`}</span>
        )}
      </div>
      {!entry.system && (
        <p className={cx(styles.name, entry.staff && styles.staff)}>
          {entry.staff && <span className={styles.staffTag}>운영자</span>}
          {entry.mgr && !entry.staff && <span className={styles.mgrTag}>매니저</span>}
          {entry.name}
        </p>
      )}
      <p className={styles.text}>{entry.text}</p>
    </div>
  );
}
