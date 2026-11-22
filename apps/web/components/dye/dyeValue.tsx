"use client";

import { DYE_SPECIAL_NAMES, dyeHex, dyeSpecialOf } from "@tomb/protocol";
import { swatchStyle } from "@/lib/dye/look";
import styles from "./itemDyeInfo.module.css";

// 11/22 염색 색 한 줄 (아이템 정보·염색 창 공용 — 순환 import를 피해 따로 둔다)

/** 염색 색 한 줄: 견본 + 색 코드 (+ 특수 색 이름). color가 없으면 「원래 색」 */
export function DyeValue({ color, short = false }: { color: string | null | undefined; short?: boolean }) {
  if (!color) return <span className={styles.value}>원래 색</span>;
  const k = dyeSpecialOf(color);
  return (
    <span className={styles.value}>
      <span className={styles.swatch} style={swatchStyle(color)} aria-hidden="true" />
      {short ? (k ? DYE_SPECIAL_NAMES[k] : dyeHex(color)) : `${dyeHex(color)}${k ? ` · ${DYE_SPECIAL_NAMES[k]}` : ""}`}
    </span>
  );
}

