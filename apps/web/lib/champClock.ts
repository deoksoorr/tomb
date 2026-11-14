// 주간 랭킹 1위: 접속 중인 화면이 언제 다시 확인할지 (화면·시험이 함께 쓰는 순수 계산)
//  - 매주 월요일 새벽 5시(한국 시간) 마감 직후: 모든 화면이 한꺼번에 서버에 몰리지 않게 0~CHAMP_RECHECK_SPREAD_MS 흩뜨려 확인한다
//    (그 요청이 지난주 1위를 정리·지급하고, 1위 본인 화면에는 그 자리에서 알림 창·모자·배지·전용 오라가 붙는다)
//  - 그 밖에는 화면이 보이는 동안 CHAMP_POLL_MS마다 가볍게 (관리자 다시 지급·시험 지급처럼 다른 경로로 바뀐 것 반영.
//    서버가 "내 정보 새로 받기" 신호를 보내면 그때 바로도 확인한다)
// 주 경계는 lib/gameDay 한 곳 (서버의 주간 랭킹 키·정리 시각과 같다)

import { nextWeekStartMs } from "./gameDay";

/** 마감 직후 확인을 흩뜨리는 폭 */
export const CHAMP_RECHECK_SPREAD_MS = 20_000;
/** 화면이 보이는 동안 가볍게 확인하는 간격 */
export const CHAMP_POLL_MS = 4 * 60_000;

/** now 다음에 오는 주 마감 = 월요일 새벽 5시 (ms). 지금이 마감 정각·직후면 다음 주 월요일 */
export const nextWeekReset = (now: number) => nextWeekStartMs(now);

/** 다음 마감 직후 다시 확인할 때까지 기다릴 ms (rand = 0..1, 흩뜨리기) */
export function champRecheckDelay(now: number, rand: number): number {
  return nextWeekReset(now) - now + Math.floor(Math.min(1, Math.max(0, rand)) * CHAMP_RECHECK_SPREAD_MS);
}
