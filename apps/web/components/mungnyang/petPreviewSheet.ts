import { FX_ART, type FxArtId } from "@/game/sprites/cosmeticFx";
import { Grid } from "@/game/sprites/pixel";

// 11/20 분양사 보리 창 펫 미리보기 시트 (사용자 「옆으로 돌리면 왼쪽·오른쪽이 잘린다」).
// 옆모습 프레임이 칸 끝까지 칠해진 그림은 테(외곽선)가 칸 밖으로 나가 잘린 면이 크게 보였다.
//  - 품종 펫 12종은 그림 쪽(petBreeds BREED_PAD_X·BREED_PAD_TOP)에서 여백을 두고 그려 게임 속에서도 고쳤다
//  - 예전 그림(퇴근 강아지·사무실 고양이 12×10, 듬직한 큰 개 24×22)은 동물원·마을에서도 같은 그림을 써서 크기를 바꾸지 않고,
//    미리보기에서만 칸 둘레에 1칸 여백을 두고 칸 끝에 닿은 색칠 픽셀 바깥에 그 그림의 테 색을 한 칸 이어 그려 면을 닫는다

/** 미리보기 칸 여백 (좌우·위). 아래는 발바닥 줄이라 그대로 */
export const PREVIEW_PAD = 1;

export type PreviewSheet = { grid: Grid; w: number; h: number; frames: number };

/** 그림의 테 색 = 반투명(0 < 알파 < 255) 픽셀 가운데 가장 많은 색 (없으면 null — 닫지 않는다) */
function outlineColor(g: Grid): { c: number; a: number } | null {
  const count = new Map<number, number>();
  for (const v of g.px) {
    const a = v & 255;
    if (a > 0 && a < 255) count.set(v, (count.get(v) ?? 0) + 1);
  }
  let best = 0;
  let n = 0;
  for (const [v, k] of count) if (k > n) [best, n] = [v, k];
  return n ? { c: best >>> 8, a: best & 255 } : null;
}

const cache = new Map<FxArtId, PreviewSheet>();

/** 여백을 둔 미리보기 시트 (프레임 크기 w×h = 원래 + 좌우 2칸·위 1칸) */
export function petPreviewSheet(art: FxArtId): PreviewSheet {
  const hit = cache.get(art);
  if (hit) return hit;
  const a = FX_ART[art];
  const src = a.build();
  const frames = Math.floor(src.w / a.w);
  const P = PREVIEW_PAD;
  const w = a.w + P * 2;
  const h = a.h + P;
  const grid = new Grid(w * frames, h);
  const line = outlineColor(src);
  for (let f = 0; f < frames; f++) {
    const ox = f * w + P;
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) {
        const v = src.px[y * src.w + f * a.w + x];
        if (v & 255) grid.px[(y + P) * grid.w + ox + x] = v;
      }
    if (!line) continue;
    // 칸 끝에 닿은 색칠 픽셀(불투명) 바깥에 테 한 칸
    const solid = (x: number, y: number) => (src.px[y * src.w + f * a.w + x] & 255) === 255;
    for (let y = 0; y < a.h; y++) {
      if (solid(0, y)) grid.set(ox - 1, y + P, line.c, line.a);
      if (solid(a.w - 1, y)) grid.set(ox + a.w, y + P, line.c, line.a);
    }
    for (let x = 0; x < a.w; x++) if (solid(x, 0)) grid.set(ox + x, 0, line.c, line.a);
  }
  const out = { grid, w, h, frames };
  cache.set(art, out);
  return out;
}
