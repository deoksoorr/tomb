import { addDays } from "./gameDay";

// 주간 행운권 추첨 (마을 행운권 판매대). 순수 규칙·문구는 여기, 판매·추첨은 서버(lib/lotteryService · /api/lottery).
//  - 회차: 지난 토요일 저녁 8시(한국 시간)부터 이번 토요일 저녁 8시까지. 회차 id = 추첨하는 토요일 YYYYMMDD. 추첨 시각에 판매가 끝난다
//  - 계정마다 회차당 한 장, 200P. 운영자 계정은 살 수 없다
//  - 상금 = 이월 + 이번 회차 판매액의 70% + 매주 기본 상금 1,000P + 관리자 지원금.
//    판매 몫과 이월을 더한 값은 10,000P를 넘지 않는다 (넘는 판매 몫과 판매액의 나머지 30%는 사라진다). 기본 상금·지원금은 그 위에 더한다
//  - 1등 70% · 2등 20% · 3등 10% (P 아래는 버림). 산 사람이 셋보다 적으면 남은 몫은 다음 회차로 넘어간다 (이월은 최대 10,000P)
//  - 당첨금은 선물함으로 보낸다 (적립이 아니라 하루 한도·모은 포인트·랭킹과 무관)
// 클라이언트·서버 공용 (노드 모듈을 가져오지 않는다)

export const LOTTERY_PRICE = 200;
/** 판매액 중 상금으로 가는 몫 (%) */
export const LOTTERY_SALES_PCT = 70;
/** 매주 서버가 더하는 기본 상금 */
export const LOTTERY_BASE_PRIZE = 1_000;
/** 판매 몫 + 이월 상한, 이월 상한 */
export const LOTTERY_CAP = 10_000;
/** 등수별 몫 (%) */
export const LOTTERY_SPLIT = [70, 20, 10] as const;
/** 관리자 지원금 한 번에 더할 수 있는 양 */
export const LOTTERY_SUBSIDY_MAX = 50_000;
/** 처음 추첨하는 회차 (이 기능을 연 주의 토요일) */
export const LOTTERY_FIRST_ROUND = "20261121";
/** 추첨 요일·시각 (한국 시간 토요일 저녁 8시) */
export const LOTTERY_DRAW_TEXT = "토요일 저녁 8시";
/** 선물함에 보이는 보낸 이 */
export const LOTTERY_GIFT_FROM = "행운권 추첨";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const KST_MS = 9 * HOUR_MS;
const DRAW_HOUR = 20;
const SATURDAY = 6;

const utcOfDay = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
const dayOfUtc = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll("-", "");

/** 그 회차의 추첨 시각 (토요일 20:00 KST, ms) */
export const drawAtMs = (round: string) => utcOfDay(round) + DRAW_HOUR * HOUR_MS - KST_MS;
/** 그 회차가 열린 시각 (지난 토요일 20:00 KST) */
export const roundStartMs = (round: string) => drawAtMs(round) - 7 * DAY_MS;
export const prevRound = (round: string) => addDays(round, -7);
export const nextRound = (round: string) => addDays(round, 7);

/** now에 팔고 있는 회차 = now보다 늦은 가장 가까운 토요일 저녁 8시. 정확히 8시면 다음 회차 */
export function roundOf(now: number): string {
  const kst = new Date(now + KST_MS);
  const today = dayOfUtc(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  const sat = addDays(today, (SATURDAY - kst.getUTCDay() + 7) % 7);
  return drawAtMs(sat) > now ? sat : nextRound(sat);
}

export type LotteryPool = {
  /** 이전 회차에서 넘어온 상금 */
  carry: number;
  /** 이번 회차 판매액 */
  sales: number;
  /** 판매액 중 상금으로 가는 몫 (이월과 합쳐 LOTTERY_CAP까지) */
  salesShare: number;
  base: number;
  subsidy: number;
  total: number;
};

/** 회차 상금 계산 */
export function lotteryPool(p: { carry: number; tickets: number; subsidy: number }): LotteryPool {
  const sales = p.tickets * LOTTERY_PRICE;
  const salesShare = Math.min(Math.floor((sales * LOTTERY_SALES_PCT) / 100), Math.max(0, LOTTERY_CAP - p.carry));
  return { carry: p.carry, sales, salesShare, base: LOTTERY_BASE_PRIZE, subsidy: p.subsidy, total: p.carry + salesShare + LOTTERY_BASE_PRIZE + p.subsidy };
}

/** 등수별 당첨금 (1·2·3등, 버림) */
export const lotteryPrizes = (total: number): number[] => LOTTERY_SPLIT.map((pct) => Math.floor((total * pct) / 100));

/** 당첨자 수만큼 나눠 주고 남는 상금 → 다음 회차 이월 (최대 LOTTERY_CAP) */
export function lotteryCarryOut(total: number, winners: number): number {
  const paid = lotteryPrizes(total)
    .slice(0, Math.min(3, winners))
    .reduce((a, b) => a + b, 0);
  return Math.min(LOTTERY_CAP, total - paid);
}

export type LotteryWinner = { rank: 1 | 2 | 3; accountId: string; name: string; points: number };

/** 추첨 결과 (저장 형태). id = 회차 (테스트 서버 시험 추첨은 `{회차}t{시각}`) */
export type LotteryResult = {
  id: string;
  round: string;
  test?: true;
  drawnAt: number;
  tickets: number;
  carryIn: number;
  salesShare: number;
  base: number;
  subsidy: number;
  pool: number;
  winners: LotteryWinner[];
  carryOut: number;
};

/** 화면에 내보내는 결과 (계정 id 없이) */
export type LotteryResultPublic = Omit<LotteryResult, "winners"> & { winners: Omit<LotteryWinner, "accountId">[] };
export const publicResult = (r: LotteryResult): LotteryResultPublic => ({ ...r, winners: r.winners.map(({ rank, name, points }) => ({ rank, name, points })) });

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 추첨 공지 (마을 공지 줄 · 모든 채널) */
export function lotteryNoticeText(r: Pick<LotteryResult, "winners" | "carryOut" | "test">): string {
  const pre = `${r.test ? "[시험] " : ""}🍀 `;
  const [w1, w2, w3] = r.winners;
  if (!w1) return `${pre}이번 주 행운권은 산 사람이 없어서 상금 ${fmt(r.carryOut)}P가 다음 주로 넘어가요.`;
  const rest = w3 ? ` 2등 ${w2.name}님, 3등 ${w3.name}님도 축하해요.` : w2 ? ` 2등 ${w2.name}님도 축하해요.` : " 축하해요.";
  return `${pre}이번 주 행운권 추첨 1등은 ${w1.name}님, ${fmt(w1.points)}P예요!${rest}`;
}

/** 당첨 선물 쪽지 */
export const lotteryGiftNote = (rank: number) => `이번 주 행운권 ${rank}등 당첨이에요. 축하해요!`;

/** GET /api/lottery */
export type LotteryStatus = {
  round: string;
  drawAt: number;
  price: number;
  /** 이번 회차에 팔린 장수 (= 산 사람 수) */
  tickets: number;
  /** 내가 이번 회차 행운권을 샀는지 */
  mine: boolean;
  /** 운영자 계정이라 살 수 없다 */
  staff: boolean;
  pool: LotteryPool;
  prizes: number[];
  last: LotteryResultPublic | null;
  /** 지난 추첨에서 내 등수 (없으면 null) */
  lastRank: number | null;
};
