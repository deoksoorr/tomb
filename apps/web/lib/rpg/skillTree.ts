// 사냥 스킬 트리 (저장 형식 3): 갈래 4개 × 단 5개. 아늑한 공동묘지 마을의 세 가지 밤 — 모닥불·서리·넋 — 과 삽 한 자루.
//  - 모닥불지기: 불씨와 장작으로 넓게 태운다 (화염·광역, 마공)
//  - 서리 묘지기: 새벽 서리로 묶고 버틴다 (제어·방어, 마공)
//  - 넋 인도자: 길 잃은 넋과 등불로 거두고 부르고 돕는다 (흡수·소환·보조, 마공)
//  - 11/19 삽자루 일꾼: 삽 한 자루로 뛰어들어 몸으로 친다 (근접·기본 공격·보스, 물공)
// 각 스킬: 선행 스킬(필요 랭크), 단(아래 단에 쓴 포인트로 열림), 최대 랭크, 랭크별 수치(SKILL_FX), 액티브/패시브.
// 11/19 랭크 비용: 1·1·2·2·3 (skillRules.rankCost) — 1~2랭크는 싸고 만렙은 비싸다.
// 11/19 마공·물공: 모닥불·서리·넋 스킬 = 마공(지능 skillPower를 받는다), 일꾼 스킬·기본 공격 = 물공(지능을 받지 않는다).
//  모닥불 패시브(공격력·치명타·장작 더 넣기)는 마공에만, 일꾼 패시브(굳은살·깊게 파기·뚝심)는 물공에만 붙는다.
// 게임(효과)과 UI(설명)·서버(검증, skillRules.ts)가 같이 쓴다. 이 파일은 catalog.ts의 타입만 가져온다 (순환 없음).
import type { IconArt } from "./catalog";

export const BRANCHES = ["ember", "frost", "soul", "worker"] as const;
export type BranchId = (typeof BRANCHES)[number];

export type BranchInfo = {
  name: string;
  /** 11/19 피해 갈래: 마공(지능을 받는다) · 물공(기본 공격과 같은 몸 피해) */
  dmg: "magic" | "phys";
  /** 한 줄 성격 */
  role: string;
  desc: string;
  /** 갈래 색 (게임 이펙트·UI) */
  color: number;
  light: number;
  dark: number;
};

export const BRANCH_INFO: Record<BranchId, BranchInfo> = {
  ember: {
    name: "모닥불지기",
    dmg: "magic",
    role: "화염 · 광역",
    desc: "마을 모닥불을 지키던 사람들이에요. 불씨를 튕기고 장작을 던져 둘레 적을 한꺼번에 태워요. 넓게 태우는 불이라 우두머리에게는 덜 아파요.",
    color: 0xff7a2e,
    light: 0xffd27a,
    dark: 0xa82a14,
  },
  frost: {
    name: "서리 묘지기",
    dmg: "magic",
    role: "제어 · 방어",
    desc: "새벽마다 서리를 쓸던 묘지기예요. 적을 얼려 묶고, 서리 방패로 버텨요.",
    color: 0x8fd8ff,
    light: 0xf2fbff,
    dark: 0x2a6aa8,
  },
  soul: {
    name: "넋 인도자",
    dmg: "magic",
    role: "흡수 · 소환 · 보조",
    desc: "길 잃은 넋에게 등불을 비춰 주던 사람이에요. 넋을 거둬 힘을 얻고, 길동무를 불러 함께 싸워요.",
    color: 0xb98aff,
    light: 0x9ff0dc,
    dark: 0x4a2a8a,
  },
  worker: {
    name: "삽자루 일꾼",
    dmg: "phys",
    role: "근접 · 기본 공격 · 보스",
    desc: "밤새 봉분을 다지던 일꾼이에요. 삽 한 자루로 적 한가운데 뛰어들어 몸으로 쳐요. 지능 대신 공격력만 받아요.",
    color: 0xb07a46,
    light: 0xe8d2a8,
    dark: 0x5a4636,
  },
};
/** 11/19 마공 갈래 (지능·마공 패시브·주문 다듬기를 받는다) */
export const isMagicBranch = (b: BranchId | undefined): boolean => !!b && BRANCH_INFO[b].dmg === "magic";

/** 단(1~5)이 열리는 조건: 그 갈래의 아래 단들에 쓴 포인트 */
/** 11/19 v4: 랭크마다 1포인트·최대 랭크 2배 → 단 열림도 그만큼 (5·12·20·30) */
export const TIER_GATES = [0, 5, 12, 20, 30] as const;
export const TIERS = 5;

export type SkillId =
  // 모닥불지기
  | "em_kindle"
  | "em_hearth"
  | "em_fan"
  | "em_stoke"
  | "em_spark"
  | "em_ring"
  | "em_ignite"
  | "em_meteor"
  | "em_brazier"
  | "em_bonfire"
  | "em_ashheart"
  // 서리 묘지기
  | "fr_breath"
  | "fr_collar"
  | "fr_icicle"
  | "fr_brittle"
  | "fr_ward"
  | "fr_nova"
  | "fr_mist"
  | "fr_tomb"
  | "fr_field"
  | "fr_blizzard"
  | "fr_solstice"
  // 넋 인도자
  | "so_wisp"
  | "so_lamp"
  | "so_drain"
  | "so_swift"
  | "so_friend"
  | "so_chain"
  | "so_veil"
  | "so_harvest"
  | "so_lantern"
  | "so_procession"
  | "so_kinship"
  // 삽자루 일꾼 (11/19)
  | "wk_charge"
  | "wk_callus"
  | "wk_combo"
  | "wk_grip"
  | "wk_back"
  | "wk_leap"
  | "wk_tireless"
  | "wk_whirl"
  | "wk_deep"
  | "wk_allnight"
  | "wk_grit";

export type SkillKind = "active" | "passive";

export type SkillDef = {
  id: SkillId;
  branch: BranchId;
  /** 단 1~5 */
  tier: number;
  /** 트리 창의 칸 (0 왼쪽 · 1 가운데 · 2 오른쪽) */
  col: 0 | 1 | 2;
  name: string;
  /** 한 단어 효과 */
  tag: string;
  kind: SkillKind;
  /** 최대 랭크 */
  maxLevel: number;
  /** 선행 스킬 (필요 랭크) */
  requires?: { id: SkillId; level: number }[];
  /** 광역기 (재의 심장 패시브·화려한 연출 대상) */
  aoe?: boolean;
  sp: (lv: number) => number;
  cooldownMs: (lv: number) => number;
  /** 랭크별 효과 설명 */
  describe: (lv: number) => string;
  art: IconArt;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const sec = (ms: number) => `${Math.round(ms / 100) / 10}초`;

/** 스킬 수치 (랭크 lv). 게임(효과)과 UI(설명)·테스트(밸런스)가 같이 쓴다 */
// 11/15 스킬 피해 손질: 한 번이 평타 한 방보다 확실히 세게 (단일기·한 점 폭발은 평타의 3~5배, 넓은 광역은 그대로 마리당 3~4배).
// 단일기·약하던 것(불씨·입김·고드름·안개·서리밭·도깨비불·사슬·별똥·무덤·궁극기)만 올리고 SP 회복도 조금 (lib/rpg/formulas huntSpRegen)
/** v3 기준 수치 (최대 랭크 5·4·3). 아래 SKILL_FX가 새 최대 랭크(10·8·5)에 맞게 늘려 쓴다 */
const SKILL_FX_V3 = {
  // ── 모닥불지기 ──
  // 11/19 v4: 12랭크까지 올라가서 예전 수치 그대로 (모닥불 보스 딜은 하위권)
  em_kindle: (lv: number) => ({ mult: 1.8 + 0.3 * lv, blast: 18, reach: 110 }),
  em_hearth: (lv: number) => ({ atkPct: 0.02 * lv }),
  // 11/19 v2 모닥불 = 광역 정리 1위: 광역기 피해·범위를 올렸다 (보스 딜은 하위권 그대로)
  em_fan: (lv: number) => ({ mult: 2.0 + 0.3 * lv, range: 62, arcDeg: 110 }),
  em_stoke: (lv: number) => ({ atk: 0.06 + 0.05 * lv, durMs: 8000 }),
  em_spark: (lv: number) => ({ crit: 3 * lv }),
  em_ring: (lv: number) => ({ mult: 2.4 + 0.4 * lv, radius: 70 }),
  em_ignite: (lv: number) => ({ chance: 0.06 * lv, mult: 0.9, radius: 26 }),
  em_meteor: (lv: number) => ({ mult: 4.2 + 0.7 * lv, radius: 72, delayMs: 800, reach: 130 }),
  em_brazier: (lv: number) => ({ durMs: 6000 + 500 * lv, everyMs: 900, radius: 48, mult: 0.55 + 0.1 * lv }),
  // 궁극기 3종: 지금 화면(카메라에 보이는 곳) 안의 적 모두를 친다. hitAt = 시전부터 ms (연출 박자에 맞춘 다단히트), castMs = 연출 길이
  em_bonfire: (lv: number) => ({ screen: true, hitAt: [820, 1000, 1180, 1360, 1620] as const, castMs: 2300, mult: 1.6 + 0.25 * lv }),
  em_ashheart: (lv: number) => ({ aoePct: 0.12 * lv }),
  // ── 서리 묘지기 ──
  fr_breath: (lv: number) => ({ mult: 1.3 + 0.2 * lv, range: 46, arcDeg: 80, slowMs: 3000 }),
  // 11/19 서리 = 제어·생존: 갈래 넷 중 가장 덜 다치게 (방어 2→3/랭크, 방패 12%+5% → 15%+6%)
  fr_collar: (lv: number) => ({ def: 5 * lv, hpPct: 0.05 * lv }),
  // 11/19 실제 게임 재현(101층부터, 움직이며 싸우기): 서리 두 빌드만 딜이 모자라 114층 시간 초과로 막혀 고드름·눈보라를 25% 올렸다
  fr_icicle: (lv: number) => ({ n: Math.min(8, 3 + lv), mult: 1.0 + 0.175 * lv, range: 120, pierce: 1 }),
  fr_brittle: (lv: number) => ({ vsSlowed: 0.05 * lv }),
  fr_ward: (lv: number) => ({ shieldPct: 0.15 + 0.06 * lv, durMs: 10_000 }),
  fr_nova: (lv: number) => ({ mult: 1.3 + 0.22 * lv, radius: 62, freezeMs: 500 + 120 * lv }),
  fr_mist: (lv: number) => ({ dist: 64 + 8 * lv, mult: 1.1 + 0.24 * lv, width: 16, slowMs: 2500 }),
  fr_tomb: (lv: number) => ({ mult: 2.5 + 0.4 * lv, radius: 50, delayMs: 600, stunMs: 1200, vuln: 0.15, vulnMs: 4000, reach: 130 }),
  fr_field: (lv: number) => ({ radius: 80, durMs: 6000, everyMs: 1000, mult: 0.35 + 0.07 * lv, vuln: 0.05 * lv }),
  fr_blizzard: (lv: number) => ({ screen: true, hitAt: [700, 940, 1180, 1420, 1660, 1960] as const, castMs: 2400, mult: 0.55 + 0.075 * lv, slowMs: 3000 }),
  // 11/19 v2 서리 = 생존 1위: 받는 피해 감소 3 → 7%/랭크 (쿨감은 마공 스킬만)
  fr_solstice: (lv: number) => ({ cdCut: 0.04 * lv, guard: 0.07 * lv }),
  // ── 넋 인도자 ──
  so_wisp: (lv: number) => ({ n: lv >= 4 ? 3 : 2, mult: 0.9 + 0.14 * lv, range: 130 }),
  so_lamp: (lv: number) => ({ healPct: 0.1 + 0.04 * lv, rootMs: 500 }),
  so_drain: (lv: number) => ({ steal: 0.01 * lv }),
  so_swift: (lv: number) => ({ move: 0.15 + 0.05 * lv, aspd: 0.08 + 0.04 * lv, durMs: 8000 }),
  // 11/19 v4 넋 = 소환·흡수 지속형: 소환은 12랭크까지 올라가서 수치는 그대로 두고 넋의 인연만 0.2/랭크
  so_friend: (lv: number) => ({ durMs: 10_000 + 2000 * lv, atkPct: 0.35 + 0.1 * lv, everyMs: 800 }),
  so_chain: (lv: number) => ({ radius: 96, stunMs: 500 + 120 * lv, vuln: 0.05 * lv, vulnMs: 3000, mult: 0.9 + 0.16 * lv }),
  so_veil: (lv: number) => ({ dist: 72, safeMs: 800 + 300 * lv }),
  // 11/19 v2 넋 = 지속 사냥: 넋 소용돌이 피해·범위를 올려 무리 정리를 중간으로
  so_harvest: (lv: number) => ({ radius: 62, ticks: 3, gapMs: 400, mult: 1.1 + 0.2 * lv, healPerHit: 0.015, healCap: 0.08, reach: 130 }),
  so_lantern: (lv: number) => ({ durMs: 8000 + 1500 * lv, atkPct: 0.4 + 0.1 * lv, everyMs: 700, range: 110 }),
  so_procession: (lv: number) => ({ screen: true, hitAt: [900, 1100, 1300, 1500, 1760] as const, castMs: 2300, mult: 0.55 + 0.1 * lv, healPct: 0.1 + 0.05 * lv }),
  so_kinship: (lv: number) => ({ summonPct: 0.2 * lv, durPct: 0.1 * lv }),
  // ── 삽자루 일꾼 (11/19, 물공: 공격력만 받는다 — scratchpad 시뮬 최종표) ──
  // 11/19 v2: 일꾼은 뛰어드는 만큼 확실히 더 다친다 — 돌진·도약 무적을 없앴다 (궁극기만 돌진 순간 짧게)
  wk_charge: (lv: number) => ({ mult: 1.6 + 0.2 * lv, dist: 80, width: 20, invulnMs: 150, reach: 110, kb: 2.2 }),
  // 11/19 사방 삽질: 기본 공격 피해 + 그리고 옆(40→70%)·뒤(22→50%)로도 같이 휘두른다 (일꾼 무리 정리)
  wk_callus: (lv: number) => ({ basicPct: 0.04 * lv, side: 0.325 + 0.075 * lv, back: 0.15 + 0.07 * lv }),
  wk_combo: (lv: number) => ({ mult: 3.4 + 0.6 * lv, split: [0.3, 0.3, 0.4] as const, gapMs: 150, range: 40, arcDeg: 40, stunMs: 400 }),
  wk_grip: (lv: number) => ({ aspd: 0.03 * lv }),
  // 11/19 뛰어드는 일꾼이 확실히 더 다치게 2% → 1%/랭크 (착지 경직과 같이)
  // 11/19 단단한 허리 + 자동 막기: 근접 공격(몸박·물기)을 랭크당 2% 확률로 삽으로 막아 70% 줄이고 밀친다 (같은 적에게 2초에 한 번)
  wk_back: (lv: number) => ({ guard: 0.02 * lv, parry: 0.02 * lv, parryCut: 0.7, parryGapMs: 2000 }),
  // 봉분 뛰어넘기: 가장 몰린 곳으로 뛰어올라(공중 무적) 착지하며 둘레를 친다. 착지 뒤 landMs 동안 못 움직인다 (뛰어드는 위험)
  wk_leap: (lv: number) => ({ mult: 1.8 + 0.22 * lv, reach: 150, radius: 56, airMs: 450, stunMs: 700, landMs: 300 }),
  wk_tireless: (lv: number) => ({ aspd: 0.15 + 0.05 * lv, rangeMul: 1.15, durMs: 8000 }),
  // 삽날 회오리: 한 번 눌러 켜고 다시 눌러 끈다. 켜 있는 동안 공격 속도만큼 둘레를 기본 공격으로 벤다 (SP 초당 소모, 바닥나면 꺼짐)
  wk_whirl: (lv: number) => ({ mult: 0.3 + 0.04 * lv, radius: 44, spPerSec: 15, moveMul: 0.6 }),
  wk_deep: (lv: number) => ({ critDmg: 0.08 * lv }),
  wk_allnight: (lv: number) => ({ dashes: 6, gapMs: 260, len: 120, width: 26, mult: 0.8 + 0.1 * lv }),
  wk_grit: (lv: number) => ({ every: 10, basicPct: 0.08 * lv }),
} as const;

/**
 * 11/19 v4 「랭크 비용은 그대로(1포인트), 최대 랭크를 올린다」 + 「버프는 올리지 마」:
 *  - 공격·소환·제어 액티브만 최대 랭크를 올린다: 5랭크 → 12, 3랭크(궁극기·안개 걸음) → 5.
 *  - 버프 액티브(장작 더 넣기·서리 방패·등불 기도·바람 넋·저승 너울·쉬지 않는 손)와 패시브는 지금 최대 랭크·효과 그대로.
 *  - 한 스킬 몰빵이 정답이 되지 않게, 올린 스킬은 예전 최대 랭크 뒤로는 랭크당 증가분이 절반 (12랭크 = 예전 8.5랭크 효과).
 *  개수·ms처럼 정수였던 값은 반올림한다.
 */
export const RAISED_MAX: Record<number, number> = { 5: 12, 3: 5 };
/** 버프·자기 강화 액티브 (패시브는 늘 그대로) */
export const BUFF_SKILLS: readonly string[] = ["em_stoke", "fr_ward", "so_lamp", "so_swift", "so_veil", "wk_tireless"];
/** v3 최대 랭크·종류 (스킬마다) — SKILLS_V3에서 채운다 */
const OLD_MAX: Partial<Record<string, number>> = {};
const RAISED: Partial<Record<string, boolean>> = {};
/** 새 랭크 lv → 예전 수치 랭크 (예전 최대까지는 그대로, 그 뒤로는 절반씩) */
export function effLevel(id: string, lv: number): number {
  const om = OLD_MAX[id] ?? 1;
  if (!RAISED[id] || lv <= om) return lv;
  return om + (lv - om) / 2;
}
type FxFn = (lv: number) => Record<string, unknown>;
function rescaled(id: string, f: FxFn): FxFn {
  return (lv: number) => {
    const v = f(effLevel(id, lv));
    if (!RAISED[id]) return v;
    const a = f(1);
    const b = f(OLD_MAX[id] ?? 1);
    const out: Record<string, unknown> = {};
    for (const [key, x] of Object.entries(v)) out[key] = typeof x === "number" && Number.isInteger(a[key]) && Number.isInteger(b[key]) ? Math.round(x) : x;
    return out;
  };
}
export const SKILL_FX: typeof SKILL_FX_V3 = Object.fromEntries(Object.entries(SKILL_FX_V3).map(([id, f]) => [id, rescaled(id, f as FxFn)])) as unknown as typeof SKILL_FX_V3;

const FX = SKILL_FX;
const E = BRANCH_INFO.ember;
const F = BRANCH_INFO.frost;
const S = BRANCH_INFO.soul;
const K = BRANCH_INFO.worker;
const passive = { sp: () => 0, cooldownMs: () => 0 };

const SKILLS_V3: readonly SkillDef[] = [
  // ════════ 모닥불지기 ════════
  {
    id: "em_kindle",
    branch: "ember",
    tier: 1,
    col: 0,
    name: "불씨 튕기기",
    tag: "불씨 · 작은 폭발",
    kind: "active",
    maxLevel: 5,
    sp: (lv) => 5 + lv,
    cooldownMs: () => 2200,
    describe: (lv) => `가장 가까운 적에게 불씨를 튕겨요. 맞은 자리가 작게 터져 둘레 적에게 공격력의 ${pct(FX.em_kindle(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_ember", main: E.color, accent: E.light },
  },
  {
    id: "em_hearth",
    branch: "ember",
    tier: 1,
    col: 2,
    name: "화롯가 온기",
    tag: "패시브 · 마공 공격력",
    kind: "passive",
    maxLevel: 5,
    ...passive,
    describe: (lv) => `마공 스킬(모닥불·서리·넋)의 공격력이 늘 ${pct(FX.em_hearth(lv).atkPct)} 올라요.`,
    art: { shape: "sk_hearth", main: E.color, accent: 0x6a4a30 },
  },
  {
    id: "em_fan",
    branch: "ember",
    tier: 2,
    col: 0,
    name: "불꽃 부채",
    tag: "부채꼴 광역",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "em_kindle", level: 1 }],
    sp: (lv) => 9 + lv,
    cooldownMs: () => 5000,
    describe: (lv) => `앞쪽 ${FX.em_fan(lv).arcDeg}° 부채꼴로 불길을 뿜어 공격력의 ${pct(FX.em_fan(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_fan", main: E.color, accent: E.dark },
  },
  {
    id: "em_stoke",
    branch: "ember",
    tier: 2,
    col: 1,
    name: "장작 더 넣기",
    tag: "마공 공격력↑",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "em_hearth", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 18_000,
    describe: (lv) => `${sec(FX.em_stoke(lv).durMs)} 동안 마공 스킬의 공격력이 ${pct(FX.em_stoke(lv).atk)} 올라요.`,
    art: { shape: "sk_logs", main: 0x8a5a30, accent: E.color },
  },
  {
    id: "em_spark",
    branch: "ember",
    tier: 2,
    col: 2,
    name: "튀는 불티",
    tag: "패시브 · 마공 치명타",
    kind: "passive",
    maxLevel: 3,
    requires: [{ id: "em_hearth", level: 1 }],
    ...passive,
    describe: (lv) => `마공 스킬의 치명타 확률이 늘 ${FX.em_spark(lv).crit}% 올라요.`,
    art: { shape: "sk_sparks", main: E.light, accent: E.color },
  },
  {
    id: "em_ring",
    branch: "ember",
    tier: 3,
    col: 0,
    name: "불의 고리",
    tag: "둘레 광역",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "em_fan", level: 2 }],
    sp: (lv) => 16 + 2 * lv,
    cooldownMs: () => 7000,
    describe: (lv) => `내 발밑에서 불의 고리가 터져요. 반지름 ${FX.em_ring(lv).radius} 안의 적 모두에게 공격력의 ${pct(FX.em_ring(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_firering", main: E.color, accent: E.light },
  },
  {
    id: "em_ignite",
    branch: "ember",
    tier: 3,
    col: 1,
    name: "불씨 옮기기",
    tag: "패시브 · 기본 공격 폭발",
    kind: "passive",
    maxLevel: 5,
    requires: [{ id: "em_stoke", level: 1 }],
    ...passive,
    describe: (lv) => `기본 공격이 맞으면 ${pct(FX.em_ignite(lv).chance)} 확률로 불씨가 터져요. 둘레 적에게 공격력의 ${pct(FX.em_ignite(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_bomb", main: E.dark, accent: E.light },
  },
  {
    id: "em_meteor",
    branch: "ember",
    tier: 4,
    col: 0,
    name: "별똥 장작",
    tag: "지연 대폭발",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "em_ring", level: 2 }],
    sp: (lv) => 24 + 2 * lv,
    cooldownMs: () => 9000,
    describe: (lv) =>
      `가장 가까운 적 자리에 불붙은 장작을 떨어뜨려요. ${sec(FX.em_meteor(lv).delayMs)} 뒤 둘레 적에게 공격력의 ${pct(FX.em_meteor(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_meteor", main: E.color, accent: E.light },
  },
  {
    id: "em_brazier",
    branch: "ember",
    tier: 4,
    col: 2,
    name: "화톳불 놓기",
    tag: "설치 · 지속 광역",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "em_ignite", level: 1 }],
    sp: () => 20,
    cooldownMs: () => 18_000,
    describe: (lv) =>
      `그 자리에 화톳불을 놓아요. ${sec(FX.em_brazier(lv).durMs)} 동안 ${sec(FX.em_brazier(lv).everyMs)}마다 둘레 적에게 공격력의 ${pct(FX.em_brazier(lv).mult)} 피해를 줘요. 오래 타는 불이라 우두머리에게도 덜 아프지 않아요.`,
    art: { shape: "sk_brazier", main: 0x6a6e78, accent: E.color },
  },
  {
    id: "em_bonfire",
    branch: "ember",
    tier: 5,
    col: 1,
    name: "큰 모닥불",
    tag: "궁극 · 화면 전체 화염",
    kind: "active",
    maxLevel: 3,
    aoe: true,
    requires: [{ id: "em_meteor", level: 3 }],
    sp: (lv) => 36 + 4 * lv,
    cooldownMs: () => 24_000,
    describe: (lv) => `큰 모닥불을 피워요. 불기둥이 화면을 덮어 보이는 적 모두를 ${FX.em_bonfire(lv).hitAt.length}번 때려요. 한 번에 공격력의 ${pct(FX.em_bonfire(lv).mult)} 피해예요.`,
    art: { shape: "sk_bonfire", main: E.color, accent: E.light },
  },
  {
    id: "em_ashheart",
    branch: "ember",
    tier: 5,
    col: 2,
    name: "재의 심장",
    tag: "패시브 · 광역 피해",
    kind: "passive",
    maxLevel: 3,
    requires: [{ id: "em_brazier", level: 1 }],
    ...passive,
    describe: (lv) => `광역 스킬 피해가 ${pct(FX.em_ashheart(lv).aoePct)} 올라요.`,
    art: { shape: "sk_heart", main: E.dark, accent: E.color },
  },

  // ════════ 서리 묘지기 ════════
  {
    id: "fr_breath",
    branch: "frost",
    tier: 1,
    col: 0,
    name: "서리 입김",
    tag: "부채꼴 · 둔화",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    sp: () => 5,
    cooldownMs: () => 3000,
    describe: (lv) => `앞쪽으로 차가운 입김을 뿜어 공격력의 ${pct(FX.fr_breath(lv).mult)} 피해를 줘요. 맞은 적은 ${sec(FX.fr_breath(lv).slowMs)} 동안 느려져요.`,
    art: { shape: "sk_breath", main: F.color, accent: F.light },
  },
  {
    id: "fr_collar",
    branch: "frost",
    tier: 1,
    col: 2,
    name: "서리 옷깃",
    tag: "패시브 · 방어",
    kind: "passive",
    maxLevel: 5,
    ...passive,
    describe: (lv) => `방어가 늘 ${FX.fr_collar(lv).def}, 최대 HP가 늘 ${pct(FX.fr_collar(lv).hpPct)} 올라요.`,
    art: { shape: "sk_collar", main: F.dark, accent: F.light },
  },
  {
    id: "fr_icicle",
    branch: "frost",
    tier: 2,
    col: 0,
    name: "고드름 부채",
    tag: "부채꼴 연사",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "fr_breath", level: 1 }],
    sp: (lv) => 8 + lv,
    cooldownMs: () => 5000,
    describe: (lv) => `앞쪽 부채꼴로 고드름 ${FX.fr_icicle(lv).n}개를 날려요. 하나가 공격력의 ${pct(FX.fr_icicle(lv).mult)} 피해를 주고 한 마리를 꿰뚫어요.`,
    art: { shape: "sk_icicle", main: F.color, accent: F.light },
  },
  {
    id: "fr_brittle",
    branch: "frost",
    tier: 2,
    col: 1,
    name: "살얼음",
    tag: "패시브 · 언 적 피해↑",
    kind: "passive",
    maxLevel: 4,
    requires: [{ id: "fr_breath", level: 1 }],
    ...passive,
    describe: (lv) => `느려지거나 얼어붙은 적은 마공 스킬 피해를 ${pct(FX.fr_brittle(lv).vsSlowed)} 더 받아요.`,
    art: { shape: "sk_crack", main: F.light, accent: F.dark },
  },
  {
    id: "fr_ward",
    branch: "frost",
    tier: 2,
    col: 2,
    name: "서리 방패",
    tag: "보호막",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "fr_collar", level: 1 }],
    sp: () => 14,
    cooldownMs: () => 20_000,
    describe: (lv) => `${sec(FX.fr_ward(lv).durMs)} 동안 얼음 방패를 둘러요. 방패가 최대 HP의 ${pct(FX.fr_ward(lv).shieldPct)}만큼 피해를 대신 받아요.`,
    art: { shape: "sk_iceshield", main: F.color, accent: F.dark },
  },
  {
    id: "fr_nova",
    branch: "frost",
    tier: 3,
    col: 0,
    name: "서리꽃 폭발",
    tag: "둘레 광역 · 얼림",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "fr_icicle", level: 2 }],
    sp: (lv) => 16 + 2 * lv,
    cooldownMs: () => 10_000,
    describe: (lv) =>
      `반지름 ${FX.fr_nova(lv).radius} 안에 서리꽃이 피어 공격력의 ${pct(FX.fr_nova(lv).mult)} 피해를 줘요. 맞은 적은 ${sec(FX.fr_nova(lv).freezeMs)} 동안 얼어서 못 움직여요.`,
    art: { shape: "sk_snow", main: F.color, accent: F.light },
  },
  {
    id: "fr_mist",
    branch: "frost",
    tier: 3,
    col: 2,
    name: "안개 걸음",
    tag: "돌진 · 무적",
    kind: "active",
    maxLevel: 3,
    requires: [{ id: "fr_ward", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 8000,
    describe: (lv) =>
      `안개가 되어 바라보는 쪽으로 ${FX.fr_mist(lv).dist}px 미끄러져요. 지나간 적은 공격력의 ${pct(FX.fr_mist(lv).mult)} 피해를 받고 느려져요. 미끄러지는 동안은 안 맞아요.`,
    art: { shape: "sk_mist", main: F.light, accent: F.color },
  },
  {
    id: "fr_tomb",
    branch: "frost",
    tier: 4,
    col: 0,
    name: "얼음 무덤",
    tag: "지연 광역 · 묶기",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "fr_nova", level: 2 }],
    sp: (lv) => 22 + 2 * lv,
    cooldownMs: () => 13_000,
    describe: (lv) =>
      `가장 가까운 적 자리에 ${sec(FX.fr_tomb(lv).delayMs)} 뒤 얼음 무덤이 솟아 공격력의 ${pct(FX.fr_tomb(lv).mult)} 피해를 줘요. 갇힌 적은 ${sec(FX.fr_tomb(lv).stunMs)} 동안 못 움직이고 피해를 ${pct(FX.fr_tomb(lv).vuln)} 더 받아요.`,
    art: { shape: "sk_crystal", main: F.color, accent: F.light },
  },
  {
    id: "fr_field",
    branch: "frost",
    tier: 4,
    col: 1,
    name: "고요한 서리밭",
    tag: "장판 · 약화",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "fr_brittle", level: 2 }],
    sp: () => 18,
    cooldownMs: () => 18_000,
    describe: (lv) =>
      `그 자리에 ${sec(FX.fr_field(lv).durMs)} 동안 서리밭을 깔아요. 안에 있는 적은 느려지고 피해를 ${pct(FX.fr_field(lv).vuln)} 더 받아요. 1초마다 공격력의 ${pct(FX.fr_field(lv).mult)} 피해도 줘요.`,
    art: { shape: "sk_frostfield", main: F.color, accent: F.dark },
  },
  {
    id: "fr_blizzard",
    branch: "frost",
    tier: 5,
    col: 1,
    name: "한겨울 눈보라",
    tag: "궁극 · 화면 전체 눈보라",
    kind: "active",
    maxLevel: 3,
    aoe: true,
    requires: [{ id: "fr_tomb", level: 3 }],
    sp: () => 40,
    cooldownMs: () => 26_000,
    describe: (lv) =>
      `화면 가득 눈보라가 몰아쳐요. 보이는 적 모두를 ${FX.fr_blizzard(lv).hitAt.length}번 때리고 느리게 해요. 한 번에 공격력의 ${pct(FX.fr_blizzard(lv).mult)} 피해예요.`,
    art: { shape: "sk_blizzard", main: F.light, accent: F.color },
  },
  {
    id: "fr_solstice",
    branch: "frost",
    tier: 5,
    col: 2,
    name: "동지의 맹세",
    tag: "패시브 · 쿨타임↓·피해↓",
    kind: "passive",
    maxLevel: 3,
    requires: [{ id: "fr_mist", level: 1 }],
    ...passive,
    describe: (lv) => `마공 스킬 쿨타임이 ${pct(FX.fr_solstice(lv).cdCut)} 줄고, 받는 피해가 ${pct(FX.fr_solstice(lv).guard)} 줄어요.`,
    art: { shape: "sk_moonfrost", main: F.light, accent: F.dark },
  },

  // ════════ 넋 인도자 ════════
  {
    id: "so_wisp",
    branch: "soul",
    tier: 1,
    col: 0,
    name: "도깨비불",
    tag: "따라가는 넋불",
    kind: "active",
    maxLevel: 5,
    sp: (lv) => 6 + lv,
    cooldownMs: () => 3000,
    describe: (lv) => `넋불 ${FX.so_wisp(lv).n}개가 가까운 적을 따라가요. 하나가 공격력의 ${pct(FX.so_wisp(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_wisp", main: S.color, accent: S.light },
  },
  {
    id: "so_lamp",
    branch: "soul",
    tier: 1,
    col: 2,
    name: "등불 기도",
    tag: "회복",
    kind: "active",
    maxLevel: 5,
    sp: (lv) => 10 + 2 * lv,
    cooldownMs: () => 9000,
    describe: (lv) => `${sec(FX.so_lamp(lv).rootMs)} 동안 멈춰 서서 등불에 빌어요. 최대 HP의 ${pct(FX.so_lamp(lv).healPct)}에 INT×3을 더한 만큼 HP가 차요. 넋 갈래에 쓴 포인트가 많을수록 세져요 (30포인트에 100%).`,
    art: { shape: "sk_lamp", main: 0xffd27a, accent: S.dark },
  },
  {
    id: "so_drain",
    branch: "soul",
    tier: 2,
    col: 0,
    name: "넋 거두기",
    tag: "패시브 · 흡혈",
    kind: "passive",
    maxLevel: 5,
    requires: [{ id: "so_wisp", level: 1 }],
    ...passive,
    describe: (lv) => `마공 스킬과 부른 넋이 준 피해의 ${pct(FX.so_drain(lv).steal)}만큼 HP가 차요.`,
    art: { shape: "sk_drain", main: S.color, accent: 0xe84a6a },
  },
  {
    id: "so_swift",
    branch: "soul",
    tier: 2,
    col: 1,
    name: "바람 넋",
    tag: "이동·공속↑",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "so_lamp", level: 1 }],
    sp: () => 12,
    cooldownMs: () => 18_000,
    describe: (lv) =>
      `${sec(FX.so_swift(lv).durMs)} 동안 이동 속도가 ${pct(FX.so_swift(lv).move)}, 공격 속도가 ${pct(FX.so_swift(lv).aspd)} 올라요. 넋 갈래에 쓴 포인트가 많을수록 세져요 (30포인트에 100%, 적으면 25%까지).`,
    art: { shape: "sk_gust", main: S.light, accent: S.color },
  },
  {
    id: "so_friend",
    branch: "soul",
    tier: 2,
    col: 2,
    name: "길동무 넋",
    tag: "도우미 소환",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "so_lamp", level: 1 }],
    sp: () => 18,
    cooldownMs: () => 26_000,
    describe: (lv) => `${sec(FX.so_friend(lv).durMs)} 동안 길동무 넋이 곁에서 함께 싸워요. 넋은 내 공격력의 ${pct(FX.so_friend(lv).atkPct)}로 때려요.`,
    art: { shape: "sk_ghost", main: 0xe8e4f8, accent: S.color },
  },
  {
    id: "so_chain",
    branch: "soul",
    tier: 3,
    col: 0,
    name: "넋 사슬",
    tag: "끌어모으기",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "so_wisp", level: 2 }],
    sp: () => 16,
    cooldownMs: () => 15_000,
    describe: (lv) =>
      `넋 사슬로 둘레 적을 내 앞에 끌어모아 공격력의 ${pct(FX.so_chain(lv).mult)} 피해를 줘요. 묶인 적은 ${sec(FX.so_chain(lv).stunMs)} 동안 못 움직이고 피해를 ${pct(FX.so_chain(lv).vuln)} 더 받아요.`,
    art: { shape: "sk_chain", main: S.color, accent: S.light },
  },
  {
    id: "so_veil",
    branch: "soul",
    tier: 3,
    col: 2,
    name: "저승 너울",
    tag: "순간이동 · 무적",
    kind: "active",
    maxLevel: 3,
    requires: [{ id: "so_friend", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 15_000,
    describe: (lv) => `가장 가까운 적의 반대쪽으로 순간이동해요. ${sec(FX.so_veil(lv).safeMs)} 동안 피해를 받지 않아요.`,
    art: { shape: "sk_veil", main: S.dark, accent: S.light },
  },
  {
    id: "so_harvest",
    branch: "soul",
    tier: 4,
    col: 0,
    name: "넋 소용돌이",
    tag: "광역 · 흡수",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "so_chain", level: 2 }],
    sp: (lv) => 22 + 2 * lv,
    cooldownMs: () => 12_000,
    describe: (lv) =>
      `가장 가까운 적 자리에 넋 소용돌이를 열어요. ${FX.so_harvest(lv).ticks}번 휘몰아치며 한 번에 공격력의 ${pct(FX.so_harvest(lv).mult)} 피해를 줘요. 맞힌 적마다 HP가 조금 차고, 한 번에 최대 ${pct(FX.so_harvest(lv).healCap)}까지 차요.`,
    art: { shape: "sk_vortex", main: S.color, accent: S.light },
  },
  {
    id: "so_lantern",
    branch: "soul",
    tier: 4,
    col: 2,
    name: "망자의 초롱",
    tag: "포탑 소환",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "so_friend", level: 2 }],
    sp: () => 22,
    cooldownMs: () => 24_000,
    describe: (lv) =>
      `그 자리에 초롱을 걸어요. ${sec(FX.so_lantern(lv).durMs)} 동안 초롱이 가까운 적에게 넋불을 쏴서 공격력의 ${pct(FX.so_lantern(lv).atkPct)} 피해를 줘요.`,
    art: { shape: "sk_lantern", main: S.light, accent: S.dark },
  },
  {
    id: "so_procession",
    branch: "soul",
    tier: 5,
    col: 1,
    name: "별빛 행렬",
    tag: "궁극 · 전체 광역 · 회복",
    kind: "active",
    maxLevel: 3,
    aoe: true,
    requires: [{ id: "so_harvest", level: 3 }],
    sp: () => 40,
    cooldownMs: () => 28_000,
    describe: (lv) =>
      `넋들의 행렬이 화면을 가로질러요. 보이는 적 모두를 ${FX.so_procession(lv).hitAt.length}번 때리고, 한 번에 공격력의 ${pct(FX.so_procession(lv).mult)} 피해예요. 내 HP도 최대 HP의 ${pct(FX.so_procession(lv).healPct)}만큼 차요.`,
    art: { shape: "sk_starlight", main: 0xfff3c8, accent: S.color },
  },
  {
    id: "so_kinship",
    branch: "soul",
    tier: 5,
    col: 2,
    name: "넋의 인연",
    tag: "패시브 · 소환 강화",
    kind: "passive",
    maxLevel: 3,
    requires: [{ id: "so_lantern", level: 1 }],
    ...passive,
    describe: (lv) => `길동무 넋과 망자의 초롱의 피해가 ${pct(FX.so_kinship(lv).summonPct)}, 머무는 시간이 ${pct(FX.so_kinship(lv).durPct)} 늘어요.`,
    art: { shape: "sk_bond", main: S.light, accent: S.color },
  },

  // ════════ 삽자루 일꾼 (11/19 물공) ════════
  {
    id: "wk_charge",
    branch: "worker",
    tier: 1,
    col: 0,
    name: "삽자루 돌진",
    tag: "돌진 · 밀치기",
    kind: "active",
    maxLevel: 5,
    sp: () => 6,
    cooldownMs: () => 5000,
    describe: (lv) =>
      `바라보는 쪽으로 ${FX.wk_charge(lv).dist}만큼 돌진해요. 길 위의 적을 밀치며 공격력의 ${pct(FX.wk_charge(lv).mult)} 피해를 줘요.`,
    art: { shape: "sk_wk_charge", main: K.color, accent: K.light },
  },
  {
    id: "wk_callus",
    branch: "worker",
    tier: 1,
    col: 2,
    name: "사방 삽질",
    tag: "패시브 · 기본 공격·옆·뒤",
    kind: "passive",
    maxLevel: 5,
    ...passive,
    describe: (lv) => `기본 공격 피해가 늘 ${pct(FX.wk_callus(lv).basicPct)} 올라요. 근접 기본 공격이 옆으로 ${pct(FX.wk_callus(lv).side)}, 뒤로 ${pct(FX.wk_callus(lv).back)} 세기로 같이 나가요.`,
    art: { shape: "sk_wk_callus", main: K.light, accent: K.color },
  },
  {
    id: "wk_combo",
    branch: "worker",
    tier: 2,
    col: 0,
    name: "찌르고 퍼 올리기",
    tag: "3연타 · 기절",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "wk_charge", level: 1 }],
    sp: () => 6,
    cooldownMs: () => 3000,
    describe: (lv) =>
      `앞을 두 번 찌르고 크게 퍼 올려요. 세 번에 걸쳐 공격력의 ${pct(FX.wk_combo(lv).mult)} 피해를 주고, 마지막 한 번에 ${sec(FX.wk_combo(lv).stunMs)} 기절시켜요.`,
    art: { shape: "sk_wk_combo", main: K.color, accent: K.light },
  },
  {
    id: "wk_grip",
    branch: "worker",
    tier: 2,
    col: 1,
    name: "손에 익은 삽",
    tag: "패시브 · 공격 속도",
    kind: "passive",
    maxLevel: 5,
    requires: [{ id: "wk_callus", level: 1 }],
    ...passive,
    describe: (lv) => `공격 속도가 늘 ${pct(FX.wk_grip(lv).aspd)} 빨라져요.`,
    art: { shape: "sk_wk_grip", main: K.color, accent: K.dark },
  },
  {
    id: "wk_back",
    branch: "worker",
    tier: 2,
    col: 2,
    name: "삽으로 막기",
    tag: "패시브 · 받는 피해·근접·원거리 막기",
    kind: "passive",
    maxLevel: 5,
    requires: [{ id: "wk_callus", level: 1 }],
    ...passive,
    describe: (lv) => `받는 피해가 늘 ${pct(FX.wk_back(lv).guard)} 줄어요. 근접 공격과 날아오는 투사체를 ${pct(FX.wk_back(lv).parry)} 확률로 삽으로 막거나 쳐내 ${pct(FX.wk_back(lv).parryCut)} 덜 아파요. 근접이면 그 적을 밀쳐요 (같은 적은 2초에 한 번, 광역·바닥 장판은 못 막아요).`,
    art: { shape: "sk_wk_back", main: K.dark, accent: K.light },
  },
  {
    id: "wk_leap",
    branch: "worker",
    tier: 3,
    col: 0,
    name: "봉분 뛰어넘기",
    tag: "도약 · 착지 광역",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "wk_charge", level: 2 }],
    sp: () => 14,
    cooldownMs: () => 9000,
    describe: (lv) =>
      `${FX.wk_leap(lv).reach} 안에서 적이 가장 몰린 곳으로 뛰어올라요. 착지하며 둘레 적에게 공격력의 ${pct(FX.wk_leap(lv).mult)} 피해를 주고 ${sec(FX.wk_leap(lv).stunMs)} 기절시켜요. 공중에서는 무적이지만 착지 뒤 ${sec(FX.wk_leap(lv).landMs)} 동안 못 움직여요.`,
    art: { shape: "sk_wk_leap", main: K.color, accent: K.light },
  },
  {
    id: "wk_tireless",
    branch: "worker",
    tier: 3,
    col: 1,
    name: "쉬지 않는 손",
    tag: "공격 속도·범위↑",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "wk_grip", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 20_000,
    describe: (lv) =>
      `${sec(FX.wk_tireless(lv).durMs)} 동안 공격 속도가 ${pct(FX.wk_tireless(lv).aspd)} 빨라지고, 기본 공격이 닿는 거리가 ${pct(FX.wk_tireless(lv).rangeMul - 1)} 늘어요.`,
    art: { shape: "sk_wk_tireless", main: K.light, accent: K.color },
  },
  {
    id: "wk_whirl",
    branch: "worker",
    tier: 4,
    col: 0,
    name: "삽날 회오리",
    tag: "켜고 끄기 · 회전 베기",
    kind: "active",
    maxLevel: 5,
    aoe: true,
    requires: [{ id: "wk_leap", level: 2 }],
    sp: () => 4,
    cooldownMs: () => 1500,
    describe: (lv) =>
      `한 번 누르면 삽을 휘두르며 빙글빙글 돌아요. 공격 속도만큼 둘레를 베어 한 번에 공격력의 ${pct(FX.wk_whirl(lv).mult)} 피해를 줘요. 도는 동안 초당 SP ${FX.wk_whirl(lv).spPerSec}을 쓰고 ${pct(FX.wk_whirl(lv).moveMul)} 빠르기로 걸어요. 다시 누르거나 SP가 바닥나면 멈춰요.`,
    art: { shape: "sk_wk_whirl", main: K.color, accent: K.light },
  },
  {
    id: "wk_deep",
    branch: "worker",
    tier: 4,
    col: 2,
    name: "깊게 파기",
    tag: "패시브 · 치명타 피해",
    kind: "passive",
    maxLevel: 5,
    requires: [{ id: "wk_back", level: 1 }],
    ...passive,
    describe: (lv) => `기본 공격과 일꾼 스킬의 치명타 피해가 ${pct(FX.wk_deep(lv).critDmg)} 올라요.`,
    art: { shape: "sk_wk_deep", main: K.dark, accent: K.color },
  },
  {
    id: "wk_allnight",
    branch: "worker",
    tier: 5,
    col: 1,
    name: "밤샘 삽질",
    tag: "궁극 · 여섯 번 돌진",
    kind: "active",
    maxLevel: 3,
    aoe: true,
    requires: [{ id: "wk_whirl", level: 3 }],
    sp: (lv) => 30 + 4 * lv,
    cooldownMs: () => 24_000,
    describe: (lv) =>
      `적 사이를 ${FX.wk_allnight(lv).dashes}번 연달아 돌진해요. 지나가는 길의 적에게 한 번에 공격력의 ${pct(FX.wk_allnight(lv).mult)} 피해를 줘요. 돌진하는 순간만 무적이에요.`,
    art: { shape: "sk_wk_allnight", main: K.color, accent: 0xfff3c8 },
  },
  {
    id: "wk_grit",
    branch: "worker",
    tier: 5,
    col: 2,
    name: "일꾼의 뚝심",
    tag: "패시브 · 10번째 치명타",
    kind: "passive",
    maxLevel: 3,
    requires: [{ id: "wk_deep", level: 1 }],
    ...passive,
    describe: (lv) => `기본 공격 ${FX.wk_grit(lv).every}번째마다 반드시 치명타가 나고, 기본 공격 피해가 ${pct(FX.wk_grit(lv).basicPct)} 올라요.`,
    art: { shape: "sk_wk_grit", main: K.light, accent: K.dark },
  },
];

for (const d of SKILLS_V3) {
  OLD_MAX[d.id] = d.maxLevel;
  RAISED[d.id] = d.kind === "active" && !BUFF_SKILLS.includes(d.id) && !!RAISED_MAX[d.maxLevel];
}
/** 11/19 v4 스킬 정의: 공격·소환·제어 액티브만 최대 랭크를 올리고 SP·쿨타임도 같은 랭크 환산으로 (선행 랭크는 예전 랭크 그대로 — 그 구간은 효과가 같다) */
export const SKILLS: readonly SkillDef[] = SKILLS_V3.map((d) =>
  RAISED[d.id]
    ? {
        ...d,
        maxLevel: RAISED_MAX[d.maxLevel],
        sp: (lv: number) => Math.round(d.sp(effLevel(d.id, lv))),
        cooldownMs: (lv: number) => Math.round(d.cooldownMs(effLevel(d.id, lv))),
      }
    : d,
);

export const SKILL_IDS = SKILLS.map((s) => s.id) as [SkillId, ...SkillId[]];
export const skillById = (id: string): SkillDef | undefined => SKILLS.find((s) => s.id === id);
export const isActive = (id: string) => skillById(id)?.kind === "active";

/** 배운 패시브를 모아 둔 사냥 보정값 (게임이 판 시작 때 한 번 계산한다) */
export type SkillMods = {
  /** 11/19 마공 피해에만 (화롯가 온기) */
  atkPct: number;
  /** 11/19 마공 피해에만 (튀는 불티) */
  crit: number;
  def: number;
  hpPct: number;
  aoePct: number;
  vsSlowed: number;
  cdCut: number;
  guard: number;
  steal: number;
  ignite: number;
  summonPct: number;
  summonDurPct: number;
  /** 11/19 일꾼 (물공): 기본 공격 피해 + (굳은살·뚝심) · 공격 속도 + · 받는 피해 − · 치명타 피해 + (기본 공격·일꾼 스킬) · N번째 기본 공격 반드시 치명타 */
  basicPct: number;
  aspdPct: number;
  wkGuard: number;
  physCritDmg: number;
  sureCritEvery: number;
  /** 11/19 사방 삽질 옆·뒤 세기 · 자동 막기 확률 */
  sidePct: number;
  backPct: number;
  parry: number;
};

export function skillMods(skills: Partial<Record<SkillId, number>>): SkillMods {
  const lv = (id: SkillId) => skills[id] ?? 0;
  const on = <T>(id: SkillId, f: (lv: number) => T, zero: T): T => (lv(id) > 0 ? f(lv(id)) : zero);
  return {
    atkPct: on("em_hearth", (l) => FX.em_hearth(l).atkPct, 0),
    crit: on("em_spark", (l) => FX.em_spark(l).crit, 0),
    def: on("fr_collar", (l) => FX.fr_collar(l).def, 0),
    hpPct: on("fr_collar", (l) => FX.fr_collar(l).hpPct, 0),
    aoePct: on("em_ashheart", (l) => FX.em_ashheart(l).aoePct, 0),
    vsSlowed: on("fr_brittle", (l) => FX.fr_brittle(l).vsSlowed, 0),
    cdCut: on("fr_solstice", (l) => FX.fr_solstice(l).cdCut, 0),
    guard: on("fr_solstice", (l) => FX.fr_solstice(l).guard, 0),
    steal: on("so_drain", (l) => FX.so_drain(l).steal, 0),
    ignite: on("em_ignite", (l) => FX.em_ignite(l).chance, 0),
    summonPct: on("so_kinship", (l) => FX.so_kinship(l).summonPct, 0),
    summonDurPct: on("so_kinship", (l) => FX.so_kinship(l).durPct, 0),
    basicPct: on("wk_callus", (l) => FX.wk_callus(l).basicPct, 0) + on("wk_grit", (l) => FX.wk_grit(l).basicPct, 0),
    aspdPct: on("wk_grip", (l) => FX.wk_grip(l).aspd, 0),
    wkGuard: on("wk_back", (l) => FX.wk_back(l).guard, 0),
    physCritDmg: on("wk_deep", (l) => FX.wk_deep(l).critDmg, 0),
    sureCritEvery: on("wk_grit", (l) => FX.wk_grit(l).every, 0),
    sidePct: on("wk_callus", (l) => FX.wk_callus(l).side, 0),
    backPct: on("wk_callus", (l) => FX.wk_callus(l).back, 0),
    parry: on("wk_back", (l) => FX.wk_back(l).parry, 0),
  };
}

// ════════ 11/19 연계 보너스 (대표 빌드) ════════
// 빌드의 핵심 스킬은 같은 갈래의 「받쳐 주는 스킬」 랭크마다 피해가 pct씩 오른다 (더해서 곱함: 1 + Σ pct × 랭크).
// 받쳐 주는 스킬은 그 자체로도 쓸모 있는 스킬이고, 핵심 1 + 받침 2에 몰아 찍으면 확실히 세지고 흩어 찍으면 약하다.
// 게임(HuntScene.strike)·설명(skillText)·서버 딜 상한(dealCap)이 이 표 하나를 같이 쓴다. 수치는 scratchpad 시뮬로 맞췄다.
export type SynergyLink = { id: SkillId; pct: number };
export const SYNERGY: Partial<Record<SkillId, readonly SynergyLink[]>> = {
  // 모닥불 · 별똥비: 별똥 장작 ← 불씨 튕기기·불의 고리
  em_meteor: [
    { id: "em_kindle", pct: 0.08 },
    { id: "em_ring", pct: 0.08 },
  ],
  // 모닥불 · 화톳불 진지: 화톳불 놓기 ← 불씨 옮기기·재의 심장
  em_brazier: [
    { id: "em_ignite", pct: 0.2 },
    { id: "em_ashheart", pct: 0.33 },
  ],
  // 11/19 실제 게임 재현(101층부터): 서리 두 빌드만 층 시간 초과(114층)로 막혀 서리 연계를 조금 올렸다
  // 서리 · 서리꽃 폭발: 서리꽃 폭발 ← 서리 입김·살얼음
  fr_nova: [
    { id: "fr_breath", pct: 0.1 },
    { id: "fr_brittle", pct: 0.3 },
  ],
  // 서리 · 얼음 무덤 저격: 얼음 무덤 ← 고드름 부채·고요한 서리밭
  fr_tomb: [
    { id: "fr_icicle", pct: 0.13 },
    { id: "fr_field", pct: 0.13 },
  ],
  // 넋 · 행렬 인도자: 길동무 넋·망자의 초롱 ← 넋의 인연·넋 사슬
  so_friend: [
    { id: "so_kinship", pct: 0.33 },
    { id: "so_chain", pct: 0.08 },
  ],
  so_lantern: [
    { id: "so_kinship", pct: 0.33 },
    { id: "so_chain", pct: 0.08 },
  ],
  // 넋 · 흡혼 사슬: 넋 사슬·넋 소용돌이 ← 넋 거두기·도깨비불
  so_chain: [
    { id: "so_drain", pct: 0.2 },
    { id: "so_wisp", pct: 0.08 },
  ],
  so_harvest: [
    { id: "so_drain", pct: 0.2 },
    { id: "so_wisp", pct: 0.08 },
  ],
  // 일꾼 · 회오리 일꾼: 삽날 회오리 ← 사방 삽질·손에 익은 삽
  wk_whirl: [
    { id: "wk_callus", pct: 0.2 },
    { id: "wk_grip", pct: 0.2 },
  ],
  // 일꾼 · 도약 일꾼: 봉분 뛰어넘기 ← 삽자루 돌진·깊게 파기
  wk_leap: [
    { id: "wk_charge", pct: 0.1 },
    { id: "wk_deep", pct: 0.25 },
  ],
};

/** 핵심 스킬 id의 연계 배율 (배운 받침 랭크만큼). 핵심이 아니면 1 */
export function synergyMul(id: SkillId, skills: Partial<Record<SkillId, number>>): number {
  const links = SYNERGY[id];
  if (!links) return 1;
  let k = 1;
  for (const l of links) k += l.pct * Math.max(0, Math.floor(skills[l.id] ?? 0));
  return k;
}

/** 이 스킬이 받쳐 주는 핵심 스킬들 (받침 → 핵심) */
export const synergyTargets = (id: SkillId): { core: SkillId; pct: number }[] =>
  (Object.entries(SYNERGY) as [SkillId, readonly SynergyLink[]][]).flatMap(([core, links]) => links.filter((l) => l.id === id).map((l) => ({ core, pct: l.pct })));

/** 배운 핵심 스킬 가운데 가장 큰 연계 배율 (서버 딜 상한) */
export function synergyPeak(skills: Partial<Record<SkillId, number>>): number {
  let best = 1;
  for (const id of Object.keys(SYNERGY) as SkillId[]) if ((skills[id] ?? 0) > 0) best = Math.max(best, synergyMul(id, skills));
  return best;
}

// ════════ 11/19 연계 생존 (대표 빌드 몰아 찍기) ════════
// 핵심 + 받침을 몰아 찍으면 받는 피해가 준다: 받침 랭크마다 조금씩, 핵심 랭크 비율만큼 (핵심 1랭크면 거의 없고 최대 랭크면 다).
// 받는 피해 감소 = 다 찍었을 때 값(SYNERGY_GUARD) × ((핵심 랭크 ÷ 핵심 최대) × (받침 랭크 비율의 평균))². 흩어 찍으면(둘 다 절반) 1/16만 붙는다.
// 100층 위에서는 버티는 힘이 막히는 층을 정해서(시뮬) 피해 연계만으로는 흩어 찍기와 차이가 거의 안 났다 → 생존 몫을 같이 준다
export const SYNERGY_GUARD: Partial<Record<SkillId, number>> = {
  em_meteor: 0.8,
  em_brazier: 0.8,
  fr_nova: 0.7,
  fr_tomb: 0.7,
  so_friend: 0.6,
  so_lantern: 0.6,
  so_chain: 0.85,
  so_harvest: 0.85,
  wk_whirl: 0.8,
  wk_leap: 0.8,
};
const maxOf = (id: SkillId) => SKILLS.find((s) => s.id === id)?.maxLevel ?? 1;
/** 핵심 id의 연계 생존 (받는 피해 감소 비율) */
export function synergyGuardOf(id: SkillId, skills: Partial<Record<SkillId, number>>): number {
  const full = SYNERGY_GUARD[id];
  const links = SYNERGY[id];
  if (!full || !links) return 0;
  const core = Math.min(1, Math.max(0, skills[id] ?? 0) / maxOf(id));
  const sup = links.reduce((a, l) => a + Math.min(1, Math.max(0, skills[l.id] ?? 0) / maxOf(l.id)), 0) / links.length;
  // 몰아 찍을수록 가파르게: (핵심 비율 × 받침 비율)²
  return full * (core * sup) ** 2;
}
/** 배운 핵심 가운데 가장 큰 연계 생존 (게임이 판 시작 때 한 번) */
export function synergyGuard(skills: Partial<Record<SkillId, number>>): number {
  let best = 0;
  for (const id of Object.keys(SYNERGY_GUARD) as SkillId[]) best = Math.max(best, synergyGuardOf(id, skills));
  return best;
}
/** 받침 l이 핵심 core에 주는 1랭크 몫 (핵심 최대 랭크일 때) — 스킬 창 표시용 */
export const synergyGuardPerRank = (core: SkillId, sup: SkillId) => {
  const n = SYNERGY[core]?.length ?? 1;
  return (SYNERGY_GUARD[core] ?? 0) / n / maxOf(sup);
};
