import type { Me } from "./types";

// 50번 소원 분수 (광장 북쪽): 동전(1~5P)을 던지면 오늘의 운세가 나오고, 가끔 몇 포인트가 튀어 돌아온다.
// 서버가 판정한다(/api/plaza/wish): 포인트 차감 → 운세·보너스 굴리기 → 보너스는 적립(하루 한도 "wish").
// 하루 WISH_DAILY번까지 (방문자·IP 한도, lib/ratelimit "wish"). 순수 규칙은 여기, 라우트는 app/api/plaza/wish.

/** 던질 수 있는 동전 (포인트) */
export const WISH_COINS = [1, 3, 5] as const;
export const WISH_MIN = 1;
export const WISH_MAX = 5;
/** 하루에 던질 수 있는 횟수 */
export const WISH_DAILY = 1;

export type WishLuck = "great" | "good" | "fair" | "small" | "soso";
export type WishFortune = { luck: WishLuck; title: string; text: string };

export type WishResponse = {
  me: Me;
  fortune: WishFortune;
  /** 동전이 튀어 돌아온 포인트 (실제로 쌓인 값, 하루 한도에 걸리면 줄거나 0) */
  bonus: number;
  /** 던진 포인트 */
  spent: number;
};

const LUCK_TITLE: Readonly<Record<WishLuck, string>> = {
  great: "대길",
  good: "길",
  fair: "중길",
  small: "소길",
  soso: "평",
};

/** 운세 문장 (종류마다). 부드럽고 짧게 — 겁주는 말은 넣지 않는다 */
const FORTUNES: Readonly<Record<WishLuck, readonly string[]>> = {
  great: [
    "오래 기다린 소식이 오늘 문을 두드려요.",
    "손대는 일마다 술술 풀리는 날이에요. 미뤄 둔 일을 꺼내 보세요.",
    "누군가 당신 덕분에 웃고 있어요. 그 웃음이 곧 돌아와요.",
    "별이 당신 편이에요. 작은 용기가 큰 행운이 돼요.",
  ],
  good: [
    "따뜻한 말 한마디가 하루를 바꿔요. 먼저 건네 보세요.",
    "잃어버린 줄 알았던 게 뜻밖의 곳에서 나와요.",
    "산책길에 좋은 생각이 떠올라요. 메모해 두세요.",
    "오늘 먹는 밥이 유난히 맛있을 거예요.",
    "반가운 사람과 마주칠 운이에요. 인사를 아끼지 마세요.",
  ],
  fair: [
    "서두르지 않으면 다 제때 이루어져요.",
    "작은 정리가 큰 홀가분함을 줘요. 책상 한 칸부터.",
    "물 한 잔, 기지개 한 번. 오늘의 행운은 거기서 시작해요.",
    "듣고 싶던 노래가 우연히 흘러나와요.",
    "어제의 걱정은 오늘 절반쯤 가벼워져요.",
  ],
  small: [
    "천천히 가도 괜찮아요. 길은 사라지지 않아요.",
    "오늘은 쉬어 가는 날. 따뜻한 차가 어울려요.",
    "작은 실수는 웃어넘기면 금방 잊혀요.",
    "우산을 챙기면 마음까지 든든해요.",
  ],
  soso: [
    "평범한 하루가 가장 큰 선물일 때가 있어요.",
    "모닥불 앞에서 잠깐 멍하니 있어 보세요. 생각이 정리돼요.",
    "오늘의 별자리는 '느긋함'. 급할수록 돌아가요.",
    "누군가의 묘비에 꽃 한 송이 — 마음이 맑아져요.",
  ],
};

/** 운 가중치 (합 100) */
const LUCK_WEIGHTS: readonly [WishLuck, number][] = [
  ["great", 10],
  ["good", 28],
  ["fair", 32],
  ["small", 18],
  ["soso", 12],
];

/** 운세 등급과 나올 확률(%) — 소원 분수 창의 "운세 종류" 표 */
export const WISH_LUCK_TABLE: readonly { luck: WishLuck; title: string; chance: number }[] = LUCK_WEIGHTS.map(([luck, chance]) => ({
  luck,
  title: LUCK_TITLE[luck],
  chance,
}));

/** 동전이 튀어 돌아올 확률: 대박(두 배 + 5) / 반짝(던진 것 + 1~5) */
export const WISH_BONUS_JACKPOT = 0.05;
export const WISH_BONUS_SPARKLE = 0.2;

/** 0..1 난수 → 운세 하나 */
export function pickFortune(r1: number, r2: number): WishFortune {
  let u = Math.max(0, Math.min(0.999999, r1)) * 100;
  let luck: WishLuck = "fair";
  for (const [l, w] of LUCK_WEIGHTS) {
    if (u < w) {
      luck = l;
      break;
    }
    u -= w;
  }
  const list = FORTUNES[luck];
  return { luck, title: LUCK_TITLE[luck], text: list[Math.floor(Math.max(0, Math.min(0.999999, r2)) * list.length)] };
}

/**
 * 동전이 튀어 돌아오는 포인트 (가끔, 아주 조금). 기댓값은 던진 것보다 작다 (1P를 던지면 거의 본전).
 *  - 5%: 대박 — 던진 것의 두 배 + 5
 *  - 20%: 반짝 — 던진 것 + 1~5
 *  - 나머지: 0
 */
export function rollBonus(amount: number, r1: number, r2: number): number {
  if (r1 < WISH_BONUS_JACKPOT) return amount * 2 + 5;
  if (r1 < WISH_BONUS_JACKPOT + WISH_BONUS_SPARKLE) return amount + 1 + Math.floor(Math.max(0, Math.min(0.999999, r2)) * 5);
  return 0;
}

export function isWishAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= WISH_MIN && n <= WISH_MAX;
}
