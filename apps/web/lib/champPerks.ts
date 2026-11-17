import { CHAMP_ALL, CHAMP_BOARDS, CHAMP_TITLE, champBoards, type ChampBoard, type ItemKind } from "@tomb/protocol";
import { earnRule, inDailyTotal, type EarnSource } from "./economy";
import { boostedTotalCap, capsMult, pointsMult, type EarnBoost } from "./pointEvent";
import { STAY_BONUS_DAILY_MAX } from "./stayBonus";

// 11/17 주간 레이스 1위 1주일 혜택 (화면·서버 공용 순수 모듈). 값과 계산은 여기 한 곳.
// 자격 = 지난주 1위 (lib/store/champ.ts champBoardsFor — 배지·오라와 같은 기록). 그래서 배포하는 순간 지금 1위들에게 바로 붙고,
// 다음 1위가 정해지는 월요일 새벽 5시(한국 시간)에 저절로 넘어간다. 판단은 늘 서버가 한다 (화면은 같은 함수로 보여 주기만).
//  - 사냥왕: 사냥 경험치 +15% · 초월 경험치 +10% (야근 빌딩 층 포함) · 사냥터 하루 한도 +300P
//  - 낚시왕: 물고기 판매 값 +20% · 물고기 팔기 하루 한도 +150P
//  - 포인트왕: 꾸미기 상점·가구 상점 20% 할인 · 머무르기 +15%와 한도 +30P · 접속 시간 보너스 구간마다 1.5배 (한도도 그만큼)
//  - 2관왕·3관왕: 차지한 혜택 모두 + 마을 이동 속도 +1%
// 계산 규칙:
//  1) % 혜택은 포인트 이벤트 배수에 더한다 (주말 2배 + 20% = 2.2배, 이벤트가 없으면 1.2배). 소수 오차가 없게 배수는 100 = 1배인 정수로 센다
//  2) 한도는 이벤트 배수를 기본 한도에만 곱하고 1위 몫은 고정으로 더한다 (낚시왕 판매 한도: 이벤트 날 300×2+150 = 750, 평소 450).
//     하루 전체 한도도 그 사람만 1위 몫만큼 같이 오른다
//  3) 1위 혜택으로 더 번 몫(늘어난 % 몫 + 늘어난 한도 덕에 받은 몫)은 주간 포인트 레이스에 넣지 않는다. 지갑·오늘 합계·모은 포인트에는 넣는다.
//     오늘 적립 해시의 `_r:{항목}`에 "1위가 아니었으면 받았을 몫"을 따로 세어 그 몫만 레이스에 더한다 (accounts-redis CREDIT_FN · MemoryAccounts.credit)
//  4) 할인이 겹치면 가장 큰 할인 하나만 (pickDiscount — 칭호 look·house 할인, 포인트왕, 앞으로 생길 유령선 특가도 이 함수로)

/** 적립 혜택 한 칸: pct = 적립에 더하는 %(정수, 이벤트 배수에 더한다), cap = 하루 한도에 더하는 고정 P */
export type EarnPerk = { pct: number; cap: number };
const NO_EARN_PERK: EarnPerk = { pct: 0, cap: 0 };

/** 접속 시간 보너스 1.5배 = +50%, 한도도 그만큼 (145 × 0.5 = 72.5 → 올려서 73P) */
const STAY_PCT = 50;

/** 랭킹별 적립 혜택 (항목 → %·한도) */
export const CHAMP_EARN: Readonly<Record<ChampBoard, Readonly<Partial<Record<EarnSource, EarnPerk>>>>> = {
  points: { presence: { pct: 15, cap: 30 }, stayBonus: { pct: STAY_PCT, cap: Math.ceil((STAY_BONUS_DAILY_MAX * STAY_PCT) / 100) } },
  huntKills: { hunt: { pct: 0, cap: 300 } },
  fish: { fish: { pct: 20, cap: 150 } },
};
/** 사냥왕: 사냥 판 경험치 + (칭호 사냥 경험치와 더한다) */
export const CHAMP_HUNT_EXP = 0.15;
/** 사냥왕: 초월 경험치 + (지옥 초월 판·야근 빌딩 층 모두) */
export const CHAMP_TRANSCEND_EXP = 0.1;
/** 포인트왕: 꾸미기 상점(염색권 빼고)·가구 상점 할인 */
export const CHAMP_SHOP_DISCOUNT = 0.2;
/**
 * 2관왕·3관왕: 마을 걷기·달리기 속도 + (칭호 속도와 같은 자리에 더한다 — game/entities/Player).
 * 상한 확인: 가장 빠른 칭호 1.08(신화 1.06 + 1위·명예 갈래 0.02) + 0.01 = 1.09, × 가장 빠른 타는 펫 1.35 = 1.4715
 * → 화면 땅 위 배율 상한 MAX_GROUND_MUL 1.48 안, 실시간 서버 속도 검증(달리기 × 1.5) 안. 캠핑장 먹거리까지 겹치면 MAX_GROUND_MUL이 자른다
 */
export const CHAMP_MULTI_SPEED = 0.01;

/** 1위 랭킹들의 그 항목 혜택 (한 항목은 한 랭킹에만 붙지만 겹쳐도 더한다) */
export function champEarnPerk(boards: readonly ChampBoard[], source: EarnSource): EarnPerk {
  let pct = 0;
  let cap = 0;
  for (const b of boards) {
    const p = CHAMP_EARN[b]?.[source];
    if (p) {
      pct += p.pct;
      cap += p.cap;
    }
  }
  return pct || cap ? { pct, cap } : NO_EARN_PERK;
}

/** 오늘 하루 전체 한도: 이벤트로 늘어난 한도 + 그 사람의 1위 한도 몫 (하루 전체에 드는 항목만 — 접속 시간 보너스는 따로) */
export function champTotalCap(boost: EarnBoost, boards: readonly ChampBoard[] = []): number {
  let add = 0;
  for (const b of boards) for (const [s, p] of Object.entries(CHAMP_EARN[b] ?? {}) as [EarnSource, EarnPerk][]) if (inDailyTotal(s)) add += p.cap;
  return boostedTotalCap(boost) + add;
}

/**
 * 한 번 적립할 때의 조건 (저장소 둘·팔기 계획·게이지가 같이 쓴다).
 *  - m100 = 적립 배수 (100 = 1배): 이벤트 배수 × 100 + 1위 %. race100 = 레이스에 드는 배수 (이벤트 배수만)
 *  - dailyMax = 항목 하루 한도 (기본 × 이벤트 배수 + 1위 몫), raceMax = 1위 몫을 뺀 한도 (레이스에 드는 몫의 한도)
 *  - total = 하루 전체 한도, champ = 이 항목에 1위 혜택이 붙었는지 (붙었을 때만 레이스 몫을 따로 센다)
 */
export type EarnTerms = { m100: number; race100: number; dailyMax: number; raceMax: number; total: number; champ: boolean };

export function earnTerms(boost: EarnBoost, source: EarnSource, boards: readonly ChampBoard[] = []): EarnTerms {
  const p = champEarnPerk(boards, source);
  const race100 = pointsMult(boost, source) * 100;
  const raceMax = earnRule(source).dailyMax * capsMult(boost, source);
  return { m100: race100 + p.pct, race100, dailyMax: raceMax + p.cap, raceMax, total: champTotalCap(boost, boards), champ: p.pct > 0 || p.cap > 0 };
}

/** 기본 점수 × 배수(100 = 1배)를 1P 단위로 반올림 (정수 계산 — Redis Lua도 같은 식: floor((x × m100 + 50) / 100)) */
export const askOf = (base: number, m100: number) => Math.floor((base * m100 + 50) / 100);

/**
 * 이번 적립(amount) 가운데 주간 포인트 레이스에 드는 몫 = 1위가 아니었으면 받았을 만큼.
 * raceAsk = 기본 점수 × 이벤트 배수, raceLeft = 1위 몫을 뺀 항목 한도 − 오늘 이미 레이스에 든 그 항목 몫.
 * 하루 전체 한도는 항목 한도의 합이라 먼저 닿지 않으므로(lib/economy DAILY_EARN_CAP) 항목 한도만 본다
 */
export const raceShare = (amount: number, raceAsk: number, raceLeft: number) => Math.max(0, Math.min(amount, raceAsk, raceLeft));

/** 오늘 적립 해시에 레이스에 든 몫을 세는 칸 (1위 혜택이 붙은 항목만 생긴다. 게이지는 모르는 칸이라 무시한다 — lib/earnGauge) */
export const raceField = (source: EarnSource) => `_r:${source}`;

/** 받은 포인트(earned)가 원래 값으로 얼마어치인지 (asked 이하) — lib/pointEvent paidOf를 100 = 1배 정수 배수로 */
export const paidOfTerms = (earned: number, asked: number, t: Pick<EarnTerms, "m100">) => Math.min(asked, Math.ceil((earned * 100) / t.m100));

/**
 * 접속 시간 보너스 구간별 값 (bonus = 칭호 머무르기 보상으로 늘어난 구간 값 — lib/stayBonus stayBonusAmounts):
 * pay = 실제로 주는 값 (× 적립 배수), race = 레이스에 드는 값 (× 이벤트 배수)
 */
export function stayBonusAsk(titled: readonly number[], t: Pick<EarnTerms, "m100" | "race100">): { pay: number[]; race: number[] } {
  return { pay: titled.map((n) => askOf(n, t.m100)), race: titled.map((n) => (n * t.race100) / 100) };
}

/** 화면의 접속 시간 보너스 창: 포인트왕이면 구간 배수·하루 상한 (이벤트는 빼고 — 서버는 earnTerms로 이벤트까지 함께 센다) */
export function champStayBonus(boards: readonly ChampBoard[]): { m100: number; cap: number } | undefined {
  const p = champEarnPerk(boards, "stayBonus");
  return p.pct || p.cap ? { m100: 100 + p.pct, cap: STAY_BONUS_DAILY_MAX + p.cap } : undefined;
}

// ── 사냥 경험치 · 할인 · 속도 ──

/** 사냥왕이면 사냥 경험치 +, 아니면 0 */
export const champHuntExp = (boards: readonly ChampBoard[]) => (boards.includes("huntKills") ? CHAMP_HUNT_EXP : 0);
/** 사냥왕이면 초월 경험치 +, 아니면 0 */
export const champTranscendExp = (boards: readonly ChampBoard[]) => (boards.includes("huntKills") ? CHAMP_TRANSCEND_EXP : 0);

/** 할인을 받는 곳: shop = 꾸미기 상점 (24시간 이용권·영구 꾸미기·폭죽·확성기 등, 염색권은 빼고), furniture = 가구 상점 (가구·바닥·벽지·외관) */
export type ChampShop = "shop" | "furniture";

/** 포인트왕 할인율: 꾸미기 상점(염색권 빼고)·가구 상점만. 염색·집 분양·확장·행운권·사냥 장비·강화는 여기를 부르지 않는다 */
export function champShopDiscount(boards: readonly ChampBoard[], where: ChampShop, kind?: ItemKind): number {
  if (!boards.includes("points")) return 0;
  if (where === "shop" && kind === "dye") return 0;
  return CHAMP_SHOP_DISCOUNT;
}

/** 레이스 창 다관왕 안내 한 줄 */
export const CHAMP_MULTI_NOTE = `2관왕, 3관왕은 차지한 혜택을 모두 받고 마을에서 ${Math.round(CHAMP_MULTI_SPEED * 100)}% 더 빨리 걸어요.`;

/** 물고기 파는 창 안내 한 줄 (낚시왕일 때) */
export const CHAMP_FISH_NOTE = `낚시왕 혜택으로 ${CHAMP_EARN.fish.fish!.pct}% 더 받고 한도가 ${CHAMP_EARN.fish.fish!.cap}P 늘었어요.`;

/** 상점 창 안내 한 줄 (포인트왕일 때) */
export const CHAMP_SHOP_NOTE = `포인트왕 혜택으로 ${Math.round(CHAMP_SHOP_DISCOUNT * 100)}% 싸게 사요.`;

/** 할인이 여럿이면 가장 큰 것 하나만 (0~0.9로 자른다). 칭호 할인·포인트왕·앞으로 생길 특가가 모두 이 함수를 거친다 */
export function pickDiscount(...rates: readonly (number | null | undefined)[]): number {
  let best = 0;
  for (const r of rates) if (typeof r === "number" && Number.isFinite(r) && r > best) best = r;
  return Math.min(0.9, best);
}

/** 화면의 가구 상점 할인 (집 갈래 칭호 할인과 포인트왕 중 큰 것 — 서버 app/api/housing/me/buy와 같은 계산). bits = 내 정보의 champ 값 */
export const furnitureDiscount = (titleHouse: number, bits: number | undefined) => pickDiscount(titleHouse, champShopDiscount(champBoards(bits), "furniture"));

/** 다관왕(2개 이상)이면 마을 이동 속도 + (비트 묶음으로 — 착용 증서·내 정보의 champ 값) */
export function champSpeedAdd(bits: number | undefined): number {
  const n = typeof bits === "number" ? bits & CHAMP_ALL : 0;
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) >= 2 ? CHAMP_MULTI_SPEED : 0;
}

// ── 화면 문구 (짧은 해요체) ──

const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** 랭킹 하나의 혜택 문장들 */
export function champBoardPerkLines(board: ChampBoard): string[] {
  if (board === "huntKills")
    return [
      `사냥 경험치를 ${pctText(CHAMP_HUNT_EXP)} 더 받아요.`,
      `초월 경험치를 ${pctText(CHAMP_TRANSCEND_EXP)} 더 받아요. 야근 빌딩 층도 같아요.`,
      `사냥터 하루 포인트 한도가 ${CHAMP_EARN.huntKills.hunt!.cap}P 늘어요.`,
    ];
  if (board === "fish")
    return [`물고기를 ${CHAMP_EARN.fish.fish!.pct}% 더 비싸게 팔아요.`, `물고기 팔기 하루 한도가 ${CHAMP_EARN.fish.fish!.cap}P 늘어요.`];
  const pres = CHAMP_EARN.points.presence!;
  return [
    `꾸미기 상점과 가구 상점에서 ${pctText(CHAMP_SHOP_DISCOUNT)} 싸게 사요. 염색권은 빠져요.`,
    `머무르기 포인트를 ${pres.pct}% 더 받고 하루 한도가 ${pres.cap}P 늘어요.`,
    `접속 시간 보너스를 ${(100 + STAY_PCT) / 100}배로 받아요.`,
  ];
}

/** 11/17 레이스 창 「1위 보상」 칸에 붙이는 짧은 혜택 꼬리표 (긴 문장은 내 정보 [혜택] 탭 — champBoardPerkLines) */
export function champBoardPerkTags(board: ChampBoard): string[] {
  if (board === "huntKills") return [`사냥 경험치 +${pctText(CHAMP_HUNT_EXP)}`, `초월 경험치 +${pctText(CHAMP_TRANSCEND_EXP)}`, `사냥 한도 +${CHAMP_EARN.huntKills.hunt!.cap}P`];
  if (board === "fish") return [`물고기 값 +${CHAMP_EARN.fish.fish!.pct}%`, `팔기 한도 +${CHAMP_EARN.fish.fish!.cap}P`];
  const pres = CHAMP_EARN.points.presence!;
  return [`꾸미기와 가구 ${pctText(CHAMP_SHOP_DISCOUNT)} 할인`, `머무르기 +${pres.pct}%`, `접속 보너스 ${(100 + STAY_PCT) / 100}배`];
}

/** 차지한 랭킹들의 혜택 문장 (다관왕이면 이동 속도 줄까지) */
export function champPerkLines(boards: readonly ChampBoard[]): string[] {
  const set = CHAMP_BOARDS.filter((b) => boards.includes(b));
  const lines = set.flatMap(champBoardPerkLines);
  if (set.length >= 2) lines.push(`${set.length}관왕이라 마을에서 ${pctText(CHAMP_MULTI_SPEED)} 더 빨리 걸어요.`);
  return lines;
}

/** "사냥왕" · "포인트왕과 낚시왕" · "포인트왕, 사냥왕, 낚시왕" (왕은 받침이 있어 "과") */
export function champNamesText(boards: readonly ChampBoard[]): string {
  const names = CHAMP_BOARDS.filter((b) => boards.includes(b)).map((b) => CHAMP_TITLE[b]);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]}과 ${names[1]}`;
  return names.join(", ");
}

const KST_MS = 9 * 3_600_000;

/** 한국 시간 "11월 23일 새벽 5시" (분이 있으면 "오후 3시 30분"까지) */
export function champUntilText(ms: number): string {
  const d = new Date(ms + KST_MS);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const part = h < 6 ? "새벽" : h < 12 ? "오전" : h === 12 ? "낮" : h < 18 ? "오후" : "밤";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${part} ${h12}시${m ? ` ${m}분` : ""}`;
}

/** "지난주 사냥왕 혜택이 11월 23일 새벽 5시까지 붙어 있어요." (bits = 내 정보의 champ 값, until = 자격이 끝나는 시각) */
export function champPerkHead(bits: number | undefined, until: number): string {
  const b = champBoards(bits);
  if (!b.length) return "";
  return `지난주 ${champNamesText(b)} 혜택이 ${champUntilText(until)}까지 붙어 있어요.`;
}
