import { parseHex } from "./pixel";
import { dyeItemColor, GEAR_DYE_REGIONS, itemRefOf } from "./gearDye";
import { itemIconCanvas } from "./itemIcons";

// 11/22 염색한 아이템 아이콘: 아이콘 그림의 색을 세어 바탕 천(가장 많이 쓴 색 무리)만 염색 색으로 다시 칠한다 (아바타 그림과 같은 규칙 — gearDye.ts).
// 가방·옷장·염색 창에서 칠한 색이 그대로 보이게. 같은 아이템·색·배율이면 캐시

const cache = new Map<string, string>();

/** 염색한 아이템 아이콘 dataURL (color = "#rrggbb" 또는 특수 색 "#rrggbb~x" — 바탕 hex만 쓴다) */
export function itemIconDyed(itemId: string, color: string, scale = 2): string {
  const k = Math.max(1, Math.round(scale));
  const key = `${itemId}|${color}|${k}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = itemIconCanvas(itemId);
  const w = src.width;
  const h = src.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!tctx) return "";
  tctx.drawImage(src, 0, 0);
  const img = tctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    hist.set(c, (hist.get(c) ?? 0) + 1);
  }
  // 아이콘 외곽선(가장 어두운 색)은 무리에서 빠지게 바탕을 고른다 — 외곽선은 itemRefOf 무채색 규칙으로 걸러진다
  const ref = itemRefOf(hist, GEAR_DYE_REGIONS[itemId]);
  const target = parseHex(color);
  if (ref)
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const o = dyeItemColor(c, ref, target);
      d[i] = (o >> 16) & 255;
      d[i + 1] = (o >> 8) & 255;
      d[i + 2] = o & 255;
    }
  tctx.putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = w * k;
  out.height = h * k;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, url);
  return url;
}
