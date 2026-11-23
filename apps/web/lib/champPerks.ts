import { CHAMP_ALL, CHAMP_BOARDS, CHAMP_TITLE, champBoards, type ChampBoard, type ItemKind } from "@tomb/protocol";
import type { EarnSource } from "./economy";
import { earnTerms as termsOf, type EarnBoost, type EarnTerms } from "./pointEvent";

// 11/17 주간 레이스 1위 1주일 혜택 (화면·서버 공용 순수 모듈). 값과 계산은 여기 한 곳.
// 자격 = 지난주 1위 (lib/store/champ.ts champBoardsFor — 배지·오라와 같은 기록). 그래서 배포하는 순간 지금 1위들에게 바로 붙고,
// 다음 1위가 정해지는 월요일 새벽 5시(한국 시간)에 저절로 넘어간다. 판단은 늘 서버가 한다 (화면은 같은 함수로 보여 주기만).
//  - 사냥왕: 사냥 경험치 +15% · 초월 경험치 +10% (야근 빌딩 층 포함)
//  - 낚시왕: 칭호·배지·오라 + 11/23 물고기 판매 +15% (포인트왕 레이스에는 안 들어감 — lib/forage/service sellTo)
//  - 포인트왕: 꾸미기 상점·가구 상점 20% 할인
//  - 2관왕·3관왕: 차지한 혜택 모두 + 마을 이동 속도 +1%
// 11/19 「편하게 노는 게임」 개편: 포인트를 늘리던 혜택(낚시왕 판매 +20%·한도 +150P, 사냥왕 한도 +300P,
// 포인트왕 머무르기 +15%·한도 +30P·접속 보너스 1.5배)과 그걸 레이스에서 빼던 계산(`_r:{항목}`)을 없앴다.
// 할인이 겹치면 가장 큰 할인 하나만 (pickDiscount — 칭호 look·house 할인, 포인트왕, 앞으로 생길 유령선 특가도 이 함수로)

/** 사냥왕: 사냥 판 경험치 + (칭호 사냥 경험치와 더한다) */
export const CHAMP_HUNT_EXP = 0.15;
/** 사냥왕: 초월 경험치 + (지옥 초월 판·야근 빌딩 층 모두) */
export const CHAMP_TRANSCEND_EXP = 0.1;
/** 11/23 낚시왕: 물고기를 팔 때 판 값의 15%를 더 (refund로 넣어 포인트왕 레이스에는 안 센다) */
export const CHAMP_FISH_SELL = 0.15;
/** 포인트왕: 꾸미기 상점(염색권 빼고)·가구 상점 할인 */
export const CHAMP_SHOP_DISCOUNT = 0.2;
/**
 * 2관왕·3관왕: 마을 걷기·달리기 속도 + (칭호 속도와 같은 자리에 더한다 — game/entities/Player).
 * 상한 확인: 가장 빠른 칭호 1.08(신화 1.06 + 1위·명예 갈래 0.02) + 0.01 = 1.09, × 가장 빠른 타는 펫 1.35 = 1.4715
 * → 화면 땅 위 배율 상한 MAX_GROUND_MUL 1.48 안, 실시간 서버 속도 검증(달리기 × 1.5) 안. 캠핑장 먹거리까지 겹치면 MAX_GROUND_MUL이 자른다
 */
export const CHAMP_MULTI_SPEED = 0.01;

/**
 * 한 번 적립할 때의 조건 (lib/pointEvent earnTerms). 사냥터(lib/rpg/service)가 여기서 부른다.
 * 11/19 1위 몫이 없어져 boards는 읽지 않는다 (예전 호출 모양 그대로 받으려고 남겨 둔 자리)
 */
export function earnTerms(boost: EarnBoost, source: EarnSource, boards?: readonly ChampBoard[]): EarnTerms {
  void boards;
  return termsOf(boost, source);
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

/** 상점 창 안내 한 줄 (포인트왕일 때) */
export const CHAMP_SHOP_NOTE = `포인트왕 혜택으로 ${Math.round(CHAMP_SHOP_DISCOUNT * 100)}% 싸게 사요.`;

/** 할인이 여럿이면 가장 큰 것 하나만 (0~0.9로 자른다). 칭호 할인·포인트왕·앞으로 생길 특가가 모두 이 함수를 거친다 */
export function pickDiscount(...rates: readonly (number | null | undefined)[]): number {
  let best = 0;
  for (const r of rates) if (typeof r === "number" && Number.isFinite(r) && r > best) best = r;
  return Math.min(0.9, best);
}

/**
 * 화면의 가구 상점 할인 (집 갈래 칭호 할인과 포인트왕 중 큰 것 — 서버 app/api/housing/me/buy와 같은 계산). bits = 내 정보의 champ 값.
 * chairOff = 11/24 회장님 독대 노멀 1위·2관왕 가구 할인 (lib/chairPerks chairShopDiscount(me.chair, "furniture")) — 셋 중 큰 것 하나
 */
export const furnitureDiscount = (titleHouse: number, bits: number | undefined, chairOff = 0) => pickDiscount(titleHouse, champShopDiscount(champBoards(bits), "furniture"), chairOff);

/** 다관왕(2개 이상)이면 마을 이동 속도 + (비트 묶음으로 — 착용 증서·내 정보의 champ 값) */
export function champSpeedAdd(bits: number | undefined): number {
  const n = typeof bits === "number" ? bits & CHAMP_ALL : 0;
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) >= 2 ? CHAMP_MULTI_SPEED : 0;
}

// ── 화면 문구 (짧은 해요체) ──

const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** 11/19 랭킹 혜택 문장이 없을 때(낚시왕) 대신 보여 주는 한 줄 */
export const CHAMP_BADGE_ONLY = "1위 배지와 오라를 1주일 달아요.";

/** 랭킹 하나의 혜택 문장들 (11/19 낚시왕은 포인트 혜택이 빠져 배지·오라만 — 문장이 없다, 화면은 CHAMP_BADGE_ONLY) */
export function champBoardPerkLines(board: ChampBoard): string[] {
  if (board === "huntKills") return [`사냥 경험치를 ${pctText(CHAMP_HUNT_EXP)} 더 받아요.`, `초월 경험치를 ${pctText(CHAMP_TRANSCEND_EXP)} 더 받아요. 야근 빌딩 층도 같아요.`];
  if (board === "fish") return [`물고기를 ${pctText(CHAMP_FISH_SELL)} 더 비싸게 팔아요. 더 받은 포인트는 포인트 레이스에 들어가지 않아요.`];
  return [`꾸미기 상점과 가구 상점에서 ${pctText(CHAMP_SHOP_DISCOUNT)} 싸게 사요. 염색권은 빠져요.`];
}

/** 11/17 레이스 창 「1위 보상」 칸에 붙이는 짧은 혜택 꼬리표 (긴 문장은 내 정보 [혜택] 탭 — champBoardPerkLines) */
export function champBoardPerkTags(board: ChampBoard): string[] {
  if (board === "huntKills") return [`사냥 경험치 +${pctText(CHAMP_HUNT_EXP)}`, `초월 경험치 +${pctText(CHAMP_TRANSCEND_EXP)}`];
  if (board === "fish") return [`물고기 판매 +${pctText(CHAMP_FISH_SELL)}`];
  return [`꾸미기와 가구 ${pctText(CHAMP_SHOP_DISCOUNT)} 할인`];
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
