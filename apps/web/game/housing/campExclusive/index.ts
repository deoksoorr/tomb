import * as caravan from "./caravanArt";
import * as pension from "./pensionArt";
import * as rural from "./ruralArt";
import type { CxArt, CxCover, CxCoverArtMap, CxDraw, CxHeldArtMap, CxHeldPoseMap, CxSpinArt, CxTile, CxWindowOverMap } from "./types";
import type { Grid } from "../../sprites/pixel";
import type { Color } from "../../sprites/pixel";

// 11/27 캠핑장 전용 가구 그림 모음 (game/housing/art.ts가 쓴다). 종류마다 그림은 <종류>Art.ts에서만 고친다.

const ALL: readonly CxArt[] = [caravan.CARAVAN_ART, pension.PENSION_ART, rural.RURAL_ART];
/** 그림 파일의 선택 내보내기 (손에 든 물건 heldArt · 누운 사람 덮개 coverArt — 없으면 빈 표) */
type Extras = { heldArt?: CxHeldArtMap; heldPose?: CxHeldPoseMap; coverArt?: CxCoverArtMap; windowOver?: CxWindowOverMap };
const EXTRAS: readonly Extras[] = [caravan, pension, rural];
const merge = <T>(pick: (a: CxArt) => Record<string, T>): Record<string, T> => Object.assign({}, ...ALL.map(pick));

export const CX_DRAW: Record<string, CxDraw> = merge((a) => a.draw);
export const CX_SPIN: Record<string, CxSpinArt> = merge((a) => a.spin);
export const CX_UP: Record<string, number> = merge((a) => a.up);
export const CX_FLOORS: Record<string, CxTile> = merge((a) => a.floors);
export const CX_PAPERS: Record<string, CxTile> = merge((a) => a.papers);
export const CX_WALL_CAP: Record<string, Color> = merge((a) => a.wallCap);
/** 가구마다 테 색·진하기 (그 종류 그림 파일의 edge) */
export const CX_EDGE: Record<string, { color: Color; a: number }> = Object.assign({}, ...ALL.map((a) => Object.fromEntries(Object.keys(a.draw).map((id) => [id, a.edge]))));
export const isCxArt = (id: string) => id in CX_DRAW;
/** 손에 든 물건 그림 (act.hold.item → 그림) */
export const CX_HELD: CxHeldArtMap = Object.assign({}, ...EXTRAS.map((m) => m.heldArt ?? {}));
/** 벽지마다 창문 덧칠 (선택 — windowOver: 벽지 id → 창문 그림 고치기) */
export const CX_WINDOW_OVER: CxWindowOverMap = Object.assign({}, ...EXTRAS.map((m) => m.windowOver ?? {}));
/** 손에 든 물건 방향마다 자리 (선택 — heldPose) */
export const CX_HELD_POSE: CxHeldPoseMap = Object.assign({}, ...EXTRAS.map((m) => m.heldPose ?? {}));
/** 누운 사람 덮개 (가구 id·cover 키 → 방향마다 그림) */
export const CX_COVER: CxCoverArtMap = Object.assign({}, ...EXTRAS.map((m) => m.coverArt ?? {}));

/**
 * 누운 자세 프레임 g에 전용 가구 덮개를 그린다 (top = 목선 줄 — 숨 쉬면 1px 오르내린다). 그림 맨 윗줄이 top, 가로는 프레임 그대로.
 * 그 키의 그림이 없으면 false (부르는 쪽이 마을 침대 이불을 그린다)
 */
export function paintCxCover(g: Grid, cover: CxCover, top: number): boolean {
  const [, key, d] = cover.split("|");
  const art = CX_COVER[key]?.(Number(d) || 0);
  if (!art) return false;
  for (let y = 0; y < art.h && top + y < g.h; y++)
    for (let x = 0; x < Math.min(art.w, g.w); x++) {
      const v = art.get(x, y);
      if (v & 255) g.px[(top + y) * g.w + x] = v;
    }
  return true;
}
