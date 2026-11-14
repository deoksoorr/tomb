// 게임 날짜 (하루·주 경계 한 곳). 한국 시간 새벽 5시에 하루가 바뀐다 — 밤늦게 노는 사람이 자정에 끊기지 않게.
//  - 포인트 하루 한도·사냥 판 수·낚시·채집·도감·접속 시간 보너스·출석 도장(연속·한 달 달력)·소원 분수·헌화 …
//    "오늘"을 쓰는 모든 것과 주간 랭킹·레이스 마감·주간 1위 정리(월요일 새벽 5시)가 이 파일만 쓴다.
//  - 날짜 키 형식은 그대로 YYYYMMDD = "한국 시각에서 5시간 뺀 날짜". 예) 11월 15일 새벽 4시 59분 → 20261114, 5시 → 20261115
//  - 화면의 하늘·계절·시간대(lib/ambience)·묘비 날짜(lib/epitaph todayKst)·방문 통계(lib/analyticsReport)는 실제 한국 시각 그대로다
// 클라이언트·서버 공용 (가져오는 것 없음 — 어디서든 순환 없이 쓸 수 있다)

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** 한국 시간 (UTC+9) */
const KST_OFFSET_MS = 9 * HOUR_MS;
/** 하루가 바뀌는 시각 (한국 시간 새벽 5시) */
export const DAY_RESET_HOUR = 5;
/** 화면 문구용: 하루·주가 바뀌는 시각 */
export const DAY_RESET_TEXT = `새벽 ${DAY_RESET_HOUR}시`;
/** UTC 시각에 이만큼 더한 UTC 날짜 = 게임 날짜 (9 − 5 = 4시간) */
const SHIFT_MS = KST_OFFSET_MS - DAY_RESET_HOUR * HOUR_MS;

const utcOfDay = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
const dayOfUtc = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll("-", "");

/** 게임 날짜 YYYY-MM-DD */
export function gameYmd(now = Date.now()): string {
  return new Date(now + SHIFT_MS).toISOString().slice(0, 10);
}
/** 게임 날짜 YYYYMMDD (저장소 날짜 키) */
export const gameDay = (now = Date.now()) => gameYmd(now).replaceAll("-", "");
/** day(YYYYMMDD)에서 n일 옮긴 날 */
export const addDays = (day: string, n: number) => dayOfUtc(utcOfDay(day) + n * DAY_MS);
/** 어제 (게임 날짜) */
export const gameYesterday = (now = Date.now()) => addDays(gameDay(now), -1);

/** 그 게임 날짜(YYYYMMDD)가 시작하는 시각 = 그날 한국 시간 새벽 5시 (ms) */
export const dayStartMs = (day: string) => utcOfDay(day) - SHIFT_MS;
/** 다음 하루가 시작하는 시각 (now 다음 새벽 5시, ms) */
export const nextDayStartMs = (now = Date.now()) => dayStartMs(gameDay(now)) + DAY_MS;
/** 하루 횟수·한도가 다시 차기까지 남은 ms (1..하루) */
export const msUntilDayReset = (now = Date.now()) => nextDayStartMs(now) - now;

/** 게임 날짜(YYYYMMDD)가 속한 주의 월요일 (YYYYMMDD). 주간 랭킹 키 */
export function weekOfDay(day: string): string {
  const dow = new Date(utcOfDay(day)).getUTCDay(); // 0 = 일요일
  return addDays(day, -((dow + 6) % 7));
}
/** now가 속한 주 (월요일 YYYYMMDD) */
export const gameWeek = (now = Date.now()) => weekOfDay(gameDay(now));
/** 그 주(월요일 YYYYMMDD)가 시작하는 시각 = 그 월요일 새벽 5시 (ms) */
export const weekStartMs = (week: string) => dayStartMs(week);
/** 그 주 마감 = 다음 월요일 새벽 5시 (ms) */
export const weekEndMs = (week: string) => weekStartMs(week) + 7 * DAY_MS;
/** 지난주 (월요일 YYYYMMDD) */
export const prevWeek = (week: string) => addDays(week, -7);
/** now 다음에 오는 주 마감 (다음 월요일 새벽 5시, ms) */
export const nextWeekStartMs = (now = Date.now()) => weekEndMs(gameWeek(now));
