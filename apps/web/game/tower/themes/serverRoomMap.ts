import { css, darken, hash2, lighten, type Color } from "../../sprites/pixel";

// 11/15 지하 서버실 지도: 방 종류 아홉 가지 배치(layout.ts MAKE가 부른다) + 바닥·벽·소품 그림(arena/art.ts가 부른다). Phaser 없음.
// 층마다 방이 다르다 — 어느 층이 어느 방인지는 lib/rpg/serverRoom svRoom(판 시드, 층) (한 블록의 보통 층 넷은 모두 다른 방, 우두머리 층은 메인프레임 홀).
// 움직이는 것(랙 LED·찬 바람 안개·케이블 트레이 데이터 빛·경광등·과열 바닥·층 번호)은 serverRoomStage.ts가 그린다.
// 순환 참조를 피하려고 layout.ts·art.ts를 가져오지 않는다 → 지도 크기는 여기 숫자를 같이 쓴다 (layout.ts AW·AH·TOP·SIDE와 같다).

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;
const TILE = 24;

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

function R(c: Ctx, x: number, y: number, w: number, h: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function E(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const t = (y + 0.5 - cy) / ry;
    if (t * t > 1) continue;
    const half = rx * Math.sqrt(1 - t * t);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

// ── 방 종류 ──

/** 방 종류 (layout 배치 번호와 같다). 8 = 우두머리 층 메인프레임 홀 */
export const SV_ROOM_NAMES = ["랙 통로", "엇갈린 랙", "세로 랙 열", "냉복도 유리 통로", "케이블 금고", "UPS·배터리실", "관제실", "테이프 보관실", "메인프레임 홀"] as const;
export const SV_ROOM_COUNT = SV_ROOM_NAMES.length;

// ── 배치 ──

/** layout.ts Builder 중 여기서 쓰는 것 */
type B = {
  start: Pt;
  prop(kind: string, x: number, y: number, extra?: { flip?: boolean; v?: number }): B;
  decal(kind: string, x: number, y: number, w: number, h: number, v?: number): B;
  light(x: number, y: number, r: number, color: number, flicker?: boolean): B;
  spawn(...pts: [number, number][]): B;
};

const Rs = (dx: number, dy: number, w: number, h: number) => ({ t: "r" as const, dx, dy, w, h });
const Cs = (dx: number, dy: number, r: number) => ({ t: "c" as const, dx, dy, r });

/** 소품 크기·충돌 (layout.ts PROP_META에 펼쳐 넣는다). 발밑 띠만 막는다 */
export const SV_PROP_META = {
  sv_rack: { w: 60, h: 48, solid: Rs(-29, -16, 58, 14) },
  sv_rack_v: { w: 22, h: 78, solid: Rs(-10, -40, 20, 38) },
  sv_crac: { w: 26, h: 40, solid: Rs(-12, -14, 24, 13) },
  sv_ups: { w: 18, h: 24, solid: Rs(-8, -10, 16, 9) },
  sv_battery: { w: 48, h: 30, solid: Rs(-23, -14, 46, 13) },
  sv_spool: { w: 22, h: 22, solid: Cs(0, -6, 9) },
  sv_patch: { w: 30, h: 44, solid: Rs(-14, -14, 28, 13) },
  sv_noc_desk: { w: 70, h: 30, solid: Rs(-34, -14, 68, 12) },
  sv_tape_shelf: { w: 84, h: 46, solid: Rs(-41, -16, 82, 14) },
  sv_mainframe: { w: 30, h: 54, solid: Rs(-14, -16, 28, 15) },
  sv_chair: { w: 12, h: 14 },
};

/** 우두머리 층 바닥 회로 줄 (2단계 전류): 가로 y, 세로 x */
export const SV_TRACES = { h: [66, 150, 246], v: [112, 224, 336] } as const;

/** LED가 붙는 소품: 종류 → 앞면 LED 자리 (소품 바닥 가운데 기준 상대 좌표) */
const LED_SPOTS: Record<string, Pt[]> = (() => {
  const rack: Pt[] = [];
  for (let k = 0; k < 3; k++) for (let u = 0; u < 7; u++) rack.push({ x: -30 + 2 + k * 19 + 12, y: -48 + 14 + u * 4 }, { x: -30 + 2 + k * 19 + 14, y: -48 + 14 + u * 4 });
  const rackV: Pt[] = [];
  for (let u = 0; u < 14; u++) rackV.push({ x: -11 + 16, y: -78 + 12 + u * 4 }, { x: -11 + 18, y: -78 + 12 + u * 4 });
  const patch: Pt[] = [];
  for (let u = 0; u < 6; u++) for (let i = 0; i < 4; i++) patch.push({ x: -15 + 5 + i * 5, y: -44 + 12 + u * 4 });
  const battery: Pt[] = [];
  for (let i = 0; i < 4; i++) battery.push({ x: -24 + 6 + i * 11, y: -30 + 12 });
  const tape: Pt[] = [];
  for (let i = 0; i < 6; i++) tape.push({ x: -42 + 8 + i * 14, y: -46 + 11 });
  const main: Pt[] = [];
  for (let u = 0; u < 5; u++) for (let i = 0; i < 3; i++) main.push({ x: -15 + 8 + i * 6, y: -54 + 26 + u * 4 });
  return { sv_rack: rack, sv_rack_v: rackV, sv_patch: patch, sv_battery: battery, sv_tape_shelf: tape, sv_mainframe: main, sv_ups: [{ x: -9 + 5, y: -24 + 8 }] };
})();

/** 소품의 LED 자리 (월드 좌표) */
export function propLeds(kind: string, x: number, y: number): Pt[] {
  return (LED_SPOTS[kind] ?? []).map((p) => ({ x: x + p.x, y: y + p.y }));
}

const EDGE: [number, number][] = [
  [36, 62],
  [AW - 36, 62],
  [36, AH - 30],
  [AW - 36, AH - 30],
  [AW / 2, AH - 24],
];

/** 방 종류 v의 배치 */
export function serverRoomLayout(b: B, v: number): void {
  const rackRow = (pts: [number, number][]) => {
    for (const [x, y] of pts) {
      b.prop("sv_rack", x, y, { v: Math.round(x * 3 + y) });
      b.decal("sv_neon", x - 28, y + 1, 56, 2);
      b.light(x, y + 2, 26, 0x8ab8ff);
    }
  };
  const vents = (pts: [number, number][]) => pts.forEach(([x, y], i) => b.decal("sv_vent", x, y, TILE, TILE, i));
  const sideNeon = () => {
    b.decal("sv_neon", SIDE + 2, TOP + 6, 2, AH - TOP - SIDE - 12);
    b.decal("sv_neon", AW - SIDE - 4, TOP + 6, 2, AH - TOP - SIDE - 12);
  };
  switch (v) {
    // 랙 통로: 가로 두 줄, 가운데 찬 통로
    case 0: {
      vents([
        [48, 144],
        [120, 144],
        [192, 120],
        [240, 144],
        [312, 144],
        [384, 120],
        [96, 264],
        [336, 264],
      ]);
      rackRow([
        [64, 100],
        [160, 100],
        [288, 100],
        [384, 100],
        [64, 226],
        [160, 226],
        [288, 226],
        [384, 226],
      ]);
      b.prop("sv_crac", 26, 168).prop("sv_crac", AW - 26, 168);
      b.prop("sv_ups", 112, 58).prop("sv_ups", 312, AH - 14);
      b.start = { x: AW / 2, y: 160 };
      b.spawn(...EDGE, [64, 150], [AW - 64, 150], [224, 44]);
      break;
    }
    // 엇갈린 랙: 세 줄이 엇갈린다
    case 1: {
      vents([
        [96, 120],
        [168, 120],
        [264, 120],
        [336, 120],
        [144, 192],
        [216, 216],
        [288, 192],
        [48, 240],
      ]);
      rackRow([
        [112, 90],
        [224, 90],
        [336, 90],
        [72, 172],
        [376, 172],
        [168, 254],
        [280, 254],
      ]);
      b.prop("sv_crac", 26, 120).prop("sv_crac", AW - 26, 236);
      b.prop("sv_ups", 224, 172).prop("sv_ups", 96, AH - 14);
      b.start = { x: AW / 2, y: 140 };
      b.spawn(...EDGE, [26, 200], [AW - 26, 120], [224, 44]);
      break;
    }
    // 세로 랙 열: 세로로 선 랙 기둥 넷 × 두 마디, 가운데 가로 통로
    case 2: {
      for (const x of [96, 176, 272, 352])
        for (const y of [112, 238]) {
          b.prop("sv_rack_v", x, y, { v: x + y });
          b.decal("sv_neon", x - 12, y - 40, 2, 38);
          b.light(x, y - 18, 22, 0x8ab8ff);
        }
      vents([
        [120, 144],
        [216, 144],
        [312, 144],
        [24, 72],
        [400, 216],
      ]);
      b.decal("sv_tray_floor", SIDE, 150, AW - SIDE * 2, 6);
      b.prop("sv_crac", 26, 230).prop("sv_crac", AW - 26, 100);
      b.start = { x: AW / 2, y: 156 };
      b.spawn(...EDGE, [136, 44], [312, 44], [224, AH - 24]);
      break;
    }
    // 냉복도 유리 통로: 맞붙은 랙 두 줄 사이 유리로 막은 찬 통로 (양 끝 유리문으로 드나든다)
    case 3: {
      const xs = [104, 164, 224, 284, 344];
      for (const x of xs) {
        b.prop("sv_rack", x, 118, { v: x });
        b.prop("sv_rack", x, 222, { v: x + 7 });
        b.light(x, 160, 26, 0x9adcff);
      }
      b.decal("sv_glass", 74, 116, 300, 3);
      b.decal("sv_glass", 74, 205, 300, 3);
      b.decal("sv_glassdoor", 64, 122, 8, 76);
      b.decal("sv_glassdoor", 376, 122, 8, 76);
      vents([
        [96, 144],
        [144, 168],
        [192, 144],
        [240, 168],
        [288, 144],
        [336, 168],
      ]);
      b.prop("sv_crac", 30, 100).prop("sv_crac", AW - 30, 100).prop("sv_ups", 96, 60).prop("sv_ups", AW - 96, 60);
      b.start = { x: AW / 2, y: 166 };
      b.spawn(...EDGE, [26, 160], [AW - 26, 160], [224, 44]);
      break;
    }
    // 케이블 금고: 벽을 따라 패치 패널, 굴러다니는 케이블 드럼, 바닥 케이블 도랑
    case 4: {
      for (const x of [80, 136, 312, 368]) {
        b.prop("sv_patch", x, 76, { v: x });
        b.light(x, 66, 20, 0xffc070);
      }
      b.decal("sv_trench", SIDE, 112, AW - SIDE * 2, 10);
      b.decal("sv_trench", 216, 122, 10, AH - 122 - SIDE);
      const spools: [number, number][] = [
        [150, 176],
        [300, 160],
        [96, 240],
        [360, 246],
        [270, 252],
      ];
      spools.forEach(([x, y], i) => b.prop("sv_spool", x, y, { v: i }));
      b.prop("sv_ups", 224, 70).prop("sv_crac", AW - 26, 190);
      b.light(224, 150, 50, 0xffd8a0);
      b.start = { x: AW / 2 - 24, y: 160 };
      b.spawn(...EDGE, [26, 160], [224, 44], [168, AH - 24]);
      break;
    }
    // UPS·배터리실: 배터리 함 줄, 노랑·검정 위험 줄무늬
    case 5: {
      const rows: [number, number][] = [];
      for (const y of [104, 212]) for (const x of [80, 150, 298, 368]) rows.push([x, y]);
      for (const [x, y] of rows) {
        b.decal("sv_hazard", x - 28, y + 1, 56, 5);
        b.prop("sv_battery", x, y, { v: x + y });
        b.light(x, y - 6, 22, 0xffd070);
      }
      b.decal("sv_hazard", SIDE, TOP, AW - SIDE * 2, 4);
      b.decal("sv_hazard", SIDE, AH - SIDE - 4, AW - SIDE * 2, 4);
      b.decal("sv_hazard_box", 196, 130, 56, 56);
      b.prop("sv_ups", 224, 62).prop("sv_ups", 204, 262).prop("sv_ups", 244, 262);
      b.start = { x: AW / 2, y: 158 };
      b.spawn(...EDGE, [26, 158], [AW - 26, 158], [112, 44]);
      break;
    }
    // 관제실: 벽 가득 모니터, 콘솔 책상 두 줄 (의자)
    case 6: {
      const desks: [number, number][] = [
        [112, 122],
        [224, 122],
        [336, 122],
        [168, 214],
        [280, 214],
      ];
      for (const [x, y] of desks) {
        b.prop("sv_noc_desk", x, y, { v: x + y });
        b.prop("sv_chair", x - 18, y + 14).prop("sv_chair", x + 18, y + 14);
        b.light(x, y - 18, 26, 0x9ac8ff);
      }
      b.decal("sv_carpet_path", SIDE, 150, AW - SIDE * 2, 26);
      b.prop("sv_crac", 26, 206).prop("sv_crac", AW - 26, 206);
      b.light(224, 34, 70, 0x6ab0ff);
      b.start = { x: AW / 2, y: 160 };
      b.spawn(...EDGE, [26, 160], [AW - 26, 160], [224, 50]);
      break;
    }
    // 테이프 보관실: 테이프 선반 줄 + 천장 로봇 팔 레일
    case 7: {
      const shelves: [number, number][] = [
        [96, 98],
        [224, 98],
        [352, 98],
        [160, 206],
        [288, 206],
      ];
      for (const [x, y] of shelves) {
        b.prop("sv_tape_shelf", x, y, { v: x + y });
        b.light(x, y - 10, 26, 0xffe0a0);
      }
      b.decal("sv_rail", SIDE, 132, AW - SIDE * 2, 4);
      b.decal("sv_rail", SIDE, 236, AW - SIDE * 2, 4);
      b.prop("sv_ups", 30, 170).prop("sv_crac", AW - 26, 170);
      b.start = { x: AW / 2, y: 150 };
      b.spawn(...EDGE, [60, 160], [AW - 70, 140], [224, 44]);
      break;
    }
    // 메인프레임 홀 (우두머리 층): 넓은 원형 단, 바닥 회로, 네 귀퉁이 메인프레임
    default: {
      for (const y of SV_TRACES.h) b.decal("sv_trace", SIDE, y, AW - SIDE * 2, 1);
      for (const x of SV_TRACES.v) b.decal("sv_trace", x, TOP, 1, AH - TOP - SIDE);
      b.decal("sv_platform", 224 - 120, 150 - 74, 240, 148);
      const mfs: [number, number][] = [
        [72, 92],
        [AW - 72, 92],
        [72, 262],
        [AW - 72, 262],
      ];
      for (const [x, y] of mfs) {
        b.prop("sv_mainframe", x, y, { v: x + y });
        b.light(x, y - 24, 30, 0x6aff9a);
      }
      b.light(224, 150, 80, 0x3a8aff);
      b.start = { x: AW / 2, y: 200 };
      b.spawn(...EDGE, [26, 170], [AW - 26, 170], [224, 44], [140, 44], [308, 44]);
      break;
    }
  }
  // 모든 방: 벽 밑과 양옆을 두르는 네온 (색은 층마다 — 게임이 빛을 입힌다)
  sideNeon();
  b.decal("sv_neon", SIDE + 4, TOP + 2, AW - SIDE * 2 - 8, 1);
  for (const x of [112, 224, 336]) b.light(x, TOP + 18, 34, 0x8ab8ff);
}

// ── 바닥 ──

type Decal = { kind: string; x: number; y: number; w: number; h: number; v?: number };

/** 방 종류마다 바닥 타일 색·무늬 */
const FLOOR_STYLE: { a: Color; b: Color; hi: Color; bolt: Color; size: number; kind: "raised" | "grate" | "concrete" | "carpet" | "white" | "gloss" }[] = [
  { a: 0x0f1626, b: 0x0d1422, hi: 0x18223a, bolt: 0x26344e, size: 24, kind: "raised" },
  { a: 0x111a2a, b: 0x0e1624, hi: 0x1a2640, bolt: 0x2a3a56, size: 24, kind: "raised" },
  { a: 0x161a22, b: 0x13161e, hi: 0x20262f, bolt: 0x323a46, size: 24, kind: "raised" },
  { a: 0x0e1a24, b: 0x0c1620, hi: 0x16283a, bolt: 0x24405a, size: 24, kind: "raised" },
  { a: 0x1a1c20, b: 0x17191d, hi: 0x2a2d33, bolt: 0x3a3e46, size: 16, kind: "grate" },
  { a: 0x24262a, b: 0x222428, hi: 0x2e3036, bolt: 0x3a3c42, size: 32, kind: "concrete" },
  { a: 0x161c34, b: 0x141a30, hi: 0x1c2440, bolt: 0x222a48, size: 32, kind: "carpet" },
  { a: 0x2a2e36, b: 0x272b33, hi: 0x353a44, bolt: 0x404652, size: 24, kind: "white" },
  { a: 0x07090e, b: 0x090c12, hi: 0x121826, bolt: 0x1a2a3a, size: 24, kind: "gloss" },
];

export function serverRoomFloor(c: Ctx, decals: readonly Decal[], v: number): void {
  const st = FLOOR_STYLE[Math.max(0, Math.min(FLOOR_STYLE.length - 1, v))];
  const T = st.size;
  for (let y = 0; y < AH; y += T)
    for (let x = 0; x < AW; x += T) {
      const alt = ((x + y) / T) % 2;
      R(c, x, y, T, T, alt ? st.a : st.b);
      if (st.kind === "raised" || st.kind === "white" || st.kind === "gloss") {
        R(c, x + 1, y + 1, T - 2, 1, st.hi);
        R(c, x + 1, y + 1, 1, T - 2, darken(st.hi, 0.1));
        for (const [bx, by] of [
          [2, 2],
          [T - 3, 2],
          [2, T - 3],
          [T - 3, T - 3],
        ])
          R(c, x + bx, y + by, 1, 1, st.bolt);
      } else if (st.kind === "grate") {
        // 무늬 철판 (마름모 돌기)
        for (let j = 2; j < T; j += 4) for (let i = (j / 4) % 2 ? 2 : 4; i < T; i += 4) R(c, x + i, y + j, 2, 1, st.hi);
      } else if (st.kind === "concrete") {
        for (let k = 0; k < 10; k++) R(c, x + hash2(x + k, y, 77) * T, y + hash2(x, y + k, 78) * T, 1, 1, st.hi);
      } else if (st.kind === "carpet") {
        for (let k = 2; k < T; k += 4) R(c, x + (alt ? k : 0), y + (alt ? 0 : k), alt ? 1 : T, alt ? T : 1, st.hi);
      }
    }
  if (st.kind !== "carpet" && st.kind !== "concrete") {
    for (let y = 0; y < AH; y += T) R(c, 0, y, AW, 1, 0x05070c);
    for (let x = 0; x < AW; x += T) R(c, x, 0, 1, AH, 0x05070c);
  }
  // 반짝이는 바닥(메인프레임 홀): 위 조명이 비친 긴 반사
  if (st.kind === "gloss") for (let k = 0; k < 6; k++) R(c, 60 + k * 64, TOP, 10, AH - TOP, 0x1a2a44, 0.25);
  c.fillStyle = css(lighten(st.a, 0.08), 0.6);
  for (let k = 0; k < 700; k++) c.fillRect(Math.floor(hash2(k, 1, 901 + v) * AW), Math.floor(hash2(k, 2, 901 + v) * AH), 1, 1);
  for (const d of decals) decal(c, d);
}

function decal(c: Ctx, d: Decal): void {
  switch (d.kind) {
    case "sv_trace": {
      const hor = d.w > d.h;
      const len = hor ? d.w : d.h;
      for (let k = 0; k < len; k++) {
        const x = hor ? d.x + k : d.x;
        const y = hor ? d.y : d.y + k;
        R(c, x, y, 1, 1, k % 12 < 9 ? 0x1c5a7a : 0x123a52);
        R(c, hor ? x : x + 2, hor ? y + 2 : y, 1, 1, 0x10283a);
        if (k % 48 === 24) R(c, x - 1, y - 1, 3, 3, 0x3a8aaa);
      }
      break;
    }
    case "sv_vent":
      R(c, d.x + 1, d.y + 1, d.w - 2, d.h - 2, 0x1a2436);
      for (let j = 3; j < d.h - 2; j += 3) for (let i = 3; i < d.w - 2; i += 3) R(c, d.x + i, d.y + j, 1, 1, 0x4a6a8a);
      R(c, d.x + 1, d.y + 1, d.w - 2, 1, 0x3a4e6a);
      R(c, d.x + 1, d.y + d.h - 2, d.w - 2, 1, 0x0a0e16);
      break;
    // 네온 띠 (밝은 흰빛 — 색은 게임이 층마다 빛으로 입힌다)
    case "sv_neon":
      R(c, d.x - 1, d.y - 1, d.w + 2, d.h + 2, 0x5a6a8a, 0.5);
      R(c, d.x, d.y, d.w, d.h, 0xc8d8f0);
      break;
    case "sv_hazard":
      for (let x = 0; x < d.w; x++) for (let y = 0; y < d.h; y++) R(c, d.x + x, d.y + y, 1, 1, ((x + y) >> 2) % 2 ? 0x1a1a1a : 0xe8c030);
      break;
    case "sv_hazard_box":
      for (let k = 0; k < 4; k++) {
        const horiz = k < 2;
        const x = d.x + (k === 3 ? d.w - 4 : 0);
        const y = d.y + (k === 1 ? d.h - 4 : 0);
        decal(c, { kind: "sv_hazard", x, y, w: horiz ? d.w : 4, h: horiz ? 4 : d.h });
      }
      break;
    case "sv_glass":
      R(c, d.x, d.y - 1, d.w, d.h + 2, 0x9adcff, 0.25);
      R(c, d.x, d.y, d.w, 1, 0xd8f4ff, 0.8);
      for (let x = d.x; x < d.x + d.w; x += 30) R(c, x, d.y - 1, 1, d.h + 2, 0x6a8aa8);
      break;
    case "sv_glassdoor":
      R(c, d.x, d.y, d.w, d.h, 0x9adcff, 0.18);
      R(c, d.x, d.y, 1, d.h, 0x8aa8c8);
      R(c, d.x + d.w - 1, d.y, 1, d.h, 0x8aa8c8);
      R(c, d.x, d.y + d.h / 2, d.w, 1, 0x6a8aa8);
      break;
    case "sv_trench":
      R(c, d.x, d.y, d.w, d.h, 0x07090c);
      for (let k = 0; k < 4; k++) {
        const col = [0x3a7ad8, 0xd8a030, 0xd03030, 0x3ac87a][k];
        if (d.w > d.h) for (let x = d.x; x < d.x + d.w; x++) R(c, x, d.y + 2 + k * 2 + Math.round(Math.sin(x / 9 + k) * 0.6), 1, 1, darken(col, 0.3));
        else for (let y = d.y; y < d.y + d.h; y++) R(c, d.x + 2 + k * 2 + Math.round(Math.sin(y / 9 + k) * 0.6), y, 1, 1, darken(col, 0.3));
      }
      if (d.w > d.h) for (let x = d.x; x < d.x + d.w; x += 6) R(c, x, d.y, 1, d.h, 0x3a3e46);
      else for (let y = d.y; y < d.y + d.h; y += 6) R(c, d.x, y, d.w, 1, 0x3a3e46);
      break;
    case "sv_tray_floor":
      R(c, d.x, d.y, d.w, d.h, 0x2a3040);
      for (let x = d.x; x < d.x + d.w; x += 5) R(c, x, d.y, 1, d.h, 0x4a5468);
      break;
    case "sv_carpet_path":
      R(c, d.x, d.y, d.w, d.h, 0x1e2848);
      R(c, d.x, d.y, d.w, 1, 0x2e3a64);
      R(c, d.x, d.y + d.h - 1, d.w, 1, 0x10162a);
      break;
    case "sv_rail":
      R(c, d.x, d.y, d.w, d.h, 0x3a3e48);
      R(c, d.x, d.y, d.w, 1, 0x8a92a0);
      for (let x = d.x; x < d.x + d.w; x += 12) R(c, x, d.y + 1, 2, d.h - 1, 0x202228);
      break;
    case "sv_platform": {
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      E(c, cx, cy + 3, d.w / 2 + 2, d.h / 2 + 2, 0x020306);
      E(c, cx, cy, d.w / 2, d.h / 2, 0x10182a);
      E(c, cx, cy, d.w / 2 - 6, d.h / 2 - 5, 0x0c1220);
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        R(c, cx + Math.cos(a) * (d.w / 2 - 3), cy + Math.sin(a) * (d.h / 2 - 3), 2, 1, 0x3a8aaa);
      }
      // 가운데 육각 칩 무늬
      E(c, cx, cy, 30, 19, 0x14243a);
      for (let k = 0; k < 8; k++) R(c, cx - 26 + k * 7, cy - 1, 4, 2, 0x2a5a7a);
      break;
    }
  }
}

// ── 벽 ──

/** 위 벽: 방 종류마다 다른 벽 (관제실 모니터 벽·테이프 로봇·위험 표지·케이블 사다리 …). 층 번호 표지는 게임이 따로 붙인다 */
export function serverRoomWall(c: Ctx, v: number): void {
  R(c, 0, 0, AW, TOP, 0x111826);
  for (let k = 0; k < 260; k++) R(c, hash2(k, 3, 902) * AW, hash2(k, 4, 902) * TOP, 1, 1, 0x182234);
  const screen = (x: number, y: number, w: number, h: number, col: Color, salt: number) => {
    R(c, x, y, w, h, 0x0a1220);
    R(c, x + 1, y + 1, w - 2, h - 2, darken(col, 0.6));
    for (let yy = y + 2; yy < y + h - 1; yy += 2) for (let i = 2; i < w - 2; i++) if (hash2(x + i, yy, salt) < 0.55) R(c, x + i, yy, 1, 1, col, 0.85);
  };
  switch (v) {
    case 6: {
      // 관제실: 벽 가득 큰 모니터 (그래프·지도·경보)
      for (let k = 0; k < 6; k++) {
        const x = 16 + k * 70;
        R(c, x, 2, 66, TOP - 6, 0x2a3446);
        R(c, x + 2, 4, 62, TOP - 10, 0x050a14);
        const col = [0x3ab0ff, 0x2ad07a, 0xd0a03a, 0xff4a3a, 0x3ab0ff, 0x8a6aff][k];
        if (k % 3 === 0) for (let i = 0; i < 58; i++) R(c, x + 4 + i, 6 + Math.round(8 + Math.sin(i / 5 + k) * 5 + Math.sin(i / 2) * 1.5), 1, 2, col);
        else if (k % 3 === 1) for (let j = 0; j < 4; j++) R(c, x + 6 + j * 14, 18 - j * 3, 10, 4 + j * 3, col, 0.85);
        else screen(x + 3, 5, 60, TOP - 12, col, 905 + k);
      }
      break;
    }
    case 7: {
      // 테이프 보관실: 카트리지 칸이 빼곡한 벽 + 로봇 팔
      for (let x = 14; x < AW - 14; x += 6) for (let y = 4; y < TOP - 6; y += 5) R(c, x, y, 5, 4, hash2(x, y, 906) < 0.15 ? 0x0a0a0e : [0x2a2a32, 0x3a3a44, 0x1e1e26][Math.floor(hash2(x, y, 907) * 3)]);
      for (let x = 14; x < AW - 14; x += 6) for (let y = 4; y < TOP - 6; y += 5) if (hash2(x, y, 908) < 0.5) R(c, x + 1, y + 1, 3, 1, [0xe8e0c8, 0x3ab0ff, 0xd8a030][Math.floor(hash2(x, y, 909) * 3)]);
      R(c, 0, 1, AW, 2, 0x5a6270);
      R(c, 248, 0, 14, 10, 0x8a92a0);
      R(c, 252, 10, 6, 6, 0x6a7280);
      R(c, 250, 16, 10, 3, 0xd8a030);
      break;
    }
    case 5: {
      // UPS·배터리실: 위험 표지, 배터리 상태판, 노랑·검정 띠
      for (let x = 0; x < AW; x++) for (let y = TOP - 8; y < TOP - 4; y++) R(c, x, y, 1, 1, ((x + y) >> 2) % 2 ? 0x1a1a1a : 0xe8c030);
      for (const x of [40, 200, 360]) {
        // 번개 경고 삼각형
        for (let j = 0; j < 14; j++) R(c, x + 7 - j / 2, 4 + j, j + 1, 1, 0xe8c030);
        R(c, x + 6, 8, 2, 4, 0x141218);
        R(c, x + 5, 12, 2, 3, 0x141218);
        R(c, x + 6, 15, 1, 2, 0x141218);
      }
      for (const x of [90, 250]) {
        R(c, x, 4, 60, 14, 0x0a0e12);
        for (let i = 0; i < 8; i++) R(c, x + 3 + i * 7, 7, 5, 8, i < 6 ? 0x3aff6a : 0xd8a030, 0.85);
      }
      break;
    }
    case 4: {
      // 케이블 금고: 벽을 타는 케이블 사다리 + 색색 케이블 다발
      for (let k = 0; k < 14; k++) {
        const x = 20 + k * 30;
        R(c, x, 0, 16, TOP - 4, 0x2a3040);
        for (let y = 2; y < TOP - 4; y += 4) R(c, x, y, 16, 1, 0x4a5468);
        const cols = [0x3a7ad8, 0xf0d050, 0xd03030, 0x3ad07a, 0xe8e8e8];
        for (let i = 0; i < 5; i++) R(c, x + 2 + i * 3, 0, 2, TOP - 4, darken(cols[(i + k) % 5], 0.25));
      }
      break;
    }
    case 8: {
      // 메인프레임 홀: 옛날 본체 앞판 (테이프 릴·불빛 계기판)
      R(c, 0, 0, AW, TOP, 0xa89e86);
      R(c, 0, 0, AW, 2, 0xc8beA6);
      for (let k = 0; k < 7; k++) {
        const x = 18 + k * 60;
        R(c, x, 3, 48, TOP - 8, 0x8a826e);
        if (k % 2 === 0) {
          for (const cx of [x + 13, x + 35]) {
            E(c, cx, 13, 9, 9, 0x2a2a30);
            E(c, cx, 13, 6, 6, 0xd8d0bc);
            E(c, cx, 13, 2, 2, 0x2a2a30);
          }
        } else for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) R(c, x + 4 + i * 5, 6 + j * 4, 2, 2, hash2(i, j + k, 910) < 0.4 ? 0xff9a3a : hash2(i, j + k, 911) < 0.5 ? 0x3aff6a : 0x3a3a34);
      }
      R(c, 0, TOP - 4, AW, 4, 0x5a5444);
      R(c, 0, TOP - 1, AW, 1, 0x1a1810);
      return;
    }
    default: {
      // 랙 방: 관제실 유리창(모니터), 소화 가스 통, 온도계, 늘어진 케이블, 철망 패널
      R(c, 22, 3, 104, TOP - 9, 0x2a3446);
      R(c, 24, 5, 100, TOP - 13, 0x060c18);
      [0x2ad07a, 0x3ab0ff, 0xd0a03a, 0x3ab0ff].forEach((col, i) => screen(28 + i * 24, 8, 20, 10, col, 903 + v));
      R(c, 24, 5, 100, 1, 0x5a6a84);
      for (const x of [180, 190, 200]) {
        R(c, x, 4, 7, TOP - 8, 0xb02a2a);
        R(c, x + 1, 4, 2, TOP - 8, 0xd84a4a);
        R(c, x + 2, 2, 3, 2, 0x8a8a90);
      }
      R(c, 220, 6, 30, 12, 0x0a0a10);
      R(c, 221, 7, 28, 10, 0x1a0a0a);
      digits(c, `${27 + v}`, 224, 9, 0xff4a3a);
      R(c, 241, 9, 1, 1, 0xff4a3a);
      const cables: Color[] = [0x3a7ad8, 0xf0d050, 0xd03030, 0x3ad07a, 0x8a92a0];
      cables.forEach((col, i) => {
        const x = 266 + i * 3;
        for (let y = 0; y < TOP - 2; y++) R(c, x + Math.round(Math.sin(y / 5 + x) * 1), y, 2, 1, darken(col, 0.2));
      });
      R(c, 296, 3, 120, TOP - 7, 0x1a2232);
      for (let y = 5; y < TOP - 5; y += 3) for (let x = 298; x < 414; x += 3) R(c, x, y, 1, 1, 0x2a3650);
    }
  }
  R(c, 350, 1, 12, 4, 0x3a3a44);
  R(c, 0, TOP - 4, AW, 4, 0x1e2a40);
  R(c, 0, TOP - 4, AW, 1, 0x3a5a84);
  R(c, 0, TOP - 1, AW, 1, 0x05080e);
}

// ── 숫자 (층 번호·온도계) 3×5 도트 ──

const GLYPHS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  B: ["##.", "#.#", "##.", "#.#", "##."],
};

/** 3×5 도트 글자 (scale배). 글자 사이 1칸 */
export function digits(c: Ctx, text: string, x: number, y: number, col: Color, scale = 1, a = 1): number {
  let ox = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) g.forEach((row, j) => [...row].forEach((p, i) => p === "#" && R(c, ox + i * scale, y + j * scale, scale, scale, col, a)));
    ox += 4 * scale;
  }
  return ox - x - scale;
}

export const SV_SIDE: Color = 0x0c111c;
/** 경광등 자리 (벽) */
export const SV_BEACON = { x: 356, y: 4 };

// ── 소품 그림 (art.ts PROPS에 펼쳐 넣는다) ──

type PropPaint = (c: Ctx, w: number, h: number, v: number) => void;

export const SV_PROPS: Record<string, PropPaint> = {
  // 서버 랙: 위 판(케이블 구멍) + 앞면 캐비닛 셋 (1U 칸·손잡이·유리 반사). 밝은 LED는 게임이 위에 그린다
  sv_rack(c, w, h, v) {
    R(c, 0, 0, w, 9, 0x2a3446);
    R(c, 0, 0, w, 1, 0x4a5a74);
    for (let x = 4; x < w - 4; x += 6) R(c, x, 3, 3, 3, 0x0e1420);
    R(c, 0, 9, w, h - 9, 0x10141e);
    for (let k = 0; k < 3; k++) {
      const x = 2 + k * 19;
      R(c, x, 11, 18, h - 14, 0x161c2a);
      for (let u = 0; u < 7; u++) {
        const y = 13 + u * 4;
        const blank = hash2(k, u, v) < 0.12;
        R(c, x + 1, y, 16, 3, blank ? 0x0c1018 : 0x222a3c);
        if (!blank) {
          R(c, x + 1, y, 16, 1, 0x2e3850);
          R(c, x + 2, y + 1, 1, 1, 0x6a7a94);
          R(c, x + 4, y + 1, 6, 1, 0x141a26);
        }
      }
      for (let i = 0; i < 10; i++) R(c, x + 3 + i, 12 + i * 3, 1, 2, 0xb0d0ff, 0.12);
      R(c, x, 11, 1, h - 14, 0x2a3446);
    }
    R(c, 0, h - 3, w, 3, 0x080a10);
  },
  // 세로로 선 랙 줄 (옆에서 본 긴 몸): 긴 윗면 + 좁은 앞면
  sv_rack_v(c, w, h, v) {
    R(c, 0, 0, w, h, 0x10141e);
    R(c, 0, 0, 12, h - 2, 0x2a3446);
    R(c, 0, 0, 12, 1, 0x4a5a74);
    for (let y = 4; y < h - 6; y += 6) R(c, 3, y, 6, 3, 0x0e1420);
    R(c, 12, 4, w - 12, h - 8, 0x161c2a);
    for (let u = 0; u < 14; u++) {
      const y = 8 + u * 4;
      R(c, 13, y, w - 14, 3, hash2(u, 1, v) < 0.12 ? 0x0c1018 : 0x222a3c);
      R(c, 13, y, w - 14, 1, 0x2e3850);
    }
    R(c, 0, h - 3, w, 3, 0x080a10);
  },
  // 항온항습기: 키 큰 흰 냉각기, 큰 흡기 망, 파란 상태 화면
  sv_crac(c, w, h) {
    R(c, 1, 2, w - 2, h - 2, 0xc8ccd4);
    R(c, 1, 2, w - 2, 1, 0xeef0f4);
    R(c, w - 3, 2, 2, h - 2, 0x9aa0ac);
    R(c, 4, 5, w - 8, 6, 0x0a1420);
    R(c, 5, 6, w - 10, 4, 0x1a5ab0);
    R(c, 6, 7, 6, 1, 0x8ad8ff);
    R(c, 6, 9, 3, 1, 0x8ad8ff);
    for (let y = 14; y < h - 5; y += 2) R(c, 4, y, w - 8, 1, 0x7a808c);
    R(c, 3, h - 4, w - 6, 2, 0x5a606c);
  },
  // 무정전 전원 장치: 짧고 검은 상자, 초록 배터리 막대
  sv_ups(c, w, h) {
    R(c, 1, 4, w - 2, h - 4, 0x1e222c);
    R(c, 1, 4, w - 2, 1, 0x3a4050);
    R(c, 4, 7, w - 8, 4, 0x0a0e12);
    for (let i = 0; i < 4; i++) R(c, 5 + i * 2, 8, 1, 2, i < 3 ? 0x3aff6a : 0x1a4a2a);
    for (let y = 13; y < h - 2; y += 2) R(c, 3, y, w - 6, 1, 0x2a3040);
  },
  // 배터리 함: 회색 함 + 노란 경고 띠, 배터리 칸
  sv_battery(c, w, h, v) {
    R(c, 0, 4, w, h - 4, 0x3a3e46);
    R(c, 0, 4, w, 2, 0x5a606a);
    R(c, 0, 10, w, 3, 0xe8c030);
    for (let x = 0; x < w; x += 4) R(c, x, 10, 2, 3, 0x1a1a1a);
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 11;
      R(c, x, 15, 10, h - 18, 0x22252c);
      R(c, x + 2, 17, 6, 2, hash2(i, v, 920) < 0.25 ? 0xd03030 : 0x2a3a2a);
      R(c, x + 3, 21, 4, h - 26, 0x2e323a);
    }
    R(c, 0, h - 2, w, 2, 0x14161a);
  },
  // 케이블 드럼: 나무 드럼에 감긴 케이블
  sv_spool(c, w, h, v) {
    const col = [0x3a7ad8, 0xd8a030, 0xd03030, 0x3ac87a, 0x8a92a0][v % 5];
    E(c, w / 2, h / 2 + 1, w / 2 - 1, h / 2 - 2, 0x6a4a2a);
    E(c, w / 2, h / 2, w / 2 - 3, h / 2 - 4, col);
    for (let k = -6; k <= 6; k += 2) R(c, w / 2 + k, 4, 1, h - 9, darken(col, 0.25));
    E(c, w / 2, h / 2, 3, 3, 0x8a6a3a);
    E(c, w / 2, h / 2, 1.2, 1.2, 0x2a1a0a);
  },
  // 패치 패널 장: 색색 패치 케이블이 늘어진 캐비닛
  sv_patch(c, w, h, v) {
    R(c, 0, 4, w, h - 4, 0x161c2a);
    R(c, 0, 4, w, 2, 0x3a4660);
    for (let u = 0; u < 6; u++) {
      const y = 10 + u * 4;
      R(c, 2, y, w - 4, 3, 0x2a3244);
      for (let i = 0; i < 4; i++) {
        const col = [0x3a7ad8, 0xf0d050, 0xd03030, 0x3ad07a, 0xe8e8e8][(u + i + v) % 5];
        const x = 5 + i * 5;
        for (let k = 0; k < 6 + ((u * 3 + i) % 5); k++) R(c, x + Math.round(Math.sin(k / 2 + i) * 1.2), y + 3 + k, 1, 1, darken(col, 0.15));
      }
    }
    R(c, 0, h - 3, w, 3, 0x080a10);
  },
  // 관제 책상: 모니터 셋이 놓인 긴 책상
  sv_noc_desk(c, w, h, v) {
    R(c, 0, 14, w, h - 14, 0x2a2e38);
    R(c, 0, 14, w, 2, 0x4a505c);
    for (let k = 0; k < 3; k++) {
      const x = 6 + k * 21;
      R(c, x, 1, 18, 12, 0x1a1e28);
      const col = [0x3ab0ff, 0x2ad07a, 0xd0a03a, 0xff4a3a][(k + v) % 4];
      R(c, x + 1, 2, 16, 9, darken(col, 0.55));
      for (let i = 0; i < 14; i++) R(c, x + 2 + i, 4 + Math.round(3 + Math.sin(i / 2 + k + v) * 2), 1, 1, col);
      R(c, x + 8, 13, 2, 2, 0x3a3e48);
    }
    R(c, 10, 18, w - 20, 3, 0x1a1e26);
    R(c, 0, h - 2, w, 2, 0x14161c);
  },
  // 테이프 선반: 카트리지가 빼곡한 긴 선반
  sv_tape_shelf(c, w, h, v) {
    R(c, 0, 0, w, h, 0x2a2e36);
    R(c, 0, 0, w, 2, 0x5a6270);
    for (let s = 0; s < 4; s++) {
      const y = 4 + s * 9;
      R(c, 2, y + 7, w - 4, 2, 0x4a505c);
      for (let x = 3; x < w - 3; x += 3) {
        if (hash2(x, s, 930 + v) < 0.1) continue;
        R(c, x, y, 2, 7, [0x1e1e26, 0x2e2e36, 0x14141a][Math.floor(hash2(x, s, 931) * 3)]);
        R(c, x, y + 1, 2, 1, [0xe8e0c8, 0x3ab0ff, 0xd8a030, 0xd03030][Math.floor(hash2(x, s, 932 + v) * 4)]);
      }
    }
    R(c, 0, h - 3, w, 3, 0x0c0e12);
  },
  // 메인프레임: 베이지 옛날 본체 (테이프 릴 둘 + 계기판)
  sv_mainframe(c, w, h) {
    R(c, 0, 2, w, h - 2, 0xa89e86);
    R(c, 0, 2, w, 2, 0xc8bea6);
    R(c, w - 3, 2, 3, h - 2, 0x7a725e);
    for (const cy of [12, 24]) {
      E(c, 9, cy, 6, 6, 0x2a2a30);
      E(c, 9, cy, 4, 4, 0xd8d0bc);
      E(c, 21, cy, 6, 6, 0x2a2a30);
      E(c, 21, cy, 4, 4, 0xd8d0bc);
    }
    R(c, 5, 34, 20, 14, 0x3a3a34);
    R(c, 0, h - 3, w, 3, 0x3a3428);
  },
  // 관제실 의자 (낮은 바퀴 의자)
  sv_chair(c, w, h) {
    E(c, w / 2, h - 7, 5, 4, 0x2a2e3a);
    R(c, w / 2 - 4, 1, 8, 6, 0x3a4050);
    R(c, w / 2 - 1, h - 3, 2, 2, 0x14161c);
  },
};
