import type { Color } from "./pixel";

// 11/22 입은 꾸미기 염색 (모자·목·옷 칸): 꾸미기 그림은 파일마다 색을 박아 그리므로(avatarCore·avatarGear·cuteGear·themeGear …),
// 그린 뒤에 그 꾸미기가 칠한 픽셀만 골라 색을 다시 입힌다 (avatarCore drawFrame이 그리기 전·후 픽셀을 비교한다).
//  - 기준(ItemRef): 그 꾸미기를 빈 몸에 앞·옆·뒤로 한 번 그려 모은 색 중 가장 많이 쓴 색 = 바탕 천. 바탕 천과 같은 색 무리(색상이 가까운 색,
//    무채색 천이면 밝기가 가까운 무채색)만 염색하고, 다른 색(꽃술·단추·금속·흰 반짝임·검은 눈 같은 장식)은 그대로 둔다.
//  - 칠하기: 바탕 천 색 → 염색 색. 무리 안 다른 색은 바탕 천과의 밝기 차이·색상 차이·채도 비율을 그대로 옮겨 명암·하이라이트가 살아 있다.
//    아주 밝은·어두운 염색 색은 바탕 밝기를 조금 안쪽으로 당겨(0.14~0.88) 그늘·빛이 뭉개지지 않게 한다.

export type Hsl = { h: number; s: number; l: number };
/**
 * 꾸미기 하나의 색 기준 (바탕 천 색 + 염색할 색 무리).
 * spread = 무리 안 색들의 색상 차이를 몇 배로 옮길지 (없으면 그늘 정도만 ±24°까지, 1 = 두 색 차이 그대로 — 줄무늬·체크, 0.35 = 색동처럼 여러 색을 고른 색 쪽으로 모은다)
 */
export type ItemRef = { main: Hsl; chroma: boolean; group: ReadonlySet<Color>; spread?: number };

/**
 * 11/22 아이템별 「바꿀 색 묶음」 (기본 규칙 = 가장 많이 쓴 색 계열이 엉뚱한 곳을 고르는 꾸미기만).
 * colors = 염색할 팔레트 색 (그 꾸미기의 몸판·천 — 금속·금테·보석·흰 반짝임·얼굴 닿는 곳은 넣지 않는다), main = 고른 색이 될 기준 색 (없으면 그중 가장 많이 쓴 색),
 * all = 유채색 전부, spread = 위 ItemRef.spread
 */
export type DyeRegion = { colors?: readonly Color[]; main?: Color; all?: boolean; spread?: number };
export const GEAR_DYE_REGIONS: Readonly<Record<string, DyeRegion>> = {
  // 색동 목도리: 여러 색 줄이 정체라 줄은 남기고 색상을 고른 색 쪽으로 모은다 (흰 줄·검은 테는 그대로)
  sm_saekdong: { all: true, main: 0xe8404a, spread: 0.3 },
  // 꽃 목걸이: 분홍·주황·노랑 꽃을 고른 색 쪽으로 모은다 (흰 꽃은 그대로)
  neck_lei: { colors: [0xff8ab0, 0xff9a5a, 0xffe066], main: 0xff8ab0, spread: 0.3 },
  // 선물 배달 자루: 자루(삼베) 천 (빨간 리본·초록 끈·금방울은 그대로)
  si_sack: { colors: [0xc8a46a, 0xe4c890, 0x9a7642, 0x6e5230], main: 0xc8a46a },
  // 달맞이꽃 화관: 꽃잎(연보라·라벤더) (잎사귀 초록·꽃술 노랑·흰 반짝임은 그대로)
  gk_moonwreath: { colors: [0xd6dae6, 0xb8a8d8, 0x8a7ab0], main: 0xb8a8d8, spread: 1 },
  // 고깔모자: 노랑·하늘 줄무늬 두 색을 같이 (두 색의 색상 차이 유지 — 꼭대기 방울은 그대로)
  hat_party: { colors: [0xffd04a, 0x5ab8e8], main: 0xffd04a, spread: 1 },
  // 쌍둥이 왕관: 두 색 몫(빨강·금, 파랑·금, 빨강·파랑)을 함께 옮겨 대비를 유지 (흰 반짝임은 그대로)
  champ_duo_ph: { colors: [0xe0384a, 0x98202e, 0xff9a8a, 0xf6c83a, 0xb8841a, 0xfff4b0], main: 0xe0384a, spread: 1 },
  champ_duo_pf: { colors: [0x3aa8f0, 0x1a5aa8, 0xbfeaff, 0xf6c83a, 0xb8841a, 0xfff4b0], main: 0x3aa8f0, spread: 1 },
  champ_duo_hf: { colors: [0x3aa8f0, 0x1a5aa8, 0xbfeaff, 0xe0384a, 0x98202e, 0xff9a8a], main: 0x3aa8f0, spread: 1 },
  // 체크 담요 숄: 빨강·남색 체크 두 색을 같이 (노란 선은 그대로)
  back_shawl: { colors: [0xc0392b, 0x2a3a6a], main: 0xc0392b, spread: 1 },
  // 헬스 머리띠: 민트 띠와 분홍 줄을 같이 (흰 바탕 줄은 그대로)
  rs_band: { colors: [0x3ad8c0, 0x1e9a8a, 0xff4f9a, 0xc8306e], main: 0x3ad8c0, spread: 1 },
  // 채집왕 망토: 보라 천 (금테·금실 문장은 그대로)
  q_back_cape: { colors: [0x5a3a9e, 0x7e5cc8, 0x3c2672], main: 0x5a3a9e },
  // 털 달린 빨간 망토: 빨간 벨벳 (흰 털 깃·밑단·금실 눈꽃은 그대로)
  xm_cape: { colors: [0xd42c3c, 0x9a1c2c, 0xf0505a, 0x74121e], main: 0xd42c3c },
  // 리본 목도리: 빨간 목도리 천 (흰 털·금방울은 그대로)
  xm_scarf: { colors: [0xd42c3c, 0x9a1c2c, 0xf0505a], main: 0xd42c3c },
};

export function toHsl(c: Color): Hsl {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: Math.min(1, s), l };
}

export function fromHsl({ h, s, l }: Hsl): Color {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const q = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}

/** 색상 차이 (-180 ~ 180) */
const hueDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
/** 색의 진하기 (가장 밝은 채널 − 가장 어두운 채널, 0~1). 아주 밝은·어두운 색은 HSL 채도가 튀어서 이것으로 무채색을 가른다 */
const chromaOf = (c: Color) => (Math.max((c >> 16) & 255, (c >> 8) & 255, c & 255) - Math.min((c >> 16) & 255, (c >> 8) & 255, c & 255)) / 255;
/** 유채색 천인지 (회색·흰색·검정 천이 아니다) */
const isChroma = (c: Color) => chromaOf(c) >= 0.1 && toHsl(c).s >= 0.16;

/**
 * 꾸미기가 칠한 색과 픽셀 수 → 기준. 칠한 게 없으면 null.
 * 바탕 천 = 가장 많이 쓴 색. 유채색 천이면 색상이 ±32° 안인 유채색, 무채색 천이면 밝기가 0.4 안인 무채색이 같은 무리
 */
export function itemRefOf(hist: ReadonlyMap<Color, number>, region?: DyeRegion): ItemRef | null {
  if (region) {
    const ref = regionRef(hist, region);
    if (ref) return ref;
  }
  let top: Color | null = null;
  let n = 0;
  for (const [c, k] of hist) if (k > n || (k === n && top !== null && c < top)) [top, n] = [c, k];
  if (top === null) return null;
  const main = toHsl(top);
  const chroma = isChroma(top);
  const group = new Set<Color>();
  for (const c of hist.keys()) {
    const v = toHsl(c);
    if (chroma ? isChroma(c) && Math.abs(hueDiff(v.h, main.h)) <= 32 : chromaOf(c) < 0.14 && Math.abs(v.l - main.l) <= 0.4) group.add(c);
  }
  return { main, chroma, group };
}

/** 아이템별 묶음 기준 (그 묶음 색이 그림에 하나도 없으면 null → 기본 규칙) */
function regionRef(hist: ReadonlyMap<Color, number>, r: DyeRegion): ItemRef | null {
  const group = new Set<Color>();
  for (const c of hist.keys()) if (r.all ? isChroma(c) : r.colors?.includes(c)) group.add(c);
  if (!group.size) return null;
  let main = r.main !== undefined && group.has(r.main) ? r.main : null;
  if (main === null) {
    let n = 0;
    for (const c of group) if ((hist.get(c) ?? 0) > n) [main, n] = [c, hist.get(c) ?? 0];
  }
  return { main: toHsl(main!), chroma: isChroma(main!), group, ...(r.spread !== undefined ? { spread: r.spread } : {}) };
}

/** 밝기 옮기기: 바탕 밝기 → 염색 밝기, 그보다 어둡거나 밝은 색은 차이를 비율로 (너무 납작해지거나 튀지 않게 0.55~3배) */
function mapLightness(l: number, from: number, to: number): number {
  const k = (v: number) => Math.max(0.55, Math.min(3, v));
  const out = l <= from ? to - (from - l) * k(from > 0.001 ? to / from : 1) : to + (l - from) * k(from < 0.999 ? (1 - to) / (1 - from) : 1);
  return Math.max(0.03, Math.min(0.98, out));
}

/** 무리 안의 색 c를 염색 색 target으로 (무리 밖이면 그대로) */
export function dyeItemColor(c: Color, ref: ItemRef, target: Color): Color {
  if (!ref.group.has(c)) return c;
  const t = toHsl(target);
  const v = toHsl(c);
  const to = Math.max(0.14, Math.min(0.88, t.l));
  const l = mapLightness(v.l, ref.main.l, to);
  // 유채색 천은 그늘의 색상 흔들림·채도 비율을 옮긴다 (무채색 천은 염색 색 그대로).
  // 묶음(spread)이면 무리 안 색들의 색상 차이를 그 배율로 (줄무늬·체크 두 색 = 1, 색동처럼 여러 색 = 작게)
  const dh = hueDiff(v.h, ref.main.h);
  const h = ref.spread !== undefined ? t.h + (isChroma(c) ? dh * ref.spread : 0) : ref.chroma ? t.h + Math.max(-24, Math.min(24, dh)) : t.h;
  const ratio = ref.chroma && ref.main.s > 0.05 ? Math.max(ref.spread !== undefined ? 0.4 : 0.6, Math.min(1.4, v.s / ref.main.s)) : 1;
  return fromHsl({ h, s: Math.min(1, t.s * ratio), l });
}

/** 그리기 전 픽셀(before)과 비교해 이번에 칠한 픽셀 중 무리 안의 색만 다시 칠한다 (px = 0xRRGGBBAA) */
export function recolorDrawn(px: Uint32Array, before: Uint32Array, ref: ItemRef, target: Color): void {
  const memo = new Map<Color, Color>();
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    if (v === before[i] || (v & 255) === 0) continue;
    const c = v >>> 8;
    let out = memo.get(c);
    if (out === undefined) memo.set(c, (out = dyeItemColor(c, ref, target)));
    if (out !== c) px[i] = ((out << 8) | (v & 255)) >>> 0;
  }
}

/** 그리기 전·후를 비교해 이번에 칠한 색을 센다 (기준 만들기) */
export function tallyDrawn(px: Uint32Array, before: Uint32Array, hist: Map<Color, number>): void {
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    if (v === before[i] || (v & 255) === 0) continue;
    const c = v >>> 8;
    hist.set(c, (hist.get(c) ?? 0) + 1);
  }
}
