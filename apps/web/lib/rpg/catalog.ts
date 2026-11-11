// 사냥터(RPG) 카탈로그: 장비·포션·스킬·몬스터·사냥터·난이도. 서버(검증·보상)와 클라이언트(UI·게임)가 같이 쓴다.
// 이름은 회사 생활(월요병·야근·결재·회식)과 누구나 한 번쯤 그만둔 다짐에서 따왔다.

export const STAT_KEYS = ["str", "agi", "vit", "int", "dex", "luk"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, { name: string; desc: string }> = {
  str: { name: "STR", desc: "공격력 (1당 ATK +3)" },
  agi: { name: "AGI", desc: "공격속도·회피·이동속도" },
  vit: { name: "VIT", desc: "최대 HP·방어" },
  int: { name: "INT", desc: "최대 SP·스킬 위력" },
  dex: { name: "DEX", desc: "명중·공격력 조금 (벌레 잡기: 벌레가 오래 보임)" },
  luk: { name: "LUK", desc: "치명타·회피 조금 (벌레 잡기: 황금 벌레)" },
};

/** 장비·버프가 더해 주는 값 */
export type Bonus = Partial<Stats> & {
  atk?: number;
  def?: number;
  hp?: number;
  sp?: number;
  /** 초당 공격 횟수 */
  aspd?: number;
  /** % */
  crit?: number;
  hit?: number;
  flee?: number;
  /** 이동속도 px/s */
  move?: number;
};

export type GearKind = "weapon" | "armor" | "head" | "acc";
export const GEAR_SLOTS = ["weapon", "armor", "head", "acc1", "acc2"] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  head: "머리",
  acc1: "장신구 1",
  acc2: "장신구 2",
};
export const KIND_LABELS: Record<GearKind, string> = { weapon: "무기", armor: "갑옷", head: "머리", acc: "장신구" };
export const slotKind = (slot: GearSlot): GearKind => (slot === "acc1" || slot === "acc2" ? "acc" : slot);

/** 아이콘 그림 종류 (game/rpg/icons.ts가 그린다) + 두 색 */
export type IconArt = { shape: string; main: number; accent: number };

export type GearDef = {
  id: string;
  kind: GearKind;
  name: string;
  desc: string;
  reqLevel: number;
  price: number;
  bonus: Bonus;
  art: IconArt;
  /** 무기: 기본 공격 범위 (없으면 formulas DEFAULT_ATTACK_AREA). 40번 무기 특색에서 무기마다 채운다 */
  area?: { range: number; arcDeg: number };
};

const gear = (
  id: string,
  kind: GearKind,
  name: string,
  desc: string,
  reqLevel: number,
  price: number,
  bonus: Bonus,
  art: IconArt,
  area?: GearDef["area"],
): GearDef => ({ id, kind, name, desc, reqLevel, price, bonus, art, ...(area ? { area } : {}) });

export const GEAR: readonly GearDef[] = [
  // ── 무기 ──
  gear("w_ruler", "weapon", "나무 자", "책상 서랍에서 나온 30cm 자. 생각보다 아프다.", 1, 30, { atk: 6 }, { shape: "ruler", main: 0xc89a5a, accent: 0x5a3e22 }),
  gear("w_keyboard", "weapon", "기계식 키보드", "때릴 때마다 딸깍딸깍. 옆자리가 쳐다본다.", 5, 120, { atk: 15, aspd: 0.1 }, { shape: "keyboard", main: 0x3a3f4a, accent: 0xe8d9b0 }),
  gear("w_duck", "weapon", "삑삑 오리 망치", "때릴 때마다 삑. 사무실 스트레스 해소용.", 10, 260, { atk: 25, crit: 5 }, { shape: "duck", main: 0xf0c83c, accent: 0xe07a2a }),
  gear("w_monitor_arm", "weapon", "장우산 창", "비 오는 출근길의 동반자. 길고 단단해서 멀리서 찌른다.", 15, 420, { atk: 35, hit: 10 }, { shape: "spear", main: 0x9aa3ad, accent: 0x2a2e36 }, { range: 36, arcDeg: 70 }),
  gear("w_refactor", "weapon", "효율의 검", "같은 일을 더 적은 손짓으로 벤다.", 22, 700, { atk: 52, aspd: 0.15 }, { shape: "sword", main: 0xbcd8e8, accent: 0x5a7aa8 }),
  gear("w_legacy_axe", "weapon", "서류 정리 도끼", "무겁고 느리지만, 누구도 건드리지 못하던 서류 더미를 쪼갠다.", 30, 1000, { atk: 74, str: 3, aspd: -0.1 }, { shape: "axe", main: 0x8a6a4a, accent: 0xb0b8c0 }),
  gear("w_compiler", "weapon", "전설의 법인카드", "한도 없음. 전설로만 전해진다.", 40, 1600, { atk: 98, crit: 8, dex: 3 }, { shape: "chip", main: 0x55704f, accent: 0xffe39a }),
  // ── 갑옷 ──
  gear("a_hoodie", "armor", "후드티", "회색. 모든 재택근무자의 기본 방어구.", 1, 30, { def: 3, hp: 20 }, { shape: "hoodie", main: 0x6e7076, accent: 0x4a4c52 }),
  gear("a_flannel", "armor", "체크 셔츠", "사흘째 야근 중인 사람의 갑옷.", 6, 120, { def: 7, hp: 45 }, { shape: "shirt", main: 0xa83c3c, accent: 0x3a2020 }),
  gear("a_laptop_bag", "armor", "방탄 노트북 가방", "충전기와 마우스와 희망이 들어 있다.", 12, 300, { def: 13, hp: 85 }, { shape: "bag", main: 0x2e3440, accent: 0x88c0d0 }),
  gear("a_standing_desk", "armor", "스탠딩 데스크 갑주", "서서 버티는 자세가 몸에 밴다.", 20, 600, { def: 21, hp: 140, vit: 2 }, { shape: "plate", main: 0x8a8f98, accent: 0xd0d4da }),
  gear("a_server_rack", "armor", "철제 캐비닛 아머", "서랍 여닫는 소리가 요란하다. 아무것도 안 뚫린다.", 32, 1100, { def: 31, hp: 230 }, { shape: "rack", main: 0x24282e, accent: 0x6ad07a }),
  // ── 머리 ──
  gear("h_cap", "head", "야구모자", "머리 안 감은 날의 친구.", 1, 20, { def: 1, flee: 3 }, { shape: "cap", main: 0x3c5a8a, accent: 0xe8d9b0 }),
  gear("h_headset", "head", "노이즈캔슬링 헤드셋", "부장님 호출이 들리지 않는다.", 8, 150, { def: 3, sp: 20, int: 2 }, { shape: "headset", main: 0x2a2a30, accent: 0xc8a050 }),
  gear("h_vr", "head", "VR 고글", "앞이 더 잘 보인다고 주장한다.", 18, 380, { def: 5, hit: 12, dex: 3 }, { shape: "goggles", main: 0xe8e8ec, accent: 0x5a3e8a }),
  gear("h_crown", "head", "정시 퇴근 왕관", "딱 한 번 정시에 퇴근한 자의 증표.", 28, 800, { def: 8, luk: 5, sp: 30 }, { shape: "crown", main: 0xe8b830, accent: 0xc83c5a }),
  // ── 장신구 ──
  gear("c_earphones", "acc", "유선 이어폰", "꼬여 있지만 끊기지 않는다.", 1, 25, { agi: 1, flee: 2 }, { shape: "earphones", main: 0xf2f2f2, accent: 0x9aa3ad }),
  gear("c_sticker", "acc", "행운의 스티커", "노트북에 붙여 둔 고양이 스티커.", 3, 90, { luk: 4, crit: 2 }, { shape: "sticker", main: 0xffb0c8, accent: 0x5a3e4a }),
  gear("c_smartwatch", "acc", "스마트워치", "일어나라고 재촉한다. 덕분에 빠르다.", 7, 160, { agi: 3, flee: 5 }, { shape: "watch", main: 0x2a2e36, accent: 0x6ad0c8 }),
  gear("c_ide_ring", "acc", "단축키 반지", "복사·붙여넣기가 손끝에서 흐른다.", 14, 280, { dex: 4, hit: 8 }, { shape: "ring", main: 0xc8a050, accent: 0x5a8ac8 }),
  gear("c_mug", "acc", "끝없는 머그컵", "식지도 비지도 않는다.", 20, 420, { int: 3, sp: 40 }, { shape: "mug", main: 0xe8d9b0, accent: 0x6a4a30 }),
  gear("c_grass_badge", "acc", "개근 배지", "1년 내내 지각 한 번 없던 기록.", 26, 600, { str: 3, vit: 3 }, { shape: "badge", main: 0x40a050, accent: 0x205028 }),
];

export const gearById = (id: string): GearDef | undefined => GEAR.find((g) => g.id === id);

// ── 포션 (쌓임, 사냥터에서 단축키로 마심) ──

export type PotionDef = {
  id: string;
  name: string;
  desc: string;
  price: number;
  hp?: number;
  sp?: number;
  /** 쓰러지면 자동으로 먹고 HP 50%로 일어난다 (한 판에 1번) */
  revive?: boolean;
  /** 단축키 (부활 쿠키는 자동) */
  key?: string;
  art: IconArt;
};

export const POTIONS: readonly PotionDef[] = [
  { id: "p_coffee", name: "커피", desc: "HP 150 회복", price: 8, hp: 150, key: "Q", art: { shape: "cup", main: 0x6a4a30, accent: 0xe8d9b0 } },
  { id: "p_energy", name: "에너지드링크", desc: "SP 60 회복", price: 10, sp: 60, key: "E", art: { shape: "can", main: 0x3c8ac8, accent: 0xf0f0f0 } },
  { id: "p_lunchbox", name: "야근 도시락", desc: "HP 400·SP 120 회복", price: 30, hp: 400, sp: 120, key: "R", art: { shape: "box", main: 0xc85a3c, accent: 0xf2ead3 } },
  { id: "p_cookie", name: "부활 쿠키", desc: "쓰러지면 자동으로 먹고 HP 50%로 일어나요 (한 판에 1번)", price: 60, revive: true, art: { shape: "cookie", main: 0xc89a5a, accent: 0x5a3e22 } },
];

export const potionById = (id: string): PotionDef | undefined => POTIONS.find((p) => p.id === id);
export const POTION_MAX_STACK = 99;
/** 같은 포션을 다시 마실 수 있을 때까지 (ms) */
export const POTION_COOLDOWN_MS = 1200;

// ── 스킬 (직업 없음: 누구나 모든 스킬을 배운다) ──

export type SkillId =
  | "refactor"
  | "hotfix"
  | "rollback"
  | "cache_hit"
  | "debugging"
  | "pair_prog"
  | "code_review"
  | "overtime"
  | "deploy"
  | "coffee_break";

export type SkillDef = {
  id: SkillId;
  name: string;
  /** 한 단어 효과 */
  tag: string;
  maxLevel: number;
  reqLevel: number;
  requires?: { id: SkillId; level: number }[];
  sp: (lv: number) => number;
  cooldownMs: (lv: number) => number;
  /** 레벨별 효과 설명 */
  describe: (lv: number) => string;
  art: IconArt;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** 스킬 수치. 게임(효과)과 UI(설명)가 같이 쓴다 */
export const SKILL_FX = {
  refactor: (lv: number) => ({ mult: 1.6 + 0.3 * lv, range: 30 }),
  hotfix: (lv: number) => ({ healPct: 0.12 + 0.05 * lv }),
  rollback: (lv: number) => ({ durMs: 1000 + 300 * lv }),
  cache_hit: (lv: number) => ({ speed: 0.2 + 0.08 * lv, durMs: 8000 }),
  debugging: (lv: number) => ({ crit: 8 * lv, durMs: 10_000 }),
  pair_prog: (lv: number) => ({ durMs: 8000 + 2000 * lv, atkPct: 0.3 + 0.1 * lv }),
  code_review: (lv: number) => ({ vuln: 0.1 * lv, slow: 0.25, durMs: 6000, radius: 70 }),
  overtime: (lv: number) => ({ atk: 0.15 * lv, hpDrainPct: 0.02, durMs: 10_000 }),
  deploy: (lv: number) => ({ mult: 1.2 + 0.25 * lv, radius: 64 }),
  coffee_break: (lv: number) => ({ spPct: 0.2 + 0.1 * lv, rootMs: 800 }),
} as const;

export const SKILLS: readonly SkillDef[] = [
  {
    id: "refactor",
    name: "결재판 치기",
    tag: "강타",
    maxLevel: 5,
    reqLevel: 1,
    sp: (lv) => 5 + lv,
    cooldownMs: () => 2500,
    describe: (lv) => `앞의 적 하나를 공격력의 ${pct(SKILL_FX.refactor(lv).mult)}로 내려친다.`,
    art: { shape: "sk_slash", main: 0xbcd8e8, accent: 0x5a7aa8 },
  },
  {
    id: "hotfix",
    name: "급한 불 끄기",
    tag: "회복",
    maxLevel: 5,
    reqLevel: 2,
    sp: (lv) => 10 + 2 * lv,
    cooldownMs: () => 8000,
    describe: (lv) => `최대 HP의 ${pct(SKILL_FX.hotfix(lv).healPct)} + INT×3을 회복한다.`,
    art: { shape: "sk_cross", main: 0x6ad07a, accent: 0x205028 },
  },
  {
    id: "rollback",
    name: "못 들은 척",
    tag: "잠깐 무적",
    maxLevel: 3,
    reqLevel: 8,
    requires: [{ id: "hotfix", level: 2 }],
    sp: () => 15,
    cooldownMs: () => 20_000,
    describe: (lv) => `${(SKILL_FX.rollback(lv).durMs / 1000).toFixed(1)}초 동안 어떤 피해도 받지 않는다.`,
    art: { shape: "sk_undo", main: 0xc8a0e8, accent: 0x5a3e8a },
  },
  {
    id: "cache_hit",
    name: "칼퇴 질주",
    tag: "이동속도",
    maxLevel: 5,
    reqLevel: 3,
    sp: () => 8,
    cooldownMs: () => 15_000,
    describe: (lv) => `8초 동안 이동속도 +${pct(SKILL_FX.cache_hit(lv).speed)}.`,
    art: { shape: "sk_bolt", main: 0xffe39a, accent: 0xc8a050 },
  },
  {
    id: "debugging",
    name: "매의 눈",
    tag: "치명타↑",
    maxLevel: 5,
    reqLevel: 5,
    requires: [{ id: "refactor", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 18_000,
    describe: (lv) => `10초 동안 치명타 확률 +${SKILL_FX.debugging(lv).crit}%.`,
    art: { shape: "sk_bug", main: 0x6ad0c8, accent: 0x205050 },
  },
  {
    id: "pair_prog",
    name: "입사 동기 소환",
    tag: "도우미 소환",
    maxLevel: 5,
    reqLevel: 12,
    requires: [{ id: "code_review", level: 2 }],
    sp: () => 20,
    cooldownMs: () => 30_000,
    describe: (lv) =>
      `${SKILL_FX.pair_prog(lv).durMs / 1000}초 동안 입사 동기 유령이 곁에서 공격력의 ${pct(SKILL_FX.pair_prog(lv).atkPct)}로 함께 싸운다.`,
    art: { shape: "sk_pair", main: 0xd9dccf, accent: 0x55704f },
  },
  {
    id: "code_review",
    name: "빨간 펜 첨삭",
    tag: "적 약화",
    maxLevel: 5,
    reqLevel: 6,
    sp: () => 12,
    cooldownMs: () => 14_000,
    describe: (lv) => `주변 적이 6초 동안 받는 피해 +${pct(SKILL_FX.code_review(lv).vuln)}, 이동속도 -25%.`,
    art: { shape: "sk_eye", main: 0xe8d9b0, accent: 0xa83c3c },
  },
  {
    id: "overtime",
    name: "야근",
    tag: "공격력↑·HP 감소",
    maxLevel: 5,
    reqLevel: 10,
    requires: [{ id: "coffee_break", level: 1 }],
    sp: () => 5,
    cooldownMs: () => 20_000,
    describe: (lv) => `10초 동안 공격력 +${pct(SKILL_FX.overtime(lv).atk)}, 대신 매초 최대 HP의 2%를 잃는다.`,
    art: { shape: "sk_moon", main: 0xffe39a, accent: 0x2a2e48 },
  },
  {
    id: "deploy",
    name: "전체 회신",
    tag: "광역",
    maxLevel: 5,
    reqLevel: 15,
    requires: [{ id: "refactor", level: 3 }],
    sp: (lv) => 18 + 2 * lv,
    cooldownMs: () => 9000,
    describe: (lv) => `주변 모든 적에게 공격력의 ${pct(SKILL_FX.deploy(lv).mult)} 피해.`,
    art: { shape: "sk_rocket", main: 0xe07a2a, accent: 0xf2f2f2 },
  },
  {
    id: "coffee_break",
    name: "커피 브레이크",
    tag: "SP 회복",
    maxLevel: 3,
    reqLevel: 4,
    sp: () => 0,
    cooldownMs: () => 40_000,
    describe: (lv) => `잠깐 멈춰 서서 최대 SP의 ${pct(SKILL_FX.coffee_break(lv).spPct)}를 회복한다.`,
    art: { shape: "sk_cup", main: 0x6a4a30, accent: 0xe8d9b0 },
  },
];

export const skillById = (id: string): SkillDef | undefined => SKILLS.find((s) => s.id === id);
export const HOTBAR_SIZE = 6;

// ── 난이도 ──

export const DIFFICULTIES = ["easy", "normal", "hard", "hell"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type DifficultyDef = {
  id: Difficulty;
  name: string;
  /** 권장 레벨 */
  recLevel: number;
  /** 몬스터 레벨 (명중·회피 계산) */
  monsterLevel: number;
  hpMul: number;
  atkMul: number;
  defMul: number;
  expMul: number;
  /** 한 판 최대 포인트 (사냥터 / 미니게임) */
  huntPoints: number;
  miniPoints: number;
  /** 미니게임 한 판 최대 EXP */
  miniExp: number;
  /** 드롭 확률 (굴림 1번당, 43번에서 절반으로: 0.15/0.2/0.25/0.3 → 0.08/0.1/0.12/0.15). 우두머리 장비는 따로 확정 */
  dropChance: number;
  /** 드롭 장비의 요구 레벨 상한 */
  dropMaxLevel: number;
};

export const DIFFS: Record<Difficulty, DifficultyDef> = {
  easy: { id: "easy", name: "쉬움", recLevel: 1, monsterLevel: 3, hpMul: 1, atkMul: 1, defMul: 1, expMul: 1, huntPoints: 20, miniPoints: 12, miniExp: 40, dropChance: 0.08, dropMaxLevel: 8 },
  normal: { id: "normal", name: "보통", recLevel: 8, monsterLevel: 12, hpMul: 2.6, atkMul: 2.3, defMul: 2.5, expMul: 2.6, huntPoints: 35, miniPoints: 20, miniExp: 90, dropChance: 0.1, dropMaxLevel: 18 },
  hard: { id: "hard", name: "어려움", recLevel: 18, monsterLevel: 24, hpMul: 6, atkMul: 4.6, defMul: 5, expMul: 5.5, huntPoints: 55, miniPoints: 30, miniExp: 180, dropChance: 0.12, dropMaxLevel: 30 },
  hell: { id: "hell", name: "지옥", recLevel: 30, monsterLevel: 38, hpMul: 13, atkMul: 8.5, defMul: 9, expMul: 11, huntPoints: 80, miniPoints: 45, miniExp: 320, dropChance: 0.15, dropMaxLevel: 50 },
};

// ── 몬스터 ──

export type MonsterBehavior =
  | "chase" // 쫓아와서 몸통 박치기
  | "dash" // 잠깐 멈췄다가 돌진
  | "wander" // 방향을 자꾸 바꾼다
  | "ranged" // 떨어져서 쏜다
  | "explode" // 붙으면 터진다
  | "split" // 죽으면 둘로 갈라진다
  | "blink" // 사라졌다 나타난다
  | "boss";

export type MonsterId =
  | "scope_creep"
  | "endless_meeting"
  | "tech_debt_slime"
  | "already_exists"
  | "req_change"
  | "merge_conflict"
  | "conflict_shard"
  | "server_bill"
  | "opposing_lead"
  | "legacy_golem"
  | "burnout_wraith"
  | "prod_dragon";

export type MonsterDef = {
  id: MonsterId;
  name: string;
  desc: string;
  /** 쉬움 기준 */
  hp: number;
  atk: number;
  def: number;
  /** px/s */
  speed: number;
  exp: number;
  behavior: MonsterBehavior;
  /** 몸 크기 (픽셀, 스프라이트 한 변) */
  size: number;
  color: number;
  accent: number;
};

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  scope_creep: { id: "scope_creep", name: "추가 업무", desc: "\"이것만 하나 더\"가 조금씩, 아주 조금씩 불어난다.", hp: 40, atk: 7, def: 0, speed: 34, exp: 6, behavior: "chase", size: 14, color: 0x8ac85a, accent: 0x3a5a28 },
  endless_meeting: { id: "endless_meeting", name: "끝없는 회의", desc: "끝날 듯 끝나지 않는다. 느리지만 질기다.", hp: 90, atk: 6, def: 3, speed: 20, exp: 10, behavior: "chase", size: 16, color: 0x9aa3ad, accent: 0x4a4f58 },
  tech_debt_slime: { id: "tech_debt_slime", name: "미룬 일 슬라임", desc: "\"내일부터\"라고 미뤄 둘수록 끈적해진다.", hp: 70, atk: 8, def: 2, speed: 26, exp: 9, behavior: "chase", size: 14, color: 0x6a8a3c, accent: 0x2e3e1a },
  already_exists: { id: "already_exists", name: "\"그거 해 봤는데\" 유령", desc: "나타났다 사라지며 의욕을 빨아먹는다.", hp: 55, atk: 9, def: 0, speed: 40, exp: 11, behavior: "blink", size: 14, color: 0xd9dccf, accent: 0x6a6e78 },
  req_change: { id: "req_change", name: "오락가락 지시", desc: "아침 지시와 저녁 지시가 다르다. 어디로 갈지 아무도 모른다.", hp: 50, atk: 10, def: 1, speed: 52, exp: 10, behavior: "wander", size: 12, color: 0xe07a2a, accent: 0x6a3010 },
  merge_conflict: { id: "merge_conflict", name: "겹친 약속", desc: "쓰러뜨리면 둘로 갈라진다. 둘 다 가야 한다.", hp: 80, atk: 9, def: 2, speed: 30, exp: 12, behavior: "split", size: 15, color: 0xc83c5a, accent: 0x3c8ac8 },
  conflict_shard: { id: "conflict_shard", name: "반쪽 약속", desc: "갈라진 약속 조각.", hp: 25, atk: 6, def: 0, speed: 46, exp: 3, behavior: "chase", size: 9, color: 0xc83c5a, accent: 0x3c8ac8 },
  server_bill: { id: "server_bill", name: "카드값 폭탄", desc: "다가와서 터진다. 청구서는 늘 갑자기 온다.", hp: 35, atk: 22, def: 0, speed: 44, exp: 9, behavior: "explode", size: 13, color: 0x3a3f4a, accent: 0xe84040 },
  opposing_lead: { id: "opposing_lead", name: "잔소리 부장님", desc: "\"그게 돈이 돼?\" 거리를 두고 잔소리를 던진다.", hp: 160, atk: 11, def: 4, speed: 28, exp: 24, behavior: "ranged", size: 16, color: 0x5a6a8a, accent: 0xe8d9b0 },
  legacy_golem: { id: "legacy_golem", name: "서류 더미 골렘", desc: "10년 치 서류가 뭉쳐 일어났다. 단단하고 무겁다.", hp: 260, atk: 15, def: 8, speed: 18, exp: 30, behavior: "dash", size: 20, color: 0x8a7a5a, accent: 0x4a3e2a },
  burnout_wraith: { id: "burnout_wraith", name: "월요병 망령", desc: "닿기만 해도 기운이 빠진다.", hp: 120, atk: 14, def: 2, speed: 38, exp: 22, behavior: "blink", size: 16, color: 0x5a3e8a, accent: 0xc8a0e8 },
  prod_dragon: { id: "prod_dragon", name: "칼퇴 방해 드래곤", desc: "금요일 저녁 6시, 퇴근 5분 전에 깨어난다.", hp: 1400, atk: 20, def: 6, speed: 24, exp: 220, behavior: "boss", size: 32, color: 0xa83c3c, accent: 0xffb040 },
};

export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];

// ── 사냥터 (난이도마다 장소가 다르다) ──

export type ZoneDef = {
  difficulty: Difficulty;
  /** 함께 사냥 방 id에 쓰는 영문 이름 (`hunt:{slug}:{difficulty}`) */
  slug: string;
  name: string;
  desc: string;
  /** 일반 웨이브에 나오는 몬스터 */
  pool: MonsterId[];
  /** 마지막 웨이브 우두머리 */
  boss: MonsterId;
  waves: number;
  timeLimitSec: number;
  /** 바닥 두 색, 장식 색 */
  floor: [number, number];
  deco: number;
};

export const ZONES: Record<Difficulty, ZoneDef> = {
  easy: {
    difficulty: "easy",
    slug: "meeting-room",
    name: "월요일 회의실",
    desc: "새 다짐이 처음으로 반대에 부딪히는 곳.",
    pool: ["scope_creep", "endless_meeting", "req_change"],
    boss: "opposing_lead",
    waves: 4,
    timeLimitSec: 150,
    floor: [0x3a3830, 0x34322b],
    deco: 0x8a7a5a,
  },
  normal: {
    difficulty: "normal",
    slug: "legacy-forest",
    name: "야근 사무실",
    desc: "아무도 손대지 못한 서류가 나무처럼 쌓여 있다.",
    pool: ["tech_debt_slime", "already_exists", "merge_conflict", "req_change", "scope_creep"],
    boss: "legacy_golem",
    waves: 5,
    timeLimitSec: 180,
    floor: [0x2c3a2a, 0x283524],
    deco: 0x55704f,
  },
  hard: {
    difficulty: "hard",
    slug: "deadline-swamp",
    name: "결재 늪",
    desc: "올린 결재는 돌아오지 않고, 발을 디딜수록 일정이 가라앉는다.",
    pool: ["merge_conflict", "server_bill", "opposing_lead", "legacy_golem", "tech_debt_slime"],
    boss: "prod_dragon",
    waves: 6,
    timeLimitSec: 210,
    floor: [0x26302e, 0x222a28],
    deco: 0x4a6a5a,
  },
  hell: {
    difficulty: "hell",
    slug: "burnout-abyss",
    name: "회식 3차",
    desc: "모든 다짐이 마지막으로 무너지는 곳. 아무도 먼저 못 일어난다.",
    pool: ["burnout_wraith", "server_bill", "legacy_golem", "already_exists", "opposing_lead", "merge_conflict"],
    boss: "prod_dragon",
    waves: 7,
    timeLimitSec: 240,
    floor: [0x241e2c, 0x201a28],
    deco: 0x5a3e8a,
  },
};

// ── 미니게임 ──

export const GAME_KINDS = ["hunt", "bugs", "stars"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAMES: Record<GameKind, { name: string; desc: string; how: string; statNote: string }> = {
  hunt: {
    name: "사냥터",
    desc: "다짐을 망치는 것들을 웨이브마다 물리친다. 장비·스킬·포션을 모두 쓴다.",
    how: "WASD/방향키 이동 · Space/J 공격(누르고 있으면 계속 공격, 앞쪽 부채꼴 안의 적을 모두 때림) · 마우스·손가락을 누르고 있으면 그쪽으로 계속 공격 · 1~6 스킬 · Q/E/R 포션 · Esc 멈춤",
    statNote: "모든 능력치와 장비가 그대로 쓰인다",
  },
  bugs: {
    name: "벌레 잡기",
    desc: "아홉 개의 창에서 튀어나오는 벌레를 잡는다. 초록 체크 표시와 줄 그어진 회색 '이미 잡은 벌레'는 건드리지 말 것. 콤보가 쌓일수록 점수 배수가 오른다.",
    how: "클릭·탭, 또는 Q W E / A S D / Z X C 키로 칸을 누른다",
    statNote: "DEX: 벌레가 조금 더 오래 보임 · LUK: 황금 벌레가 더 자주",
  },
  stars: {
    name: "별자리 잇기",
    desc: "끝내지 못한 다짐들이 밤하늘의 별로 떠오른다. 빛의 고리가 별에 닿는 순간 눌러 하나의 별자리로 잇는다.",
    how: "고리가 별에 겹치는 순간 Space·J·클릭·탭 (어디를 눌러도 다음 별) · 너무 일찍 누르면 놓침",
    statNote: "DEX: 판정이 조금 너그러워짐",
  },
};

/** 미니게임 시간 (초) */
export const MINI_TIME_SEC: Record<Exclude<GameKind, "hunt">, number> = { bugs: 60, stars: 75 };

export const timeLimitSec = (game: GameKind, d: Difficulty) => (game === "hunt" ? ZONES[d].timeLimitSec : MINI_TIME_SEC[game]);
