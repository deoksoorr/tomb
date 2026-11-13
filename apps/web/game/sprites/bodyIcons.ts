import { premiumBody } from "@tomb/protocol";
import { BODY_PART_PREFIX } from "@/lib/lookScore";
import { avatarFrameGrid } from "./avatar";
import { Grid } from "./pixel";

// 프리미엄 외형 아이콘 (16×16, 꾸미기 랭킹 한 줄에 착용 파츠와 나란히): 그 몸의 정면 서 있는 그림(20×28)을 16×16에 담는다.
//  - 보통은 그림 윗부분 16×16 (머리·어깨 — 왕관·고양이 탈·커피잔 테두리처럼 몸마다 다른 곳이 다 보인다)
//  - 그림이 아주 길면(우산처럼 머리 위로 높이 올라가는 몸) 통째로 줄여 담는다 (윗부분만 자르면 무엇인지 모른다)
// id는 "body:{몸 id}" (lib/lookScore BODY_PART_PREFIX). 프리미엄 외형이 아니면 null

const SIZE = 16;
/** 그림 높이가 이보다 크면 잘라 내지 않고 줄인다 */
const SHRINK_OVER = 24;

export function isBodyIconId(itemId: string): boolean {
  return itemId.startsWith(BODY_PART_PREFIX) && !!premiumBody(itemId.slice(BODY_PART_PREFIX.length));
}

/** 그림이 있는 칸의 경계 */
function bounds(g: Grid): { x: number; y: number; w: number; h: number } {
  let x0 = g.w;
  let y0 = g.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.filled(x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? { x: 0, y: 0, w: g.w, h: g.h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function bodyIconGrid(itemId: string): Grid | null {
  if (!isBodyIconId(itemId)) return null;
  const src = avatarFrameGrid(itemId.slice(BODY_PART_PREFIX.length), "down", 0);
  const b = bounds(src);
  const out = new Grid(SIZE, SIZE);
  if (b.h > SHRINK_OVER) {
    // 통째로 줄이기 (가장 가까운 픽셀, 가로세로 비율 유지, 아래 가운데 정렬)
    const s = SIZE / Math.max(b.w, b.h);
    const w = Math.round(b.w * s);
    const h = Math.round(b.h * s);
    const ox = Math.floor((SIZE - w) / 2);
    const oy = SIZE - h;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = b.x + Math.min(b.w - 1, Math.floor((x + 0.5) / s));
        const sy = b.y + Math.min(b.h - 1, Math.floor((y + 0.5) / s));
        out.px[(oy + y) * SIZE + ox + x] = src.get(sx, sy);
      }
    return out;
  }
  // 윗부분 16×16 (가로는 가운데)
  const ox = b.x + Math.floor((b.w - SIZE) / 2);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) out.px[y * SIZE + x] = src.get(ox + x, b.y + y);
  return out;
}
