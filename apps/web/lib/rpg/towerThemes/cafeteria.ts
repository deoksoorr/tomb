import type { MonsterDef, MonsterId, ZoneDef } from "../catalog";
import { seeded } from "../formulas";

// 11/15 야근 빌딩 테마 「구내식당」 (cf_): 몬스터·사냥터 정의, 층마다 방(판 시드 + 층), 다시 올 때마다 바뀌는 판(특식의 날 …), 기믹 숫자.
// 순수 데이터 — 서버(층 계획·출현 상한)·게임(game/tower/themes/cafeteria*)·안내서가 같이 쓴다. catalog에서는 타입만 가져온다 (순환 없음).
// 층 계획 손질은 cafeteriaPlan.ts, 층 순서표 블록은 아래 CF_SCHEDULE (lib/rpg/towerSchedule이 끼워 쓴다).

export const CF_ZONE = "cf_cafeteria" as const;

export type CfMonsterId =
  | "cf_tray"
  | "cf_chopsticks"
  | "cf_danmuji"
  | "cf_kimchi"
  | "cf_ladle"
  | "cf_meal_ticket"
  | "cf_jelly"
  | "cf_jelly_bit"
  | "cf_vending"
  | "cf_bin"
  | "cf_spoon"
  | "cf_rice_cooker"
  | "cf_riceball"
  | "cf_server"
  | "cf_nutritionist";

/** 일반 웨이브에 나오는 열 종 (층마다 몇 종인지는 CF_SCHEDULE) */
export const CF_POOL: readonly CfMonsterId[] = [
  "cf_tray",
  "cf_chopsticks",
  "cf_danmuji",
  "cf_kimchi",
  "cf_ladle",
  "cf_meal_ticket",
  "cf_jelly",
  "cf_vending",
  "cf_bin",
  "cf_spoon",
];
/** 무리로 몰려나올 수 있는 것 (식권이 가장 자주) */
export const CF_PACKABLE: readonly CfMonsterId[] = ["cf_meal_ticket", "cf_meal_ticket", "cf_meal_ticket", "cf_danmuji"];
export const CF_ELITE: CfMonsterId = "cf_rice_cooker";
export const CF_BOSS: CfMonsterId = "cf_nutritionist";

const mon = (d: MonsterDef): MonsterDef => d;

/** 숫자는 쉬움 기준 (야근 빌딩은 지옥 배율 × TOWER_POWER × 층 배율). 모양·크기·걸음이 모두 다르다 */
export const CF_MONSTERS: Record<CfMonsterId, MonsterDef> = {
  cf_tray: mon({ id: "cf_tray", name: "미끄러지는 식판", desc: "몸을 낮췄다가 바닥을 쭉 미끄러져 와 들이받는 식판. 다 미끄러지면 팽그르르 돈다.", hp: 130, atk: 15, def: 4, speed: 28, exp: 20, behavior: "dash", size: 16, color: 0xa8b4be, accent: 0x5a6a78, patterns: ["bite"] }),
  cf_chopsticks: mon({ id: "cf_chopsticks", name: "젓가락 한 쌍", desc: "나를 사이에 두고 양쪽에서 집으려 드는 젓가락. 두 줄이 그어지면 가운데로 집어 오니 줄 밖으로 빠질 것.", hp: 120, atk: 17, def: 3, speed: 36, exp: 20, behavior: "chase", size: 15, color: 0xc8a46a, accent: 0xd03a30, patterns: ["bite"] }),
  cf_danmuji: mon({ id: "cf_danmuji", name: "날아다니는 단무지", desc: "나를 빙빙 돌다가 틈이 보이면 휙 파고드는 단무지 조각.", hp: 80, atk: 12, def: 1, speed: 46, exp: 14, behavior: "chase", size: 11, color: 0xf4e040, accent: 0xd8b020, patterns: ["bite"] }),
  cf_kimchi: mon({ id: "cf_kimchi", name: "김치통", desc: "다가와 뚜껑이 부풀다 펑 터지는 김치통. 튄 자리가 한동안 따갑다.", hp: 140, atk: 22, def: 3, speed: 30, exp: 18, behavior: "explode", size: 15, color: 0xdfe2e4, accent: 0xd8302a }),
  cf_ladle: mon({ id: "cf_ladle", name: "국자", desc: "멈춰 서서 크게 한 바퀴 휘두르는 국자. 휘두른 자리에 뜨거운 국물을 흩뿌린다.", hp: 160, atk: 17, def: 4, speed: 28, exp: 22, behavior: "chase", size: 17, color: 0xbcc0c8, accent: 0x6a4a2a, patterns: ["bite"] }),
  cf_meal_ticket: mon({ id: "cf_meal_ticket", name: "식권 떼", desc: "떼로 몰려다니며 휩쓰는 식권. 한 장 한 장은 약하다.", hp: 24, atk: 7, def: 0, speed: 66, exp: 4, behavior: "chase", size: 9, color: 0xf2ead3, accent: 0x3a7ad0, patterns: ["bite"] }),
  cf_jelly: mon({ id: "cf_jelly", name: "디저트 젤리", desc: "통통 튀어 다니는 딸기 젤리. 쓰러지면 작은 젤리 셋으로 갈라진다.", hp: 110, atk: 12, def: 1, speed: 30, exp: 12, behavior: "split", size: 15, color: 0xe85a8a, accent: 0xffd0e0, split: { id: "cf_jelly_bit", n: 3 } }),
  cf_jelly_bit: mon({ id: "cf_jelly_bit", name: "젤리 조각", desc: "갈라진 젤리 조각. 작고 통통 튄다.", hp: 26, atk: 8, def: 0, speed: 52, exp: 3, behavior: "chase", size: 8, color: 0xf08ab4, accent: 0xfff0f4, minion: true }),
  cf_vending: mon({ id: "cf_vending", name: "커피 자판기", desc: "벽에 튕기며 굴러오는 캔커피를 쏘는 자판기. 딸깍 소리가 신호다.", hp: 200, atk: 14, def: 7, speed: 8, exp: 24, behavior: "ranged", size: 20, color: 0x8a3a2a, accent: 0xf0d8a0, patterns: ["bite"] }),
  cf_bin: mon({ id: "cf_bin", name: "잔반통", desc: "뚜껑을 열면 주변을 빨아들이는 잔반통. 가까울수록 세게 당긴다.", hp: 180, atk: 13, def: 5, speed: 16, exp: 22, behavior: "ranged", size: 18, color: 0x3a6a4a, accent: 0xb0a070, patterns: ["bite"] }),
  cf_spoon: mon({ id: "cf_spoon", name: "부메랑 숟가락", desc: "던지면 부메랑처럼 휘어 갔다 돌아오는 숟가락. 돌아오는 길도 아프다.", hp: 100, atk: 14, def: 2, speed: 34, exp: 18, behavior: "ranged", size: 13, color: 0xd8dce4, accent: 0x7a8a9a, patterns: ["bite"] }),
  // 정예: 김이 차오르면 증기를 사방으로, 주먹밥을 튀겨 낸다 (층 계획 adds 몫까지)
  cf_rice_cooker: mon({ id: "cf_rice_cooker", name: "압력밥솥", desc: "김이 차오르면 사방으로 증기를 뿜고 주먹밥을 튀겨 내는 정예 압력밥솥. 칙칙칙 소리가 신호다.", hp: 280, atk: 17, def: 7, speed: 20, exp: 44, behavior: "chase", size: 22, color: 0xe8e4dc, accent: 0xd03030, patterns: ["bite", "slam"] }),
  cf_riceball: mon({ id: "cf_riceball", name: "주먹밥", desc: "밥솥이 튀겨 낸 따끈한 주먹밥. 굴러 와 부딪힌다.", hp: 28, atk: 8, def: 0, speed: 48, exp: 3, behavior: "chase", size: 9, color: 0xf6f4ec, accent: 0x24302a, minion: true }),
  cf_server: mon({ id: "cf_server", name: "배식 도우미", desc: "영양사가 부르면 쟁반을 들고 줄지어 들어온다.", hp: 60, atk: 11, def: 2, speed: 40, exp: 6, behavior: "chase", size: 13, color: 0xe8e0d0, accent: 0x3a7a4a, minion: true, patterns: ["bite"] }),
  cf_nutritionist: mon({
    id: "cf_nutritionist",
    name: "영양사",
    desc: "\"오늘의 메뉴 바뀌었습니다.\" 메뉴를 바꿀 때마다 판이 달라진다. 매운 날엔 바닥이 끓고, 국 없는 날엔 식판이 날아오고, 특식 날엔 배식 도우미가 줄지어 들어온다.",
    hp: 2300,
    atk: 24,
    def: 9,
    speed: 22,
    exp: 340,
    behavior: "boss",
    size: 40,
    color: 0xf2f2ee,
    accent: 0x3a9a5a,
    patterns: ["bite", "slam", "aimed_shot"],
    phases: [
      { below: 0.75, add: ["rain"], haste: 0.85, label: "\"오늘은 매운 날이에요!\"" },
      { below: 0.5, add: ["fan_volley", "charge"], haste: 0.72, label: "\"국 없는 날입니다!\"" },
      { below: 0.25, add: ["nova", "cross"], haste: 0.6, label: "\"특식 나왔어요!\"" },
    ],
  }),
};

/** 우두머리 메뉴 문턱 (게임 연출이 같은 값을 쓴다): 75% 매운 날, 50% 국 없는 날, 25% 특식 */
export const CF_BOSS_SPICY = 0.75;
export const CF_BOSS_NOSOUP = 0.5;
export const CF_BOSS_SPECIAL = 0.25;
/** 영양사 메뉴 이름 (0 = 평소) */
export const CF_MENUS = ["오늘의 메뉴", "매운 날", "국 없는 날", "특식"] as const;

// ── 다시 올 때마다 바뀌는 판 ──

export type CfLoop = {
  name: string;
  desc: string;
  /** 어둠 짙기 0..1 */
  dark: number;
  /** 줄서기 간격 배율 (작을수록 자주) */
  queue: number;
  /** 국물 튀는 간격 배율 */
  spill: number;
  /** 몬스터 이동 속도 배율 */
  speed: number;
  /** 특식 장식 (현수막·풍선) */
  festive: boolean;
};
export const CF_LOOPS: readonly CfLoop[] = [
  { name: "평소 점심", desc: "늘 먹던 백반. 줄이 길다.", dark: 0, queue: 1, spill: 1, speed: 1, festive: false },
  { name: "특식의 날", desc: "현수막이 걸리고 줄이 두 배. 줄서기가 더 자주, 더 길게 밀려온다.", dark: 0, queue: 0.75, spill: 1, speed: 1.05, festive: true },
  { name: "야식 시간", desc: "불 꺼진 식당에 국솥만 끓는다. 어둡고 국물이 더 자주 튄다.", dark: 0.55, queue: 1.1, spill: 0.75, speed: 1, festive: false },
  { name: "단체 회식", desc: "회식 손님까지 몰려와 줄도 국물도 쉴 틈이 없다. 몬스터가 10% 빠르다.", dark: 0.3, queue: 0.7, spill: 0.75, speed: 1.1, festive: true },
];
export const cfLoop = (visit: number): CfLoop => CF_LOOPS[Math.max(0, Math.min(CF_LOOPS.length - 1, Math.floor(visit)))];

export const CF_ZONE_DEF: ZoneDef = {
  id: CF_ZONE,
  slug: CF_ZONE,
  difficulty: "hell",
  name: "구내식당",
  desc: "식판 부딪히는 소리, 국 냄새, 줄 서는 발소리. 열두 시 땡 하면 모두가 한 방향으로 걷는다.",
  unlockLevel: 50,
  power: 1.2,
  gimmick: {
    name: "점심시간 줄서기",
    desc: "「점심시간!」 알림이 뜨면 바닥의 줄서기 선을 따라 사람들이 밀려와 그 줄 안에 있으면 함께 떠밀린다. 배식대 국솥이 끓어 넘치면 국물이 튈 자리가 표시되고, 튄 국물은 한동안 뜨거운 웅덩이로 남는다.",
  },
  pool: [...CF_POOL],
  boss: CF_BOSS,
  elite: CF_ELITE,
  summon: { id: "cf_server", n: 3 },
  favor: [],
  waves: 2,
  timeLimitSec: 90,
  floor: [0xd8d2c4, 0xccc6b8],
  deco: 0x3a9a5a,
  // 11/15 다시 올 때마다 바뀌는 판 (안내서·층 이름)
  visits: CF_LOOPS,
};

// ── 기믹 숫자 (게임이 그대로 쓰고, 테스트가 경계를 본다) ──

/** 점심시간 줄서기: 첫·간격(보통·우두머리 층)·경고·지속 ms, 미는 힘 px/s, 줄 폭 */
export const CF_QUEUE = { first: 9000, every: [17_000, 14_000], warn: 1500, dur: 5200, push: 74, width: 30 } as const;
/** 뜨거운 국물: 첫·간격(보통·우두머리 층)·경고 ms, 튀는 반지름, 웅덩이 지속 ms, 피해 간격·비율 */
export const CF_SPILL = { first: 5000, every: [6500, 5000], warn: 1300, r: 20, burn: 4600, tick: 500, pct: 0.035 } as const;
/** 웅덩이는 한 번에 이만큼까지 (오래된 것부터 식는다) */
export const CF_PUDDLE_CAP = 10;

// ── 층마다 다른 방 (판 시드 + 층으로 정한다) ──

/** 방 이름 (배치 번호 = game/tower/themes/cafeteriaMap). 마지막이 우두머리 층 */
export const CF_ROOM_NAMES = ["배식 줄", "4인 테이블 홀", "창가 바 좌석", "자판기 코너", "퇴식구", "조리실 뒤편", "샐러드 바", "특식 배식대"] as const;
export const CF_ROOMS = CF_ROOM_NAMES.length - 1;
export const CF_BOSS_ROOM = CF_ROOMS;

/** f층의 방: 우두머리 층은 특식 배식대, 보통 층은 다섯 층 묶음마다 일곱 방 중 넷을 판 시드로 섞어 차례로 */
export function cfRoom(runSeed: number, f: number): number {
  const n = Math.max(1, Math.floor(f));
  const pos = (n - 1) % 5;
  if (pos === 4) return CF_BOSS_ROOM;
  const block = Math.floor((n - 1) / 5);
  const r = seeded(((runSeed ^ Math.imul(block + 1, 0x1b873593)) >>> 0) ^ 0x43464544);
  const order = Array.from({ length: CF_ROOMS }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[pos];
}

/** 오늘의 메뉴판 (층마다 다른 백반) — 메뉴판 그림·층 이름에 쓴다 */
export const CF_DISHES = ["제육볶음", "김치찌개", "돈가스", "비빔밥", "카레라이스", "된장찌개", "짜장면", "닭갈비", "순두부찌개", "떡볶이"] as const;
export const cfDish = (f: number) => {
  const n = Math.max(1, Math.floor(f));
  return CF_DISHES[(n * 37 + Math.floor(n / 7) * 11) % CF_DISHES.length];
};

// ── 층 순서표 (lib/rpg/towerSchedule이 끼워 쓴다) ──

type Block = readonly (readonly MonsterId[])[];
export const CF_SCHEDULE: { first: Block; second: Block; remix: readonly Block[] } = {
  first: [
    ["cf_meal_ticket", "cf_tray"],
    ["cf_tray", "cf_danmuji", "cf_meal_ticket"],
    ["cf_danmuji", "cf_kimchi", "cf_jelly"],
    ["cf_ladle", "cf_kimchi", "cf_meal_ticket", "cf_tray"],
    ["cf_jelly", "cf_ladle", "cf_danmuji"],
  ],
  second: [
    ["cf_chopsticks", "cf_meal_ticket", "cf_tray"],
    ["cf_vending", "cf_jelly", "cf_danmuji"],
    ["cf_spoon", "cf_chopsticks", "cf_kimchi"],
    ["cf_bin", "cf_vending", "cf_ladle", "cf_meal_ticket"],
    ["cf_bin", "cf_spoon", "cf_jelly"],
  ],
  remix: [
    [
      ["cf_meal_ticket", "cf_spoon", "cf_kimchi", "cf_tray"],
      ["cf_bin", "cf_danmuji", "cf_chopsticks"],
      ["cf_vending", "cf_ladle", "cf_jelly", "cf_meal_ticket"],
      ["cf_chopsticks", "cf_spoon", "cf_bin", "cf_kimchi"],
      ["cf_tray", "cf_vending", "cf_danmuji"],
    ],
    [
      ["cf_jelly", "cf_chopsticks", "cf_vending", "cf_meal_ticket"],
      ["cf_ladle", "cf_spoon", "cf_tray"],
      ["cf_kimchi", "cf_bin", "cf_danmuji", "cf_jelly"],
      ["cf_spoon", "cf_tray", "cf_chopsticks", "cf_ladle"],
      ["cf_meal_ticket", "cf_kimchi", "cf_bin"],
    ],
  ],
};
