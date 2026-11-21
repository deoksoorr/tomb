// 11/19 대표 빌드 8종 (갈래마다 둘): 핵심 스킬 + 받쳐 주는 스킬 둘(연계 보너스 — skillTree SYNERGY).
// 사냥 안내서(components/rpg/HuntGuide.tsx)가 보여 주고, 테스트가 찍는 순서의 모든 단계가 규칙(skillRules)에 맞는지 본다.
// 배분·능력치는 scratchpad 시뮬(실제 게임 1~30층 재현으로 맞춘 것)로 골랐다 — 여덟 빌드 모두 야근 빌딩 막히는 층이 서로 10% 안.
import { skillPointsEarned, type Alloc } from "./skillRules";
import { SKILLS, type BranchId, type SkillId } from "./skillTree";
import type { Stats } from "./catalog";

export type BuildId = "meteor" | "brazier" | "nova" | "tomb" | "procession" | "drain" | "whirl" | "leap";

export type BuildDef = {
  id: BuildId;
  branch: BranchId;
  name: string;
  /** 한 줄 성격 */
  role: string;
  /** 가장 강한 지표 (무리 정리·보스 딜·생존·제어·회복) */
  strong: string;
  /** 약한 곳 */
  weak: string;
  core: SkillId[];
  support: SkillId[];
  /** 찍는 순서: [스킬, 이 랭크까지] — 앞에서부터 한 랭크씩 (모든 단계가 단·선행 조건에 맞는다) */
  order: readonly (readonly [SkillId, number])[];
  /** 초월(★)로 늘어난 포인트: 자기 갈래를 다 채운 뒤 다른 갈래 낮은 단 (생존·버프) */
  extra: readonly (readonly [SkillId, number])[];
  /** 단축 칸 (1~5 + 궁극기 F) */
  hotbar: readonly (SkillId | null)[];
  /** 레벨 50 능력치 (기본 1 포함, 172포인트를 올린 뒤) */
  stats: Stats;
  /** 능력치 한 줄 */
  statNote: string;
};

/** 레벨 50 마공 능력치 (INT로 스킬 위력, STR로 공격력 — 스킬 피해는 공격력 × 위력이라 둘 다 필요해요) */
const MAGE: Stats = { str: 45, agi: 1, vit: 30, int: 71, dex: 30, luk: 1 };
const MAGE_VIT: Stats = { str: 40, agi: 1, vit: 45, int: 61, dex: 30, luk: 1 };
// 11/21 일꾼은 순수 근접 딜러: STR 위주 + 명중 DEX + 공격 속도 AGI, VIT는 조금만 (INT는 일꾼 스킬에 안 들어간다)
const WORKER: Stats = { str: 92, agi: 30, vit: 10, int: 1, dex: 35, luk: 10 };

export const BUILDS: readonly BuildDef[] = [
  {
    id: "meteor",
    branch: "ember",
    name: "별똥비",
    role: "불씨와 불의 고리로 몰아 둔 자리에 별똥 장작을 떨어뜨려요. 층 우두머리를 가장 빨리 녹이는 모닥불이에요.",
    strong: "보스 딜",
    weak: "제어·생존",
    core: ["em_meteor"],
    support: ["em_kindle", "em_ring"],
    order: [
      ["em_kindle", 5],
      ["em_hearth", 1],
      ["em_fan", 2],
      ["em_stoke", 1],
      ["em_kindle", 8],
      ["em_ring", 8],
      ["em_meteor", 3],
      ["em_kindle", 12],
      ["em_ring", 10],
      ["em_meteor", 4],
      ["em_bonfire", 1],
      ["em_meteor", 12],
      ["em_ring", 12],
      ["em_spark", 3],
      ["em_fan", 6],
      ["em_bonfire", 3],
      ["em_hearth", 3],
      ["em_stoke", 3],
      ["em_ignite", 1],
    ],
    extra: [
      ["fr_collar", 5],
      ["fr_ward", 5],
      ["fr_breath", 5],
      ["fr_brittle", 4],
    ],
    hotbar: ["em_meteor", "em_ring", "em_kindle", "em_fan", "em_stoke", "em_bonfire"],
    stats: MAGE,
    statNote: "INT 70 · STR 45 · DEX 30 · VIT 30",
  },
  {
    id: "brazier",
    branch: "ember",
    name: "화톳불 진지",
    role: "화톳불을 놓고 그 둘레를 돌며 몰려드는 무리를 태워요. 기본 공격에 불씨가 옮겨붙어 불길이 끊기지 않아요.",
    strong: "무리 정리",
    weak: "제어·회복",
    core: ["em_brazier"],
    support: ["em_ignite", "em_ashheart"],
    order: [
      ["em_kindle", 1],
      ["em_hearth", 1],
      ["em_kindle", 4],
      ["em_stoke", 1],
      ["em_fan", 2],
      ["em_hearth", 3],
      ["em_spark", 1],
      ["em_stoke", 2],
      ["em_ignite", 5],
      ["em_fan", 5],
      ["em_brazier", 12],
      ["em_ashheart", 3],
      ["em_ring", 2],
      ["em_fan", 8],
      ["em_spark", 3],
      ["em_hearth", 5],
      ["em_fan", 12],
      ["em_ring", 5],
      ["em_meteor", 3],
      ["em_bonfire", 1],
    ],
    extra: [
      ["fr_collar", 5],
      ["fr_ward", 5],
      ["fr_breath", 5],
      ["fr_brittle", 4],
    ],
    hotbar: ["em_brazier", "em_stoke", "em_fan", "em_ring", "em_meteor", "em_bonfire"],
    stats: MAGE,
    statNote: "INT 70 · STR 45 · DEX 30 · VIT 30",
  },
  {
    id: "nova",
    branch: "frost",
    name: "서리꽃 폭발",
    role: "입김으로 늦춘 무리 한가운데서 서리꽃을 터뜨려 얼려요. 살얼음이 얼어붙은 적을 더 아프게 해요.",
    strong: "제어",
    weak: "우두머리 딜",
    core: ["fr_nova"],
    support: ["fr_breath", "fr_brittle"],
    order: [
      ["fr_breath", 5],
      ["fr_collar", 1],
      ["fr_icicle", 2],
      ["fr_brittle", 4],
      ["fr_nova", 5],
      ["fr_breath", 12],
      ["fr_ward", 3],
      ["fr_nova", 12],
      ["fr_tomb", 3],
      ["fr_blizzard", 1],
      ["fr_mist", 4],
      ["fr_icicle", 6],
      ["fr_solstice", 3],
      ["fr_ward", 5],
      ["fr_collar", 5],
    ],
    extra: [
      ["so_lamp", 5],
      ["so_wisp", 5],
      ["so_drain", 5],
      ["so_swift", 3],
    ],
    hotbar: ["fr_nova", "fr_breath", "fr_icicle", "fr_ward", "fr_tomb", "fr_blizzard"],
    stats: MAGE_VIT,
    statNote: "INT 60 · STR 40 · VIT 45 · DEX 30",
  },
  {
    id: "tomb",
    branch: "frost",
    name: "얼음 무덤 저격",
    role: "멀리서 고드름을 뿌리고, 서리밭에 묶인 적 위로 얼음 무덤을 떨어뜨려요. 무덤에 갇힌 우두머리는 더 아프게 맞아요.",
    strong: "보스 딜",
    weak: "받는 피해",
    core: ["fr_tomb"],
    support: ["fr_icicle", "fr_field"],
    order: [
      ["fr_breath", 1],
      ["fr_collar", 4],
      ["fr_icicle", 5],
      ["fr_brittle", 2],
      ["fr_nova", 2],
      ["fr_icicle", 8],
      ["fr_ward", 3],
      ["fr_tomb", 6],
      ["fr_field", 4],
      ["fr_icicle", 12],
      ["fr_tomb", 12],
      ["fr_field", 12],
      ["fr_collar", 5],
      ["fr_breath", 3],
      ["fr_nova", 3],
      ["fr_blizzard", 1],
      ["fr_mist", 1],
      ["fr_brittle", 3],
    ],
    extra: [
      ["so_lamp", 5],
      ["so_wisp", 5],
      ["so_drain", 5],
      ["so_swift", 3],
    ],
    hotbar: ["fr_tomb", "fr_icicle", "fr_field", "fr_ward", "fr_nova", "fr_blizzard"],
    stats: MAGE_VIT,
    statNote: "INT 60 · STR 40 · VIT 45 · DEX 30",
  },
  {
    id: "procession",
    branch: "soul",
    name: "행렬 인도자",
    role: "길동무 넋과 망자의 초롱을 불러 함께 싸워요. 넋들이 앞에서 적을 붙잡아 주니 가장 덜 다치고 오래 버텨요.",
    strong: "생존",
    weak: "부르기 전 첫 몇 초",
    core: ["so_friend", "so_lantern"],
    support: ["so_kinship", "so_chain"],
    order: [
      ["so_lamp", 1],
      ["so_wisp", 2],
      ["so_lamp", 3],
      ["so_friend", 5],
      ["so_friend", 7],
      ["so_chain", 2],
      ["so_chain", 8],
      ["so_lantern", 6],
      ["so_friend", 12],
      ["so_lantern", 12],
      ["so_kinship", 3],
      ["so_chain", 12],
      ["so_drain", 2],
      ["so_wisp", 5],
      ["so_lamp", 5],
      ["so_harvest", 3],
      ["so_procession", 1],
    ],
    extra: [
      ["fr_collar", 5],
      ["fr_ward", 5],
      ["fr_breath", 5],
      ["fr_brittle", 4],
    ],
    hotbar: ["so_friend", "so_lantern", "so_chain", "so_harvest", "so_wisp", "so_procession"],
    stats: MAGE,
    statNote: "INT 70 · STR 45 · DEX 30 · VIT 30",
  },
  {
    id: "drain",
    branch: "soul",
    name: "흡혼 사슬",
    role: "넋 사슬로 끌어 모으고 넋 소용돌이로 한꺼번에 거둬요. 때린 만큼 HP가 차올라 물약 없이 버텨요.",
    strong: "회복",
    weak: "순간 딜",
    core: ["so_chain", "so_harvest"],
    support: ["so_drain", "so_wisp"],
    order: [
      ["so_wisp", 5],
      ["so_drain", 2],
      ["so_wisp", 8],
      ["so_drain", 4],
      ["so_chain", 4],
      ["so_lamp", 1],
      ["so_chain", 8],
      ["so_harvest", 5],
      ["so_drain", 5],
      ["so_wisp", 12],
      ["so_chain", 12],
      ["so_harvest", 12],
      ["so_procession", 1],
      ["so_lamp", 5],
      ["so_swift", 4],
      ["so_procession", 5],
    ],
    extra: [
      ["fr_collar", 5],
      ["fr_ward", 5],
      ["fr_breath", 5],
      ["fr_brittle", 4],
    ],
    hotbar: ["so_chain", "so_harvest", "so_wisp", "so_swift", "so_lamp", "so_procession"],
    stats: MAGE,
    statNote: "INT 70 · STR 45 · DEX 30 · VIT 30",
  },
  {
    id: "whirl",
    branch: "worker",
    name: "회오리 일꾼",
    role: "회오리를 켜고 무리 사이를 걸어 다니며 베어요. 사방 삽질과 손에 익은 삽이 회오리를 더 빠르고 아프게 해요.",
    strong: "무리 정리",
    weak: "스킬 사이 공백",
    core: ["wk_whirl"],
    support: ["wk_callus", "wk_grip"],
    order: [
      ["wk_charge", 1],
      ["wk_callus", 4],
      ["wk_grip", 3],
      ["wk_combo", 2],
      ["wk_charge", 2],
      ["wk_callus", 5],
      ["wk_leap", 2],
      ["wk_tireless", 5],
      ["wk_back", 1],
      ["wk_pack", 3],
      ["wk_whirl", 8],
      ["wk_grip", 5],
      ["wk_whirl", 12],
      ["wk_pack", 5],
      ["wk_deep", 4],
      ["wk_grit", 3],
      ["wk_allnight", 1],
      ["wk_combo", 6],
      ["wk_charge", 5],
      ["wk_back", 5],
      ["wk_leap", 4],
    ],
    extra: [
      ["fr_collar", 5],
      ["fr_ward", 5],
      ["so_lamp", 5],
      ["so_swift", 5],
      ["so_wisp", 4],
    ],
    hotbar: ["wk_whirl", "wk_tireless", "wk_combo", "wk_charge", "wk_leap", "wk_allnight"],
    stats: WORKER,
    statNote: "STR 92 · DEX 35 · AGI 30 · LUK 10 · VIT 10",
  },
  {
    id: "leap",
    branch: "worker",
    name: "도약 일꾼",
    role: "돌진으로 파고들고, 경고가 뜨면 봉분을 뛰어넘어(공중 무적) 피하며 내려찍어요. 깊게 파기로 한 방이 무거워요.",
    strong: "한 방",
    weak: "무리 정리",
    core: ["wk_leap"],
    support: ["wk_charge", "wk_deep"],
    order: [
      ["wk_charge", 4],
      ["wk_callus", 1],
      ["wk_combo", 3],
      ["wk_back", 1],
      ["wk_charge", 7],
      ["wk_leap", 5],
      ["wk_pack", 3],
      ["wk_charge", 10],
      ["wk_deep", 5],
      ["wk_leap", 8],
      ["wk_pack", 5],
      ["wk_charge", 12],
      ["wk_leap", 12],
      ["wk_grit", 3],
      ["wk_whirl", 3],
      ["wk_allnight", 1],
      ["wk_grip", 5],
      ["wk_callus", 4],
      ["wk_combo", 6],
      ["wk_back", 4],
    ],
    extra: [
      ["fr_collar", 5],
      ["fr_ward", 5],
      ["so_lamp", 5],
      ["so_swift", 5],
      ["so_wisp", 4],
    ],
    hotbar: ["wk_leap", "wk_charge", "wk_combo", "wk_whirl", null, "wk_allnight"],
    stats: WORKER,
    statNote: "STR 92 · DEX 35 · AGI 30 · LUK 10 · VIT 10",
  },
];

export const buildById = (id: string): BuildDef | undefined => BUILDS.find((b) => b.id === id);

/** 찍는 순서 전체: 정한 순서 → 자기 갈래 나머지(낮은 단부터 최대 랭크까지) → 다른 갈래(extra) */
export function fullOrder(b: BuildDef): (readonly [SkillId, number])[] {
  const own = SKILLS.filter((d) => d.branch === b.branch)
    .slice()
    .sort((x, y) => x.tier - y.tier)
    .map((d) => [d.id, d.maxLevel] as const);
  return [...b.order, ...own, ...b.extra];
}

/** 찍는 순서를 따라 points포인트만큼 찍은 배분 (순서 끝까지 가면 거기서 멈춘다) */
export function buildAlloc(b: BuildDef, points: number): Alloc {
  const a: Alloc = {};
  let left = Math.max(0, Math.floor(points));
  for (const [id, to] of fullOrder(b)) {
    while (left > 0 && (a[id] ?? 0) < to) {
      a[id] = (a[id] ?? 0) + 1;
      left--;
    }
    if (left <= 0) break;
  }
  return a;
}

/** 안내서의 레벨 기준 (레벨 → 그때까지 받은 스킬 포인트) */
export const GUIDE_LEVELS = [10, 20, 30, 50] as const;
export const buildAtLevel = (b: BuildDef, level: number) => buildAlloc(b, skillPointsEarned(level));

/** 안내서 「추천 찍는 순서」: 레벨 기준마다 새로 찍는 것 (스킬, 이전 랭크 → 이 레벨 랭크) */
export type BuildStep = { level: number; points: number; adds: { id: SkillId; from: number; to: number }[] };
export function buildSteps(b: BuildDef, levels: readonly number[] = GUIDE_LEVELS): BuildStep[] {
  const out: BuildStep[] = [];
  let prev: Alloc = {};
  for (const level of levels) {
    const a = buildAtLevel(b, level);
    const adds: BuildStep["adds"] = [];
    // 찍는 순서에 처음 나온 차례대로
    const seen = new Set<SkillId>();
    for (const [id] of b.order) {
      if (seen.has(id)) continue;
      seen.add(id);
      const from = prev[id] ?? 0;
      const to = a[id] ?? 0;
      if (to > from) adds.push({ id, from, to });
    }
    out.push({ level, points: skillPointsEarned(level), adds });
    prev = a;
  }
  return out;
}
