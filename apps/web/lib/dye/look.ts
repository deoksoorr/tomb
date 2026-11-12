import type { CSSProperties } from "react";
import { DYE_SPECIAL_NAMES, dyeHex, dyeSpecialOf } from "@tomb/protocol";

// 46번 염색 색 견본(화면 UI). 특수 색("#rrggbb~종류")은 CSS 배경으로 흉내 낸다 — 색 코드 글자에는 특수 이름을 붙인다.

/** 견본 칸 스타일 (background·boxShadow). 특수 색이 아니면 그 색 하나 */
export function swatchStyle(color: string): CSSProperties {
  const hex = dyeHex(color);
  switch (dyeSpecialOf(color)) {
    case "g":
      return { background: `linear-gradient(135deg, #fff6c8 0%, ${hex} 38%, #fff0b0 52%, ${hex} 64%, #6e4c14 100%)` };
    case "s":
      return {
        background: `radial-gradient(circle at 28% 30%, #fff 0 9%, transparent 11%), radial-gradient(circle at 72% 62%, #fff 0 7%, transparent 9%), radial-gradient(circle at 45% 80%, #fffbe0 0 5%, transparent 7%), ${hex}`,
      };
    case "r":
      return { background: `linear-gradient(135deg, ${hex}, #ff5a5a, #ffc04a, #f2ee5a, #5ad66a, #4aa8f0, #9a6af0)` };
    case "n":
      return { background: `radial-gradient(circle, #ffffff 0%, ${hex} 55%)`, boxShadow: `0 0 6px 1px ${hex}` };
    default:
      return { background: hex };
  }
}

/** 색 코드 글자: "#rrggbb" 또는 "#rrggbb · 금빛 광택" */
export function colorLabel(color: string): string {
  const k = dyeSpecialOf(color);
  return k ? `${dyeHex(color)} · ${DYE_SPECIAL_NAMES[k]}` : dyeHex(color);
}
