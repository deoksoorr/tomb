import { graveShape, type GraveShape } from "../graveShape";
import { GRAVE_MOUND_H, GRAVE_STONE_H, graveCanvas } from "./graves";

// 묘비 디자인 미리보기 (UI용). Phaser 없이 캔버스만 쓰므로 React 쪽에서 바로 불러도 된다 (브라우저 전용: document 사용).
// 게임 안 묘비와 같은 그림을 정수 배율로 키워 dataURL로 돌려준다.
//
//   import { graveStylePreview } from "@/game/sprites/graveStyles";
//   <img src={graveStylePreview("coffee", { scale: 4 })} width={...} style={{ imageRendering: "pixelated" }} />
//
// style: @tomb/protocol GRAVE_STYLES id ("auto"면 ageDays로 생존 기간 모양을 고른다).

export type PreviewOptions = {
  /** 정수 배율 (기본 4) */
  scale?: number;
  /** style이 "auto"일 때 쓸 향년(일). 기본 30 → 작은 비석 */
  ageDays?: number;
  /** 흙무덤까지 그릴지 (기본 true) */
  mound?: boolean;
};

const cache = new Map<string, string>();

/** 디자인 하나의 미리보기 dataURL (같은 인자면 캐시) */
export function graveStylePreview(style: string, opts: PreviewOptions = {}): string {
  const scale = Math.max(1, Math.round(opts.scale ?? 4));
  const shape = graveShape(style, opts.ageDays ?? 30);
  const key = `${shape}|${scale}|${opts.mound !== false}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = graveCanvas(shape, 0);
  const h = opts.mound === false ? GRAVE_STONE_H[shape] : src.height;
  const out = document.createElement("canvas");
  out.width = src.width * scale;
  out.height = h * scale;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, src.width, h, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** 미리보기 이미지의 픽셀 크기 (레이아웃 자리 잡기용) */
export function graveStylePreviewSize(style: string, opts: PreviewOptions = {}): { width: number; height: number } {
  const scale = Math.max(1, Math.round(opts.scale ?? 4));
  const shape: GraveShape = graveShape(style, opts.ageDays ?? 30);
  const h = GRAVE_STONE_H[shape] + (opts.mound === false ? 0 : GRAVE_MOUND_H);
  const w = graveCanvasWidth(shape);
  return { width: w * scale, height: h * scale };
}

function graveCanvasWidth(shape: GraveShape): number {
  return graveCanvas(shape, 0).width;
}
