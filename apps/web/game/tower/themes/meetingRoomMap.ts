import { seeded } from "@/lib/rpg/formulas";
import { MT_ROOM_MIN, type MtRoom } from "@/lib/rpg/towerThemes/meetingRoom";

// 11/15 끝없는 회의실 배치 (순수 함수 — Phaser·캔버스 없이 테스트한다).
// 층마다 방 종류가 다르다: 한 테마 블록(5층)의 보통 층 넷은 서로 다른 방, 우두머리 층은 주재자의 대회의실.
// arena/layout이 충돌(solids)·출현 지점·시작 자리를 가져가고, MeetingRoom이 같은 배치로 가구·벽·창을 그린다.

const AW = 448;
const AH = 288;
const SIDE = 10;
/** 유리벽(뒷벽) 아래 끝 — 여기서부터 걸을 수 있다 */
export const MT_TOP = 54;

export const MT_ROOM_TYPES = ["huddle", "board", "open", "training", "exec", "cafe", "booths", "boss"] as const;
export type MtRoomType = (typeof MT_ROOM_TYPES)[number];
export const MT_ROOM_NAMES: Record<MtRoomType, string> = {
  huddle: "작은 회의실",
  board: "대회의실",
  open: "오픈 오피스",
  training: "교육장",
  exec: "임원 회의실",
  cafe: "카페테리아 회의",
  booths: "폰부스 복도",
  boss: "주재자의 대회의실",
};

/** 뒷벽: 유리(끝없이 비치는 회의실) · 창(바깥 도시) · 스크린(교육장) · 메뉴판 벽 · 부스 문 · 대형 화면 */
export type MtWall = "mirror" | "window" | "screen" | "menu" | "booth" | "boss";

export type MtFurnKind =
  | "long_table"
  | "round_table"
  | "chair"
  | "desk_pod"
  | "bench_row"
  | "lectern"
  | "sofa"
  | "plant"
  | "cafe_table"
  | "counter"
  | "vending"
  | "booth"
  | "pillar"
  | "credenza"
  | "podium"
  | "board_stand"
  | "cooler";
/** 가구 하나: 네모는 (x,y)가 바닥 자리 아래 가운데(깊이 기준, 자리는 x±w/2 · y−h..y), circle이면 (x,y)가 가운데·반지름 w/2. solid면 그 자리를 막는다 */
export type MtFurn = { kind: MtFurnKind; x: number; y: number; w: number; h: number; solid: boolean; circle?: boolean; v?: number; flip?: boolean };

export type MtRoomPlan = {
  type: MtRoomType;
  wall: MtWall;
  furn: MtFurn[];
  spawns: [number, number][];
  start: { x: number; y: number };
  /** 처음 방 크기 (작은 회의실은 유리 칸막이 안쪽만) */
  room0: MtRoom;
  /** 바닥 색 두 개 (카펫 결) */
  carpet: [number, number];
};

/** 걸을 수 있는 전체 방 */
export const MT_FULL: MtRoom = { x0: SIDE, y0: MT_TOP, x1: AW - SIDE, y1: AH - SIDE };

const CARPETS: [number, number][] = [
  [0x3a3448, 0x342e42],
  [0x2e3a48, 0x2a3442],
  [0x3a4038, 0x343a32],
  [0x483a34, 0x42342e],
  [0x2c3040, 0x282c3a],
  [0x403a50, 0x3a344a],
  [0x3a3a3e, 0x343438],
  [0x2e4240, 0x2a3c3a],
];


/** 11/15 층별 방 순서 (블록마다 보통 층 넷, 겹치지 않는다): 6층 작은 회의실 → 오픈 오피스 → 대회의실(회의록 담당) → 교육장, 그 뒤 바퀴마다 다른 순서 */
export const MT_ROOM_ORDER: readonly (readonly MtRoomType[])[] = [
  ["huddle", "open", "board", "training"],
  ["cafe", "booths", "exec", "open"],
  ["training", "huddle", "cafe", "booths"],
  ["exec", "board", "booths", "huddle"],
];

/**
 * f층 방 종류: 우두머리 층(5의 배수)은 주재자의 대회의실, 보통 층은 층 순서표대로 (같은 층은 늘 같은 방 — 외워서 오른다).
 * runSeed는 예전 호출과 맞추려고 받기만 한다
 */
export function mtRoomType(_runSeed: number, f: number): MtRoomType {
  const fl = Math.max(1, Math.floor(f));
  if (fl % 5 === 0) return "boss";
  const block = Math.floor((fl - 1) / 10);
  return MT_ROOM_ORDER[block % MT_ROOM_ORDER.length][(fl - 1) % 5];
}

const box = (kind: MtFurnKind, x: number, y: number, w: number, h: number, solid = true, v?: number): MtFurn => ({ kind, x, y, w, h, solid, ...(v !== undefined ? { v } : {}) });
const disc = (kind: MtFurnKind, x: number, y: number, r: number, v?: number): MtFurn => ({ kind, x, y, w: r * 2, h: r * 2, solid: true, circle: true, ...(v !== undefined ? { v } : {}) });
const chair = (x: number, y: number, v: number, back = false): MtFurn => ({ kind: "chair", x, y, w: 10, h: 6, solid: false, v, flip: back });

const EDGE: [number, number][] = [
  [30, 72],
  [AW - 30, 72],
  [30, AH - 22],
  [AW - 30, AH - 22],
  [AW / 2, AH - 18],
  [120, 66],
  [AW - 120, 66],
  [26, 170],
  [AW - 26, 170],
];

/** 방 종류 + 층 시드 → 배치 (같은 값이면 같은 배치) */
export function mtRoomPlan(type: MtRoomType, floorSeed: number): MtRoomPlan {
  const r = seeded((floorSeed ^ 0x46555252) >>> 0);
  const cv = Math.floor(r() * 3);
  const carpet = CARPETS[Math.floor(r() * CARPETS.length)];
  const furn: MtFurn[] = [];
  let wall: MtWall = "mirror";
  let start = { x: AW / 2, y: 236 };
  let room0: MtRoom = { ...MT_FULL };
  const jitter = (n: number) => Math.round((r() - 0.5) * n);
  switch (type) {
    case "huddle": {
      // 유리 칸막이 안 작은 방: 둥근 테이블 하나, 의자 다섯, 바퀴 달린 화이트보드
      room0 = { x0: 92, y0: MT_TOP, x1: AW - 92, y1: AH - SIDE };
      const cx = AW / 2 + jitter(16);
      furn.push(disc("round_table", cx, 166, 20));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.6;
        furn.push(chair(cx + Math.cos(a) * 30, 170 + Math.sin(a) * 26, cv, Math.sin(a) < 0));
      }
      furn.push(box("board_stand", room0.x1 - 15, 96, 30, 6));
      furn.push(box("plant", room0.x0 + 6, AH - SIDE, 12, 10));
      start = { x: cx, y: 240 };
      break;
    }
    case "board": {
      // 긴 회의 테이블 + 양쪽 의자 여섯씩, 뒤에 수납장
      const w = 150 + jitter(12);
      furn.push(box("long_table", AW / 2, 178, w, 26));
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = AW / 2 - w / 2 + ((i + 0.5) * w) / n;
        furn.push(chair(x, 150, cv, true));
        furn.push(chair(x, 194, cv));
      }
      furn.push(box("credenza", AW / 2, MT_TOP + 12, 64, 12));
      furn.push(box("plant", SIDE + 6, MT_TOP + 10, 12, 10), box("plant", AW - SIDE - 6, MT_TOP + 10, 12, 10));
      start = { x: AW / 2, y: 238 };
      break;
    }
    case "open": {
      // 칸막이 책상 섬 넷 + 정수기
      wall = "window";
      const dx = 96 + jitter(10);
      for (const [x, y] of [
        [AW / 2 - dx, 126],
        [AW / 2 + dx, 126],
        [AW / 2 - dx, 224],
        [AW / 2 + dx, 224],
      ] as const) {
        furn.push(box("desk_pod", x, y, 62, 28, true, Math.floor(r() * 3)));
        furn.push(chair(x - 16, y + 8, cv), chair(x + 16, y + 8, cv));
      }
      furn.push(box("cooler", AW / 2, MT_TOP + 8, 12, 8));
      start = { x: AW / 2, y: 176 };
      break;
    }
    case "training": {
      // 교육장: 앞 강의대, 가운데 통로를 둔 의자 줄 셋, 뒷벽은 스크린
      wall = "screen";
      furn.push(box("lectern", AW / 2 + jitter(30), 94, 22, 10));
      for (const y of [136, 178, 220]) {
        furn.push(box("bench_row", 162, y, 100, 8, true, cv));
        furn.push(box("bench_row", AW - 162, y, 100, 8, true, cv));
      }
      start = { x: AW / 2, y: 250 };
      break;
    }
    case "exec": {
      // 임원 회의실: 통유리 너머 도시, 큰 원탁 + 가죽 의자, 소파, 화분
      wall = "window";
      const cx = AW / 2 + jitter(20);
      furn.push(disc("round_table", cx, 172, 28, 1));
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.2;
        furn.push(chair(cx + Math.cos(a) * 40, 176 + Math.sin(a) * 36, 2, Math.sin(a) < 0));
      }
      furn.push(box("sofa", 84, 250, 52, 16), box("plant", SIDE + 6, MT_TOP + 10, 12, 10), box("plant", AW - SIDE - 6, MT_TOP + 10, 12, 10), box("plant", AW - SIDE - 6, AH - SIDE, 12, 10));
      start = { x: cx, y: 248 };
      break;
    }
    case "cafe": {
      // 카페테리아: 계산대·자판기, 작은 원탁 다섯
      wall = "menu";
      furn.push(box("counter", 100, MT_TOP + 14, 140, 14), box("vending", AW - 66, MT_TOP + 14, 22, 14, true, 0), box("vending", AW - 42, MT_TOP + 14, 22, 14, true, 1));
      const spots: [number, number][] = [
        [150, 140],
        [298, 140],
        [224, 196],
        [118, 236],
        [330, 236],
      ];
      for (const [x, y] of spots) {
        furn.push(disc("cafe_table", x + jitter(10), y, 10, Math.floor(r() * 3)));
        furn.push(chair(x - 15, y + 4, cv), chair(x + 15, y + 4, cv));
      }
      start = { x: AW / 2, y: 260 };
      break;
    }
    case "booths": {
      // 폰부스 복도: 위·아래에 전화 부스가 늘어선 긴 복도
      wall = "booth";
      for (const x of [60, 134, AW - 134, AW - 60]) furn.push(box("booth", x, MT_TOP + 40, 46, 40, true, Math.floor(r() * 4)));
      for (const x of [96, AW / 2, AW - 96]) furn.push(box("booth", x, AH - SIDE, 46, 40, true, Math.floor(r() * 4)));
      furn.push(box("plant", AW / 2, MT_TOP + 10, 12, 10));
      start = { x: AW / 2, y: 168 };
      break;
    }
    case "boss": {
      // 주재자의 대회의실: 대형 화면 아래 연단, 기둥 넷, 붉은 카펫
      wall = "boss";
      furn.push(box("podium", AW / 2, MT_TOP + 14, 50, 14));
      for (const [x, y] of [
        [96, 120],
        [AW - 96, 120],
        [96, 228],
        [AW - 96, 228],
      ] as const)
        furn.push(disc("pillar", x, y, 7));
      start = { x: AW / 2, y: 250 };
      break;
    }
  }
  return { type, wall, furn, spawns: openSpawns(furn, room0), start, room0, carpet };
}

/** 몸 반지름 r이 설 수 있나 (방 안 + 가구 밖) */
function freeAt(furn: readonly MtFurn[], room: MtRoom, x: number, y: number, r: number): boolean {
  if (x < room.x0 + r || x > room.x1 - r || y < room.y0 + r + 4 || y > room.y1 - 2) return false;
  for (const f of furn) {
    const s = mtFurnSolid(f);
    if (!s) continue;
    if (s.t === "c" ? Math.hypot(x - s.x, y - s.y) < s.r + r : Math.hypot(x - Math.max(s.x, Math.min(x, s.x + s.w)), y - Math.max(s.y, Math.min(y, s.y + s.h))) < r) return false;
  }
  return true;
}

/** 출현 지점: 가장자리 후보 중 설 수 있는 곳 (몸 반지름 12), 모자라면 방 안 둘레를 돌며 채운다 */
function openSpawns(furn: readonly MtFurn[], room: MtRoom): [number, number][] {
  const out = EDGE.filter(([x, y]) => freeAt(furn, room, x, y, 12));
  for (let k = 0; out.length < 7 && k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const x = Math.round((room.x0 + room.x1) / 2 + Math.cos(a) * ((room.x1 - room.x0) / 2 - 20));
    const y = Math.round((room.y0 + room.y1) / 2 + Math.sin(a) * ((room.y1 - room.y0) / 2 - 18));
    if (freeAt(furn, room, x, y, 12) && out.every(([px, py]) => Math.hypot(px - x, py - y) > 40)) out.push([x, y]);
  }
  return out;
}

/** 방이 가장 좁아졌을 때도 걸어 다닐 수 있게 — 가운데 최소 방 (테스트용) */
export const MT_MIN_ROOM: MtRoom = {
  x0: AW / 2 - MT_ROOM_MIN.w / 2,
  x1: AW / 2 + MT_ROOM_MIN.w / 2,
  y0: (MT_TOP + AH - SIDE) / 2 - MT_ROOM_MIN.h / 2,
  y1: (MT_TOP + AH - SIDE) / 2 + MT_ROOM_MIN.h / 2,
};

/** 가구의 충돌 모양 (arena/layout Solid와 같은 꼴) */
export function mtFurnSolid(f: MtFurn): { t: "r"; x: number; y: number; w: number; h: number } | { t: "c"; x: number; y: number; r: number } | null {
  if (!f.solid) return null;
  return f.circle ? { t: "c", x: f.x, y: f.y, r: f.w / 2 } : { t: "r", x: f.x - f.w / 2, y: f.y - f.h, w: f.w, h: f.h };
}

/** arena/layout Builder가 받는 꼴 (layout을 import하면 순환이라 구조로) */
type LayoutSink = {
  solids: ({ t: "r"; x: number; y: number; w: number; h: number } | { t: "c"; x: number; y: number; r: number })[];
  lights: { x: number; y: number; r: number; color: number; flicker?: boolean }[];
  spawns: { x: number; y: number }[];
  start: { x: number; y: number };
};

/** arena/layout MAKE가 부른다: 뒷벽·가구 충돌·칸막이·형광등·출현 지점 */
export function meetingRoomLayout(b: LayoutSink, v: number, seed: number): void {
  const plan = mtRoomPlan(MT_ROOM_TYPES[v % MT_ROOM_TYPES.length], seed);
  b.solids.push({ t: "r", x: 0, y: 24, w: AW, h: MT_TOP - 24 });
  for (const f of plan.furn) {
    const s = mtFurnSolid(f);
    if (s) b.solids.push(s);
  }
  // 작은 회의실: 유리 칸막이 바깥은 옆 회의실 (못 간다)
  const r0 = plan.room0;
  if (r0.x0 > MT_FULL.x0) b.solids.push({ t: "r", x: 0, y: MT_TOP, w: r0.x0, h: AH - MT_TOP });
  if (r0.x1 < MT_FULL.x1) b.solids.push({ t: "r", x: r0.x1, y: MT_TOP, w: AW - r0.x1, h: AH - MT_TOP });
  const warm = plan.type === "cafe" || plan.type === "exec" ? 0xffe8c0 : 0xe8f4ff;
  for (const y of [100, 206]) for (const x of [AW / 2 - 130, AW / 2, AW / 2 + 130]) if (x > r0.x0 && x < r0.x1) b.lights.push({ x, y, r: 44, color: warm, ...(seed % 7 === 0 && x === AW / 2 && y === 206 ? { flicker: true } : {}) });
  for (const [x, y] of plan.spawns) b.spawns.push({ x, y });
  b.start = plan.start;
}
