import { css, darken, hash2, lighten, mix, type Color } from "../../sprites/pixel";
import { settleSpawns } from "./spawnFix";
// 11/17 겨울판·크리스마스판 손질 (바닥 눈밭·벽 너머 도시 지붕 눈)
import { paintGroundSnow, paintSnowy } from "../../rpg/arena/paintConcept";
import { blockRoom } from "@/lib/rpg/towerSchedule";
import { RF_BOSS_ROOM, RF_ROOM_SALT, RF_ROOMS } from "@/lib/rpg/towerThemes/rooftop";

// 11/15 옥상 정원 폭풍 지도: 방 종류 여덟 가지 배치(layout.ts MAKE가 부른다) + 젖은 바닥·난간 너머 도시·소품 그림(arena/art.ts가 부른다). Phaser 없음.
// 층마다 방이 다르다 — rfRoom(판 시드·층). 바닥 그림은 (사냥터, 방 종류)마다 한 장으로 기억되므로 방 종류와 무늬(decal)로만 그린다.
// 움직이는 것(비·번개·웅덩이 네온·창문 불빛·흔들리는 화분·바람 자루·층 번호)은 rooftopStage.ts가 그린다.
// 순환 참조를 피하려고 layout.ts·art.ts를 가져오지 않는다 → 지도 크기는 여기 숫자를 같이 쓴다 (layout.ts AW·AH·TOP·SIDE와 같다).

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;

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

/** 방 종류 (layout 배치 번호와 같다). 7 = 우두머리 층 피뢰침 탑 */
export const RF_ROOM_NAMES = ["화단 산책로", "실외기 마당", "물탱크 아래", "흡연 구역", "옥상 텃밭", "헬리포트", "네온 간판 뒤", "피뢰침 탑"] as const;

/** 판 시드·층 → 방 번호 (블록의 보통 층 넷은 서로 다른 방, 우두머리 층은 RF_BOSS_ROOM) */
export function rfRoom(runSeed: number, f: number): number {
  const k = blockRoom(runSeed, f, RF_ROOMS, RF_ROOM_SALT);
  return k < 0 ? RF_BOSS_ROOM : k;
}

// ── 배치 ──

/** layout.ts Builder 중 여기서 쓰는 것 */
type B = {
  start: Pt;
  prop(kind: string, x: number, y: number, extra?: { flip?: boolean; v?: number }): B;
  decal(kind: string, x: number, y: number, w: number, h: number, v?: number): B;
  light(x: number, y: number, r: number, color: number, flicker?: boolean): B;
  spawn(...pts: [number, number][]): B;
  block(x: number, y: number, w: number, h: number): B;
  solids: ({ t: "r"; x: number; y: number; w: number; h: number } | { t: "c"; x: number; y: number; r: number })[];
  spawns: { x: number; y: number }[];
};

const Rs = (dx: number, dy: number, w: number, h: number) => ({ t: "r" as const, dx, dy, w, h });
const Cs = (dx: number, dy: number, r: number) => ({ t: "c" as const, dx, dy, r });

/** 소품 크기·충돌 (layout.ts PROP_META에 펼쳐 넣는다). 발밑 띠만 막는다. 돌풍 그늘(실행부)도 이 충돌을 본다 */
export const RF_PROP_META: Record<string, { w: number; h: number; solid?: ReturnType<typeof Rs> | ReturnType<typeof Cs> }> = {
  rf_planter_box: { w: 56, h: 26, solid: Rs(-27, -12, 54, 11) },
  // 화단 위 덤불 (화단 바로 앞 깊이로 서서 바람에 흔들린다 — 밑동은 비어 있다)
  rf_shrub: { w: 30, h: 30, solid: Rs(-1, -8, 2, 2) },
  rf_pot: { w: 20, h: 30, solid: Cs(0, -4, 7) },
  rf_bench: { w: 32, h: 16 },
  rf_ac: { w: 30, h: 30, solid: Rs(-14, -12, 28, 11) },
  rf_tank: { w: 80, h: 96, solid: Rs(-34, -18, 68, 17) },
  rf_lamp: { w: 10, h: 44, solid: Cs(0, -2, 3) },
  rf_shelter: { w: 72, h: 52, solid: Rs(-35, -14, 70, 13) },
  rf_vending: { w: 22, h: 36, solid: Rs(-10, -12, 20, 11) },
  rf_ashtray: { w: 8, h: 14, solid: Cs(0, -2, 3) },
  rf_bed: { w: 46, h: 20, solid: Rs(-22, -12, 44, 11) },
  rf_shed: { w: 40, h: 40, solid: Rs(-19, -16, 38, 15) },
  rf_scarecrow: { w: 22, h: 34, solid: Cs(0, -2, 3) },
  rf_pole: { w: 6, h: 46, solid: Cs(0, -2, 3) },
  rf_sign: { w: 184, h: 76, solid: Rs(-90, -12, 180, 10) },
  rf_rod: { w: 14, h: 52, solid: Cs(0, -4, 6) },
};

/** 몸 반지름 r이 이 소품들에 막히나 (실행부의 돌풍 그늘·착지 자리 검사) */
export function rfSolidAt(props: readonly { kind: string; x: number; y: number }[], x: number, y: number, pad = 0): boolean {
  for (const p of props) {
    const s = RF_PROP_META[p.kind]?.solid;
    if (!s) continue;
    if (s.t === "r") {
      if (x >= p.x + s.dx - pad && x <= p.x + s.dx + s.w + pad && y >= p.y + s.dy - pad && y <= p.y + s.dy + s.h + pad) return true;
    } else if (Math.hypot(x - p.x - s.dx, y - p.y - s.dy) <= s.r + pad) return true;
  }
  return false;
}

const EDGE: [number, number][] = [
  [36, 62],
  [AW - 36, 62],
  [36, AH - 30],
  [AW - 36, AH - 30],
  [AW / 2, AH - 22],
];

const NEON = [0xff4ab0, 0x4ad8ff, 0xffd04a, 0x8a5aff] as const;

/** 방 종류 v의 배치 (seed는 배치 안 작은 흔들림 — 같은 방 종류면 바닥 그림이 같도록 바닥 무늬는 흔들지 않는다) */
export function rooftopLayout(b: B, v: number, seed: number): void {
  const j = (k: number, n: number) => Math.round((hash2(k, seed & 0xffff, 71) - 0.5) * n);
  const planter = (x: number, y: number, k: number) => {
    b.prop("rf_planter_box", x, y, { v: k % 3 });
    b.prop("rf_shrub", x - 13, y + 1, { v: (k * 2) % 4 });
    b.prop("rf_shrub", x + 13, y + 1, { v: (k * 2 + 1) % 4, flip: k % 2 === 1 });
  };
  switch (v) {
    // 화단 산책로: 가운데 나무 데크 길, 위아래로 화단 줄, 벤치·가로등
    case 0: {
      b.decal("rf_deck", SIDE, 124, AW - SIDE * 2, 52, 0);
      [64, 160, 288, 384].forEach((x, k) => planter(x, 98, k));
      [64, 160, 288, 384].forEach((x, k) => planter(x, 240, k + 4));
      b.prop("rf_bench", 224, 96).prop("rf_bench", 224, 242);
      b.prop("rf_lamp", 112, 132).prop("rf_lamp", 336, 178);
      b.light(112, 104, 34, 0xffd8a0).light(336, 150, 34, 0xffd8a0);
      b.decal("rf_puddle", 176, 140, 44, 14, 0).decal("rf_puddle", 286, 186, 34, 10, 1).decal("rf_puddle", 60, 160, 30, 10, 2).decal("rf_puddle", 380, 132, 28, 9, 3);
      b.start = { x: AW / 2 + j(1, 20), y: 156 };
      b.spawn(...EDGE, [24, 150], [AW - 24, 150], [224, 40]);
      break;
    }
    // 실외기 마당: 실외기 여덟 대, 벽까지 이어진 배관, 물받이 웅덩이
    case 1: {
      b.decal("rf_grate", 200, 140, 48, 24);
      const xs = [92, 172, 276, 356];
      xs.forEach((x, k) => {
        b.prop("rf_ac", x, 96, { v: k, flip: k >= 2 });
        b.decal("rf_pipe", x - 2, TOP, 4, 96 - 30 - TOP, 1);
        b.prop("rf_ac", x, 214, { v: k + 4, flip: k < 2 });
        b.decal("rf_puddle", x - 18, 222, 30, 9, k);
      });
      b.decal("rf_pipe", SIDE, 252, AW - SIDE * 2, 4, 0);
      b.decal("rf_puddle", 190, 120, 40, 12, 5).decal("rf_puddle", 250, 176, 46, 12, 6);
      b.light(132, 150, 30, 0x9ad8ff).light(316, 150, 30, 0x9ad8ff);
      b.start = { x: AW / 2, y: 156 + j(2, 10) };
      b.spawn(...EDGE, [24, 150], [AW - 24, 150], [132, 40], [316, 40]);
      break;
    }
    // 물탱크 아래: 가운데 큰 물탱크, 탱크 밑 넓은 물웅덩이, 양옆으로 배관
    case 2: {
      b.decal("rf_puddle", 132, 118, 184, 36, 0);
      b.decal("rf_puddle", 60, 210, 54, 14, 1).decal("rf_puddle", 330, 236, 60, 14, 2);
      b.decal("rf_pipe", SIDE, 132, 150, 4, 0).decal("rf_pipe", 298, 132, AW - SIDE - 298, 4, 0);
      b.prop("rf_tank", 224, 116);
      b.prop("rf_pot", 40, 84, { v: 0 }).prop("rf_pot", AW - 40, 84, { v: 1 }).prop("rf_pot", 40, AH - 22, { v: 2 }).prop("rf_pot", AW - 40, AH - 22, { v: 0 });
      b.prop("rf_ac", 112, 230, { v: 2 }).prop("rf_ac", 336, 196, { v: 3, flip: true });
      b.light(224, 120, 50, 0x9ad8ff).light(224, 66, 26, 0xff4a4a, true);
      b.start = { x: AW / 2 + j(3, 24), y: 214 };
      b.spawn(...EDGE, [24, 160], [AW - 24, 160], [96, 40], [352, 40]);
      break;
    }
    // 흡연 구역: 유리 흡연 부스, 벤치, 재떨이, 자판기
    case 3: {
      b.decal("rf_deck", 40, 150, 170, 100, 1);
      b.prop("rf_shelter", 96, 112);
      b.prop("rf_ashtray", 150, 116).prop("rf_ashtray", 64, 206);
      b.prop("rf_bench", 96, 196).prop("rf_bench", 168, 230);
      b.prop("rf_vending", 380, 82).prop("rf_vending", 404, 82);
      b.prop("rf_pot", 300, 84, { v: 1 }).prop("rf_pot", 340, 250, { v: 2 });
      b.prop("rf_planter_box", 300, 210, { v: 1 });
      b.prop("rf_shrub", 287, 211, { v: 2 }).prop("rf_shrub", 313, 211, { v: 3 });
      b.decal("rf_puddle", 220, 120, 52, 14, 0).decal("rf_puddle", 360, 150, 40, 12, 1).decal("rf_puddle", 236, 250, 36, 10, 2);
      b.decal("rf_string", SIDE, TOP + 4, AW - SIDE * 2, 4, 0);
      b.light(96, 96, 40, 0xffb060).light(392, 70, 34, 0xd8f0ff);
      b.start = { x: 270 + j(4, 20), y: 176 };
      b.spawn(...EDGE, [AW - 24, 150], [224, 40], [24, 250]);
      break;
    }
    // 옥상 텃밭: 데크 위 텃밭 상자 여섯, 창고, 허수아비
    case 4: {
      b.decal("rf_deck", SIDE, TOP, AW - SIDE * 2, AH - TOP - SIDE, 2);
      [
        [118, 100],
        [118, 168],
        [118, 236],
        [330, 100],
        [330, 168],
        [330, 236],
      ].forEach(([x, y], k) => b.prop("rf_bed", x, y, { v: k }));
      b.prop("rf_shed", 408, 74).prop("rf_scarecrow", 224, 118 + j(5, 10));
      b.prop("rf_pot", 34, 70, { v: 2 }).prop("rf_pot", 224, 254, { v: 1 });
      b.decal("rf_puddle", 200, 180, 50, 12, 0).decal("rf_puddle", 30, 140, 26, 9, 1).decal("rf_puddle", 400, 200, 30, 9, 2);
      b.light(224, 150, 40, 0xffd8a0);
      b.start = { x: 224, y: 200 };
      b.spawn(...EDGE, [24, 160], [AW - 24, 160], [224, 40]);
      break;
    }
    // 헬리포트: 커다란 H 원, 가장자리 유도등, 바람 자루
    case 5: {
      b.decal("rf_heli", 224 - 82, 156 - 70, 164, 140, 0);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        b.decal("rf_helilight", Math.round(224 + Math.cos(a) * 92) - 2, Math.round(156 + Math.sin(a) * 78) - 2, 4, 4, k);
      }
      b.prop("rf_pole", 404, 76).prop("rf_pole", 44, 252);
      b.prop("rf_pot", 34, 70, { v: 0 }).prop("rf_pot", AW - 24, AH - 22, { v: 2 });
      b.decal("rf_puddle", 80, 120, 36, 10, 0).decal("rf_puddle", 360, 222, 44, 12, 1).decal("rf_puddle", 250, 120, 30, 9, 2);
      b.light(224, 156, 70, 0x9aff9a);
      b.start = { x: 224 + j(6, 20), y: 240 };
      b.spawn(...EDGE, [24, 150], [AW - 24, 150], [224, 40], [120, 40], [328, 40]);
      break;
    }
    // 네온 간판 뒤: 거대한 간판 뼈대 뒷면, 앞으로 새는 네온 빛, 웅덩이마다 비친다
    case 6: {
      b.decal("rf_catwalk", 132, 112, 184, 8);
      b.prop("rf_sign", 224, 110);
      b.decal("rf_cable", 60, 130, 330, 3, 0).decal("rf_cable", 40, 190, 360, 3, 1);
      b.prop("rf_ac", 52, 108, { v: 1 }).prop("rf_ac", AW - 52, 108, { v: 5, flip: true });
      b.prop("rf_ac", 70, 230, { v: 3 }).prop("rf_ac", AW - 70, 230, { v: 6, flip: true });
      b.decal("rf_puddle", 150, 150, 50, 14, 0).decal("rf_puddle", 268, 162, 58, 16, 1).decal("rf_puddle", 200, 232, 70, 16, 2).decal("rf_puddle", 360, 176, 30, 9, 3);
      for (let k = 0; k < 4; k++) b.light(150 + k * 50, 112, 40, NEON[k % NEON.length]);
      b.start = { x: 224 + j(7, 30), y: 210 };
      b.spawn(...EDGE, [24, 160], [AW - 24, 160], [40, 40], [AW - 40, 40]);
      break;
    }
    // 피뢰침 탑 (우두머리 층): 네 귀퉁이 작은 피뢰침, 가운데 콘크리트 단, 고무 매트(번개 폭포 때 안전), 굵은 접지선
    default: {
      b.decal("rf_pad", 224 - 110, 156 - 66, 220, 132);
      const rods: [number, number][] = [
        [66, 84],
        [AW - 66, 84],
        [66, 256],
        [AW - 66, 256],
      ];
      for (const [x, y] of rods) {
        b.decal("rf_cable", Math.min(x, 224), y - 4, Math.abs(224 - x), 3, 2);
        b.prop("rf_rod", x, y);
        b.light(x, y - 40, 22, 0xfff06a, true);
      }
      for (const [x, y, w, h] of RF_MATS) b.decal("rf_mat", x, y, w, h);
      b.decal("rf_puddle", 150, 230, 50, 14, 0).decal("rf_puddle", 268, 70, 46, 12, 1).decal("rf_puddle", 30, 160, 30, 9, 2);
      b.light(224, 150, 80, 0xb0c8ff);
      b.start = { x: 224, y: 236 };
      b.spawn(...EDGE, [24, 170], [AW - 24, 170], [224, 40], [140, 40], [308, 40]);
      break;
    }
  }
  // 모든 방: 난간 밑 가로 배수로
  b.decal("rf_gutter", SIDE, TOP, AW - SIDE * 2, 3);
  // 11/15 소품에 걸린 출현 지점은 안쪽으로
  settleSpawns(b);
}

/** 우두머리 층 고무 매트 (x, y, w, h) — 번개 폭포 때 이 위만 안전 (실행부가 같은 값을 쓴다) */
export const RF_MATS: readonly [number, number, number, number][] = [
  [88, 136, 40, 26],
  [AW - 128, 136, 40, 26],
  [204, 70, 40, 24],
  [204, 238, 40, 24],
];

// ── 바닥 ──

type Decal = { kind: string; x: number; y: number; w: number; h: number; v?: number };

/** 방 종류마다 바닥: 젖은 보도블록 · 나무 데크 · 아스팔트 · 강판 */
const FLOOR: { a: Color; b: Color; grout: Color; kind: "paver" | "deck" | "asphalt" | "steel"; size: number }[] = [
  { a: 0x28323a, b: 0x2c363e, grout: 0x161c22, kind: "paver", size: 24 },
  { a: 0x2a3034, b: 0x262c30, grout: 0x14181c, kind: "paver", size: 32 },
  { a: 0x24303a, b: 0x283440, grout: 0x141c24, kind: "paver", size: 24 },
  { a: 0x2c3034, b: 0x30343a, grout: 0x181a1e, kind: "paver", size: 16 },
  { a: 0x3a2c22, b: 0x34281e, grout: 0x1a120c, kind: "deck", size: 8 },
  { a: 0x232a2a, b: 0x262e2e, grout: 0x161c1c, kind: "asphalt", size: 24 },
  { a: 0x2a2634, b: 0x2e2a38, grout: 0x16141e, kind: "paver", size: 24 },
  { a: 0x22262c, b: 0x262a30, grout: 0x121418, kind: "steel", size: 24 },
];

export function rooftopFloor(c: Ctx, l: { variant: number; decals: readonly Decal[] }): void {
  const st = FLOOR[Math.max(0, Math.min(FLOOR.length - 1, l.variant))];
  const T = st.size;
  if (st.kind === "deck") woodDeck(c, 0, 0, AW, AH, st.a, 11);
  else if (st.kind === "asphalt") {
    R(c, 0, 0, AW, AH, st.a);
    c.fillStyle = css(st.b);
    for (let k = 0; k < 2600; k++) c.fillRect(Math.floor(hash2(k, 5, 401) * AW), Math.floor(hash2(k, 6, 401) * AH), 1, 1);
    c.fillStyle = css(0x3a4242);
    for (let k = 0; k < 500; k++) c.fillRect(Math.floor(hash2(k, 7, 402) * AW), Math.floor(hash2(k, 8, 402) * AH), 1, 1);
  } else {
    for (let y = 0; y < AH; y += T)
      for (let x = 0; x < AW; x += T) {
        const k = hash2(x, y, 300 + l.variant);
        R(c, x, y, T, T, mix(st.a, st.b, k));
        if (st.kind === "steel") {
          // 미끄럼 방지 강판 (마름모 돌기)
          for (let jj = 2; jj < T; jj += 4) for (let i = (jj / 4) % 2 ? 2 : 4; i < T; i += 4) R(c, x + i, y + jj, 2, 1, lighten(st.a, 0.12));
        } else {
          // 젖은 보도블록: 위쪽 가장자리 반짝임, 이끼 낀 줄눈
          R(c, x + 1, y + 1, T - 2, 1, lighten(st.a, 0.14), 0.7);
          if (k > 0.82) R(c, x + 2, y + T - 3, T - 4, 2, 0x2a3a2a, 0.6);
        }
      }
    for (let y = 0; y < AH; y += T) R(c, 0, y, AW, 1, st.grout);
    for (let x = 0; x < AW; x += T) R(c, x, 0, 1, AH, st.grout);
  }
  // 빗물 번들거림 (긴 세로 반사 몇 줄)
  for (let k = 0; k < 9; k++) {
    const x = Math.floor(hash2(k, 1, 777 + l.variant) * AW);
    R(c, x, TOP + 4, 2 + (k % 3), AH - TOP - 10, 0x8ab0d8, 0.05);
  }
  c.fillStyle = css(0x9ac0e8, 0.35);
  for (let k = 0; k < 500; k++) c.fillRect(Math.floor(hash2(k, 1, 903 + l.variant) * AW), Math.floor(hash2(k, 2, 903 + l.variant) * AH), 1, 1);
  // 무늬: 넓은 것 먼저 (데크·패드 → 매트·웅덩이)
  const order = (d: Decal) => (d.kind === "rf_deck" || d.kind === "rf_pad" || d.kind === "rf_heli" ? 0 : d.kind === "rf_puddle" ? 2 : 1);
  for (const d of [...l.decals].sort((p, q) => order(p) - order(q))) {
    // 11/17 겨울판: 바닥(데크·패드까지)은 눈밭으로, 매트·웅덩이·배관 같은 기믹 무늬는 눈 위에 그대로 (arena/paintConcept)
    if (order(d) > 0) paintGroundSnow(c);
    decal(c, d);
  }
  paintGroundSnow(c);
}

function woodDeck(c: Ctx, x0: number, y0: number, w: number, h: number, base: Color, salt: number): void {
  R(c, x0, y0, w, h, darken(base, 0.35));
  for (let y = y0; y < y0 + h; y += 8) {
    let x = x0 - Math.floor(hash2(y, 1, salt) * 60);
    while (x < x0 + w) {
      const len = 50 + Math.floor(hash2(x, y, salt) * 40);
      const col = mix(base, darken(base, 0.2), hash2(x, y, salt + 1));
      const xs = Math.max(x0, x);
      const xe = Math.min(x0 + w, x + len - 1);
      if (xe > xs) {
        R(c, xs, y, xe - xs, 7, col);
        R(c, xs, y, xe - xs, 1, lighten(col, 0.16));
        for (let k = xs + 4; k < xe - 2; k += 9) if (hash2(k, y, salt + 2) < 0.3) R(c, k, y + 3, 3, 1, darken(col, 0.18));
        R(c, xe - 2, y + 2, 1, 1, 0x8a8a7a);
      }
      x += len;
    }
  }
}

function decal(c: Ctx, d: Decal): void {
  switch (d.kind) {
    case "rf_deck":
      woodDeck(c, d.x, d.y, d.w, d.h, [0x4a3424, 0x3e2e22, 0x3a2c20][d.v ?? 0], 21 + (d.v ?? 0));
      R(c, d.x, d.y, d.w, 1, 0x1a120c);
      R(c, d.x, d.y + d.h - 1, d.w, 1, 0x1a120c);
      break;
    case "rf_puddle": {
      // 젖은 웅덩이: 짙은 물 + 하늘빛 테두리 (네온 반사는 실행부가 빛으로)
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      E(c, cx, cy + 1, d.w / 2 + 2, d.h / 2 + 1, 0x101820, 0.55);
      E(c, cx, cy, d.w / 2, d.h / 2, 0x0e1a28);
      E(c, cx - d.w * 0.08, cy - d.h * 0.12, d.w / 2 - 3, d.h / 2 - 2, 0x16263a);
      for (let k = 0; k < Math.max(2, Math.floor(d.w / 10)); k++) R(c, d.x + 4 + hash2(k, d.x, 9) * (d.w - 10), cy - 1 + (k % 2), 3 + (k % 3), 1, 0x5a7aa8, 0.6);
      break;
    }
    case "rf_pipe": {
      const hor = d.w > d.h;
      R(c, d.x, d.y, d.w, d.h, 0x5a6068);
      if (hor) {
        R(c, d.x, d.y, d.w, 1, 0x8a929c);
        R(c, d.x, d.y + d.h - 1, d.w, 1, 0x2a2e34);
        for (let x = d.x + 20; x < d.x + d.w; x += 40) R(c, x, d.y - 1, 3, d.h + 2, 0x3a3e46);
      } else {
        R(c, d.x, d.y, 1, d.h, 0x8a929c);
        R(c, d.x + d.w - 1, d.y, 1, d.h, 0x2a2e34);
        for (let y = d.y + 10; y < d.y + d.h; y += 24) R(c, d.x - 1, y, d.w + 2, 3, 0x3a3e46);
      }
      break;
    }
    case "rf_grate":
      R(c, d.x, d.y, d.w, d.h, 0x0c1014);
      for (let x = d.x + 2; x < d.x + d.w - 1; x += 3) R(c, x, d.y + 1, 1, d.h - 2, 0x4a525a);
      R(c, d.x, d.y, d.w, 1, 0x6a727a);
      break;
    case "rf_gutter":
      R(c, d.x, d.y, d.w, d.h, 0x0c1218);
      for (let x = d.x; x < d.x + d.w; x += 6) R(c, x, d.y + 1, 2, 1, 0x3a5a7a);
      break;
    case "rf_string": {
      // 흡연 구역 위 전구 줄 (전구 빛은 바닥에 비친 자국으로)
      for (let x = d.x; x < d.x + d.w; x++) R(c, x, d.y + Math.round(Math.sin(((x - d.x) / d.w) * Math.PI * 6) * 2 + 2), 1, 1, 0x1a1a1a);
      for (let x = d.x + 12; x < d.x + d.w; x += 24) E(c, x, d.y + 30, 6, 2, 0xffd890, 0.1);
      break;
    }
    case "rf_heli": {
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      E(c, cx, cy, d.w / 2, d.h / 2, 0x2e3a36);
      E(c, cx, cy, d.w / 2 - 3, d.h / 2 - 3, 0xe8e0c8, 0.85);
      E(c, cx, cy, d.w / 2 - 7, d.h / 2 - 7, 0x2a3432);
      for (let k = 0; k < 900; k++) R(c, cx - d.w / 2 + hash2(k, 3, 55) * d.w, cy - d.h / 2 + hash2(k, 4, 55) * d.h, 1, 1, 0x232c2a, 0.6);
      // H (닳은 흰 페인트)
      const hw = 46;
      const hh = 60;
      R(c, cx - hw / 2, cy - hh / 2, 10, hh, 0xe8e0c8);
      R(c, cx + hw / 2 - 10, cy - hh / 2, 10, hh, 0xe8e0c8);
      R(c, cx - hw / 2, cy - 5, hw, 10, 0xe8e0c8);
      c.fillStyle = css(0x2a3432);
      for (let k = 0; k < 220; k++) c.fillRect(Math.floor(cx - hw / 2 + hash2(k, 5, 56) * hw), Math.floor(cy - hh / 2 + hash2(k, 6, 56) * hh), 1, 1);
      break;
    }
    case "rf_helilight":
      R(c, d.x - 1, d.y - 1, d.w + 2, d.h + 2, 0x1a1e1e);
      R(c, d.x, d.y, d.w, d.h, 0x3a8a4a);
      break;
    case "rf_catwalk":
      R(c, d.x, d.y, d.w, d.h, 0x30343a);
      for (let x = d.x; x < d.x + d.w; x += 3) R(c, x, d.y + 1, 1, d.h - 2, 0x1a1c20);
      R(c, d.x, d.y, d.w, 1, 0x6a707a);
      break;
    case "rf_cable": {
      const hor = d.w >= d.h;
      const len = hor ? d.w : d.h;
      for (let k = 0; k < len; k++) {
        const wob = Math.round(Math.sin(k / 23 + (d.v ?? 0)) * 1.2);
        if (hor) R(c, d.x + k, d.y + 1 + wob, 1, 2, k % 30 < 2 ? 0x8a6a2a : 0x14161a);
        else R(c, d.x + 1 + wob, d.y + k, 2, 1, 0x14161a);
      }
      break;
    }
    case "rf_pad": {
      R(c, d.x, d.y, d.w, d.h, 0x30343a);
      R(c, d.x + 2, d.y + 2, d.w - 4, d.h - 4, 0x383c42);
      for (let x = 0; x < d.w; x += 2) {
        const stripe = ((x >> 3) & 1) === 0;
        R(c, d.x + x, d.y, 2, 4, stripe ? 0xe8c030 : 0x1a1a1a);
        R(c, d.x + x, d.y + d.h - 4, 2, 4, stripe ? 0xe8c030 : 0x1a1a1a);
      }
      for (let y = 0; y < d.h; y += 2) {
        const stripe = ((y >> 3) & 1) === 0;
        R(c, d.x, d.y + y, 4, 2, stripe ? 0xe8c030 : 0x1a1a1a);
        R(c, d.x + d.w - 4, d.y + y, 4, 2, stripe ? 0xe8c030 : 0x1a1a1a);
      }
      // 가운데 번개 표지
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      E(c, cx, cy, 22, 16, 0x2a2e34);
      const bolt: [number, number][] = [
        [2, -12],
        [-6, 2],
        [0, 2],
        [-3, 12],
        [7, -3],
        [1, -3],
        [5, -12],
      ];
      for (let k = 0; k < bolt.length - 1; k++) {
        const [x0, y0] = bolt[k];
        const [x1, y1] = bolt[k + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= n; i++) R(c, cx + x0 + ((x1 - x0) * i) / n - 1, cy + y0 + ((y1 - y0) * i) / n - 1, 2, 2, 0xe8c030);
      }
      break;
    }
    case "rf_mat": {
      // 고무 매트: 검은 골 무늬 + 초록 테두리
      R(c, d.x - 1, d.y - 1, d.w + 2, d.h + 2, 0x0a0c0a);
      R(c, d.x, d.y, d.w, d.h, 0x1c2220);
      for (let y = d.y + 2; y < d.y + d.h - 1; y += 3) R(c, d.x + 2, y, d.w - 4, 1, 0x2c3430);
      R(c, d.x, d.y, d.w, 1, 0x3aaa5a);
      R(c, d.x, d.y + d.h - 1, d.w, 1, 0x3aaa5a);
      R(c, d.x, d.y, 1, d.h, 0x3aaa5a);
      R(c, d.x + d.w - 1, d.y, 1, d.h, 0x3aaa5a);
      break;
    }
  }
}

// ── 벽: 난간 너머 밤의 도시 ──

export type RfWindow = { x: number; y: number; col: Color; k: number };
export type RfSkyline = { windows: RfWindow[]; neon: { x: number; y: number; w: number; h: number; col: Color }[] };

/** 방 종류 v의 도시 (벽 그림과 실행부의 창문 불빛이 같은 값을 쓴다) */
export function rfSkyline(v: number): RfSkyline {
  const windows: RfWindow[] = [];
  const neon: RfSkyline["neon"] = [];
  let x = -4;
  let k = 0;
  const salt = 500 + v * 13;
  while (x < AW) {
    const w = 12 + Math.floor(hash2(k, 1, salt) * 24);
    const h = 6 + Math.floor(hash2(k, 2, salt) * 15);
    const top = 21 - h;
    for (let yy = top + 2; yy < 20; yy += 3) for (let xx = x + 2; xx < x + w - 2; xx += 3) if (hash2(xx, yy, salt) < 0.45) windows.push({ x: xx, y: yy, col: hash2(xx, yy, salt + 1) < 0.7 ? 0xffd890 : 0x9ad8ff, k: hash2(xx, yy, salt + 2) });
    if (hash2(k, 3, salt) < 0.28 && w > 18) neon.push({ x: x + 3, y: top + 2, w: w - 6, h: 2, col: NEON[Math.floor(hash2(k, 4, salt) * NEON.length)] });
    x += w + 1;
    k++;
  }
  return { windows, neon };
}

export function rooftopWall(c: Ctx, l: { variant: number }): void {
  // 밤하늘 (위가 짙다) + 낮게 깔린 비구름
  for (let y = 0; y < 22; y++) R(c, 0, y, AW, 1, mix(0x0c0e1c, 0x2a2440, y / 22));
  const snowy = paintSnowy();
  for (let k = 0; k < 40; k++) E(c, hash2(k, 1, 91 + l.variant) * AW, 2 + hash2(k, 2, 91) * 8, 18 + hash2(k, 3, 91) * 20, 3, snowy ? 0x3a3e56 : 0x2a2c44, 0.5);
  // 도시 건물 실루엣 (불 꺼진 창 — 켜진 창은 실행부가 깜빡인다)
  let x = -4;
  let k = 0;
  const salt = 500 + l.variant * 13;
  while (x < AW) {
    const w = 12 + Math.floor(hash2(k, 1, salt) * 24);
    const h = 6 + Math.floor(hash2(k, 2, salt) * 15);
    const top = 21 - h;
    const body = mix(0x10121c, 0x1c1e2c, hash2(k, 5, salt));
    R(c, x, top, w, h + 1, body);
    R(c, x, top, w, 1, lighten(body, 0.12));
    if (hash2(k, 6, salt) < 0.3) R(c, x + Math.floor(w / 2), top - 3, 1, 3, 0x3a3e4a);
    // 겨울: 지붕에 쌓인 눈 (밤이라 푸르스름하게)
    if (snowy) for (let xx = x; xx < x + w; xx++) R(c, xx, top - (hash2(xx, k, salt + 3) < 0.3 ? 1 : 0), 1, 1 + (hash2(xx, k, salt + 4) < 0.5 ? 1 : 0), hash2(xx, 1, salt + 5) < 0.6 ? 0xb8c6d8 : 0x9aaac0);
    for (let yy = top + 2; yy < 20; yy += 3) for (let xx = x + 2; xx < x + w - 2; xx += 3) R(c, xx, yy, 1, 1, 0x1a1c28);
    x += w + 1;
    k++;
  }
  // 난간: 쇠 손잡이 줄 + 기둥, 아래 콘크리트 턱
  R(c, 0, 16, AW, 1, 0x5a6270);
  R(c, 0, 17, AW, 1, 0x2a2e36);
  for (let xx = 4; xx < AW; xx += 16) R(c, xx, 16, 1, 6, 0x4a525e);
  R(c, 0, 21, AW, TOP - 21, 0x3a3e44);
  R(c, 0, 21, AW, 1, 0x6a7078);
  R(c, 0, 22, AW, 1, 0x50565e);
  for (let xx = 0; xx < AW; xx += 2) if (hash2(xx, 9, 61) < 0.35) R(c, xx, 23 + Math.floor(hash2(xx, 8, 61) * 6), 1, 2, 0x2e3238);
  if (snowy) {
    // 겨울: 난간 손잡이·콘크리트 턱 위 눈, 턱 아래 고드름
    for (let xx = 0; xx < AW; xx++) {
      R(c, xx, 15, 1, 1, hash2(xx, 2, 63) < 0.7 ? 0xdce6f0 : 0xb8c6d8);
      R(c, xx, 20 - (hash2(xx, 3, 63) < 0.25 ? 1 : 0), 1, 2 + (hash2(xx, 3, 63) < 0.25 ? 1 : 0), hash2(xx, 4, 63) < 0.6 ? 0xe6edf3 : 0xcad6e2);
    }
    for (let xx = 2; xx < AW; xx += 5) R(c, xx + Math.floor(hash2(xx, 5, 63) * 3), 23, 1, 1 + Math.floor(hash2(xx, 6, 63) * 3), 0xc4e0ee, 0.85);
    return;
  }
  // 빗물 자국
  for (let xx = 3; xx < AW; xx += 7) R(c, xx, 23, 1, 2 + Math.floor(hash2(xx, 4, 62) * 5), 0x30363e);
}

export const RF_SIDE: Color = 0x30353c;

// ── 소품 그림 (art.ts PROPS에 펼쳐 넣는다) ──

type PropPaint = (c: Ctx, w: number, h: number, v: number) => void;

const LEAF = [0x2a6a3a, 0x3a8a3a, 0x2a5a4a, 0x4a7a2a] as const;

export const RF_PROPS: Record<string, PropPaint> = {
  // 콘크리트 화단 상자: 흙 + 젖은 콘크리트 (덤불은 rf_shrub가 따로)
  rf_planter_box(c, w, h, v) {
    R(c, 0, 6, w, 7, 0x6a7072);
    R(c, 0, 6, w, 1, 0x9aa0a2);
    R(c, 3, 8, w - 6, 4, 0x2a1e14);
    for (let k = 0; k < 14; k++) R(c, 4 + hash2(k, v, 3) * (w - 8), 8 + hash2(k, 2, v) * 3, 2, 1, 0x3a2a1c);
    R(c, 0, 13, w, h - 13, 0x5a6062);
    for (let x = 0; x < w; x += 14) R(c, x, 13, 1, h - 13, 0x4a5052);
    for (let k = 0; k < 8; k++) R(c, 2 + hash2(k, 5, v) * (w - 4), 14, 1, 3 + hash2(k, 6, v) * 8, 0x3e4446);
    R(c, 0, h - 2, w, 2, 0x2a2e30);
  },
  // 덤불·꽃·억새·작은 야자 (밑 12칸은 비어 있다 — 화단 흙 높이에 서서 흔들린다)
  rf_shrub(c, w, h, v) {
    const cx = w / 2;
    const base = h - 14;
    const leaf = LEAF[v % LEAF.length];
    if (v % 4 === 0) {
      E(c, cx, base - 6, 11, 8, darken(leaf, 0.2));
      E(c, cx - 1, base - 7, 10, 7, leaf);
      for (let k = 0; k < 18; k++) R(c, cx - 9 + hash2(k, 1, v) * 18, base - 13 + hash2(k, 2, v) * 12, 2, 1, lighten(leaf, 0.25));
    } else if (v % 4 === 1) {
      E(c, cx, base - 5, 12, 6, darken(leaf, 0.15));
      for (let k = 0; k < 14; k++) {
        const fx = cx - 10 + hash2(k, 3, v) * 20;
        const fy = base - 10 + hash2(k, 4, v) * 8;
        R(c, fx, fy, 2, 2, [0xe84a6a, 0xf0d040, 0xf2f2f2][k % 3]);
      }
    } else if (v % 4 === 2) {
      for (let k = 0; k < 9; k++) {
        const bx = cx - 8 + k * 2;
        const top = base - 10 - Math.floor(hash2(k, 5, v) * 8);
        for (let y = top; y < base; y++) R(c, bx + Math.round((y - top) * 0.1 * (k % 2 ? 1 : -1)), y, 1, 1, k % 3 ? 0x8a9a4a : 0xb0a060);
      }
    } else {
      R(c, cx - 1, base - 12, 2, 12, 0x5a4028);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.55;
        for (let i = 0; i < 9; i++) R(c, cx + Math.cos(a) * i, base - 12 + Math.sin(a) * i + i * i * 0.06, 2, 1, k % 2 ? leaf : lighten(leaf, 0.2));
      }
    }
  },
  // 테라코타 화분 + 작은 나무
  rf_pot(c, w, h, v) {
    const cx = w / 2;
    R(c, cx - 7, h - 10, 14, 9, 0xb05a32);
    R(c, cx - 8, h - 11, 16, 2, 0xd07040);
    R(c, cx - 6, h - 2, 12, 2, 0x7a3a20);
    R(c, cx - 7, h - 8, 2, 6, 0xc86a3e);
    const leaf = LEAF[(v + 1) % LEAF.length];
    R(c, cx - 1, h - 20, 2, 10, 0x5a4028);
    E(c, cx, h - 21, 8, 7, darken(leaf, 0.2));
    E(c, cx - 1, h - 22, 7, 6, leaf);
    for (let k = 0; k < 10; k++) R(c, cx - 6 + hash2(k, 1, v + 9) * 12, h - 27 + hash2(k, 2, v + 9) * 10, 1, 1, lighten(leaf, 0.3));
  },
  // 나무 벤치 (젖어서 번들거린다)
  rf_bench(c, w, h) {
    R(c, 2, 10, 2, 6, 0x2a2e34);
    R(c, w - 4, 10, 2, 6, 0x2a2e34);
    for (let k = 0; k < 3; k++) {
      R(c, 0, 4 + k * 3, w, 2, k === 1 ? 0x7a5432 : 0x6a4a2c);
      R(c, 0, 4 + k * 3, w, 1, 0x9a7a54);
    }
    R(c, 0, 0, w, 2, 0x5a3e24);
    R(c, 0, 0, w, 1, 0x8a6a48);
    for (let x = 3; x < w; x += 7) R(c, x, 5, 2, 1, 0xc8d8f0, 0.5);
  },
  // 실외기: 베이지 상자 + 큰 팬 망 + 옆 통풍 칸
  rf_ac(c, w, h, v) {
    R(c, 1, 4, w - 2, h - 5, 0xd0ccc0);
    R(c, 1, 4, w - 2, 2, 0xeeeae0);
    R(c, w - 3, 4, 2, h - 5, 0xa8a498);
    const cx = 11;
    const cy = 16;
    E(c, cx, cy, 8, 8, 0x3a3e44);
    E(c, cx, cy, 7, 7, 0x22262c);
    for (let r = 2; r <= 7; r += 2) for (let k = 0; k < 24; k++) R(c, cx + Math.cos(k / 3.8) * r, cy + Math.sin(k / 3.8) * r, 1, 1, 0x6a707a);
    R(c, cx - 1, cy - 1, 2, 2, 0x8a929c);
    for (let y = 9; y < h - 4; y += 2) R(c, 21, y, 6, 1, 0x8a867c);
    R(c, 3, h - 3, w - 6, 2, 0x5a5850);
    if (v % 2) R(c, 22, 6, 4, 2, 0x3a5aa8);
    for (let k = 0; k < 6; k++) R(c, 2 + hash2(k, v, 7) * (w - 4), 6 + hash2(k, 2, v) * (h - 10), 1, 2, 0x8a7a5a, 0.6);
  },
  // 물탱크: 쇠 다리 넷 + 둥근 탱크(띠·사다리) + 원뿔 지붕
  rf_tank(c, w, h) {
    const cx = w / 2;
    for (const lx of [8, 24, w - 25, w - 9]) R(c, lx, h - 34, 3, 32, 0x3a3e46);
    R(c, 8, h - 20, w - 16, 2, 0x4a4e56);
    for (let k = 0; k < 4; k++) {
      R(c, 10 + k * 15, h - 33 + (k % 2) * 6, 15, 1, 0x4a4e56);
    }
    R(c, 6, h - 3, 6, 3, 0x2a2e34);
    R(c, w - 12, h - 3, 6, 3, 0x2a2e34);
    const ty = 18;
    R(c, 4, ty, w - 8, 44, 0x5a7088);
    for (let x = 4; x < w - 4; x += 1) {
      const t = (x - 4) / (w - 8);
      const lit = 1 - Math.abs(t - 0.35) * 1.6;
      R(c, x, ty, 1, 44, mix(0x34485c, 0x8aa4bc, Math.max(0, lit)));
    }
    for (const yy of [ty + 6, ty + 20, ty + 34]) R(c, 4, yy, w - 8, 2, 0x2a3644);
    E(c, cx, ty + 44, w / 2 - 4, 4, 0x34485c);
    for (let y = 0; y < ty; y++) {
      const half = ((y + 1) / ty) * (w / 2 - 2);
      R(c, cx - half, y, half * 2, 1, mix(0x3a4a5a, 0x6a8094, y / ty));
    }
    R(c, cx - 2, 0, 4, 3, 0x2a3644);
    // 사다리
    R(c, w - 18, ty - 2, 1, 60, 0x2a2e34);
    R(c, w - 13, ty - 2, 1, 60, 0x2a2e34);
    for (let y = ty; y < ty + 58; y += 4) R(c, w - 18, y, 6, 1, 0x4a4e56);
    // 새는 자국 (녹물)
    for (let y = ty + 44; y < h - 6; y++) R(c, 30 + Math.round(Math.sin(y / 3)), y, 1, 1, 0x6ab0d8, 0.7);
    R(c, 14, ty + 10, 10, 6, 0xe8e0c8);
    R(c, 15, ty + 11, 8, 4, 0x3a5a8a);
  },
  // 가로등
  rf_lamp(c, w, h) {
    const cx = w / 2;
    R(c, cx - 1, 6, 2, h - 8, 0x2a2e34);
    R(c, cx - 3, h - 3, 6, 3, 0x1a1e24);
    R(c, cx - 4, 0, 8, 3, 0x3a3e46);
    R(c, cx - 3, 3, 6, 4, 0xfff0c0);
    R(c, cx - 2, 4, 4, 2, 0xffffff);
  },
  // 유리 흡연 부스: 지붕판 + 반투명 유리 + 안쪽 벤치·재떨이
  rf_shelter(c, w, h) {
    R(c, 2, 8, w - 4, h - 10, 0x9ad0e8, 0.18);
    R(c, 6, h - 16, w - 12, 4, 0x6a4a2c);
    R(c, w / 2 - 2, h - 20, 4, 8, 0x5a6068);
    for (const x of [2, w / 2, w - 4]) R(c, x, 6, 2, h - 8, 0x4a525a);
    R(c, 0, 2, w, 6, 0x3a4048);
    R(c, 0, 2, w, 1, 0x6a727a);
    R(c, 0, 7, w, 1, 0x22262c);
    for (let k = 0; k < 4; k++) R(c, 8 + k * 16, 12, 1, h - 26, 0xd8f4ff, 0.35);
    // 금연 아닌 「흡연」 표지 (빨간 동그라미 + 담배)
    E(c, 12, 18, 4, 4, 0xd83a3a);
    E(c, 12, 18, 3, 3, 0xf2f2f2);
    R(c, 10, 18, 5, 1, 0x3a3a3a);
    R(c, 15, 18, 1, 1, 0xff7a2a);
    R(c, 0, h - 2, w, 2, 0x2a2e34);
  },
  // 음료 자판기
  rf_vending(c, w, h, v) {
    R(c, 0, 0, w, h, v % 2 ? 0x2a5aa8 : 0xc83a3a);
    R(c, 0, 0, w, 1, 0xffffff, 0.4);
    R(c, 2, 3, w - 4, 18, 0xd8f0ff);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) R(c, 3 + x * 4, 5 + y * 6, 3, 4, [0xe84a3a, 0x3a8ae8, 0xf0d040, 0x3ac87a][(x + y + v) % 4]);
    R(c, 3, 24, w - 6, 6, 0x1a1a1a);
    R(c, w - 6, 24, 3, 2, 0x3aff6a);
    R(c, 0, h - 2, w, 2, 0x1a1a1a);
  },
  rf_ashtray(c, w, h) {
    R(c, w / 2 - 1, 4, 2, h - 5, 0x5a6068);
    R(c, 0, 2, w, 3, 0x8a929c);
    R(c, 1, 2, w - 2, 1, 0x2a2a2a);
    R(c, w / 2 - 2, h - 2, 4, 2, 0x3a3e46);
    R(c, 2, 1, 2, 1, 0xd8d8c8);
  },
  // 텃밭 상자: 나무 틀 + 흙 + 상추 줄 + 지지대
  rf_bed(c, w, h, v) {
    R(c, 0, 4, w, h - 4, 0x6a4a2c);
    R(c, 0, 4, w, 1, 0x8a6a48);
    R(c, 2, 5, w - 4, 6, 0x2a1e14);
    for (let k = 0; k < 5; k++) {
      const x = 4 + k * 9;
      const kind = (v + k) % 3;
      if (kind === 0) {
        E(c, x + 2, 6, 4, 3, 0x5ab04a);
        R(c, x + 1, 5, 2, 1, 0x8ad86a);
      } else if (kind === 1) {
        R(c, x + 1, 1, 1, 8, 0x8a6a48);
        E(c, x + 2, 4, 3, 3, 0x3a8a3a);
        R(c, x + 3, 5, 2, 2, 0xd83a2a);
      } else for (let i = 0; i < 4; i++) R(c, x + i, 2 + (i % 2), 1, 7, 0x4a9a3a);
    }
    for (let x = 0; x < w; x += 11) R(c, x, 11, 1, h - 11, 0x4a3420);
    R(c, 0, h - 2, w, 2, 0x3a2a1a);
  },
  // 공구 창고 (골함석)
  rf_shed(c, w, h) {
    R(c, 1, 8, w - 2, h - 8, 0x6a7a6a);
    for (let x = 2; x < w - 2; x += 3) R(c, x, 8, 1, h - 10, 0x5a6a5a);
    R(c, 0, 4, w, 5, 0x8a3a2a);
    R(c, 0, 4, w, 1, 0xaa5a4a);
    R(c, w / 2 - 6, h - 20, 12, 18, 0x3a4a3a);
    R(c, w / 2 + 3, h - 12, 2, 2, 0xd8c040);
    R(c, 4, 14, 8, 6, 0x9ad8ff, 0.5);
    R(c, 0, h - 2, w, 2, 0x2a2e2a);
  },
  // 허수아비 (비닐 우비)
  rf_scarecrow(c, w, h) {
    const cx = w / 2;
    R(c, cx - 1, 8, 2, h - 8, 0x6a4a2c);
    R(c, 1, 12, w - 2, 2, 0x6a4a2c);
    R(c, cx - 5, 12, 10, 12, 0xe8d040);
    R(c, cx - 5, 12, 10, 1, 0xfff07a);
    E(c, cx, 7, 4, 4, 0xd8c8a0);
    R(c, cx - 6, 2, 12, 2, 0x8a6a3a);
    R(c, cx - 3, 0, 6, 3, 0x8a6a3a);
    R(c, cx - 2, 7, 1, 1, 0x1a1a1a);
    R(c, cx + 1, 7, 1, 1, 0x1a1a1a);
  },
  // 바람 자루 기둥 (자루는 실행부가 바람 따라 그린다)
  rf_pole(c, w, h) {
    R(c, w / 2 - 1, 2, 2, h - 3, 0xc8ccd4);
    for (let y = 6; y < h - 2; y += 8) R(c, w / 2 - 1, y, 2, 4, 0xe84a3a);
    R(c, 0, 0, w, 3, 0x5a6068);
    R(c, w / 2 - 2, h - 2, 4, 2, 0x2a2e34);
  },
  // 네온 간판 뒷면: 쇠 격자 뼈대 + 패널 뒤판 + 새어 나오는 네온 관
  rf_sign(c, w, h) {
    R(c, 4, 2, w - 8, h - 20, 0x1a1c24);
    for (let x = 4; x < w - 4; x += 30) R(c, x, 2, 28, h - 20, 0x20232c);
    R(c, 4, 2, w - 8, 2, 0xff4ab0, 0.8);
    R(c, 4, 4, w - 8, 1, 0xff8ad0, 0.4);
    for (let x = 4; x < w - 4; x += 15) R(c, x, 2, 2, h - 6, 0x3a3e46);
    for (let y = 10; y < h - 18; y += 14) R(c, 4, y, w - 8, 2, 0x3a3e46);
    for (let x = 4; x + 15 < w - 4; x += 15) {
      for (let i = 0; i < 14; i++) {
        R(c, x + i, 10 + i, 1, 1, 0x2e3238);
        R(c, x + 14 - i, 24 + i, 1, 1, 0x2e3238);
      }
    }
    for (let k = 0; k < 6; k++) R(c, 14 + k * 28, 6, 12, 2, [0x4ad8ff, 0xff4ab0, 0xffd04a][k % 3], 0.6);
    R(c, 0, h - 16, w, 4, 0x4a4e56);
    R(c, 0, h - 16, w, 1, 0x7a808a);
    for (let x = 0; x < w; x += 4) R(c, x, h - 12, 1, 10, 0x3a3e46);
    R(c, 0, h - 3, w, 3, 0x22262c);
  },
  // 작은 피뢰침 (구리 접지선)
  rf_rod(c, w, h) {
    const cx = w / 2;
    R(c, cx - 5, h - 6, 10, 6, 0x5a6068);
    R(c, cx - 5, h - 6, 10, 1, 0x8a929c);
    R(c, cx - 1, 6, 2, h - 12, 0x9aa0a8);
    R(c, cx, 6, 1, h - 12, 0xd8dce4);
    for (let y = 0; y < 6; y++) R(c, cx - Math.floor((6 - y) / 3), y, 1 + Math.floor((6 - y) / 3) * 0, 1, 0xd8dce4);
    R(c, cx - 3, 14, 6, 2, 0x8a6a2a);
    R(c, cx + 2, 16, 1, h - 22, 0xb07a3a);
    E(c, cx, 3, 1.5, 3, 0xfff06a);
  },
};
