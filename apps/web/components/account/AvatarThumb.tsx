"use client";

import { useEffect, useRef } from "react";
import { DIR, type AvatarDye } from "@tomb/protocol";
import { avatarColorSpec } from "@/game/sprites/avatar";
import { OutfitStage, STAGE_H, STAGE_W } from "../shop/outfitStage";
import styles from "./AvatarThumb.module.css";

/**
 * 작은 캐릭터 미리보기 (친구 창 한 줄): 상점·가방 미리보기 무대(OutfitStage)를 그대로 쓰되, 한 번만 그린다 (움직이지 않는다 —
 * 친구가 많아도 창이 가볍게). 지금 입은 꾸미기·몸·염색 그대로
 */
export default function AvatarThumb({ color, body, look, dye, label }: { color: string; body: string; look: readonly string[]; dye?: AvatarDye; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const spec = avatarColorSpec(color, dye);
  const key = look.join(",");
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    new OutfitStage().draw(ctx, 0, { dir: DIR.down, walking: false }, { color: spec, body, look: key ? key.split(",") : [] }, true);
  }, [spec, body, key]);
  return (
    <span className={styles.crop}>
      <canvas ref={ref} width={STAGE_W} height={STAGE_H} role="img" aria-label={label} />
    </span>
  );
}
