import { CHAMP_TITLE, isTitleId, MANAGER_TITLE_ID, TITLE_IDS, titleOfLook, type ChampBoard, type TitleId } from "@tomb/protocol";
import { DEX_CAT_LABEL, DEX_TITLES, dexTitleNeed, type DexCat, type DexTitleTier } from "./forage/catalog";
import { HOUSE_TITLES } from "./housing/catalog";

// 칭호 목록 (화면·게임·서버 공용 순수 정의). id는 @tomb/protocol TITLE_IDS (착용 목록에 실려 다른 사람에게도 보인다).
//  - 등급 4단계 (동 · 은 · 금 · 전설) + 11/15 신화 (서버에 한 사람 — 서버 최초·꼭대기 층 주인·이번 주 최고층): 머리 위 칭호 모양(game/entities/TitleView)·가방 카드 색·칭호 능력이 등급을 따른다
//  - 얻는 방법: 도감 절반·전부 / 주간 1위 (랭킹별 · 누적 횟수) / 집 꾸밈 점수 / 사냥 레벨·누적 처치·어려운 사냥터 완주·초월 레벨·야근 빌딩 층·개척자 /
//    낚시 누적·가장 큰 물고기 / 채집 누적 / 연속 출석 / 누적 접속 시간 / 꾸미기 점수
//  - 한 번 얻은 칭호는 기록이 내려가도(연속 출석이 끊기거나 집 점수·꾸미기 점수가 내려가도) 남는다 — 서버가 알린 칭호 기록을 함께 본다 (lib/titlesServer)
//  - 칭호 능력: 단 칭호 하나만 — 등급만큼 마을 이동 속도 + (모두) · 칭호 갈래마다 다른 능력 (11/16 TITLE_PERK_GROUP · PERK_VALUES)
// 얻었는지는 서버(lib/titlesServer)가 판단하고, 착용도 얻은 칭호만 받는다 (운영자 계정은 모두 얻은 것으로 본다).

/** 11/16 manager = 매니저 전용 (관리자가 임명한 계정만 — 등급 순서 밖의 특별 등급, 칭호 능력 없음) */
export type TitleGrade = "bronze" | "silver" | "gold" | "legend" | "mythic" | "manager";
export const TITLE_GRADES: readonly TitleGrade[] = ["bronze", "silver", "gold", "legend", "mythic", "manager"];
export const TITLE_GRADE_NAMES: Record<TitleGrade, string> = { bronze: "동", silver: "은", gold: "금", legend: "전설", mythic: "신화", manager: "매니저" };

/**
 * 11/16 칭호 능력 (단 칭호 하나만) — 등급이 세기, 칭호 갈래(TITLE_PERK_GROUP)가 무슨 능력인지. 값은 여기 한 곳.
 *  - 공통: 모든 칭호가 등급만큼 마을 걷기·달리기 속도 + (GRADE_SPEED — 사냥터·놀이기구·배 등에는 없다)
 *  - 갈래 능력: 은·금·전설 값(PERK_VALUES), 신화 = 전설 × 1.5를 알맞게 반올림, 동·매니저는 없음
 *  - 속도 상한: 신화 1.06 (+ 1위·명예 갈래 0.02 = 1.08) × 가장 빠른 타는 펫 1.35 = 1.458 → 실시간 서버 속도 검증(달리기 × 1.5) 안,
 *    화면도 땅 위 배율을 MAX_GROUND_MUL(1.48)로 한 번 더 자른다 (game/entities/Player).
 *    11/17 지난주 다관왕은 같은 자리에 +0.01 (lib/champPerks CHAMP_MULTI_SPEED) → (1.08 + 0.01) × 1.35 = 1.4715 < 1.48 < 1.5
 *  - 머무르기 보상·도감 새 칸 보상은 그 값이 늘고(11/19부터 하루 한도 없음), 나머지는 확률·편의·할인
 */
export const GRADE_SPEED: Readonly<Record<TitleGrade, number>> = {
  bronze: 1,
  silver: 1.02,
  gold: 1.03,
  legend: 1.04,
  mythic: 1.06,
  // 11/16 매니저 칭호: 혜택은 칭호와 채팅 딱지뿐 (능력 없음)
  manager: 1,
};

/**
 * 11/16 칭호 능력 갈래 (무슨 능력인지):
 *  hunt 사냥 경험치 · tower 야근 빌딩 층 제한 시간 · fish 큰 물고기 확률 · forage 희귀 채집물 확률 · stay 머무르기 보상 ·
 *  look 상점·염색 할인 · quest 의뢰 도장 추가 확률 · dex 도감 새 칸 보상 · house 가구 할인 · champ 1위·명예 (속도 덧붙임 + 반짝이는 발자국) · none 없음
 */
export type PerkGroup = "hunt" | "tower" | "fish" | "forage" | "stay" | "look" | "quest" | "dex" | "house" | "champ" | "none";
type PerkGrade = "silver" | "gold" | "legend" | "mythic";

/** 갈래 능력 값 (은 · 금 · 전설 · 신화). %는 비율(0.06 = 6%), tower는 층마다 더하는 초 */
export const PERK_VALUES: Readonly<Record<Exclude<PerkGroup, "none">, Readonly<Record<PerkGrade, number>>>> = {
  hunt: { silver: 0.03, gold: 0.06, legend: 0.1, mythic: 0.15 },
  tower: { silver: 2, gold: 4, legend: 6, mythic: 9 },
  fish: { silver: 0.03, gold: 0.06, legend: 0.1, mythic: 0.15 },
  forage: { silver: 0.03, gold: 0.06, legend: 0.1, mythic: 0.15 },
  // 신화는 15 × 1.5 = 22.5 → 22 (내림 — 포인트 갈래라 조금 아껴서)
  stay: { silver: 0.05, gold: 0.1, legend: 0.15, mythic: 0.22 },
  look: { silver: 0.03, gold: 0.05, legend: 0.08, mythic: 0.12 },
  quest: { silver: 0.05, gold: 0.1, legend: 0.15, mythic: 0.22 },
  dex: { silver: 0.05, gold: 0.1, legend: 0.15, mythic: 0.22 },
  house: { silver: 0.03, gold: 0.05, legend: 0.08, mythic: 0.12 },
  // 1위·명예: 공통 속도 위에 +2% (등급과 상관없이 — 속도 상한 때문에 신화도 같다)
  champ: { silver: 0.02, gold: 0.02, legend: 0.02, mythic: 0.02 },
};

/**
 * 11/16 칭호 id → 능력 갈래 (모든 칭호를 하나씩 — 빠지면 타입 검사가 막는다).
 * 신화(서버에 한 사람) 칭호는 모두 야근 빌딩 끝판 기록이라 tower (최초 ★100·최초 +15도 끝판 성장이라 같은 갈래)
 */
export const TITLE_PERK_GROUP: Readonly<Record<TitleId, PerkGroup>> = {
  // 도감: 물고기 → 낚시, 곤충·약초버섯·광석·발굴품 → 채집, 별자리·몬스터 → 도감
  t_fish50: "fish",
  t_fish100: "fish",
  t_bug50: "forage",
  t_bug100: "forage",
  t_herb50: "forage",
  t_herb100: "forage",
  t_ore50: "forage",
  t_ore100: "forage",
  t_dig50: "forage",
  t_dig100: "forage",
  t_star50: "dex",
  t_star100: "dex",
  t_mob50: "dex",
  t_mob100: "dex",
  // 주간 1위 · 누적 1위 · 개척자 · 추천 이웃 → 1위·명예
  t_champ_points: "champ",
  t_champ_hunt: "champ",
  t_champ_fish: "champ",
  t_champ3: "champ",
  t_champ10: "champ",
  t_pioneer: "champ",
  t_ref3: "champ",
  t_ref10: "champ",
  // 11/18 새 이웃 꾸러미 졸업 칭호 (동 — 능력은 공통 속도뿐)
  t_grad: "none",
  // 집 꾸밈 점수 → 가구 할인
  t_house50: "house",
  t_house150: "house",
  t_house400: "house",
  t_house900: "house",
  // 사냥 레벨 · 누적 처치 · 어려움·지옥 완주 → 사냥 경험치
  t_lv10: "hunt",
  t_lv20: "hunt",
  t_lv30: "hunt",
  t_lv40: "hunt",
  t_lv50: "hunt",
  t_kill100: "hunt",
  t_kill1k: "hunt",
  t_kill5k: "hunt",
  t_kill20k: "hunt",
  t_hard: "hunt",
  t_hell: "hunt",
  // 초월 레벨 · 야근 빌딩 층 · 세트 장비 · 강화 → 야근 빌딩 (끝판 성장)
  t_tlv60: "tower",
  t_tlv75: "tower",
  t_tlv90: "tower",
  t_tlv100: "tower",
  t_floor10: "tower",
  t_floor20: "tower",
  t_floor30: "tower",
  t_floor50: "tower",
  t_floor100: "tower",
  t_sgOvertime: "tower",
  t_sgApproval: "tower",
  t_sgMeeting: "tower",
  t_sgTrip: "tower",
  t_enh15: "tower",
  // 신화 (서버 최초 30·50·100층 · 첫 ★100 · 꼭대기 층 주인 · 지난주 최고층 · 최초 +15)
  t_first30: "tower",
  t_first50: "tower",
  t_first100: "tower",
  t_firstStar100: "tower",
  t_topFloor: "tower",
  t_weekFloor: "tower",
  t_firstEnh15: "tower",
  // 낚시 누적 · 가장 큰 물고기 → 큰 물고기 확률
  t_fishn50: "fish",
  t_fishn300: "fish",
  t_fishn1k: "fish",
  t_fishn3k: "fish",
  t_big50: "fish",
  t_big100: "fish",
  t_big150: "fish",
  // 채집 누적 → 희귀 채집물 확률
  t_gath100: "forage",
  t_gath500: "forage",
  t_gath2k: "forage",
  t_gath5k: "forage",
  // 연속 출석 · 누적 접속 → 머무르기 보상
  t_att7: "stay",
  t_att30: "stay",
  t_att100: "stay",
  t_att365: "stay",
  t_stay1: "stay",
  t_stay10: "stay",
  t_stay50: "stay",
  t_stay100: "stay",
  t_stay300: "stay",
  // 꾸미기 점수 → 상점·염색 할인
  t_look200: "look",
  t_look600: "look",
  t_look1500: "look",
  t_look3000: "look",
  // 수집 의뢰 · 수집왕 · 긴급 의뢰 → 의뢰 도장
  t_quest50: "quest",
  t_quest300: "quest",
  t_quest1k: "quest",
  t_quest2500: "quest",
  t_qking: "quest",
  t_urgKing: "quest",
  t_urgLast: "quest",
  // 매니저 전용: 능력 없음
  t_mgr: "none",
};

/** 칭호 능력 한 벌 (갈래가 아닌 칸은 0). 서버(보상·확률)와 화면(속도·표시)이 같이 쓴다 */
export type TitlePerk = {
  group: PerkGroup;
  /** 마을 걷기·달리기 속도 배율 (공통 등급 + 1위·명예 갈래 덧붙임) */
  speed: number;
  /** 상점·염색(영구 소장 포함) 할인율 — 패션 */
  discount: number;
  /** 집 가구 할인율 — 집 */
  houseDiscount: number;
  /** 사냥 판 경험치 비율 + — 사냥 */
  huntExp: number;
  /** 야근 빌딩 층마다 더하는 제한 시간 (초) — 야근 빌딩 */
  towerSec: number;
  /** 크기를 한 번 더 굴려 큰 쪽을 가질 확률 — 낚시 */
  bigFish: number;
  /** 채집물을 희귀 이상에서 뽑을 확률 — 채집 */
  rareGather: number;
  /** 머무르기 보상 비율 + (하루 상한 안) — 출석·접속 */
  stayBonus: number;
  /** 의뢰 도장을 하나 더 받을 확률 — 수집 의뢰 */
  questStamp: number;
  /** 도감 새 칸 보상 비율 + — 도감 */
  dexBonus: number;
  /** 반짝이는 발자국 (화면 연출만) — 1위·명예 */
  sparkle: boolean;
};

const NO_PERK: TitlePerk = {
  group: "none",
  speed: 1,
  discount: 0,
  houseDiscount: 0,
  huntExp: 0,
  towerSec: 0,
  bigFish: 0,
  rareGather: 0,
  stayBonus: 0,
  questStamp: 0,
  dexBonus: 0,
  sparkle: false,
};

/** 등급의 갈래 능력 값 (동·매니저·none = 0) */
export function perkValue(group: PerkGroup, grade: TitleGrade): number {
  if (group === "none" || grade === "bronze" || grade === "manager") return 0;
  return PERK_VALUES[group][grade];
}

/** 갈래 + 등급 → 능력 한 벌 */
export function perkOf(group: PerkGroup, grade: TitleGrade): TitlePerk {
  const v = perkValue(group, grade);
  const speed = Math.round((GRADE_SPEED[grade] + (group === "champ" ? v : 0)) * 1000) / 1000;
  if (speed === 1 && v === 0) return NO_PERK;
  return {
    ...NO_PERK,
    group: v > 0 ? group : "none",
    speed,
    ...(group === "look" ? { discount: v } : {}),
    ...(group === "house" ? { houseDiscount: v } : {}),
    ...(group === "hunt" ? { huntExp: v } : {}),
    ...(group === "tower" ? { towerSec: v } : {}),
    ...(group === "fish" ? { bigFish: v } : {}),
    ...(group === "forage" ? { rareGather: v } : {}),
    ...(group === "stay" ? { stayBonus: v } : {}),
    ...(group === "quest" ? { questStamp: v } : {}),
    ...(group === "dex" ? { dexBonus: v } : {}),
    ...(group === "champ" && v > 0 ? { sparkle: true } : {}),
  };
}

export type TitleGroup = "dex" | "hunt" | "life" | "fish" | "look" | "champ" | "house" | "town";
export const TITLE_GROUP_NAMES: Record<TitleGroup, string> = {
  dex: "도감",
  hunt: "사냥",
  fish: "낚시·채집",
  life: "출석·접속",
  look: "꾸미기",
  champ: "주간 1위",
  house: "내 집",
  town: "이웃",
};
export const TITLE_GROUPS: readonly TitleGroup[] = ["dex", "hunt", "fish", "life", "look", "champ", "house", "town"];

/**
 * 진행 수치 (서버 lib/titlesServer가 센다). 단위: 레벨·마리·종·일·점, stay = 머문 기록 수(10분씩), big = 가장 큰 물고기 mm,
 * dex_{칸} = 그 도감 칸 등록 종 수, champ = 주간 1위 누적 횟수, hard·hell = 끝까지 깬 적 있음(1/0).
 * 11/15 tlv = 초월 레벨(1 = ★51), floor = 야근 빌딩 최고 층, pioneer = 개척자 번호(0 = 없음), pioneerAt = 개척자 받은 시각 ms (진행 표시용, 칭호 조건 아님)
 */
export type TitleMetric =
  | "lv"
  | "kills"
  | "hard"
  | "hell"
  | "fishn"
  | "big"
  | "gath"
  | "streak"
  | "stay"
  | "look"
  | "champ"
  | "house"
  | "tlv"
  | "floor"
  | "pioneer"
  | "pioneerAt"
  // 11/15 세트 장비: 4세트를 처음 맞춘 적 있음(1/0, 세트마다) · 지금까지 가장 높은 강화
  | "sgOvertime"
  | "sgApproval"
  | "sgMeeting"
  | "sgTrip"
  | "enh"
  // 11/15 수집 의뢰: 끝낸 의뢰 수 · 수집가 유령 외형 받음(1/0)
  | "quests"
  | "qking"
  // 추천 코드로 데려온 이웃 중 조건을 넘긴 수 (같은 곳 가입은 세지 않는다 — lib/referralService)
  | "refs"
  // 11/18 새 이웃 꾸러미(가입 첫 7일) 받은 선물 수 (7 = 졸업)
  | "grad"
  | `dex_${DexCat}`;

export type TitleDef = {
  id: TitleId;
  name: string;
  group: TitleGroup;
  grade: TitleGrade;
  /** 얻는 방법 한 줄 */
  how: string;
  /** 진행 표시 (없으면 진행 수치 없이 얻음/못 얻음만) */
  metric?: TitleMetric;
  need?: number;
  /** 주간 1위 랭킹별 칭호 */
  board?: ChampBoard;
  /** 11/15 신화: 서버에 한 사람만 (서버가 주인을 정한다 — TitleFacts.mythic) */
  holder?: true;
  /** 11/15 지금 주인일 때만 (기록을 뺏기거나 주가 바뀌면 사라진다 — 한 번 얻어도 남지 않는다) */
  transient?: true;
  /** 11/15 받은 때부터 정해진 동안만 (긴급 의뢰 — 서버가 끝 시각을 안다: TitleFacts.timed) */
  timed?: true;
  /** 11/16 매니저 전용 (매니저일 때만 — TitleFacts.manager. 칭호 창에도 매니저에게만 보인다) */
  manager?: true;
};

/** 단계별 칭호 한 줄: [id, 이름, 등급, 얻는 방법, 진행 수치, 필요 값, 갈래] */
type StepRow = readonly [TitleId, string, TitleGrade, string, TitleMetric, number, TitleGroup];

const DEX_OF: Record<string, [DexCat, DexTitleTier, TitleGrade]> = {
  t_fish50: ["fish", 50, "silver"],
  t_fish100: ["fish", 100, "gold"],
  t_bug50: ["bug", 50, "silver"],
  t_bug100: ["bug", 100, "gold"],
  t_herb50: ["herb", 50, "silver"],
  t_herb100: ["herb", 100, "gold"],
  t_ore50: ["ore", 50, "silver"],
  t_ore100: ["ore", 100, "gold"],
  t_dig50: ["dig", 50, "silver"],
  t_dig100: ["dig", 100, "gold"],
  t_star50: ["star", 50, "silver"],
  t_star100: ["star", 100, "legend"],
  // 11/16 몬스터 도감 (사냥터·야근 빌딩 몬스터 전부라 별자리처럼 전설)
  t_mob50: ["mob", 50, "silver"],
  t_mob100: ["mob", 100, "legend"],
};
const CHAMP_OF: Record<string, ChampBoard> = { t_champ_points: "points", t_champ_hunt: "huntKills", t_champ_fish: "fish" };
const CHAMP_HOW: Record<ChampBoard, string> = { points: "포인트", huntKills: "사냥 처치", fish: "낚시(가장 큰 물고기)" };
const HOUSE_OF: Record<string, [number, TitleGrade]> = { t_house50: [50, "bronze"], t_house150: [150, "silver"], t_house400: [400, "gold"], t_house900: [900, "legend"] };

const hours = (ticks: number) => ticks / 6;
/** 단계별 칭호 (이름은 마을 말투 — 직장인 농담 조금) */
const STEP_ROWS: readonly StepRow[] = [
    ["t_champ3", "단골 1위", "gold", "주간 1위를 모두 합쳐 3번 하면", "champ", 3, "champ"],
    ["t_champ10", "명예의 전당 터줏대감", "legend", "주간 1위를 모두 합쳐 10번 하면", "champ", 10, "champ"],
    ["t_lv10", "수습 사냥꾼", "bronze", "사냥 레벨 10", "lv", 10, "hunt"],
    ["t_lv20", "정규직 사냥꾼", "silver", "사냥 레벨 20", "lv", 20, "hunt"],
    ["t_lv30", "사냥팀 팀장", "silver", "사냥 레벨 30", "lv", 30, "hunt"],
    ["t_lv40", "사냥 본부장", "gold", "사냥 레벨 40", "lv", 40, "hunt"],
    ["t_lv50", "사냥계의 전설", "legend", "사냥 레벨 50 (최고 레벨)", "lv", 50, "hunt"],
    ["t_kill100", "야근 퇴치반", "bronze", "사냥터에서 몬스터를 모두 합쳐 100마리 처치", "kills", 100, "hunt"],
    ["t_kill1k", "몬스터 정리 담당", "silver", "누적 처치 1,000마리", "kills", 1000, "hunt"],
    ["t_kill5k", "처치 실적 우수 사원", "gold", "누적 처치 5,000마리", "kills", 5000, "hunt"],
    ["t_kill20k", "몬스터 감원 위원장", "legend", "누적 처치 20,000마리", "kills", 20000, "hunt"],
    ["t_hard", "고난도 출장 완료", "silver", "어려움 사냥터를 쓰러지지 않고 끝까지 깨면", "hard", 1, "hunt"],
    ["t_hell", "지옥 출장 생환자", "gold", "지옥 사냥터를 쓰러지지 않고 끝까지 깨면", "hell", 1, "hunt"],
    // 11/15 사냥 끝판 (lib/rpg/endgame · 야근 빌딩 lib/rpg/tower)
    ["t_tlv60", "연봉 협상 대상자", "silver", "초월 레벨 ★60 (레벨 50에서 지옥 사냥으로)", "tlv", 10, "hunt"],
    ["t_tlv75", "임원 후보", "gold", "초월 레벨 ★75", "tlv", 25, "hunt"],
    ["t_tlv90", "상무님", "gold", "초월 레벨 ★90", "tlv", 40, "hunt"],
    ["t_tlv100", "퇴사가 불가능한 자", "legend", "초월 레벨 ★100 (최고)", "tlv", 50, "hunt"],
    ["t_floor10", "야근 입문", "bronze", "마을의 야근 빌딩에서 10층을 깨면", "floor", 10, "hunt"],
    ["t_floor20", "번아웃 생존자", "silver", "야근 빌딩 20층을 깨면", "floor", 20, "hunt"],
    ["t_floor30", "야근이 일상", "gold", "야근 빌딩 30층을 깨면", "floor", 30, "hunt"],
    ["t_floor50", "퇴근을 잊은 자", "gold", "야근 빌딩 50층을 깨면", "floor", 50, "hunt"],
    ["t_floor100", "사무실이 집", "legend", "야근 빌딩 100층을 깨면", "floor", 100, "hunt"],
    ["t_pioneer", "개척자", "gold", "끝판이 열린 뒤 14일 안에 ★51에 닿거나 야근 빌딩 5층을 처음 넘으면 (닿은 차례대로 번호, 그 뒤로는 못 얻음)", "pioneer", 1, "hunt"],
    // 11/15 세트 장비 (lib/rpg/setGear): 같은 세트 네 부위를 처음 함께 끼면 · 장비 하나를 +15까지
    ["t_sgOvertime", "야근 세트 착용자", "silver", "야근 세트 네 부위를 함께 끼면", "sgOvertime", 1, "hunt"],
    ["t_sgApproval", "결재 세트 착용자", "silver", "결재 세트 네 부위를 함께 끼면", "sgApproval", 1, "hunt"],
    ["t_sgMeeting", "회의 세트 착용자", "silver", "회의 세트 네 부위를 함께 끼면", "sgMeeting", 1, "hunt"],
    ["t_sgTrip", "출장 세트 착용자", "silver", "출장 세트 네 부위를 함께 끼면", "sgTrip", 1, "hunt"],
    ["t_enh15", "강화의 신", "legend", "장비 하나를 +15까지 강화하면", "enh", 15, "hunt"],
    ["t_fishn50", "점심시간 낚시꾼", "bronze", "물고기를 모두 합쳐 50마리 낚으면 (자동 낚시 포함)", "fishn", 50, "fish"],
    ["t_fishn300", "주말 강태공", "silver", "물고기 누적 300마리", "fishn", 300, "fish"],
    ["t_fishn1k", "어부 출신 대리", "gold", "물고기 누적 1,000마리", "fishn", 1000, "fish"],
    ["t_fishn3k", "바다가 인정한 자", "legend", "물고기 누적 3,000마리", "fishn", 3000, "fish"],
    ["t_big50", "월척 인증", "silver", "50cm 넘는 물고기를 낚으면", "big", 500, "fish"],
    ["t_big100", "괴물 낚시꾼", "gold", "1m 넘는 물고기를 낚으면", "big", 1000, "fish"],
    ["t_big150", "전설의 대어 사냥꾼", "legend", "1.5m 넘는 물고기를 낚으면", "big", 1500, "fish"],
    ["t_gath100", "산책형 채집가", "bronze", "곤충·약초·광석·발굴품을 모두 합쳐 100개 모으면", "gath", 100, "fish"],
    ["t_gath500", "주말 농부", "silver", "채집 누적 500개", "gath", 500, "fish"],
    ["t_gath2k", "채집의 달인", "gold", "채집 누적 2,000개", "gath", 2000, "fish"],
    ["t_gath5k", "자연 관리 본부장", "legend", "채집 누적 5,000개", "gath", 5000, "fish"],
    ["t_att7", "개근상 후보", "bronze", "7일 연속 출석 도장", "streak", 7, "life"],
    ["t_att30", "한 달 개근", "silver", "30일 연속 출석", "streak", 30, "life"],
    ["t_att100", "무결근 사원", "gold", "100일 연속 출석", "streak", 100, "life"],
    ["t_att365", "이 마을 정규직", "legend", "365일 연속 출석", "streak", 365, "life"],
    ["t_stay1", "출근 도장", "bronze", `마을에 모두 합쳐 ${hours(6)}시간 머물면`, "stay", 6, "life"],
    ["t_stay10", "칼퇴는 없다", "bronze", `누적 접속 ${hours(60)}시간`, "stay", 60, "life"],
    ["t_stay50", "야근 단골", "silver", `누적 접속 ${hours(300)}시간`, "stay", 300, "life"],
    ["t_stay100", "이 마을 붙박이", "gold", `누적 접속 ${hours(600)}시간`, "stay", 600, "life"],
    ["t_stay300", "이 마을 터줏대감", "legend", `누적 접속 ${hours(1800)}시간`, "stay", 1800, "life"],
    ["t_look200", "패션 입문", "bronze", "꾸미기 점수 200점", "look", 200, "look"],
    ["t_look600", "멋쟁이 사원", "silver", "꾸미기 점수 600점", "look", 600, "look"],
    ["t_look1500", "출근룩 장인", "gold", "꾸미기 점수 1,500점", "look", 1500, "look"],
    ["t_look3000", "마을 패션 아이콘", "legend", "꾸미기 점수 3,000점", "look", 3000, "look"],
    // 11/15 수집 의뢰 (lib/forage/quests): 오늘의 의뢰·이번 주 큰 의뢰를 끝낸 수 · 도장 교환소의 수집가 유령 외형
    ["t_quest50", "단골 납품업자", "bronze", "수집 의뢰를 모두 합쳐 50개 끝내면", "quests", 50, "fish"],
    ["t_quest300", "수집가 유령의 오른팔", "silver", "수집 의뢰 300개", "quests", 300, "fish"],
    ["t_quest1k", "의뢰 해결사", "gold", "수집 의뢰 1,000개", "quests", 1000, "fish"],
    ["t_quest2500", "전설의 납품왕", "legend", "수집 의뢰 2,500개", "quests", 2500, "fish"],
    ["t_qking", "수집왕", "gold", "도장 교환소에서 수집가 유령 외형을 받으면", "qking", 1, "fish"],
    // 추천 코드: 데려온 이웃이 조건(3시간·3일)을 넘기면 한 명으로 센다 (lib/referralRules)
    ["t_ref3", "마을 안내인", "silver", "추천 코드로 데려온 이웃 3명이 마을에 자리 잡으면", "refs", 3, "town"],
    ["t_ref10", "마을의 마당발", "gold", "추천 코드로 데려온 이웃 10명이 마을에 자리 잡으면", "refs", 10, "town"],
    // 11/18 한정: 가입하고 14일 안에 새 이웃 꾸러미 7개를 모두 받으면 (lib/retain)
    ["t_grad", "마을 새내기 졸업", "bronze", "새 이웃 꾸러미 7개를 모두 받으면", "grad", 7, "town"],
];
const STEP_OF = new Map(STEP_ROWS.map((r) => [r[0], r]));

/** 11/15 신화 (서버에 한 사람). transient = 지금 주인일 때만 */
const MYTHIC_ROWS: readonly (readonly [TitleId, string, string, boolean])[] = [
  ["t_first30", "최초 결재자", "서버에서 가장 먼저 야근 빌딩 30층을 깬 한 사람 (영원히)", false],
  ["t_first50", "최초 임원", "서버에서 가장 먼저 야근 빌딩 50층을 깬 한 사람 (영원히)", false],
  ["t_first100", "빌딩의 전설", "서버에서 가장 먼저 야근 빌딩 100층을 깬 한 사람 (영원히)", false],
  ["t_firstStar100", "첫 번째 상무", "서버에서 가장 먼저 초월 레벨 ★100에 오른 한 사람 (영원히)", false],
  ["t_topFloor", "최고층 기록 보유자", "지금 야근 빌딩 최고 층 기록을 가진 한 사람 (기록을 뺏기면 넘어가요)", true],
  ["t_weekFloor", "지난주 최고층", "지난주 야근 빌딩 주간 최고 층 1위 (이번 주 한 주 동안)", true],
  ["t_firstEnh15", "강화의 시작", "서버에서 가장 먼저 장비를 +15까지 강화한 한 사람 (영원히)", false],
];
const MYTHIC_OF = new Map(MYTHIC_ROWS.map((r) => [r[0], r]));

/**
 * 11/16 매니저 전용 칭호 (관리자가 임명한 계정만 달 수 있다 — 해제하면 끼고 있던 것도 빠진다). 운영자 칭호처럼 농담 섞인 이름:
 * 후보 「무급 마을 반장」 · 「운영자 대리」 · 「야근 자원봉사단장」 중 무보수로 마을을 돌보는 느낌이 가장 잘 사는 것으로
 */
export const MANAGER_TITLE = { name: "무급 마을 반장", how: "관리자가 임명한 매니저만 달 수 있어요. 칭호 능력은 없어요." } as const;

/** 11/15 긴급 의뢰 칭호 (받은 때부터 하루만 — lib/forage/quests/urgent) */
const TIMED_ROWS: readonly (readonly [TitleId, string, TitleGrade, string])[] = [
  ["t_urgKing", "긴급 배달왕", "gold", "긴급 의뢰를 150%까지 채운 판에서 가장 많이 낸 사람 (받은 때부터 하루)"],
  ["t_urgLast", "아슬아슬 마감", "silver", "긴급 의뢰 마지막 1분에 100%를 채우거나, 150%를 채워 일찍 끝낸 사람 (받은 때부터 하루)"],
];
const TIMED_OF = new Map(TIMED_ROWS.map((r) => [r[0], r]));

function def(id: TitleId): TitleDef {
  const dex = DEX_OF[id];
  if (dex) {
    const [cat, tier, grade] = dex;
    const need = dexTitleNeed(cat, tier);
    return { id, name: DEX_TITLES[cat][tier] ?? id, group: "dex", grade, how: `${DEX_CAT_LABEL[cat]} 도감을 ${tier === 100 ? "전부" : "절반"}(${need}종) 등록하면`, metric: `dex_${cat}`, need };
  }
  const board = CHAMP_OF[id];
  if (board) return { id, name: CHAMP_TITLE[board], group: "champ", grade: "gold", how: `주간 ${CHAMP_HOW[board]} 랭킹에서 한 번이라도 1위를 하면`, board };
  const house = HOUSE_OF[id];
  if (house) {
    const [min, grade] = house;
    return { id, name: HOUSE_TITLES.find((t) => t.min === min)?.name ?? id, group: "house", grade, how: `내 집 꾸밈 점수가 ${min}점 이상이면`, metric: "house", need: min };
  }
  const r = STEP_OF.get(id);
  if (r) return { id, name: r[1], group: r[6], grade: r[2], how: r[3], metric: r[4], need: r[5] };
  const my = MYTHIC_OF.get(id);
  if (my) return { id, name: my[1], group: "hunt", grade: "mythic", how: my[2], holder: true, ...(my[3] ? { transient: true as const } : {}) };
  if (id === MANAGER_TITLE_ID) return { id, name: MANAGER_TITLE.name, group: "life", grade: "manager", how: MANAGER_TITLE.how, transient: true, manager: true };
  const tm = TIMED_OF.get(id);
  if (tm) return { id, name: tm[1], group: "fish", grade: tm[2], how: tm[3], transient: true, timed: true };
  return { id, name: id, group: "dex", grade: "bronze", how: "" };
}

/** 모든 칭호 (TITLE_IDS 순서) */
export const TITLES: readonly TitleDef[] = TITLE_IDS.map(def);
const byId = new Map(TITLES.map((t) => [t.id, t]));

export function titleDef(id: string | null | undefined): TitleDef | null {
  return (isTitleId(id) && byId.get(id)) || null;
}

/** 머리 위·화면에 쓰는 칭호 글자 「…」 (모르는 id면 null) */
export function titleLabel(id: string | null | undefined): string | null {
  const t = titleDef(id);
  return t ? `「${t.name}」` : null;
}

/**
 * 11/15 운영자 전용 칭호 「서버비 내는 사람」 (등급 "신화" — 전설 위). 착용 목록(TITLE_IDS)에 없는 표시 전용 칭호:
 * 실시간 서버·/api/me가 알린 운영자 표시(Vercel 서명)일 때만 머리 위에 저절로 뜨고, 낀 칭호가 있어도 그 자리를 이 칭호가 대신한다.
 * 일반 계정은 달 수도, 착용 목록으로 흉내 낼 수도 없다 (가방 칭호 칸에도 운영자에게만 보인다). 칭호 능력은 없다 (낀 칭호의 능력은 그대로)
 */
/** 11/15: 이름은 정직한 "운영자" 대신 운영자다운 농담으로 (저승사자 차림과 같이 보면 누군지 안다) */
export const STAFF_TITLE = { name: "서버비 내는 사람", gradeName: "신화", how: "운영자 계정에만 보여요. 칭호 능력은 없어요." } as const;

/**
 * 머리 위에 띄울 칭호: 운영자 표시(서명된 staff)면 낀 칭호와 상관없이 운영자 전용 "staff", 아니면 낀 칭호 (없거나 모르는 id면 null).
 * 운영자 전용 칭호는 착용 목록 id가 아니라서 일반 계정은 어떤 착용 목록으로도 띄울 수 없다
 */
/** 11/16 매니저 전용 칭호는 매니저 표시(서명된 mgr)가 있을 때만 (해제된 뒤 남은 착용 목록으로는 뜨지 않는다) */
export function headTitle(wornId: string | null | undefined, staff: boolean, mgr = false): TitleDef | "staff" | null {
  if (staff) return "staff";
  const t = titleDef(wornId);
  return t?.manager && !mgr ? null : t;
}

/** 착용 목록의 칭호 정의 */
export const titleOfLookDef = (look: readonly string[] | null | undefined): TitleDef | null => titleDef(titleOfLook(look));

/** 칭호 능력 (모르는 칭호·칭호 없음이면 능력 없음) */
export function titlePerk(id: string | null | undefined): TitlePerk {
  const t = titleDef(id);
  return t ? perkOf(TITLE_PERK_GROUP[t.id], t.grade) : NO_PERK;
}

/** 11/16 내 정보(me.equipped)에서 단 칭호의 능력 (화면 표시용 — 서버는 lib/titlesServer wornPerk로 같은 값을 쓴다) */
export const equippedPerk = (equipped: readonly { itemId: string }[] | null | undefined): TitlePerk => titlePerk(titleOfLook(equipped?.map((e) => e.itemId)));

const pct = (x: number) => Math.round(x * 100);

/** 11/16 갈래 능력 한 마디 [긴 것(문장) · 짧은 것(가방 칭호 카드)] — 숫자만 봐도 뭔지 알게 쉬운 말로 */
function groupText(p: TitlePerk): [string, string] | null {
  switch (p.group) {
    case "hunt":
      return [`사냥에서 경험치를 ${pct(p.huntExp)}% 더 받아요.`, `사냥 경험치 +${pct(p.huntExp)}%`];
    case "tower":
      return [`야근 빌딩에서 층마다 제한 시간이 ${p.towerSec}초 늘어나요.`, `야근 빌딩 층마다 ${p.towerSec}초 더`];
    case "fish":
      return [`직접 낚시할 때 큰 물고기가 ${pct(p.bigFish)}% 더 잘 걸려요.`, `큰 물고기 확률 +${pct(p.bigFish)}%`];
    case "forage":
      return [`채집할 때 희귀한 게 ${pct(p.rareGather)}% 더 잘 나와요.`, `희귀 채집 확률 +${pct(p.rareGather)}%`];
    case "stay":
      return [`접속 시간 보너스를 ${pct(p.stayBonus)}% 더 받아요.`, `접속 보너스 +${pct(p.stayBonus)}%`];
    case "look":
      return [`상점 물건과 염색권을 ${pct(p.discount)}% 싸게 사요.`, `상점 ${pct(p.discount)}% 할인`];
    case "quest":
      return [`의뢰를 끝낼 때 ${pct(p.questStamp)}% 확률로 도장을 하나 더 받아요.`, `${pct(p.questStamp)}% 확률로 도장 +1`];
    case "dex":
      return [`도감을 새로 채울 때 포인트를 ${pct(p.dexBonus)}% 더 받아요.`, `도감 포인트 +${pct(p.dexBonus)}%`];
    case "house":
      return [`가구를 ${pct(p.houseDiscount)}% 싸게 사요.`, `가구 ${pct(p.houseDiscount)}% 할인`];
    case "champ":
      // 11/16 발 칸 꾸미기(발자국 아이템)를 끼면 그 발자국이 먼저 보이고 별가루는 쉰다 (AvatarView setTitle)
      return ["걸으면 발밑에 반짝이는 별가루가 남아요. 발자국 아이템을 끼면 그 아이템이 먼저 보여요.", "걸으면 별가루"];
    default:
      return null;
  }
}

/** 11/17 칭호 능력 문장들 [이동 속도, 갈래 능력] (없는 칸은 빠진다) — 내 정보 [혜택] 탭이 한 줄씩 보여 준다 */
export function perkLines(t: Pick<TitleDef, "id"> | null | undefined): string[] {
  const p = titlePerk(t?.id);
  const parts: string[] = [];
  if (p.speed > 1) parts.push(`마을에서 ${pct(p.speed - 1)}% 더 빨리 걸어요.`);
  const g = groupText(p);
  if (g) parts.push(g[0]);
  return parts;
}

/** 칭호 능력 문장 ("마을에서 3% 더 빨리 걸어요. 큰 물고기가 …", 없으면 "") */
export const perkText = (t: Pick<TitleDef, "id"> | null | undefined): string => perkLines(t).join(" ");

/** 칭호 능력 짧게 ("이동 +3% · 큰 물고기 확률 +6%", 없으면 "") — 가방 칭호 카드 */
export function perkShort(t: Pick<TitleDef, "id"> | null | undefined): string {
  const p = titlePerk(t?.id);
  const parts: string[] = [];
  if (p.speed > 1) parts.push(`이동 +${pct(p.speed - 1)}%`);
  const g = groupText(p);
  if (g) parts.push(g[1]);
  return parts.join(" · ");
}

/** 할인가: 원가 × (1 − 할인율)을 1P 단위로 내림, 할인이 있으면 최소 1P는 깎는다 (값이 0이면 그대로) */
export function discountedPrice(price: number, discount: number): number {
  if (price <= 0 || discount <= 0) return price;
  return Math.max(0, Math.min(price - 1, Math.floor(price * (1 - discount))));
}

/** 개척자 칭호 카드 한 줄 ("#3 · 2026.11.20 달성"). 번호가 없으면 "" */
export function pioneerText(n: number | undefined, at: number | undefined): string {
  if (!n) return "";
  if (!at) return `#${n}`;
  const d = new Date(at + 9 * 3_600_000);
  return `#${n} · ${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()} 달성`;
}

/** 진행 표시 ("1,234 / 5,000", 접속 시간은 "12시간 / 50시간", 큰 물고기는 cm) */
export function progressText(t: TitleDef, value: number): string {
  if (!t.metric || t.need === undefined) return "";
  const v = Math.min(value, t.need);
  if (t.metric === "stay") return `${Math.floor(hours(value))}시간 / ${hours(t.need)}시간`;
  if (t.metric === "big") return `${(value / 10).toFixed(1)}cm / ${t.need / 10}cm`;
  if (t.metric === "hard" || t.metric === "hell") return value > 0 ? "완주" : "아직";
  if (t.metric === "tlv") return `${value > 0 ? `★${50 + Math.min(value, t.need)}` : "초월 전"} / ★${50 + t.need}`;
  if (t.metric === "floor") return `${Math.min(value, t.need)}층 / ${t.need}층`;
  if (t.metric === "pioneer") return value > 0 ? `#${value}` : "아직";
  if (t.metric === "qking") return value > 0 ? "받음" : "아직";
  if (t.metric === "sgOvertime" || t.metric === "sgApproval" || t.metric === "sgMeeting" || t.metric === "sgTrip") return value > 0 ? "완성" : "아직";
  if (t.metric === "enh") return `+${Math.min(value, t.need)} / +${t.need}`;
  if (t.metric === "refs") return `${v}명 / ${t.need}명`;
  return `${v.toLocaleString("ko-KR")} / ${t.need.toLocaleString("ko-KR")}`;
}

// ── 얻었는지 (순수: 서버가 읽은 값으로) ──

export type TitleFacts = {
  /** 도감으로 받은 칭호 이름들 (lib/forage/dexReward titlesOf) */
  dexTitleNames: readonly string[];
  /** 주간 1위를 한 적 있는 랭킹 (명예의 전당 + 지금 1위) */
  champBoards: readonly ChampBoard[];
  /** 진행 수치 (TitleMetric → 값). 없는 값은 0 */
  metrics: Partial<Record<TitleMetric, number>>;
  /** 11/15 지금 주인인 신화 칭호 (서버 최초·꼭대기 층 주인·이번 주 최고층) */
  mythic?: readonly string[];
  /** 11/15 지금 기간 안인 긴급 의뢰 칭호 */
  timed?: readonly string[];
  /** 11/16 지금 매니저 (lib/managers) */
  manager?: boolean;
};

/** 얻은 칭호 id (지금 기록 기준 — 서버는 예전에 알린 칭호를 더해 "한 번 얻으면 남게" 한다) */
export function earnedTitleIds(f: TitleFacts): TitleId[] {
  return TITLES.filter((t) => {
    if (t.group === "dex") return f.dexTitleNames.includes(t.name);
    if (t.board) return f.champBoards.includes(t.board);
    if (t.holder) return !!f.mythic?.includes(t.id);
    if (t.manager) return !!f.manager;
    if (t.timed) return !!f.timed?.includes(t.id);
    return t.metric !== undefined && t.need !== undefined && (f.metrics[t.metric] ?? 0) >= t.need;
  }).map((t) => t.id);
}
