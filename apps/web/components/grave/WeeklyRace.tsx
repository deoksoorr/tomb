"use client";

import { useEffect, useState } from "react";
import { CHAMP_BOARDS, CHAMP_TITLE, type ChampBoard } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import type { ChampAvatar, ChampResponse, RaceResponse, RaceRow } from "@/lib/types";
import AvatarThumb from "../account/AvatarThumb";
import StyledName from "../ui/StyledName";
import { ChampReward, ComboAuras } from "./ChampReward";
import styles from "./WeeklyRace.module.css";

// 이번 주 레이스 (화면 위 [레이스] 버튼 · 메뉴 시트 → 표준 창): 포인트·사냥 처치·낚시마다 1~3등 시상대(캐릭터 모습), 마감(월요일 새벽 5시, 한국 시간)까지 남은 시간,
// 내 순위·1위와의 차이. 창이 열려 있는 동안 30초마다 다시 받는다. 아래에는 지난주 1위와 명예의 전당.

/** 1위 보상 포인트 (응답이 오기 전 기본값 — lib/weeklyChamp CHAMP_POINTS와 같다) */
const CHAMP_POINTS_DEFAULT = 1000;

/** 다시 받는 간격 */
export const RACE_REFRESH_MS = 30_000;

const BOARD_NAME: Record<ChampBoard, string> = { points: "포인트", huntKills: "사냥 처치", fish: "낚시 · 가장 큰 물고기" };

/** "2일 5시간" · "3시간 12분" · "8분" */
export function leftText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m % 60}분`;
  return `${Math.max(1, m)}분`;
}

/** 11월 9일 주 */
function weekLabel(week: string): string {
  return `${Number(week.slice(4, 6))}월 ${Number(week.slice(6, 8))}일 주`;
}

/** 1,234P · 56마리 · 61.0cm (랭킹 창 rankValue와 같은 모양) */
function valueText(board: ChampBoard, value: number): string {
  if (board === "fish") return `${(value / 10).toFixed(1)}cm`;
  return `${value.toLocaleString("ko-KR")}${board === "points" ? "P" : "마리"}`;
}

export default function WeeklyRace() {
  const [race, setRace] = useState<RaceResponse | null>(null);
  const [champ, setChamp] = useState<ChampResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .race()
        .then((r) => {
          if (!alive) return;
          setRace(r);
          setError(null);
          setNow(Date.now());
        })
        .catch((e: unknown) => alive && setError(errorMessage(e)));
    void load();
    api
      .champ()
      .then((r) => alive && setChamp(r))
      .catch(() => undefined);
    // 숨긴 탭은 다시 받지 않는다
    const t = setInterval(() => document.visibilityState === "visible" && void load(), RACE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!race) return <p className={styles.empty}>{error ?? "불러오는 중…"}</p>;
  return (
    <div className={styles.race}>
      <p className={styles.deadline}>
        <span className={styles.clock} aria-hidden="true">
          ⏳
        </span>
        마감까지 <b>{leftText(race.endsAt - now)}</b>
        <span className={styles.when}> · 월요일 새벽 5시</span>
      </p>
      <p className={styles.reward}>1위 보상: 전용 모자(한 주) · 전용 오라 · 이름표 배지 · {(champ?.points ?? CHAMP_POINTS_DEFAULT).toLocaleString("ko-KR")}P</p>
      {/* 시상대 3개: 넓은 창은 가로로 나란히, 좁은 창은 세로로 */}
      <div className={styles.boards}>
        {race.boards.map((b) => (
          <section key={b.board} className={styles.board} aria-label={`이번 주 ${BOARD_NAME[b.board]} 레이스`}>
            <h3 className={styles.title}>
              <span className={styles.badge} data-board={b.board}>
                {CHAMP_TITLE[b.board]}
              </span>
              {BOARD_NAME[b.board]}
            </h3>
            <ChampReward board={b.board} points={champ?.points ?? CHAMP_POINTS_DEFAULT} />
            {b.top.length === 0 ? (
              <p className={styles.none}>아직 기록이 없어요. 지금 1위가 될 기회!</p>
            ) : (
              <ol className={styles.podium}>
                {[b.top[1], b.top[0], b.top[2]].map((r, i) => (r ? <Step key={r.rank} row={r} board={b.board} place={[2, 1, 3][i]} /> : <li key={`e${i}`} className={styles.blank} aria-hidden="true" />))}
              </ol>
            )}
            <p className={styles.mine}>
              {race.staff
                ? "운영자는 순위에 들지 않아요."
                : !b.mine
                  ? "내 기록이 아직 없어요."
                  : b.mine.rank === 1
                    ? `지금 내가 1위! (${valueText(b.board, b.mine.value)}) 월요일까지 지키면 보상`
                    : `내 순위 ${b.mine.rank}위 · ${valueText(b.board, b.mine.value)} · 1위까지 ${valueText(b.board, b.mine.gap)}`}
            </p>
          </section>
        ))}
      </div>
      {/* 명예의 전당: 랭킹마다 한 칸 (맨 앞 = 지난주 1위를 크게, 그 뒤로 지난 주들 1위를 작게). 넓은 창은 세 칸, 좁은 창은 세로로 */}
      {champ && (
        <section className={styles.hallBox} aria-label="명예의 전당">
          <h3 className={styles.title}>명예의 전당</h3>
          <div className={styles.boards}>
            {CHAMP_BOARDS.map((board) => (
              <HallColumn key={board} board={board} champ={champ} />
            ))}
          </div>
        </section>
      )}
      <section className={styles.hallBox} aria-label="여러 랭킹 1위면 합쳐진 오라">
        <h3 className={styles.title}>여러 개 1위면 · 다관왕 모자 하나 + 합쳐진 오라 하나</h3>
        <ComboAuras />
      </section>
    </div>
  );
}

/** 지난 주들 1위 (작게) 몇 개까지 */
const HALL_SHOW = 4;

/** 명예의 전당 한 칸: 지난주 1위(캐릭터·이름·기록) + 그 전 주들 1위 */
function HallColumn({ board, champ }: { board: ChampBoard; champ: ChampResponse }) {
  const last = champ.last.find((w) => w.board === board);
  const past = champ.hall
    .filter((h) => h.week !== champ.week)
    .flatMap((h) => h.winners.filter((w) => w.board === board).map((w) => ({ week: h.week, w })))
    .slice(0, HALL_SHOW);
  return (
    <div className={styles.hallCol}>
      <span className={styles.badge} data-board={board}>
        {CHAMP_TITLE[board]}
      </span>
      {last ? (
        <div className={styles.hallTop} data-me={last.me === true}>
          <Avatar a={last.avatar} label={`지난주 ${CHAMP_TITLE[board]} ${last.name}`} scale={1.25} />
          <span className={styles.lastText}>
            <span className={styles.hallWeek}>지난주 · {weekLabel(champ.week)}</span>
            <b>
              <StyledName name={last.name} look={last.avatar.look} />
            </b>
            <span className={styles.value}>
              {last.sub ? `${last.sub} ` : ""}
              {valueText(board, last.value)}
            </span>
          </span>
        </div>
      ) : (
        <p className={styles.none}>지난주 1위 없음</p>
      )}
      {past.length > 0 && (
        <ol className={styles.hallPast}>
          {past.map(({ week, w }) => (
            <li key={week}>
              <span className={styles.hallWeek}>{weekLabel(week)}</span> {w.name}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Avatar({ a, label, scale }: { a: ChampAvatar; label: string; scale: number }) {
  return <AvatarThumb color={a.color} body={a.body} look={a.look} dye={a.dye} label={label} scale={scale} />;
}

/** 시상대 한 칸: 캐릭터 + 받침(등수) + 이름·값 */
function Step({ row, board, place }: { row: RaceRow; board: ChampBoard; place: number }) {
  return (
    <li className={styles.step} data-place={place} data-me={row.me}>
      <Avatar a={row.avatar} label={`${place}등 ${row.name}`} scale={place === 1 ? 2 : 1.6} />
      <span className={styles.block}>{place}</span>
      <span className={styles.who}>
        <StyledName name={row.name} look={row.avatar.look} />
        {row.me && " (나)"}
      </span>
      <span className={styles.value}>
        {row.sub ? `${row.sub} ` : ""}
        {valueText(board, row.value)}
      </span>
    </li>
  );
}
