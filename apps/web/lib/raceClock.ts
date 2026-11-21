import { addDays, DAY_RESET_HOUR, gameWeek, weekEndMs } from "./gameDay";

// 11/20 주간 레이스 남은 시간·다음 레이스 시작 (레이스 창 두 탭·등대 입장 창 공용, 순수 — raceClock.test.ts)
// 레이스 = 게임 주 (월요일 새벽 5시 ~ 다음 월요일 새벽 5시, lib/gameDay)
// 11/22 weekOf: 주 계산을 바꿔 쓴다 (회장님 독대는 chairWeek — 첫 주가 길다). 기본은 gameWeek

const HOUR_MS = 3_600_000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** "2일 13시간" · "5시간 12분" · 1시간 아래 "47분 12초" */
export function raceLeftText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return `${h}시간 ${m % 60}분`;
  return m > 0 ? `${m}분 ${s % 60}초` : `${s % 60}초`;
}

/** left = 남은 시간 글 (endLine 안의 굵게 보일 부분) */
export type RaceClock = { endsAt: number; left: string; endLine: string; nextLine: string };

/** 이번 레이스 끝 줄 · 다음 레이스 시작 줄 */
export function raceClock(now = Date.now(), weekOf: (now: number) => string = gameWeek): RaceClock {
  const week = weekOf(now);
  const endsAt = weekEndMs(week);
  const next = addDays(week, 7);
  const dow = DOW[new Date(Date.UTC(+next.slice(0, 4), +next.slice(4, 6) - 1, +next.slice(6, 8))).getUTCDay()];
  const left = raceLeftText(endsAt - now);
  return {
    endsAt,
    left,
    endLine: `이번 레이스는 ${left} 뒤에 끝나요`,
    nextLine: `다음 레이스는 ${+next.slice(4, 6)}월 ${+next.slice(6, 8)}일 ${dow}요일 새벽 ${DAY_RESET_HOUR}시에 시작해요`,
  };
}

/** 다음 글이 바뀔 때까지 (1시간 아래는 1초, 그 위는 다음 분 경계) */
export function raceTickMs(now = Date.now(), weekOf: (now: number) => string = gameWeek): number {
  const left = weekEndMs(weekOf(now)) - now;
  if (left <= HOUR_MS) return 1000;
  return (left % 60_000 || 60_000) + 20;
}
