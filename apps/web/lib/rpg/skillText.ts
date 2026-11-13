// 스킬 트리 창·안내서가 보여 주는 스킬 설명 (한 줄 요약·유형 태그·랭크별 수치 표·시너지·선행 조건·분위기 문장).
// 수치는 모두 skillTree.ts의 SKILL_FX·sp·cooldownMs에서 읽는다 → 밸런스가 바뀌면 설명도 같이 바뀐다.
// 시너지는 실제 규칙(패시브 보정·약화·둔화·끌어오기·공격력 버프)에 있는 것만 적는다. 판정은 게임·서버가 한다.
import { BRANCH_INFO, SKILL_FX, skillById, SKILLS, TIERS, type SkillDef, type SkillId } from "./skillTree";
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
    summary: "가장 가까운 적에게 불씨를 튕겨 그 자리를 작게 터뜨린다.",
    flavor: "모닥불에서 톡 튄 불씨 하나, 그게 시작이었다.",
    types: ["ranged", "projectile"],
    synergy: [{ with: ["so_chain"], text: "사슬로 한데 모인 적들이 작은 폭발에 같이 휘말려요" }],
  },
  em_hearth: {
    summary: "배워 두면 늘 공격력이 오른다.",
    flavor: "화롯가에 손을 녹이면, 무거운 삽도 가볍다.",
    types: ["buff"],
    synergy: [{ with: ["so_friend", "so_lantern"], text: "공격력을 따라 싸우는 길동무 넋·초롱도 같이 세져요" }],
  },
  em_fan: {
    summary: "앞쪽 부채꼴로 불길을 쓸어 여러 마리를 한꺼번에 태운다.",
    flavor: "부채 한 번에 불길이 들판처럼 번진다.",
    types: ["melee", "aoe"],
    synergy: [{ with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" }],
  },
  em_stoke: {
    summary: "잠깐 동안 공격력을 크게 올린다 — 큰 스킬 직전에 켜기.",
    flavor: "장작 하나 더. 밤은 아직 길다.",
    types: ["buff"],
    synergy: [
      { with: ["em_bonfire", "em_meteor"], text: "켜 둔 동안 쓰면 오른 공격력으로 터져요" },
      { with: ["so_friend", "so_lantern"], text: "길동무 넋·초롱도 내 공격력을 따라 세져요" },
    ],
  },
  em_spark: {
    summary: "배워 두면 늘 치명타 확률이 오른다 (기본 공격·스킬 모두).",
    flavor: "탁, 탁. 불티는 늘 엉뚱한 데로 튄다.",
    types: ["buff"],
    synergy: [{ with: ["fr_icicle", "so_wisp"], text: "여러 번 때리는 스킬일수록 치명타가 자주 터져요" }],
  },
  em_ring: {
    summary: "발밑에서 불의 고리를 터뜨려 둘러싼 적을 모두 태운다.",
    flavor: "둘러앉은 모닥불처럼, 빙 둘러 붉게.",
    types: ["melee", "aoe"],
    synergy: [
      { with: ["so_chain"], text: "사슬로 내 앞에 끌어모은 뒤 터뜨리면 한 마리도 안 빠져요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  em_ignite: {
    summary: "기본 공격이 맞을 때 가끔 불씨가 터져 둘레 적까지 태운다.",
    flavor: "스친 자리마다 불씨가 남는다.",
    types: ["basic"],
    synergy: [{ with: ["so_swift"], text: "공격 속도가 오르면 기본 공격이 잦아져 더 자주 터져요" }],
  },
  em_meteor: {
    summary: "가장 가까운 적 자리에 불붙은 장작을 떨어뜨린다 — 조금 늦게 크게 터진다.",
    flavor: "별똥이 떨어지면 소원을 빌라고? 여기선 장작이 떨어진다.",
    types: ["ranged", "aoe", "delayed"],
    synergy: [
      { with: ["fr_tomb", "so_chain"], text: "적을 묶어 두면 떨어질 때까지 도망가지 못해요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  em_brazier: {
    summary: "그 자리에 화톳불을 놓아, 머무는 동안 둘레 적을 계속 태운다.",
    flavor: "불 꺼진 묘역에 화톳불 하나, 다가오는 것은 모두 그을린다.",
    types: ["field", "aoe"],
    synergy: [
      { with: ["so_chain", "fr_nova"], text: "적을 불 위에 묶어 두면 여러 번 맞아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 매번 피해가 더 올라요" },
    ],
  },
  em_bonfire: {
    summary: "불기둥이 화면 전체를 뒤덮어 보이는 적 모두를 여러 번 태우는 모닥불지기의 궁극기.",
    flavor: "축제의 밤, 마을 한가운데 큰 불이 오른다.",
    types: ["melee", "aoe"],
    synergy: [
      { with: ["em_stoke"], text: "공격력을 올려 두고 쓰면 모든 타격이 세게 들어가요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  em_ashheart: {
    summary: "배워 두면 늘 광역 스킬 피해가 오른다.",
    flavor: "다 타고 남은 재 속에도 불씨는 숨 쉰다.",
    types: ["buff"],
    synergy: [{ with: AOE_IDS, text: "광역 표시(◎)가 붙은 스킬 모두의 피해가 올라요 (어느 갈래든)" }],
  },
  // ── 서리 묘지기 ──
  fr_breath: {
    summary: "앞쪽으로 서리 입김을 뿜어 피해를 주고 느리게 만든다.",
    flavor: "새벽 공기에 하얀 입김, 그 앞의 것은 얼어붙는다.",
    types: ["melee", "aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "느려진 적이 피해를 더 받아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  fr_collar: {
    summary: "배워 두면 늘 방어와 최대 HP가 오른다.",
    flavor: "옷깃을 여미면, 서리도 바람도 들지 않는다.",
    types: ["defense"],
    synergy: [{ with: ["fr_ward", "so_lamp"], text: "최대 HP가 늘면 방패도, 등불 회복량도 같이 커져요" }],
  },
  fr_icicle: {
    summary: "앞쪽 부채꼴로 고드름을 여러 개 날린다. 고드름마다 한 마리를 꿰뚫는다.",
    flavor: "처마 끝 고드름이 한꺼번에 떨어져 날아간다.",
    types: ["ranged", "projectile", "control"],
    synergy: [{ with: ["fr_brittle"], text: "고드름에 맞은 적은 잠깐 느려져 뒤따르는 공격이 더 아파요" }],
  },
  fr_brittle: {
    summary: "느려지거나 얼어 묶인 적이 받는 모든 피해가 늘어난다.",
    flavor: "언 땅은 쉽게 깨진다.",
    types: ["buff"],
    synergy: [{ with: SLOWERS, text: "적을 느리게 하거나 묶는 스킬과 같이 쓰면 그동안 모든 공격이 더 아파요" }],
  },
  fr_ward: {
    summary: "최대 HP에 비례한 얼음 방패를 둘러 피해를 먼저 받아 낸다.",
    flavor: "얇지만 단단한 새벽 얼음 한 겹.",
    types: ["defense"],
    synergy: [{ with: ["fr_collar"], text: "최대 HP가 늘수록 방패도 두꺼워져요" }],
  },
  fr_nova: {
    summary: "내 둘레에 서리꽃을 피워 피해를 주고 잠깐 얼려 묶는다.",
    flavor: "발끝에서 서리꽃이 피면, 모두 숨을 멈춘다.",
    types: ["melee", "aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "얼어 묶인 동안 모든 공격이 더 아파요" },
      { with: ["em_meteor", "fr_tomb"], text: "얼려 두면 늦게 터지는 스킬을 피하지 못해요" },
    ],
  },
  fr_mist: {
    summary: "바라보는 쪽으로 안개처럼 미끄러지며 지나친 적을 베고, 그동안은 맞지 않는다.",
    flavor: "안개가 걷히면, 묘지기는 이미 저편에 서 있다.",
    types: ["move", "control", "defense"],
    synergy: [{ with: ["fr_brittle"], text: "지나친 적은 느려져 피해를 더 받아요" }],
  },
  fr_tomb: {
    summary: "가장 가까운 적 자리에 얼음 무덤을 솟게 해 묶고, 받는 피해를 늘린다.",
    flavor: "서리로 지은 무덤엔 문이 없다.",
    types: ["ranged", "aoe", "delayed", "control"],
    synergy: [
      { with: ["em_meteor", "so_harvest"], text: "약해진 적에게 큰 광역기를 이어 쓰면 피해가 커져요" },
      { with: ["fr_brittle"], text: "묶인 동안은 살얼음 피해도 더해져요" },
    ],
  },
  fr_field: {
    summary: "그 자리에 서리밭을 깔아 안의 적을 느리게, 약하게 만들고 계속 피해를 준다.",
    flavor: "고요한 서리밭, 발을 들이면 다시는 빨리 걷지 못한다.",
    types: ["field", "aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "서리밭의 적은 늘 느려져 있어 살얼음 피해가 더해져요" },
      { with: ["em_ring", "so_harvest"], text: "약해진 적 위에 광역기를 쓰면 더 아파요" },
    ],
  },
  fr_blizzard: {
    summary: "화면 전체에 눈보라를 몰아쳐 보이는 적 모두를 여러 번 때리고 느리게 하는 궁극기.",
    flavor: "한겨울 밤, 눈보라 속에 서 있는 것은 묘지기뿐.",
    types: ["aoe", "control"],
    synergy: [
      { with: ["fr_brittle"], text: "눈보라에 느려진 적이 피해를 더 받아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 매번 피해가 더 올라요" },
    ],
  },
  fr_solstice: {
    summary: "배워 두면 늘 모든 스킬 쿨타임이 줄고 받는 피해도 줄어든다.",
    flavor: "가장 긴 밤에 한 맹세는 쉽게 녹지 않는다.",
    types: ["defense"],
    synergy: [{ with: ["em_bonfire", "fr_blizzard", "so_procession"], text: "쿨타임이 긴 궁극기일수록 줄어드는 시간이 커요 (어느 갈래든)" }],
  },
  // ── 넋 인도자 ──
  so_wisp: {
    summary: "넋불 여러 개가 가까운 적을 쫓아가 맞힌다.",
    flavor: "길 잃은 도깨비불도 가야 할 곳은 안다.",
    types: ["ranged", "projectile"],
    synergy: [{ with: ["so_drain"], text: "여러 번 맞힐수록 HP를 자주 거둬요" }],
  },
  so_lamp: {
    summary: "잠깐 멈춰 서서 등불에 빌어 HP를 회복한다 (INT가 높을수록 더).",
    flavor: "등불 하나에 빌면, 넋들이 상처를 쓸어 준다.",
    types: ["heal"],
    synergy: [{ with: ["fr_collar"], text: "최대 HP가 늘면 회복량도 커져요" }],
  },
  so_drain: {
    summary: "배워 두면 늘 준 피해의 일부만큼 HP를 거둔다 (한 번에 최대 HP의 3%까지).",
    flavor: "넋은 가져가되, 조금은 나눠 받는다.",
    types: ["heal"],
    synergy: [{ with: ["fr_blizzard", "em_brazier", "so_wisp"], text: "자주 여러 번 때리는 스킬과 같이 쓰면 HP가 꾸준히 차요" }],
  },
  so_swift: {
    summary: "잠깐 동안 이동 속도와 공격 속도를 함께 올린다.",
    flavor: "등 뒤에서 넋 하나가 바람처럼 밀어 준다.",
    types: ["buff", "move"],
    synergy: [{ with: ["em_ignite"], text: "기본 공격이 빨라져 불씨가 더 자주 터져요" }],
  },
  so_friend: {
    summary: "길동무 넋을 불러 한동안 곁에서 같이 싸우게 한다.",
    flavor: "혼자 걷는 밤길은 없다.",
    types: ["summon"],
    synergy: [
      { with: ["so_kinship"], text: "길동무 피해와 머무는 시간이 늘어요" },
      { with: ["em_stoke", "em_hearth"], text: "내 공격력을 따라 싸워서 공격력 강화가 그대로 실려요" },
    ],
  },
  so_chain: {
    summary: "둘레 적을 넋 사슬로 내 앞에 끌어모아 묶고, 받는 피해를 늘린다.",
    flavor: "흩어진 넋들을 한 줄로 엮어 데려간다.",
    types: ["aoe", "control"],
    synergy: [
      { with: ["em_ring", "fr_nova", "em_bonfire"], text: "끌어모은 바로 그 자리에 내 둘레 광역기를 터뜨리면 모두 맞아요" },
      { with: ["fr_brittle"], text: "묶인 동안 살얼음 피해가 더해져요" },
    ],
  },
  so_veil: {
    summary: "가장 가까운 적의 반대쪽으로 순간이동하고 잠깐 무적이 된다.",
    flavor: "너울 한 자락이 스치면, 그 자리엔 아무도 없다.",
    types: ["move", "defense"],
    synergy: [{ with: ["fr_solstice"], text: "쿨타임이 줄어 위험할 때 더 자주 피할 수 있어요" }],
  },
  so_harvest: {
    summary: "가장 가까운 적 자리에 넋 소용돌이를 열어 세 번 휘몰아치고, 맞힌 만큼 HP를 거둔다.",
    flavor: "소용돌이 한가운데서 넋들이 등불 쪽으로 빨려 든다.",
    types: ["ranged", "aoe", "heal"],
    synergy: [
      { with: ["fr_tomb", "so_chain"], text: "묶여 있는 적 위에 열면 세 번 모두 맞아요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  so_lantern: {
    summary: "그 자리에 초롱을 걸어, 한동안 가까운 적에게 넋불을 쏘게 한다.",
    flavor: "망자의 초롱은 꺼지지 않는다. 다만 잠들 뿐.",
    types: ["summon", "ranged"],
    synergy: [
      { with: ["so_kinship"], text: "초롱 피해와 머무는 시간이 늘어요" },
      { with: ["em_stoke", "em_hearth"], text: "내 공격력을 따라 쏴서 공격력 강화가 그대로 실려요" },
    ],
  },
  so_procession: {
    summary: "넋들의 행렬이 화면 전체를 휩쓸어 보이는 적 모두를 여러 번 때리고 HP도 채워 주는 궁극기.",
    flavor: "별빛을 따라 걷는 행렬, 모두가 마침내 집으로 간다.",
    types: ["melee", "aoe", "heal"],
    synergy: [
      { with: ["so_chain"], text: "약해진 적이 많을 때 쓰면 모든 타격이 더 아파요" },
      { with: ["em_ashheart"], text: "광역 스킬이라 피해가 더 올라요" },
    ],
  },
  so_kinship: {
    summary: "배워 두면 길동무 넋·망자의 초롱이 더 세고 더 오래 머문다.",
    flavor: "한 번 맺은 인연은 저승길에서도 이어진다.",
    types: ["summon"],
    synergy: [{ with: ["so_friend", "so_lantern"], text: "부르는 스킬의 피해와 머무는 시간이 늘어요" }],
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
      return [["공격력", `+${pct(SKILL_FX.em_hearth(lv).atkPct)}`]];
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
      return [["피해", dmg(f.mult)], ["범위", `내 둘레 반지름 ${f.radius}`]];
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
      return [["고드름", `${f.n}개`], ["하나 피해", dmg(f.mult)], ["거리", `${f.range} · ${f.pierce}마리 꿰뚫기`]];
    }
    case "fr_brittle":
      return [["느려진·묶인 적 피해", `+${pct(SKILL_FX.fr_brittle(lv).vsSlowed)}`]];
    case "fr_ward": {
      const f = SKILL_FX.fr_ward(lv);
      return [["방패", `최대 HP의 ${pct(f.shieldPct)}`], ["지속", sec(f.durMs)]];
    }
    case "fr_nova": {
      const f = SKILL_FX.fr_nova(lv);
      return [["피해", dmg(f.mult)], ["범위", `내 둘레 반지름 ${f.radius}`], ["얼려 묶기", sec(f.freezeMs)]];
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
        ["묶기", sec(f.stunMs)],
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
      return [["모든 쿨타임", `-${pct(f.cdCut)}`], ["받는 피해", `-${pct(f.guard)}`]];
    }
    case "so_wisp": {
      const f = SKILL_FX.so_wisp(lv);
      return [["넋불", `${f.n}개`], ["하나 피해", dmg(f.mult)], ["사거리", `${f.range}`]];
    }
    case "so_lamp": {
      const f = SKILL_FX.so_lamp(lv);
      return [["회복", `최대 HP의 ${pct(f.healPct)} + INT×3`], ["멈춰 서기", sec(f.rootMs)]];
    }
    case "so_drain":
      return [["흡혈", `준 피해의 ${pct(SKILL_FX.so_drain(lv).steal)}`], ["한 번 최대", "최대 HP의 3%"]];
    case "so_swift": {
      const f = SKILL_FX.so_swift(lv);
      return [["이동 속도", `+${pct(f.move)}`], ["공격 속도", `+${pct(f.aspd)}`], ["지속", sec(f.durMs)]];
    }
    case "so_friend": {
      const f = SKILL_FX.so_friend(lv);
      return [["길동무 공격", `${dmg(f.atkPct)} · ${sec(f.everyMs)}마다`], ["머무는 시간", sec(f.durMs)]];
    }
    case "so_chain": {
      const f = SKILL_FX.so_chain(lv);
      return [["피해", dmg(f.mult)], ["끌어오는 범위", `반지름 ${f.radius}`], ["묶기", sec(f.stunMs)], ["약화", `받는 피해 +${pct(f.vuln)}`]];
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
      return [["넋불 피해", `${dmg(f.atkPct)} · ${sec(f.everyMs)}마다`], ["머무는 시간", sec(f.durMs)], ["사거리", `${f.range}`]];
    }
    case "so_procession": {
      const f = SKILL_FX.so_procession(lv);
      return [["한 번 피해", `${dmg(f.mult)} × ${f.hitAt.length}번`], ["범위", "지금 화면 전체 (우두머리 포함)"], ["회복", `최대 HP의 ${pct(f.healPct)}`]];
    }
    case "so_kinship": {
      const f = SKILL_FX.so_kinship(lv);
      return [["소환 피해", `+${pct(f.summonPct)}`], ["머무는 시간", `+${pct(f.durPct)}`]];
    }
  }
}

/** 랭크 lv의 수치 표 (액티브는 SP·쿨타임까지) */
export function skillStats(def: SkillDef, lv: number): StatRow[] {
  const l = Math.max(1, Math.min(def.maxLevel, lv));
  const rows = effectRows(def.id, l).map(([label, value]) => ({ label, value }));
  if (def.kind === "active") rows.push({ label: "SP", value: `${def.sp(l)}` }, { label: "쿨타임", value: sec(def.cooldownMs(l)) });
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
    out.push({ text: `${def.tier}단 열기: ${BRANCH_INFO[def.branch].name} ${def.tier === 2 ? "1단" : `1~${def.tier - 1}단`}에 ${need}포인트`, ok: have >= need, have, need });
  }
  for (const r of def.requires ?? []) {
    const have = a[r.id] ?? 0;
    out.push({ text: `${skillById(r.id)!.name} ${r.level}랭크 필요`, ok: have >= r.level, have: Math.min(have, r.level), need: r.level });
  }
  return out;
}

/** 이 스킬을 선행으로 삼는 다음 스킬들 */
export const unlocks = (id: SkillId) => SKILLS.filter((s) => s.requires?.some((r) => r.id === id)).map((s) => ({ def: s, level: s.requires!.find((r) => r.id === id)!.level }));
