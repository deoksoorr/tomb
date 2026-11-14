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
    case "glow": {
      const g = new Grid(16, 16);
      GA.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && g.set(x + 2, y + 2, spec.stops[0])));
      g.outline(spec.halo ?? 0x8fe8ff, true, 200);
      g.outline(spec.halo ?? 0x8fe8ff, false, 90);
      return g;
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

/** 닉네임 꾸미기 아이콘 (아니면 null) */
export function nameStyleIcon(itemId: string): Grid | null {
  const plate = namePlateSpec(itemId);
  if (plate) return plateIcon(plate);
  return colorIcon(itemId);
}

