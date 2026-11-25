"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

/** 혜택 배지 색 (랭킹마다 다르게 — 한눈에 어디서 받는 혜택인지) */
const BOARD_TONE: Record<(typeof CHAMP_BOARDS)[number], string> = { points: "#e0c36a", huntKills: "#ec7f6c", fish: "#6cb4f0" };
const TONE = { multi: "#c49af0", chair: "#ffa04a", title: "#9fc5a8", event: "#f28cba" };

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

  // 11/25 운영자 「레이아웃을 예쁘게」: 어디서 받는지는 색 배지, 무엇인지는 짧은 꼬리표 (꼬리표 사이에서만 줄을 바꾼다)
  const rows: { key: string; label: string; tags: string[]; tone: string }[] = [];
  for (const b of CHAMP_BOARDS) if (boards.includes(b)) rows.push({ key: b, label: CHAMP_TITLE[b], tags: champBoardPerkTags(b), tone: BOARD_TONE[b] });
  if (boards.length >= 2) rows.push({ key: "multi", label: `${boards.length}관왕`, tags: [`마을 이동 속도 +${Math.round(CHAMP_MULTI_SPEED * 100)}%`], tone: TONE.multi });
  if (chair) rows.push({ key: "chair", label: CHAIR_LABEL[chair], tags: chairTags(chair), tone: TONE.chair });
  if (title && titleTags) rows.push({ key: "title", label: "칭호", tags: [`「${title.name}」 ${titleTags}`], tone: TONE.title });
  if (eventOn && ev) rows.push({ key: "event", label: "포인트 이벤트", tags: [`${pointEventWhat(ev.sources)} ${ev.mult}배`, ...(ev.endAt === null ? [] : [`${pointEventEndText(ev.endAt, t)}까지`])], tone: TONE.event });

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

  // 내 정보 맨 위 카드 안 (포인트 줄 아래): 없으면 흐린 한 줄
  if (rows.length === 0)
    return (
      <p className={styles.perksEmpty} data-testid="my-perks">
        지금 받는 혜택이 없어요.
      </p>
    );
  return (
    <section className={styles.perks} aria-label="혜택" data-testid="my-perks">
      <ul className={styles.perkList}>
        {rows.map((r) => (
          <li key={r.key} style={{ "--tone": r.tone } as CSSProperties}>
            <span className={styles.perkBadge}>{r.label}</span>
            <span className={styles.perkTags}>
              {r.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {[...ends, ...notes].map((line) => (
        <p key={line} className={styles.sub}>
          {line}
        </p>
      ))}
    </section>
  );
}
