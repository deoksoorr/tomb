"use client";

import { useEffect, useState } from "react";
import { CHAMP_ALL, champBadgeText, champBoards, CHAMP_TITLE, isChampBits, isChampItem } from "@tomb/protocol";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { AuraPreview, CHAMP_AURA_NAME } from "../grave/ChampReward";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { takeOff, wearStashed } from "./actions";
import ChampAuraToggle from "./ChampAuraToggle";
import { remainingLabel } from "./items";
import { wardrobeEntries } from "./wardrobe";
import styles from "./BagDialog.module.css";

/** "11월 16일(월) 0시" */
function whenText(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  const day = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  const min = d.getUTCMinutes();
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${day}) ${d.getUTCHours()}시${min ? ` ${min}분` : ""}`;
}

/**
 * 가방 [레이스 보상] 칸: 주간 랭킹 1위 보상을 한곳에.
 *  ① 맨 위: "전용 오라 보이기" 켜기·끄기 (1위일 때만) ② 지금 자격(랭킹·끝나는 시각)과 배지·전용 오라 미리보기
 *  ③ 빌려 받은 전용 모자 (쓰기·벗기, 남은 기간). 일반 꾸미기 목록에는 전용 모자가 섞이지 않는다
 *  1위 자격도 모자도 없으면 안내 + [레이스 보기]
 */
export default function ChampRewardsTab({
  me,
  now,
  pending,
  act,
  onOpenRace,
}: {
  me: Me;
  now: number;
  pending: boolean;
  act: (task: () => Promise<void>, done: string) => Promise<void>;
  onOpenRace?: () => void;
}) {
  const bits = isChampBits(me.champ) ? me.champ : 0;
  const [until, setUntil] = useState(0);
  useEffect(() => {
    if (!bits) return;
    let alive = true;
    api
      .champMe()
      .then((r) => alive && setUntil(r.until))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bits]);
  const hats = wardrobeEntries(me, now).filter((e) => isChampItem(e.item.id));

  if (!bits && hats.length === 0)
    return (
      <div className={styles.champEmpty}>
        <p>이번 주 레이스에서 1위를 하면 여기에 보상이 들어와요.</p>
        <p className={styles.meta}>포인트·사냥 처치·낚시 랭킹마다 1위에게 전용 모자(다음 발표까지) · 전용 오라 · 이름표 배지 · 1,000P</p>
        {onOpenRace && (
          <button type="button" className={cx(ui.button, ui.primary)} onClick={onOpenRace}>
            레이스 보기
          </button>
        )}
      </div>
    );

  const boards = champBoards(bits);
  return (
    <div className={styles.champTab}>
      {bits > 0 && (
        <section className={styles.champNow} aria-label="지금 전용 오라">
          <ChampAuraToggle />
          <div className={styles.champNowBody}>
            <AuraPreview bits={bits & CHAMP_ALL} look={[]} label="내 전용 오라 미리보기" />
            <div className={styles.champNowText}>
              <span className={styles.champBadge}>♛ {champBadgeText(bits)}</span>
              <span className={styles.name}>
                {boards.map((b) => CHAMP_TITLE[b]).join("·")} 자격 · {boards.length > 1 ? (boards.length === 3 ? "무지개 오라" : "두 색이 섞인 오라") : CHAMP_AURA_NAME[boards[0]]}
              </span>
              <span className={styles.meta}>{until ? `${whenText(until)}까지 (그때 다음 1위로 넘어가요)` : "다음 발표까지"}</span>
            </div>
          </div>
        </section>
      )}
      <section className={styles.section} aria-label="전용 모자">
        <h3 className={styles.heading}>전용 모자</h3>
        {hats.length === 0 ? (
          <p className={styles.meta}>빌려 받은 전용 모자가 없어요.</p>
        ) : (
          <ul className={styles.list}>
            {hats.map((e) => (
              <li key={e.item.id} className={styles.row}>
                <ItemIcon itemId={e.item.id} size={32} />
                <span className={styles.main}>
                  <span className={styles.name}>{e.item.name}</span>
                  <span className={styles.meta}>
                    {e.state === "worn" ? "쓰는 중" : "벗어 둠"} · {e.until ? remainingLabel(e.until, now) : ""} · 다음 발표까지
                  </span>
                </span>
                {e.state === "worn" ? (
                  <button type="button" className={ui.button} disabled={pending} onClick={() => void act(() => takeOff(e.slot), `${e.item.name}을(를) 벗어 두었어요.`)}>
                    벗기
                  </button>
                ) : (
                  <button type="button" className={cx(ui.button, ui.primary)} disabled={pending} onClick={() => void act(() => wearStashed(e.item.id), `${e.item.name}을(를) 썼어요.`)}>
                    쓰기
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
