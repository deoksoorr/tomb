"use client";

import { useEffect } from "react";
import { todayKst } from "@/lib/epitaph";
import { markNoticesSeen, useNotices } from "@/lib/hooks/useNotices";
import Dialog from "../ui/Dialog";
import styles from "./notice.module.css";

/** 공지 목록 (고정 먼저). 본문 줄바꿈은 그대로, 링크는 글자로만 보여 준다 */
export default function NoticesDialog({ onClose }: { onClose: () => void }) {
  const { notices } = useNotices();

  useEffect(() => {
    if (notices) markNoticesSeen();
  }, [notices]);

  return (
    <Dialog title="공지" onClose={onClose}>
      {notices === null ? (
        <p className={styles.state} role="status">
          불러오는 중…
        </p>
      ) : notices.length === 0 ? (
        <p className={styles.state}>아직 공지가 없어요.</p>
      ) : (
        <ol className={styles.notices}>
          {notices.map((n) => (
            <li key={n.id} className={styles.notice}>
              <h3 className={styles.noticeTitle}>
                {n.pinned && <span className={styles.pin}>고정</span>}
                {n.title}
              </h3>
              <p className={styles.date}>{todayKst(n.createdAt).replaceAll("-", ".")}</p>
              <p className={styles.body}>{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
