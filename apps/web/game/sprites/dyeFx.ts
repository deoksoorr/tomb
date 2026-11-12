import { DYE_PARTS, dyeSpecialOf, type DyePart, type DyeSpecial } from "@tomb/protocol";
import { kstHour, parseAmbienceOverride, timePhase } from "@/lib/ambience";
import { AV_COLS, AV_H, AV_W, buildAvatarSheet, specDye, withDyePart } from "./avatar";
import { parseHex, type Color } from "./pixel";

// 46번 특수 색 연출 (게임 AvatarView·상점/가방 미리보기 outfitStage가 같이 쓴다).
// 특수 색 부위는 시트에 바탕 색으로 그려지고, 그 위에 "부위 가면"(그 부위 픽셀만 남긴 흰 명암 시트)을 색칠해 겹친다.
//  g 금빛 광택: 가끔 번쩍(더하기 빛) + 반짝 별
//  s 반짝이:    부위 위 여기저기서 작은 별이 가끔 반짝
//  r 무지개:    시간이 지나며 색상이 한 바퀴 돈다 (명암은 그대로)
//  n 야광:      밤(해질녘·밤)이면 은은하게 빛난다 (미리보기에서는 늘 빛나 보인다)

export type DyeFxPart = { part: DyePart; kind: DyeSpecial; color: Color };

/** 색 표기(avatarColorSpec)에 담긴 특수 색 부위들 */
export function specSpecials(spec: string): DyeFxPart[] {
  const d = specDye(spec);
  const out: DyeFxPart[] = [];
  for (const part of DYE_PARTS) {
    const c = d[part];
    const kind = dyeSpecialOf(c);
    if (c && kind) out.push({ part, kind, color: parseHex(c) });
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
export function buildPartMask(spec: string, look: readonly string[], body: string, part: DyePart): HTMLCanvasElement {
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

let glowCheckedAt = -Infinity;
let glowNow = false;

/** 지금이 밤(야광이 빛나는 때)인지 — 한국 시간 해질녘·밤 (주소의 ?time= 시험 값도 따른다, Atmosphere와 같이). 1초에 한 번만 계산 */
export function glowTime(now = Date.now()): boolean {
  if (Math.abs(now - glowCheckedAt) < 1000) return glowNow;
  glowCheckedAt = now;
  const hour = typeof location !== "undefined" ? parseAmbienceOverride(location.search).hour : undefined;
  const p = timePhase(hour ?? kstHour(now));
  glowNow = p === "night" || p === "dusk";
  return glowNow;
}

function hsl(h: number, s: number, l: number): Color {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const q = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}

function hueOf(c: Color): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** 덮개(가면 색칠) 한 장의 모습: tint = 곱할 색, alpha, add = 더하기 빛 */
export type DyeFxLayer = { tint: Color; alpha: number; add: boolean };
/** 반짝 별: k = 0~1 밝기 (0이면 없음), pick = 부위 픽셀 고르는 수 (바뀌면 다른 자리) */
export type DyeFxGlint = { k: number; pick: number };

/** 시간 now(ms)의 연출. salt = 아바타마다 박자를 어긋나게 하는 수, night = 야광이 켜질 때 */
export function dyeFxAt(fx: DyeFxPart, now: number, salt: number, night: boolean): { layer: DyeFxLayer | null; glint: DyeFxGlint } {
  const t = now + salt * 977;
  switch (fx.kind) {
    case "r": {
      // 바탕 색에서 시작해 9초에 한 바퀴
      const h = hueOf(fx.color) + (t / 9000) * 360;
      return { layer: { tint: hsl(h, 1, 0.62), alpha: 0.9, add: false }, glint: { k: 0, pick: 0 } };
    }
    case "g": {
      // 2.8초마다 짧게 번쩍 + 그때 별 하나
      const P = 2800;
      const u = (t % P) / P;
      const flash = Math.max(0, 1 - Math.abs(u - 0.5) * 7);
      return { layer: { tint: 0xfff0b8, alpha: 0.18 + 0.5 * flash, add: true }, glint: { k: flash, pick: Math.floor(t / P) } };
    }
    case "s": {
      // 0.9초마다 다른 자리에서 반짝 (가끔 쉰다)
      const P = 900;
      const n = Math.floor(t / P);
      const u = (t % P) / P;
      const rest = (n * 2654435761) % 5 === 0;
      return { layer: { tint: 0xffffff, alpha: 0.08, add: true }, glint: { k: rest ? 0 : Math.max(0, Math.sin(u * Math.PI)), pick: n } };
    }
    case "n": {
      if (!night) return { layer: null, glint: { k: 0, pick: 0 } };
      const pulse = 0.5 + 0.5 * Math.sin(t / 700);
      return { layer: { tint: fx.color, alpha: 0.35 + 0.3 * pulse, add: true }, glint: { k: 0, pick: 0 } };
    }
  }
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
export function drawDyeFx(ctx: CanvasRenderingContext2D, fxs: readonly DyeFxPart[], masks: ReadonlyMap<DyePart, HTMLCanvasElement>, col: number, dx: number, dy: number, now: number, night = true): void {
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
