"use client";

import { DIR, type DirId } from "@tomb/protocol";
import { OutfitCanvas } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import styles from "./ZoomStage.module.css";

// 11/22 캐릭터를 크게 보는 무대 (가방 아이템 페이지 · 염색 창의 지금/칠한 뒤).
// 입어 보기 무대(72×64)를 정수 배율로 키우고 캐릭터 둘레만 잘라 보인다 — 빈 땅이 넓게 남지 않게.
// 배율·발 높이는 CSS 변수(--scale · --feet)로 칸마다 정한다 (ZoomStage.module.css)

export default function ZoomStage({
  color,
  body,
  look,
  label,
  dir = DIR.down,
  className,
}: {
  color: string;
  body: string;
  look: readonly string[];
  label: string;
  dir?: DirId;
  className?: string;
}) {
  return (
    <div className={cx(styles.box, className)}>
      <OutfitCanvas className={styles.canvas} color={color} body={body} look={look} label={label} dir={dir} walking={false} />
    </div>
  );
}
