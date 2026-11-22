"use client";

import { useEffect, useState } from "react";
import { openDevNotes } from "@/lib/devNotes/open";
import { latestDevNote } from "@/lib/devNotes/titles";
import { useMe } from "@/lib/hooks/useMe";
import { useNotices } from "@/lib/hooks/useNotices";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import styles from "./DevNoteCard.module.css";
import { TopLeftItem } from "./TopLeftCluster";

// 11/20 새 개발자 노트 알림 카드: 마지막으로 본 뒤 새 글이 올라왔을 때만, 게임 화면 왼쪽 위 구석에 아주 작게 한 번.
// 누르거나 ×로 닫을 때까지 떠 있다 (11/20 저절로 사라지지 않게). 누르면 그 글을 새 탭으로 (본 것으로), 닫은 글로는 다시 뜨지 않는다 (빨간 점은 그대로).
// 11/20 사용자 「모두에게 다 보이게, ×를 누르면 다시 안 보이게」: 새내기·이미 읽은 사람 가릴 것 없이 그 글을 닫기 전까지 띄운다.
// 11/22 터치 화면은 흰 카드 대신 다른 왼쪽 위 칩과 같은 어두운 칩으로, 칩 묶음(TopLeftCluster) 둘째 줄 소식 칩 옆에 (누르면 열기·× 닫기 그대로)

/** 11/20 닫은 글은 계정마다 기억한다 (같은 브라우저에서 새 계정을 만들면 그 계정에는 다시 뜬다) */
const cardKey = (accountId: string) => `${UI_KEYS.devNoteCard}:${accountId}`;
/** 들어오자마자 다른 안내와 겹치지 않게 조금 뒤에 */
const DELAY_MS = 2_500;

export default function DevNoteCard({ ready }: { ready: boolean }) {
  const { notices } = useNotices();
  const accountId = useMe().me?.accountId ?? null;
  const latest = notices ? latestDevNote(notices) : null;
  const [shown, setShown] = useState<string | null>(null);

  const eligible = ready && latest !== null && accountId !== null;
  const latestId = latest?.id ?? null;

  useEffect(() => {
    if (!eligible || !latestId || !accountId || readItem(cardKey(accountId)) === latestId) return;
    const t = setTimeout(() => setShown(latestId), DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible, latestId, accountId]);

  /** 닫았다 (누름·×): 이 글로는 다시 띄우지 않는다 */
  const dismiss = () => {
    if (shown && accountId) writeItem(cardKey(accountId), shown);
    setShown(null);
  };

  const visible = !!shown && latest?.id === shown;

  if (!visible || !latest) return null;
  // 11/20 게임 화면과 일부러 다르게: 개발자 노트 사이트처럼 흰 카드 (눈에 띄게, 깔끔하게). 11/22 터치는 어두운 칩 (CSS)
  return (
    <TopLeftItem kind="note">
      <div className={styles.card} role="status">
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
    </TopLeftItem>
  );
}
