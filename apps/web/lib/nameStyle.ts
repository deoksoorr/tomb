import { itemById, nameStyleOfLook } from "@tomb/protocol";

// 닉네임 꾸미기 (상점에서 사는 이름 글자 색·이름표 바탕판)의 색·그림 정의와 순수 계산.
// 게임 머리 위 이름표(game/entities/NameStyleView — 비트맵 글꼴 글자마다 색)와 화면 HTML 이름(components/ui/StyledName — CSS)이 같이 쓴다.
// 아이템(id·값·부위)은 @tomb/protocol items.ts. 여기 없는 id(옛 화면이 모르는 새 꾸미기 등)는 꾸미기 없음으로 본다.
//
// 읽기 쉬움: 게임 글자는 늘 어두운 1px 외곽선(GlyphAtlas OUTLINE)을 두르고 밤 어둠 층 위(DEPTH.labels)에 그려진다.
// 그래서 글자 색은 모두 "외곽선과 대비 7:1 이상"인 밝은 색만 쓴다 (nameStyle.test.ts가 확인한다).

/** 이름표 외곽선 색 (GlyphAtlas OUTLINE과 같다) */
export const NAME_OUTLINE = 0x0a0b10;

export type NameFx = "glow" | "rainbow" | "stars" | "flame";
/**
 * 이름 글자 꾸미기.
 *  - solid: 한 색
 *  - gradient: stops를 이름 첫 글자부터 끝 글자까지 고르게 잇는다
 *  - fx: 빛나고 움직이는 이름. stops = 멈춘 그림(움직임 줄이기)·HTML 바탕 색
 */
export type NameColorSpec =
  | { kind: "solid"; color: number }
  | { kind: "gradient"; stops: readonly number[] }
  | { kind: "fx"; fx: NameFx; stops: readonly number[]; /** 빛 무리 색 (glow·flame) */ halo?: number };

export type NamePlateKind = "wood" | "ribbon" | "cloud" | "wreath" | "tomb" | "star";
/** 이름표 바탕판: fill 바탕 · light 위쪽 밝은 띠 · edge 테두리 · dots 장식 점 색 (꽃·별·못·이끼) */
export type NamePlateSpec = { kind: NamePlateKind; fill: number; light: number; edge: number; dots: readonly number[]; /** 바탕 투명도 */ alpha: number };

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
};

export const NAME_PLATES: Readonly<Record<string, NamePlateSpec>> = {
  np_wood: { kind: "wood", fill: 0x6b4a2e, light: 0x8a6440, edge: 0x2e1f12, dots: [0xd8c8a0], alpha: 0.95 },
  np_ribbon: { kind: "ribbon", fill: 0xc8465f, light: 0xe0687e, edge: 0x6a1f30, dots: [], alpha: 0.95 },
  np_cloud: { kind: "cloud", fill: 0xe8eefc, light: 0xffffff, edge: 0x8396bd, dots: [], alpha: 0.92 },
  np_wreath: { kind: "wreath", fill: 0x24361f, light: 0x3b5a2e, edge: 0x5f8f3e, dots: [0xff9fc0, 0xffe08a, 0xffffff], alpha: 0.9 },
  np_tomb: { kind: "tomb", fill: 0x7d838b, light: 0x9aa1aa, edge: 0x3a3e45, dots: [0x6f8f4a], alpha: 0.95 },
  np_star: { kind: "star", fill: 0x1b2048, light: 0x2a3170, edge: 0x9fb4ff, dots: [0xfff3b0, 0xffffff], alpha: 0.92 },
};

export function nameColorSpec(id: string | null | undefined): NameColorSpec | null {
  return (id && Object.hasOwn(NAME_COLORS, id) && itemById(id)?.slot === "nameColor" && NAME_COLORS[id]) || null;
}

export function namePlateSpec(id: string | null | undefined): NamePlateSpec | null {
  return (id && Object.hasOwn(NAME_PLATES, id) && itemById(id)?.slot === "namePlate" && NAME_PLATES[id]) || null;
}

/** 화면이 그릴 닉네임 꾸미기 (착용 목록에서, 그릴 줄 모르는 id는 null) */
export type NameStyleRef = { color: string | null; plate: string | null };
export function nameStyleRef(look: readonly string[] | null | undefined): NameStyleRef {
  const { color, plate } = nameStyleOfLook(look);
  return { color: nameColorSpec(color) ? color : null, plate: namePlateSpec(plate) ? plate : null };
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
