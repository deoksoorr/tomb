"use client";

import { useEffect, useState } from "react";
import { CHAMP_BOARDS, CHAMP_TITLE, champBoards, isChampBits, titleOfLook } from "@tomb/protocol";
import { api } from "@/lib/api";
import { CHAMP_MULTI_SPEED, champBoardPerkTags, champUntilText } from "@/lib/champPerks";
import { chairPerkTags, chairPerkUntil, type ChairPerk } from "@/lib/chairPerks";
import { nextWeekStartMs } from "@/lib/gameDay";
import { pointEventEndText, pointEventOn, pointEventWhat } from "@/lib/pointEvent";
import { perkShort, titleDef, titlePerk } from "@/lib/titles";
import type { Me } from "@/lib/types";
import { usePointEvent } from "../overlay/PointEventBadge";
import styles from "./MyPanel.module.css";

/** 끝나는 때 문구를 다시 그리는 간격 */
const TICK_MS = 60_000;

const CHAIR_LABEL: Record<ChairPerk, string> = { normal: "독대 노멀 1위", hell: "독대 헬 1위", duo: "독대 2관왕" };

/** 2관왕은 노멀·헬 혜택을 모두 받는다 (lib/chairPerks chairPerkLines와 같은 묶음) */
function chairTags(perk: ChairPerk): string[] {
  if (perk !== "duo") return chairPerkTags(perk);
  return [...chairPerkTags("normal"), ...chairPerkTags("hell"), ...chairPerkTags("duo").slice(1)];
}

/**
 * 11/24 내 정보 「혜택」 칸: 지금 붙어 있는 혜택을 「어디서 · 무엇」 한 줄씩 (보여 주기만 — 판단은 서버가 같은 표로 한다).
 * 레이스 1위(lib/champPerks) · 회장님 독대 1위(lib/chairPerks) · 단 칭호 능력(lib/titles) · 포인트 이벤트(lib/pointEvent).
 * 아래에 1위 혜택이 끝나는 때와, 실제로 겹칠 때만 겹침 규칙 한 줄. 없으면 빈 안내 한 줄
 */
export default function PerksSection({ me }: { me: Me }) {
  const bits = isChampBits(me.champ) ? me.champ : 0;
  const boards = champBoards(bits);
  const [champUntil, setChampUntil] = useState(0);
  // 끝나는 때 기준 시각 (렌더 중에 시계를 읽지 않는다): 1분마다
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!bits) return;
    let alive = true;
    api
      .champMe()
      .then((r) => alive && setChampUntil(r.until))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bits]);

  const titleId = titleOfLook(me.equipped.map((e) => e.itemId));
  const title = titleDef(titleId);
  const titleTags = perkShort(title);
  const snap = usePointEvent();
  const ev = snap?.event ?? null;
  const t = Math.max(now, snap?.at ?? 0);
  const eventOn = !!ev && pointEventOn(ev, t);
  const chair = me.chair ?? null;

  const rows: { label: string; value: string }[] = [];
  for (const b of CHAMP_BOARDS) if (boards.includes(b)) rows.push({ label: CHAMP_TITLE[b], value: champBoardPerkTags(b).join(" · ") });
  if (boards.length >= 2) rows.push({ label: `${boards.length}관왕`, value: `마을 이동 속도 +${Math.round(CHAMP_MULTI_SPEED * 100)}%` });
  if (chair) rows.push({ label: CHAIR_LABEL[chair], value: chairTags(chair).join(" · ") });
  if (title && titleTags) rows.push({ label: "칭호", value: `「${title.name}」 ${titleTags}` });
  if (eventOn && ev) rows.push({ label: "포인트 이벤트", value: `${pointEventWhat(ev.sources)} ${ev.mult}배${ev.endAt === null ? "" : ` · ${pointEventEndText(ev.endAt, t)}까지`}` });

  // 1위 혜택이 끝나는 때 (레이스는 서버가 알려 준 자격 끝, 받기 전에는 이번 주 마감 · 독대는 이번 독대 주 정산)
  const raceEnd = boards.length ? champUntilText(champUntil || nextWeekStartMs(now)) : null;
  const chairEnd = chair ? champUntilText(chairPerkUntil(now)) : null;
  const ends =
    raceEnd && chairEnd && raceEnd !== chairEnd
      ? [`레이스 1위 혜택은 ${raceEnd}까지예요.`, `독대 1위 혜택은 ${chairEnd}까지예요.`]
      : raceEnd || chairEnd
        ? [`1위 혜택은 ${raceEnd ?? chairEnd}까지예요.`]
        : [];

  // 실제로 겹칠 때만 규칙 한 줄 (할인은 pickDiscount로 가장 큰 하나, 사냥왕·독대 헬 1위 경험치는 큰 쪽 하나)
  const tp = titlePerk(titleId);
  const normal = chair === "normal" || chair === "duo";
  const points = boards.includes("points");
  const shopOff = [points, normal, tp.discount > 0].filter(Boolean).length;
  const furnOff = [points, normal, tp.houseDiscount > 0].filter(Boolean).length;
  const expOverlap = boards.includes("huntKills") && (chair === "hell" || chair === "duo");
  const notes = [
    ...(shopOff >= 2 || furnOff >= 2 ? ["할인이 겹치면 가장 큰 하나만 받아요."] : []),
    ...(expOverlap ? ["사냥왕과 독대 1위 경험치는 큰 쪽만 받아요."] : []),
  ];

  return (
    <section className={styles.section} aria-labelledby="my-perks" data-testid="my-perks">
      <h3 id="my-perks" className={styles.heading}>
        혜택
      </h3>
      {rows.length === 0 ? (
        <p className={styles.sub}>지금 받는 혜택이 없어요.</p>
      ) : (
        <>
          <dl className={styles.rows}>
            {rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd className={styles.perkValue}>{r.value}</dd>
              </div>
            ))}
          </dl>
          {[...ends, ...notes].map((line) => (
            <p key={line} className={styles.sub}>
              {line}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
