import type { MonsterDef, MonsterId, ZoneDef } from "../catalog";
import { seeded } from "../formulas";

// 11/15 야근 빌딩 테마 「지하 주차장」 (pk_): 몬스터·사냥터 정의, 층마다 방(판 시드 + 층), 다시 올 때마다 바뀌는 판(정전 주차장 …), 기믹 숫자.
// 순수 데이터 — 서버(층 계획·출현 상한)·게임(game/tower/themes/parking*)·안내서가 같이 쓴다. catalog에서는 타입만 가져온다 (순환 없음).
// 층 계획 손질은 parkingPlan.ts, 층 순서표 블록은 아래 PK_SCHEDULE (lib/rpg/towerSchedule이 끼워 쓴다).

export const PK_ZONE = "pk_parking" as const;

export type PkMonsterId =
  | "pk_ticket"
  | "pk_tire"
  | "pk_alarm_car"
  | "pk_cart"
  | "pk_shadow"
  | "pk_exit_sign"
  | "pk_exhaust"
  | "pk_attendant"
  | "pk_barrier"
  | "pk_dashcam"
  | "pk_double_park"
  | "pk_tow_truck";

/** 일반 웨이브에 나오는 열 종 (층마다 몇 종인지는 PK_SCHEDULE) */
export const PK_POOL: readonly PkMonsterId[] = [
  "pk_ticket",
  "pk_tire",
  "pk_alarm_car",
  "pk_cart",
  "pk_shadow",
  "pk_exit_sign",
  "pk_exhaust",
  "pk_attendant",
  "pk_barrier",
  "pk_dashcam",
];
/** 무리로 몰려나올 수 있는 것 (카트가 가장 자주) */
export const PK_PACKABLE: readonly PkMonsterId[] = ["pk_cart", "pk_cart", "pk_cart", "pk_ticket"];
export const PK_ELITE: PkMonsterId = "pk_double_park";
export const PK_BOSS: PkMonsterId = "pk_tow_truck";

const mon = (d: MonsterDef): MonsterDef => d;

/** 숫자는 쉬움 기준 (야근 빌딩은 지옥 배율 × TOWER_POWER × 층 배율). 모양·크기·걸음이 모두 다르다 */
export const PK_MONSTERS: Record<PkMonsterId, MonsterDef> = {
  pk_ticket: mon({ id: "pk_ticket", name: "주차 딱지", desc: "와이퍼에 끼워져 있던 노란 딱지. 펄럭 날아와 몸에 붙으면 발이 무거워진다 (여러 장이면 더).", hp: 52, atk: 9, def: 0, speed: 58, exp: 8, behavior: "chase", size: 10, color: 0xf4dc4a, accent: 0xd03030, patterns: ["bite"] }),
  pk_tire: mon({ id: "pk_tire", name: "굴러다니는 타이어", desc: "빠져 버린 타이어. 일직선으로 굴러와 벽에 튕긴다 — 멈춰서 숨 고를 때가 기회.", hp: 150, atk: 16, def: 5, speed: 30, exp: 22, behavior: "dash", size: 16, color: 0x26262c, accent: 0xb8bcc4, patterns: ["bite"] }),
  pk_alarm_car: mon({ id: "pk_alarm_car", name: "경보 울리는 차", desc: "아무도 안 건드렸는데 운다. 비상등을 깜빡이다 소리 고리를 퍼뜨려 밀어낸다.", hp: 190, atk: 13, def: 6, speed: 9, exp: 26, behavior: "ranged", size: 20, color: 0xc83a3a, accent: 0xffb03a, patterns: ["bite"] }),
  pk_cart: mon({ id: "pk_cart", name: "카트 무리", desc: "마트 카트가 주차장까지 굴러 내려왔다. 줄지어 몰려다니며 들이받는다.", hp: 34, atk: 9, def: 1, speed: 62, exp: 5, behavior: "chase", size: 11, color: 0xb8c4d0, accent: 0xe8402a, patterns: ["bite"] }),
  pk_shadow: mon({ id: "pk_shadow", name: "기둥 뒤 그림자", desc: "기둥 뒤에 숨어 있다가 가까이 오면 튀어나와 덮친다. 기둥 옆을 지날 땐 노란 눈을 살필 것.", hp: 130, atk: 18, def: 2, speed: 34, exp: 20, behavior: "chase", size: 15, color: 0x1c1a26, accent: 0xf0e070, patterns: ["bite"] }),
  pk_exit_sign: mon({ id: "pk_exit_sign", name: "비상구 표시등", desc: "초록 달리는 사람이 표시등에서 표시등으로 순간 이동하며 화살표를 쏜다. 사라지는 순간이 다음 자리를 알려 준다.", hp: 110, atk: 14, def: 2, speed: 20, exp: 20, behavior: "ranged", size: 14, color: 0x1a9a4a, accent: 0xf2f2ee, patterns: ["bite"] }),
  pk_exhaust: mon({ id: "pk_exhaust", name: "배기가스 구름", desc: "시동 걸어 둔 차가 내뿜은 매연. 지나간 자리에 매연이 깔려 그 안에선 숨이 막혀 조금씩 다친다.", hp: 120, atk: 11, def: 0, speed: 26, exp: 18, behavior: "wander", size: 17, color: 0x6a6a74, accent: 0x2a2a30, patterns: ["bite"] }),
  pk_attendant: mon({ id: "pk_attendant", name: "주차 요원", desc: "\"이쪽 막혔어요!\" 경광봉을 흔들며 내 앞길에 라바콘을 줄지어 세운다. 콘은 몇 초 뒤 치운다.", hp: 170, atk: 13, def: 5, speed: 30, exp: 22, behavior: "chase", size: 16, color: 0x2a3a5a, accent: 0xff7a1a, patterns: ["bite"] }),
  pk_barrier: mon({ id: "pk_barrier", name: "차단기", desc: "빨강·하양 차단봉을 크게 휘둘러 주변을 쓸어 낸다. 정산 안 하면 안 열린다.", hp: 200, atk: 16, def: 7, speed: 8, exp: 24, behavior: "ranged", size: 16, color: 0xe4e2da, accent: 0xd8302a, patterns: ["bite"] }),
  pk_dashcam: mon({ id: "pk_dashcam", name: "블랙박스", desc: "빨간 REC 불이 켜져 있는 동안 내 공격을 녹화한다. 몇 초 뒤 녹화한 공격을 그 자리에 그대로 재생한다.", hp: 120, atk: 13, def: 3, speed: 30, exp: 20, behavior: "wander", size: 12, color: 0x1e2026, accent: 0x3aa0ff, patterns: ["bite"] }),
  // 정예: 헤드라이트로 줄을 비추고 돌진, 쓰러지면 비상등이 터지며 주변을 밀어낸다
  pk_double_park: mon({ id: "pk_double_park", name: "이중 주차", desc: "남의 차 앞을 막고 선 얌체 차. 헤드라이트로 줄을 비춘 뒤 그 줄을 따라 돌진하고, 쓰러지면 비상등이 터지며 주변을 밀어낸다.", hp: 280, atk: 18, def: 7, speed: 22, exp: 44, behavior: "dash", size: 24, color: 0x3a5a8a, accent: 0xfff0a0, patterns: ["bite", "charge"] }),
  pk_tow_truck: mon({
    id: "pk_tow_truck",
    name: "견인차",
    desc: "\"여기 주차하시면 안 돼요.\" 견인 고리를 던져 끌어당기고, 화나면 주차된 차를 끌고 와 장애물로 세운다. 끝에는 경광등을 켜고 줄마다 들이받는다.",
    hp: 2300,
    atk: 24,
    def: 9,
    speed: 20,
    exp: 340,
    behavior: "boss",
    size: 44,
    color: 0xe8b030,
    accent: 0xff7a1a,
    patterns: ["bite", "slam", "aimed_shot"],
    phases: [
      { below: 0.7, add: ["charge"], haste: 0.85, label: "견인 고리를 휘두른다!" },
      { below: 0.4, add: ["rain", "cross"], haste: 0.72, label: "주차된 차를 끌고 온다!" },
      { below: 0.18, add: ["nova"], haste: 0.6, label: "경광등을 켜고 폭주한다!" },
    ],
  }),
};

/** 우두머리 단계 문턱 (게임 연출이 같은 값을 쓴다): 70% 고리 휘두르기, 40% 차 끌어오기, 18% 폭주 */
export const PK_BOSS_HOOK = 0.7;
export const PK_BOSS_TOW = 0.4;
export const PK_BOSS_RAMPAGE = 0.18;

// ── 기믹 숫자 (게임이 그대로 쓰고, 테스트가 경계를 본다) ──

/** 헤드라이트 돌진: 첫 돌진·간격(보통·우두머리 층)·경고 ms, 차 속도 px/s, 줄 폭 */
export const PK_RUSH = { first: 7000, every: [13_000, 10_000], warn: 1700, speed: 560, width: 26 } as const;
/** 치이면 (최대 HP 비율) — 몬스터도 치인다 */
export const PK_RUSH_HIT = 0.12;
export const PK_RUSH_MON = 0.12;
/** 출차 경보: 첫·간격·경고·지속 ms, 몬스터 속도 배율 */
export const PK_ALARM = { first: 16_000, every: 24_000, warn: 1300, dur: 4200, speed: 1.35 } as const;
/** 주차 딱지: 한 장에 느려지는 몫, 최대 장수, 붙어 있는 ms */
export const PK_TICKET = { slow: 0.14, max: 3, ms: 3200 } as const;
/** 딱지 장수 → 이동 속도 배율 (최대 장수까지만) */
export const pkTicketSlow = (n: number) => 1 - PK_TICKET.slow * Math.max(0, Math.min(PK_TICKET.max, Math.floor(n)));

// ── 다시 올 때마다 바뀌는 판 (그 테마를 몇 번째 만나는가) ──

export type PkLoop = {
  name: string;
  desc: string;
  /** 어둠 짙기 0..1 */
  dark: number;
  /** 젖은 바닥 (웅덩이가 넓고 미끄럽다) */
  wet: boolean;
  /** 돌진 간격 배율 (작을수록 자주) */
  rush: number;
  /** 경보 간격 배율 */
  alarm: number;
  /** 몬스터 이동 속도 배율 */
  speed: number;
};
export const PK_LOOPS: readonly PkLoop[] = [
  { name: "평일 밤", desc: "형광등 몇 개가 깜빡이는 늘 그런 주차장.", dark: 0.15, wet: false, rush: 1, alarm: 1, speed: 1 },
  { name: "정전 주차장", desc: "전기가 나가 비상등과 차 불빛만 남았다. 헤드라이트가 유난히 눈부시다.", dark: 0.62, wet: false, rush: 0.95, alarm: 1, speed: 1 },
  { name: "비 오는 날", desc: "젖은 바퀴 자국과 넓은 웅덩이. 바닥이 미끄럽고 차가 더 자주 지나간다.", dark: 0.3, wet: true, rush: 0.8, alarm: 1, speed: 1.05 },
  { name: "견인 단속", desc: "정전에 비까지. 출차 경보가 자주 울리고 몬스터가 10% 빠르다.", dark: 0.58, wet: true, rush: 0.8, alarm: 0.7, speed: 1.1 },
];
export const pkLoop = (visit: number): PkLoop => PK_LOOPS[Math.max(0, Math.min(PK_LOOPS.length - 1, Math.floor(visit)))];

export const PK_ZONE_DEF: ZoneDef = {
  id: PK_ZONE,
  slug: PK_ZONE,
  difficulty: "hell",
  name: "지하 주차장",
  desc: "깜빡이는 형광등, 번호를 칠한 콘크리트 기둥, 비상등만 깜빡이는 빈 차들. 어디선가 엔진 소리가 다가온다.",
  unlockLevel: 50,
  power: 1.2,
  gimmick: {
    name: "헤드라이트 돌진",
    desc: "통로 한 줄에 헤드라이트가 비치고 경적이 울리면 곧 차가 그 줄을 쏜살같이 지나간다 — 빛줄기 밖으로 비킬 것. 가끔 「출차 경보」가 울리면 몇 초 동안 몬스터가 빨라진다.",
  },
  pool: [...PK_POOL],
  boss: PK_BOSS,
  elite: PK_ELITE,
  summon: { id: "pk_cart", n: 4 },
  favor: [],
  waves: 2,
  timeLimitSec: 90,
  floor: [0x3a3c40, 0x34363a],
  deco: 0xf0c030,
  // 11/15 다시 올 때마다 바뀌는 판 (안내서·층 이름)
  visits: PK_LOOPS,
};

// ── 층마다 다른 방 (판 시드 + 층으로 정한다 — 같은 판·같은 층은 늘 같은 방) ──

/** 방 이름 (배치 번호 = game/tower/themes/parkingMap). 마지막이 우두머리 층 */
export const PK_ROOM_NAMES = ["B2 주차 구역", "경사로", "정산소 앞", "기둥 숲", "전기차 충전 구역", "자동 세차장", "하역장", "견인 차고지"] as const;
export const PK_ROOMS = PK_ROOM_NAMES.length - 1;
export const PK_BOSS_ROOM = PK_ROOMS;

/**
 * f층의 방: 우두머리 층(5의 배수)은 견인 차고지, 보통 층은 다섯 층 묶음마다 일곱 방 중 넷을 판 시드로 섞어 차례로 (묶음 안에서 겹치지 않는다)
 */
export function pkRoom(runSeed: number, f: number): number {
  const n = Math.max(1, Math.floor(f));
  const pos = (n - 1) % 5;
  if (pos === 4) return PK_BOSS_ROOM;
  const block = Math.floor((n - 1) / 5);
  const r = seeded(((runSeed ^ Math.imul(block + 1, 0x2c1b3c6d)) >>> 0) ^ 0x504b524d);
  const order = Array.from({ length: PK_ROOMS }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[pos];
}

/** 기둥 칠 (구역 글자 + 층 번호 두 자리): 13층 → "B3", 우두머리 층은 "T" (견인) */
export function pkPillarCode(f: number): string {
  const n = Math.max(1, Math.floor(f));
  if (n % 5 === 0) return "T";
  return `${"ABCD"[Math.floor((n - 1) / 5) % 4]}${((n - 1) % 5) + 1}`;
}

// ── 층 순서표 (lib/rpg/towerSchedule이 끼워 쓴다): 처음 만날 때 층마다 한두 종씩 → 다음엔 판에 맞게 섞고 남은 종 → 그 뒤로 섞은 두 벌 ──

type Block = readonly (readonly MonsterId[])[];
export const PK_SCHEDULE: { first: Block; second: Block; remix: readonly Block[] } = {
  first: [
    ["pk_cart", "pk_tire"],
    ["pk_tire", "pk_ticket", "pk_cart"],
    ["pk_ticket", "pk_alarm_car", "pk_exhaust"],
    ["pk_alarm_car", "pk_shadow", "pk_cart", "pk_tire"],
    ["pk_exhaust", "pk_ticket", "pk_shadow"],
  ],
  second: [
    ["pk_exit_sign", "pk_cart", "pk_tire"],
    ["pk_attendant", "pk_ticket", "pk_shadow"],
    ["pk_barrier", "pk_exit_sign", "pk_alarm_car"],
    ["pk_dashcam", "pk_attendant", "pk_exhaust", "pk_cart"],
    ["pk_barrier", "pk_dashcam", "pk_tire"],
  ],
  remix: [
    [
      ["pk_cart", "pk_dashcam", "pk_shadow", "pk_ticket"],
      ["pk_barrier", "pk_exhaust", "pk_exit_sign"],
      ["pk_attendant", "pk_tire", "pk_alarm_car", "pk_cart"],
      ["pk_shadow", "pk_dashcam", "pk_barrier", "pk_ticket"],
      ["pk_exit_sign", "pk_attendant", "pk_cart"],
    ],
    [
      ["pk_tire", "pk_exit_sign", "pk_exhaust", "pk_cart"],
      ["pk_alarm_car", "pk_dashcam", "pk_ticket"],
      ["pk_shadow", "pk_barrier", "pk_attendant", "pk_tire"],
      ["pk_exhaust", "pk_alarm_car", "pk_exit_sign", "pk_dashcam"],
      ["pk_ticket", "pk_shadow", "pk_cart"],
    ],
  ],
};
