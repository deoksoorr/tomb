"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import type { ActivityItem } from "@/lib/types";
import Dialog from "../ui/Dialog";
import { activityText, isHouseActivity, relativeTime } from "./activity";
import styles from "./BagDialog.module.css";

type Props = {
  /** 묘비 소식: 그 묘비로 (다른 채널이면 채널을 옮긴다) */
  onGoToGrave: (graveId: string) => void;
  /** 집 소식: 분양 사무소 */
  onOpenHousing: () => void;
  onClose: () => void;
};

/** 내 소식: 자리를 비운 사이 내 묘비·집에 생긴 일. 열면 모두 읽음으로 */
export default function ActivityDialog({ onGoToGrave, onOpenHousing, onClose }: Props) {
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
    <Dialog title="내 소식" onClose={onClose}>
      <div className={styles.bag}>
        {items === null ? (
          <p className={styles.state} role="status">
            {error ?? "불러오는 중…"}
          </p>
        ) : items.length === 0 ? (
          <p className={styles.empty}>아직 소식이 없어요. 묘비를 세우면 누군가 찾아올 거예요.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.placeChoice}
                  onClick={() => (isHouseActivity(item) ? onOpenHousing() : onGoToGrave(item.targetId))}
                >
                  {activityText(item)}
                  <span className={styles.meta}>{relativeTime(item.at, openedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
