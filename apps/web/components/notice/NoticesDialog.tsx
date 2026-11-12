"use client";

import { useEffect, useId, useState } from "react";
import { todayKst } from "@/lib/epitaph";
import { markNoticesSeen, refreshNotices, useNotices } from "@/lib/hooks/useNotices";
import Dialog from "../ui/Dialog";
import styles from "./notice.module.css";

/**
 * 공지 목록 (고정 먼저). 처음엔 제목·날짜만 보이고, 제목을 누르면 그 자리에서 본문이 펼쳐진다 (여러 개 펼칠 수 있다).
 * 본문 줄바꿈은 그대로, 링크는 글자로만 보여 준다
 */
export default function NoticesDialog({ onClose }: { onClose: () => void }) {
  const { notices } = useNotices();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const baseId = useId();
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  useEffect(refreshNotices, []);

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
          {notices.map((n) => {
            const expanded = open.has(n.id);
            const panelId = `${baseId}-${n.id}`;
            return (
              <li key={n.id} className={styles.notice}>
                <h3 className={styles.noticeHead}>
                  <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(n.id)}>
                    <span className={styles.chevron} aria-hidden="true" />
                    <span className={styles.noticeTitle}>
                      {n.pinned && <span className={styles.pin}>고정</span>}
                      {n.title}
                    </span>
                    <span className={styles.date}>{todayKst(n.createdAt).replaceAll("-", ".")}</span>
                  </button>
                </h3>
                <div id={panelId} className={styles.body} hidden={!expanded}>
                  {n.body}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Dialog>
  );
}
