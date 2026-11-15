import type { MonsterDef, ZoneDef } from "../catalog";
import type { Schedule } from "../towerSchedule";

// 11/15 야근 빌딩 테마 「옥상 정원 폭풍」: 비 내리는 밤 옥상 정원 (화단·벤치·실외기·물탱크·도시 네온). 기믹은 돌풍(옆으로 밀림)과 낙뢰(노란 원 → 벼락).
// 몬스터·사냥터 정의·순서표·다시 올 때마다 바뀌는 판 — 서버(층 계획·출현 상한)·게임(game/tower/themes/rooftop*)·안내서가 같이 쓴다.
// 이 파일은 catalog·towerSchedule에서 타입만 가져온다 (catalog가 이 파일의 값을 가져가므로 런타임 순환이 없게). 몬스터 id는 모두 rf_ 로 시작한다.

export const RF_ZONE = "rf_rooftop" as const;

export const RF_MONSTER_IDS = [
  "rf_umbrella",
  "rf_planter",
  "rf_smoker",
  "rf_ac_unit",
  "rf_pigeon",
  "rf_leak",
  "rf_droplet",
  "rf_papers",
  "rf_rod_broken",
  "rf_parcel",
  "rf_cat",
  "rf_spark",
  "rf_vane",
  "rf_lightning_rod",
] as const;
export type RfMonsterId = (typeof RF_MONSTER_IDS)[number];

type RfDef = Omit<MonsterDef, "id"> & { id: RfMonsterId };
const mon = (d: RfDef): RfDef => d;

/** 숫자는 쉬움 기준 (야근 빌딩은 지옥 배율 × TOWER_POWER × 층 배율). 모양·크기·걸음이 모두 다르다 */
export const RF_MONSTERS: Record<RfMonsterId, RfDef> = {
  // 뒤집힌 우산: 돌풍을 타고 빙글빙글 미끄러져 온다
  rf_umbrella: mon({ id: "rf_umbrella", name: "뒤집힌 우산", desc: "바람에 뒤집힌 장우산. 돌풍이 불면 그 바람을 타고 빙글빙글 미끄러져 와 우산살로 긁는다.", hp: 120, atk: 13, def: 2, speed: 34, exp: 18, behavior: "wander", size: 16, color: 0x2a3a8a, accent: 0xe8e0d0, patterns: ["bite"] }),
  // 날아다니는 화분: 붕 떠올랐다가 내 머리 위 그림자 자리로 떨어진다
  rf_planter: mon({ id: "rf_planter", name: "날아다니는 화분", desc: "바람에 떠오른 화분. 하늘로 붕 떴다가 내 머리 위 그림자 자리로 쿵 떨어진다. 그림자가 진해지면 비킬 것.", hp: 130, atk: 16, def: 3, speed: 26, exp: 20, behavior: "chase", size: 14, color: 0xc0623a, accent: 0x4aa04a, patterns: ["bite"] }),
  // 젖은 흡연자: 지나간 자리에 연기 구름 (바람에 밀려 간다)
  rf_smoker: mon({ id: "rf_smoker", name: "젖은 흡연자", desc: "\"한 대만 피우고 들어갈게.\" 지나간 자리에 연기 구름이 남는다. 구름 속에선 콜록거리며 다치고, 구름은 바람에 밀려 간다.", hp: 150, atk: 13, def: 3, speed: 24, exp: 20, behavior: "chase", size: 17, color: 0x5a6a5a, accent: 0xff7a2a, patterns: ["bite"] }),
  // 실외기: 팬이 달아오르면 앞으로 뜨거운 바람 기둥 (밀어낸다)
  rf_ac_unit: mon({ id: "rf_ac_unit", name: "실외기", desc: "덜덜 떠는 에어컨 실외기. 팬이 빨갛게 달아오르면 앞으로 뜨거운 바람 기둥을 길게 뿜어 밀어낸다.", hp: 180, atk: 15, def: 6, speed: 10, exp: 24, behavior: "ranged", size: 18, color: 0xd8d8d0, accent: 0x8a9aa8, patterns: ["bite"] }),
  // 비둘기 떼: 무리로 몰려다니다 한꺼번에 덮친다
  rf_pigeon: mon({ id: "rf_pigeon", name: "비둘기 떼", desc: "구구구. 떼로 몰려다니다 한꺼번에 푸드덕 날아올라 덮친다.", hp: 28, atk: 8, def: 0, speed: 62, exp: 4, behavior: "chase", size: 9, color: 0x8a90a0, accent: 0x6ad08a, patterns: ["bite"] }),
  // 물탱크 누수: 웅덩이를 남기고, 터지면 물방울 둘
  rf_leak: mon({ id: "rf_leak", name: "물탱크 누수", desc: "물탱크에서 새어 나온 물덩어리. 지나간 자리에 웅덩이를 남기고, 터지면 물방울 둘로 갈라진다. 웅덩이에 벼락이 떨어지면 웅덩이 전체가 찌릿하다.", hp: 140, atk: 12, def: 2, speed: 28, exp: 18, behavior: "split", size: 15, color: 0x4ab0d8, accent: 0xe0f8ff, split: { id: "rf_droplet", n: 2 }, patterns: ["bite"] }),
  rf_droplet: mon({ id: "rf_droplet", name: "물방울", desc: "갈라진 물방울. 작고 빠르게 통통 튀어 온다.", hp: 40, atk: 9, def: 0, speed: 50, exp: 4, behavior: "chase", size: 10, color: 0x8ad8f0, accent: 0xffffff, minion: true, patterns: ["bite"] }),
  // 서류 뭉치: 바람 부는 쪽으로 휙휙 (종이에 베인다)
  rf_papers: mon({ id: "rf_papers", name: "날리는 서류 뭉치", desc: "바람에 날리는 결재 서류 뭉치. 바람이 부는 쪽으로 휙휙 날아다니며 지나가는 자리를 종이로 벤다.", hp: 70, atk: 11, def: 0, speed: 48, exp: 10, behavior: "wander", size: 12, color: 0xf2f0e6, accent: 0x5a7aa8, patterns: ["bite"] }),
  // 고장난 피뢰침: 가까운 몬스터와 전기 줄로 이어진다 (줄에 닿으면 감전)
  rf_rod_broken: mon({ id: "rf_rod_broken", name: "고장난 피뢰침", desc: "기울어진 작은 피뢰침. 가까운 몬스터와 전기 줄로 이어져 있어서 그 줄에 닿으면 감전된다. 피뢰침을 쓰러뜨리면 줄도 끊긴다.", hp: 160, atk: 14, def: 5, speed: 16, exp: 24, behavior: "ranged", size: 16, color: 0x9aa0a8, accent: 0xfff06a, patterns: ["aimed_shot"] }),
  // 미끄러지는 택배 상자: 젖은 바닥을 썰매처럼
  rf_parcel: mon({ id: "rf_parcel", name: "미끄러지는 택배 상자", desc: "옥상에 잘못 온 택배. 젖은 바닥을 썰매처럼 미끄러져 와 부딪히고, 멈출 때까지 한참 미끄러진다.", hp: 130, atk: 16, def: 4, speed: 30, exp: 18, behavior: "chase", size: 14, color: 0xc89a5a, accent: 0x3a5ac8, patterns: ["bite"] }),
  // 옥상 고양이: 할퀴고 내 버프 하나를 물고 달아난다 (잡으면 돌려받는다)
  rf_cat: mon({ id: "rf_cat", name: "옥상 고양이", desc: "옥상의 주인. 슬쩍 다가와 할퀴고 내 버프 하나를 물고 달아난다. 빨리 잡으면 돌려받는다.", hp: 100, atk: 12, def: 1, speed: 56, exp: 18, behavior: "chase", size: 12, color: 0x2a2a30, accent: 0xf0d040, patterns: ["bite"] }),
  // 우두머리가 흩뿌리는 불꽃 (졸개)
  rf_spark: mon({ id: "rf_spark", name: "정전기 불꽃", desc: "피뢰침이 흩뿌린 불꽃. 지지직거리며 쫓아온다.", hp: 50, atk: 10, def: 0, speed: 58, exp: 5, behavior: "chase", size: 10, color: 0xfff06a, accent: 0x6ad0ff, minion: true, patterns: ["bite"] }),
  // 정예: 살아 있는 동안 돌풍이 더 자주·세게, 바람에 서류 뭉치가 날아든다 (층 계획 adds 상한까지)
  rf_vane: mon({ id: "rf_vane", name: "풍향계 수탉", desc: "녹슨 수탉 풍향계. 살아 있는 동안 돌풍이 더 자주 세게 불고, 바람에 실려 서류 뭉치가 계속 날아든다.", hp: 260, atk: 17, def: 6, speed: 24, exp: 40, behavior: "dash", size: 20, color: 0xc87a2a, accent: 0x3a3a40, patterns: ["bite", "charge"] }),
  rf_lightning_rod: mon({
    id: "rf_lightning_rod",
    name: "피뢰침",
    desc: "빌딩 꼭대기의 피뢰침. 번개를 끌어와 바닥에 줄줄이 떨어뜨린다. 반이 깎이면 폭풍이 거세지고, 끝에는 하늘 전체에서 번개가 쏟아진다. 고무 매트 위가 안전하다.",
    hp: 2300,
    atk: 24,
    def: 9,
    speed: 16,
    exp: 340,
    behavior: "boss",
    size: 42,
    color: 0x7a8290,
    accent: 0xfff06a,
    patterns: ["bite", "aimed_shot", "slam"],
    phases: [
      { below: 0.5, add: ["rain", "cross"], haste: 0.75, label: "하늘이 갈라진다!" },
      { below: 0.25, add: ["nova"], haste: 0.6, label: "번개를 한꺼번에 부른다!" },
    ],
  }),
};

/** 우두머리 단계 문턱 (게임 연출이 같은 값을 쓴다): 50% 폭풍, 25% 번개 폭포 */
export const RF_BOSS_STORM = 0.5;
export const RF_BOSS_FINAL = 0.25;

/** 일반 몬스터 (층마다 이 중 몇 종만 — 순서표) */
export const RF_POOL: readonly RfMonsterId[] = ["rf_umbrella", "rf_planter", "rf_smoker", "rf_ac_unit", "rf_pigeon", "rf_leak", "rf_papers", "rf_rod_broken", "rf_parcel", "rf_cat"];
/** 무리로 몰려나올 수 있는 것 (비둘기가 가장 자주) */
export const RF_PACKABLE: readonly RfMonsterId[] = ["rf_pigeon", "rf_pigeon", "rf_pigeon", "rf_papers"];
export const RF_ELITE: RfMonsterId = "rf_vane";
export const RF_BOSS: RfMonsterId = "rf_lightning_rod";

/** 다시 올 때마다 바뀌는 판 (마지막 것이 계속) */
export const RF_VISITS: readonly { name: string; desc: string }[] = [
  { name: "비 오는 밤", desc: "빗줄기 사이로 도시 네온이 번진다. 돌풍과 벼락은 가끔." },
  { name: "폭풍 강해짐", desc: "빗줄기가 굵어지고 돌풍이 더 자주, 더 세게 분다. 벼락도 두 개씩 떨어진다." },
  { name: "정전된 도시", desc: "도시 불빛이 모두 꺼진다. 번개가 칠 때만 옥상이 환해지고, 벼락이 더 자주 떨어진다." },
  { name: "태풍의 눈", desc: "바람 방향이 계속 바뀐다. 돌풍도 벼락도 어둠도 한꺼번에 몰려온다." },
];

export const RF_ZONE_DEF: ZoneDef = {
  id: RF_ZONE,
  difficulty: "hell",
  slug: RF_ZONE,
  name: "옥상 정원 폭풍",
  desc: "비바람이 몰아치는 밤의 옥상 정원. 화분이 흔들리고, 웅덩이마다 도시 네온이 비치고, 번개가 칠 때마다 옥상 전체가 하얗게 드러난다.",
  unlockLevel: 50,
  power: 1.2,
  gimmick: {
    name: "돌풍과 낙뢰",
    desc: "바람 화살표가 깜빡이면 곧 돌풍이 분다. 나도 몬스터도 날아가는 탄도 바람 쪽으로 밀려가니 화단이나 실외기 뒤에 붙어 버틸 것. 바닥에 노란 원이 그려지면 잠시 뒤 그 자리에 벼락이 떨어지고, 웅덩이에 떨어진 벼락은 웅덩이 전체로 퍼진다.",
  },
  pool: [...RF_POOL],
  boss: RF_BOSS,
  elite: RF_ELITE,
  summon: { id: "rf_spark", n: 4 },
  favor: ["w_monitor_arm", "a_padding"],
  waves: 2,
  timeLimitSec: 90,
  floor: [0x22302a, 0x1c2824],
  deco: 0x6ad0ff,
  visits: RF_VISITS,
};

/** 층 순서표 (towerSchedule TABLES가 가져간다): 처음 온 블록은 층마다 한두 종씩 새로, 두 번째에 남은 네 종이 들어온다 */
export const RF_SCHEDULE: Schedule = {
  first: [
    ["rf_umbrella", "rf_pigeon"],
    ["rf_umbrella", "rf_pigeon", "rf_papers"],
    ["rf_papers", "rf_planter", "rf_leak", "rf_umbrella"],
    ["rf_leak", "rf_ac_unit", "rf_pigeon", "rf_planter"],
    ["rf_planter", "rf_papers", "rf_ac_unit", "rf_umbrella"],
  ],
  second: [
    ["rf_umbrella", "rf_smoker", "rf_pigeon"],
    ["rf_parcel", "rf_leak", "rf_papers"],
    ["rf_rod_broken", "rf_planter", "rf_pigeon", "rf_smoker"],
    ["rf_cat", "rf_ac_unit", "rf_parcel", "rf_rod_broken"],
    ["rf_cat", "rf_smoker", "rf_leak", "rf_umbrella"],
  ],
  remix: [
    [
      ["rf_smoker", "rf_pigeon", "rf_rod_broken", "rf_papers"],
      ["rf_parcel", "rf_cat", "rf_umbrella", "rf_leak"],
      ["rf_ac_unit", "rf_planter", "rf_smoker", "rf_pigeon"],
      ["rf_rod_broken", "rf_leak", "rf_cat", "rf_papers"],
      ["rf_parcel", "rf_ac_unit", "rf_umbrella", "rf_planter"],
    ],
    [
      ["rf_cat", "rf_planter", "rf_papers", "rf_pigeon"],
      ["rf_ac_unit", "rf_smoker", "rf_parcel", "rf_umbrella"],
      ["rf_leak", "rf_rod_broken", "rf_pigeon", "rf_cat"],
      ["rf_planter", "rf_parcel", "rf_smoker", "rf_ac_unit"],
      ["rf_rod_broken", "rf_umbrella", "rf_papers", "rf_leak"],
    ],
  ],
};

// ── 방 (배치 번호 = game/tower/themes/rooftopMap RF_ROOM_NAMES) ──

/** 보통 층 방 종류 수 (0..6), 7 = 우두머리 층 피뢰침 탑 */
export const RF_ROOMS = 7;
export const RF_BOSS_ROOM = 7;
/** 방 고르기 섞는 값 (towerSchedule blockRoom) */
export const RF_ROOM_SALT = 0x52464f50;

// ── 기믹 숫자 (다시 올 때마다 세진다) — 게임이 그대로 쓰고 테스트가 본다 ──

export type RfWeather = {
  /** 돌풍 사이 간격 ms · 미리 알림 ms · 부는 시간 ms · 미는 속도 px/s */
  gustEvery: number;
  gustWarn: number;
  gustMs: number;
  gustPush: number;
  /** 낙뢰 사이 간격 ms · 한 번에 떨어지는 수 · 노란 원이 그려진 뒤 떨어지기까지 ms · 반지름 */
  strikeEvery: number;
  strikes: number;
  strikeWarn: number;
  strikeR: number;
  /** 비 굵기 0..1 · 도시 불빛 끄기 · 바람 방향이 돈다 */
  rain: number;
  blackout: boolean;
  swirl: boolean;
};

export function rfWeather(visit: number): RfWeather {
  const v = Math.max(0, Math.min(RF_VISITS.length - 1, Math.floor(visit)));
  return {
    gustEvery: [11_000, 8_500, 8_500, 7_000][v],
    gustWarn: 1400,
    gustMs: [2600, 3000, 3000, 3200][v],
    gustPush: [70, 90, 90, 100][v],
    strikeEvery: [7_000, 6_000, 4_800, 4_200][v],
    strikes: [1, 2, 2, 3][v],
    strikeWarn: 1300,
    strikeR: 22,
    rain: [0.55, 0.85, 0.7, 1][v],
    blackout: v >= 2,
    swirl: v >= 3,
  };
}

/** 풍향계 수탉이 살아 있으면 돌풍 간격 배율 */
export const RF_VANE_GUST = 0.6;
