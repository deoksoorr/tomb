import { ITEMS } from "@tomb/protocol";
import { gradientAt, NAME_COLORS, NAME_OUTLINE, NAME_PLATES, nameColorSpec, namePlateSpec, type NamePlateSpec } from "@/lib/nameStyle";
import { Grid } from "./pixel";

// 닉네임 꾸미기 아이콘 (상점·가방·랭킹 16×16). 이름 글자는 굵은 "가" 글자를 그 색(그라데이션은 왼쪽 → 오른쪽)으로,
// 바탕판은 판 모양 위에 글자 줄 두 개로 그린다. 색은 lib/nameStyle.ts와 같다.

/** 아이콘이 있는 닉네임 꾸미기 id */
export const NAME_STYLE_ICON_IDS: readonly string[] = ITEMS.filter((i) => (i.slot === "nameColor" && i.id in NAME_COLORS) || (i.slot === "namePlate" && i.id in NAME_PLATES)).map((i) => i.id);

// 굵은 "가" (2px 획, 12×12 안): ㄱ + ㅏ
const GA = [
  "............",
  "######...##.",
  "######...##.",
  "....##...##.",
  "....##...##.",
  "....##...####",
  "...##....####",
  "...##....##.",
  "..##.....##.",
  ".##......##.",
  "##.......##.",
  ".........##.",
];

function glyph(color: (x: number, y: number) => number): Grid {
  const g = new Grid(16, 16);
  GA.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.set(x + 2, y + 2, color(x / 12, y / 12))));
  g.outline(NAME_OUTLINE, true, 235);
  return g;
}

const HUE = [0xff8a8a, 0xffd27a, 0xb8f58a, 0x8ad8ff, 0xc2a2ff];

function colorIcon(id: string): Grid | null {
  const spec = nameColorSpec(id);
  if (!spec) return null;
  if (spec.kind === "solid") return glyph(() => spec.color);
  if (spec.kind === "gradient") return glyph((tx) => gradientAt(spec.stops, tx));
  switch (spec.fx) {
    case "rainbow":
      return glyph((tx) => gradientAt(HUE, tx));
    case "flame": {
      const g = glyph((_, ty) => gradientAt([0xfff2b0, 0xffd25a, 0xff7a3a], ty));
      // 불끝
      g.set(3, 1, 0xffd25a);
      g.set(12, 0, 0xffe680);
      g.set(13, 1, 0xff8a3a);
      return g;
    }
    case "stars": {
      const g = glyph((tx) => gradientAt(spec.stops, tx));
      for (const [x, y] of [
        [1, 1],
        [14, 3],
        [13, 13],
      ] as const) {
        g.set(x, y, 0xffffff);
        g.set(x - 1, y, 0xfff4c2, 160);
        g.set(x + 1, y, 0xfff4c2, 160);
        g.set(x, y - 1, 0xfff4c2, 160);
        g.set(x, y + 1, 0xfff4c2, 160);
      }
      return g;
    }
    case "leaves": {
      // 11/15 나뭇잎 이름 글자: 잎 초록 그라데이션 + 둘레에 떨어지는 작은 잎 둘 (외곽선은 글자·잎 함께)
      const g = new Grid(16, 16);
      GA.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.set(x + 2, y + 2, gradientAt(spec.stops, x / 12))));
      const leaf = (x: number, y: number, hi: number, c: number) => {
        g.set(x + 2, y, hi);
        g.set(x + 1, y + 1, hi);
        g.set(x + 2, y + 1, c);
        g.set(x, y + 2, c);
        g.set(x + 1, y + 2, c);
      };
      leaf(8, 3, 0xeaffa0, 0x7fdc5c);
      leaf(6, 11, 0xd8ff8a, 0x5cc96a);
      g.outline(NAME_OUTLINE, true, 235);
      return g;
    }
    case "glow": {
      const g = new Grid(16, 16);
      GA.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.set(x + 2, y + 2, spec.stops[0])));
      g.outline(spec.halo ?? 0x8fe8ff, true, 200);
      g.outline(spec.halo ?? 0x8fe8ff, false, 90);
      return g;
    }    case "frost": {
      // 11/20 서리 앉은 이름: 얼음빛 그라데이션 + 글자 윗머리 하얀 서리
      return glyph((tx, ty) => (ty < 0.12 ? 0xffffff : gradientAt(spec.stops, tx)));
    }
  }
}

/** 판 모양 (가운데 14×8 안) + 글자 줄 두 개 */
function plateIcon(p: NamePlateSpec): Grid {
  const g = new Grid(16, 16);
  const [x0, y0, w, h] = [2, 5, 12, 7];
  switch (p.kind) {
    case "ribbon":
      g.rect(x0, y0, w, h, p.fill);
      g.hline(x0, x0 + w - 1, y0, p.light);
      // 갈라진 꼬리
      for (const s of [-1, 1]) {
        const ex = s < 0 ? x0 - 1 : x0 + w;
        g.vline(ex, y0 + 1, y0 + h - 2, p.edge);
        g.set(ex + s, y0 + 1, p.edge);
        g.set(ex + s, y0 + h - 2, p.edge);
      }
      break;
    case "cloud":
      g.rect(x0 + 1, y0, w - 2, h, p.fill);
      g.ellipse(5, y0, 2.5, 2, p.fill);
      g.ellipse(9.5, y0 - 0.5, 3, 2.5, p.fill);
      g.ellipse(x0 + 0.5, y0 + 3.5, 1.6, 2.6, p.fill);
      g.ellipse(x0 + w - 0.5, y0 + 3.5, 1.6, 2.6, p.fill);
      g.hline(x0 + 2, x0 + w - 3, y0 - 1, p.light);
      break;
    case "tomb":
      g.rect(x0 + 1, y0 - 1, w - 2, h + 1, p.fill);
      g.hline(x0 + 3, x0 + w - 4, y0 - 2, p.fill);
      g.hline(x0 + 2, x0 + w - 3, y0 - 1, p.light);
      g.set(x0 + 2, y0 + h - 1, p.dots[0]);
      g.set(x0 + 3, y0 + h - 1, p.dots[0]);
      g.set(x0 + w - 3, y0 + h - 1, p.dots[0]);
      break;
    case "wave":
      // 물빛 판 + 물마루 둘 + 윤슬 (아래쪽은 깊은 물)
      g.rect(x0, y0, w, h, p.fill);
      g.rect(x0, y0 + 5, w, 2, mixDeep(p.fill, p.edge));
      for (const cx of [x0 + 2, x0 + 8]) {
        g.hline(cx, cx + 2, y0 - 1, p.light);
        g.set(cx + 1, y0 - 2, p.dots[0]);
      }
      g.hline(x0, x0 + w - 1, y0, p.light);
      break;
    case "newyear":
      // 다홍 판 + 아래 금실 + 위 금가루 (양옆 매듭은 테두리 다음에)
      g.rect(x0, y0, w, h, p.fill);
      g.hline(x0, x0 + w - 1, y0, p.light);
      g.hline(x0 + 1, x0 + w - 2, y0 + h - 2, p.edge);
      break;
    case "knit":
      // 와인빛 판 + 꽈배기 V 땀 (골지 단은 테두리 다음에)
      g.rect(x0, y0, w, h, p.fill);
      for (const cx of [x0 + 2, x0 + 8]) {
        g.set(cx, y0 + 2, p.dots[1]);
        g.set(cx + 2, y0 + 2, p.dots[1]);
        g.set(cx + 1, y0 + 3, p.dots[1]);
        g.set(cx, y0 + 5, p.dots[1]);
        g.set(cx + 2, y0 + 5, p.dots[1]);
      }
      break;
    case "card":
      g.rect(x0, y0, w, h, p.fill);
      g.hline(x0, x0 + w - 1, y0, p.light);
      g.hline(x0, x0 + w - 1, y0 + 1, p.light);
      break;
    case "beach":
      g.rect(x0, y0, w, h, p.fill);
      g.hline(x0, x0 + w - 1, y0, p.dots[2]);
      break;
    case "holly":
      g.rect(x0, y0, w, h, p.fill);
      g.hline(x0, x0 + w - 1, y0 + h - 2, p.light);
      break;
    case "envelope": {
      // 11/20 편지봉투: 분홍 편지지 + 덮개 V선 + 하트 봉인
      g.rect(x0, y0, w, h, p.fill);
      const mid = (w - 1) / 2;
      for (let x = 0; x < w; x++) g.set(x0 + x, y0 + Math.round((1 - Math.abs(x - mid) / mid) * (h * 0.55)), p.edge);
      const mx = x0 + Math.floor(w / 2);
      g.hline(mx - 1, mx + 1, y0 + h - 3, p.dots[0]);
      g.set(mx, y0 + h - 2, p.dots[0]);
      break;
    }
    case "planner": {
      // 11/20 새해 계획표: 크림 종이 + 옅은 줄 + 빨간 여백선 + 왼쪽 체크 칸 둘 (스프링 고리는 테두리 다음에)
      g.rect(x0, y0, w, h, p.fill);
      for (const y of [y0 + 2, y0 + 5]) g.hline(x0 + 5, x0 + w - 2, y, p.dots[0]);
      g.vline(x0 + 4, y0, y0 + h - 1, p.dots[2]);
      g.set(x0 + 1, y0 + 2, p.dots[1]);
      g.set(x0 + 2, y0 + 3, p.dots[1]);
      g.set(x0 + 3, y0 + 1, p.dots[1]);
      g.set(x0 + 1, y0 + 5, p.edge);
      g.set(x0 + 2, y0 + 5, p.edge);
      break;
    }
    case "wrap":
      // 11/19 선물 포장: 빨강·초록 사선 줄무늬 + 가운데 금 리본 띠
      g.rect(x0, y0, w, h, p.fill);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.floor((x + y) / 2) % 3 === 0) g.set(x0 + x, y0 + y, p.dots[0]);
      g.vline(x0 + Math.floor(w / 2) - 1, y0, y0 + h - 1, p.dots[1]);
      g.vline(x0 + Math.floor(w / 2), y0, y0 + h - 1, p.dots[1]);
      break;
    default:
      g.rect(x0, y0, w, h, p.fill);
      g.hline(x0, x0 + w - 1, y0, p.light);
  }
  g.outline(p.edge, p.kind !== "ribbon");
  // 장식 점
  if (p.kind === "wood") {
    g.set(x0 + 1, y0 + 1, p.dots[0]);
    g.set(x0 + w - 2, y0 + 1, p.dots[0]);
  } else if (p.kind === "wreath") {
    [x0 - 1, x0 + 3, x0 + 7, x0 + w].forEach((x, i) => g.set(x, i % 2 ? y0 - 1 : y0 + h, p.dots[i % p.dots.length]));
    g.set(x0 + w, y0 + 2, p.dots[0]);
    g.set(x0 - 1, y0 + 3, p.dots[1]);
  } else if (p.kind === "wave") {
    g.hline(x0 + 1, x0 + 2, y0 + 5, p.dots[1]);
    g.hline(x0 + w - 4, x0 + w - 2, y0 + 6, p.dots[1]);
  } else if (p.kind === "newyear") {
    // 양옆 복 매듭 (금 마름모 + 다홍 술) · 위로 떠오르는 금가루
    for (const kx of [0, 15]) {
      g.set(kx, y0 + 2, p.dots[0]);
      g.set(kx, y0 + 4, p.dots[0]);
      g.set(kx, y0 + 3, 0xfff2b0);
      g.set(kx, y0 + 5, p.dots[1]);
      g.set(kx, y0 + 6, p.dots[1]);
    }
    g.set(x0 + 2, y0 - 3, p.dots[0]);
    g.set(x0 + w - 3, y0 - 2, p.dots[0]);
    g.set(x0 + 6, y0 - 4, 0xfff2b0);
  } else if (p.kind === "planner") {
    // 위 스프링 고리
    for (let x = x0 + 1; x < x0 + w; x += 3) g.set(x, y0 - 2, p.dots[3]);
  } else if (p.kind === "knit") {
    // 위아래 크림 골지 단
    for (let x = x0 - 1; x <= x0 + w; x++) {
      g.set(x, y0 - 1, x % 2 ? p.dots[0] : 0xd8c8a8);
      g.set(x, y0 + h, x % 2 ? p.dots[0] : 0xd8c8a8);
    }
  } else if (p.kind === "card") {
    // 줄을 거는 은빛 집게 + 오른쪽 아래 바코드
    g.hline(7, 9, y0 - 2, p.dots[0]);
    g.set(8, y0 - 1, p.dots[0]);
    g.set(x0 + w - 2, y0 + h - 2, p.dots[1]);
    g.set(x0 + w - 4, y0 + h - 2, p.dots[1]);
  } else if (p.kind === "beach") {
    // 물거품 · 불가사리 · 조개
    g.set(x0 + 2, y0 - 1, 0xffffff);
    g.set(x0 + 7, y0 - 1, 0xffffff);
    const sx = x0 + w - 2;
    const sy = y0 + h - 2;
    g.set(sx, sy, 0xffd0a0);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) g.set(sx + dx, sy + dy, p.dots[0]);
    g.set(x0 + 1, y0 + h - 2, p.dots[1]);
    g.set(x0 + 2, y0 + h - 2, p.dots[1]);
  } else if (p.kind === "holly") {
    // 위를 덮은 눈 + 양 귀퉁이 호랑가시 (잎 둘 + 빨간 열매)
    g.hline(x0, x0 + w - 1, y0 - 1, p.dots[2]);
    g.set(x0 + 4, y0, p.dots[2]);
    g.set(x0 + 8, y0, p.dots[2]);
    for (const cx of [x0, x0 + w - 1]) {
      g.set(cx - 1, y0 - 1, p.dots[1]);
      g.set(cx + 1, y0 - 1, p.dots[1]);
      g.set(cx - 1, y0 - 2, p.dots[1]);
      g.set(cx + 1, y0 - 2, p.dots[1]);
      g.set(cx, y0 - 2, p.dots[0]);
      g.set(cx, y0 - 3, p.dots[0]);
    }
  } else if (p.kind === "wrap") {
    // 위에 금 리본 매듭
    const mx = x0 + Math.floor(w / 2);
    g.set(mx - 3, y0 - 2, p.dots[1]);
    g.set(mx - 2, y0 - 2, p.dots[2]);
    g.set(mx + 1, y0 - 2, p.dots[1]);
    g.set(mx + 2, y0 - 2, p.dots[1]);
    g.set(mx - 1, y0 - 1, p.dots[1]);
    g.set(mx, y0 - 1, p.dots[2]);
  } else if (p.kind === "star") {
    g.set(x0 + 1, y0 + 1, p.dots[0]);
    g.set(x0 + w - 2, y0 + h - 2, p.dots[0]);
    g.set(x0 + w - 2, y0 + 1, p.dots[1]);
    g.set(x0 + w - 1, y0 - 2, p.dots[0]);
  }
  // 이름 글자 자리 (밝은 줄 두 개, 외곽선 없이)
  const ink = p.kind === "cloud" ? 0x4a5672 : 0xf2ead3;
  g.hline(x0 + 3, x0 + 5, y0 + 3, ink);
  g.hline(x0 + 7, x0 + w - 4, y0 + 3, ink);
  g.hline(x0 + 3, x0 + w - 4, y0 + 4, ink);
  return g;
}

/** 두 색 반반 (깊은 물빛) */
function mixDeep(a: number, b: number): number {
  const ch = (s: number) => ((((a >> s) & 255) + ((b >> s) & 255)) >> 1) << s;
  return ch(16) | ch(8) | ch(0);
}

/** 11/15 나뭇잎 이름 글자의 떨어지는 잎 (5×4 두 프레임: 연두 잎 · 짙은 잎). 게임 이름표(NameStyleView)가 텍스처로 한 번 만든다 */
export const NAME_LEAF_W = 5;
export const NAME_LEAF_H = 4;
export function nameLeafGrid(): Grid {
  const g = new Grid(NAME_LEAF_W * 2, NAME_LEAF_H);
  const pal = [
    [0xeaffa0, 0xa8ec68, 0x4f9a3a],
    [0xa8ec68, 0x5cc96a, 0x2f6f2e],
  ];
  pal.forEach(([hi, c, vein], f) => {
    const o = f * NAME_LEAF_W;
    // 비스듬한 잎 (오른쪽 위로 뾰족) + 가운데 잎맥 + 왼쪽 아래 꼭지
["...hc", ".hhcc", "hcvc.", "v...."].forEach((row, y) =>
      [...row].forEach((ch, x) => ch !== "." && g.set(o + x, y, ch === "h" ? hi : ch === "v" ? vein : c)),
    );
  });
  return g;
}

/** 닉네임 꾸미기 아이콘 (아니면 null) */
export function nameStyleIcon(itemId: string): Grid | null {
  const plate = namePlateSpec(itemId);
  if (plate) return plateIcon(plate);
  return colorIcon(itemId);
}


// ── 11/19 「산타 견습 요정」 한 벌 덤: 이름표 옆 금종 (NameStyleView가 이름표 옆에 매달아 가끔 딸랑 흔든다) ──

/** 금종 한 칸 크기 (화면 px — 이름표 글자 12px와 비슷하게) · 기울기 칸 수 (-2 … 2) */
export const NAME_BELL_W = 13;
export const NAME_BELL_H = 16;
export const NAME_BELL_TILTS = [-2, -1, 0, 1, 2] as const;
/** 고리(매다는 점) 자리 — 칸 안 좌표. 이 줄 아래만 기울어진다 */
export const NAME_BELL_HOOK: readonly [number, number] = [6, 5];
const BELL_ART = [
  "..rr...rr..",
  ".rRrr.rrRr.",
  "..rrrRrrr..",
  "...r.h.r...",
  ".....h.....",
  "....yyy....",
  "...yYyyy...",
  "...yYyyL...",
  "..yYYyyyL..",
  "..yYyyyyL..",
  ".yyyyyyyyL.",
  "yyyyyyyyyyL",
  ".LLLLLLLLL.",
  ".....c.....",
];
const BELL_PAL: Readonly<Record<string, number>> = { r: 0xd63a3a, R: 0xf26a5e, h: 0xb88a22, y: 0xf2c84a, Y: 0xfff2b0, L: 0xb88a22, c: 0x8a5a14 };

/** 금종 시트 (기울기 다섯 칸을 가로로): 고리 아래 줄은 아래로 갈수록 기울기만큼 옆으로 밀려 흔들린다 (픽셀 그대로 — 번지지 않게) */
export function nameBellGrid(): Grid {
  const n = NAME_BELL_TILTS.length;
  const g = new Grid(NAME_BELL_W * n, NAME_BELL_H);
  const [, hookY] = NAME_BELL_HOOK;
  NAME_BELL_TILTS.forEach((k, f) => {
    const one = new Grid(NAME_BELL_W, NAME_BELL_H);
    BELL_ART.forEach((row, j) => {
      const y = j + 1;
      const shift = y > hookY ? Math.round((k * (y - hookY)) / (NAME_BELL_H - 2 - hookY)) : 0;
      [...row].forEach((ch, i) => {
        const c = BELL_PAL[ch];
        if (c !== undefined) one.set(i + 1 + shift, y, c);
      });
    });
    one.outline(0x3a1a08, false, 255);
    g.draw(one, f * NAME_BELL_W, 0);
  });
  return g;
}
