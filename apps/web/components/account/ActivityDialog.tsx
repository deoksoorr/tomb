"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import type { ActivityItem } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { activityText, isHouseActivity, relativeTime } from "./activity";
import styles from "./ActivityDialog.module.css";

type Props = {
  /** 묘비 소식: 그 묘비로 (다른 채널이면 채널을 옮긴다) */
  onGoToGrave: (graveId: string) => void;
  /** 집 소식: 분양 사무소 */
  onOpenHousing: () => void;
  /** 소식이 없을 때 [묘비 쓰기] */
  onBury?: () => void;
  onClose: () => void;
};

/**
 * 알림 (11/21 「내 소식」 → 「알림」): 자리를 비운 사이 내 묘비·집에 생긴 일. 열면 모두 읽음으로.
 * 11/24 내용만큼 작은 창: 소식은 한 줄씩(누가·무엇 + 언제), 아래 요약·설명 칸은 뺐다
 */
export default function ActivityDialog({ onGoToGrave, onOpenHousing, onBury, onClose }: Props) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 상대 시간 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    api
      .activity()
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        const newest = r.items[0]?.at;
        if (newest && r.unread > 0) {
          void api.activitySeen(newest).then(() => meStore.refresh());
        }
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Dialog title="알림" onClose={onClose} fitHeight phoneCard>
      {items === null ? (
        <p className={styles.state} role="status">
          {error ?? "불러오는 중…"}
        </p>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p>아직 알림이 없어요.</p>
          {onBury && (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={onBury}>
              묘비 쓰기
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const body = (
              <>
                <span className={styles.text}>{activityText(item)}</span>
                <span className={styles.time}>{relativeTime(item.at, openedAt)}</span>
              </>
            );
            return (
              <li key={item.id}>
                {/* 주간 1위 소식은 갈 곳이 없다 (보상은 이미 가방·코디에 들어가 있다) */}
                {item.kind === "champ" ? (
                  <div className={styles.row}>{body}</div>
                ) : (
                  <button
                    type="button"
                    className={styles.row}
                    title={activityText(item)}
                    onClick={() => (isHouseActivity(item) ? onOpenHousing() : onGoToGrave(item.targetId))}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
