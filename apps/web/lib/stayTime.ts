import { addDays, gameDay } from "./gameDay";
import { PRESENCE_TICK_MS } from "./store/types";

// 총 접속 시간 (접속 시간 랭킹·관리자 회원 목록). 머무르기 기록이 쌓일 때마다 계정 해시 `stayMin`과 랭킹(rank:stay)에 분으로 더한다

/** 머무르기 기록 1번 = 몇 분 */
export const STAY_TICK_MINUTES = PRESENCE_TICK_MS / 60_000;

/**
 * 머문 시간 채우기(관리자 일괄)에서 볼 게임 날짜. 날짜별 머무르기 기록(오늘 적립 해시 `_stay`)은 마지막 쓰기부터 2일 뒤 사라지므로
 * (accounts-redis.ts EARN_TTL_SEC) 새벽 5시 경계까지 치면 오늘부터 2일 전까지 남아 있을 수 있다
 */
export const stayFillDays = (now: number): string[] => [0, 1, 2].map((n) => addDays(gameDay(now), -n));

/** 123시간 45분 (1시간이 안 되면 45분, 딱 떨어지면 3시간) */
export function stayText(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}분`;
  return m ? `${h.toLocaleString("ko-KR")}시간 ${m}분` : `${h.toLocaleString("ko-KR")}시간`;
}
