import { css, darken, hash2, lighten, mix, type Color } from "../../sprites/pixel";
import { settleSpawns } from "./spawnFix";
import { blockRoom } from "@/lib/rpg/towerSchedule";
import { EX_BOSS_ROOM, EX_ROOM_SALT, EX_ROOMS } from "@/lib/rpg/towerThemes/exec";

// 11/15 임원층 지도: 방 일곱 가지 + 대표이사실 배치(layout.ts MAKE가 부른다) + 바닥·벽·소품 그림(arena/art.ts가 부른다). Phaser 없음.
// 벽이 높다 (EX_TOP까지 나무 벽판·통유리창·초상화) — 창밖 하늘·도시 불빛·샹들리에·스포트라이트는 execStage.ts가 그 위에 그린다.
// 바닥 그림은 (테마, 방 번호)마다 한 장으로 캐시되므로 방 번호와 바닥 무늬(decal)로만 그린다.

const AW = 448;
const AH = 288;
const SIDE = 10;
/** 벽 아래 끝 — 여기서부터 걸을 수 있다 */
export const EX_TOP = 50;

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
function frame(c: Ctx, x: number, y: number, w: number, h: number, col: Color, a = 1): void {
  R(c, x, y, w, 1, col, a);
  R(c, x, y + h - 1, w, 1, col, a);
  R(c, x, y, 1, h, col, a);
  R(c, x + w - 1, y, 1, h, col, a);
}

// ── 방 ──

export const EX_ROOM_NAMES = ["비서실", "트로피 복도", "임원 라운지", "이사회실", "임원 집무실", "골프 연습실", "VIP 응접실", "대표이사실"] as const;

/** 판 시드·층 → 방 번호 (블록의 보통 층 넷은 서로 다른 방, 우두머리 층은 대표이사실) */
export function exRoom(runSeed: number, f: number): number {
  const k = blockRoom(runSeed, f, EX_ROOMS, EX_ROOM_SALT);
  return k < 0 ? EX_BOSS_ROOM : k;
}

/** 벽의 통유리창 (방마다) — 실행부가 창밖 하늘·도시를 그 안에 그린다 */
export function exWindows(v: number): { x: number; y: number; w: number; h: number }[] {
  switch (v) {
    case 0:
      return [{ x: 250, y: 8, w: 170, h: 34 }];
    case 1:
      return [];
    case 2:
      return [{ x: 150, y: 6, w: 280, h: 38 }];
    case 3:
      return [
        { x: 24, y: 8, w: 110, h: 34 },
        { x: 314, y: 8, w: 110, h: 34 },
      ];
    case 4:
      return [{ x: 130, y: 6, w: 188, h: 38 }];
    case 5:
      return [{ x: 18, y: 6, w: 412, h: 38 }];
    case 6:
      return [{ x: 24, y: 8, w: 150, h: 34 }];
    default:
      return [{ x: 18, y: 4, w: 412, h: 42 }];
  }
}

/** 벽에 걸린 초상화 자리 (액자 속 초상화가 옮겨 다니는 곳이기도 하다) */
export function exPortraitSpots(v: number): Pt[] {
  const wins = exWindows(v);
  const out: Pt[] = [];
  for (const x of [60, 120, 190, 258, 328, 390]) if (!wins.some((w) => x > w.x - 14 && x < w.x + w.w + 14)) out.push({ x, y: 26 });
  return out;
}

/** 샹들리에 자리 (천장 — 실행부가 그린다) */
export function exChandeliers(v: number): Pt[] {
  if (v === EX_BOSS_ROOM) return [{ x: 112, y: 82 }, { x: AW / 2, y: 70 }, { x: AW - 112, y: 82 }];
  if (v === 1) return [{ x: 112, y: 70 }, { x: AW / 2, y: 70 }, { x: AW - 112, y: 70 }];
  if (v === 5) return [{ x: 150, y: 72 }, { x: 300, y: 72 }];
  return [{ x: AW / 2 - 90, y: 72 }, { x: AW / 2 + 90, y: 72 }];
}

/** layout.ts Builder 중 여기서 쓰는 것 */
type B = {
  start: Pt;
  prop(kind: string, x: number, y: number, extra?: { flip?: boolean; v?: number }): B;
  decal(kind: string, x: number, y: number, w: number, h: number, v?: number): B;
  light(x: number, y: number, r: number, color: number, flicker?: boolean): B;
  spawn(...pts: [number, number][]): B;
  solids: ({ t: "r"; x: number; y: number; w: number; h: number } | { t: "c"; x: number; y: number; r: number })[];
  spawns: { x: number; y: number }[];
  block(x: number, y: number, w: number, h: number): B;
};

const Rs = (dx: number, dy: number, w: number, h: number) => ({ t: "r" as const, dx, dy, w, h });
const Cs = (dx: number, dy: number, r: number) => ({ t: "c" as const, dx, dy, r });

/** 소품 크기·충돌 (layout.ts PROP_META에 펼쳐 넣는다). 발밑 띠만 막는다 */
export const EX_PROP_META = {
  ex_sec_desk: { w: 58, h: 32, solid: Rs(-28, -13, 56, 12) },
  ex_trophy_case: { w: 34, h: 48, solid: Rs(-16, -12, 32, 11) },
  ex_sofa: { w: 52, h: 26, solid: Rs(-25, -12, 50, 11) },
  ex_armchair: { w: 22, h: 24, solid: Cs(0, -6, 8) },
  ex_coffee_table: { w: 38, h: 16, solid: Rs(-18, -9, 36, 8) },
  ex_bar: { w: 92, h: 40, solid: Rs(-45, -14, 90, 13) },
  ex_board_table: { w: 156, h: 38, solid: Rs(-76, -22, 152, 20) },
  ex_exec_desk: { w: 82, h: 36, solid: Rs(-40, -14, 80, 13) },
  ex_bookshelf: { w: 50, h: 58, solid: Rs(-24, -12, 48, 11) },
  ex_flag: { w: 14, h: 34 },
  ex_bonsai_stand: { w: 20, h: 28, solid: Rs(-8, -8, 16, 7) },
  ex_ceo_desk: { w: 124, h: 46, solid: Rs(-60, -16, 120, 15) },
  ex_pillar: { w: 20, h: 70, solid: Cs(0, -5, 8) },
  ex_plant: { w: 18, h: 34, solid: Cs(0, -4, 6) },
  ex_globe: { w: 18, h: 28, solid: Cs(0, -4, 6) },
  ex_piano: { w: 60, h: 40, solid: Rs(-28, -16, 56, 15) },
  ex_lamp: { w: 12, h: 38, solid: Cs(0, -2, 3) },
  ex_conf_chair: { w: 14, h: 18 },
  ex_golf_bag: { w: 14, h: 30, solid: Cs(0, -3, 5) },
};

const EDGE: [number, number][] = [
  [30, 70],
  [AW - 30, 70],
  [30, AH - 22],
  [AW - 30, AH - 22],
  [AW / 2, AH - 18],
  [26, 170],
  [AW - 26, 170],
];

/** 방 종류 v의 배치 */
export function execLayout(b: B, v: number, seed: number): void {
  // 높은 벽 (나무 벽판·창)
  b.block(0, 24, AW, EX_TOP - 24);
  const jit = (k: number, n: number) => Math.round((hash2(k, seed & 0xffff, 31) - 0.5) * n);
  const warm = 0xffe0a8;
  switch (v) {
    // 비서실: 마주 보는 비서 책상 둘, 대기 소파, 트로피 장식장, 화분
    case 0: {
      b.decal("ex_rug", 150, 104, 148, 60, 0);
      b.prop("ex_sec_desk", 150 + jit(1, 12), 130).prop("ex_sec_desk", 298 + jit(2, 12), 130, { flip: true, v: 1 });
      b.prop("ex_conf_chair", 150, 146, { v: 1 }).prop("ex_conf_chair", 298, 146, { v: 1 });
      b.prop("ex_sofa", 96, 252).prop("ex_coffee_table", 96, 228);
      b.prop("ex_armchair", 150, 246).prop("ex_plant", 36, 72).prop("ex_plant", AW - 36, 72);
      b.prop("ex_trophy_case", 210, 74, { v: 0 }).prop("ex_trophy_case", AW - 90, 248, { v: 1 });
      b.prop("ex_lamp", AW - 40, 250);
      b.start = { x: AW / 2, y: 210 };
      break;
    }
    // 트로피 복도: 위아래로 유리 장식장, 가운데 붉은 카펫
    case 1: {
      b.decal("ex_runner", SIDE, 146, AW - SIDE * 2, 34, 1);
      for (const [x, i] of [[60, 0], [130, 1], [200, 2], [270, 3], [340, 4], [400, 5]] as const) b.prop("ex_trophy_case", x, 84, { v: i });
      for (const [x, i] of [[96, 6], [180, 7], [268, 8], [352, 9]] as const) b.prop("ex_trophy_case", x + jit(i, 10), 262, { v: i });
      b.prop("ex_pillar", 30, 128).prop("ex_pillar", AW - 30, 128).prop("ex_plant", 30, 270).prop("ex_plant", AW - 30, 270);
      b.start = { x: AW / 2, y: 164 };
      break;
    }
    // 임원 라운지: 바 카운터, 소파 둘과 안락의자, 피아노
    case 2: {
      b.decal("ex_rug", 170, 150, 160, 92, 2);
      b.prop("ex_bar", 74, 66);
      b.prop("ex_sofa", 250, 160 + jit(3, 8)).prop("ex_sofa", 250, 248, { flip: true, v: 1 }).prop("ex_coffee_table", 250, 206);
      b.prop("ex_armchair", 196, 210).prop("ex_armchair", 306, 210, { flip: true });
      b.prop("ex_piano", 380, 140).prop("ex_lamp", 420, 250).prop("ex_plant", 34, 250).prop("ex_plant", 150, 60);
      b.start = { x: 120, y: 200 };
      break;
    }
    // 이사회실: 긴 회의 테이블, 양쪽 의자, 벽쪽 책장
    case 3: {
      b.decal("ex_rug", 112, 118, 224, 104, 3);
      b.prop("ex_board_table", AW / 2, 184 + jit(4, 8));
      for (let i = 0; i < 6; i++) {
        const x = AW / 2 - 64 + i * 25.6;
        b.prop("ex_conf_chair", x, 160, { v: 0 }).prop("ex_conf_chair", x, 204, { v: 1 });
      }
      b.prop("ex_conf_chair", AW / 2 - 90, 182, { v: 2 }).prop("ex_conf_chair", AW / 2 + 90, 182, { v: 2, flip: true });
      b.prop("ex_bookshelf", 190, 64).prop("ex_bookshelf", 258, 64);
      b.prop("ex_plant", 30, 270).prop("ex_plant", AW - 30, 270).prop("ex_globe", 30, 120);
      b.start = { x: AW / 2, y: 252 };
      break;
    }
    // 임원 집무실: 큰 책상 + 안락의자, 책장 셋, 지구본, 아래 응접 소파
    case 4: {
      b.decal("ex_rug", 150, 196, 148, 68, 4);
      b.prop("ex_exec_desk", AW / 2 + jit(5, 20), 112).prop("ex_armchair", AW / 2, 86);
      b.prop("ex_bookshelf", 54, 64).prop("ex_bookshelf", AW - 54, 64);
      b.prop("ex_globe", 112, 120).prop("ex_lamp", AW - 110, 112);
      b.prop("ex_sofa", AW / 2, 256).prop("ex_coffee_table", AW / 2, 236).prop("ex_armchair", 146, 232).prop("ex_armchair", 302, 232, { flip: true });
      b.prop("ex_plant", 30, 270).prop("ex_plant", AW - 30, 270);
      b.start = { x: AW / 2, y: 172 };
      break;
    }
    // 골프 연습실: 퍼팅 그린, 깃발, 골프 가방, 분재대
    case 5: {
      b.decal("ex_green", 92, 112, 264, 128, 5);
      b.prop("ex_flag", 300 + jit(6, 20), 160).prop("ex_golf_bag", 40, 120).prop("ex_golf_bag", 54, 132);
      b.prop("ex_bonsai_stand", AW - 36, 100).prop("ex_bonsai_stand", AW - 36, 230).prop("ex_armchair", 40, 250).prop("ex_coffee_table", 70, 262);
      b.prop("ex_plant", 210, 270).prop("ex_lamp", 360, 262);
      b.start = { x: 150, y: 180 };
      break;
    }
    // VIP 응접실: 피아노, ㄷ자 소파, 분재, 큰 깔개
    case 6: {
      b.decal("ex_rug", 112, 130, 224, 120, 6);
      b.prop("ex_sofa", AW / 2, 150).prop("ex_sofa", AW / 2, 262, { flip: true, v: 1 }).prop("ex_coffee_table", AW / 2, 206);
      b.prop("ex_armchair", 150, 206).prop("ex_armchair", 298, 206, { flip: true });
      b.prop("ex_piano", 376, 96).prop("ex_bonsai_stand", 40, 100).prop("ex_plant", 30, 270).prop("ex_plant", AW - 30, 270);
      b.prop("ex_trophy_case", 254, 74, { v: 3 }).prop("ex_lamp", 100, 140);
      b.start = { x: 96, y: 210 };
      break;
    }
    // 대표이사실: 큰 책상, 대리석 기둥 넷, 금빛 사훈 바닥, 붉은 카펫
    default: {
      b.decal("ex_runner", AW / 2 - 26, 110, 52, AH - SIDE - 110, 7);
      b.decal("ex_seal", AW / 2 - 50, 140, 100, 64, 7);
      b.prop("ex_ceo_desk", AW / 2, 98);
      for (const [x, y] of [[96, 120], [AW - 96, 120], [96, 236], [AW - 96, 236]] as const) b.prop("ex_pillar", x, y);
      b.prop("ex_plant", 30, 270).prop("ex_plant", AW - 30, 270).prop("ex_globe", 40, 120).prop("ex_lamp", AW - 40, 120);
      b.start = { x: AW / 2, y: 252 };
      break;
    }
  }
  for (const p of exChandeliers(v)) b.light(p.x, p.y + 50, 54, warm);
  b.light(AW / 2, 230, 50, 0xfff0d0);
  b.spawn(...EDGE);
  // 11/15 소품·벽에 걸린 출현 지점은 안쪽으로, 아래 두 모서리 화분 뒤 빈틈은 막는다 (갇히는 구석 없게)
  b.block(SIDE, AH - SIDE - 14, 12, 14).block(AW - SIDE - 12, AH - SIDE - 14, 12, 14);
  settleSpawns(b);
}

// ── 바닥 ──

type Decal = { kind: string; x: number; y: number; w: number; h: number; v?: number };

/** 방마다 바닥: 카펫(금빛 무늬)·대리석·마루 */
const FLOOR: { a: Color; b: Color; pat: Color; kind: "carpet" | "marble" | "parquet" }[] = [
  { a: 0x8a6a42, b: 0x84653e, pat: 0xb08a50, kind: "carpet" },
  { a: 0xd8d0c0, b: 0xc8c0b0, pat: 0xb0a898, kind: "marble" },
  { a: 0x6a4428, b: 0x5a3820, pat: 0x7a5232, kind: "parquet" },
  { a: 0x2a3050, b: 0x262c4a, pat: 0xb09048, kind: "carpet" },
  { a: 0x6a4428, b: 0x643f24, pat: 0x9a7040, kind: "carpet" },
  { a: 0x7a5432, b: 0x6a4628, pat: 0x8a6440, kind: "parquet" },
  { a: 0x5a1a22, b: 0x54181f, pat: 0xc09a48, kind: "carpet" },
  { a: 0x1e1e26, b: 0x1a1a22, pat: 0x3a3a46, kind: "marble" },
];

export function execFloor(c: Ctx, l: { variant: number; decals: readonly Decal[] }): void {
  const st = FLOOR[Math.max(0, Math.min(FLOOR.length - 1, l.variant))];
  if (st.kind === "carpet") {
    R(c, 0, 0, AW, AH, st.a);
    // 금빛 마름모 격자 + 가운데 꽃 점
    for (let y = 0; y < AH; y += 16)
      for (let x = 0; x < AW; x += 16) {
        const o = (y / 16) % 2 ? 8 : 0;
        for (let k = 0; k < 4; k++) {
          R(c, x + o + 8 - k, y + k, 1, 1, st.pat, 0.55);
          R(c, x + o + 8 + k, y + k, 1, 1, st.pat, 0.55);
          R(c, x + o + 8 - k, y + 8 - k, 1, 1, st.pat, 0.35);
          R(c, x + o + 8 + k, y + 8 - k, 1, 1, st.pat, 0.35);
        }
        R(c, x + o + 8, y + 4, 1, 1, lighten(st.pat, 0.3), 0.8);
      }
    c.fillStyle = css(st.b, 0.5);
    for (let k = 0; k < 900; k++) c.fillRect(Math.floor(hash2(k, 1, 51 + l.variant) * AW), Math.floor(hash2(k, 2, 51 + l.variant) * AH), 1, 1);
  } else if (st.kind === "marble") {
    const T = 32;
    for (let y = 0; y < AH; y += T)
      for (let x = 0; x < AW; x += T) {
        const alt = ((x + y) / T) % 2;
        R(c, x, y, T, T, alt ? st.a : st.b);
        // 대리석 결
        for (let k = 0; k < 3; k++) {
          let px = x + hash2(x, y + k, 7) * T;
          for (let j = 0; j < T; j += 2) {
            px += (hash2(px, y + j, 9) - 0.5) * 3;
            if (px > x && px < x + T) R(c, px, y + j, 1, 2, st.pat, 0.35);
          }
        }
        R(c, x, y, T, 1, darken(st.a, 0.25));
        R(c, x, y, 1, T, darken(st.a, 0.25));
        R(c, x + 1, y + 1, T - 2, 1, lighten(st.a, 0.15), 0.6);
      }
    // 반짝이는 반사
    for (let k = 0; k < 5; k++) R(c, 50 + k * 90, EX_TOP, 8, AH - EX_TOP, 0xffffff, l.variant === 7 ? 0.04 : 0.07);
  } else {
    // 마루: 엇갈려 깐 긴 판 (판마다 결이 조금씩 다르다)
    for (let y = 0; y < AH; y += 5) {
      const o = ((y / 5) % 4) * 7;
      for (let x = -28; x < AW; x += 28) {
        const col = mix(st.a, st.b, hash2(x, y, 41 + l.variant));
        R(c, x + o, y, 28, 5, col);
        R(c, x + o, y + 4, 28, 1, darken(st.a, 0.14));
        R(c, x + o, y, 1, 5, darken(st.a, 0.2));
        for (let k = 0; k < 3; k++) R(c, x + o + 3 + hash2(x + k, y, 5) * 20, y + 1 + (k % 3), 5, 1, st.pat, 0.35);
      }
    }
    // 윤기
    for (let k = 0; k < 4; k++) R(c, 70 + k * 110, EX_TOP, 10, AH - EX_TOP, 0xffe8c0, 0.05);
  }
  for (const d of l.decals) decal(c, d);
  // 벽 아래 그림자
  for (let i = 0; i < 8; i++) R(c, SIDE, EX_TOP + i, AW - SIDE * 2, 1, 0x000000, 0.32 - i * 0.04);
}

function decal(c: Ctx, d: Decal): void {
  const { x, y, w, h } = d;
  switch (d.kind) {
    case "ex_rug": {
      const pal: [Color, Color, Color][] = [
        [0x7a2a2a, 0xc8a050, 0x5a1e1e],
        [0x2a3a6a, 0xd8b860, 0x1e2a4a],
        [0x6a2a3a, 0xe0c070, 0x4a1a28],
        [0x1e3a3a, 0xc8a050, 0x14282a],
        [0x7a3a1a, 0xe8c878, 0x5a2a12],
        [0x3a2a5a, 0xd8b860, 0x261c3e],
        [0x8a6a3a, 0x5a1a22, 0x6a4e2a],
      ];
      const [m, g, dk] = pal[(d.v ?? 0) % pal.length];
      R(c, x, y, w, h, dk);
      R(c, x + 2, y + 2, w - 4, h - 4, m);
      frame(c, x + 4, y + 4, w - 8, h - 8, g);
      frame(c, x + 7, y + 7, w - 14, h - 14, g, 0.6);
      // 가운데 메달리온
      E(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.32, Math.min(w, h) * 0.22, dk);
      E(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.24, Math.min(w, h) * 0.16, g, 0.8);
      E(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.16, Math.min(w, h) * 0.1, m);
      for (let i = x + 10; i < x + w - 10; i += 6) {
        R(c, i, y + 9, 2, 2, g, 0.5);
        R(c, i, y + h - 11, 2, 2, g, 0.5);
      }
      // 술 장식
      for (let i = x + 2; i < x + w - 2; i += 3) {
        R(c, i, y - 2, 1, 2, 0xe8d8b0);
        R(c, i, y + h, 1, 2, 0xe8d8b0);
      }
      break;
    }
    case "ex_runner": {
      R(c, x, y, w, h, 0x7a1418);
      const hor = w > h;
      if (hor) {
        R(c, x, y + 2, w, 1, 0xd8b050);
        R(c, x, y + h - 3, w, 1, 0xd8b050);
        for (let i = x + 6; i < x + w; i += 14) R(c, i, y + h / 2 - 1, 4, 2, 0xa8303a);
      } else {
        R(c, x + 2, y, 1, h, 0xd8b050);
        R(c, x + w - 3, y, 1, h, 0xd8b050);
        for (let j = y + 6; j < y + h; j += 14) R(c, x + w / 2 - 2, j, 4, 3, 0xa8303a);
      }
      c.fillStyle = css(0x5a0e12, 0.5);
      for (let k = 0; k < (w * h) / 30; k++) c.fillRect(x + Math.floor(hash2(k, 3, 77) * w), y + Math.floor(hash2(k, 4, 77) * h), 1, 1);
      break;
    }
    case "ex_green": {
      // 퍼팅 그린: 둥근 잔디 + 결 줄무늬 + 구멍
      E(c, x + w / 2, y + h / 2, w / 2, h / 2, 0x2a5a2a);
      E(c, x + w / 2, y + h / 2, w / 2 - 3, h / 2 - 3, 0x3a8a3a);
      for (let j = 0; j < h; j += 8) {
        const t = (j + 4 - h / 2) / (h / 2);
        if (t * t >= 1) continue;
        const half = (w / 2 - 4) * Math.sqrt(1 - t * t);
        R(c, x + w / 2 - half, y + j, half * 2, 4, 0x48984a, 0.6);
      }
      c.fillStyle = css(0x2a6a2a, 0.5);
      for (let k = 0; k < 500; k++) {
        const a = hash2(k, 1, 5) * Math.PI * 2;
        const r = Math.sqrt(hash2(k, 2, 5));
        c.fillRect(Math.round(x + w / 2 + Math.cos(a) * r * (w / 2 - 4)), Math.round(y + h / 2 + Math.sin(a) * r * (h / 2 - 4)), 1, 1);
      }
      break;
    }
    case "ex_seal": {
      // 바닥 금빛 회사 문장 (원 + 별)
      E(c, x + w / 2, y + h / 2, w / 2, h / 2, 0xb08a40, 0.7);
      E(c, x + w / 2, y + h / 2, w / 2 - 3, h / 2 - 3, 0x1e1e26);
      E(c, x + w / 2, y + h / 2, w / 2 - 7, h / 2 - 6, 0xb08a40, 0.5);
      E(c, x + w / 2, y + h / 2, w / 2 - 10, h / 2 - 9, 0x16161c);
      const cx = x + w / 2;
      const cy = y + h / 2;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
        for (let r = 0; r < 18; r++) R(c, cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 0.9, 2, 1, 0xd8b050, 0.8);
      }
      break;
    }
  }
}

// ── 벽 (높은 나무 벽판·창틀·걸린 그림) ──

export function execWall(c: Ctx, l: { variant: number }): void {
  const v = l.variant;
  const wood = v === 7 ? 0x2a1a14 : v === 3 ? 0x3a2418 : 0x4a2e1a;
  R(c, 0, 0, AW, EX_TOP, wood);
  // 세로 벽판 (판마다 안쪽 테두리)
  for (let x = 0; x < AW; x += 32) {
    R(c, x + 3, 6, 26, EX_TOP - 12, lighten(wood, 0.06));
    frame(c, x + 3, 6, 26, EX_TOP - 12, darken(wood, 0.3));
    R(c, x + 4, 7, 24, 1, lighten(wood, 0.18));
    for (let y = 9; y < EX_TOP - 7; y += 3) R(c, x + 6 + hash2(x, y, 3) * 18, y, 6, 1, darken(wood, 0.12), 0.6);
  }
  // 위 몰딩·아래 걸레받이 (금빛 띠)
  R(c, 0, 0, AW, 4, darken(wood, 0.35));
  R(c, 0, 4, AW, 1, 0xc8a050);
  R(c, 0, EX_TOP - 5, AW, 5, darken(wood, 0.4));
  R(c, 0, EX_TOP - 6, AW, 1, 0xc8a050);
  // 통유리창 틀 (안은 실행부가 하늘·도시로 채운다)
  for (const w of exWindows(v)) {
    R(c, w.x - 3, w.y - 3, w.w + 6, w.h + 6, 0x1a1410);
    R(c, w.x - 2, w.y - 2, w.w + 4, w.h + 4, 0xb08a40);
    R(c, w.x, w.y, w.w, w.h, 0x10182a);
    for (let x = w.x + 46; x < w.x + w.w - 10; x += 48) R(c, x, w.y, 2, w.h, 0x2a2420);
    R(c, w.x, w.y + w.h - 2, w.w, 2, 0x2a2420);
  }
  // 걸린 금빛 액자 (빈 자리 몇 곳 — 나머지는 초상화 몬스터 몫)
  exPortraitSpots(v).forEach((p, i) => {
    if (i % 2) return;
    const fx = p.x - 9;
    R(c, fx, 10, 18, 22, 0xb08a40);
    R(c, fx + 1, 11, 16, 20, 0x8a6a2a);
    R(c, fx + 3, 13, 12, 16, [0x2a3a2a, 0x3a2a2a, 0x2a2a3a][i % 3]);
    // 풍경화 (산·해)
    R(c, fx + 3, 22, 12, 7, mix(0x3a5a3a, 0x5a4a2a, (i % 3) / 2));
    E(c, fx + 9, 22, 5, 3, 0x4a6a4a);
    R(c, fx + 11, 15, 2, 2, 0xe8c070);
    R(c, fx + 8, 8, 2, 2, 0xd8b050);
  });
  // 문 (왼쪽): 두 짝 나무문 + 금 손잡이 — 회장님 순시가 여기로 들어온다
  const dx = 18;
  if (!exWindows(v).some((w) => w.x < dx + 30)) {
    R(c, dx, 10, 28, EX_TOP - 10, 0x2a180e);
    R(c, dx + 2, 12, 11, EX_TOP - 13, 0x5a3820);
    R(c, dx + 15, 12, 11, EX_TOP - 13, 0x5a3820);
    frame(c, dx + 3, 14, 9, 14, 0x3a2414);
    frame(c, dx + 16, 14, 9, 14, 0x3a2414);
    R(c, dx + 12, 30, 1, 3, 0xe8c050);
    R(c, dx + 15, 30, 1, 3, 0xe8c050);
  }
}

export const EX_SIDE: Color = 0x2a1a10;

// ── 소품 그림 (art.ts PROPS에 펼쳐 넣는다) ──

type PropPaint = (c: Ctx, w: number, h: number, v: number) => void;

const GOLD = 0xd8b050;
const GOLD_D = 0x9a7428;
const WOOD = 0x5a3820;
const WOOD_D = 0x3a2414;
const LEATHER = 0x5a2418;

export const EX_PROPS: Record<string, PropPaint> = {
  // 비서 책상: 마호가니 상판 + 앞판 금테 + 모니터·전화·명패
  ex_sec_desk(c, w, h, v) {
    R(c, 2, 10, w - 4, h - 12, WOOD_D);
    R(c, 0, 8, w, 5, WOOD);
    R(c, 0, 8, w, 1, lighten(WOOD, 0.25));
    R(c, 3, 14, w - 6, h - 17, WOOD);
    frame(c, 5, 15, w - 10, h - 20, GOLD_D);
    R(c, 2, h - 3, w - 4, 3, 0x1a100a);
    // 모니터
    R(c, v ? 6 : w - 22, 0, 16, 9, 0x1a1a22);
    R(c, v ? 7 : w - 21, 1, 14, 6, 0x3a6aa0);
    R(c, v ? 13 : w - 15, 9, 2, 1, 0x2a2a30);
    // 전화·명패·서류
    R(c, v ? w - 16 : 6, 5, 8, 3, 0x1a1a1e);
    R(c, v ? w - 15 : 7, 4, 6, 1, 0x2a2a2e);
    R(c, w / 2 - 6, 6, 12, 2, GOLD);
    R(c, v ? 28 : w - 34, 5, 7, 3, 0xf2ead3);
  },
  // 유리 트로피 장식장: 나무 받침 + 유리 상자 + 트로피 (v마다 다른 것)
  ex_trophy_case(c, w, h, v) {
    R(c, 0, h - 12, w, 12, WOOD_D);
    R(c, 0, h - 12, w, 2, WOOD);
    R(c, 2, h - 8, w - 4, 1, GOLD_D);
    R(c, 1, 2, w - 2, h - 14, 0x9ac0d0, 0.18);
    frame(c, 1, 2, w - 2, h - 14, 0xc8d8e0, 0.8);
    R(c, 1, 0, w - 2, 2, WOOD_D);
    R(c, 2, (h - 12) / 2, w - 4, 1, 0xc8d8e0, 0.6);
    // 트로피 둘
    for (let k = 0; k < 2; k++) {
      const kind = (v * 2 + k) % 4;
      const cx = 9 + k * 15;
      const by = k === 0 ? (h - 12) / 2 : h - 13;
      if (kind === 0) {
        // 컵
        R(c, cx - 4, by - 12, 9, 5, GOLD);
        R(c, cx - 5, by - 12, 1, 3, GOLD);
        R(c, cx + 5, by - 12, 1, 3, GOLD);
        R(c, cx - 1, by - 7, 3, 4, GOLD_D);
        R(c, cx - 3, by - 3, 7, 3, 0x2a2a2a);
        R(c, cx - 3, by - 12, 2, 2, 0xfff0b0);
      } else if (kind === 1) {
        // 별 방패
        R(c, cx - 3, by - 14, 7, 9, 0xc8ccd4);
        R(c, cx - 1, by - 12, 3, 3, GOLD);
        R(c, cx - 2, by - 5, 5, 5, WOOD);
      } else if (kind === 2) {
        // 골프공 트로피
        E(c, cx, by - 10, 3, 3, 0xf2f2f2);
        R(c, cx, by - 7, 1, 4, GOLD);
        R(c, cx - 3, by - 3, 7, 3, 0x2a2a2a);
      } else {
        // 크리스털 오벨리스크
        R(c, cx - 2, by - 15, 5, 12, 0xb8e0f0);
        R(c, cx - 1, by - 17, 3, 2, 0xd8f4ff);
        R(c, cx - 2, by - 15, 1, 12, 0xffffff);
        R(c, cx - 3, by - 3, 7, 3, 0x1a1a22);
      }
    }
    // 유리 반사
    for (let y = 4; y < h - 14; y++) R(c, 4 + (h - y) * 0.3, y, 2, 1, 0xffffff, 0.16);
  },
  // 가죽 소파: 단추 박힌 등받이·팔걸이
  ex_sofa(c, w, h, v) {
    const m = v ? 0x3a2418 : LEATHER;
    R(c, 2, 2, w - 4, 11, m);
    R(c, 2, 2, w - 4, 1, lighten(m, 0.25));
    for (let x = 6; x < w - 4; x += 6) for (let y = 5; y < 12; y += 4) R(c, x + ((y / 4) % 2 ? 3 : 0), y, 1, 1, darken(m, 0.4));
    R(c, 0, 8, 6, h - 10, darken(m, 0.1));
    R(c, w - 6, 8, 6, h - 10, darken(m, 0.1));
    R(c, 0, 8, 6, 1, lighten(m, 0.2));
    R(c, w - 6, 8, 6, 1, lighten(m, 0.2));
    R(c, 6, 13, w - 12, h - 17, lighten(m, 0.08));
    R(c, w / 2, 13, 1, h - 17, darken(m, 0.3));
    R(c, 2, h - 4, w - 4, 2, darken(m, 0.45));
    R(c, 4, h - 2, 2, 2, GOLD_D);
    R(c, w - 6, h - 2, 2, 2, GOLD_D);
  },
  ex_armchair(c, w, h) {
    R(c, 3, 1, w - 6, 12, LEATHER);
    R(c, 3, 1, w - 6, 1, lighten(LEATHER, 0.3));
    for (let x = 6; x < w - 5; x += 4) R(c, x, 6, 1, 1, darken(LEATHER, 0.45));
    R(c, 0, 8, 5, h - 11, darken(LEATHER, 0.1));
    R(c, w - 5, 8, 5, h - 11, darken(LEATHER, 0.1));
    R(c, 5, 13, w - 10, h - 17, lighten(LEATHER, 0.1));
    R(c, 2, h - 3, 2, 3, WOOD_D);
    R(c, w - 4, h - 3, 2, 3, WOOD_D);
  },
  // 유리 커피 테이블 (금 다리)
  ex_coffee_table(c, w, h) {
    R(c, 0, 2, w, 7, 0xb8d8e0, 0.45);
    frame(c, 0, 2, w, 7, GOLD);
    R(c, 3, 3, 8, 1, 0xffffff, 0.6);
    R(c, 2, 9, 2, h - 9, GOLD_D);
    R(c, w - 4, 9, 2, h - 9, GOLD_D);
    R(c, w / 2 - 5, 4, 6, 3, 0xf2ead3);
    R(c, w / 2 + 4, 4, 3, 3, 0x8a1a3a);
  },
  // 바 카운터: 뒷장 술병 + 대리석 상판
  ex_bar(c, w, h) {
    R(c, 4, 0, w - 8, 16, WOOD_D);
    for (let k = 0; k < 2; k++) R(c, 4, 6 + k * 7, w - 8, 1, GOLD_D);
    for (let x = 8; x < w - 8; x += 5) {
      const col = [0x5a8a3a, 0x8a3a2a, 0xc8a050, 0x3a5a8a, 0xe8e0d0][(x * 7) % 5];
      R(c, x, 1 + ((x / 5) % 2), 3, 5, col);
      R(c, x + 1, ((x / 5) % 2), 1, 1, col);
      R(c, x, 8, 3, 5, [0x8a2a3a, 0xd8c070, 0x4a6a2a][(x * 3) % 3]);
    }
    R(c, 0, 16, w, 6, 0xd8d4cc);
    R(c, 0, 16, w, 1, 0xffffff);
    for (let x = 6; x < w; x += 11) R(c, x, 18, 4, 1, 0xa8a49c, 0.6);
    R(c, 2, 22, w - 4, h - 25, WOOD);
    for (let x = 6; x < w - 6; x += 14) frame(c, x, 24, 10, h - 29, WOOD_D);
    R(c, 2, h - 3, w - 4, 3, 0x1a100a);
    R(c, 0, 21, w, 1, GOLD);
  },
  // 이사회 긴 테이블: 반들반들한 마호가니 + 서류·물병
  ex_board_table(c, w, h) {
    R(c, 2, 4, w - 4, h - 8, WOOD_D);
    R(c, 0, 2, w, h - 10, 0x6a3a1e);
    R(c, 0, 2, w, 1, lighten(0x6a3a1e, 0.3));
    for (let k = 0; k < 4; k++) R(c, 20 + k * 36, 6, 18, 1, 0xffffff, 0.12);
    frame(c, 4, 5, w - 8, h - 16, GOLD_D, 0.7);
    for (let i = 0; i < 6; i++) {
      const x = 12 + i * 25.6;
      R(c, x, 6, 7, 5, 0xf2ead3);
      R(c, x + 8, 15, 6, 4, 0xf2ead3);
      if (i % 2) R(c, x + 3, 12, 2, 4, 0x9ad0e0);
    }
    R(c, w / 2 - 6, 11, 12, 4, 0x3a5a3a);
    R(c, 4, h - 8, 4, 8, WOOD_D);
    R(c, w - 8, h - 8, 4, 8, WOOD_D);
  },
  ex_exec_desk(c, w, h) {
    R(c, 2, 8, w - 4, h - 10, WOOD_D);
    R(c, 0, 6, w, 7, 0x6a3a1e);
    R(c, 0, 6, w, 1, lighten(0x6a3a1e, 0.3));
    R(c, 10, 7, 20, 5, 0x2a5a3a);
    frame(c, 10, 7, 20, 5, GOLD_D);
    R(c, 3, 14, w - 6, h - 17, WOOD);
    for (let x = 6; x < w - 6; x += 24) frame(c, x, 16, 20, h - 21, GOLD_D);
    // 금 펜꽂이·명패·결재판
    R(c, w - 18, 2, 3, 5, GOLD);
    R(c, w - 14, 3, 1, 4, 0x1a1a2a);
    R(c, w / 2 - 8, 3, 16, 3, GOLD);
    R(c, w / 2 - 7, 4, 14, 1, 0x3a2a14);
    R(c, 36, 4, 10, 3, 0xa83c3c);
    R(c, 2, h - 3, w - 4, 3, 0x1a100a);
  },
  ex_bookshelf(c, w, h) {
    R(c, 0, 0, w, h, WOOD_D);
    R(c, 0, 0, w, 3, WOOD);
    for (let s = 0; s < 4; s++) {
      const y = 4 + s * 12;
      R(c, 2, y, w - 4, 10, 0x1e120a);
      let x = 3;
      let k = s * 13;
      while (x < w - 4) {
        const bw = 2 + Math.floor(hash2(k, s, 4) * 3);
        const bh = 6 + Math.floor(hash2(k, s, 5) * 4);
        const col = [0x6a1e1e, 0x1e3a5a, 0x2a4a2a, 0x8a6a2a, 0x3a2a4a, 0xe8e0d0][Math.floor(hash2(k, s, 6) * 6)];
        if (hash2(k, s, 8) < 0.1) {
          R(c, x, y + 10 - 3, 6, 3, 0xc8a050);
          x += 7;
        } else {
          R(c, x, y + 10 - bh, bw, bh, col);
          R(c, x, y + 10 - bh + 2, bw, 1, GOLD_D, 0.7);
          x += bw;
        }
        k++;
      }
      R(c, 1, y + 10, w - 2, 2, WOOD);
    }
    R(c, 0, h - 4, w, 4, 0x1a100a);
  },
  // 퍼팅 그린 깃발
  ex_flag(c, w, h) {
    R(c, 6, 2, 1, h - 4, 0xe8e8e8);
    R(c, 7, 2, 7, 5, 0xd03030);
    R(c, 7, 4, 5, 1, 0xa82020);
    E(c, 6.5, h - 2, 4, 2, 0x0a1a0a);
    R(c, 3, h - 3, 7, 1, 0x1a3a1a);
  },
  // 분재대: 검은 받침 + 분재
  ex_bonsai_stand(c, w, h) {
    R(c, 2, h - 12, w - 4, 3, 0x1a1414);
    R(c, 4, h - 9, 2, 9, 0x1a1414);
    R(c, w - 6, h - 9, 2, 9, 0x1a1414);
    R(c, 3, h - 16, w - 6, 4, 0x6a3a2a);
    R(c, w / 2 - 1, h - 22, 2, 6, 0x5a3a20);
    R(c, w / 2, h - 24, 4, 1, 0x5a3a20);
    E(c, w / 2 - 3, h - 22, 5, 2, 0x2a6a2a);
    E(c, w / 2 + 4, h - 25, 4, 2, 0x3a7a3a);
    E(c, w / 2, h - 18, 3, 1.5, 0x2a6a2a);
  },
  // 대표이사 책상: 아주 큰 마호가니 + 금테 + 결재 서류 탑 + 국기
  ex_ceo_desk(c, w, h) {
    R(c, 2, 12, w - 4, h - 14, 0x2a160c);
    R(c, 0, 9, w, 8, 0x5a2e16);
    R(c, 0, 9, w, 1, lighten(0x5a2e16, 0.35));
    R(c, 0, 16, w, 1, GOLD);
    R(c, 4, 18, w - 8, h - 22, 0x4a2612);
    for (let x = 8; x < w - 10; x += 28) {
      frame(c, x, 20, 24, h - 27, GOLD);
      R(c, x + 10, 24, 4, 4, GOLD_D);
    }
    // 서류 탑
    for (let k = 0; k < 4; k++) R(c, 14 + k, 9 - k * 2 - 3, 14, 2, k % 2 ? 0xf2ead3 : 0xe0d8c0);
    for (let k = 0; k < 3; k++) R(c, w - 34 + k, 9 - k * 2 - 3, 14, 2, k % 2 ? 0xf2ead3 : 0xe0d8c0);
    // 명패·도장함
    R(c, w / 2 - 14, 4, 28, 5, 0x1a1a1e);
    R(c, w / 2 - 13, 5, 26, 3, GOLD);
    R(c, w / 2 + 18, 3, 6, 6, 0xa83c3c);
    R(c, 2, h - 3, w - 4, 3, 0x0e0806);
  },
  // 대리석 기둥 (금 기둥머리)
  ex_pillar(c, w, h) {
    R(c, 3, 6, w - 6, h - 12, 0xe8e0d4);
    for (let x = 5; x < w - 5; x += 3) R(c, x, 8, 1, h - 16, 0xc8c0b4);
    R(c, 3, 6, 2, h - 12, 0xf8f4ec);
    R(c, 0, 0, w, 6, GOLD);
    R(c, 1, 1, w - 2, 1, 0xfff0b0);
    R(c, 0, h - 6, w, 6, GOLD_D);
    R(c, 0, h - 6, w, 1, GOLD);
  },
  ex_plant(c, w, h) {
    R(c, 4, h - 10, w - 8, 10, 0xe8e0d0);
    R(c, 4, h - 10, w - 8, 2, GOLD);
    R(c, 5, h - 2, w - 10, 2, 0xb8b0a0);
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.38;
      for (let r = 2; r < h - 10; r++) R(c, w / 2 + Math.cos(a) * r * 0.45, h - 11 + Math.sin(a) * r, 2, 1, k % 2 ? 0x2a6a2a : 0x3a8a3a);
    }
  },
  ex_globe(c, w, h) {
    R(c, w / 2 - 1, h - 10, 2, 8, WOOD_D);
    R(c, 3, h - 3, w - 6, 3, WOOD_D);
    E(c, w / 2, 9, 7, 7, 0x2a5a8a);
    E(c, w / 2 - 2, 7, 3, 2, 0x5a8a3a);
    E(c, w / 2 + 3, 11, 2, 2, 0x5a8a3a);
    for (let a = 0; a < 20; a++) R(c, w / 2 + Math.cos(a / 3.2) * 8, 9 + Math.sin(a / 3.2) * 8, 1, 1, GOLD);
  },
  // 그랜드 피아노 (뚜껑 열림)
  ex_piano(c, w, h) {
    R(c, 4, h - 14, 3, 14, 0x0a0a0e);
    R(c, w - 10, h - 14, 3, 14, 0x0a0a0e);
    E(c, w / 2 + 6, 16, w / 2 - 4, 10, 0x121216);
    R(c, 4, 14, w - 18, 14, 0x121216);
    R(c, 4, 14, w - 18, 1, 0x3a3a46);
    // 열린 뚜껑
    for (let k = 0; k < 18; k++) R(c, 10 + k * 2, 2 + k * 0.5, 2, 10 - k * 0.5, 0x1a1a22);
    R(c, 10, 2, 36, 1, 0x4a4a56);
    // 건반
    R(c, 4, 26, w - 18, 4, 0xf2f2f2);
    for (let x = 6; x < w - 16; x += 3) R(c, x, 26, 1, 2, 0x121216);
    R(c, w / 2 - 6, 20, 12, 3, GOLD_D);
  },
  ex_lamp(c, w, h) {
    R(c, w / 2 - 1, 10, 2, h - 12, GOLD_D);
    R(c, 2, h - 3, w - 4, 3, GOLD_D);
    R(c, 1, 2, w - 2, 9, 0xf0e0b0);
    R(c, 2, 1, w - 4, 1, 0xf8f0d0);
    R(c, 1, 10, w - 2, 1, 0xc8b080);
  },
  // 회의 의자 (납작 — 사람보다 아래)
  ex_conf_chair(c, w, h, v) {
    const m = v === 2 ? 0x3a1a10 : LEATHER;
    R(c, 2, v === 1 ? 6 : 0, w - 4, 8, m);
    R(c, 2, v === 1 ? 6 : 0, w - 4, 1, lighten(m, 0.3));
    R(c, 1, v === 1 ? 0 : 8, w - 2, 6, lighten(m, 0.08));
    R(c, w / 2 - 1, h - 4, 2, 3, 0x2a2a30);
    R(c, 2, h - 1, w - 4, 1, 0x2a2a30);
  },
  ex_golf_bag(c, w, h) {
    R(c, 3, 8, w - 6, h - 9, 0x1e3a6a);
    R(c, 3, 8, w - 6, 2, 0xf2f2f2);
    R(c, 4, 14, 2, h - 18, 0x3a5a8a);
    for (let k = 0; k < 4; k++) {
      R(c, 3 + k * 2, 2 + (k % 2) * 2, 1, 7, 0xc8ccd4);
      R(c, 2 + k * 2, 1 + (k % 2) * 2, 3, 2, k % 2 ? 0x1a1a1e : 0xd8b050);
    }
    R(c, 2, h - 2, w - 4, 2, 0x0e1a30);
  },
};
