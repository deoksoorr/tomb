import { type DyeSpecial, type DyeTarget } from "@tomb/protocol";
import { kstHour, parseAmbienceOverride, timePhase } from "@/lib/ambience";
import { fromHsl } from "./gearDye";
import { type Color } from "./pixel";

// 11/22 특수 색 연출의 시간 계산만 따로 (아바타 시트에 기대지 않는다 — 시트 밖에 따로 그리는 날개(cosmeticFx)도 같은 박자로 쓴다).
// dyeFx.ts가 그대로 다시 내보낸다

/** part = 캐릭터 부위 또는 11/22 염색한 아이템 id */
export type DyeFxPart = { part: DyeTarget; kind: DyeSpecial; color: Color };

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

// 11/22 같은 계산이 gearDye.fromHsl에 있어 그것을 쓴다
const hsl = (h: number, s: number, l: number): Color => fromHsl({ h, s, l });

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

