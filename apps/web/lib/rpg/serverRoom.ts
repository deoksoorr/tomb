import type { MonsterDef, ZoneDef } from "./catalog";

// 11/15 야근 빌딩 테마 「지하 서버실」 (1~5층, 그 뒤 10층마다 11~15·21~25 …): 몬스터 표·사냥터 정의·바퀴마다 달라지는 판.
// 순수 데이터 — 서버(층 계획·출현 상한)와 게임(game/tower/themes/serverRoom*)·안내서가 같이 쓴다. catalog.ts가 MONSTERS·HUNT_ZONES에 끼워 넣는다.
// 몬스터 id는 모두 sv_ 로 시작한다 (같은 표에 끼는 다른 테마와 겹치지 않게).

export const SV_MONSTER_IDS = [
  "sv_tangled_lan",
  "sv_hot_fan",
  "sv_bluescreen",
  "sv_reboot",
  "sv_ransom_lock",
  "sv_wifi_router",
  "sv_printer_jam",
  "sv_excel_macro",
  "sv_security_cam",
  "sv_coolant_leak",
  "sv_backup_tape",
  "sv_legacy_system",
] as const;
export type SvMonsterId = (typeof SV_MONSTER_IDS)[number];

type SvDef = Omit<MonsterDef, "id"> & { id: SvMonsterId };

/** 숫자는 쉬움 기준 (야근 빌딩은 지옥 배율 × TOWER_POWER × 층 배율). 모양·크기·걸음이 모두 다르다 */
export const SV_MONSTERS: Record<SvMonsterId, SvDef> = {
  sv_tangled_lan: {
    id: "sv_tangled_lan",
    name: "엉킨 랜선",
    desc: "아무도 정리 안 한 랜선 뭉치. 뱀처럼 구불구불 기어 와 몸에 감기면 제 쪽으로 끌어당긴다.",
    hp: 120,
    atk: 13,
    def: 2,
    speed: 40,
    exp: 20,
    behavior: "chase",
    size: 14,
    color: 0x3a7ad8,
    accent: 0xf0d050,
    patterns: ["bite"],
  },
  sv_hot_fan: {
    id: "sv_hot_fan",
    name: "과열 팬",
    desc: "윙윙 돌다 멈춰 서서 뜨거운 바람을 부채꼴로 내뿜는다. 날개가 빨갛게 달아오르면 옆으로 비킬 것.",
    hp: 150,
    atk: 15,
    def: 4,
    speed: 14,
    exp: 24,
    behavior: "ranged",
    size: 18,
    color: 0x4a505c,
    accent: 0xff7a2a,
    patterns: ["breath"],
  },
  sv_bluescreen: {
    id: "sv_bluescreen",
    name: "블루스크린",
    desc: "\":( 문제가 발생하여…\" 깜빡 꺼졌다 켜지며 나타난다. 맞으면 1초 동안 방향키가 뒤집힌다.",
    hp: 110,
    atk: 14,
    def: 1,
    speed: 36,
    exp: 22,
    behavior: "blink",
    size: 15,
    color: 0x1a5ad8,
    accent: 0xf2f2ee,
    patterns: ["bite", "ambush"],
  },
  sv_reboot: {
    id: "sv_reboot",
    name: "무한 재부팅",
    desc: "쓰러뜨려도 3초 뒤 다시 켜진다. 재부팅 중에 한 대 더 치거나 그 위에 올라서면 완전히 꺼진다.",
    hp: 140,
    atk: 14,
    def: 3,
    speed: 30,
    exp: 24,
    behavior: "chase",
    size: 16,
    color: 0x2a2e38,
    accent: 0x3aff6a,
    patterns: ["bite", "slam"],
  },
  sv_ransom_lock: {
    id: "sv_ransom_lock",
    name: "랜섬 자물쇠",
    desc: "주변 몬스터를 사슬로 잠가 지킨다. 사슬에 묶인 몬스터는 거의 다치지 않는다 — 자물쇠부터 깨자.",
    hp: 170,
    atk: 10,
    def: 6,
    speed: 22,
    exp: 28,
    behavior: "ranged",
    size: 15,
    color: 0xd8a830,
    accent: 0xd03030,
    patterns: ["aimed_shot"],
  },
  sv_wifi_router: {
    id: "sv_wifi_router",
    name: "무선 공유기",
    desc: "안테나에서 퍼지는 와이파이 고리를 쏜다. 고리에는 끊긴 틈이 있다 — 틈으로 빠져나갈 것.",
    hp: 120,
    atk: 13,
    def: 2,
    speed: 20,
    exp: 24,
    behavior: "ranged",
    size: 14,
    color: 0xeceae4,
    accent: 0x3ad0ff,
    patterns: ["bite"],
  },
  sv_printer_jam: {
    id: "sv_printer_jam",
    name: "프린터 걸림",
    desc: "\"용지 걸림\" 불이 깜빡이면 제자리에 멈춰 서류를 연달아 세 번 뿜는다.",
    hp: 180,
    atk: 14,
    def: 5,
    speed: 12,
    exp: 26,
    behavior: "ranged",
    size: 18,
    color: 0xe4e0d6,
    accent: 0xff9a2a,
    patterns: ["bite"],
  },
  sv_excel_macro: {
    id: "sv_excel_macro",
    name: "엑셀 매크로",
    desc: "작고 빠른 초록 칸. 빨리 못 잡으면 몇 초마다 자기를 복사해 늘어난다 (한 마리가 두 번까지).",
    hp: 70,
    atk: 11,
    def: 0,
    speed: 50,
    exp: 12,
    behavior: "chase",
    size: 11,
    color: 0x1f8a4c,
    accent: 0xf2f2ee,
    clones: 2,
    patterns: ["bite"],
  },
  sv_security_cam: {
    id: "sv_security_cam",
    name: "보안 카메라",
    desc: "고개를 좌우로 돌리며 바닥을 비춘다. 빛에 들키면 경보가 울려 주변 몬스터가 잠깐 날뛴다.",
    hp: 130,
    atk: 12,
    def: 3,
    speed: 8,
    exp: 24,
    behavior: "ranged",
    size: 14,
    color: 0xd8dce4,
    accent: 0xff3a3a,
    patterns: ["aimed_shot"],
  },
  sv_coolant_leak: {
    id: "sv_coolant_leak",
    name: "냉각수 누수",
    desc: "새는 냉각 호스. 지나간 자리에 미끄러운 웅덩이를 남긴다 — 웅덩이 위에선 멈추기 어렵다.",
    hp: 140,
    atk: 12,
    def: 2,
    speed: 32,
    exp: 22,
    behavior: "wander",
    size: 15,
    color: 0x3ac8e8,
    accent: 0xe8f8ff,
    patterns: ["bite"],
  },
  sv_backup_tape: {
    id: "sv_backup_tape",
    name: "백업 테이프",
    desc: "정예. 10년 전 백업이 아직 돈다. 쓰러지면 테이프가 감기며 최근에 쓰러진 몬스터를 셋까지 복원한다.",
    hp: 260,
    atk: 16,
    def: 6,
    speed: 24,
    exp: 40,
    behavior: "dash",
    size: 20,
    color: 0x2a2a32,
    accent: 0xe8e0c8,
    revive: 3,
    patterns: ["bite", "charge"],
  },
  sv_legacy_system: {
    id: "sv_legacy_system",
    name: "레거시 시스템",
    desc: "아무도 끌 줄 모르는 20년 된 본체. 코드 조각을 흩뿌리고, 화나면 바닥 회로에 전기를 흘리고, 마지막엔 서버실 전체를 재부팅한다 — 안전 구역을 찾아라.",
    hp: 2300,
    atk: 24,
    def: 9,
    speed: 18,
    exp: 340,
    behavior: "boss",
    size: 42,
    color: 0xb8ae96,
    accent: 0x3aff6a,
    patterns: ["bite", "fan_volley", "slam"],
    phases: [
      { below: 0.66, add: ["cross"], haste: 0.8, label: "바닥 회로에 전류를 흘린다!" },
      { below: 0.3, add: ["nova"], haste: 0.65, label: "전체 재부팅을 시작한다!" },
    ],
  },
};

/** 우두머리 단계 문턱 (게임 연출이 같은 값을 쓴다): 66% 회로 전류, 30% 전체 재부팅 */
export const SV_BOSS_CIRCUIT = 0.66;
export const SV_BOSS_REBOOT = 0.3;

/** 일반 웨이브에 나오는 열 종 (층마다 이 중 넷을 골라 섞는다 — lib/rpg/tower towerPlan) */
export const SV_POOL: SvMonsterId[] = [
  "sv_tangled_lan",
  "sv_hot_fan",
  "sv_bluescreen",
  "sv_reboot",
  "sv_ransom_lock",
  "sv_wifi_router",
  "sv_printer_jam",
  "sv_excel_macro",
  "sv_security_cam",
  "sv_coolant_leak",
];

/** 지하 서버실 (야근 빌딩 전용 — 사냥터 고르기에는 나오지 않는다) */
export const SV_ZONE: ZoneDef = {
  id: "server-room",
  slug: "server-room",
  difficulty: "hell",
  name: "지하 서버실",
  desc: "끝없이 늘어선 랙과 파란 네온. 냉각기가 숨을 몰아쉬고, 오래 서 있으면 바닥이 달아오른다.",
  unlockLevel: 50,
  power: 1.2,
  gimmick: {
    name: "과열",
    desc: "한 칸에 가만히 서 있으면 바닥이 주황으로 달아오르다 2.5초 뒤 불길이 솟아 그 위에 있으면 계속 다친다. 「냉각 실패」 경보(붉은 화면 테두리)가 울리면 두 배로 빨리 달아오른다 — 계속 움직일 것.",
  },
  pool: SV_POOL,
  boss: "sv_legacy_system",
  elite: "sv_backup_tape",
  summon: { id: "sv_excel_macro", n: 3 },
  favor: ["a_server_rack", "w_compiler"],
  waves: 2,
  timeLimitSec: 90,
  floor: [0x0c1220, 0x0a0f1c],
  deco: 0x3ab0ff,
};

// ── 바퀴마다 달라지는 판 (10층마다 같은 테마가 돌아올 때 1~5 → 11~15 → 21~25 …) ──

export type SvLoop = {
  name: string;
  desc: string;
  /** 어둠 짙기 0..1 (조명 색은 게임이 정한다) */
  dark: number;
  /** 경광등이 늘 돈다 */
  alarm: boolean;
  /** 바닥이 불붙기까지 ms */
  heatMs: number;
  /** 몬스터 이동 속도 배율 */
  speed: number;
  /** 쓰러진 기계가 방전한다 (작은 전기 고리) */
  discharge: boolean;
};
export const SV_LOOPS: readonly SvLoop[] = [
  { name: "평상시", desc: "파란 네온 아래 랙들이 돌아간다.", dark: 0, alarm: false, heatMs: 2500, speed: 1, discharge: false },
  {
    name: "정전 · 비상 전원",
    desc: "주 전원이 나가 초록 비상등만 켜진다. 어둡고, 쓰러진 기계는 마지막 전기를 튀긴다 (방전 고리를 피할 것).",
    dark: 0.55,
    alarm: false,
    heatMs: 2300,
    speed: 1,
    discharge: true,
  },
  {
    name: "비상 경보",
    desc: "붉은 경광등이 돈다. 바닥이 더 빨리 달아오르고 몬스터가 15% 빠르다.",
    dark: 0.3,
    alarm: true,
    heatMs: 1900,
    speed: 1.15,
    discharge: false,
  },
  {
    name: "멜트다운",
    desc: "정전과 경보가 한꺼번에. 방전·빠른 과열·빠른 몬스터, 정예도 더 자주 섞인다.",
    dark: 0.6,
    alarm: true,
    heatMs: 1700,
    speed: 1.15,
    discharge: true,
  },
];
/** 바퀴 번호(0부터)의 판 */
export const svLoop = (loop: number): SvLoop => SV_LOOPS[Math.max(0, Math.min(SV_LOOPS.length - 1, Math.floor(loop)))];

// ── 층마다 다른 방 (배치 번호 = game/tower/themes/serverRoomMap SV_ROOM_NAMES) ──

/** 보통 층 방 종류 수 (0..7), 8 = 우두머리 층 메인프레임 홀 */
export const SV_ROOMS = 8;
export const SV_BOSS_ROOM = 8;

/**
 * f층(서버실 층)의 방 종류: 층 번호로만 정해진다 (같은 층은 늘 같은 방).
 * 한 블록(5층)의 보통 층 넷은 모두 다른 방이고, 두 블록(1~5·11~15)이 여덟 방을 나눠 쓴다 — 블록 쌍마다 순서를 섞는다
 */
export function svRoom(f: number): number {
  const n = Math.max(1, Math.floor(f));
  const k = (n - 1) % 5;
  if (k === 4) return SV_BOSS_ROOM;
  const block = Math.floor((n - 1) / 10);
  const perm = Array.from({ length: SV_ROOMS }, (_, i) => i);
  let s = (Math.floor(block / 2) * 0x9e3779b1 + 0x5652) >>> 0;
  for (let i = perm.length - 1; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm[k + (block % 2) * 4];
}

/** 층마다 조명 색 (파랑·초록·호박·빨강 비상) — 층 번호로 */
export const SV_ACCENTS = [0x3ab0ff, 0x3aff9a, 0xffb43a, 0xff4a4a] as const;
export const svAccent = (f: number) => SV_ACCENTS[(Math.imul(Math.max(1, Math.floor(f)), 0x9e3779b1) >>> 7) % SV_ACCENTS.length];
