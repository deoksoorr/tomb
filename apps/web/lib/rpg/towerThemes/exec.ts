import type { MonsterDef, ZoneDef } from "../catalog";
import type { Schedule } from "../towerSchedule";

// 11/15 야근 빌딩 테마 「임원층」: 금빛 카펫·샹들리에·나무 벽판·유리 트로피 장식장·비서 책상·통유리 전망창.
// 기믹은 결재 서류 비(그림자가 진해지면 서류 더미가 떨어진다)와 회장님 순시(스포트라이트가 방을 훑고, 빛 안 몬스터가 세진다).
// 몬스터·사냥터 정의·순서표·다시 올 때마다 바뀌는 판 — 서버·게임(game/tower/themes/exec*)·안내서가 같이 쓴다. 몬스터 id는 모두 ex_ 로 시작한다.
// 이 파일은 catalog·towerSchedule에서 타입만 가져온다 (런타임 순환이 없게).

export const EX_ZONE = "ex_exec" as const;

export const EX_MONSTER_IDS = [
  "ex_phone",
  "ex_pen",
  "ex_putter",
  "ex_wine",
  "ex_chair",
  "ex_portrait",
  "ex_seal",
  "ex_cards",
  "ex_card",
  "ex_bonsai",
  "ex_car_key",
  "ex_entourage",
  "ex_secretary",
  "ex_ceo",
] as const;
export type ExMonsterId = (typeof EX_MONSTER_IDS)[number];

type ExDef = Omit<MonsterDef, "id"> & { id: ExMonsterId };
const mon = (d: ExDef): ExDef => d;

/** 숫자는 쉬움 기준 (야근 빌딩은 지옥 배율 × TOWER_POWER × 층 배율). 모양·크기·걸음이 모두 다르다 */
export const EX_MONSTERS: Record<ExMonsterId, ExDef> = {
  // 비서실 전화: 수화기를 던진다 (줄에 매달려 부메랑처럼 돌아온다)
  ex_phone: mon({ id: "ex_phone", name: "비서실 전화", desc: "\"대표실입니다.\" 따르릉 울리다 수화기를 휙 던진다. 수화기는 줄에 매달려 부메랑처럼 되돌아온다.", hp: 120, atk: 13, def: 2, speed: 30, exp: 18, behavior: "ranged", size: 14, color: 0x2a2a2e, accent: 0xd8b040, patterns: ["bite"] }),
  // 금장 만년필: 바닥에 서명을 휘갈긴 뒤 그 선을 따라 베어 낸다
  ex_pen: mon({ id: "ex_pen", name: "금장 만년필", desc: "멈춰 서서 바닥에 금빛 서명을 휘갈기는 만년필. 잉크 선이 다 그어지고 잠시 뒤 그 선이 번쩍 베어 낸다.", hp: 110, atk: 15, def: 2, speed: 40, exp: 18, behavior: "chase", size: 13, color: 0x1a1a2a, accent: 0xe8c050, patterns: ["bite"] }),
  // 골프 퍼터: 벽에 튕기는 골프공
  ex_putter: mon({ id: "ex_putter", name: "골프 퍼터", desc: "벽에 튕기는 골프공을 딱 쳐 보내는 퍼터. 공은 벽에 서너 번 튕기며 방을 돌아다닌다.", hp: 130, atk: 14, def: 3, speed: 26, exp: 20, behavior: "ranged", size: 16, color: 0xc8ccd4, accent: 0x2a6a3a, patterns: ["bite"] }),
  // 와인 잔: 다가와 부딪쳐 깨진다 (유리 조각)
  ex_wine: mon({ id: "ex_wine", name: "와인 잔", desc: "다가와 건배하듯 부딪쳐 깨지는 크리스털 잔. 깨지는 자리 둘레가 다 아프니 가까이 오면 물러설 것.", hp: 90, atk: 18, def: 1, speed: 36, exp: 16, behavior: "explode", size: 13, color: 0xe8f0f4, accent: 0x8a1a3a }),
  // 고급 의자: 노려보다 돌진, 멈추는 자리에서 한 바퀴
  ex_chair: mon({ id: "ex_chair", name: "고급 의자", desc: "한참 노려보다 쭉 돌진하는 가죽 임원 의자. 멈추는 자리에서 한 바퀴 휙 돌며 둘레를 친다.", hp: 170, atk: 17, def: 5, speed: 22, exp: 22, behavior: "chase", size: 18, color: 0x5a2a1a, accent: 0xd8b060, patterns: ["bite"] }),
  // 액자 속 초상화: 눈빛을 쏘아 천천히 훑는다, 사라졌다 다른 자리에
  ex_portrait: mon({ id: "ex_portrait", name: "액자 속 초상화", desc: "눈빛을 쏘아 방을 훑는 역대 회장님 초상화. 눈이 빨갛게 빛나면 곧 쏜다. 가끔 사라졌다가 벽 다른 자리에 걸린다.", hp: 140, atk: 15, def: 4, speed: 10, exp: 22, behavior: "ranged", size: 17, color: 0x8a6a2a, accent: 0xc83a3a, patterns: ["bite"] }),
  // 인감 도장: 뛰어올라 쾅 — 붉은 도장 자국
  ex_seal: mon({ id: "ex_seal", name: "인감 도장", desc: "높이 뛰어올라 내 자리에 쾅 찍는 붉은 인감. 찍힌 자리에 도장 자국이 잠깐 남아서 밟으면 따갑다.", hp: 160, atk: 16, def: 5, speed: 28, exp: 22, behavior: "chase", size: 15, color: 0xa83c3c, accent: 0xe8d0a0, patterns: ["bite"] }),
  // 명함 뭉치: 명함 수류탄을 던지고, 쓰러지면 명함 셋
  ex_cards: mon({ id: "ex_cards", name: "명함 뭉치", desc: "명함 수류탄을 던지는 명함 뭉치. 쓰러지면 명함 세 장으로 흩어진다.", hp: 120, atk: 12, def: 2, speed: 30, exp: 18, behavior: "split", size: 13, color: 0xf2f2f2, accent: 0x2a4a8a, split: { id: "ex_card", n: 3 }, patterns: ["bite"] }),
  ex_card: mon({ id: "ex_card", name: "명함", desc: "한 장짜리 명함. 휙휙 날아와 베고 지나간다.", hp: 26, atk: 8, def: 0, speed: 60, exp: 3, behavior: "chase", size: 9, color: 0xf8f4ea, accent: 0xc8a040, minion: true, patterns: ["bite"] }),
  // 분재: 자리를 잡고 세 갈래 가시 가지
  ex_bonsai: mon({ id: "ex_bonsai", name: "분재", desc: "자리를 잡으면 세 갈래로 가시 가지를 뻗는 분재. 한번 자리 잡으면 움직이지 않는다.", hp: 150, atk: 14, def: 5, speed: 12, exp: 20, behavior: "ranged", size: 15, color: 0x3a7a3a, accent: 0x8a5a2a, patterns: ["bite"] }),
  // 임원 차 키: 리모컨 → 줄이 그어진 자리로 차가 달려 지나간다
  ex_car_key: mon({ id: "ex_car_key", name: "임원 차 키", desc: "\"삑삑.\" 리모컨을 누르면 내 줄에 차선이 그어지고, 곧 임원 차가 전조등을 켜고 달려 지나간다.", hp: 80, atk: 12, def: 1, speed: 52, exp: 14, behavior: "wander", size: 11, color: 0x2a2a30, accent: 0xd04040, patterns: ["bite"] }),
  // 대표이사가 불러들이는 수행 임원 (졸개)
  ex_entourage: mon({ id: "ex_entourage", name: "수행 임원", desc: "대표님이 부르면 줄지어 들어오는 임원들. 고개를 끄덕이며 따라온다.", hp: 70, atk: 12, def: 2, speed: 40, exp: 6, behavior: "chase", size: 14, color: 0x2a3048, accent: 0xe8e0d0, minion: true, patterns: ["bite"] }),
  // 정예: 살아 있는 동안 순시가 더 자주, 서류가 내 쪽으로 몰린다
  ex_secretary: mon({ id: "ex_secretary", name: "비서실장", desc: "회장님 순시를 앞당기는 비서실장. 살아 있는 동안 순시가 두 배로 잦고, 결재 서류가 내 쪽으로 몰려 떨어진다.", hp: 250, atk: 16, def: 6, speed: 26, exp: 40, behavior: "chase", size: 20, color: 0x3a3a5a, accent: 0xf0d040, patterns: ["bite", "aimed_shot"] }),
  ex_ceo: mon({
    id: "ex_ceo",
    name: "대표이사",
    desc: "\"결론부터 말해 봐요.\" 결재 도장으로 바닥을 쾅쾅 찍고 임원들을 불러들여요. 마지막엔 「구조조정」 붉은 빛줄기로 방 전체를 훑어요. 빛줄기 사이 틈으로 피하세요.",
    hp: 2500,
    atk: 25,
    def: 10,
    speed: 20,
    exp: 360,
    behavior: "boss",
    size: 42,
    color: 0x1e2230,
    accent: 0xe8c050,
    patterns: ["bite", "fan_volley", "slam"],
    phases: [
      { below: 0.75, add: ["rain"], haste: 0.85, label: "\"다들 들어오세요.\"" },
      { below: 0.5, add: ["cross", "charge"], haste: 0.72, label: "결재 도장을 꺼낸다!" },
      { below: 0.25, add: ["nova"], haste: 0.6, label: "\"구조조정을 시작하죠.\"" },
    ],
  }),
};

/** 우두머리 단계 문턱 (게임 연출이 같은 값을 쓴다): 75% 임원 소집, 50% 도장 연타, 25% 구조조정 빛줄기 */
export const EX_BOSS_CALL = 0.75;
export const EX_BOSS_STAMP = 0.5;
export const EX_BOSS_FINAL = 0.25;

export const EX_POOL: readonly ExMonsterId[] = ["ex_phone", "ex_pen", "ex_putter", "ex_wine", "ex_chair", "ex_portrait", "ex_seal", "ex_cards", "ex_bonsai", "ex_car_key"];
/** 무리로 몰려나올 수 있는 것 (와인 잔이 가장 자주 — 한꺼번에 건배) */
export const EX_PACKABLE: readonly ExMonsterId[] = ["ex_wine", "ex_wine", "ex_pen"];
export const EX_ELITE: ExMonsterId = "ex_secretary";
export const EX_BOSS: ExMonsterId = "ex_ceo";

/** 다시 올 때마다 바뀌는 판 (마지막 것이 계속) */
export const EX_VISITS: readonly { name: string; desc: string }[] = [
  { name: "평일 오후", desc: "통유리창으로 오후 햇살이 금빛으로 든다." },
  { name: "야간 임원 회의", desc: "밖은 깜깜하고 샹들리에만 켜져요. 순시 스포트라이트가 더 자주 돌아요." },
  { name: "주주총회 전날", desc: "결재 서류가 두 배로 쏟아지고, 빛 속 몬스터가 더 세져요." },
  { name: "감사 시즌", desc: "스포트라이트가 두 개가 돼요. 서류도 빛도 쉴 틈이 없어요." },
];

export const EX_ZONE_DEF: ZoneDef = {
  id: EX_ZONE,
  difficulty: "hell",
  slug: EX_ZONE,
  name: "임원층",
  desc: "금빛 카펫과 샹들리에, 반짝이는 트로피 장식장. 통유리창 너머로 도시가 내려다보이는 꼭대기 층이다.",
  unlockLevel: 50,
  power: 1.2,
  gimmick: {
    name: "결재 서류 비와 회장님 순시",
    desc: "바닥 그림자가 점점 진해지면 그 자리로 결재 서류 더미가 떨어져요. 가끔 회장님 순시가 시작되면 스포트라이트가 방을 훑어요. 빛 안에 선 몬스터는 잘 보이려고 더 빠르고 세져요. 내가 빛에 들키면 서류가 내 쪽으로 몰려요.",
  },
  pool: [...EX_POOL],
  boss: EX_BOSS,
  elite: EX_ELITE,
  summon: { id: "ex_entourage", n: 3 },
  favor: ["w_stamp", "a_suit"],
  waves: 2,
  timeLimitSec: 90,
  floor: [0x5a3a1a, 0x4a3018],
  deco: 0xe8c050,
  visits: EX_VISITS,
};

/** 층 순서표 (towerSchedule TABLES가 가져간다) */
export const EX_SCHEDULE: Schedule = {
  first: [
    ["ex_pen", "ex_phone"],
    ["ex_pen", "ex_phone", "ex_wine"],
    ["ex_wine", "ex_seal", "ex_putter", "ex_pen"],
    ["ex_seal", "ex_chair", "ex_phone", "ex_putter"],
    ["ex_putter", "ex_wine", "ex_chair", "ex_pen"],
  ],
  second: [
    ["ex_phone", "ex_cards", "ex_wine"],
    ["ex_bonsai", "ex_seal", "ex_pen"],
    ["ex_portrait", "ex_chair", "ex_cards", "ex_putter"],
    ["ex_car_key", "ex_bonsai", "ex_wine", "ex_portrait"],
    ["ex_car_key", "ex_cards", "ex_seal", "ex_phone"],
  ],
  remix: [
    [
      ["ex_portrait", "ex_wine", "ex_cards", "ex_pen"],
      ["ex_chair", "ex_car_key", "ex_phone", "ex_bonsai"],
      ["ex_seal", "ex_putter", "ex_portrait", "ex_wine"],
      ["ex_cards", "ex_bonsai", "ex_chair", "ex_car_key"],
      ["ex_pen", "ex_seal", "ex_putter", "ex_phone"],
    ],
    [
      ["ex_car_key", "ex_seal", "ex_wine", "ex_putter"],
      ["ex_portrait", "ex_pen", "ex_bonsai", "ex_cards"],
      ["ex_phone", "ex_chair", "ex_car_key", "ex_seal"],
      ["ex_wine", "ex_cards", "ex_portrait", "ex_putter"],
      ["ex_bonsai", "ex_phone", "ex_pen", "ex_chair"],
    ],
  ],
};

// ── 방 (배치 번호 = game/tower/themes/execMap EX_ROOM_NAMES) ──

/** 보통 층 방 종류 수 (0..6), 7 = 우두머리 층 대표이사실 */
export const EX_ROOMS = 7;
export const EX_BOSS_ROOM = 7;
export const EX_ROOM_SALT = 0x45584543;

// ── 기믹 숫자 (다시 올 때마다 세진다) ──

export type ExRules = {
  /** 결재 서류 비: 간격 ms · 한 번에 떨어지는 더미 수 · 그림자 → 떨어지기 ms · 더미 반지름 */
  rainEvery: number;
  rainN: number;
  rainWarn: number;
  rainR: number;
  /** 회장님 순시: 처음 · 간격 · 지속 ms, 스포트라이트 수, 빛 안 몬스터 배율 (이동·공격) */
  tourFirst: number;
  tourEvery: number;
  tourMs: number;
  spots: number;
  buff: number;
  /** 밤 (샹들리에만) */
  night: boolean;
};

export function exRules(visit: number): ExRules {
  const v = Math.max(0, Math.min(EX_VISITS.length - 1, Math.floor(visit)));
  return {
    rainEvery: [6_500, 6_000, 4_200, 4_000][v],
    rainN: [3, 3, 5, 5][v],
    rainWarn: 1400,
    rainR: 16,
    tourFirst: 9_000,
    tourEvery: [22_000, 15_000, 15_000, 13_000][v],
    tourMs: [8_000, 9_000, 9_000, 10_000][v],
    spots: v >= 3 ? 2 : 1,
    buff: [1.3, 1.3, 1.45, 1.45][v],
    night: v === 1 || v === 3,
  };
}

/** 비서실장이 살아 있으면 순시 간격 배율 */
export const EX_SECRETARY_TOUR = 0.5;
/** 한 층에 나오는 차 키·명함 뭉치 상한 (층 계획 — 차가 너무 많이 달리지 않게, 명함 조각이 처치 속도 상한 안에 들게) */
export const EX_KEY_CAP = 3;
export const EX_CARDS_CAP = 4;
