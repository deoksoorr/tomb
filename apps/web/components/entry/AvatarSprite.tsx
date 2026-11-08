import PixelArt, { type PixelRect } from "../ui/PixelArt";

const OUTLINE = "#141511";
const FACE = "#1e1f1b";
const EYE = "#ece0bd";
const SHADE = "rgba(0, 0, 0, 0.28)";

/** 두건 쓴 방랑자. 색만 바뀐다 */
function rects(color: string): PixelRect[] {
  return [
    [2, 0, 6, 1, OUTLINE],
    [1, 1, 8, 1, OUTLINE],
    [0, 2, 10, 9, OUTLINE],
    [2, 1, 6, 1, color],
    [1, 2, 8, 8, color],
    [2, 3, 6, 3, FACE],
    [3, 4, 1, 1, EYE],
    [6, 4, 1, 1, EYE],
    [1, 7, 8, 1, SHADE],
    [7, 2, 2, 8, SHADE],
    [2, 11, 2, 1, OUTLINE],
    [6, 11, 2, 1, OUTLINE],
  ];
}

export default function AvatarSprite({ color, scale = 4 }: { color: string; scale?: number }) {
  return <PixelArt width={10} height={12} rects={rects(color)} scale={scale} />;
}
