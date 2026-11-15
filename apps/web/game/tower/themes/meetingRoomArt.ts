import type { MtMonsterId, MtTime } from "@/lib/rpg/towerThemes/meetingRoom";
import type { MtFurn, MtFurnKind, MtRoomPlan, MtWall } from "./meetingRoomMap";
import { css, darken, Grid, hash2, lighten, makeCanvas, mix, type Color } from "../../sprites/pixel";

// 11/15 야근 빌딩 「끝없는 회의실」 그림 (캔버스 2D, Phaser 없이):
//  - 바닥·벽 (arena/art THEMES가 부른다): 끝없이 비치는 유리벽, 유리 화이트보드, 벽시계 자리, 블라인드, 카펫
//  - 긴 회의 테이블·의자·밀려오는 테이블 줄·바닥 경고 줄·커피 웅덩이 같은 움직이는 것의 그림 (MeetingRoom이 텍스처로 올린다)
//  - 몬스터 16종 (monsterArt P에 끼워 넣는다) — 모두 실루엣·색·크기가 다르다

type Ctx = CanvasRenderingContext2D;
const OUT = 0x141218;
const EYE = 0x141218;
const WHITE = 0xf2ead3;

// 바닥 그림 크기 (arena/layout과 같은 값 — 여기서 import하면 art.ts와 순환이라 숫자로)
const AW = 448;
const AH = 288;
const SIDE = 10;
/** 유리벽 높이 (layout이 이 아래부터 걸을 수 있게 막는다) */
export const MT_WALL_H = 54;

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

// ── 바닥·벽 (층마다 한 장: 방 종류·카펫 색·뒷벽·창밖 풍경·층 번호판) ──

export type MtView = { time: MtTime; rain: boolean };

/** 카펫: 결이 엇갈린 24px 타일 + 의자 바퀴 자국 */
function carpet(c: Ctx, a: Color, b: Color, salt: number): void {
  for (let y = 0; y < AH; y += 24)
    for (let x = 0; x < AW; x += 24) {
      const alt = ((x + y) / 24) % 2;
      R(c, x, y, 24, 24, alt ? a : b);
      for (let k = 1; k < 24; k += 3) R(c, x + (alt ? k : 0), y + (alt ? 0 : k), alt ? 1 : 24, alt ? 24 : 1, darken(alt ? a : b, 0.06));
    }
  c.fillStyle = css(darken(b, 0.18), 1);
  for (let i = 0; i < 2600; i++) c.fillRect(Math.floor(hash2(i, 1, salt) * AW), Math.floor(hash2(i, 2, salt) * AH), 1, 1);
}

/** 끝없이 비치는 회의실: 소실점으로 작아지는 방 7겹 (방마다 형광등·테이블·앉은 사람·작은 시계) — 유리끼리 마주 봐서 끝이 없다 */
function mirrorTunnel(c: Ctx, x0: number, y0: number, w: number, h: number, tint: Color): void {
  const vx = x0 + w / 2;
  const vy = y0 + h * 0.5;
  for (let k = 0; k < 7; k++) {
    const s = 0.7 ** k;
    const rw = w * s;
    const rh = h * s;
    const rx = vx - rw / 2;
    const ry = vy - rh * 0.5;
    const dim = Math.min(0.85, k * 0.13);
    const wallC = mix(mix(0x6a88a8, tint, 0.3), 0x16202e, dim);
    // 그 방의 벽 → 바닥(카펫) → 천장 형광등 줄
    for (let y = 0; y < rh; y++) R(c, rx, ry + y, rw, 1, mix(wallC, darken(wallC, 0.35), y / rh));
    R(c, rx, ry + rh * 0.64, rw, rh * 0.36, mix(0x4a4258, 0x0e0c16, dim));
    for (let i = 0; i < 2; i++) R(c, rx + (rw * (i + 0.5)) / 2 - rw * 0.12, ry + Math.max(1, rh * 0.06), rw * 0.24, Math.max(1, rh * 0.04), mix(0xfff6dc, 0x40506a, dim));
    // 테이블과 앉은 사람들 (머리 + 어깨)
    const tw = rw * 0.5;
    const tx = vx - tw / 2;
    const ty = ry + rh * 0.68;
    const heads = Math.max(1, Math.round(4 * s + 0.5));
    for (let i = 0; i < heads; i++) {
      const hx = tx + (tw * (i + 0.5)) / heads;
      const hw = Math.max(1, rw * 0.022);
      R(c, hx - hw, ty - Math.max(1, rh * 0.1), hw * 2, Math.max(1, rh * 0.1), mix(0x2a2c3c, 0x080810, dim));
      R(c, hx - hw / 2, ty - Math.max(2, rh * 0.17), Math.max(1, hw), Math.max(1, rh * 0.07), mix(0x3a3240, 0x080810, dim));
    }
    R(c, tx, ty, tw, Math.max(1, rh * 0.08), mix(0xc89a6e, 0x1a1820, dim));
    // 그 방의 작은 벽시계
    if (rw > 30) E(c, vx, ry + rh * 0.2, Math.max(1, rw * 0.012), Math.max(1, rw * 0.012), mix(0xf4f4f0, 0x202430, dim));
    // 유리 틀 (가까울수록 밝다)
    c.strokeStyle = css(mix(0xc8d4e4, 0x101820, dim), 1);
    c.lineWidth = 1;
    c.strokeRect(Math.round(rx) + 0.5, Math.round(ry) + 0.5, Math.round(rw) - 1, Math.round(rh) - 1);
    if (rw > 20) for (let i = 1; i < 3; i++) R(c, rx + (rw * i) / 3, ry, 1, rh * 0.64, mix(0x8a9ab0, 0x101820, dim), 0.6);
  }
  // 유리 위 사선 반사광
  for (let y = 0; y < h; y++) R(c, x0 + w * 0.15 + (h - y) * 0.5, y0 + y, 4, 1, 0xffffff, 0.1);
}

/** 하늘 위·아래 색 (때마다) */
const SKY: Record<MtTime, [Color, Color]> = {
  sunset: [0x5a3a7a, 0xff9a4a],
  night: [0x0a0e22, 0x1a2244],
  dawn: [0x1a2a5a, 0x5a7ab8],
  sunrise: [0x6a8ad0, 0xffb0a0],
  day: [0x6ab0e8, 0xc8e4f8],
};

/** 창밖 도시: 하늘 그라데이션 → 먼 빌딩 → 가까운 빌딩(불 켜진 창) · 비 오는 날은 어둡고 흐리다 */
function cityView(c: Ctx, x0: number, y0: number, w: number, h: number, v: MtView, salt: number): void {
  const [top, bot] = SKY[v.time];
  for (let y = 0; y < h; y++) R(c, x0, y0 + y, w, 1, mix(mix(top, bot, y / h), 0x3a4050, v.rain ? 0.45 : 0));
  if (v.time === "sunset" || v.time === "sunrise") E(c, x0 + w * (0.25 + hash2(salt, 3, 1) * 0.5), y0 + h * 0.8, 9, 9, v.time === "sunset" ? 0xffd070 : 0xfff0c0, v.rain ? 0.3 : 0.9);
  if (v.time === "night" && !v.rain) for (let i = 0; i < 26; i++) R(c, x0 + hash2(i, 4, salt) * w, y0 + hash2(i, 5, salt) * h * 0.5, 1, 1, 0xe8f0ff, 0.7);
  const lit = v.time === "night" ? 0.45 : v.time === "dawn" ? 0.25 : v.time === "sunset" ? 0.18 : 0.06;
  const far = mix(bot, 0x202838, 0.55);
  const near = mix(bot, 0x10141e, 0.8);
  for (const [col, hk, wk, sl] of [
    [far, 0.75, 1, 11],
    [near, 0.55, 1.3, 23],
  ] as const) {
    let x = x0;
    let k = 0;
    while (x < x0 + w) {
      const bw = Math.round((10 + hash2(k, 1, salt + sl) * 18) * wk);
      const bh = Math.round(h * (0.25 + hash2(k, 2, salt + sl) * hk));
      const bx = Math.min(bw, x0 + w - x);
      R(c, x, y0 + h - bh, bx, bh, col);
      for (let yy = y0 + h - bh + 2; yy < y0 + h - 1; yy += 3)
        for (let xx = x + 1; xx < x + bx - 1; xx += 3) if (hash2(xx, yy, salt + sl) < lit) R(c, xx, yy, 1, 1, v.time === "day" ? 0x9ac0e0 : 0xffe08a);
      if (hash2(k, 7, salt) < 0.2) R(c, x + bx / 2, y0 + h - bh - 3, 1, 3, col);
      x += bx + 1;
      k++;
    }
  }
}

/** 유리 화이트보드 판 (그래프는 MeetingRoom이 실시간으로 그린다) */
function glassBoard(c: Ctx, x: number, y: number, w: number, h: number): void {
  R(c, x - 1, y - 1, w + 2, h + 2, 0x9aa4b4);
  R(c, x, y, w, h, 0xf4f6f8, 0.92);
  R(c, x, y, w, 1, 0xffffff);
  for (let i = 0; i < 30; i++) R(c, x + 4 + hash2(i, 1, 7) * (w - 12), y + 4 + hash2(i, 2, 7) * (h - 8), 3 + hash2(i, 3, 7) * 6, 1, 0xc8d0dc, 0.5);
  R(c, x + 4, y + h, w - 8, 2, 0x6a7080);
  for (const [i, col] of [[0, 0x2a9a5a], [1, 0xd03a3a], [2, 0x2a5ac8]] as const) R(c, x + 10 + i * 7, y + h - 1, 5, 2, col);
}

/** 블라인드 창 (옆 벽) */
function blinds(c: Ctx, x: number, y: number, w: number, h: number, closed: boolean): void {
  R(c, x, y, w, h, 0x8a6a4a);
  for (let j = 1; j < h - 1; j += 3) {
    R(c, x + 1, y + j, w - 2, closed ? 3 : 2, 0xe8dcc8);
    R(c, x + 1, y + j + 1, w - 2, 1, 0xc8b8a0);
  }
}

/** 작은 픽셀 숫자 (3×5) */
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function pixText(c: Ctx, x: number, y: number, text: string, col: Color, k = 1): number {
  let cx = x;
  for (const ch of text) {
    if (ch === "F") {
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [0, 3], [0, 4]]) R(c, cx + dx * k, y + dy * k, k, k, col);
    } else if (ch === ":") {
      R(c, cx + k, y + k, k, k, col);
      R(c, cx + k, y + 3 * k, k, k, col);
    } else {
      const bits = DIGITS[Number(ch)] ?? "";
      for (let i = 0; i < 15; i++) if (bits[i] === "1") R(c, cx + (i % 3) * k, y + Math.floor(i / 3) * k, k, k, col);
    }
    cx += 4 * k;
  }
  return cx - x;
}

/** 층 번호판 "7F" (벽 왼쪽 위) */
function floorSign(c: Ctx, x: number, y: number, floor: number): void {
  const t = `${floor}F`;
  const w = t.length * 8 + 6;
  R(c, x, y, w, 16, 0x2a2a34);
  R(c, x + 1, y + 1, w - 2, 14, 0xc8ccd4);
  R(c, x + 1, y + 1, w - 2, 1, 0xf0f2f6);
  pixText(c, x + 4, y + 3, t, 0x1a1c28, 2);
}

/** 벽시계 판 (바늘은 MeetingRoom) */
function clockFace(c: Ctx, x: number, y: number): void {
  E(c, x, y, 10, 10, 0x2a2a34);
  E(c, x, y, 9, 9, 0xd8dce4);
  E(c, x, y, 8, 8, 0xf4f4f0);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    R(c, x + Math.cos(a) * 6.5, y + Math.sin(a) * 6.5, 1, 1, k % 3 ? 0x8a8a94 : OUT);
  }
}

/** 벽시계 자리 (MeetingRoom이 바늘을 그린다) — 뒷벽 종류마다 */
export const mtClockAt = (wall: MtWall): { x: number; y: number } => (wall === "screen" ? { x: AW - 60, y: 16 } : wall === "boss" ? { x: AW - 76, y: 16 } : { x: AW / 2, y: 15 });
/** 화이트보드·스크린 자리 (MeetingRoom이 그래프·슬라이드를 그린다) */
export function mtBoards(wall: MtWall): { x: number; y: number; w: number; h: number; kind: "board" | "screen" | "big" }[] {
  if (wall === "mirror") return [{ x: 26, y: 9, w: 104, h: 34, kind: "board" }, { x: AW - 130, y: 9, w: 104, h: 34, kind: "board" }];
  if (wall === "window") return [{ x: 26, y: 9, w: 90, h: 34, kind: "board" }];
  if (wall === "screen") return [{ x: 134, y: 4, w: 180, h: 44, kind: "screen" }];
  if (wall === "boss") return [{ x: 124, y: 4, w: 200, h: 44, kind: "big" }];
  return [];
}
/** 바깥이 보이는 창 (비가 오면 MeetingRoom이 빗줄기를 그린다) */
export function mtWindows(wall: MtWall): { x: number; y: number; w: number; h: number }[] {
  if (wall === "window") return [{ x: 124, y: 3, w: AW - 134, h: MT_WALL_H - 8 }];
  if (wall === "menu") return [{ x: 230, y: 3, w: AW - 240, h: MT_WALL_H - 8 }];
  if (wall === "booth") return [{ x: 150, y: 6, w: 148, h: 30 }];
  return [];
}

function mullions(c: Ctx, x0: number, x1: number, y0: number, h: number, gap: number): void {
  for (let x = x0; x <= x1; x += gap) {
    R(c, x - 1, y0, 3, h, 0x8a94a4);
    R(c, x - 1, y0, 1, h, 0xc8d0dc);
  }
}

function backWall(c: Ctx, plan: MtRoomPlan, v: MtView, floor: number, salt: number): void {
  const H = MT_WALL_H;
  const tint = SKY[v.time][1];
  switch (plan.wall) {
    case "mirror":
      R(c, 0, 0, AW, H, 0x2a3442);
      // 유리 칸마다 마주 보는 거울처럼 끝없이 작아지는 회의실
      for (let x = SIDE; x < AW - SIDE - 4; x += 53.5) mirrorTunnel(c, Math.round(x) + 2, 3, 50, H - 8, tint);
      mullions(c, SIDE, AW - SIDE, 3, H - 8, 53.5);
      break;
    case "window": {
      R(c, 0, 0, AW, H, 0xd8d4cc);
      for (const w of mtWindows("window")) {
        cityView(c, w.x, w.y, w.w, w.h, v, salt);
        mullions(c, w.x, w.x + w.w, w.y, w.h, 52);
      }
      break;
    }
    case "screen":
      R(c, 0, 0, AW, H, 0xcfcac0);
      for (let x = 0; x < AW; x += 6) R(c, x, 0, 1, H, 0xc4bfb4);
      R(c, 132, 2, 184, 48, 0x3a3a44);
      R(c, 134, 4, 180, 44, 0xf8f8f4);
      for (const x of [24, 74]) {
        cityView(c, x, 8, 40, 30, v, salt);
        R(c, x - 1, 7, 42, 1, 0x6a6a74);
        blindsTop(c, x, 8, 40, 10);
      }
      break;
    case "menu":
      R(c, 0, 0, AW, H, 0x8a6040);
      for (let x = 0; x < 230; x += 8) R(c, x, 0, 1, H, 0x7a5236);
      // 칠판 메뉴판 (분필 줄)
      R(c, 30, 6, 120, 38, 0x4a3a2a);
      R(c, 33, 9, 114, 32, 0x2a3a30);
      for (let y = 14; y < 38; y += 6) for (let x = 38; x < 140; x += 2) if (hash2(x, y, salt) < 0.6) R(c, x, y, 2, 1, 0xe8f0e0, 0.8);
      R(c, 120, 13, 20, 6, 0xd04a3a, 0.8);
      for (const w of mtWindows("menu")) {
        cityView(c, w.x, w.y, w.w, w.h, v, salt);
        mullions(c, w.x, w.x + w.w, w.y, w.h, 52);
      }
      break;
    case "booth":
      R(c, 0, 0, AW, H, 0x4a4e5a);
      for (let y = 0; y < H; y += 9) R(c, 0, y, AW, 1, 0x42464f);
      for (const w of mtWindows("booth")) {
        cityView(c, w.x, w.y, w.w, w.h, v, salt);
        mullions(c, w.x, w.x + w.w, w.y, w.h, 37);
      }
      // 액자 포스터 (회사 가치: 막대·별)
      for (const [x, col] of [[60, 0x3a7ad0], [340, 0xd06a2a], [392, 0x3a9a5a]] as const) {
        R(c, x, 10, 26, 30, 0x2a2a30);
        R(c, x + 2, 12, 22, 26, 0xf2f2ee);
        R(c, x + 5, 16, 16, 4, col);
        for (let i = 0; i < 3; i++) R(c, x + 5, 24 + i * 4, 16 - i * 4, 1, 0x8a8a94);
      }
      break;
    case "boss":
      R(c, 0, 0, AW, H, 0x3a2418);
      for (let x = 0; x < AW; x += 16) {
        R(c, x, 0, 1, H, 0x2a180e);
        R(c, x + 1, 0, 1, H, 0x4a3020);
      }
      R(c, 120, 1, 208, 50, 0x101014);
      R(c, 124, 4, 200, 44, 0x0a1a2a);
      // 깃발 둘 + 회사 로고 판
      for (const x of [70, AW - 76]) {
        R(c, x, 4, 1, 40, 0xc8a050);
        R(c, x + 1, 6, 14, 10, 0x2a3a7a);
        R(c, x + 4, 9, 6, 4, 0xe8c050);
      }
      E(c, 34, 22, 12, 12, 0xc8a050);
      E(c, 34, 22, 10, 10, 0x2a1a10);
      pixText(c, 26, 18, "1", 0xe8c050, 2);
      break;
  }
  R(c, 0, 0, AW, 3, 0x1c1a24);
  for (const b of mtBoards(plan.wall)) if (b.kind === "board") glassBoard(c, b.x, b.y, b.w, b.h);
  const ck = mtClockAt(plan.wall);
  clockFace(c, ck.x, ck.y);
  floorSign(c, ck.x + 14, 4, floor);
  R(c, 0, H - 5, AW, 5, 0x4a4a5a);
  R(c, 0, H - 5, AW, 1, 0x7a7a8a);
  for (let i = 0; i < 5; i++) R(c, SIDE, H + i, AW - SIDE * 2, 1, 0x000000, 0.3 - i * 0.06);
}

/** 창 위쪽 반쯤 내린 블라인드 */
function blindsTop(c: Ctx, x: number, y: number, w: number, h: number): void {
  for (let j = 0; j < h; j += 2) R(c, x, y + j, w, 1, 0xe8dcc8);
}

/** 작은 회의실 칸막이 밖: 옆 회의실들 (흐릿한 테이블·사람) */
function neighborRooms(c: Ctx, x0: number, x1: number, salt: number): void {
  R(c, x0, MT_WALL_H, x1 - x0, AH - MT_WALL_H, 0x1e2230);
  for (let y = MT_WALL_H + 20; y < AH - 20; y += 70) {
    const cx = (x0 + x1) / 2;
    E(c, cx, y + 20, 22, 10, 0x3a3a48);
    for (let k = 0; k < 4; k++) R(c, cx - 18 + k * 12, y + 6 + (k % 2) * 22, 4, 5, 0x2a2a38);
    if (hash2(y, salt, 3) < 0.5) R(c, cx - 30, y, 10, 6, 0x4a6a8a, 0.5);
  }
  for (let y = MT_WALL_H; y < AH; y += 70) R(c, x0, y, x1 - x0, 2, 0x5a6070);
}

/** 유리 칸막이 (세로) */
function glassPartition(c: Ctx, x: number): void {
  R(c, x - 3, MT_WALL_H, 6, AH - MT_WALL_H, 0xa8c8e8, 0.35);
  R(c, x - 3, MT_WALL_H, 1, AH - MT_WALL_H, 0xe8f4ff, 0.8);
  R(c, x + 2, MT_WALL_H, 1, AH - MT_WALL_H, 0x5a7090, 0.8);
  for (let y = MT_WALL_H + 30; y < AH; y += 50) R(c, x - 3, y, 6, 3, 0xe8ecf0, 0.7);
}

/** 바닥 무늬: 테이블 밑 러그·우두머리 층 붉은 카펫 */
function rugs(c: Ctx, plan: MtRoomPlan): void {
  for (const f of plan.furn) {
    if (f.kind === "long_table") {
      R(c, f.x - f.w / 2 - 18, f.y - f.h - 30, f.w + 36, f.h + 56, 0x2a2436, 0.55);
      R(c, f.x - f.w / 2 - 16, f.y - f.h - 28, f.w + 32, 1, 0x6a5a8a, 0.5);
    }
    if (f.kind === "round_table") E(c, f.x, f.y + 4, f.w * 1.05, f.w * 0.75, 0x2a2436, 0.5);
  }
  if (plan.type === "boss") {
    R(c, AW / 2 - 26, MT_WALL_H, 52, AH - MT_WALL_H, 0x7a1a1e);
    R(c, AW / 2 - 26, MT_WALL_H, 3, AH - MT_WALL_H, 0xc8a050);
    R(c, AW / 2 + 23, MT_WALL_H, 3, AH - MT_WALL_H, 0xc8a050);
    for (let y = MT_WALL_H + 8; y < AH; y += 16) R(c, AW / 2 - 4, y, 8, 2, 0x9a2a2e);
  }
  if (plan.type === "cafe") for (let y = MT_WALL_H; y < AH; y += 16) for (let x = SIDE; x < AW - SIDE; x += 16) if (((x + y) / 16) % 2 === 0) R(c, x, y, 16, 16, 0xffffff, 0.05);
}

/** 층 하나의 바닥 그림 (한 번 그려 텍스처로) */
export function mtBackgroundCanvas(plan: MtRoomPlan, floor: number, v: MtView, salt: number): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(AW, AH);
  const [ca, cb] = plan.type === "boss" ? ([0x2a2026, 0x261c22] as [Color, Color]) : plan.carpet;
  carpet(c, lighten(ca, 0.1), lighten(cb, 0.1), salt);
  rugs(c, plan);
  const r0 = plan.room0;
  if (r0.x0 > SIDE + 1) {
    neighborRooms(c, 0, r0.x0, salt);
    neighborRooms(c, r0.x1, AW, salt + 1);
    glassPartition(c, r0.x0);
    glassPartition(c, r0.x1);
  }
  // 옆 벽 (블라인드 창 — 밤엔 닫혀 있다)
  const closed = v.time === "night";
  R(c, 0, MT_WALL_H, SIDE, AH - MT_WALL_H, 0x4a4458);
  R(c, AW - SIDE, MT_WALL_H, SIDE, AH - MT_WALL_H, 0x4a4458);
  R(c, 0, AH - SIDE, AW, SIDE, 0x4a4458);
  R(c, SIDE - 1, MT_WALL_H, 1, AH - MT_WALL_H - SIDE, 0x6a6478);
  R(c, AW - SIDE, MT_WALL_H, 1, AH - MT_WALL_H - SIDE, 0x6a6478);
  blinds(c, AW - SIDE, MT_WALL_H + 10, SIDE, 90, closed);
  blinds(c, AW - SIDE, MT_WALL_H + 120, SIDE, 90, closed);
  blinds(c, 0, MT_WALL_H + 30, SIDE, 70, closed);
  blinds(c, 0, MT_WALL_H + 130, SIDE, 70, closed);
  backWall(c, plan, v, floor, salt);
  return canvas;
}

/** arena/art THEMES 칸 (그 위에 층마다 그림을 한 장 더 깐다 — 여기는 바탕만) */
export const MT_THEME = {
  side: 0x4a4458,
  floor(c: Ctx): void {
    R(c, 0, 0, AW, AH, 0x342e42);
  },
  wall(c: Ctx): void {
    R(c, 0, 0, AW, MT_WALL_H, 0x2a3442);
  },
};

/** 블라인드 사이로 드는 빛줄기 (오른쪽 창에서 왼쪽 아래로) — 더하기 합성 */
export function stripesCanvas(salt: number): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(AW, AH);
  for (let k = 0; k < 9; k++) {
    const y0 = MT_WALL_H + 6 + k * 24 + hash2(k, 1, salt) * 8;
    const th = 7 + hash2(k, 2, salt) * 5;
    for (let x = AW - SIDE; x > 40; x--) {
      const d = (AW - SIDE - x) / (AW - 60);
      const y = y0 + (AW - SIDE - x) * 0.42;
      if (y > AH - SIDE) break;
      c.fillStyle = `rgba(255,255,255,${(0.9 * (1 - d) * (1 - d)).toFixed(3)})`;
      c.fillRect(x, Math.round(y), 1, Math.round(th));
    }
  }
  return canvas;
}

// ── 가구 ──

/** 가구 하나의 그림 (MeetingRoom이 kind·크기·v마다 한 번 텍스처로). 원점은 아래 가운데 (네모) / 가운데 (원) */
export function mtFurnCanvas(f: MtFurn): { canvas: HTMLCanvasElement; ox: number; oy: number } {
  const v = f.v ?? 0;
  switch (f.kind) {
    case "long_table": {
      const cv = longTableCanvas(f.w, f.h, v + 3);
      return { canvas: cv, ox: (f.w + 2) / 2, oy: f.h + 4 };
    }
    case "round_table": {
      const cv = roundTableCanvas(f.w / 2, v);
      return { canvas: cv, ox: f.w / 2 + 1, oy: f.w / 2 };
    }
    case "cafe_table": {
      const r = f.w / 2;
      const { canvas, ctx: c } = makeCanvas(r * 2 + 4, r * 2 + 10);
      E(c, r + 2, r + 8, r, r * 0.5, 0x000000, 0.3);
      R(c, r + 1, r + 2, 2, 7, 0x3a3a44);
      E(c, r + 2, r + 1, r + 1, r * 0.66 + 1, OUT);
      E(c, r + 2, r + 1, r, r * 0.66, [0xf2f2ee, 0xd8b890, 0x9ab8c8][v % 3]);
      E(c, r + 4, r, 2, 1.5, 0xf4f4f0);
      R(c, r + 4, r - 1, 1, 1, 0x5a3a20);
      return { canvas, ox: r + 2, oy: r + 2 };
    }
    case "chair": {
      const cv = chairCanvas(v, !!f.flip);
      return { canvas: cv, ox: 6, oy: 12 };
    }
    default: {
      const { canvas, ox, oy } = boxFurn(f);
      return { canvas, ox, oy };
    }
  }
}

/** 네모 가구 (위에서 본 상판 + 앞면): 바닥 자리 w×h에 높이 tall만큼 서 있다 */
function boxFurn(f: MtFurn): { canvas: HTMLCanvasElement; ox: number; oy: number } {
  const v = f.v ?? 0;
  const tall = TALL[f.kind] ?? 8;
  const W = f.w + 2;
  const Hh = f.h + tall + 3;
  const { canvas, ctx: c } = makeCanvas(W, Hh);
  const top = 0;
  const face = f.h;
  R(c, 2, Hh - 3, W - 4, 3, 0x000000, 0.28);
  const body = (col: Color, faceCol: Color) => {
    R(c, 0, top, W, face + tall, OUT);
    R(c, 1, top + 1, W - 2, face - 1, col);
    R(c, 1, top + 1, W - 2, 1, lighten(col, 0.2));
    R(c, 1, top + face, W - 2, tall - 1, faceCol);
  };
  switch (f.kind) {
    case "desk_pod": {
      body(0xd8d0c0, 0x8a8478);
      // 칸막이 (가운데 십자, 천 색) + 모니터 넷
      const pc = [0x5a7a9a, 0x7a5a6a, 0x5a7a5a][v % 3];
      R(c, 1, top + face / 2 - 2, W - 2, 4, pc);
      R(c, W / 2 - 2, top + 1, 4, face - 1, pc);
      for (const [x, y] of [[6, 3], [W - 18, 3], [6, face / 2 + 3], [W - 18, face / 2 + 3]]) {
        R(c, x, y, 12, 5, 0x2a2e3a);
        R(c, x + 1, y + 1, 10, 3, hash2(x, y, v) < 0.5 ? 0x6ab0e8 : 0x3a3f4a);
      }
      break;
    }
    case "bench_row": {
      body(0x3a4258, 0x262c3a);
      for (let x = 3; x < W - 6; x += 10) {
        R(c, x, top + 1, 8, face - 2, [0x4a5a8a, 0x8a4a4a, 0x4a7a5a][v % 3]);
        R(c, x, top + 1, 8, 1, 0x9aa8c8);
      }
      break;
    }
    case "lectern":
      body(0x6a4a34, 0x4a3424);
      R(c, 4, top + 2, W - 8, 3, 0xf2f2ee);
      R(c, W / 2 - 1, top + face, 2, 3, 0x2a2a30);
      break;
    case "sofa":
      body(0x6a3a3a, 0x4a2a2a);
      for (let x = 4; x < W - 6; x += 16) R(c, x, top + 3, 14, face - 5, 0x7a4646);
      break;
    case "plant": {
      R(c, 2, Hh - 12, W - 4, 9, 0xb06a3a);
      R(c, 1, Hh - 13, W - 2, 2, 0xc87a4a);
      for (let i = 0; i < 9; i++) E(c, 3 + hash2(i, 1, v) * (W - 6), 2 + hash2(i, 2, v) * (Hh - 14), 3, 4, i % 2 ? 0x2e6a2e : 0x3a8a3a);
      break;
    }
    case "counter":
      body(0xe8e0d0, 0x8a6a4a);
      for (let x = 6; x < W - 10; x += 22) {
        R(c, x, top + 3, 8, 6, 0x2a2a30);
        R(c, x + 1, top + 4, 6, 2, 0x6ad0ff);
      }
      R(c, W - 30, top + 2, 20, 8, 0xc8c8c8);
      break;
    case "vending":
      body(v ? 0xd03a3a : 0x2a6ac8, 0x1a1a24);
      R(c, 3, top + face + 2, W - 6, tall - 6, 0x0a1420);
      for (let y = top + face + 3; y < top + face + tall - 4; y += 4) for (let x = 4; x < W - 4; x += 3) R(c, x, y, 2, 2, [0xf0d050, 0x6aff8a, 0xffffff, 0xff6a6a][(x + y) % 4]);
      break;
    case "booth": {
      // 전화 부스: 유리 문 + 안에 작은 의자·노트북 불빛
      body(0x3a3e4a, 0x2a2e38);
      R(c, 3, top + face + 1, W - 6, tall - 3, 0x6a8aa8, 0.6);
      R(c, 4, top + face + 2, 1, tall - 5, 0xe8f4ff, 0.7);
      R(c, W / 2 - 4, top + face + tall - 9, 8, 4, [0x6ab0e8, 0x3a3f4a, 0xffd07a, 0x8aff9a][v % 4]);
      R(c, 2, top + 2, W - 4, 3, [0x6aff8a, 0xff5a5a, 0x6aff8a, 0xffd04a][v % 4]);
      break;
    }
    case "pillar":
      break;
    case "credenza":
      body(0x5a4030, 0x3a2a1e);
      for (let x = 4; x < W - 8; x += 15) R(c, x, top + face + 2, 12, tall - 4, 0x4a3426);
      R(c, 8, top + 2, 6, 3, 0x3a8a3a);
      R(c, W - 16, top + 2, 8, 3, 0xf2f2ee);
      break;
    case "podium":
      body(0x5a2a20, 0x3a1a14);
      R(c, W / 2 - 6, top + face + 3, 12, 6, 0xc8a050);
      R(c, W / 2 - 1, top - 0, 2, 4, 0x2a2a30);
      break;
    case "board_stand":
      R(c, 0, 0, W, Hh - 3, OUT);
      R(c, 1, 1, W - 2, Hh - 9, 0xf4f6f8);
      for (let i = 0; i < 4; i++) R(c, 4, 4 + i * 5, 8 + hash2(i, 1, v) * (W - 16), 1, [0x2a5ac8, 0xd03a3a, 0x2a9a5a, 0x2a5ac8][i]);
      R(c, 3, Hh - 8, 2, 5, 0x5a5a64);
      R(c, W - 5, Hh - 8, 2, 5, 0x5a5a64);
      break;
    case "cooler":
      body(0xe8ecf0, 0xa8b0bc);
      R(c, 2, -0, W - 4, 4, 0x8ac8f0);
      break;
    default:
      body(0x8a8a94, 0x5a5a64);
  }
  return { canvas, ox: W / 2, oy: f.h };
}

/** 가구 앞면 높이 (위에서 본 3/4 — 서 있는 높이) */
const TALL: Partial<Record<MtFurnKind, number>> = { desk_pod: 7, bench_row: 5, lectern: 14, sofa: 8, plant: 14, counter: 12, vending: 30, booth: 34, credenza: 10, podium: 14, board_stand: 20, cooler: 16 };

/** 기둥 (원기둥 위로 길게) */
export function pillarCanvas(r: number): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(r * 2 + 2, 52);
  E(c, r + 1, 48, r + 2, 3, 0x000000, 0.3);
  R(c, 1, 4, r * 2, 44, OUT);
  R(c, 2, 4, r * 2 - 2, 43, 0x8a7a64);
  R(c, 2, 4, 3, 43, 0xb8a88c);
  R(c, r * 2 - 3, 4, 2, 43, 0x6a5a48);
  R(c, 0, 0, r * 2 + 2, 5, 0xc8a050);
  return canvas;
}

// ── 소품 그림 (MeetingRoom이 이미지로 올린다) ──

/** 긴 회의 테이블 (위에서 본 상판 + 앞면). 노트북·서류·컵·회의용 스피커폰 */
export function longTableCanvas(w: number, h: number, salt: number): HTMLCanvasElement {
  const front = 6;
  const { canvas, ctx: c } = makeCanvas(w + 2, h + front + 4);
  // 그림자 → 다리 → 앞면 → 상판
  R(c, 3, h + front, w - 4, 3, 0x000000, 0.3);
  R(c, 4, h, 3, front + 2, 0x2a2a30);
  R(c, w - 5, h, 3, front + 2, 0x2a2a30);
  R(c, 1, h - 1, w, front, 0x6a4a34);
  R(c, 1, h - 1, w, 1, 0x8a6448);
  R(c, 1, 0, w, h, 0xa87a54);
  for (let y = 2; y < h; y += 3) R(c, 2, y, w - 2, 1, 0x9a6e4a);
  R(c, 1, 0, w, 1, 0xc89a6e);
  R(c, 0, 0, 1, h + front - 1, OUT);
  R(c, w + 1, 0, 1, h + front - 1, OUT);
  // 가운데 스피커폰 (세모)
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  for (let i = 0; i < 4; i++) R(c, cx - 4 + i, cy - 2 + i, 9 - i * 2, 1, 0x2a2a30);
  R(c, cx, cy - 1, 1, 1, 0x6aff8a);
  // 자리마다 노트북·서류·컵
  const seats = Math.max(2, Math.floor(w / 26));
  for (let i = 0; i < seats; i++) {
    const x = Math.round(((i + 0.5) * w) / seats) - 5;
    for (const top of [true, false]) {
      const y = top ? 2 : h - 8;
      const kind = hash2(i, top ? 1 : 2, salt);
      if (kind < 0.5) {
        // 노트북 (화면이 켜져 있다)
        R(c, x, y, 10, 6, 0x9aa0aa);
        R(c, x + 1, y + (top ? 0 : 1), 8, 4, top ? 0x3a3f4a : 0x6ab0e8);
        if (top) R(c, x + 1, y + 4, 8, 1, 0xc8ccd4);
      } else if (kind < 0.8) {
        R(c, x + 1, y + 1, 7, 5, 0xf2f2ee);
        R(c, x + 2, y + 2, 5, 1, 0x8a8a94);
        R(c, x + 2, y + 4, 4, 1, 0x8a8a94);
      }
      if (hash2(i, top ? 3 : 4, salt) < 0.55) {
        E(c, x + 12, y + 3, 2, 2, 0xf4f4f0);
        R(c, x + 12, y + 2, 1, 1, 0x5a3a20);
      }
    }
  }
  return canvas;
}

/** 둥근 회의 테이블 */
export function roundTableCanvas(r: number, v = 0): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(r * 2 + 2, r * 2 + 8);
  E(c, r + 1, r + 6, r, r * 0.55, 0x000000, 0.3);
  R(c, r - 1, r + 1, 4, 6, 0x2a2a30);
  E(c, r + 1, r, r + 1, r * 0.62 + 1, OUT);
  // v=1: 임원 회의실 짙은 호두나무
  const [edge, top, hi] = v === 1 ? [0x3a2418, 0x6a4028, 0x7a4c30] : [0x6a4a34, 0xa87a54, 0xb4865e];
  E(c, r + 1, r + 2, r, r * 0.6, edge);
  E(c, r + 1, r, r, r * 0.6, top);
  E(c, r + 1, r - 1, r - 3, r * 0.6 - 3, hi);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const x = r + 1 + Math.cos(a) * r * 0.62;
    const y = r + Math.sin(a) * r * 0.36;
    R(c, x - 3, y - 2, 6, 4, k % 2 ? 0xf2f2ee : 0x9aa0aa);
  }
  return canvas;
}

/** 메쉬 사무 의자 (위에서 본 3/4). v: 색 */
export function chairCanvas(v: number, back: boolean): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(12, 14);
  const col = [0x2a2e3a, 0x3a3048, 0x2a3a3a][v % 3];
  E(c, 6, 12, 5, 1.5, 0x000000, 0.3);
  R(c, 5, 9, 2, 3, 0x1a1a20);
  if (back) {
    R(c, 1, 0, 10, 7, OUT);
    R(c, 2, 1, 8, 5, col);
    for (let x = 3; x < 10; x += 2) R(c, x, 2, 1, 3, lighten(col, 0.15));
    R(c, 1, 6, 10, 4, OUT);
    R(c, 2, 6, 8, 3, darken(col, 0.1));
  } else {
    R(c, 1, 3, 10, 6, OUT);
    R(c, 2, 4, 8, 4, col);
    R(c, 2, 4, 8, 1, lighten(col, 0.2));
    R(c, 1, 8, 10, 2, OUT);
  }
  return canvas;
}

/** 밀려오는 테이블 줄 한 칸 (나무 회의 테이블 + 안쪽으로 밀린 의자 등받이 + 서류·컵). horiz: 위·아래 줄, 아니면 옆 줄 */
export function bankTileCanvas(horiz: boolean): HTMLCanvasElement {
  const w = horiz ? 40 : 24;
  const h = horiz ? 24 : 40;
  const { canvas, ctx: c } = makeCanvas(w, h);
  R(c, 0, 0, w, h, 0x1e1a26);
  const tw = horiz ? w - 2 : w - 6;
  const th = horiz ? h - 7 : h - 2;
  R(c, 1, 1, tw, th, 0x9a6e48);
  for (let y = 3; y < th; y += 3) R(c, 2, y, tw - 2, 1, 0x8e6442);
  R(c, 1, 1, tw, 1, 0xc0946a);
  R(c, 1, th, tw, 3, 0x5a3e2a);
  R(c, 0, 0, 1, h, OUT);
  R(c, 0, 0, w, 1, OUT);
  // 서류·노트북·커피
  R(c, 5, 5, 8, 6, 0xf2f2ee);
  R(c, 6, 6, 6, 1, 0x8a8a94);
  if (horiz) {
    R(c, 22, 4, 10, 6, 0x9aa0aa);
    R(c, 23, 5, 8, 4, 0x6ab0e8);
    E(c, 18, 12, 2, 2, 0xf4f4f0);
    // 안쪽(아래)으로 삐져나온 의자 등받이
    for (const x of [6, 26]) R(c, x, h - 5, 9, 4, 0x2a2e3a);
  } else {
    R(c, 5, 20, 8, 6, 0x9aa0aa);
    R(c, 6, 21, 6, 4, 0x6ab0e8);
    E(c, 9, 32, 2, 2, 0xf4f4f0);
    for (const y of [6, 26]) R(c, w - 5, y, 4, 9, 0x2a2e3a);
  }
  return canvas;
}

/** 바닥 경고 줄 (노랑·검정 사선) — 이만큼 밀려온다 */
export function hazardCanvas(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) R(c, x, y, 1, 1, (x + y) % 16 < 8 ? 0xf0c020 : 0x1a1a1a, 0.85);
  return canvas;
}

/** 커피 웅덩이 */
export function puddleCanvas(salt: number): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(36, 20);
  E(c, 18, 10, 16, 8, 0x3a2414);
  E(c, 11 + hash2(salt, 1, 3) * 4, 8, 7, 4, 0x4a2e18);
  E(c, 24, 12, 8, 5, 0x4a2e18);
  E(c, 14, 7, 4, 1.5, 0x8a6040, 0.8);
  R(c, 26, 9, 3, 1, 0xc8a080, 0.7);
  for (let i = 0; i < 5; i++) E(c, 2 + hash2(i, salt, 5) * 32, 2 + hash2(i, salt, 6) * 16, 1.2, 1, 0x3a2414);
  return canvas;
}

/** 날아오는 발표 슬라이드 한 장 */
export function slideShotCanvas(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(9, 7);
  R(c, 0, 0, 9, 7, OUT);
  R(c, 1, 1, 7, 5, 0xf8f8f8);
  R(c, 1, 1, 7, 1, 0xe8402a);
  R(c, 2, 4, 1, 1, 0x2a5ac8);
  R(c, 4, 3, 1, 2, 0x2a5ac8);
  R(c, 6, 2, 1, 3, 0xe8402a);
  return canvas;
}

/** 회의 주재자가 돌며 쏘는 탄 (볼펜 딸깍) */
export function penShotCanvas(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(7, 7);
  E(c, 3.5, 3.5, 3.4, 3.4, 0x6a4a10);
  E(c, 3.5, 3.5, 2.5, 2.5, 0xffd050);
  R(c, 3, 2, 1, 1, 0xffffff);
  return canvas;
}

/** 회의록 담당이 남기는 내 그림자 (잉크 실루엣) */
export function inkShadowCanvas(): HTMLCanvasElement {
  const g = new Grid(14, 22);
  const ink = 0x1a1430;
  g.ellipse(7, 5, 4, 4.2, ink);
  g.rect(3, 9, 8, 8, ink);
  g.rect(3, 17, 3, 4, ink);
  g.rect(8, 17, 3, 4, ink);
  g.rect(1, 10, 2, 6, ink);
  g.rect(11, 10, 2, 6, ink);
  g.set(5, 5, 0xc8a0ff);
  g.set(8, 5, 0xc8a0ff);
  g.outline(0x8a5aff);
  return g.toCanvas();
}

/** 의견 없음: 몸은 비치고 테두리만 아른거린다 → 시트에서 외곽선만 남긴 그림 */
export function outlineOnly(src: HTMLCanvasElement, col: Color): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  const sc = src.getContext("2d")!;
  const img = sc.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const out = ctx.createImageData(src.width, src.height);
  const o = out.data;
  const r0 = (OUT >> 16) & 255;
  const g0 = (OUT >> 8) & 255;
  const b0 = OUT & 255;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const edge = d[i] === r0 && d[i + 1] === g0 && d[i + 2] === b0;
    o[i] = (col >> 16) & 255;
    o[i + 1] = (col >> 8) & 255;
    o[i + 2] = col & 255;
    o[i + 3] = edge ? 255 : 40;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// ── 몬스터 16종 ──

type Pose = { f: number; step: number; atk: number; hurt: boolean };
type Paint = (g: Grid, s: number, m: Color, a: Color, p: Pose) => void;

const leg = (p: Pose) => (p.step < 0 ? 0 : p.step % 2 === 0 ? 1 : -1);
const lift = (p: Pose) => (p.step === 1 || p.step === 3 ? 1 : 0);

function eyes(g: Grid, x: number, y: number, gap: number, p: Pose, c: Color = EYE): void {
  for (const ex of [x, x + gap]) {
    if (p.hurt) g.hline(ex - 1, ex + 1, y, c);
    else {
      g.set(ex, y, c);
      if (p.atk) g.set(ex + (ex === x ? 1 : -1), y - 1, c);
    }
  }
}

function shade(g: Grid, c: Color, top: number, bottom: number): void {
  const hi = Grid.rgba(c);
  const lt = lighten(c, 0.22);
  const dk = darken(c, 0.22);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== hi) continue;
      if (y <= top && g.get(x, y - 2) === 0) g.set(x, y, lt);
      else if (y >= bottom && (g.get(x, y + 1) === 0 || g.get(x, y + 2) === 0)) g.set(x, y, dk);
    }
}

/** 사람 몸 공통: 머리·몸통·다리 (옷 색 m, 피부 skin) — 키가 작으면 h를 줄인다 */
function person(g: Grid, cx: number, top: number, w: number, body: number, m: Color, p: Pose, skin = 0xe8c8a0, hair = 0x2a2420): void {
  const f = p.f;
  g.ellipse(cx, top + 3 - f, 3.2, 3.2, skin);
  g.rect(cx - 3, top - f, 7, 2, hair);
  g.rect(cx - w / 2, top + 6 - f, w, body, m);
  shade(g, m, top + 7 - f, top + 5 + body);
  const y = top + 6 + body - f;
  g.rect(cx - 3 + leg(p), y, 2, 3, darken(m, 0.45));
  g.rect(cx + 1 - leg(p), y, 2, 3, darken(m, 0.45));
}

export const MT_PAINTS: Record<MtMonsterId, Paint> = {
  // 참조 메일: 날개 달린 봉투 + 빨간 CC 도장. 공격하면 덮개가 입처럼 벌어진다
  mt_cc_mail(g, s, m, a, p) {
    const f = lift(p) + p.f * 0.5;
    const flap = p.atk ? 3 : 0;
    g.rect(1, 5 - f, 14, 9, m);
    shade(g, m, 6 - f, 12 - f);
    for (let i = 0; i < 7; i++) {
      g.set(1 + i, 5 - f + i - flap * (i < 3 ? 1 : 0), darken(m, 0.25));
      g.set(14 - i, 5 - f + i - flap * (i < 3 ? 1 : 0), darken(m, 0.25));
    }
    if (p.atk) g.rect(4, 6 - f, 8, 2, 0x8a2020);
    g.rect(9, 10 - f, 4, 3, 0xd03a3a);
    g.set(10, 11 - f, WHITE);
    eyes(g, 5, 9 - f, 3, p);
    // 날개 (파닥)
    const wy = (p.f + Math.max(0, p.step)) % 2 ? 3 : 6;
    g.rect(0, wy - f, 1, 3, a);
    g.rect(15, wy - f, 1, 3, a);
    g.set(-0, wy - 1 - f, lighten(a, 0.3));
    g.set(15, wy - 1 - f, lighten(a, 0.3));
  },
  // 회신 메일: 노란 봉투 + 되돌아가는 화살표
  mt_cc_reply(g, s, m, a, p) {
    const f = lift(p);
    g.rect(1, 3 - f, s - 2, 7, m);
    shade(g, m, 4 - f, 8 - f);
    for (let i = 0; i < 5; i++) {
      g.set(1 + i, 3 - f + i, darken(m, 0.3));
      g.set(s - 2 - i, 3 - f + i, darken(m, 0.3));
    }
    g.hline(3, 7, 8 - f, a);
    g.set(3, 7 - f, a);
    g.set(4, 6 - f, a);
    eyes(g, 7, 6 - f, 2, p);
    g.rect(3 + leg(p), s - 2, 1, 2, OUT);
    g.rect(s - 4 - leg(p), s - 2, 1, 2, OUT);
  },
  // 전달 메일: 분홍 쪽지 + 앞으로 화살표, 속도선
  mt_cc_fwd(g, s, m, a, p) {
    const f = lift(p);
    g.rect(1, 2 - f, 6, 5, m);
    g.hline(2, 5, 4 - f, a);
    g.set(5, 3 - f, a);
    g.set(5, 5 - f, a);
    if (!p.hurt) g.set(3, 3 - f, EYE);
    g.set(0, 7, lighten(m, 0.3));
    if (p.step >= 0) g.hline(0, 1, 5 - f + leg(p), WHITE);
  },
  // 화이트보드 마커: 하얀 몸통 + 초록 뚜껑·심. 걸으면 기울어 바닥에 선을 긋는다
  mt_marker(g, s, m, a, p) {
    const f = p.f;
    const cx = s / 2;
    g.rect(cx - 3, 2 - f, 6, 3, m);
    g.rect(cx - 3, 1 - f, 6, 1, lighten(m, 0.3));
    g.rect(cx - 3, 5 - f, 6, 6, a);
    shade(g, a, 6 - f, 10 - f);
    g.rect(cx - 3, 7 - f, 6, 2, m);
    g.set(cx - 2, 7 - f, WHITE);
    g.rect(cx - 2, 11 - f, 4, 1, darken(a, 0.3));
    g.rect(cx - 1, 12 - f, 2, 1 + (p.atk ? 1 : 0), m);
    eyes(g, cx - 2, 6 - f, 3, p);
    g.set(cx - 1 + leg(p) * 2, s - 1, m);
    g.set(cx + leg(p) * 2, s - 1, m);
    if (p.atk) g.rect(cx + 3, 3 - f, 3, 2, m);
  },
  // 의견 없음: 입 없는 얼굴 + "…" 말풍선. 거의 보이지 않는다 (외곽선만)
  mt_no_opinion(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    g.ellipse(s / 2 - 1, 5 - f, 4, 4, m);
    g.rect(s / 2 - 5, 9 - f, 8, 4, m);
    for (let x = 0; x < 8; x++) if ((x + Math.max(0, p.step)) % 2) g.set(s / 2 - 5 + x, 13 - f, m);
    if (!p.hurt) {
      g.set(s / 2 - 3, 5 - f, a);
      g.set(s / 2, 5 - f, a);
    }
    g.hline(s / 2 - 3, s / 2, 7 - f, a);
    g.rect(s - 5, 0, 5, 4, WHITE);
    g.set(s - 4, 2, a);
    g.set(s - 3, 2, p.atk ? 0xe8402a : a);
    g.set(s - 2, 2, a);
    g.set(s - 4, 4, WHITE);
  },
  // 발표 자료: 겹친 슬라이드 + 막대그래프, 레이저 포인터 손
  mt_slides(g, s, m, a, p) {
    const f = lift(p);
    g.rect(4, 1 - f, 11, 9, darken(m, 0.18));
    g.rect(2, 2 - f, 11, 9, darken(m, 0.08));
    g.rect(0, 3 - f, 12, 10, m);
    g.rect(0, 3 - f, 12, 2, a);
    g.rect(2, 10 - f, 2, 2, 0x2a5ac8);
    g.rect(5, 8 - f, 2, 4, 0x2a5ac8);
    g.rect(8, 6 - f, 2, 6, a);
    eyes(g, 3, 6 - f, 4, p);
    // 레이저 포인터
    const py = p.atk ? 5 : 9;
    g.rect(12, py - f, 3, 1, 0x3a3a44);
    g.set(15, py - f, p.atk ? 0xff2020 : a);
    g.rect(2 + leg(p), s - 3, 2, 3, OUT);
    g.rect(8 - leg(p), s - 3, 2, 3, OUT);
  },
  // 시계 보는 사람: 정장, 손목을 들어 금시계를 본다, 식은땀
  mt_clock_watcher(g, s, m, a, p) {
    person(g, s / 2, 1, 8, 7, m, p, 0xe0c0a0, 0x5a5a62);
    const f = p.f;
    const cx = s / 2;
    g.rect(cx - 1, 7 - f, 2, 4, WHITE);
    g.set(cx, 8 - f, 0xc83c3c);
    // 들어 올린 팔 + 시계
    g.rect(cx + 4, 6 - f, 2, 4, m);
    g.rect(cx + 2, 5 - f, 4, 2, m);
    g.rect(cx + 1, 4 - f, 3, 3, a);
    g.set(cx + 2, 5 - f, p.atk ? 0xff3a3a : OUT);
    if (!p.hurt) {
      g.set(cx, 3 - f, EYE);
      g.set(cx + 2, 3 - f, EYE);
    } else g.hline(cx - 1, cx + 2, 3 - f, EYE);
    g.set(cx - 3, 2 - f, 0x7ac8ff);
    g.set(cx - 3, 3 - f, 0x7ac8ff);
  },
  // 단톡방 알림: 빨간 동그라미 + 흰 숫자 + 꼬리
  mt_chat_ping(g, s, m, a, p) {
    const f = p.f;
    g.ellipse(s / 2, 4 - f, 4, 4, m);
    g.vline(s / 2, 2 - f, 6 - f, a);
    g.set(s / 2 - 1, 3 - f, a);
    g.rect(s / 2 - 1, 6 - f, 3, 1, a);
    g.set(1 + leg(p), 7 - f, m);
    g.set(2, 8 - f, darken(m, 0.2));
  },
  // 빔프로젝터: 각진 몸통 + 큰 렌즈 + 환기구, 바퀴 받침
  mt_projector(g, s, m, a, p) {
    const f = p.f * 0.5;
    g.rect(1, 4 - f, s - 2, 8, m);
    shade(g, m, 5 - f, 10 - f);
    for (let x = 3; x < 9; x += 2) g.vline(x, 6 - f, 9 - f, darken(m, 0.35));
    g.ellipse(s - 5, 8 - f, 3.4, 3.4, 0x1a1a20);
    g.ellipse(s - 5, 8 - f, 2.4, 2.4, p.atk ? 0xffffff : a);
    g.set(s - 6, 7 - f, WHITE);
    g.set(3, 5 - f, p.f ? 0x6aff8a : 0x2a6a3a);
    g.rect(4, 2 - f, 5, 2, darken(m, 0.2));
    g.rect(3, 12, s - 6, 2, 0x2a2a30);
    g.set(3 + leg(p), 14, OUT);
    g.set(s - 4 - leg(p), 14, OUT);
  },
  // 의자 굴리는 인턴: 파란 후드 + 사원증, 바퀴 의자에 앉아 미끄러진다
  mt_chair_intern(g, s, m, a, p) {
    const f = p.f * 0.5;
    const cx = s / 2;
    g.rect(cx - 6, 3, 3, 9, a);
    g.rect(cx - 5, 10, 11, 3, a);
    g.ellipse(cx + 1, 4 - f, 3.2, 3.2, 0xe8c8a0);
    g.rect(cx - 2, 0 - f, 7, 2, 0x3a2a20);
    g.rect(cx - 2, 7 - f, 7, 5, m);
    shade(g, m, 8 - f, 11);
    g.vline(cx + 1, 8 - f, 10 - f, 0xf0d050);
    g.set(cx + 1, 11 - f, WHITE);
    eyes(g, cx, 4 - f, 2, p);
    if (p.atk) g.rect(cx + 5, 6 - f, 3, 2, m);
    g.vline(cx, 13, 14, 0x3a3f4a);
    g.hline(cx - 5, cx + 5, 14, 0x3a3f4a);
    for (const wx of [cx - 5, cx, cx + 5]) g.set(wx + leg(p), 15, OUT);
  },
  // 커피 쏟는 사람: 흰 셔츠의 갈색 얼룩, 기운 머그컵에서 떨어지는 방울
  mt_coffee(g, s, m, a, p) {
    person(g, s / 2 - 1, 1, 8, 7, m, p, 0xf0d0b0, 0x8a4a2a);
    const f = p.f;
    const cx = s / 2 - 1;
    g.rect(cx - 2, 9 - f, 3, 2, 0x8a5a3a);
    g.set(cx + 1, 11 - f, 0x8a5a3a);
    if (!p.hurt) {
      g.set(cx - 1, 3 - f, EYE);
      g.set(cx + 1, 3 - f, EYE);
      g.hline(cx - 1, cx + 1, 5 - f, 0xc87a6a);
    } else g.hline(cx - 2, cx + 2, 3 - f, EYE);
    const tilt = p.atk ? 2 : (p.f + Math.max(0, p.step)) % 2;
    g.rect(cx + 4, 6 - f, 4, 4 - tilt, WHITE);
    g.rect(cx + 5, 6 - f, 2, 1, a);
    g.set(cx + 8, 7 - f, WHITE);
    g.set(cx + 7, 10 - f + tilt, a);
    g.set(cx + 6, 12 - f, a);
    if (p.atk) g.rect(cx + 5, 13, 4, 1, a);
  },
  // 마이크 하울링: 그릴 망 마이크 머리 + 스탠드, 옆에 소리 고리
  mt_howl(g, s, m, a, p) {
    const f = p.f;
    const cx = s / 2 - 1;
    g.ellipse(cx, 4 - f, 4, 4, m);
    for (let y = 1; y < 8; y += 2) for (let x = -3; x <= 3; x += 2) g.set(cx + x, y - f, lighten(m, 0.25));
    g.rect(cx - 2, 8 - f, 5, 2, 0x5a5a64);
    g.vline(cx, 10 - f, s - 3, 0x8a8a94);
    g.hline(cx - 4, cx + 4, s - 2, 0x3a3a44);
    g.set(cx - 4 + leg(p), s - 1, OUT);
    g.set(cx + 4 - leg(p), s - 1, OUT);
    if (!p.hurt) {
      g.set(cx - 1, 4 - f, p.atk ? 0xff5a5a : a);
      g.set(cx + 2, 4 - f, p.atk ? 0xff5a5a : a);
    }
    const ring = p.atk ? 2 : p.f;
    for (let k = 0; k <= ring; k++) {
      g.vline(cx + 6 + k * 2, 2 - f + k, 6 - f - k + 2, a);
    }
  },
  // 회의 참석자: 졸린 눈 + 노트북 화면이 빛난다
  mt_attendee(g, s, m, a, p) {
    person(g, s / 2, 1, 7, 5, m, p, 0xe8c8a8, 0x4a3a2a);
    const f = p.f;
    const cx = s / 2;
    g.hline(cx - 2, cx - 1, 4 - f, EYE);
    g.hline(cx + 1, cx + 2, 4 - f, EYE);
    g.rect(cx - 4, 8 - f, 9, 1, 0x9aa0aa);
    g.rect(cx - 3, 6 - f, 7, 2, p.atk ? 0xffffff : a);
    if (p.f) {
      g.set(cx + 4, 0, WHITE);
      g.set(cx + 5, 1, WHITE);
    }
  },
  // 정예 안건 추가: 거대한 노란 포스트잇 + 빨간 "+1", 압정, 목록 줄
  mt_agenda(g, s, m, a, p) {
    const f = lift(p) + p.f * 0.5;
    g.rect(2, 2 - f, s - 4, s - 6, m);
    shade(g, m, 3 - f, s - 6);
    for (let i = 0; i < 4; i++) g.hline(s - 6 + i, s - 3, s - 7 - f + i, darken(m, 0.25 + i * 0.05));
    g.ellipse(s / 2, 2 - f, 1.6, 1.6, 0x2a5ac8);
    // "+1"
    g.hline(5, 9, 7 - f, a);
    g.vline(7, 5 - f, 9 - f, a);
    g.vline(12, 5 - f, 9 - f, a);
    g.set(11, 6 - f, a);
    for (let y = 11; y < s - 8; y += 2) g.hline(5, s - 7, y - f, darken(m, 0.4));
    // 화난 눈썹 + 눈
    g.hline(4, 6, 11 - f - (p.atk ? 1 : 0), OUT);
    g.hline(s - 8, s - 6, 11 - f - (p.atk ? 1 : 0), OUT);
    eyes(g, 5, 12 - f, s - 12, p);
    g.rect(5 + leg(p), s - 4, 2, 4, OUT);
    g.rect(s - 7 - leg(p), s - 4, 2, 4, OUT);
  },
  // 중간 우두머리 회의록 담당: 남색 가디건·동그란 안경·올린 머리, 펼친 공책에 받아 적는다
  mt_minutes(g, s, m, a, p) {
    const f = p.f;
    const cx = s / 2;
    g.ellipse(cx, 1.5 - f, 2.5, 2, 0x2a1a14);
    g.ellipse(cx, 6 - f, 4.5, 4.5, 0xf0d0b0);
    g.rect(cx - 5, 3 - f, 10, 2, 0x2a1a14);
    for (const ex of [cx - 2.5, cx + 2.5]) {
      g.ellipse(ex, 6.5 - f, 1.8, 1.8, OUT);
      g.set(ex, 6.5 - f, p.hurt ? OUT : p.atk ? 0xff5a5a : 0xc8e8ff);
    }
    g.rect(cx - 6, 11 - f, 12, 7, m);
    shade(g, m, 12 - f, 16 - f);
    g.vline(cx, 11 - f, 17 - f, lighten(m, 0.2));
    // 펼친 공책 + 펜
    g.rect(cx - 8, 13 - f, 16, 6, a);
    g.vline(cx, 13 - f, 18 - f, darken(a, 0.3));
    for (let y = 14; y < 18; y += 2) {
      g.hline(cx - 7, cx - 2, y - f, 0x8a8a94);
      g.hline(cx + 2, cx + 6 - (y % 4 ? 2 : 0), y - f, 0x3a3a8a);
    }
    const px = p.atk ? cx + 8 : cx + 5 + ((p.f + Math.max(0, p.step)) % 2);
    g.vline(px, 10 - f, 15 - f, 0x2a2a30);
    g.set(px, 16 - f, 0x2a5ac8);
    g.rect(cx - 4 + leg(p), s - 4, 3, 4, darken(m, 0.5));
    g.rect(cx + 1 - leg(p), s - 4, 3, 4, darken(m, 0.5));
  },
  // 우두머리 회의 주재자: 높은 등받이 회전의자 + 금색 넥타이·만년필, 앞에 "주재" 명패
  mt_chair(g, s, m, a, p) {
    const f = p.f + lift(p) * 0.5;
    const cx = s / 2;
    const leather = 0x1a1a24;
    g.rect(cx - 14, 1, 28, 25, leather);
    shade(g, leather, 3, 24);
    for (let y = 4; y < 24; y += 4) g.hline(cx - 11, cx + 11, y, 0x2a2a38);
    g.rect(cx - 14, 1, 28, 1, 0x4a4a5a);
    // 몸통 (남색 양복) + 셔츠 + 금 넥타이
    g.rect(cx - 10, 15 - f, 20, 13, m);
    shade(g, m, 16 - f, 26);
    g.rect(cx - 2, 15 - f, 4, 8, WHITE);
    g.vline(cx, 16 - f, 24 - f, a);
    g.vline(cx - 1, 16 - f, 22 - f, darken(a, 0.2));
    // 머리 (반백 올백) + 콧수염
    g.ellipse(cx, 9 - f, 6.5, 6.5, 0xe8c4a0);
    g.rect(cx - 6, 2 - f, 12, 4, 0xb8b8c0);
    g.rect(cx - 6, 4 - f, 2, 4, 0x9a9aa4);
    g.rect(cx + 4, 4 - f, 2, 4, 0x9a9aa4);
    if (p.hurt) {
      g.hline(cx - 4, cx - 2, 9 - f, OUT);
      g.hline(cx + 2, cx + 4, 9 - f, OUT);
    } else {
      g.rect(cx - 4, 8 - f, 2, 2, p.atk ? 0xff5a3a : OUT);
      g.rect(cx + 2, 8 - f, 2, 2, p.atk ? 0xff5a3a : OUT);
      g.hline(cx - 5, cx - 2, 7 - f - (p.atk ? 1 : 0), 0x6a6a74);
      g.hline(cx + 2, cx + 5, 7 - f - (p.atk ? 1 : 0), 0x6a6a74);
    }
    g.hline(cx - 3, cx + 2, 12 - f, 0x8a8a94);
    if (p.atk) g.rect(cx - 2, 13 - f, 4, 2, OUT);
    // 팔걸이 + 손가락 하나 ("한 가지만 더")
    g.rect(cx - 16, 20, 5, 8, 0x2a2a38);
    g.rect(cx + 11, 20, 5, 8, 0x2a2a38);
    const hy = p.atk === 2 ? 6 : p.atk ? 11 : 18 - f;
    g.rect(cx + 12, hy, 3, 3, 0xe8c4a0);
    g.vline(cx + 13, hy - 3, hy - 1, 0xe8c4a0);
    // 만년필
    g.rect(cx - 15, 17 - f, 2, 6, a);
    // 의자 다리 (오각 바퀴)
    g.rect(cx - 1, 28, 3, 5, 0x3a3f4a);
    g.hline(cx - 11, cx + 11, s - 6, 0x3a3f4a);
    for (const wx of [cx - 11, cx - 4, cx + 4, cx + 11]) g.rect(wx - 1 + leg(p), s - 5, 3, 2, OUT);
    // 명패 "주재"
    g.rect(cx - 7, s - 9, 14, 4, 0x6a4a20);
    g.rect(cx - 6, s - 8, 12, 2, a);
    g.set(cx - 3, s - 8, OUT);
    g.set(cx + 2, s - 8, OUT);
  },
};
