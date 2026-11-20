"use client";

import { useEffect, useRef, useState } from "react";
import { openDevNotes } from "@/lib/devNotes/open";
import { latestDevNote } from "@/lib/devNotes/titles";
import { useNotices } from "@/lib/hooks/useNotices";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import styles from "./DevNoteCard.module.css";

// 11/20 새 개발자 노트 알림 카드: 마지막으로 본 뒤 새 글이 올라왔을 때만, 게임 화면 왼쪽 위 구석에 아주 작게 한 번.
// 누르거나 ×로 닫을 때까지 떠 있다 (11/20 저절로 사라지지 않게). 누르면 그 글을 새 탭으로 (본 것으로), 닫은 글로는 다시 뜨지 않는다 (빨간 점은 그대로).
// 11/20 사용자 「모두에게 다 보이게, ×를 누르면 다시 안 보이게」: 새내기·이미 읽은 사람 가릴 것 없이 그 글을 닫기 전까지 띄운다.

const CARD_KEY = UI_KEYS.devNoteCard;
/** 들어오자마자 다른 안내와 겹치지 않게 조금 뒤에 */
const DELAY_MS = 2_500;

export default function DevNoteCard({ ready }: { ready: boolean }) {
  const { notices } = useNotices();
  const latest = notices ? latestDevNote(notices) : null;
  const [shown, setShown] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const eligible = ready && latest !== null;
  const latestId = latest?.id ?? null;

  useEffect(() => {
    if (!eligible || !latestId || readItem(CARD_KEY) === latestId) return;
    const t = setTimeout(() => setShown(latestId), DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible, latestId]);

  /** 닫았다 (누름·×): 이 글로는 다시 띄우지 않는다 */
  const dismiss = () => {
    if (shown) writeItem(CARD_KEY, shown);
    setShown(null);
  };

  const visible = !!shown && latest?.id === shown;
  // 떠 있는 동안 차지한 높이를 --note-h로 (왼쪽 위 그 아래 칩들이 내려간다)
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || !visible) return;
    root.style.setProperty("--note-h", `${Math.ceil(el.getBoundingClientRect().height) + 6}px`);
    return () => {
      root.style.removeProperty("--note-h");
    };
  }, [visible]);

  if (!visible || !latest) return null;
  // 11/20 게임 화면과 일부러 다르게: 개발자 노트 사이트처럼 흰 카드 (눈에 띄게, 깔끔하게)
  return (
    <div ref={ref} className={styles.card} role="status">
      <button
        type="button"
        className={styles.open}
        onClick={() => {
          dismiss();
          openDevNotes(latest.id);
        }}
      >
        <span className={styles.ghost} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.tag}>새 개발자 노트</span>
          <span className={styles.title}>{latest.title}</span>
        </span>
      </button>
      <button type="button" className={styles.close} aria-label="닫기" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
