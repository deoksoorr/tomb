import type { MapConcept } from "@/lib/mapConcept";
import { drawNwHatAt, type NpcWear } from "./npcWear";
import { darken, type Grid, lighten, type Color } from "./pixel";

// 11/17 자리를 지키는 NPC(앞모습 한 장 그림 — 상점 주인장·어부 영감·수집가·사육사·캠핑장·등대지기·유령 상인 …)의 겨울·크리스마스 덧그림.
//  그림 함수가 외곽선을 두르기 전에 부른다 (모자는 돌아다니는 주민과 같은 그림 — npcWear). 반투명 유령 모자는 외곽선 다음에.
//  텍스처 키는 판마다 따로 (seasonKey) — 기본판은 원래 키 그대로라 예전 그림·미리 굽기와 같다.

export const S_RED = 0xd23a44;
export const S_GREEN = 0x2e8a4e;
export const S_SNOW = 0xf8f6f0;
const HOLLY = 0x2f8a46;
const HOLLY_LO = 0x1f6634;
const BERRY = 0xe0303c;
const BERRY_HI = 0xff7a7a;

/** 판마다 텍스처 키 (기본판은 그대로) */
export function seasonKey(key: string, concept: MapConcept): string {
  return concept === "winter" ? `${key}~nw` : concept === "christmas" ? `${key}~nx` : key;
}

/** 모자 (npcWear와 같은 그림) */
export function seasonHat(g: Grid, cx: number, hy: number, rx: number, top: number, hat: NonNullable<NpcWear["hat"]>): void {
  drawNwHatAt(g, cx, hy, rx, top, hat);
}

/** 뜨개 목도리 (앞모습): x0~x1 한 줄(두툼하면 두 줄) + 한쪽으로 늘어진 끝 */
export function seasonScarf(g: Grid, x0: number, x1: number, y: number, o: { c: Color; c2?: Color; pat?: "solid" | "stripe" | "check" | "dots"; thick?: boolean; tail?: number | null }): void {
  const c2 = o.c2 ?? lighten(o.c, 0.3);
  const col = (x: number, row: number): Color => {
    if (o.pat === "stripe") return Math.floor((x + 40) / 2) % 2 ? c2 : o.c;
    if (o.pat === "check") return (x + row) % 2 ? c2 : o.c;
    if (o.pat === "dots") return (x + row * 2) % 3 === 0 ? c2 : o.c;
    return x % 2 ? lighten(o.c, 0.1) : o.c;
  };
  const rows = o.thick ? 2 : 1;
  for (let r = 0; r < rows; r++) for (let x = x0 + (r ? 1 : 0); x <= x1 - (r ? 1 : 0); x++) g.set(x, y + r, x >= x1 - 1 ? darken(col(x, r), 0.2) : col(x, r));
  if (o.tail === null || o.tail === undefined) return;
  const tx = o.tail;
  for (let i = 0; i < 4; i++) {
    const yy = y + rows + i;
    const last = i === 3;
    const cc = o.pat === "stripe" || o.pat === "check" ? (i % 2 ? c2 : o.c) : o.c;
    g.set(tx, yy, last ? c2 : cc);
    g.set(tx + 1, yy, last ? darken(o.c, 0.2) : darken(cc, 0.2));
  }
}

/** 벙어리장갑 (2×3, 위 한 줄은 밝은 단) */
export function seasonMitt(g: Grid, x: number, y: number, c: Color): void {
  const cuff = lighten(c, 0.45);
  g.set(x, y, cuff);
  g.set(x + 1, y, cuff);
  g.set(x, y + 1, c);
  g.set(x + 1, y + 1, darken(c, 0.22));
  g.set(x, y + 2, c);
  g.set(x + 1, y + 2, darken(c, 0.22));
}

/** 호랑가시 브로치 (잎 둘 + 빨간 열매) */
export function seasonHolly(g: Grid, x: number, y: number): void {
  g.set(x - 1, y, HOLLY);
  g.set(x + 1, y, HOLLY_LO);
  g.set(x, y, BERRY);
  g.set(x, y - 1, BERRY_HI);
  g.set(x + 1, y + 1, HOLLY);
}

/** 크리스마스 앞치마 (가슴 호랑가시 + 아래 단 무늬) */
export function seasonApron(g: Grid, x0: number, x1: number, y0: number, y1: number, c: Color, trim: Color = BERRY, holly = true): void {
  for (let y = y0; y <= y1; y++) for (let x = x0 + (y === y0 ? 1 : 0); x <= x1 - (y === y0 ? 1 : 0); x++) g.set(x, y, y === y1 ? ((x + y) % 2 ? trim : S_SNOW) : x === x1 ? darken(c, 0.15) : c);
  g.set(x0, y0 - 1, trim);
  g.set(x1, y0 - 1, trim);
  if (holly) seasonHolly(g, Math.round((x0 + x1) / 2), y0 + 1);
}

/** 모자 챙·어깨에 소복한 눈 (x0~x1 한 줄 + 몽글한 끝) */
export function seasonSnow(g: Grid, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) g.set(x, y, (x + 20) % 3 === 0 ? 0xd9dce6 : S_SNOW);
  g.set(x0 + 1, y - 1, S_SNOW);
  g.set(x1 - 2, y - 1, S_SNOW);
}

/** 루돌프 빨간 코 (앞모습 2칸) */
export function seasonNose(g: Grid, x: number, y: number): void {
  g.set(x, y, BERRY);
  g.set(x + 1, y, darken(BERRY, 0.18));
}
