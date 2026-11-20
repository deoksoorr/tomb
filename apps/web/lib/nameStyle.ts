import { itemById, nameStyleOfLook, seasonSetsOfLook } from "@tomb/protocol";

// 닉네임 꾸미기 (상점에서 사는 이름 글자 색·이름표 바탕판)의 색·그림 정의와 순수 계산.
// 게임 머리 위 이름표(game/entities/NameStyleView — 비트맵 글꼴 글자마다 색)와 화면 HTML 이름(components/ui/StyledName — CSS)이 같이 쓴다.
// 아이템(id·값·부위)은 @tomb/protocol items.ts. 여기 없는 id(옛 화면이 모르는 새 꾸미기 등)는 꾸미기 없음으로 본다.
//
// 읽기 쉬움: 게임 글자는 늘 어두운 1px 외곽선(GlyphAtlas OUTLINE)을 두르고 밤 어둠 층 위(DEPTH.labels)에 그려진다.
// 그래서 글자 색은 모두 "외곽선과 대비 7:1 이상"인 밝은 색만 쓴다 (nameStyle.test.ts가 확인한다).

/** 이름표 외곽선 색 (GlyphAtlas OUTLINE과 같다) */
export const NAME_OUTLINE = 0x0a0b10;

// 11/15 leaves = 수집 의뢰 「나뭇잎 이름 글자」: 잎 초록 그라데이션 + 이름 둘레로 작은 잎이 가끔 팔랑 떨어진다
// 11/20 frost = 계절 한정 「서리 앉은 이름」: 얼음빛 그라데이션 + 글자 윗머리마다 하얀 서리 + 옅은 푸른 빛 무리
export type NameFx = "glow" | "rainbow" | "stars" | "flame" | "leaves" | "frost";
/**
 * 이름 글자 꾸미기.
 *  - solid: 한 색
 *  - gradient: stops를 이름 첫 글자부터 끝 글자까지 고르게 잇는다
 *  - fx: 빛나고 움직이는 이름. stops = 멈춘 그림(움직임 줄이기)·HTML 바탕 색
 */
export type NameColorSpec =
  | { kind: "solid"; color: number }
  | { kind: "gradient"; stops: readonly number[] }
  | { kind: "fx"; fx: NameFx; /** glow는 11/20부터 색이 둘 이상이면 이름 첫 글자부터 끝 글자까지 그라데이션 */ stops: readonly number[]; /** 빛 무리 색 (glow·flame) */ halo?: number };

// 11/15 wave = 수집 의뢰 「물결 이름표」: 깊은 물빛 판 위로 물결 윤슬이 흘러간다 (dots = 물거품·윤슬 색)
// 11/15 newyear = 수집 의뢰 「새해 복 이름표」: 붉은 비단 판 + 금테 + 양옆 복 매듭(술 달린 금 매듭), 금가루가 둥실 떠오른다
// 11/17 knit = 니트 이름표 (위아래 골지 단 + 꽈배기 무늬), card = 사원증 이름표 (파란 띠 + 위 집게), beach = 모래사장 이름표 (물거품 띠 + 불가사리·조개)
// 12월 holly = 크리스마스 「호랑가시 이름표」: 눈 덮인 초록 판 + 금테 + 양끝 호랑가시 잎·빨간 열매
// 11/19 wrap = 계절 한정 「선물 포장 이름표」: 빨강·초록 사선 줄무늬 포장지 + 가운데 금 리본 띠 + 위에 금 리본 매듭
// 11/20 envelope = 계절 한정 「편지봉투 이름표」: 분홍 편지지 판 + 위 덮개 V선 + 아래 가운데 하트 봉인
// 11/20 planner = 계절 한정 「새해 계획표 이름표」: 크림 종이 판 + 옅은 줄 + 빨간 여백선 + 왼쪽 체크 칸 셋(✓ ✓ 빈칸) + 위 스프링 고리
export type NamePlateKind = "wood" | "ribbon" | "cloud" | "wreath" | "tomb" | "star" | "wave" | "newyear" | "knit" | "card" | "beach" | "holly" | "wrap" | "envelope" | "planner";
/** 이름표 바탕판: fill 바탕 · light 위쪽 밝은 띠 · edge 테두리 · dots 장식 점 색 (꽃·별·못·이끼) */
/** bell = 11/19 「산타 견습 요정」 한 벌 덤: 이름표 옆에 작은 금종 (nameStyleRef가 한 벌을 다 입었을 때만 켠다) */
export type NamePlateSpec = { kind: NamePlateKind; fill: number; light: number; edge: number; dots: readonly number[]; /** 바탕 투명도 */ alpha: number; bell?: boolean };

export const NAME_COLORS: Readonly<Record<string, NameColorSpec>> = {
  nc_sakura: { kind: "solid", color: 0xffa8c8 },
  nc_sky: { kind: "solid", color: 0x8fd3ff },
  nc_mint: { kind: "solid", color: 0x7fecc4 },
  nc_lemon: { kind: "solid", color: 0xfff07a },
  nc_lilac: { kind: "solid", color: 0xc9b0ff },
  nc_orange: { kind: "solid", color: 0xffb35c },
  // 은빛: 기본 이름표 뼈색(LABEL_OTHER)과 헷갈리지 않게 푸른 기가 도는 은색
  nc_silver: { kind: "solid", color: 0xc8d8f0 },
  // 새벽 남색: 진한 남색은 밤에 외곽선에 묻히므로 밝은 남빛으로
  nc_dawn: { kind: "solid", color: 0x8ea2ff },

  ng_sunset: { kind: "gradient", stops: [0xffb35c, 0xff7fa6, 0xc79bff] },
  ng_sea: { kind: "gradient", stops: [0xa8f4ff, 0x5fb8ff, 0x8a94ff] },
  ng_aurora: { kind: "gradient", stops: [0x8affb0, 0x6fe6e6, 0xb59bff] },
  ng_peach: { kind: "gradient", stops: [0xffd3a8, 0xff9fb8] },
  ng_forest: { kind: "gradient", stops: [0xd8ff8a, 0x6fd88a] },
  ng_grape: { kind: "gradient", stops: [0xc6f59a, 0xa99bff, 0xe08cff] },

  nf_glow: { kind: "fx", fx: "glow", stops: [0xeafcff], halo: 0x8fe8ff },
  nf_rainbow: { kind: "fx", fx: "rainbow", stops: [0xff9a9a, 0xffd27a, 0xb8f58a, 0x8ad8ff, 0xc2a2ff] },
  nf_stars: { kind: "fx", fx: "stars", stops: [0xfff4c2, 0xd6e4ff] },
  nf_flame: { kind: "fx", fx: "flame", stops: [0xffe066, 0xff8a3a], halo: 0xff8a3a },
  // 11/15 수집 의뢰 보상 (도장 교환소 전용): 새순 연두 → 잎 초록 → 짙은 잎 초록 (짙은 쪽도 밤 외곽선과 7:1 이상)
  q_name_leaf: { kind: "fx", fx: "leaves", stops: [0xeaffa0, 0xa8ec68, 0x5cc96a] },
  // 12월 크리스마스 이벤트 한정: 빨강 → 눈빛 하양 → 초록 + 별가루 (빨강·초록도 밤 외곽선과 7:1 이상으로 밝게)
  xm_name: { kind: "fx", fx: "stars", stops: [0xff8a98, 0xfff6f0, 0x8cf0a8] },
  // 11/20 계절 한정 (코디 기획안 시안 색 그대로): 「블루라이트 이름」 모니터 불빛 하늘빛 그라데이션 + 푸른 빛 무리,
  // 「색동 이름」 빨강·노랑·초록·파랑·보라 색동 빛깔이 글자마다 차례로 이어진다
  of_blueglow: { kind: "fx", fx: "glow", stops: [0x9ae8ff, 0x6fb8ff, 0xc8f4ff], halo: 0x5fc8ff },
  sm_saekname: { kind: "gradient", stops: [0xff8a8a, 0xffd26a, 0x9ae88a, 0x8ac8ff, 0xe09aff] },
  // 11/20 계절 한정 「서리 앉은 이름」 (코디 기획안 2차 시안 색 그대로): 연청 → 푸른 은 → 옅은 보라 + 글자 윗머리 하얀 서리 + 옅은 푸른 빛 무리
  fr_icename: { kind: "fx", fx: "frost", stops: [0xb8e4ff, 0x8cc4f4, 0xc4c8ff], halo: 0x9cd4ff },
};

export const NAME_PLATES: Readonly<Record<string, NamePlateSpec>> = {
  np_wood: { kind: "wood", fill: 0x6b4a2e, light: 0x8a6440, edge: 0x2e1f12, dots: [0xd8c8a0], alpha: 0.95 },
  np_ribbon: { kind: "ribbon", fill: 0xc8465f, light: 0xe0687e, edge: 0x6a1f30, dots: [], alpha: 0.95 },
  np_cloud: { kind: "cloud", fill: 0xe8eefc, light: 0xffffff, edge: 0x8396bd, dots: [], alpha: 0.92 },
  np_wreath: { kind: "wreath", fill: 0x24361f, light: 0x3b5a2e, edge: 0x5f8f3e, dots: [0xff9fc0, 0xffe08a, 0xffffff], alpha: 0.9 },
  np_tomb: { kind: "tomb", fill: 0x7d838b, light: 0x9aa1aa, edge: 0x3a3e45, dots: [0x6f8f4a], alpha: 0.95 },
  np_star: { kind: "star", fill: 0x1b2048, light: 0x2a3170, edge: 0x9fb4ff, dots: [0xfff3b0, 0xffffff], alpha: 0.92 },
  // 11/15 수집 의뢰 보상: 깊은 청록 물빛 (밝은 글자가 낮·밤 모두 또렷), 물마루 하이라이트 · dots = [물거품, 윤슬]
  q_name_wave: { kind: "wave", fill: 0x175a7e, light: 0x4fb8d8, edge: 0x0b2a40, dots: [0xe4fbff, 0x8fe2f0], alpha: 0.94 },
  // 11/15 수집 의뢰 보상 (월 교환소): 짙은 다홍 판 (밝은 글자가 또렷) · edge = 금테 · dots = [금 매듭·금가루, 매듭 술 다홍]
  q_name_newyear: { kind: "newyear", fill: 0x9a1c26, light: 0xd8483a, edge: 0xe8b23a, dots: [0xffd25a, 0xff6a4a], alpha: 0.95 },
  // 11/17 테마 꾸미기: 니트 (와인빛 털실 · dots = [골지 단 크림, 꽈배기 밝은 줄]), 사원증 (남색 카드 · 파란 띠 · dots = [집게 은빛, 띠 글자 하양]),
  // 모래사장 (모래 판 · dots = [불가사리 주황, 조개 분홍, 물거품 하늘])
  np_knit: { kind: "knit", fill: 0x7a2a3a, light: 0x9a3e4e, edge: 0x3e1018, dots: [0xf2e4c8, 0xb85a68], alpha: 0.96 },
  np_card: { kind: "card", fill: 0x22305a, light: 0x3a7ad8, edge: 0xc8d4e8, dots: [0xd8dce8, 0xf4f8ff], alpha: 0.96 },
  np_beach: { kind: "beach", fill: 0xc8a466, light: 0xe8cc92, edge: 0x7a5a2a, dots: [0xff8a4a, 0xffc0d0, 0x8ad8f0], alpha: 0.95 },
  // 12월 크리스마스 이벤트 한정: 짙은 상록 판 + 금테 + 위 눈 덮개 · dots = [열매 빨강, 잎 초록, 눈 하양]
  xm_plate: { kind: "holly", fill: 0x1e4a30, light: 0x2e6a44, edge: 0xe8c25a, dots: [0xe8323c, 0x4fae5a, 0xf8fbff], alpha: 0.95 },
  // 11/19 계절 한정 「선물 포장 이름표」: 빨간 포장지 · dots = [초록 줄무늬, 금 리본, 리본 밝은 금]
  si_wrap: { kind: "wrap", fill: 0xc82c3c, light: 0xe8505a, edge: 0x5a1018, dots: [0x2e8a4a, 0xf2c84a, 0xfff2b0], alpha: 0.96 },
  // 11/20 계절 한정 「편지봉투 이름표」: 분홍 편지지 · edge = 덮개 선·테두리 · dots = [하트 봉인, 봉인 밝은 분홍]
  vc_envelope: { kind: "envelope", fill: 0xffe4ec, light: 0xfff6f8, edge: 0xc85a7a, dots: [0xe83a6a, 0xff9ab8], alpha: 0.97 },
  // 11/20 계절 한정 「새해 계획표 이름표」: 크림 종이 · edge = 테두리·체크 칸 · dots = [줄 하늘, 체크 초록, 여백선 빨강, 스프링 고리 회색]
  rs_planner: { kind: "planner", fill: 0xfbf6e8, light: 0xffffff, edge: 0x5a6680, dots: [0xa8c4e8, 0x3aa86a, 0xe88a8a, 0x8a92a4], alpha: 0.97 },
};

export function nameColorSpec(id: string | null | undefined): NameColorSpec | null {
  return (id && Object.hasOwn(NAME_COLORS, id) && itemById(id)?.slot === "nameColor" && NAME_COLORS[id]) || null;
}

export function namePlateSpec(id: string | null | undefined): NamePlateSpec | null {
  return (id && Object.hasOwn(NAME_PLATES, id) && itemById(id)?.slot === "namePlate" && NAME_PLATES[id]) || null;
}

/** 화면이 그릴 닉네임 꾸미기 (착용 목록에서, 그릴 줄 모르는 id는 null). bell = 11/19 「산타 견습 요정」 한 벌 덤 (게임 이름표 옆 금종) */
export type NameStyleRef = { color: string | null; plate: string | null; bell?: boolean };
export function nameStyleRef(look: readonly string[] | null | undefined): NameStyleRef {
  const { color, plate } = nameStyleOfLook(look);
  const ref: NameStyleRef = { color: nameColorSpec(color) ? color : null, plate: namePlateSpec(plate) ? plate : null };
  if (ref.plate && seasonSetsOfLook(look).some((s) => s.id === "santa-intern")) ref.bell = true;
  return ref;
}
/** 착용 목록에서 닉네임 꾸미기 id만 (채팅 줄·랭킹 줄에 싣는다, 없으면 undefined) */
export function nameStyleIds(look: readonly string[] | null | undefined): string[] | undefined {
  const { color, plate } = nameStyleRef(look);
  const ids = [color, plate].filter((x): x is string => x !== null);
  return ids.length ? ids : undefined;
}
/** 꾸미기가 하나라도 있는지 */
export const hasNameStyle = (r: NameStyleRef | null | undefined): boolean => !!r && (r.color !== null || r.plate !== null);

// ── 색 계산 (순수) ──

/** 두 색 사이 (t = 0 → a, 1 → b), 채널마다 반올림 */
export function mixColor(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * u) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}

/** 색 띠 stops 위의 t (0~1, 밖이면 끝 색) */
export function gradientAt(stops: readonly number[], t: number): number {
  if (stops.length === 0) return 0xffffff;
  if (stops.length === 1) return stops[0];
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  return mixColor(stops[i], stops[i + 1], u - i);
}

/** 고리처럼 이어진 색 띠 (끝 색 → 첫 색으로 돌아온다). 흐르는 무지개용, t는 1마다 한 바퀴 */
export function cyclicAt(stops: readonly number[], t: number): number {
  const n = stops.length;
  if (n === 0) return 0xffffff;
  const u = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(u) % n;
  return mixColor(stops[i], stops[(i + 1) % n], u - Math.floor(u));
}

/**
 * 글자 n개 이름의 글자 경계 색 n+1개를 out에 채운다 (글자 i는 왼쪽 out[i] → 오른쪽 out[i+1]로 이어 칠한다 → 이름 전체가 한 띠).
 * phase가 있으면 띠가 고리로 돌아 흐른다 (span = 이름 한 줄에 보이는 띠 길이, 1 = 띠 한 바퀴).
 * 매 프레임 새 배열을 만들지 않게 out을 받아 그대로 돌려준다
 */
export function fillEdgeColors(out: number[], stops: readonly number[], n: number, phase: number | null = null, span = 0.6): number[] {
  const m = Math.max(1, n);
  out.length = m + 1;
  for (let i = 0; i <= m; i++) out[i] = phase === null ? gradientAt(stops, i / m) : cyclicAt(stops, phase + (i / m) * span);
  return out;
}

/** 이름 글자 색: 꾸미기가 없으면 null, 단색이면 그 색, 나머지는 경계 색 (멈춘 그림 기준) */
export function nameEdgeColors(id: string | null | undefined, n: number): number[] | null {
  const spec = nameColorSpec(id);
  if (!spec) return null;
  if (spec.kind === "solid") return fillEdgeColors([], [spec.color], n);
  return fillEdgeColors([], spec.stops, n);
}

/** 불꽃 이름 글자 i의 위·아래 색 (t = ms). 위는 노란 불끝이 일렁이고 아래는 주황 불씨 */
export function flameColor(i: number, t: number, top: boolean): number {
  const w = 0.5 + 0.5 * Math.sin(t / 170 + i * 1.9) * Math.sin(t / 290 + i * 0.7);
  return top ? mixColor(0xffd25a, 0xfff2b0, w) : mixColor(0xff7a3a, 0xffa040, 1 - w);
}

/** 물결 이름표 윤슬 한 줄의 흐름 (0~1, t = ms): 한 주기 WAVE_FLOW_MS마다 한 칸(period) 흐른다 */
export const WAVE_FLOW_MS = 1800;
export function waveFlow(t: number): number {
  return (((t / WAVE_FLOW_MS) % 1) + 1) % 1;
}

/** 새해 복 이름표 금가루: 한 알이 떠오르는 시간 (ms) · 한 번에 보이는 수 */
export const NY_DUST_MS = 2200;
export const NY_DUST_COUNT = 4;
/**
 * 금가루 i의 자리 (t = ms): x = 이름표 가로 비율 (양끝 ±0.36..0.54), y = 판 아래에서 위로 떠오른 비율 (0 → 1.3), a = 투명도. 결정적
 */
export function nyDustAt(i: number, t: number): { x: number; y: number; a: number } {
  const off = t + (i * NY_DUST_MS) / NY_DUST_COUNT;
  const k = Math.floor(off / NY_DUST_MS);
  const u = (off - k * NY_DUST_MS) / NY_DUST_MS;
  const seed = hashUnit(k * 13 + i * 71);
  // 글자를 가리지 않게 판 양끝 쪽에서 떠오른다 (번갈아 왼쪽·오른쪽)
  const side = (k + i) % 2 ? 1 : -1;
  return { x: side * (0.36 + seed * 0.18) + Math.sin(u * Math.PI * 2 + seed * 7) * 0.03, y: 0.1 + u * 1.2, a: Math.sin(Math.PI * u) };
}

/** 나뭇잎 하나가 떨어지는 길이 (ms) · 한 번에 보이는 잎 수 */
export const LEAF_FALL_MS = 2600;
export const LEAF_COUNT = 3;
/**
 * 나뭇잎 i의 자리 (t = ms): x = 이름표 가로 비율(양옆 가장자리 ±0.4..0.6), y = 이름표 위쪽에서 아래로 떨어진 비율(0 → 1.4),
 * rot = 기울기(라디안), flip = 뒤집힘(-1..1, 팔랑임), a = 투명도 (떨어지기 시작·끝은 흐리게). 결정적 (같은 시각 = 같은 자리)
 */
export function leafAt(i: number, t: number): { x: number; y: number; rot: number; flip: number; a: number } {
  const off = t + (i * LEAF_FALL_MS) / LEAF_COUNT;
  const k = Math.floor(off / LEAF_FALL_MS);
  const u = (off - k * LEAF_FALL_MS) / LEAF_FALL_MS;
  const seed = hashUnit(k * 7 + i * 131);
  // 글자를 가리지 않게 이름 양옆 가장자리로만 떨어진다 (번갈아 왼쪽·오른쪽)
  const side = (k + i) % 2 ? 1 : -1;
  const sway = Math.sin(u * Math.PI * 2.2 + seed * 6) * 0.05;
  return {
    x: side * (0.44 + seed * 0.1) + sway,
    y: u * 1.4,
    rot: Math.sin(u * Math.PI * 3 + seed * 5) * 0.6,
    flip: Math.cos(u * Math.PI * 4 + seed * 3),
    a: Math.min(1, u * 6, (1 - u) * 3),
  };
}
function hashUnit(n: number): number {
  let h = Math.imul(n | 0, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ── 대비 (읽기 쉬움 시험·도구) ──

function lin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
/** 상대 휘도 (WCAG) */
export function luminance(c: number): number {
  return 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255);
}
/** 두 색의 대비 (1~21) */
export function contrast(a: number, b: number): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** 글자 꾸미기에 쓰이는 모든 글자 색 (멈춘 그림 + 움직일 때 지나가는 색) */
export function nameColorSwatches(id: string): number[] {
  const spec = nameColorSpec(id);
  if (!spec) return [];
  if (spec.kind === "solid") return [spec.color];
  if (spec.kind === "fx" && spec.fx === "flame") return [0xffd25a, 0xfff2b0, 0xff7a3a, 0xffa040];
  return [...spec.stops];
}

// ── HTML (CSS) ──

export const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

/** CSS 그라데이션 (왼쪽 → 오른쪽) */
export function cssGradient(stops: readonly number[], loop = false): string {
  const list = loop ? [...stops, stops[0]] : stops.length === 1 ? [stops[0], stops[0]] : [...stops];
  return `linear-gradient(90deg, ${list.map(hex).join(", ")})`;
}
