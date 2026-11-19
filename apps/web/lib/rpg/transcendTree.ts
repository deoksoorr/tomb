import { TRANSCEND_MAX } from "./endgame";
import type { IconArt } from "./catalog";

// 11/19 초월 수련: 초월 레벨마다 1포인트(★100에 50포인트), 한 페이지 — 손끝 단련(물공) · 공통 · 주문 다듬기(마공).
// 물공 = 기본 공격·일꾼 스킬, 마공 = 모닥불·서리·넋 스킬. 두 쪽이 깔끔하게 갈린다 (물공 보너스는 마공에 붙지 않고, 그 반대도 같다).
// 줄은 ★55·60·70·80·90에 하나씩 열린다. 랭크마다 1포인트 (스킬 트리처럼 비싸지지 않는다 — ★100이면 모두 채운다).
// 서버 검증(character.learnTranscend)·화면(TranscendPanel)·게임(HuntScene)이 같이 쓰는 순수 함수만.

export type TSide = "phys" | "common" | "magic";
export type TNodeId = "t_edge" | "t_wrist" | "t_vital" | "t_thousand" | "t_breath" | "t_bigprey" | "t_spell" | "t_short" | "t_fill" | "t_echo";

export type TNodeDef = {
  id: TNodeId;
  side: TSide;
  /** 줄 1~5 (TROW_TLEVEL 초월 레벨에 열린다) */
  row: number;
  name: string;
  maxLevel: number;
  describe: (lv: number) => string;
  art: IconArt;
};

/** 줄이 열리는 초월 레벨 t (표시 ★50+t): ★55·★60·★70·★80·★90 */
export const TROW_TLEVEL = [5, 10, 20, 30, 40] as const;
export const T_SIDE_NAME: Record<TSide, string> = { phys: "손끝 단련", common: "공통", magic: "주문 다듬기" };
export const T_SIDE_ROLE: Record<TSide, string> = { phys: "기본 공격·일꾼 스킬", common: "모두", magic: "모닥불·서리·넋 스킬" };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const PH = 0xc89a62;
const MG = 0xb98aff;
const CM = 0xe0c36a;

/** 랭크별 수치 */
export const T_FX = {
  t_edge: (lv: number) => ({ physPct: 0.02 * lv }),
  t_wrist: (lv: number) => ({ aspd: 0.01 * lv }),
  t_vital: (lv: number) => ({ crit: 1 * lv }),
  t_thousand: (lv: number) => ({ dbl: lv > 0 ? 0.1 : 0 }),
  t_breath: (lv: number) => ({ hpPct: 0.01 * lv }),
  t_bigprey: (lv: number) => ({ bossPct: 0.01 * lv }),
  t_spell: (lv: number) => ({ magicPct: 0.02 * lv }),
  t_short: (lv: number) => ({ cdCut: 0.01 * lv }),
  t_fill: (lv: number) => ({ spRegen: 0.03 * lv }),
  t_echo: (lv: number) => ({ echo: lv > 0 ? 0.1 : 0, echoMult: 0.5 }),
} as const;
const FX = T_FX;

export const T_NODES: readonly TNodeDef[] = [
  { id: "t_edge", side: "phys", row: 1, name: "무뎌지지 않는 날", maxLevel: 10, describe: (lv) => `기본 공격과 일꾼 스킬 피해가 ${pct(FX.t_edge(lv).physPct)} 올라요.`, art: { shape: "sk_wk_deep", main: PH, accent: 0xf2e2c0 } },
  { id: "t_breath", side: "common", row: 1, name: "초월의 숨", maxLevel: 5, describe: (lv) => `최대 HP가 ${pct(FX.t_breath(lv).hpPct)} 올라요.`, art: { shape: "sk_heart", main: CM, accent: 0xfff3c8 } },
  { id: "t_spell", side: "magic", row: 1, name: "깊어진 주문", maxLevel: 10, describe: (lv) => `모닥불·서리·넋 스킬 피해가 ${pct(FX.t_spell(lv).magicPct)} 올라요.`, art: { shape: "sk_starlight", main: MG, accent: 0xf2ecff } },
  { id: "t_wrist", side: "phys", row: 2, name: "빠른 손목", maxLevel: 5, describe: (lv) => `공격 속도가 ${pct(FX.t_wrist(lv).aspd)} 빨라져요.`, art: { shape: "sk_wk_grip", main: PH, accent: 0x5a4636 } },
  { id: "t_short", side: "magic", row: 2, name: "짧아진 숨", maxLevel: 5, describe: (lv) => `모닥불·서리·넋 스킬 쿨타임이 ${pct(FX.t_short(lv).cdCut)} 줄어요.`, art: { shape: "sk_moonfrost", main: MG, accent: 0x4a2a8a } },
  { id: "t_vital", side: "phys", row: 3, name: "급소 찌르기", maxLevel: 5, describe: (lv) => `기본 공격과 일꾼 스킬의 치명타 확률이 ${FX.t_vital(lv).crit}% 올라요.`, art: { shape: "sk_sparks", main: PH, accent: 0xfff3c8 } },
  { id: "t_fill", side: "magic", row: 3, name: "차오르는 기운", maxLevel: 5, describe: (lv) => `SP가 ${pct(FX.t_fill(lv).spRegen)} 빨리 차요.`, art: { shape: "sk_wisp", main: MG, accent: 0x9ff0dc } },
  { id: "t_bigprey", side: "common", row: 4, name: "큰 놈 사냥", maxLevel: 3, describe: (lv) => `우두머리에게 주는 피해가 ${pct(FX.t_bigprey(lv).bossPct)} 올라요.`, art: { shape: "sk_meteor", main: CM, accent: 0xff7a2e } },
  { id: "t_thousand", side: "phys", row: 5, name: "천 번째 삽질", maxLevel: 1, describe: () => `기본 공격이 ${pct(FX.t_thousand(1).dbl)} 확률로 두 번 맞아요.`, art: { shape: "sk_wk_allnight", main: PH, accent: 0xfff3c8 } },
  { id: "t_echo", side: "magic", row: 5, name: "메아리 주문", maxLevel: 1, describe: () => `모닥불·서리·넋 스킬이 ${pct(FX.t_echo(1).echo)} 확률로 한 번 더 나가요 (${pct(FX.t_echo(1).echoMult)} 세기).`, art: { shape: "sk_bond", main: MG, accent: 0xf2ecff } },
];

export type TAlloc = Partial<Record<TNodeId, number>>;
export const tNodeById = (id: string): TNodeDef | undefined => T_NODES.find((n) => n.id === id);
export const T_NODE_IDS = T_NODES.map((n) => n.id) as [TNodeId, ...TNodeId[]];
/** 모두 채우는 데 드는 포인트 (= 초월 최대 레벨) */
export const T_ALL_POINTS = T_NODES.reduce((a, n) => a + n.maxLevel, 0);
/** 초월 레벨 t까지 받은 포인트 */
export const tPointsEarned = (t: number) => Math.max(0, Math.min(TRANSCEND_MAX, Math.floor(t)));
export const tSpent = (a: TAlloc) => Object.values(a).reduce<number>((x, n) => x + (n ?? 0), 0);
export const tRowOpen = (t: number, row: number) => t >= TROW_TLEVEL[Math.max(1, Math.min(TROW_TLEVEL.length, row)) - 1];
/** 줄이 열리는 ★표시 */
export const tRowStar = (row: number) => 50 + TROW_TLEVEL[Math.max(1, Math.min(TROW_TLEVEL.length, row)) - 1];

export type TRuleError = { status: number; code: string; message: string };
const err = (status: number, code: string, message: string): TRuleError => ({ status, code, message });

/** 지금 배분에서 id를 1랭크 올릴 수 있나 (초월 레벨 t, 예산 budget = 받은 포인트) */
export function checkTLearn(a: TAlloc, id: string, t: number, budget = tPointsEarned(t)): TRuleError | null {
  const def = tNodeById(id);
  if (!def) return err(400, "INVALID_INPUT", "없는 수련이에요.");
  const cur = a[def.id] ?? 0;
  if (cur >= def.maxLevel) return err(409, "SKILL_MAX", "이미 다 채웠어요.");
  if (!tRowOpen(t, def.row)) return err(409, "TIER_LOCKED", `★${tRowStar(def.row)}부터 열려요.`);
  if (tSpent(a) + 1 > budget) return err(409, "NO_SKILL_POINTS", "초월 수련 포인트가 모자라요. 초월 레벨이 오르면 1포인트씩 받아요.");
  return null;
}

/** 배분 전체 검사 (모르는 칸·랭크 범위·줄·포인트 합). 맞으면 null */
export function checkTAllocation(a: Record<string, unknown>, t: number, budget = tPointsEarned(t)): TRuleError | null {
  for (const [id, n] of Object.entries(a)) {
    const def = tNodeById(id);
    if (!def) return err(400, "INVALID_INPUT", `없는 수련이 들어 있어요 (${id}).`);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > def.maxLevel) return err(400, "INVALID_INPUT", `${def.name} 랭크가 맞지 않아요.`);
    if (n > 0 && !tRowOpen(t, def.row)) return err(409, "TIER_LOCKED", `${def.name}은 ★${tRowStar(def.row)}부터 찍을 수 있어요.`);
  }
  if (tSpent(a as TAlloc) > budget) return err(409, "NO_SKILL_POINTS", "쓴 초월 수련 포인트가 가진 것보다 많아요.");
  return null;
}

/** 0랭크를 뺀 깨끗한 배분 */
export function cleanTAlloc(a: TAlloc): TAlloc {
  const out: TAlloc = {};
  for (const n of T_NODES) if ((a[n.id] ?? 0) > 0) out[n.id] = a[n.id];
  return out;
}

/** 게임이 판 시작 때 한 번 더하는 초월 수련 보정 */
export type TMods = { physPct: number; aspd: number; physCrit: number; dbl: number; hpPct: number; bossPct: number; magicPct: number; cdCut: number; spRegen: number; echo: number; echoMult: number };
export const NO_TMODS: TMods = { physPct: 0, aspd: 0, physCrit: 0, dbl: 0, hpPct: 0, bossPct: 0, magicPct: 0, cdCut: 0, spRegen: 0, echo: 0, echoMult: 0.5 };
export function tMods(a: TAlloc | undefined): TMods {
  const lv = (id: TNodeId) => a?.[id] ?? 0;
  return {
    physPct: FX.t_edge(lv("t_edge")).physPct,
    aspd: FX.t_wrist(lv("t_wrist")).aspd,
    physCrit: FX.t_vital(lv("t_vital")).crit,
    dbl: FX.t_thousand(lv("t_thousand")).dbl,
    hpPct: FX.t_breath(lv("t_breath")).hpPct,
    bossPct: FX.t_bigprey(lv("t_bigprey")).bossPct,
    magicPct: FX.t_spell(lv("t_spell")).magicPct,
    cdCut: FX.t_short(lv("t_short")).cdCut,
    spRegen: FX.t_fill(lv("t_fill")).spRegen,
    echo: FX.t_echo(lv("t_echo")).echo,
    echoMult: FX.t_echo(1).echoMult,
  };
}
