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
 * hiK = 11/22 기준보다 밝은 색(빛)의 밝기 차이를 넓히는 배율 상한 (없으면 3 — 흰 천은 빛이 하얗게 날아가 연한 색이 안 보여 줄인다)
 */
export type ItemRef = { main: Hsl; chroma: boolean; group: ReadonlySet<Color>; spread?: number; hiK?: number };

/**
 * 11/22 아이템별 「바꿀 색 묶음」 (기본 규칙 = 가장 많이 쓴 색 계열이 엉뚱한 곳을 고르는 꾸미기만).
 * colors = 염색할 팔레트 색 (그 꾸미기의 몸판·천 — 금속·금테·보석·흰 반짝임·얼굴 닿는 곳은 넣지 않는다), main = 고른 색이 될 기준 색 (없으면 그중 가장 많이 쓴 색),
 * all = 유채색 전부, spread = 위 ItemRef.spread
 */
export type DyeRegion = { colors?: readonly Color[]; main?: Color; all?: boolean; spread?: number; hiK?: number };
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
  // 체크 담요 숄: 빨강·남색 체크 두 색을 같이 (노란 선은 그대로)
  back_shawl: { colors: [0xc0392b, 0x2a3a6a], main: 0xc0392b, spread: 1 },
  // 헬스 머리띠: 민트 띠와 분홍 줄을 같이 (흰 바탕 줄은 그대로)
  rs_band: { colors: [0x3ad8c0, 0x1e9a8a, 0xff4f9a, 0xc8306e], main: 0x3ad8c0, spread: 1 },
  // 11/22 퇴근 망토: 빨간 천 네 톤 (금 걸쇠는 그대로 — 등 칸으로 옮기며 뒷덜미 깃(capeArt)·세로 주름을 더했다)
  back_cape: { colors: [0xd85a68, 0xb83a4a, 0x8a2a38, 0x6a1e2a], main: 0xb83a4a },
  // 11/22 딸기우유 망토: 분홍 천 네 톤 (흰 물방울·레이스·딸기 걸쇠는 그대로)
  back_milkcape: { colors: [0xffcad6, 0xf6a8bc, 0xd8849c, 0xb8687e], main: 0xf6a8bc },
  // 털 달린 빨간 망토: 빨간 벨벳 (흰 털 깃·밑단·금실 눈꽃은 그대로)
  xm_cape: { colors: [0xd42c3c, 0x9a1c2c, 0xf0505a, 0x74121e], main: 0xd42c3c },
  // 리본 목도리: 빨간 목도리 천 (흰 털·금방울은 그대로)
  xm_scarf: { colors: [0xd42c3c, 0x9a1c2c, 0xf0505a], main: 0xd42c3c },
  // 11/22 출근 배낭: 국방색 천 네 톤 (갈색 끈·버클은 그대로 — avatarGear BACKPACK_TONES)
  back_backpack: { colors: [0x9aaa6a, 0x7a8a4a, 0x5c6838, 0x444e28], main: 0x7a8a4a },
  // 11/22 빙어 아이스박스: 하늘색 통 세 톤만 (흰 뚜껑·빙어·끈은 그대로 — 뚜껑 그늘만 염색돼 반쪽만 바뀌던 것)
  ic_icebox: { colors: [0x5ab4e8, 0x8ad0f6, 0x3a86c0], main: 0x5ab4e8 },
  // 11/22 돗자리 배낭: 빨간 돗자리 세 톤 + 노란 배낭 세 톤을 고른 색 쪽으로 같이 (색상 차이는 조금만 남긴다 — 그대로 옮기면 형광 보라·청록이 된다.
  //  흰 줄·갈색 끈은 그대로라 체크 무늬가 남는다)
  sp_matpack: { colors: [0xe2444a, 0xf27a72, 0xa82a34, 0xe8c060, 0xf8dc92, 0xb48c34], main: 0xe2444a, spread: 0.2 },
  // 11/22 무릎까지 롱패딩: 남색 다섯 톤(반짝·밝은·바탕·그늘·누빔 선)을 함께 (흰 털 후드·은색 지퍼·흰 상표는 그대로 — seasonSetGear PAD_TONES)
  sc_padding: { colors: [0x7a88ae, 0x5a6690, 0x3a4458, 0x2a3044, 0x1c2234], main: 0x3a4458 },
  // 11/22 뽀글이 플리스: 양털 네 톤 (가장 밝은 몽글 점이 무채색에 가까워 빠지고, 밤색 테두리·주머니가 같은 색 무리로 잘못 들어가던 것)
  kn_fleece: { colors: [0xebe1cc, 0xfbf5e8, 0xcdbfa4, 0xaa9a7e], main: 0xebe1cc },
  // 11/22 꽈배기 니트: 실 네 톤 (가장 밝은 꽈배기 결이 빠져 검정·진한 색에서 흰 점으로 남던 것)
  kn_cable: { colors: [0xd0c3a6, 0xefe6d2, 0xfffaee, 0xae9f80], main: 0xd0c3a6 },
  // 11/22 요리사 모자: 흰 천 네 톤 (avatarGear CHEF_TONES)
  hat_chef: { colors: [0xfefefb, 0xf2f2ea, 0xdcdcd2, 0xc4c4b8], main: 0xf2f2ea },
  // 11/22 산타 모자: 빨간 천 네 톤 (흰 털 테·방울은 그대로 — avatarGear SANTA_TONES)
  hat_santa: { colors: [0xf0505a, 0xd8323c, 0xa02430, 0x74121e], main: 0xd8323c },
  // 11/22 찹쌀떡 토끼 모자: 떡 네 톤 (점 눈·볼터치·귀 속 분홍은 그대로 — cuteGear MOCHI_TONES)
  hat_mochibun: { colors: [0xfffdf9, 0xfbf5ec, 0xeae0d2, 0xd8ccbc], main: 0xfbf5ec },
  // 11/22 찹쌀 목도리: 떡 두 톤 (그늘 톤이 무채색에 가까워 빠지던 것 — 분홍 줄은 그대로)
  neck_mochi: { colors: [0xfaf2e2, 0xe0d4bc], main: 0xfaf2e2 },
  // 11/22 유령 선장 모자: 남색 펠트 세 톤 (밝은 펠트가 빠져 염색 뒤 남색 얼룩으로 남던 것 — 금테·뼈 문장·도깨비불은 그대로)
  gh_capt: { colors: [0x2e3346, 0x1e2232, 0x4a5270], main: 0x2e3346 },
  // 11/22 벚꽃 버킷햇: 크림 천 네 톤 (가장 밝은 윗면이 빠져 흰 점으로 남던 것 — 벚꽃 분홍은 그대로)
  sp_buckethat: { colors: [0xf6ecd4, 0xd6c4a0, 0xb8a47c, 0xfffbf0], main: 0xf6ecd4 },
  // 11/22 잡화점 「옷」 다섯 벌: 천 4톤 [빛, 바탕, 그늘, 가장 짙은 선] (shopWearGear SHOP_WEAR_TONES — 넥타이·지퍼·단추·크림 테·슬리퍼는 그대로)
  wr_shirt: { colors: [0xfcfdff, 0xe0e7f3, 0xbfc9dd, 0x8e9ab8], main: 0xe0e7f3 },
  wr_puffer: { colors: [0xa3a065, 0x7d7a48, 0x5e5c34, 0x40401f], main: 0x7d7a48 },
  wr_robe: { colors: [0xe496b0, 0xc46a8a, 0x9a4e6a, 0x6e3049], main: 0xc46a8a },
  wr_apron: { colors: [0x5fb48a, 0x3f8f6a, 0x2e6e50, 0x1f4c37], main: 0x3f8f6a },
  wr_coat: { colors: [0x6a5c80, 0x4a3f5c, 0x372e46, 0x241e30], main: 0x4a3f5c },
  // 11/22 날개 5종 (시트 밖 그림 — wingDye.ts가 날개 그림·아이콘을 이 묶음으로 다시 칠한다. 외곽선·흰 반짝 점·아이콘 가운데 등은 그대로)
  // 작은 날개: 깃 세 톤 + 아이콘 깃 세 톤. 기준은 가운데 톤 → 윗깃이 밝은 빛으로 남아 흰 천도 칠하면 명암이 산다
  back_wings: { colors: [0xf4f1ff, 0xe2ddf6, 0xb9b2dc, 0xf4f8ff, 0xc8d8f0, 0xa8bcdc], main: 0xe2ddf6 },
  // 박쥐 날개: 날개막 세 톤 (가장 어두운 외곽선은 그대로라 뼈대 테가 남는다)
  back_wings_bat: { colors: [0x4a3a62, 0x2e2440, 0x7a6a98], main: 0x4a3a62 },
  // 나비 날개: 분홍 윗날개 + 하늘 아랫날개를 같이 (두 색 차이를 남긴다 — 흰 점·보라 테는 그대로)
  //  (그대로 옮기면 빨강+파랑·파랑+연두처럼 보색이 되어 촌스러워 이웃 색으로 모은다)
  back_wings_butterfly: { colors: [0xffa8d0, 0xffd0e6, 0x9ad0ff, 0x7ab8f0], main: 0xffa8d0, spread: 0.35 },
  // 천사 날개: 흰 깃 네 톤. 기준은 깃결 톤 → 바탕 깃이 밝게 남아 칠하면 파스텔처럼. 빛은 1.3배까지만 넓혀 연분홍·검정도 색이 남는다
  back_wings_angel: { colors: [0xf8f8ff, 0xc8d0e8, 0xffffff, 0xdde2f2], main: 0xdde2f2, hiK: 1.3 },
  // 용 날개: 날개막·뼈살·윗테 (검은 외곽선은 그대로)
  back_wings_dragon: { colors: [0x3a8a5a, 0x2a5a3a, 0x8ad08a, 0x2a6a44], main: 0x3a8a5a },
  // 11/27 좌대 전용 코디 (raftGear.ts — 그 파일 JW_DYE와 같아야 한다: raftGear.test). 천 4톤 [빛, 바탕, 그늘, 짙은 그늘]만 — 금테·금방울·흰 찌 띠·눈·입술·루어·패치·장화는 그대로
  jw_carphat: { colors: [0xf2cc68, 0xd49c3a, 0xa8742a, 0x7a521e], main: 0xd49c3a },
  jw_vest: { colors: [0xe4d29e, 0xc6ae74, 0x9c8450, 0x6e5c34], main: 0xc6ae74 },
  jw_net: { colors: [0xe0b070, 0xb47c42, 0x8a5a2e, 0x5e3a1c], main: 0xb47c42 },
  jw_sedge: { colors: [0x52a8bc, 0x2e7c94, 0x1e5e74, 0x123e50], main: 0x2e7c94 },
  jw_bell: { colors: [0xff8a7a, 0xe04a3c, 0xb03028, 0x7a1e1a], main: 0xe04a3c },
  jw_waders: { colors: [0x5a9c8a, 0x3a7a6a, 0x285a4e, 0x183c34], main: 0x3a7a6a },
  jw_cape: { colors: [0x3e94aa, 0x246a82, 0x194e64, 0x0f3548], main: 0x246a82 },
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
  return { main: toHsl(main!), chroma: isChroma(main!), group, ...(r.spread !== undefined ? { spread: r.spread } : {}), ...(r.hiK !== undefined ? { hiK: r.hiK } : {}) };
}

/** 밝기 옮기기: 바탕 밝기 → 염색 밝기, 그보다 어둡거나 밝은 색은 차이를 비율로 (너무 납작해지거나 튀지 않게 0.55~3배, 밝은 쪽은 hiK배까지) */
function mapLightness(l: number, from: number, to: number, hiK = 3): number {
  const k = (v: number, hi = 3) => Math.max(0.55, Math.min(hi, v));
  const out = l <= from ? to - (from - l) * k(from > 0.001 ? to / from : 1) : to + (l - from) * k(from < 0.999 ? (1 - to) / (1 - from) : 1, hiK);
  return Math.max(0.03, Math.min(0.98, out));
}

/** 무리 안의 색 c를 염색 색 target으로 (무리 밖이면 그대로) */
export function dyeItemColor(c: Color, ref: ItemRef, target: Color): Color {
  if (!ref.group.has(c)) return c;
  const t = toHsl(target);
  const v = toHsl(c);
  const to = Math.max(0.14, Math.min(0.88, t.l));
  const l = mapLightness(v.l, ref.main.l, to, ref.hiK);
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
