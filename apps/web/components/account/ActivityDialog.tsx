"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import type { ActivityItem } from "@/lib/types";
import Dialog from "../ui/Dialog";
import { EmptyHero, InfoCard, TipList, type Shortcut } from "../ui/InfoBlocks";
import { activityText, isHouseActivity, relativeTime } from "./activity";
import styles from "./BagDialog.module.css";

type Props = {
  /** 묘비 소식: 그 묘비로 (다른 채널이면 채널을 옮긴다) */
  onGoToGrave: (graveId: string) => void;
  /** 집 소식: 분양 사무소 */
  onOpenHousing: () => void;
  /** 소식이 없을 때 [묘비 쓰기] */
  onBury?: () => void;
  /** 아래에 덧붙일 내용 (게임 안: 내 묘비·집 요약) */
  footer?: ReactNode;
  onClose: () => void;
};

/** 내 소식: 자리를 비운 사이 내 묘비·집에 생긴 일. 열면 모두 읽음으로 */
export default function ActivityDialog({ onGoToGrave, onOpenHousing, onBury, footer, onClose }: Props) {
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
          <EmptyHero
            icon="heart"
            title="아직 소식이 없어요"
            actions={[
              ...(onBury ? [{ label: "묘비 쓰기", icon: "grave", onClick: onBury, primary: true } satisfies Shortcut] : []),
              { label: "분양 사무소", icon: "house", onClick: onOpenHousing } satisfies Shortcut,
            ]}
          >
            묘비를 세우거나 집을 꾸며 두면, 자리를 비운 사이 누군가 찾아와 남긴 흔적이 여기에 모여요.
          </EmptyHero>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.placeChoice}
                  // 주간 1위 소식은 갈 곳이 없다 (보상은 이미 가방·코디에 들어가 있다)
                  onClick={() => (item.kind === "champ" ? undefined : isHouseActivity(item) ? onOpenHousing() : onGoToGrave(item.targetId))}
                >
                  {activityText(item)}
                  <span className={styles.meta}>{relativeTime(item.at, openedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {footer}
        <InfoCard title="이런 소식이 와요" icon="info">
          <TipList
            tips={[
              "누군가 내 묘비에 헌화하면 — 누르면 그 묘비 앞으로 가요.",
              "내 집에 좋아요를 누르거나 방명록을 남기면 — 누르면 분양 사무소가 열려요.",
              "내 묘비가 성불하거나 성황당에서 다시 모셔지면.",
              "주간 랭킹(포인트·사냥 처치·낚시) 1위 보상을 받으면.",
              "새 소식이 오면 [소식] 버튼에 숫자가 붙고, 이 창을 열면 모두 읽음이 돼요.",
            ]}
          />
        </InfoCard>
      </div>
    </Dialog>
  );
}
