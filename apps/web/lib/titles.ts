import { CHAMP_TITLE, isTitleId, TITLE_IDS, titleOfLook, type ChampBoard, type TitleId } from "@tomb/protocol";
import { DEX_CAT_LABEL, DEX_TITLES, dexTitleNeed, type DexCat, type DexTitleTier } from "./forage/catalog";
import { HOUSE_TITLES } from "./housing/catalog";

// 칭호 목록 (화면·게임·서버 공용 순수 정의). id는 @tomb/protocol TITLE_IDS (착용 목록에 실려 다른 사람에게도 보인다).
//  - 등급 4단계 (동 · 은 · 금 · 전설): 머리 위 칭호 모양(game/entities/TitleView)·가방 카드 색·칭호 능력이 등급을 따른다
//  - 얻는 방법: 도감 절반·전부 / 주간 1위 (랭킹별 · 누적 횟수) / 집 꾸밈 점수 / 사냥 레벨·누적 처치·어려운 사냥터 완주 /
//    낚시 누적·가장 큰 물고기 / 채집 누적 / 연속 출석 / 누적 접속 시간 / 꾸미기 점수
//  - 한 번 얻은 칭호는 기록이 내려가도(연속 출석이 끊기거나 집 점수·꾸미기 점수가 내려가도) 남는다 — 서버가 알린 칭호 기록을 함께 본다 (lib/titlesServer)
//  - 칭호 능력: 단 칭호 하나의 등급만큼 마을 이동 속도 + · 상점 구입 할인 (TITLE_PERKS)
// 얻었는지는 서버(lib/titlesServer)가 판단하고, 착용도 얻은 칭호만 받는다 (운영자 계정은 모두 얻은 것으로 본다).

export type TitleGrade = "bronze" | "silver" | "gold" | "legend";
export const TITLE_GRADES: readonly TitleGrade[] = ["bronze", "silver", "gold", "legend"];
export const TITLE_GRADE_NAMES: Record<TitleGrade, string> = { bronze: "동", silver: "은", gold: "금", legend: "전설" };

/**
 * 칭호 능력 (단 칭호 하나만): 등급이 높을수록 크다. 값은 여기 한 곳.
 *  - speed: 마을 걷기·달리기 속도 배율 (사냥터·놀이기구·배 등에는 없다). 전설 1.07 × 가장 빠른 타는 펫 1.35 = 1.44 → 실시간 서버 속도 검증(달리기 × 1.5) 안
 *  - discount: 상점 구입 할인율 (상점의 모든 물건·영구 소장. 집 가구·사냥 장비·물약은 해당 없음). 할인가 = 원가 × (1 − 할인율)을 1P 단위로 내림, 할인이 있으면 최소 1P는 깎인다
 */
export const TITLE_PERKS: Readonly<Record<TitleGrade, { speed: number; discount: number }>> = {
  bronze: { speed: 1, discount: 0 },
  silver: { speed: 1.02, discount: 0.02 },
  gold: { speed: 1.04, discount: 0.04 },
  legend: { speed: 1.07, discount: 0.07 },
};

export type TitleGroup = "dex" | "hunt" | "life" | "fish" | "look" | "champ" | "house";
export const TITLE_GROUP_NAMES: Record<TitleGroup, string> = {
  dex: "도감",
  hunt: "사냥",
  fish: "낚시·채집",
  life: "출석·접속",
  look: "꾸미기",
  champ: "주간 1위",
  house: "내 집",
};
export const TITLE_GROUPS: readonly TitleGroup[] = ["dex", "hunt", "fish", "life", "look", "champ", "house"];

/**
 * 진행 수치 (서버 lib/titlesServer가 센다). 단위: 레벨·마리·종·일·점, stay = 머문 기록 수(10분씩), big = 가장 큰 물고기 mm,
 * dex_{칸} = 그 도감 칸 등록 종 수, champ = 주간 1위 누적 횟수, hard·hell = 끝까지 깬 적 있음(1/0)
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
];
const STEP_OF = new Map(STEP_ROWS.map((r) => [r[0], r]));

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

/** 착용 목록의 칭호 정의 */
export const titleOfLookDef = (look: readonly string[] | null | undefined): TitleDef | null => titleDef(titleOfLook(look));

/** 칭호 능력 (모르는 칭호·칭호 없음이면 능력 없음) */
export function titlePerk(id: string | null | undefined): { speed: number; discount: number } {
  const t = titleDef(id);
  return t ? TITLE_PERKS[t.grade] : TITLE_PERKS.bronze;
}

/** 칭호 능력 한 줄 ("이동 속도 +4% · 상점 4% 할인", 없으면 "") */
export function perkText(grade: TitleGrade): string {
  const p = TITLE_PERKS[grade];
  const parts: string[] = [];
  if (p.speed > 1) parts.push(`마을 이동 속도 +${Math.round((p.speed - 1) * 100)}%`);
  if (p.discount > 0) parts.push(`상점 ${Math.round(p.discount * 100)}% 할인`);
  return parts.join(" · ");
}

/** 할인가: 원가 × (1 − 할인율)을 1P 단위로 내림, 할인이 있으면 최소 1P는 깎는다 (값이 0이면 그대로) */
export function discountedPrice(price: number, discount: number): number {
  if (price <= 0 || discount <= 0) return price;
  return Math.max(0, Math.min(price - 1, Math.floor(price * (1 - discount))));
}

/** 진행 표시 ("1,234 / 5,000", 접속 시간은 "12시간 / 50시간", 큰 물고기는 cm) */
export function progressText(t: TitleDef, value: number): string {
  if (!t.metric || t.need === undefined) return "";
  const v = Math.min(value, t.need);
  if (t.metric === "stay") return `${Math.floor(hours(value))}시간 / ${hours(t.need)}시간`;
  if (t.metric === "big") return `${(value / 10).toFixed(1)}cm / ${t.need / 10}cm`;
  if (t.metric === "hard" || t.metric === "hell") return value > 0 ? "완주" : "아직";
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
};

/** 얻은 칭호 id (지금 기록 기준 — 서버는 예전에 알린 칭호를 더해 "한 번 얻으면 남게" 한다) */
export function earnedTitleIds(f: TitleFacts): TitleId[] {
  return TITLES.filter((t) => {
    if (t.group === "dex") return f.dexTitleNames.includes(t.name);
    if (t.board) return f.champBoards.includes(t.board);
    return t.metric !== undefined && t.need !== undefined && (f.metrics[t.metric] ?? 0) >= t.need;
  }).map((t) => t.id);
}
