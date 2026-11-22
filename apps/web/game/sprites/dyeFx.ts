import { DYE_PARTS, dyeSpecialOf, type DyeTarget } from "@tomb/protocol";
import { AV_COLS, AV_H, AV_W, buildAvatarSheet, specDye, withDyePart } from "./avatar";
import { dyeFxAt, type DyeFxPart } from "./dyeFxCore";
import { parseHex, type Color } from "./pixel";

export { dyeFxAt, glowTime, type DyeFxGlint, type DyeFxLayer, type DyeFxPart } from "./dyeFxCore";

// 46번 특수 색 연출 (게임 AvatarView·상점/가방 미리보기 outfitStage가 같이 쓴다).
// 특수 색 부위는 시트에 바탕 색으로 그려지고, 그 위에 "부위 가면"(그 부위 픽셀만 남긴 흰 명암 시트)을 색칠해 겹친다.
//  g 금빛 광택: 가끔 번쩍(더하기 빛) + 반짝 별
//  s 반짝이:    부위 위 여기저기서 작은 별이 가끔 반짝
//  r 무지개:    시간이 지나며 색상이 한 바퀴 돈다 (명암은 그대로)
//  n 야광:      밤(해질녘·밤)이면 은은하게 빛난다 (미리보기에서는 늘 빛나 보인다)

/** 색 표기(avatarColorSpec)에 담긴 특수 색 부위들 */
export function specSpecials(spec: string): DyeFxPart[] {
  const d = specDye(spec);
  const out: DyeFxPart[] = [];
  for (const part of DYE_PARTS) {
    const c = d[part];
    const kind = dyeSpecialOf(c);
    if (c && kind) out.push({ part, kind, color: parseHex(c) });
  }
  // 11/22 아이템 특수 색 (입지 않은 아이템은 가면이 비어 연출도 없다)
  for (const [part, c] of Object.entries(d.items ?? {})) {
    const kind = dyeSpecialOf(c);
    if (kind) out.push({ part, kind, color: parseHex(c) });
  }
  return out;
}

/** 부위 가면을 만들 때 쓰는 두 시험 색 (둘 사이에 달라지는 픽셀 = 그 부위) */
const PROBE_HI = "#fefefe";
const PROBE_LO = "#020202";

const maskCache = new Map<string, HTMLCanvasElement>();

/**
 * 부위 가면 시트 (buildAvatarSheet와 같은 배치): 그 부위 픽셀만 흰색 명암으로 남긴다.
 * 그 부위를 거의 흰색·거의 검은색으로 칠한 두 시트를 비교해, 달라진 픽셀을 흰색 쪽 명암으로 둔다.
 */
export function buildPartMask(spec: string, look: readonly string[], body: string, part: DyeTarget): HTMLCanvasElement {
  const key = `${spec}|${look.join(",")}|${body}|${part}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const hi = buildAvatarSheet(withDyePart(spec, part, PROBE_HI), look, body);
  const lo = buildAvatarSheet(withDyePart(spec, part, PROBE_LO), look, body);
  const w = hi.width;
  const h = hi.height;
  const a = hi.getContext("2d")!.getImageData(0, 0, w, h);
  const b = lo.getContext("2d")!.getImageData(0, 0, w, h).data;
  const d = a.data;
  for (let i = 0; i < d.length; i += 4) {
    const same = d[i] === b[i] && d[i + 1] === b[i + 1] && d[i + 2] === b[i + 2] && d[i + 3] === b[i + 3];
    if (same || d[i + 3] < 8) d[i + 3] = 0;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.putImageData(a, 0, 0);
  if (maskCache.size > 24) maskCache.delete(maskCache.keys().next().value!);
  maskCache.set(key, out);
  return out;
}

const pixelCache = new WeakMap<HTMLCanvasElement, Map<number, number[]>>();

/** 가면 시트의 프레임(col = 시트 칸 번호) 안 부위 픽셀 좌표 목록 (y * AV_W + x) — 반짝 별 자리 */
export function maskPixels(mask: HTMLCanvasElement, col: number): number[] {
  let m = pixelCache.get(mask);
  if (!m) pixelCache.set(mask, (m = new Map()));
  const hit = m.get(col);
  if (hit) return hit;
  const sx = (col % AV_COLS) * AV_W;
  const sy = Math.floor(col / AV_COLS) * AV_H;
  const data = mask.getContext("2d")!.getImageData(sx, sy, AV_W, AV_H).data;
  const out: number[] = [];
  for (let i = 0; i < AV_W * AV_H; i++) if (data[i * 4 + 3] > 0) out.push(i);
  m.set(col, out);
  return out;
}

/** 별 자리: 부위 픽셀 중 pick으로 고른 하나 (프레임 안 x, y) */
export function glintSpot(pixels: readonly number[], pick: number): { x: number; y: number } | null {
  if (!pixels.length) return null;
  const i = pixels[Math.abs(Math.imul(pick + 1, 2654435761) >>> 0) % pixels.length];
  return { x: i % AV_W, y: Math.floor(i / AV_W) };
}

// ── 캔버스 2D 그리기 (미리보기) ──

let scratch: HTMLCanvasElement | null = null;
const css = (c: Color) => `#${c.toString(16).padStart(6, "0")}`;

/**
 * 미리보기 캔버스에 특수 색 연출을 그린다: 시트 칸 col 프레임을 (dx, dy)에 그린 아바타 위에.
 * masks = 부위별 가면 시트. 미리보기는 야광을 늘 켠다 (night = true)
 */
export function drawDyeFx(ctx: CanvasRenderingContext2D, fxs: readonly DyeFxPart[], masks: ReadonlyMap<DyeTarget, HTMLCanvasElement>, col: number, dx: number, dy: number, now: number, night = true): void {
  if (!fxs.length) return;
  scratch ??= document.createElement("canvas");
  scratch.width = AV_W;
  scratch.height = AV_H;
  const s = scratch.getContext("2d")!;
  const sx = (col % AV_COLS) * AV_W;
  const sy = Math.floor(col / AV_COLS) * AV_H;
  for (const fx of fxs) {
    const mask = masks.get(fx.part);
    if (!mask) continue;
    const { layer, glint } = dyeFxAt(fx, now, 0, night);
    if (layer && layer.alpha > 0.01) {
      // 가면 × 색 → 가면 모양으로 오려 낸다
      s.globalCompositeOperation = "source-over";
      s.clearRect(0, 0, AV_W, AV_H);
      s.drawImage(mask, sx, sy, AV_W, AV_H, 0, 0, AV_W, AV_H);
      s.globalCompositeOperation = "multiply";
      s.fillStyle = css(layer.tint);
      s.fillRect(0, 0, AV_W, AV_H);
      s.globalCompositeOperation = "destination-in";
      s.drawImage(mask, sx, sy, AV_W, AV_H, 0, 0, AV_W, AV_H);
      s.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      ctx.globalCompositeOperation = layer.add ? "lighter" : "source-over";
      ctx.drawImage(scratch, dx, dy);
      ctx.restore();
    }
    if (glint.k > 0.05) {
      const p = glintSpot(maskPixels(mask, col), glint.pick);
      if (p) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, glint.k);
        ctx.fillStyle = "#fffbe8";
        const x = dx + p.x;
        const y = dy + p.y;
        ctx.fillRect(x, y, 1, 1);
        if (glint.k > 0.4) {
          ctx.globalAlpha = glint.k * 0.7;
          ctx.fillRect(x - 1, y, 1, 1);
          ctx.fillRect(x + 1, y, 1, 1);
          ctx.fillRect(x, y - 1, 1, 1);
          ctx.fillRect(x, y + 1, 1, 1);
        }
        ctx.restore();
      }
    }
  }
}
