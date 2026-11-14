import { CHAMP_TITLE, isTitleId, TITLE_IDS, titleOfLook, type ChampBoard, type TitleId } from "@tomb/protocol";
import { DEX_CAT_LABEL, DEX_TITLES, dexTitleNeed, type DexCat, type DexTitleTier } from "./forage/catalog";
import { HOUSE_TITLES } from "./housing/catalog";

// 칭호 목록 (화면·게임·서버 공용 순수 정의). id는 @tomb/protocol TITLE_IDS (착용 목록에 실려 다른 사람에게도 보인다).
//  - 도감: 그 칸의 절반·전부를 등록 (lib/forage/catalog DEX_TITLES — 칭호는 한 번 붙으면 종이 늘어도 남는다)
//  - 주간 1위: 그 랭킹에서 한 번이라도 주간 1위 (명예의 전당 기록 또는 지금 1위)
//  - 집: 내 집 꾸밈 점수가 그 구간 이상 (lib/housing/catalog HOUSE_TITLES — 끼울 때 확인한다)
// 얻었는지는 서버(lib/titlesServer)가 판단하고, 착용도 얻은 칭호만 받는다.

export type TitleGroup = "dex" | "champ" | "house";
export const TITLE_GROUP_NAMES: Record<TitleGroup, string> = { dex: "도감", champ: "주간 1위", house: "내 집" };
export const TITLE_GROUPS: readonly TitleGroup[] = ["dex", "champ", "house"];

export type TitleDef = { id: TitleId; name: string; group: TitleGroup; how: string };

const DEX_OF: Record<string, [DexCat, DexTitleTier]> = {
  t_fish50: ["fish", 50],
  t_fish100: ["fish", 100],
  t_bug50: ["bug", 50],
  t_bug100: ["bug", 100],
  t_herb50: ["herb", 50],
  t_herb100: ["herb", 100],
  t_ore50: ["ore", 50],
  t_ore100: ["ore", 100],
  t_dig50: ["dig", 50],
  t_dig100: ["dig", 100],
  t_star50: ["star", 50],
  t_star100: ["star", 100],
};
const CHAMP_OF: Record<string, ChampBoard> = { t_champ_points: "points", t_champ_hunt: "huntKills", t_champ_fish: "fish" };
const CHAMP_HOW: Record<ChampBoard, string> = { points: "포인트", huntKills: "사냥 처치", fish: "낚시(가장 큰 물고기)" };
const HOUSE_OF: Record<string, number> = { t_house50: 50, t_house150: 150, t_house400: 400, t_house900: 900 };

function def(id: TitleId): TitleDef {
  const dex = DEX_OF[id];
  if (dex) {
    const [cat, tier] = dex;
    const name = DEX_TITLES[cat][tier] ?? id;
    const need = dexTitleNeed(cat, tier);
    return { id, name, group: "dex", how: `${DEX_CAT_LABEL[cat]} 도감을 ${tier === 100 ? "전부" : "절반"}(${need}종) 등록하면` };
  }
  const board = CHAMP_OF[id];
  if (board) return { id, name: CHAMP_TITLE[board], group: "champ", how: `주간 ${CHAMP_HOW[board]} 랭킹에서 한 번이라도 1위를 하면` };
  const min = HOUSE_OF[id] ?? 0;
  const name = HOUSE_TITLES.find((t) => t.min === min)?.name ?? id;
  return { id, name, group: "house", how: `내 집 꾸밈 점수가 ${min}점 이상이면` };
}

/** 모든 칭호 (TITLE_IDS 순서: 도감 칸 순·절반 → 전부, 주간 1위, 집 점수 낮은 순) */
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

// ── 얻었는지 (순수: 서버가 읽은 값으로) ──

export type TitleFacts = {
  /** 도감으로 받은 칭호 이름들 (lib/forage/dexReward titlesOf) */
  dexTitleNames: readonly string[];
  /** 주간 1위를 한 적 있는 랭킹 (명예의 전당 + 지금 1위) */
  champBoards: readonly ChampBoard[];
  /** 내 집 꾸밈 점수 (집이 없으면 null) */
  houseScore: number | null;
};

/** 얻은 칭호 id */
export function earnedTitleIds(f: TitleFacts): TitleId[] {
  return TITLES.filter((t) => {
    if (t.group === "dex") return f.dexTitleNames.includes(t.name);
    if (t.group === "champ") return f.champBoards.includes(CHAMP_OF[t.id]);
    return f.houseScore !== null && f.houseScore >= (HOUSE_OF[t.id] ?? Infinity);
  }).map((t) => t.id);
}
