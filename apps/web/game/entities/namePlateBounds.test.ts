import { describe, expect, it, vi } from "vitest";

// 11/22 운영자 「이름표 왼쪽이 잘린다」 전수조사: 머리 위 이름표 바탕판은 plateBounds 크기의 텍스처에 한 번 굽는다 (BakedShape).
// 그리기(drawPlate)가 굽는 영역 밖으로 나가면 그만큼 판 끝(꼬리·매듭·체크 칸·테두리)이 잘려 보인다 →
// 모든 이름표 × 짧은·긴 이름 × 글자 높이에서 그린 범위가 굽는 영역 안인지 본다.

vi.mock("phaser", () => ({ BlendModes: {}, default: {} }));
vi.mock("../assets/manifest", () => ({ TEX: new Proxy({}, { get: (_t, k) => String(k) }), addCanvasTexture: () => {} }));

const { drawPlate, plateBounds } = await import("./NameStyleView");
const { NAME_PLATES } = await import("@/lib/nameStyle");

type Box = { l: number; r: number; t: number; b: number };

/** 그리기 호출의 범위만 모으는 가짜 Graphics */
function recorder() {
  const box: Box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    box.l = Math.min(box.l, x0, x1);
    box.r = Math.max(box.r, x0, x1);
    box.t = Math.min(box.t, y0, y1);
    box.b = Math.max(box.b, y0, y1);
  };
  const g = {
    fillStyle: () => g,
    lineStyle: () => g,
    fillRect: (x: number, y: number, w: number, h: number) => (add(x, y, x + w, y + h), g),
    fillRoundedRect: (x: number, y: number, w: number, h: number) => (add(x, y, x + w, y + h), g),
    fillCircle: (x: number, y: number, r: number) => (add(x - r, y - r, x + r, y + r), g),
    fillTriangle: (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => (add(Math.min(x0, x1, x2), Math.min(y0, y1, y2), Math.max(x0, x1, x2), Math.max(y0, y1, y2)), g),
    fillPoints: (pts: { x: number; y: number }[]) => {
      for (const p of pts) add(p.x, p.y, p.x, p.y);
      return g;
    },
  };
  return { g, box };
}

describe("머리 위 이름표 바탕판은 굽는 영역 안에 다 그려진다 (왼쪽·오른쪽·위·아래 잘림 없음)", () => {
  // 글자 칸 폭: 한 글자(쀍) ~ 12자 이름, 높이: Galmuri11 12px 칸(16) 안팎
  const widths = [7, 12, 26, 37, 80, 150];
  const heights = [13, 15, 16];
  for (const [id, spec] of Object.entries(NAME_PLATES)) {
    for (const bell of [false, true]) {
      it(`${id}${bell ? " + 금종" : ""}`, () => {
        const p = bell ? { ...spec, bell: true } : spec;
        for (const w of widths)
          for (const h of heights) {
            const { g, box } = recorder();
            drawPlate(g as never, p, w, h, 1);
            const b = plateBounds(p, w, h);
            // 판 몸이 글자 칸(-w/2..w/2, -h..0)을 덮었는지 (가짜 Graphics가 실제로 그린 것을 받았는지)
            expect(box.l).toBeLessThan(-w / 2);
            expect(box.r).toBeGreaterThan(w / 2);
            expect(box.t).toBeLessThan(-h);
            expect(box.b).toBeGreaterThan(0);
            expect(box.l, `${id} w${w} h${h} 왼쪽`).toBeGreaterThanOrEqual(b.x);
            expect(box.r, `${id} w${w} h${h} 오른쪽`).toBeLessThanOrEqual(b.x + b.w);
            expect(box.t, `${id} w${w} h${h} 위`).toBeGreaterThanOrEqual(b.y);
            expect(box.b, `${id} w${w} h${h} 아래`).toBeLessThanOrEqual(b.y + b.h);
          }
      });
    }
  }
});
