import type { HouseExteriorMap } from "@/lib/housing/catalog";
import type { MapConcept } from "@/lib/mapConcept";
import { Grid } from "../sprites/pixel";
import { bulbGlowSheet, doorWreath, lightString, snowGrid, snowGridRoof, snowLawn, type Bulb } from "../sprites/winterArt";
import { housePlan, roofMask, type LotLayers, type LotSize } from "./exterior";

// 11/17 겨울·크리스마스 판 필지 그림 (lib/mapConcept). lotLayers(F2)의 네 층을 받아 겨울 층을 만든다 (자리·크기·충돌은 그대로).
//  겨울: 마당은 눈밭, 지붕은 눈으로 덮고 처마 끝에 고드름, 굴뚝·울타리·뒤뜰 나무 윗면에 눈
//  크리스마스: 겨울 위에 문 리스 + 본채 처마를 따라 전구 줄 (빛 겹은 두 장 번갈아 반짝 — game/world/conceptLights)

export type WinterLot = {
  ground: Grid;
  back: Grid;
  house: Grid;
  front: Grid;
  /** 크리스마스 전구 빛 겹 (프레임 두 장 가로, 한 장 = 필지 크기). 겨울이면 null */
  glow: HTMLCanvasElement | null;
};

const cache = new Map<string, WinterLot>();

export function winterLotLayers(L: LotLayers, ext: HouseExteriorMap, tier: string, size: LotSize, concept: MapConcept): WinterLot {
  const key = `${concept}:${tier}:${size.w}x${size.h}:${Object.values(ext).join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mask = roofMask(tier, size);
  // 창 불빛 자리(다락 창 포함)는 지붕이 아니다
  for (let i = 0; i < mask.px.length; i++) if ((L.lit.px[i] & 255) > 0) mask.px[i] = 0;
  const house = snowGridRoof(L.house, mask, 5 + size.w);
  let glow: HTMLCanvasElement | null = null;
  if (concept === "christmas") glow = dressHouse(house, tier, size);
  const out: WinterLot = { ground: snowLawn(L.ground), back: snowGrid(L.back, 2, 13), house, front: snowGrid(L.front, 1, 17), glow };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

/** 문 리스 + 처마 전구 줄을 집 그리드에 그리고, 전구 빛 겹을 돌려준다 */
function dressHouse(g: Grid, tier: string, size: LotSize): HTMLCanvasElement {
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
  return bulbGlowSheet(size.w, size.h, bulbs);
}
