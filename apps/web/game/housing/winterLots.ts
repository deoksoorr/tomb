import type { HouseExteriorMap } from "@/lib/housing/catalog";
import type { MapConcept } from "@/lib/mapConcept";
import { Grid } from "../sprites/pixel";
import { bulbGlowSheet, doorWreath, lightString, snowGrid, snowGridRoof, snowLawn, type Bulb } from "../sprites/winterArt";
import { composeFacade, housePlan, lotFront, lotLayers, roofMask, XMAS, type HousePlan, type LotSize } from "./exterior";

// 11/17 겨울·크리스마스 판 필지 그림 (lib/mapConcept). lotLayers(F2)의 네 층을 받아 겨울 층을 만든다 (자리·크기·충돌은 그대로).
//  겨울: 마당은 눈밭, 지붕은 눈으로 덮고 처마 끝에 고드름, 굴뚝·울타리·뒤뜰 나무 윗면에 눈
//  크리스마스: 겨울 위에 문 리스 + 본채 처마를 따라 전구 줄 (빛 겹은 두 장 번갈아 반짝 — game/world/conceptLights)

export type WinterLot = {
  /** 밤 창 불빛·빛 자리 (계절 층 그대로 — 미리보기 합치기용) */
  lit: Grid;
  info: ReturnType<typeof lotLayers>["info"];
  ground: Grid;
  back: Grid;
  house: Grid;
  front: Grid;
  /** 크리스마스 전구 빛 겹 (프레임 두 장 가로, 한 장 = 필지 크기). 겨울이면 null */
  glow: HTMLCanvasElement | null;
};

const cache = new Map<string, WinterLot>();

export function winterLotLayers(ext: HouseExteriorMap, tier: string, size: LotSize, concept: MapConcept): WinterLot {
  const key = `${concept}:${tier}:${size.w}x${size.h}:${Object.values(ext).join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // 11/19 파츠는 계절 모양으로 다시 그린 층을 쓴다 (흰 울타리가 눈에 묻혀 안 보였다 — 사용자)
  const season = concept === "christmas" ? "christmas" : "winter";
  const L = lotLayers(ext, tier, size, season);
  const mask = roofMask(tier, size);
  // 창 불빛 자리(다락 창 포함)는 지붕이 아니다
  for (let i = 0; i < mask.px.length; i++) if ((L.lit.px[i] & 255) > 0) mask.px[i] = 0;
  const house = snowGridRoof(L.house, mask, 5 + size.w);
  // 바닥: 잔디·길만 눈밭으로 바꾸고, 바닥 파츠(앞마당 꽃밭)는 그 위에 그대로 올린다 (맵 눈 위에 파츠)
  const ground = snowLawn(L.groundBase);
  ground.draw(L.groundTop, 0, 0);
  const front = snowGrid(L.front, 1, 17);
  const p = housePlan(tier, size);
  const bulbs: Bulb[] = [];
  // 눈을 얹은 뒤 장식 (장식 위에 눈이 쌓이지 않게)
  decorate(house, front, p, ext, concept, bulbs);
  let glow: HTMLCanvasElement | null = null;
  if (concept === "christmas") glow = dressHouse(house, tier, size, bulbs);
  const out: WinterLot = { ground, back: snowGrid(L.back, 2, 13), house, front, glow, lit: L.lit, info: L.info };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

/** 11/19 외관 꾸미기 미리보기·아이콘: 겨울·크리스마스 층을 한 장으로 */
export function winterFacadeGrid(ext: HouseExteriorMap, tier: string, size: LotSize, concept: MapConcept, night: boolean): Grid {
  const W = winterLotLayers(ext, tier, size, concept);
  return composeFacade(W, night);
}

const px = (g: Grid, x: number, y: number, c: number) => g.set(Math.round(x), Math.round(y), c);

/** 산타 모자 (꼭대기 왼쪽 위로 눕힌 고깔 + 흰 털 + 방울). x·y = 챙 왼쪽 끝, w = 챙 폭 */
function santaHat(g: Grid, x: number, y: number, w: number): void {
  g.hline(x, x + w - 1, y, XMAS.white);
  for (let i = 1; i <= 3; i++) {
    g.hline(x + i, x + w - 1 - i, y - i, XMAS.red);
    px(g, x + w - 1 - i, y - i, XMAS.redD);
  }
  // 고깔 끝이 오른쪽으로 꺾이고 흰 방울
  px(g, x + w - 4, y - 4, XMAS.red);
  px(g, x + w - 3, y - 4, XMAS.redD);
  px(g, x + w - 2, y - 4, XMAS.white);
  px(g, x + w - 2, y - 3, XMAS.white);
}

/** 호랑가시 한 줄기 (잎 둘 + 열매 둘). x·y = 가운데 */
function holly(g: Grid, x: number, y: number): void {
  for (const [dx, dy] of [[-3, 0], [-2, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [2, -1], [3, 0]] as const) px(g, x + dx, y + dy, XMAS.holly);
  px(g, x - 2, y + 1, XMAS.hollyL);
  px(g, x + 2, y + 1, XMAS.hollyL);
  px(g, x, y - 1, XMAS.berry);
  px(g, x + 1, y, XMAS.berry);
  px(g, x, y, XMAS.redD);
}

/** 금빛 별 (가운데 + 네 방향, 가운데 하양) */
function star(g: Grid, x: number, y: number, c: number = XMAS.gold): void {
  for (const [dx, dy] of [[0, -2], [0, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [0, 1], [-1, 2], [1, 2]] as const) px(g, x + dx, y + dy, c);
  px(g, x, y, 0xfff6d0);
}

/** 리본 매듭 (가운데 + 양쪽 고리 + 늘어진 끈) */
function bow(g: Grid, x: number, y: number, c: number = XMAS.red): void {
  for (const [dx, dy] of [[-2, -1], [-1, 0], [-2, 1], [2, -1], [1, 0], [2, 1], [0, 0], [-1, 2], [1, 2]] as const) px(g, x + dx, y + dy, c);
  px(g, x, y, XMAS.redD);
}

/**
 * 11/19 파츠별 계절 장식 (눈을 얹은 뒤에 그린다). bulbs = 크리스마스 빛 겹에 더할 전구·촛불
 *  - 크리스마스: 지붕마다 꼭대기 장식(붉은 기와 금별, 청록 은별, 초가 리본, 이끼 호랑가시) · 벽마다 창 장식(벽돌 상록 줄, 돌벽 창가 촛불,
 *    흰 회벽 사탕 기둥, 판자 미니 리스) · 우편함 산타 모자 · 간판 호랑가시·네온 빨강초록 · 생울타리 전구 · 돌담 촛불 · 정원 등불 리본 · 가로등 리본
 *  - 겨울: 유령 우편함 목도리
 */
function decorate(house: Grid, front: Grid, p: HousePlan, ext: HouseExteriorMap, concept: MapConcept, bulbs: Bulb[]): void {
  const f = lotFront(p);
  const H = p.H;
  const fy = H - 3;
  const xmas = concept === "christmas";
  // 우편함
  if (ext.mailbox !== "mailbox_none") {
    const mx = f.mailX;
    const my = H - 6;
    if (ext.mailbox === "mailbox_ghost") {
      // 목도리 (겨울 파랑 · 크리스마스 빨강 줄무늬)
      const c1 = xmas ? XMAS.red : 0x4a78b8;
      const c2 = xmas ? XMAS.white : 0x9ac0e8;
      for (let x = mx - 1; x <= mx + 7; x++) px(front, x, my - 9, x % 2 ? c1 : c2);
      for (let y = my - 9; y <= my - 6; y++) px(front, mx + 6, y, y % 2 ? c1 : c2);
      if (xmas) santaHat(front, mx - 1, my - 17, 8);
    } else if (xmas) {
      santaHat(front, mx - 1, my - 16, 9);
      // 산타에게 보내는 편지
      front.rect(mx + 1, my - 12, 4, 2, XMAS.white);
      px(front, mx + 4, my - 12, XMAS.red);
    }
  }
  if (!xmas) return;
  // 간판
  if (ext.sign !== "sign_none") {
    const sx = Math.min(f.signX, p.W - 21);
    const sy = H - 5;
    if (ext.sign === "sign_neon") {
      // 빨강·초록 번갈아 빛나는 테두리 + 가운데 별
      for (let x = sx; x <= sx + 16; x++) {
        px(front, x, sy - 18, Math.floor(x / 2) % 2 ? XMAS.poinsL : 0x7ae08a);
        px(front, x, sy - 9, Math.floor(x / 2) % 2 ? 0x7ae08a : XMAS.poinsL);
      }
      for (let y = sy - 18; y <= sy - 9; y++) {
        px(front, sx, y, Math.floor(y / 2) % 2 ? XMAS.poinsL : 0x7ae08a);
        px(front, sx + 16, y, Math.floor(y / 2) % 2 ? 0x7ae08a : XMAS.poinsL);
      }
      front.hline(sx + 4, sx + 12, sy - 14, 0x2a1e34);
      star(front, sx + 8, sy - 14, XMAS.gold);
      bulbs.push({ x: sx + 8, y: sy - 14, c: XMAS.gold });
    } else holly(front, sx + 4, sy - 19);
  }
  // 울타리
  if (ext.fence === "fence_hedge") {
    const colors = [XMAS.poinsL, XMAS.gold, 0x7ac8ff, 0xf6f2ea];
    for (let x = 4, i = 0; x < p.W - 4; x += 4, i++) {
      if (Math.abs(x + 0.5 - p.cx) < f.gap) continue;
      const y = fy - 3 - (i % 2);
      const c = colors[i % colors.length];
      px(front, x, y, c);
      bulbs.push({ x, y, c });
    }
  } else if (ext.fence === "fence_stone") {
    // 담 위 작은 촛불
    for (let x = 6; x < p.W - 6; x += 12) {
      if (Math.abs(x + 0.5 - p.cx) < f.gap + 2) continue;
      front.vline(x, fy - 6, fy - 5, XMAS.white);
      px(front, x, fy - 7, 0xffd060);
      bulbs.push({ x, y: fy - 7, c: 0xffd060 });
    }
  } else if (ext.fence === "fence_picket") {
    for (const gx of [p.cx - f.gap, p.cx + f.gap - 1]) bow(front, gx, fy - 11);
  }
  // 정원 등불: 기둥에 리본
  if (ext.garden === "garden_lanterns") for (const lx of f.lanterns) bow(front, lx, p.baseY + 3);
  // 거리 가로등: 기둥에 리본
  bow(front, f.lampX, H - 13);
  // 지붕 꼭대기 장식 (본채)
  const main = p.blocks.find((b) => b.main) ?? p.blocks[0];
  const mid = main.x + main.w / 2 - 0.5;
  const top = p.baseY - main.wallH - main.roofH + 2;
  if (ext.roof === "roof_red") {
    star(house, mid, top - 3);
    bulbs.push({ x: Math.round(mid), y: top - 3, c: XMAS.gold });
  } else if (ext.roof === "roof_teal") {
    star(house, mid, top - 3, 0x5ab0e0);
    bulbs.push({ x: Math.round(mid), y: top - 3, c: 0x9ad8ff });
  } else if (ext.roof === "roof_thatch") bow(house, mid, top - 1);
  else if (ext.roof === "roof_moss") holly(house, mid, top - 1);
  // 벽 장식 (채마다 창)
  for (const b of p.blocks) {
    const wallTop = p.baseY - b.wallH;
    if (ext.facade === "facade_white") {
      // 흰 회벽: 모서리 기둥을 사탕 지팡이 줄무늬로
      for (let y = wallTop + 3; y < p.baseY - 3; y++)
        for (const x of [b.x, b.x + b.w - 1]) px(house, x, y, Math.floor(y / 2) % 2 ? XMAS.red : XMAS.white);
    }
    for (const w of b.wins) {
      const cxw = w.x + Math.floor(w.w / 2);
      if (ext.facade === "facade_brick") {
        // 창 위 상록 줄 + 가운데 빨간 리본
        house.hline(w.x - 2, w.x + w.w + 1, w.y - 3, XMAS.holly);
        for (let x = w.x - 2; x <= w.x + w.w + 1; x += 2) px(house, x, w.y - 2, XMAS.hollyL);
        bow(house, cxw, w.y - 4);
      } else if (ext.facade === "facade_stone") {
        // 창가 촛불
        house.vline(cxw, w.y + w.h - 2, w.y + w.h, XMAS.white);
        px(house, cxw, w.y + w.h - 3, 0xffd060);
        bulbs.push({ x: cxw, y: w.y + w.h - 3, c: 0xffd060 });
      } else if (ext.facade !== "facade_white") {
        // 판자: 창 위 작은 리스
        for (const [dx, dy] of [[-1, -1], [0, -2], [1, -1], [-1, 0], [1, 0], [0, 1]] as const) px(house, cxw + dx, w.y - 4 + dy, XMAS.holly);
        px(house, cxw, w.y - 3, XMAS.berry);
      }
    }
  }
}

/** 문 리스 + 처마 전구 줄을 집 그리드에 그리고, 전구 빛 겹을 돌려준다 (extra = 파츠 장식의 전구·촛불) */
function dressHouse(g: Grid, tier: string, size: LotSize, extra: Bulb[] = []): HTMLCanvasElement {
  const p = housePlan(tier, size);
  // 문 위 리스 (문 가운데 윗부분)
  const wreath = doorWreath();
  const wctx = wreath.getContext("2d")!;
  const wd = wctx.getImageData(0, 0, wreath.width, wreath.height).data;
  const wx = Math.round(p.door.x + p.door.w / 2 - wreath.width / 2);
  const wy = p.door.y + 1;
  for (let y = 0; y < wreath.height; y++)
    for (let x = 0; x < wreath.width; x++) {
      const i = (y * wreath.width + x) * 4;
      if (wd[i + 3] < 128) continue;
      g.set(wx + x, wy + y, (wd[i] << 16) | (wd[i + 1] << 8) | wd[i + 2]);
    }
  // 채마다 처마를 따라 늘어진 전구 줄 (처마 끝 한 줄 아래)
  const bulbs: Bulb[] = [];
  for (const b of p.blocks) {
    const y = p.baseY - b.wallH + 2;
    const s = lightString(b.w + 2, 0, 3);
    const ctx = s.canvas.getContext("2d")!;
    const d = ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
    const ox = b.x - 1 - s.ox;
    const oy = y - s.oy;
    for (let yy = 0; yy < s.canvas.height; yy++)
      for (let xx = 0; xx < s.canvas.width; xx++) {
        const i = (yy * s.canvas.width + xx) * 4;
        if (d[i + 3] < 128) continue;
        g.set(ox + xx, oy + yy, (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      }
    for (const bl of s.bulbs) bulbs.push({ x: ox + bl.x, y: oy + bl.y, c: bl.c });
  }
  return bulbGlowSheet(size.w, size.h, [...bulbs, ...extra]);
}
