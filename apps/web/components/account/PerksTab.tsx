"use client";

import { useEffect, useState } from "react";
import { CHAMP_BOARDS, CHAMP_TITLE, champBadgeText, champBoards, isChampBits, titleOfLook } from "@tomb/protocol";
import { api } from "@/lib/api";
import { CHAMP_BADGE_ONLY, champBoardPerkLines, champNamesText, champPerkLines, champUntilText } from "@/lib/champPerks";
import { CHAIR_PERK_OVERLAP, chairPerkLines, chairPerkName, chairUntilLine } from "@/lib/chairPerks";
import { earnRule } from "@/lib/economy";
import { nextWeekStartMs } from "@/lib/gameDay";
import { allSources, pointEventEndText, pointEventOn, pointEventWhat } from "@/lib/pointEvent";
import { perkLines, TITLE_GRADE_NAMES, titleDef } from "@/lib/titles";
import type { Me } from "@/lib/types";
import { usePointEvent } from "../overlay/PointEventBadge";
import styles from "./PerksTab.module.css";

/** 끝나는 때 문구를 다시 그리는 간격 */
const TICK_MS = 60_000;

/**
 * 11/17 내 정보 [혜택] 탭: 지금 내게 붙어 있는 혜택을 한곳에 모아 보여 준다 (보여 주기만 — 판단은 서버가 같은 표로 한다).
 *  ① 레이스 1위 혜택 (lib/champPerks — 어떤 1위인지, 랭킹별 혜택, 끝나는 시각은 /api/champ/me)
 *  ② 단 칭호 능력 (lib/titles — 등급 이동 속도와 갈래 능력)
 *  ③ 포인트 이벤트 (lib/pointEvent — 안내 띠와 같은 값)
 * 셋 다 없으면 빈 안내. 상점 할인가·게이지 숫자처럼 그 자리에서 바뀌는 표시는 각 창에 그대로 둔다
 */
export default function PerksTab({ me }: { me: Me }) {
  const bits = isChampBits(me.champ) ? me.champ : 0;
  const boards = champBoards(bits);
  const [until, setUntil] = useState(0);
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
      .then((r) => alive && setUntil(r.until))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bits]);

  const title = titleDef(titleOfLook(me.equipped.map((e) => e.itemId)));
  const snap = usePointEvent();
  const ev = snap?.event ?? null;
  const t = Math.max(now, snap?.at ?? 0);
  const eventOn = !!ev && pointEventOn(ev, t);

  // 11/24 회장님 독대 지난주 1위 혜택 (lib/chairPerks — 판단은 서버, 끝나는 때 = 이번 독대 주 정산)
  const chair = me.chair ?? null;
  const chairLines = chairPerkLines(chair);

  if (!boards.length && !chairLines.length && !title && !eventOn)
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">
          ✦
        </span>
        <p className={styles.emptyHead}>지금 붙어 있는 혜택이 없어요</p>
        <p className={styles.meta}>레이스나 회장님 독대 1위를 하거나 칭호를 달면 여기에 모여요</p>
      </div>
    );

  return (
    <div className={styles.perks}>
      {boards.length > 0 && (
        <section className={styles.card} data-kind="champ" aria-label="레이스 1위 혜택">
          <div className={styles.head}>
            <span className={styles.icon} aria-hidden="true">
              ♛
            </span>
            <h3 className={styles.heading}>레이스 1위 혜택</h3>
            <span className={styles.chip}>{champBadgeText(bits)}</span>
          </div>
          {/* 끝나는 시각은 서버가 알려 준 자격 끝(/api/champ/me), 받기 전에는 이번 주 마감 (월요일 새벽 5시) */}
          <p className={styles.who}>지난주 {champNamesText(boards)}이 되어 받아요.</p>
          <p className={styles.until}>{champUntilText(until || nextWeekStartMs(now))}까지 붙어 있어요.</p>
          {CHAMP_BOARDS.filter((b) => boards.includes(b)).map((b) => (
            <div key={b} className={styles.group}>
              <span className={styles.board} data-board={b}>
                {CHAMP_TITLE[b]}
              </span>
              <ul className={styles.lines}>
                {(champBoardPerkLines(b).length ? champBoardPerkLines(b) : [CHAMP_BADGE_ONLY]).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
          {/* 다관왕 이동 속도 줄 (랭킹별 줄을 뺀 나머지) */}
          {champPerkLines(boards)
            .filter((line) => !boards.some((b) => champBoardPerkLines(b).includes(line)))
            .map((line) => (
              <p key={line} className={styles.extra}>
                {line}
              </p>
            ))}
        </section>
      )}

      {chairLines.length > 0 && (
        <section className={styles.card} data-kind="chair" aria-label="회장님 독대 1위 혜택" data-testid="perks-chair">
          <div className={styles.head}>
            <span className={styles.icon} aria-hidden="true">
              ♛
            </span>
            <h3 className={styles.heading}>회장님 독대 1위 혜택</h3>
            <span className={styles.chip}>{chair === "duo" ? "지난주 2관왕" : chair === "hell" ? "지난주 헬 1위" : "지난주 노멀 1위"}</span>
          </div>
          <p className={styles.who}>지난주 1위 칭호 「{chairPerkName(chair)}」 혜택이에요.</p>
          <p className={styles.until}>{chairUntilLine(now)}</p>
          <ul className={styles.lines}>
            {chairLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={styles.meta}>{CHAIR_PERK_OVERLAP}</p>
        </section>
      )}

      {title && (
        <section className={styles.card} data-kind="title" aria-label="칭호 능력">
          <div className={styles.head}>
            <span className={styles.icon} aria-hidden="true">
              ✧
            </span>
            <h3 className={styles.heading}>칭호 능력</h3>
            <span className={styles.chip} data-grade={title.grade}>
              {TITLE_GRADE_NAMES[title.grade]} 칭호
            </span>
          </div>
          <p className={styles.name}>「{title.name}」</p>
          {perkLines(title).length > 0 ? (
            <ul className={styles.lines}>
              {perkLines(title).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.meta}>{title.grade === "bronze" ? "동 칭호는 능력이 없어요. 은 칭호부터 붙어요." : "이 칭호는 능력이 없어요."}</p>
          )}
          <p className={styles.meta}>칭호는 가방 [칭호] 칸에서 바꿔요.</p>
        </section>
      )}

      {eventOn && ev && (
        <section className={styles.card} data-kind="event" aria-label="포인트 이벤트">
          <div className={styles.head}>
            <span className={styles.icon} aria-hidden="true">
              ★
            </span>
            <h3 className={styles.heading}>포인트 이벤트</h3>
            <span className={styles.chip}>{ev.mult}배</span>
          </div>
          <p className={styles.until}>{ev.endAt === null ? "운영자가 끌 때까지 이어져요." : `${pointEventEndText(ev.endAt, t)}까지예요.`}</p>
          <ul className={styles.lines}>
            <li>
              {pointEventWhat(ev.sources)}를 {ev.mult}배로 받아요.
            </li>
          </ul>
          {/* 고른 항목이 일부면 무엇이 늘어나는지 꼬리표로 */}
          {!allSources(ev.sources) && ev.sources.length > 1 && (
            <ul className={styles.tags} aria-label="늘어나는 항목">
              {ev.sources.map((s) => (
                <li key={s}>{earnRule(s).label}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
