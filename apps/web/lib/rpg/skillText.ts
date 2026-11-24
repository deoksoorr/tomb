// 스킬 트리 창·안내서가 보여 주는 스킬 설명 (한 줄 요약·유형 태그·랭크별 수치 표·시너지·선행 조건·분위기 문장).
// 수치는 모두 skillTree.ts의 SKILL_FX·sp·cooldownMs에서 읽는다 → 밸런스가 바뀌면 설명도 같이 바뀐다.
// 시너지는 실제 규칙(패시브 보정·약화·둔화·끌어오기·공격력 버프)에 있는 것만 적는다. 판정은 게임·서버가 한다.
import { BRANCH_INFO, SKILL_FX, skillById, SKILLS, SYNERGY, SYNERGY_GUARD, synergyGuardOf, synergyGuardPerRank, synergyMul, synergyTargets, TIERS, type SkillDef, type SkillId } from "./skillTree";
import { spentIn, tierGate, type Alloc } from "./skillRules";

/** 스킬 유형 태그 (아이콘 + 글자) */
export type SkillTypeTag =
  | "active"
  | "passive"
  | "ultimate"
  | "melee"
  | "ranged"
  | "aoe"
  | "field"
  | "projectile"
  | "delayed"
  | "basic"
  | "control"
  | "buff"
  | "defense"
  | "heal"
  | "summon"
  | "move";

export const TYPE_TAG_LABEL: Record<SkillTypeTag, string> = {
  active: "액티브",
  passive: "패시브",
  ultimate: "궁극기",
  melee: "근접",
  ranged: "원거리",
  aoe: "광역",
  field: "장판",
  projectile: "투사체",
  delayed: "지연 폭발",
  basic: "기본 공격",
  control: "제어",
  buff: "강화",
  defense: "방어",
  heal: "회복",
  summon: "소환",
  move: "이동",
};

/** 7×7 도트 그림 (# = 칠함). 태그 아이콘 */
export const TYPE_TAG_GLYPH: Record<SkillTypeTag, readonly string[]> = {
  active: ["...#...", "..##...", ".###...", "#######", "...###.", "...##..", "...#..."],
  passive: [".#####.", "#.....#", "#.###.#", "#.#.#.#", "#.###.#", "#.....#", ".#####."],
  ultimate: ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "##...##"],
  melee: ["......#", ".....#.", "....#..", "#..#...", ".##....", ".##....", "#..#..."],
  ranged: ["...#...", "....#..", "#######", "....#..", "...#...", ".......", "......."],
  aoe: ["..###..", ".#...#.", "#..#..#", "#.###.#", "#..#..#", ".#...#.", "..###.."],
  field: [".......", ".......", "..###..", ".#####.", "#######", ".#####.", "..###.."],
  projectile: [".......", "....##.", "#.####.", ".######", "#.####.", "....##.", "......."],
  delayed: ["#######", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#####.", "#######"],
  basic: ["#......", ".#.....", "..#....", "...#.#.", "....#..", "...#.#.", "......#"],
  control: ["#.#.#.#", ".#####.", "##.#.##", ".##.##.", "##.#.##", ".#####.", "#.#.#.#"],
  buff: ["...#...", "..###..", ".#####.", "...#...", "...#...", "...#...", "...#..."],
  defense: ["#######", "#.....#", "#.###.#", "#.###.#", ".#.#.#.", "..#.#..", "...#..."],
  heal: ["..###..", "..###..", "#######", "#######", "#######", "..###..", "..###.."],
  summon: ["..###..", ".#####.", "##.#.##", "#######", "#######", "#.#.#.#", "......."],
  move: ["..#....", "...#...", "####.#.", "...#..#", "####.#.", "...#...", "..#...."],
};

export type Synergy = { with: SkillId[]; text: string };

export type SkillText = {
  /** 한 줄 요약 */
  summary: string;
  /** 짧은 분위기 문장 */
  flavor: string;
  /** 유형 태그 (액티브/패시브/궁극기는 자동으로 앞에 붙는다) */
  types: SkillTypeTag[];
  synergy: Synergy[];
};

const AOE_IDS = SKILLS.filter((s) => s.aoe).map((s) => s.id);
const SLOWERS: SkillId[] = ["fr_breath", "fr_icicle", "fr_nova", "fr_mist", "fr_tomb", "fr_field", "fr_blizzard", "so_chain"];

export const SKILL_TEXT: Record<SkillId, SkillText> = {
  // ── 모닥불지기 ──
  em_kindle: {
    summary: "가장 가까운 적에게 불씨를 튕겨요. 맞은 자리가 작게 터져요.",
    flavor: "모닥불에서 톡 튄 불씨 하나, 그게 시작이었다.",
    types: ["ranged", "projectile"],
    synergy: [{ with: ["so_chain"], text: "사슬로 한데 모인 적들이 작은 폭발에 같이 휘말려요" }],
  },
  em_hearth: {
    summary: "마공 스킬(모닥불, 서리, 넋)의 공격력이 올라요. 기본 공격과 일꾼 스킬에는 적용되지 않아요.",
    flavor: "화롯가에 손을 녹이면, 무거운 삽도 가볍다.",
    types: ["buff"],
    synergy: [{ with: ["so_friend", "so_lantern"], text: "길동무 넋과 초롱도 내 공격력을 따라 같이 세져요" }],
  },
  em_fan: {
    summary: "전방 부채꼴로 불길을 뿜어 여러 마리를 한꺼번에 태워요.",
    flavor: "부채 한 번에 불길이 들판처럼 번진다.",
    types: ["melee", "aoe"],
    synergy: [{ with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" }],
  },
  em_stoke: {
    summary: "잠시 마공 스킬 공격력이 크게 올라요. 주력 스킬을 쓰기 전에 사용하세요.",
    flavor: "장작 하나 더. 밤은 아직 길다.",
    types: ["buff"],
    synergy: [
      { with: ["em_bonfire", "em_meteor"], text: "켜 둔 동안 오른 공격력이 그대로 적용돼요" },
      { with: ["so_friend", "so_lantern"], text: "길동무 넋과 초롱도 내 공격력을 따라 세져요" },
    ],
  },
  em_spark: {
    summary: "마공 스킬의 치명타 확률이 올라요. 기본 공격과 일꾼 스킬에는 적용되지 않아요.",
    flavor: "탁, 탁. 불티는 늘 엉뚱한 데로 튄다.",
    types: ["buff"],
    synergy: [{ with: ["fr_icicle", "so_wisp"], text: "여러 번 때리는 스킬일수록 치명타가 자주 터져요" }],
  },
  em_ring: {
    summary: "내 발밑에서 불의 고리가 터져 주변 적을 모두 태워요.",
    flavor: "둘러앉은 모닥불처럼, 빙 둘러 붉게.",
    types: ["melee", "aoe"],
    synergy: [
      { with: ["so_chain"], text: "사슬로 끌어모은 적을 한 마리도 놓치지 않아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  em_ignite: {
    summary: "기본 공격이나 삽날 회오리가 적중하면 일정 확률로 불씨가 터져 주변 적에게도 피해를 줘요. 불씨 피해는 INT가 적용되는 마공이에요.",
    flavor: "스친 자리마다 불씨가 남는다.",
    types: ["basic"],
    synergy: [{ with: ["so_swift"], text: "공격 속도가 오르면 기본 공격이 잦아져 더 자주 터져요" }],
  },
  em_meteor: {
    summary: "가장 가까운 적 위치에 불붙은 장작을 떨어뜨려요. 잠시 후 크게 폭발해요.",
    flavor: "별똥이 떨어지면 소원을 빌라고? 여기선 장작이 떨어진다.",
    types: ["ranged", "aoe", "delayed"],
    synergy: [
      { with: ["fr_tomb", "so_chain"], text: "적을 묶어 두면 떨어질 때까지 도망가지 못해요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  em_brazier: {
    summary: "바로 앞에 화톳불을 설치해 주변 적에게 지속 피해를 줘요.",
    flavor: "불 꺼진 마을에 화톳불 하나, 다가오는 것은 모두 그을린다.",
    types: ["field", "aoe"],
    synergy: [
      { with: ["so_chain", "fr_nova"], text: "적을 불 위에 묶어 두면 여러 번 맞아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 매번 피해가 더 올라요" },
    ],
  },
  em_bonfire: {
    summary: "불기둥이 화면을 덮어 화면 안의 모든 적에게 여러 번 피해를 줘요.",
    flavor: "축제의 밤, 마을 한가운데 큰 불이 오른다.",
    types: ["melee", "aoe"],
    synergy: [
      { with: ["em_stoke"], text: "오른 공격력이 모든 타격에 적용돼요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  em_ashheart: {
    summary: "광역 스킬 피해가 올라요.",
    flavor: "다 타고 남은 재 속에도 불씨는 숨 쉰다.",
    types: ["buff"],
    synergy: [{ with: AOE_IDS, text: "◎ 표시가 붙은 광역 스킬은 갈래와 상관없이 모두 피해가 올라요" }],
  },
  // ── 서리 묘지기 ──
  fr_breath: {
    summary: "전방으로 서리 입김을 뿜어 피해를 주고 둔화시켜요.",
    flavor: "새벽 공기에 하얀 입김, 그 앞의 것은 얼어붙는다.",
    types: ["melee", "aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "둔화된 적이 피해를 더 받아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  fr_collar: {
    summary: "방어와 최대 HP가 올라요.",
    flavor: "옷깃을 여미면, 서리도 바람도 들지 않는다.",
    types: ["defense"],
    synergy: [{ with: ["fr_ward", "so_lamp"], text: "최대 HP가 늘면 방패도, 등불 회복량도 같이 커져요" }],
  },
  fr_icicle: {
    summary: "전방 부채꼴로 고드름을 여러 개 날려요. 고드름은 적 1마리를 관통해요.",
    flavor: "처마 끝 고드름이 한꺼번에 떨어져 날아간다.",
    types: ["ranged", "projectile", "control"],
    synergy: [{ with: ["fr_brittle"], text: "고드름에 맞은 적이 잠시 둔화돼 이어지는 마공 스킬 피해가 늘어나요" }],
  },
  fr_brittle: {
    summary: "둔화, 빙결, 기절 상태인 적은 마공 스킬 피해를 더 받아요. 기본 공격과 일꾼 스킬에는 적용되지 않아요.",
    flavor: "언 땅은 쉽게 깨진다.",
    types: ["buff"],
    synergy: [{ with: SLOWERS, text: "둔화, 빙결, 기절 상태인 적에게 주는 마공 피해가 올라요" }],
  },
  fr_ward: {
    summary: "얼음 방패를 둘러 피해를 먼저 흡수해요. 최대 HP와 INT가 높을수록 두꺼워져요.",
    flavor: "얇지만 단단한 새벽 얼음 한 겹.",
    types: ["defense"],
    synergy: [{ with: ["fr_collar"], text: "최대 HP가 늘수록 방패도 두꺼워져요" }],
  },
  fr_nova: {
    summary: "주변에 서리꽃을 피워 피해를 주고 잠시 빙결시켜요.",
    flavor: "발끝에서 서리꽃이 피면, 모두 숨을 멈춘다.",
    types: ["melee", "aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "빙결된 동안 마공 스킬 피해가 늘어나요" },
      { with: ["em_meteor", "fr_tomb"], text: "빙결된 적은 늦게 터지는 스킬을 피하지 못해요" },
    ],
  },
  fr_mist: {
    summary: "바라보는 방향으로 안개처럼 미끄러지며 적을 베요. 그동안 무적이에요.",
    flavor: "안개가 걷히면, 묘지기는 이미 저편에 서 있다.",
    types: ["move", "control", "defense"],
    synergy: [{ with: ["fr_brittle"], text: "지나친 적이 둔화돼 마공 피해를 더 받아요" }],
  },
  fr_tomb: {
    summary: "가장 가까운 적 위치에 얼음 무덤을 솟게 해요. 갇힌 적은 기절하고 받는 피해가 늘어요.",
    flavor: "서리로 지은 무덤엔 문이 없다.",
    types: ["ranged", "aoe", "delayed", "control"],
    synergy: [
      { with: ["em_meteor", "so_harvest"], text: "받는 피해가 늘어난 적에게 큰 광역기를 이어 쓰기 좋아요" },
      { with: ["fr_brittle"], text: "기절한 동안 살얼음 피해도 더해져요" },
    ],
  },
  fr_field: {
    summary: "내 자리에 서리밭을 깔아요. 안에 있는 적은 둔화되고 받는 피해가 늘며, 지속 피해를 받아요.",
    flavor: "고요한 서리밭, 발을 들이면 다시는 빨리 걷지 못한다.",
    types: ["field", "aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "서리밭 안의 적은 계속 둔화돼 살얼음 피해가 더해져요" },
      { with: ["em_ring", "so_harvest"], text: "받는 피해가 늘어난 적에게 광역기를 쓰면 피해가 커져요" },
    ],
  },
  fr_blizzard: {
    summary: "화면 가득 눈보라가 불어 화면 안의 모든 적에게 여러 번 피해를 주고 둔화시켜요.",
    flavor: "한겨울 밤, 눈보라 속에 서 있는 것은 묘지기뿐.",
    types: ["aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "눈보라에 둔화된 적이 피해를 더 받아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 매번 피해가 더 올라요" },
    ],
  },
  fr_solstice: {
    summary: "마공 스킬 쿨타임과 받는 피해가 줄어요. 일꾼 스킬 쿨타임에는 적용되지 않아요.",
    flavor: "가장 긴 밤에 한 맹세는 쉽게 녹지 않는다.",
    types: ["defense"],
    synergy: [{ with: ["em_bonfire", "fr_blizzard", "so_procession"], text: "쿨타임이 긴 궁극기일수록 줄어드는 시간이 길어요" }],
  },
  // ── 넋 인도자 ──
  so_wisp: {
    summary: "넋불 여러 개가 가까운 적을 쫓아가 맞혀요.",
    flavor: "길 잃은 도깨비불도 가야 할 곳은 안다.",
    types: ["ranged", "projectile"],
    synergy: [{ with: ["so_drain"], text: "여러 번 맞힐수록 HP를 자주 거둬요" }],
  },
  so_lamp: {
    summary: "잠시 멈춰 서서 등불에 빌어 HP를 회복해요. INT가 높을수록 회복량이 커져요.",
    flavor: "등불 하나에 빌면, 넋들이 상처를 쓸어 준다.",
    types: ["heal"],
    synergy: [{ with: ["fr_collar"], text: "최대 HP가 늘면 회복량도 커져요" }],
  },
  so_drain: {
    summary: "준 피해의 일부만큼 HP를 회복해요.",
    flavor: "넋은 가져가되, 조금은 나눠 받는다.",
    types: ["heal"],
    synergy: [{ with: ["fr_blizzard", "em_brazier", "so_wisp"], text: "HP가 꾸준히 회복돼요" }],
  },
  so_swift: {
    summary: "잠깐 동안 이동 속도와 공격 속도가 함께 올라요.",
    flavor: "등 뒤에서 넋 하나가 바람처럼 밀어 준다.",
    types: ["buff", "move"],
    synergy: [{ with: ["em_ignite"], text: "기본 공격이 빨라져 불씨가 더 자주 터져요" }],
  },
  so_friend: {
    summary: "길동무 넋을 불러요. 지속 시간 동안 내 곁에서 함께 싸워요.",
    flavor: "혼자 걷는 밤길은 없다.",
    types: ["summon"],
    synergy: [
      { with: ["so_kinship"], text: "길동무 피해와 지속 시간이 늘어요" },
      { with: ["em_stoke", "em_hearth"], text: "공격력 증가 효과가 그대로 적용돼요" },
    ],
  },
  so_chain: {
    summary: "넋 사슬로 주변 적을 내 앞에 끌어모아 기절시켜요. 끌려온 적은 받는 피해가 늘어요.",
    flavor: "흩어진 넋들을 한 줄로 엮어 데려간다.",
    types: ["aoe", "control"],
    synergy: [
      { with: ["em_ring", "fr_nova", "em_bonfire"], text: "끌어모은 자리에서 내 주변 광역기를 쓰면 모두 맞아요" },
      { with: ["fr_brittle"], text: "기절한 동안 살얼음 피해가 더해져요" },
    ],
  },
  so_veil: {
    summary: "가장 가까운 적의 반대쪽으로 순간이동해요. 잠깐 동안 무적이에요.",
    flavor: "너울 한 자락이 스치면, 그 자리엔 아무도 없다.",
    types: ["move", "defense"],
    synergy: [{ with: ["fr_solstice"], text: "쿨타임이 줄어 위험할 때 더 자주 피할 수 있어요" }],
  },
  so_harvest: {
    summary: "가장 가까운 적 위치에 넋 소용돌이를 열어요. 세 번 휘몰아치고, 맞힌 만큼 HP를 회복해요.",
    flavor: "소용돌이 한가운데서 넋들이 등불 쪽으로 빨려 든다.",
    types: ["ranged", "aoe", "heal"],
    synergy: [
      { with: ["fr_tomb", "so_chain"], text: "기절한 적 위에 열면 세 번 모두 맞아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  so_lantern: {
    summary: "바로 앞에 초롱을 설치해요. 지속 시간 동안 초롱이 가까운 적에게 넋불을 쏴요.",
    flavor: "망자의 초롱은 꺼지지 않는다. 다만 잠들 뿐.",
    types: ["summon", "ranged"],
    synergy: [
      { with: ["so_kinship"], text: "초롱 피해와 지속 시간이 늘어요" },
      { with: ["em_stoke", "em_hearth"], text: "공격력 증가 효과가 그대로 적용돼요" },
    ],
  },
  so_procession: {
    summary: "넋들의 행렬이 화면을 휩쓸어 화면 안의 모든 적에게 여러 번 피해를 주고, 내 HP도 회복해요.",
    flavor: "별빛을 따라 걷는 행렬, 모두가 마침내 집으로 간다.",
    types: ["melee", "aoe", "heal"],
    synergy: [
      { with: ["so_chain"], text: "받는 피해가 늘어난 적이 많을수록 모든 타격이 강해져요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  so_kinship: {
    summary: "길동무 넋과 망자의 초롱의 피해와 지속 시간이 늘어요.",
    flavor: "한 번 맺은 인연은 저승길에서도 이어진다.",
    types: ["summon"],
    synergy: [{ with: ["so_friend", "so_lantern"], text: "소환 스킬의 피해와 지속 시간이 늘어요" }],
  },
  // ── 삽자루 일꾼 (11/19 물공: 지능을 받지 않고, 기본 공격처럼 명중 판정을 받아요) ──
  wk_charge: {
    summary: "가까운 적 방향으로, 적이 없으면 바라보는 방향으로 돌진해 경로의 적에게 큰 피해를 주고 밀쳐내요. 돌진하는 순간만 무적이라 도착한 자리가 위험할 수 있어요. 쿨타임이 길어요.",
    flavor: "삽자루를 앞세우면 길이 난다.",
    types: ["melee", "move"],
    synergy: [{ with: ["wk_combo"], text: "돌진으로 붙은 직후 바로 이어 쓰기 좋아요" }],
  },
  wk_callus: {
    summary: "기본 공격 피해가 오르고, 근접 기본 공격이 옆과 뒤로도 나가요.",
    flavor: "앞만 보고 파는 일꾼은 없다.",
    types: ["basic", "buff"],
    synergy: [{ with: ["wk_whirl"], text: "회오리는 기본 공격으로 베어서 같이 세져요" }],
  },
  wk_combo: {
    summary: "전방을 두 번 찌르고 크게 퍼 올려요. 피해가 매우 크고 마지막 타격에 적을 기절시켜요. 대신 쿨타임이 길어요.",
    flavor: "푹, 푹, 그리고 한 삽 가득.",
    types: ["melee", "control"],
    synergy: [{ with: ["fr_brittle"], text: "기절한 적에게 마공 스킬을 쓰면 살얼음 추가 피해가 붙어요. 퍼 올리기 자체에는 붙지 않아요" }],
  },
  wk_grip: {
    summary: "공격 속도가 올라요.",
    flavor: "손에 익은 삽은 저절로 움직인다.",
    types: ["basic", "buff"],
    synergy: [{ with: ["wk_whirl"], text: "공격 속도가 빠를수록 회오리가 더 자주 베어요" }],
  },
  wk_back: {
    summary: "받는 피해가 줄고, 일정 확률로 근접 공격과 투사체를 막아 피해를 크게 줄여요. 광역 공격과 바닥 장판은 막을 수 없어요.",
    flavor: "허리가 버텨야 밤새 판다.",
    types: ["defense"],
    synergy: [{ with: ["wk_leap"], text: "착지 후 움직일 수 없는 동안 받는 피해가 줄어요" }],
  },
  wk_leap: {
    summary: "적이 가장 많이 모인 곳으로 도약해 내려찍고 주변 적을 기절시켜요. 착지 후 잠시 움직일 수 없어요.",
    flavor: "봉분 하나쯤은 단숨에 넘는다.",
    types: ["melee", "move", "control"],
    synergy: [
      { with: ["wk_whirl"], text: "뛰어든 자리에서 바로 회오리를 켜면 무리를 쓸어요" },
      { with: ["em_ring", "em_fan"], text: "뛰어든 자리에서 불을 지르면 무리가 한꺼번에 타요" },
    ],
  },
  wk_tireless: {
    summary: "잠시 공격 속도가 오르고 기본 공격 사거리가 늘어요.",
    flavor: "쉬면 굳는다. 그러니 계속 판다.",
    types: ["basic", "buff"],
    synergy: [{ with: ["wk_whirl"], text: "켜 두면 회오리가 더 자주 베어요" }],
  },
  wk_whirl: {
    summary: "누르면 일정 시간 회전하며 주변 적을 베요. 다시 누르면 일찍 멈추고, 회전한 시간만큼만 쿨타임이 돌아요.",
    flavor: "삽날이 바람을 가르는 소리.",
    types: ["melee", "basic"],
    synergy: [{ with: ["wk_grip", "wk_tireless"], text: "공격 속도가 빠를수록 더 자주 베어요" }],
  },
  wk_pack: {
    summary: "STR이 높을수록 일꾼 스킬의 SP 소모량과 쿨타임이 줄어요. INT 없이도 스킬을 계속 쓸 수 있어요. 일꾼 스킬 쿨타임 감소는 카드와 장비를 합쳐 최대 25%예요.",
    flavor: "짐을 잘 지는 등은 쉽게 지치지 않는다.",
    types: ["buff"],
    synergy: [{ with: ["wk_leap", "wk_combo"], text: "SP를 많이 쓰는 뛰어넘기와 퍼 올리기를 더 자주 써요" }],
  },
  wk_deep: {
    summary: "기본 공격과 일꾼 스킬의 치명타 피해가 올라요.",
    flavor: "얕게 백 번보다 깊게 한 번.",
    types: ["basic", "buff"],
    synergy: [{ with: ["wk_grit"], text: "10번째 확정 치명타의 피해도 커져요" }],
  },
  wk_allnight: {
    summary: "적 사이를 여섯 번 연속 돌진하며 큰 피해를 줘요. 돌진하는 순간만 무적이라 그 사이에는 공격받을 수 있어요.",
    flavor: "새벽이 올 때까지, 한 삽도 쉬지 않는다.",
    types: ["melee", "move"],
    synergy: [{ with: ["wk_deep"], text: "돌진마다 치명타 피해 증가가 적용돼요" }],
  },
  wk_grit: {
    summary: "기본 공격 피해가 오르고, 기본 공격 10번째마다 치명타가 반드시 터져요.",
    flavor: "열 번째 삽질은 늘 제일 깊다.",
    types: ["basic", "buff"],
    synergy: [{ with: ["wk_deep"], text: "확정 치명타에도 치명타 피해 증가가 적용돼요" }],
  },
};

/** 유형 태그 전체 (액티브/패시브/궁극기 + 형태) */
export function skillTypes(def: SkillDef): SkillTypeTag[] {
  const head: SkillTypeTag[] = def.kind === "passive" ? ["passive"] : def.tier === TIERS ? ["ultimate"] : ["active"];
  // 광역 태그는 def.aoe(재의 심장이 붙는 스킬)와 늘 같게
  const body = SKILL_TEXT[def.id].types.filter((t) => t !== "aoe" && !head.includes(t));
  return [...head, ...(def.aoe ? (["aoe"] as SkillTypeTag[]) : []), ...body];
}

// ── 랭크별 수치 표 ──

export type StatRow = { label: string; value: string };

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const sec = (ms: number) => `${Math.round(ms / 100) / 10}초`;
const dmg = (mult: number) => pct(mult);

/** 스킬별 효과 수치 (랭크 lv, SP·쿨타임 제외). 거리는 게임 화면 점 단위 */
function effectRows(id: SkillId, lv: number): [string, string][] {
  switch (id) {
    case "em_kindle": {
      const f = SKILL_FX.em_kindle(lv);
      return [["폭발 피해", dmg(f.mult)], ["폭발 반지름", `${f.blast}`], ["사거리", `${f.reach}`]];
    }
    case "em_hearth":
      return [["마공 공격력", `+${pct(SKILL_FX.em_hearth(lv).atkPct)}`]];
    case "em_fan": {
      const f = SKILL_FX.em_fan(lv);
      return [["피해", dmg(f.mult)], ["범위", `부채꼴 ${f.arcDeg}° · 거리 ${f.range}`]];
    }
    case "em_stoke": {
      const f = SKILL_FX.em_stoke(lv);
      return [["공격력", `+${pct(f.atk)}`], ["지속", sec(f.durMs)]];
    }
    case "em_spark":
      return [["치명타 확률", `+${SKILL_FX.em_spark(lv).crit}%`]];
    case "em_ring": {
      const f = SKILL_FX.em_ring(lv);
      return [["피해", dmg(f.mult)], ["범위", `내 주변 반지름 ${f.radius}`]];
    }
    case "em_ignite": {
      const f = SKILL_FX.em_ignite(lv);
      return [["터질 확률", pct(f.chance)], ["폭발 피해", dmg(f.mult)], ["폭발 반지름", `${f.radius}`]];
    }
    case "em_meteor": {
      const f = SKILL_FX.em_meteor(lv);
      return [["피해", dmg(f.mult)], ["범위", `반지름 ${f.radius} · 사거리 ${f.reach}`], ["떨어지기까지", sec(f.delayMs)]];
    }
    case "em_brazier": {
      const f = SKILL_FX.em_brazier(lv);
      return [["한 번 피해", `${dmg(f.mult)} · ${sec(f.everyMs)}마다`], ["지속", `${sec(f.durMs)} (약 ${Math.floor(f.durMs / f.everyMs)}번)`], ["범위", `반지름 ${f.radius}`]];
    }
    case "em_bonfire": {
      const f = SKILL_FX.em_bonfire(lv);
      return [["한 번 피해", `${dmg(f.mult)} × ${f.hitAt.length}번`], ["범위", "지금 화면 전체 (우두머리 포함)"]];
    }
    case "em_ashheart":
      return [["광역 스킬 피해", `+${pct(SKILL_FX.em_ashheart(lv).aoePct)}`]];
    case "fr_breath": {
      const f = SKILL_FX.fr_breath(lv);
      return [["피해", dmg(f.mult)], ["범위", `부채꼴 ${f.arcDeg}° · 거리 ${f.range}`], ["둔화", sec(f.slowMs)]];
    }
    case "fr_collar": {
      const f = SKILL_FX.fr_collar(lv);
      return [["방어", `+${f.def}`], ["최대 HP", `+${pct(f.hpPct)}`]];
    }
    case "fr_icicle": {
      const f = SKILL_FX.fr_icicle(lv);
      return [["고드름", `${f.n}개`], ["하나 피해", dmg(f.mult)], ["거리", `${f.range} · ${f.pierce}마리 관통`]];
    }
    case "fr_brittle":
      return [["둔화·빙결·기절한 적에게 마공 피해", `+${pct(SKILL_FX.fr_brittle(lv).vsSlowed)}`]];
    case "fr_ward": {
      const f = SKILL_FX.fr_ward(lv);
      return [["방패", `최대 HP의 ${pct(f.shieldPct)} × 스킬 위력`], ["지속", sec(f.durMs)]];
    }
    case "fr_nova": {
      const f = SKILL_FX.fr_nova(lv);
      return [["피해", dmg(f.mult)], ["범위", `내 주변 반지름 ${f.radius}`], ["빙결", sec(f.freezeMs)]];
    }
    case "fr_mist": {
      const f = SKILL_FX.fr_mist(lv);
      return [["미끄러지는 거리", `${f.dist}`], ["지나친 적 피해", dmg(f.mult)], ["둔화", sec(f.slowMs)]];
    }
    case "fr_tomb": {
      const f = SKILL_FX.fr_tomb(lv);
      return [
        ["피해", dmg(f.mult)],
        ["범위", `반지름 ${f.radius} · 사거리 ${f.reach}`],
        ["솟기까지", sec(f.delayMs)],
        ["기절", sec(f.stunMs)],
        ["약화", `받는 피해 +${pct(f.vuln)} · ${sec(f.vulnMs)}`],
      ];
    }
    case "fr_field": {
      const f = SKILL_FX.fr_field(lv);
      return [["한 번 피해", `${dmg(f.mult)} · ${sec(f.everyMs)}마다`], ["약화", `받는 피해 +${pct(f.vuln)}`], ["지속", sec(f.durMs)], ["범위", `반지름 ${f.radius}`]];
    }
    case "fr_blizzard": {
      const f = SKILL_FX.fr_blizzard(lv);
      return [["한 번 피해", `${dmg(f.mult)} × ${f.hitAt.length}번`], ["둔화", sec(f.slowMs)], ["범위", "지금 화면 전체 (우두머리 포함)"]];
    }
    case "fr_solstice": {
      const f = SKILL_FX.fr_solstice(lv);
      return [["마공 스킬 쿨타임", `-${pct(f.cdCut)}`], ["받는 피해", `-${pct(f.guard)}`]];
    }
    case "so_wisp": {
      const f = SKILL_FX.so_wisp(lv);
      return [["넋불", `${f.n}개`], ["하나 피해", dmg(f.mult)], ["사거리", `${f.range}`]];
    }
    case "so_lamp": {
      const f = SKILL_FX.so_lamp(lv);
      return [["회복", `최대 HP의 ${pct(f.healPct)} × 스킬 위력 + INT×3`], ["멈춰 서기", sec(f.rootMs)]];
    }
    case "so_drain":
      return [["흡혈", `준 피해의 ${pct(SKILL_FX.so_drain(lv).steal)}`], ["한 번 최대", "최대 HP의 3%"]];
    case "so_swift": {
      const f = SKILL_FX.so_swift(lv);
      return [["이동 속도", `+${pct(f.move)}`], ["공격 속도", `+${pct(f.aspd)}`], ["지속", sec(f.durMs)]];
    }
    case "so_friend": {
      const f = SKILL_FX.so_friend(lv);
      return [["길동무 공격", `${dmg(f.atkPct)} · ${sec(f.everyMs)}마다`], ["지속 시간", sec(f.durMs)]];
    }
    case "so_chain": {
      const f = SKILL_FX.so_chain(lv);
      return [["피해", dmg(f.mult)], ["끌어오는 범위", `반지름 ${f.radius}`], ["기절", sec(f.stunMs)], ["약화", `받는 피해 +${pct(f.vuln)}`]];
    }
    case "so_veil": {
      const f = SKILL_FX.so_veil(lv);
      return [["순간이동", `${f.dist}`], ["무적", sec(f.safeMs)]];
    }
    case "so_harvest": {
      const f = SKILL_FX.so_harvest(lv);
      return [
        ["한 번 피해", `${dmg(f.mult)} × ${f.ticks}번`],
        ["범위", `반지름 ${f.radius} · 사거리 ${f.reach}`],
        ["흡수", `맞힌 적마다 최대 HP의 ${pct(f.healPerHit)} (최대 ${pct(f.healCap)})`],
      ];
    }
    case "so_lantern": {
      const f = SKILL_FX.so_lantern(lv);
      return [["넋불 피해", `${dmg(f.atkPct)} · ${sec(f.everyMs)}마다`], ["지속 시간", sec(f.durMs)], ["사거리", `${f.range}`]];
    }
    case "so_procession": {
      const f = SKILL_FX.so_procession(lv);
      return [["한 번 피해", `${dmg(f.mult)} × ${f.hitAt.length}번`], ["범위", "지금 화면 전체 (우두머리 포함)"], ["회복", `최대 HP의 ${pct(f.healPct)}`]];
    }
    case "so_kinship": {
      const f = SKILL_FX.so_kinship(lv);
      return [["소환 피해", `+${pct(f.summonPct)}`], ["지속 시간", `+${pct(f.durPct)}`]];
    }
    // ── 삽자루 일꾼 (물공) ──
    case "wk_charge": {
      const f = SKILL_FX.wk_charge(lv);
      return [["피해", dmg(f.mult)], ["돌진 거리", `${f.dist}`], ["무적", `${f.invulnMs / 1000}초`]];
    }
    case "wk_callus": {
      const f = SKILL_FX.wk_callus(lv);
      return [["기본 공격 피해", `+${pct(f.basicPct)}`], ["옆으로", pct(f.side)], ["뒤로", pct(f.back)]];
    }
    case "wk_combo": {
      const f = SKILL_FX.wk_combo(lv);
      return [["피해 (세 번 합)", dmg(f.mult)], ["기절", sec(f.stunMs)], ["거리", `${f.range}`]];
    }
    case "wk_grip":
      return [["공격 속도", `+${pct(SKILL_FX.wk_grip(lv).aspd)}`]];
    case "wk_back": {
      const f = SKILL_FX.wk_back(lv);
      return [["받는 피해", `−${pct(f.guard)}`], ["자동 막기 확률", pct(f.parry)], ["막으면 피해", `−${pct(f.parryCut)}`]];
    }
    case "wk_leap": {
      const f = SKILL_FX.wk_leap(lv);
      return [["착지 피해", dmg(f.mult)], ["착지 반지름", `${f.radius}`], ["기절", sec(f.stunMs)], ["착지 후 경직", sec(f.landMs)]];
    }
    case "wk_tireless": {
      const f = SKILL_FX.wk_tireless(lv);
      return [["공격 속도", `+${pct(f.aspd)}`], ["사거리", `+${pct(f.rangeMul - 1)}`], ["지속", sec(f.durMs)]];
    }
    case "wk_whirl": {
      const f = SKILL_FX.wk_whirl(lv);
      return [["한 번 피해", dmg(f.mult)], ["반지름", `${f.radius}`], ["도는 시간", sec(f.durMs)], ["이동 속도", pct(f.moveMul)]];
    }
    case "wk_pack": {
      const f = SKILL_FX.wk_pack(lv);
      const p2 = (n: number) => `${Math.round(n * 10000) / 100}%`;
      return [
        ["SP 절약", `STR 1당 ${p2(f.perStr)} (최대 ${pct(f.cap)})`],
        ["쿨타임 감소", `STR 1당 ${p2(f.cdPerStr)} (최대 ${pct(f.cdCap)})`],
        ["STR 80이면", `SP −${pct(Math.min(f.cap, 80 * f.perStr))} · 쿨타임 −${pct(Math.min(f.cdCap, 80 * f.cdPerStr))}`],
      ];
    }
    case "wk_deep":
      return [["치명타 피해", `+${pct(SKILL_FX.wk_deep(lv).critDmg)}`]];
    case "wk_allnight": {
      const f = SKILL_FX.wk_allnight(lv);
      return [["돌진 한 번 피해", dmg(f.mult)], ["돌진 수", `${f.dashes}번`]];
    }
    case "wk_grit": {
      const f = SKILL_FX.wk_grit(lv);
      return [["반드시 치명타", `기본 공격 ${f.every}번째마다`], ["기본 공격 피해", `+${pct(f.basicPct)}`]];
    }
  }
}

/** 11/21 INT(스킬 위력)로 커지는 스킬 (HuntScene에서 skillPower를 곱하는 곳 그대로) */
const INT_DMG: readonly SkillId[] = [
  "em_kindle", "em_ring", "em_fan", "em_meteor", "em_brazier", "em_bonfire", "em_ignite",
  "fr_breath", "fr_icicle", "fr_mist", "fr_nova", "fr_tomb", "fr_field", "fr_blizzard",
  "so_wisp", "so_chain", "so_harvest", "so_friend", "so_lantern", "so_procession",
];
/** 11/21 스킬 하나가 INT에서 받는 것 (스킬 창 수치 표 한 줄) */
export function intRole(id: SkillId): string {
  if (id === "fr_ward") return "방패가 커져요";
  if (id === "so_lamp") return "회복이 늘어요";
  if (INT_DMG.includes(id)) return "피해가 커져요";
  return skillById(id)?.branch === "worker" ? "없어요 (STR을 받아요)" : "없어요";
}

/** 랭크 lv의 수치 표 (액티브는 SP·쿨타임까지 · 11/21 맨 끝에 INT 영향) */
export function skillStats(def: SkillDef, lv: number): StatRow[] {
  const l = Math.max(1, Math.min(def.maxLevel, lv));
  const rows = effectRows(def.id, l).map(([label, value]) => ({ label, value }));
  if (def.kind === "active") rows.push({ label: "SP", value: `${def.sp(l)}` }, { label: "쿨타임", value: sec(def.cooldownMs(l)) });
  rows.push({ label: "INT 영향", value: intRole(def.id) });
  return rows;
}

export type CompareRow = { label: string; a: string; b: string | null; changed: boolean };

/** 두 랭크 비교 (b가 없으면 한 칸만) */
export function compareStats(def: SkillDef, a: number, b: number | null): CompareRow[] {
  const ra = skillStats(def, a);
  const rb = b === null ? null : skillStats(def, b);
  return ra.map((r, i) => ({ label: r.label, a: r.value, b: rb ? rb[i].value : null, changed: !!rb && rb[i].value !== r.value }));
}

// ── 선행 조건 문구 ──

const hasBatchim = (word: string) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
/** 받침에 맞는 조사 ("과/와", "을/를", "이/가") */
export const josa = (word: string, withB: string, withoutB: string) => `${word}${hasBatchim(word) ? withB : withoutB}`;

export type Requirement = { text: string; ok: boolean; have: number; need: number };

/** 이 스킬을 배우는 데 필요한 것 (단 조건 + 선행 스킬) */
export function requirements(def: SkillDef, a: Alloc): Requirement[] {
  const out: Requirement[] = [];
  if (def.tier > 1) {
    const need = tierGate(def.tier);
    const have = spentIn(a, def.branch, def.tier);
    out.push({ text: `${BRANCH_INFO[def.branch].name} ${def.tier === 2 ? "1단" : `1~${def.tier - 1}단`}에 ${need}포인트 쓰기`, ok: have >= need, have, need });
  }
  for (const r of def.requires ?? []) {
    const have = a[r.id] ?? 0;
    out.push({ text: `${skillById(r.id)!.name} ${r.level}랭크 찍기`, ok: have >= r.level, have: Math.min(have, r.level), need: r.level });
  }
  return out;
}

/** 이 스킬을 선행으로 삼는 다음 스킬들 */
export const unlocks = (id: SkillId) => SKILLS.filter((s) => s.requires?.some((r) => r.id === id)).map((s) => ({ def: s, level: s.requires!.find((r) => r.id === id)!.level }));

// ── 11/19 연계 보너스 (대표 빌드 — skillTree SYNERGY) ──

export type LinkLine = {
  /** core: 이 스킬이 핵심 (받침 랭크마다 오른다) · support: 이 스킬이 다른 핵심을 받친다 */
  kind: "core" | "support";
  /** 「연계: 불씨 튕기기 랭크마다 +3% · 불의 고리 랭크마다 +3%」 */
  text: string;
  /** 지금 배분으로 오른 만큼 (%) — 받침이면 그 핵심이 받는 몫 */
  now: number;
  /** 11/19 지금 배분의 연계 생존 (받는 피해 −%) */
  guard: number;
  /** 관련 스킬 (아이콘) */
  ids: SkillId[];
};

const pctN = (k: number) => Math.round(k * 100);

/** 스킬 창·안내서의 연계 줄. 핵심이면 받침 랭크마다 얼마나 오르는지, 받침이면 어느 핵심을 얼마나 올리는지 (지금 배분 a 기준) */
export function linkLines(id: SkillId, a: Alloc): LinkLine[] {
  const out: LinkLine[] = [];
  const links = SYNERGY[id];
  if (links)
    out.push({
      kind: "core",
      text: `연계: ${links.map((l) => `${skillById(l.id)!.name} 랭크마다 +${pctN(l.pct)}%`).join(" · ")} · 야근 빌딩에서 받는 피해 최대 −${pctN((SYNERGY_GUARD[id] ?? 0))}%`,
      now: pctN(synergyMul(id, a) - 1),
      guard: pctN(synergyGuardOf(id, a)),
      ids: links.map((l) => l.id),
    });
  for (const t of synergyTargets(id))
    out.push({
      kind: "support",
      text: `연계: 랭크마다 ${skillById(t.core)!.name} 피해 +${pctN(t.pct)}% · 야근 빌딩에서 받는 피해 −${Math.round(synergyGuardPerRank(t.core, id) * 1000) / 10}%(핵심 랭크만큼)`,
      now: pctN(t.pct * (a[id] ?? 0)),
      guard: pctN(synergyGuardOf(t.core, a)),
      ids: [t.core],
    });
  return out;
}
