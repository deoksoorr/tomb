// 사냥 스킬 트리 (저장 형식 2): 갈래 3개 × 단 5개. 아늑한 공동묘지 마을의 세 가지 밤 — 모닥불·서리·넋.
//  - 모닥불지기: 불씨와 장작으로 넓게 태운다 (화염·광역)
//  - 서리 묘지기: 새벽 서리로 묶고 버틴다 (제어·방어)
//  - 넋 인도자: 길 잃은 넋과 등불로 거두고 부르고 돕는다 (흡수·소환·보조)
// 각 스킬: 선행 스킬(필요 랭크), 단(아래 단에 쓴 포인트로 열림), 최대 랭크, 랭크별 수치(SKILL_FX), 액티브/패시브.
// 게임(효과)과 UI(설명)·서버(검증, skillRules.ts)가 같이 쓴다. 이 파일은 catalog.ts의 타입만 가져온다 (순환 없음).
import type { IconArt } from "./catalog";

export const BRANCHES = ["ember", "frost", "soul"] as const;
export type BranchId = (typeof BRANCHES)[number];

export type BranchInfo = {
  name: string;
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
    role: "화염 · 광역",
    desc: "마을 한가운데 모닥불을 지키던 사람들. 불씨를 튕기고 장작을 던져 둘레를 한꺼번에 태운다.",
    color: 0xff7a2e,
    light: 0xffd27a,
    dark: 0xa82a14,
  },
  frost: {
    name: "서리 묘지기",
    role: "제어 · 방어",
    desc: "새벽마다 묘역의 서리를 쓸던 묘지기. 적을 얼려 묶고, 서리 방패로 버틴다.",
    color: 0x8fd8ff,
    light: 0xf2fbff,
    dark: 0x2a6aa8,
  },
  soul: {
    name: "넋 인도자",
    role: "흡수 · 소환 · 보조",
    desc: "길 잃은 넋에게 등불을 비춰 주던 사람. 넋을 거둬 힘을 얻고, 길동무를 불러 함께 싸운다.",
    color: 0xb98aff,
    light: 0x9ff0dc,
    dark: 0x4a2a8a,
  },
};

/** 단(1~5)이 열리는 조건: 그 갈래의 아래 단들에 쓴 포인트 */
export const TIER_GATES = [0, 3, 7, 12, 18] as const;
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
  | "so_kinship";

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
export const SKILL_FX = {
  // ── 모닥불지기 ──
  em_kindle: (lv: number) => ({ mult: 1.4 + 0.22 * lv, blast: 18, reach: 110 }),
  em_hearth: (lv: number) => ({ atkPct: 0.02 * lv }),
  em_fan: (lv: number) => ({ mult: 1.2 + 0.2 * lv, range: 58, arcDeg: 100 }),
  em_stoke: (lv: number) => ({ atk: 0.06 + 0.05 * lv, durMs: 8000 }),
  em_spark: (lv: number) => ({ crit: 3 * lv }),
  em_ring: (lv: number) => ({ mult: 1.4 + 0.22 * lv, radius: 60 }),
  em_ignite: (lv: number) => ({ chance: 0.04 * lv, mult: 0.8, radius: 22 }),
  em_meteor: (lv: number) => ({ mult: 2.2 + 0.36 * lv, radius: 50, delayMs: 800, reach: 130 }),
  em_brazier: (lv: number) => ({ durMs: 6000 + 500 * lv, everyMs: 900, radius: 42, mult: 0.35 + 0.07 * lv }),
  em_bonfire: (lv: number) => ({ pulses: 3, gapMs: 450, radius: [70, 85, 100] as const, mult: 1.3 + 0.25 * lv }),
  em_ashheart: (lv: number) => ({ aoePct: 0.05 * lv }),
  // ── 서리 묘지기 ──
  fr_breath: (lv: number) => ({ mult: 1 + 0.15 * lv, range: 46, arcDeg: 80, slowMs: 3000 }),
  fr_collar: (lv: number) => ({ def: 2 * lv, hpPct: 0.03 * lv }),
  fr_icicle: (lv: number) => ({ n: Math.min(8, 3 + lv), mult: 0.6 + 0.1 * lv, range: 120, pierce: 1 }),
  fr_brittle: (lv: number) => ({ vsSlowed: 0.05 * lv }),
  fr_ward: (lv: number) => ({ shieldPct: 0.12 + 0.05 * lv, durMs: 8000 }),
  fr_nova: (lv: number) => ({ mult: 1.3 + 0.22 * lv, radius: 62, freezeMs: 500 + 120 * lv }),
  fr_mist: (lv: number) => ({ dist: 64 + 8 * lv, mult: 0.8 + 0.2 * lv, width: 16, slowMs: 2500 }),
  fr_tomb: (lv: number) => ({ mult: 2.1 + 0.38 * lv, radius: 50, delayMs: 600, stunMs: 1200, vuln: 0.15, vulnMs: 4000, reach: 130 }),
  fr_field: (lv: number) => ({ radius: 80, durMs: 6000, everyMs: 1000, mult: 0.25 + 0.05 * lv, vuln: 0.05 * lv }),
  fr_blizzard: (lv: number) => ({ durMs: 5000, everyMs: 500, radius: 78, mult: 0.45 + 0.08 * lv }),
  fr_solstice: (lv: number) => ({ cdCut: 0.04 * lv, guard: 0.03 * lv }),
  // ── 넋 인도자 ──
  so_wisp: (lv: number) => ({ n: lv >= 4 ? 3 : 2, mult: 0.8 + 0.12 * lv, range: 130 }),
  so_lamp: (lv: number) => ({ healPct: 0.1 + 0.04 * lv, rootMs: 500 }),
  so_drain: (lv: number) => ({ steal: 0.01 * lv }),
  so_swift: (lv: number) => ({ move: 0.15 + 0.05 * lv, aspd: 0.08 + 0.04 * lv, durMs: 8000 }),
  so_friend: (lv: number) => ({ durMs: 10_000 + 2000 * lv, atkPct: 0.35 + 0.1 * lv, everyMs: 800 }),
  so_chain: (lv: number) => ({ radius: 96, stunMs: 500 + 120 * lv, vuln: 0.05 * lv, vulnMs: 3000, mult: 0.6 + 0.1 * lv }),
  so_veil: (lv: number) => ({ dist: 72, safeMs: 800 + 300 * lv }),
  so_harvest: (lv: number) => ({ radius: 54, ticks: 3, gapMs: 400, mult: 0.85 + 0.15 * lv, healPerHit: 0.015, healCap: 0.08, reach: 130 }),
  so_lantern: (lv: number) => ({ durMs: 8000 + 1500 * lv, atkPct: 0.4 + 0.1 * lv, everyMs: 700, range: 110 }),
  so_procession: (lv: number) => ({ sweeps: 2, gapMs: 600, radius: 110, mult: 1.6 + 0.35 * lv, healPct: 0.1 + 0.05 * lv }),
  so_kinship: (lv: number) => ({ summonPct: 0.15 * lv, durPct: 0.1 * lv }),
} as const;

const FX = SKILL_FX;
const E = BRANCH_INFO.ember;
const F = BRANCH_INFO.frost;
const S = BRANCH_INFO.soul;
const passive = { sp: () => 0, cooldownMs: () => 0 };

export const SKILLS: readonly SkillDef[] = [
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
    describe: (lv) => `가장 가까운 적에게 불씨를 튕긴다. 맞은 자리가 작게 터져 둘레 적에게 공격력의 ${pct(FX.em_kindle(lv).mult)} 피해.`,
    art: { shape: "sk_ember", main: E.color, accent: E.light },
  },
  {
    id: "em_hearth",
    branch: "ember",
    tier: 1,
    col: 2,
    name: "화롯가 온기",
    tag: "패시브 · 공격력",
    kind: "passive",
    maxLevel: 5,
    ...passive,
    describe: (lv) => `늘 공격력 +${pct(FX.em_hearth(lv).atkPct)}.`,
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
    describe: (lv) => `앞쪽 부채꼴(${FX.em_fan(lv).arcDeg}°)로 불길을 쓸어 공격력의 ${pct(FX.em_fan(lv).mult)} 피해.`,
    art: { shape: "sk_fan", main: E.color, accent: E.dark },
  },
  {
    id: "em_stoke",
    branch: "ember",
    tier: 2,
    col: 1,
    name: "장작 더 넣기",
    tag: "공격력↑",
    kind: "active",
    maxLevel: 5,
    requires: [{ id: "em_hearth", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 18_000,
    describe: (lv) => `${sec(FX.em_stoke(lv).durMs)} 동안 공격력 +${pct(FX.em_stoke(lv).atk)}.`,
    art: { shape: "sk_logs", main: 0x8a5a30, accent: E.color },
  },
  {
    id: "em_spark",
    branch: "ember",
    tier: 2,
    col: 2,
    name: "튀는 불티",
    tag: "패시브 · 치명타",
    kind: "passive",
    maxLevel: 3,
    requires: [{ id: "em_hearth", level: 1 }],
    ...passive,
    describe: (lv) => `늘 치명타 확률 +${FX.em_spark(lv).crit}%.`,
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
    cooldownMs: () => 9000,
    describe: (lv) => `발밑에서 불의 고리가 터져 둘레(반지름 ${FX.em_ring(lv).radius}) 모든 적에게 공격력의 ${pct(FX.em_ring(lv).mult)} 피해.`,
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
    describe: (lv) => `기본 공격이 맞으면 ${pct(FX.em_ignite(lv).chance)} 확률로 불씨가 터져 둘레 적에게 공격력의 ${pct(FX.em_ignite(lv).mult)} 피해.`,
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
    cooldownMs: () => 12_000,
    describe: (lv) =>
      `가장 가까운 적 자리에 불붙은 장작을 별똥처럼 떨어뜨린다. ${sec(FX.em_meteor(lv).delayMs)} 뒤 둘레 적에게 공격력의 ${pct(FX.em_meteor(lv).mult)} 피해.`,
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
      `그 자리에 화톳불을 놓는다. ${sec(FX.em_brazier(lv).durMs)} 동안 ${sec(FX.em_brazier(lv).everyMs)}마다 둘레 적에게 공격력의 ${pct(FX.em_brazier(lv).mult)} 피해.`,
    art: { shape: "sk_brazier", main: 0x6a6e78, accent: E.color },
  },
  {
    id: "em_bonfire",
    branch: "ember",
    tier: 5,
    col: 1,
    name: "큰 모닥불",
    tag: "궁극 · 3연속 화염",
    kind: "active",
    maxLevel: 3,
    aoe: true,
    requires: [{ id: "em_meteor", level: 3 }],
    sp: (lv) => 36 + 4 * lv,
    cooldownMs: () => 24_000,
    describe: (lv) => `마을 축제의 큰 모닥불을 피운다. 점점 넓어지는 불길이 세 번 솟아 한 번에 공격력의 ${pct(FX.em_bonfire(lv).mult)} 피해.`,
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
    describe: (lv) => `광역 스킬 피해 +${pct(FX.em_ashheart(lv).aoePct)}.`,
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
    describe: (lv) => `앞쪽으로 차가운 입김을 내뿜어 공격력의 ${pct(FX.fr_breath(lv).mult)} 피해, ${sec(FX.fr_breath(lv).slowMs)} 동안 느리게.`,
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
    describe: (lv) => `늘 방어 +${FX.fr_collar(lv).def}, 최대 HP +${pct(FX.fr_collar(lv).hpPct)}.`,
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
    describe: (lv) => `앞쪽 부채꼴로 고드름 ${FX.fr_icicle(lv).n}개를 날린다. 하나에 공격력의 ${pct(FX.fr_icicle(lv).mult)}, 한 마리를 꿰뚫는다.`,
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
    describe: (lv) => `느려지거나 얼어붙은 적이 받는 피해 +${pct(FX.fr_brittle(lv).vsSlowed)}.`,
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
    describe: (lv) => `${sec(FX.fr_ward(lv).durMs)} 동안 최대 HP의 ${pct(FX.fr_ward(lv).shieldPct)}만큼 피해를 대신 받는 얼음 방패.`,
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
      `둘레(반지름 ${FX.fr_nova(lv).radius})에 서리꽃이 피어 공격력의 ${pct(FX.fr_nova(lv).mult)} 피해, ${sec(FX.fr_nova(lv).freezeMs)} 동안 얼려 묶는다.`,
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
      `새벽 안개가 되어 바라보는 쪽으로 ${FX.fr_mist(lv).dist}px 미끄러진다. 지나친 적에게 공격력의 ${pct(FX.fr_mist(lv).mult)} 피해 + 둔화. 미끄러지는 동안은 맞지 않는다.`,
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
      `가장 가까운 적 자리에 얼음 무덤을 솟게 한다. ${sec(FX.fr_tomb(lv).delayMs)} 뒤 공격력의 ${pct(FX.fr_tomb(lv).mult)} 피해, ${sec(FX.fr_tomb(lv).stunMs)} 묶고 받는 피해 +${pct(FX.fr_tomb(lv).vuln)}.`,
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
      `${sec(FX.fr_field(lv).durMs)} 동안 그 자리에 서리밭이 깔린다. 안의 적은 느려지고 받는 피해 +${pct(FX.fr_field(lv).vuln)}, 1초마다 공격력의 ${pct(FX.fr_field(lv).mult)} 피해.`,
    art: { shape: "sk_frostfield", main: F.color, accent: F.dark },
  },
  {
    id: "fr_blizzard",
    branch: "frost",
    tier: 5,
    col: 1,
    name: "한겨울 눈보라",
    tag: "궁극 · 몰아치는 눈보라",
    kind: "active",
    maxLevel: 3,
    aoe: true,
    requires: [{ id: "fr_tomb", level: 3 }],
    sp: () => 40,
    cooldownMs: () => 26_000,
    describe: (lv) =>
      `${sec(FX.fr_blizzard(lv).durMs)} 동안 나를 따라 눈보라가 몰아친다. ${sec(FX.fr_blizzard(lv).everyMs)}마다 둘레 적에게 공격력의 ${pct(FX.fr_blizzard(lv).mult)} 피해 + 둔화.`,
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
    describe: (lv) => `모든 스킬 쿨타임 -${pct(FX.fr_solstice(lv).cdCut)}, 받는 피해 -${pct(FX.fr_solstice(lv).guard)}.`,
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
    describe: (lv) => `넋불 ${FX.so_wisp(lv).n}개가 가까운 적을 따라가 하나에 공격력의 ${pct(FX.so_wisp(lv).mult)} 피해.`,
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
    describe: (lv) => `잠깐(${sec(FX.so_lamp(lv).rootMs)}) 멈춰 등불에 빌어 최대 HP의 ${pct(FX.so_lamp(lv).healPct)} + INT×3을 회복한다.`,
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
    describe: (lv) => `준 피해의 ${pct(FX.so_drain(lv).steal)}만큼 HP를 거둔다.`,
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
      `${sec(FX.so_swift(lv).durMs)} 동안 이동속도 +${pct(FX.so_swift(lv).move)}, 공격 속도 +${pct(FX.so_swift(lv).aspd)}.`,
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
    describe: (lv) => `${sec(FX.so_friend(lv).durMs)} 동안 길동무 넋이 곁에서 공격력의 ${pct(FX.so_friend(lv).atkPct)}로 함께 싸운다.`,
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
      `둘레 적을 넋 사슬로 내 앞에 끌어모아 공격력의 ${pct(FX.so_chain(lv).mult)} 피해, ${sec(FX.so_chain(lv).stunMs)} 묶고 받는 피해 +${pct(FX.so_chain(lv).vuln)}.`,
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
    describe: (lv) => `가장 가까운 적의 반대쪽으로 사라졌다 나타나고 ${sec(FX.so_veil(lv).safeMs)} 동안 피해를 받지 않는다.`,
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
      `가장 가까운 적 자리에 넋 소용돌이를 연다. ${FX.so_harvest(lv).ticks}번 휘몰아치며 한 번에 공격력의 ${pct(FX.so_harvest(lv).mult)} 피해, 맞힌 적마다 HP를 조금 거둔다(한 번에 최대 ${pct(FX.so_harvest(lv).healCap)}).`,
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
      `그 자리에 초롱을 건다. ${sec(FX.so_lantern(lv).durMs)} 동안 가까운 적에게 넋불을 쏘아 공격력의 ${pct(FX.so_lantern(lv).atkPct)} 피해.`,
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
      `별빛을 따라 넋들의 행렬이 지나간다. 둘레(반지름 ${FX.so_procession(lv).radius}) 적에게 두 번 공격력의 ${pct(FX.so_procession(lv).mult)} 피해, 최대 HP의 ${pct(FX.so_procession(lv).healPct)}를 회복.`,
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
    describe: (lv) => `길동무 넋·망자의 초롱 피해 +${pct(FX.so_kinship(lv).summonPct)}, 머무는 시간 +${pct(FX.so_kinship(lv).durPct)}.`,
    art: { shape: "sk_bond", main: S.light, accent: S.color },
  },
];

export const SKILL_IDS = SKILLS.map((s) => s.id) as [SkillId, ...SkillId[]];
export const skillById = (id: string): SkillDef | undefined => SKILLS.find((s) => s.id === id);
export const isActive = (id: string) => skillById(id)?.kind === "active";

/** 배운 패시브를 모아 둔 사냥 보정값 (게임이 판 시작 때 한 번 계산한다) */
export type SkillMods = {
  atkPct: number;
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
  };
}
