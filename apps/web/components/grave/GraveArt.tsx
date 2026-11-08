import { flowerStack, type GraveTier } from "@tomb/protocol";
import PixelArt, { type PixelRect } from "../ui/PixelArt";

export const TIER_LABELS: Record<GraveTier, string> = {
  woodSign: "나무 팻말",
  smallStone: "작은 비석",
  largeStone: "큰 비석",
  pagoda: "석탑",
};

const C = {
  outline: "#1a1b17",
  stone: "#a3a597",
  stoneLight: "#bfc0b2",
  stoneDark: "#73766b",
  engrave: "#5d6058",
  wood: "#8a6a4a",
  woodDark: "#5e4630",
  ground: "#2b3326",
  moss: "#55704f",
  petal: "#e8d27a",
  petalAlt: "#ece0bd",
  center: "#c98a4a",
};

// 24×24 격자. 생존 기간에 따라 나무 팻말 → 작은 비석 → 큰 비석 → 석탑.
const TIERS: Record<GraveTier, PixelRect[]> = {
  woodSign: [
    [11, 10, 2, 12, C.woodDark],
    [4, 4, 16, 9, C.outline],
    [5, 5, 14, 7, C.wood],
    [5, 11, 14, 1, C.woodDark],
    [7, 7, 10, 1, C.woodDark],
    [7, 9, 7, 1, C.woodDark],
    [6, 6, 1, 1, C.outline],
    [17, 6, 1, 1, C.outline],
  ],
  smallStone: [
    [9, 6, 6, 1, C.outline],
    [8, 7, 8, 1, C.outline],
    [7, 8, 10, 14, C.outline],
    [9, 7, 6, 1, C.stone],
    [8, 8, 8, 14, C.stone],
    [8, 8, 1, 14, C.stoneLight],
    [14, 8, 2, 14, C.stoneDark],
    [10, 11, 4, 1, C.engrave],
    [10, 13, 4, 1, C.engrave],
    [8, 20, 3, 2, C.moss],
  ],
  largeStone: [
    [8, 3, 8, 1, C.outline],
    [7, 4, 10, 1, C.outline],
    [6, 5, 12, 15, C.outline],
    [8, 4, 8, 1, C.stone],
    [7, 5, 10, 14, C.stone],
    [7, 5, 1, 14, C.stoneLight],
    [15, 5, 2, 14, C.stoneDark],
    [9, 8, 6, 1, C.engrave],
    [9, 10, 6, 1, C.engrave],
    [9, 12, 4, 1, C.engrave],
    [3, 19, 18, 3, C.outline],
    [4, 19, 16, 2, C.stoneDark],
    [4, 19, 16, 1, C.stone],
    [7, 17, 3, 2, C.moss],
  ],
  pagoda: [
    [11, 1, 2, 3, C.stoneDark],
    [7, 4, 10, 2, C.outline],
    [8, 4, 8, 1, C.stone],
    [10, 6, 4, 3, C.stone],
    [13, 6, 1, 3, C.stoneDark],
    [6, 9, 12, 2, C.outline],
    [7, 9, 10, 1, C.stone],
    [9, 11, 6, 3, C.stone],
    [14, 11, 1, 3, C.stoneDark],
    [4, 14, 16, 2, C.outline],
    [5, 14, 14, 1, C.stone],
    [8, 16, 8, 3, C.stone],
    [15, 16, 1, 3, C.stoneDark],
    [8, 16, 1, 3, C.stoneLight],
    [4, 19, 16, 3, C.outline],
    [5, 19, 14, 2, C.stoneDark],
    [5, 19, 14, 1, C.stone],
    [16, 17, 2, 2, C.moss],
  ],
};

const GROUND: PixelRect = [0, 22, 24, 2, C.ground];

// 꽃 자리 (최대 8송이, 묘비 양옆 바닥에서 바깥으로)
const FLOWER_SPOTS = [
  [2, 20],
  [19, 20],
  [0, 21],
  [21, 21],
  [4, 21],
  [17, 21],
  [1, 18],
  [22, 18],
] as const;

function flowers(count: number): PixelRect[] {
  return FLOWER_SPOTS.slice(0, flowerStack(count)).flatMap(([x, y], i): PixelRect[] => [
    [x, y, 2, 2, i % 2 ? C.petalAlt : C.petal],
    [x + 1, y + 1, 1, 1, C.center],
  ]);
}

type Props = { tier: GraveTier; flowers?: number; scale?: number; className?: string; label?: string };

export default function GraveArt({ tier, flowers: flowerCount = 0, scale = 4, className, label }: Props) {
  return (
    <PixelArt
      width={24}
      height={24}
      scale={scale}
      className={className}
      label={label}
      rects={[GROUND, ...TIERS[tier], ...flowers(flowerCount)]}
    />
  );
}
