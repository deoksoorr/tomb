import type { ChampBoard, ItemKind } from "@tomb/protocol";
import { CHAIR_DUO, CHAIR_REWARD } from "./chairman/rewards";
import { CHAIR_RUNS_PER_DAY, chairWeek } from "./chairman/rules";
import { champHuntExp, champShopDiscount, champTranscendExp, champUntilText, type ChampShop } from "./champPerks";
import { weekEndMs } from "./gameDay";
import { SG_CHEST_CHANCE } from "./rpg/setGearRoll";

// 11/24 회장님 독대 주간 1위 1주일 혜택 (화면·서버 공용 순수 모듈 — 주간 레이스 lib/champPerks와 같은 짜임). 값과 계산은 여기 한 곳.
// 자격 = 지난주 회장님 독대 정리 기록의 1위 (lib/chairman/settle chairPerkFor — 칭호·꾸미기 대여와 같은 기록, chairHolders).
// 다음 1위가 정해지는 월요일 새벽 5시(한국 시간)에 저절로 넘어간다. 판단은 늘 서버가 한다 (화면은 같은 함수로 보여 주기만).
//  - 노멀 1위 「연봉 협상의 신」: 꾸미기 상점(염색권 빼고, 포인트왕과 같은 범위)·가구 상점 30% 할인 · 장비 강화 포인트 30% 할인 (재료는 그대로)
//  - 헬 1위 「맨주먹 협상가」: 사냥 경험치 +20% · 초월 경험치 +15% (야근 빌딩 층 포함) · 야근 빌딩 상자 세트 장비 확률 15% → 20%
//  - 2관왕 「차기 회장」: 위 둘 모두 + 마을 걷기 +2% + 회장님 독대 하루 판 모드마다 +1 (노멀 3 · 헬 3)
// 겹침: 할인은 칭호·포인트왕·유령선 특가와 함께 pickDiscount — 가장 큰 할인 하나만. 경험치는 사냥왕(15%·10%)과 더하지 않고 큰 쪽 하나만.
//       걷기는 레이스 다관왕 +1%와 같은 자리에 더한다 (champSpeedAdd + chairSpeedAdd). 상한은 아래 CHAIR_DUO_SPEED 설명

/** 지난주 회장님 독대 1위 갈래 (2관왕이면 duo 하나) */
export type ChairPerk = "normal" | "hell" | "duo";
export const isChairPerk = (v: unknown): v is ChairPerk => v === "normal" || v === "hell" || v === "duo";

/** 노멀 1위: 꾸미기 상점(염색권 빼고)·가구 상점 할인 */
export const CHAIR_SHOP_DISCOUNT = 0.3;
/** 노멀 1위: 장비 강화 포인트 할인 (결재 서류·인감 도장·증폭권은 그대로) */
export const CHAIR_ENHANCE_DISCOUNT = 0.3;
/** 헬 1위: 사냥 판 경험치 + (사냥왕 15%와 겹치면 큰 쪽) */
export const CHAIR_HUNT_EXP = 0.2;
/** 헬 1위: 초월 경험치 + (초월 판·야근 빌딩 층 — 사냥왕 10%와 겹치면 큰 쪽) */
export const CHAIR_TRANSCEND_EXP = 0.15;
/** 헬 1위: 야근 빌딩 상자 세트 장비 확률 (보통 SG_CHEST_CHANCE 15%) */
export const CHAIR_CHEST_SG_CHANCE = 0.2;
/**
 * 2관왕: 마을 걷기·달리기 속도 + (칭호 속도 자리 — 레이스 다관왕 CHAMP_MULTI_SPEED 0.01과 더한다, game/entities/Player).
 * 상한 확인: 가장 빠른 칭호 1.08 + 레이스 다관왕 0.01 + 0.02 = 1.11, × 가장 빠른 타는 펫 1.35 = 1.4985 → 화면 땅 위 배율 상한 MAX_GROUND_MUL 1.48이 자른다
 * (그 조합만 1.48에서 멈춘다 — 펫 없이 1.11, 보통 칭호·펫은 그대로 다 받는다). 실시간 서버 속도 검증(달리기 × SPEED_TOLERANCE 1.5)은 1.48 < 1.5라 안전
 */
export const CHAIR_DUO_SPEED = 0.02;
/** 2관왕: 회장님 독대 하루 유료 판 + (모드마다) */
export const CHAIR_DUO_EXTRA_RUNS = 1;

const hasNormal = (p: ChairPerk | null | undefined) => p === "normal" || p === "duo";
const hasHell = (p: ChairPerk | null | undefined) => p === "hell" || p === "duo";

/** 노멀 1위(·2관왕) 할인율: 꾸미기 상점(염색권 빼고)·가구 상점만 — 포인트왕 champShopDiscount와 같은 범위 */
export function chairShopDiscount(perk: ChairPerk | null | undefined, where: ChampShop, kind?: ItemKind): number {
  if (!hasNormal(perk)) return 0;
  if (where === "shop" && kind === "dye") return 0;
  return CHAIR_SHOP_DISCOUNT;
}

/** 레이스 1위와 회장님 독대 1위 상점 할인 중 큰 것 (칭호 할인과는 부르는 쪽이 pickDiscount로 한 번 더 — 결국 가장 큰 하나) */
export const perkShopDiscount = (boards: readonly ChampBoard[], perk: ChairPerk | null | undefined, where: ChampShop, kind?: ItemKind): number =>
  Math.max(champShopDiscount(boards, where, kind), chairShopDiscount(perk, where, kind));

/** 노멀 1위(·2관왕): 강화 포인트 할인율 */
export const chairEnhanceDiscount = (perk: ChairPerk | null | undefined): number => (hasNormal(perk) ? CHAIR_ENHANCE_DISCOUNT : 0);

/** 헬 1위(·2관왕) 사냥 경험치 + */
export const chairHuntExp = (perk: ChairPerk | null | undefined): number => (hasHell(perk) ? CHAIR_HUNT_EXP : 0);
/** 헬 1위(·2관왕) 초월 경험치 + */
export const chairTranscendExp = (perk: ChairPerk | null | undefined): number => (hasHell(perk) ? CHAIR_TRANSCEND_EXP : 0);

/** 1위 경험치 몫 하나 (사냥왕과 회장님 독대 헬 1위가 겹치면 더하지 않고 큰 쪽). by = 화면 결과에 붙는 이름 */
export type PerkExp = { rate: number; by: string | null };
const bigger = (champ: number, chair: number, perk: ChairPerk | null | undefined): PerkExp => {
  if (chair <= 0 && champ <= 0) return { rate: 0, by: null };
  return chair >= champ ? { rate: chair, by: chairPerkName(perk) } : { rate: champ, by: "사냥왕" };
};
export const perkHuntExp = (boards: readonly ChampBoard[], perk: ChairPerk | null | undefined): PerkExp => bigger(champHuntExp(boards), chairHuntExp(perk), perk);
export const perkTranscendExp = (boards: readonly ChampBoard[], perk: ChairPerk | null | undefined): PerkExp => bigger(champTranscendExp(boards), chairTranscendExp(perk), perk);

/** 야근 빌딩 상자 세트 장비 확률 (헬 1위·2관왕이면 20%, 아니면 보통 15%) */
export const chairChestChance = (perk: ChairPerk | null | undefined): number => (hasHell(perk) ? CHAIR_CHEST_SG_CHANCE : SG_CHEST_CHANCE);

/** 2관왕 마을 걷기 + (칭호 속도 자리) */
export const chairSpeedAdd = (perk: ChairPerk | null | undefined): number => (perk === "duo" ? CHAIR_DUO_SPEED : 0);

/** 회장님 독대 하루 유료 판 (모드마다): 2관왕 3, 아니면 2 */
export const chairRunsPerDay = (perk: ChairPerk | null | undefined): number => CHAIR_RUNS_PER_DAY + (perk === "duo" ? CHAIR_DUO_EXTRA_RUNS : 0);

/** 혜택이 끝나는 때 = 이번 회장님 독대 주 정산 (다음 월요일 새벽 5시) */
export const chairPerkUntil = (now = Date.now()): number => weekEndMs(chairWeek(now));

// ── 화면 문구 (짧은 해요체) ──

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 칭호 이름 (연봉 협상의 신 · 맨주먹 협상가 · 차기 회장) */
export function chairPerkName(perk: ChairPerk | null | undefined): string | null {
  if (perk === "duo") return CHAIR_DUO.titleName;
  if (perk === "normal" || perk === "hell") return CHAIR_REWARD[perk].titleName;
  return null;
}

const NORMAL_LINES = [`꾸미기 상점과 가구 상점에서 ${pct(CHAIR_SHOP_DISCOUNT)} 싸게 사요. 염색권은 할인에서 제외돼요.`, `장비 강화 포인트가 ${pct(CHAIR_ENHANCE_DISCOUNT)} 덜 들어요. 재료는 그대로예요.`];
const HELL_LINES = [
  `사냥 경험치를 ${pct(CHAIR_HUNT_EXP)} 더 받아요.`,
  `초월 경험치를 ${pct(CHAIR_TRANSCEND_EXP)} 더 받아요. 야근 빌딩 층도 같아요.`,
  `야근 빌딩 상자에서 세트 장비가 나올 확률이 ${pct(SG_CHEST_CHANCE)}에서 ${pct(CHAIR_CHEST_SG_CHANCE)}로 올라요.`,
];
const DUO_LINES = [`마을에서 ${pct(CHAIR_DUO_SPEED)} 더 빨리 걸어요.`, `회장님 독대를 하루 노멀 ${chairRunsPerDay("duo")}판, 헬 ${chairRunsPerDay("duo")}판 해요.`];

/** 혜택 문장들 (내 정보 [혜택] 탭) */
export function chairPerkLines(perk: ChairPerk | null | undefined): string[] {
  if (perk === "normal") return [...NORMAL_LINES];
  if (perk === "hell") return [...HELL_LINES];
  if (perk === "duo") return [...NORMAL_LINES, ...HELL_LINES, ...DUO_LINES];
  return [];
}

/** 레이스 창 [회장님 독대] 보상 카드의 짧은 혜택 줄 */
export function chairPerkTags(kind: ChairPerk): string[] {
  if (kind === "normal") return [`꾸미기와 가구 ${pct(CHAIR_SHOP_DISCOUNT)} 할인 (염색권 제외)`, `장비 강화 포인트 ${pct(CHAIR_ENHANCE_DISCOUNT)} 할인`];
  if (kind === "hell") return [`사냥 경험치 +${pct(CHAIR_HUNT_EXP)}`, `초월 경험치 +${pct(CHAIR_TRANSCEND_EXP)}`, `상자 세트 장비 확률 ${pct(SG_CHEST_CHANCE)} → ${pct(CHAIR_CHEST_SG_CHANCE)}`];
  return ["노멀과 헬 1위 혜택 모두", `마을 걷기 +${pct(CHAIR_DUO_SPEED)}`, `독대 하루 ${chairRunsPerDay("duo")}판씩`];
}

/** 보상 카드 아래 기간 한 줄 */
export const CHAIR_PERK_TERM = "다음 1위가 정해질 때까지 1주일";
/** 겹칠 때 규칙 한 줄 (보상 줄 아래) */
export const CHAIR_PERK_OVERLAP = "할인은 다른 할인과 겹치면 가장 큰 하나만, 경험치는 사냥왕과 겹치면 큰 쪽만 받아요.";

/** 상점 창 안내 한 줄 (노멀 1위·2관왕일 때) */
export const chairShopNote = (perk: ChairPerk | null | undefined): string => (hasNormal(perk) ? `「${chairPerkName(perk)}」 혜택으로 ${pct(CHAIR_SHOP_DISCOUNT)} 싸게 사요.` : "");
/** 강화 창 안내 한 줄 */
export const chairEnhanceNote = (perk: ChairPerk | null | undefined): string => (hasNormal(perk) ? `「${chairPerkName(perk)}」 혜택으로 강화 포인트가 ${pct(CHAIR_ENHANCE_DISCOUNT)} 덜 들어요.` : "");

/** "11월 30일 새벽 5시까지 붙어 있어요." */
export const chairUntilLine = (now = Date.now()): string => `${champUntilText(chairPerkUntil(now))}까지 붙어 있어요.`;
