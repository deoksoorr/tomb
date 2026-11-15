"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { DIR, type AvatarDye } from "@tomb/protocol";
import { avatarColorSpec } from "@/game/sprites/avatar";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { OutfitStage, STAGE_H, STAGE_W } from "../shop/outfitStage";
import styles from "./AvatarThumb.module.css";

/** 오라가 움직일 때 한 장 간격 (초당 약 20장 — 레이스 창 오라 미리보기와 같다) */
const AURA_FRAME_MS = 50;

/**
 * 작은 캐릭터 미리보기 (친구 창 한 줄): 상점·가방 미리보기 무대(OutfitStage)를 그대로 쓰되, 한 번만 그린다 (움직이지 않는다 —
 * 친구가 많아도 창이 가볍게). 지금 입은 꾸미기·몸·염색 그대로.
 * 11/16 champ(1위 비트 묶음)를 주면 1위 오라도 그리고 은은히 움직인다 (명예의 전당 — 움직임 줄이기면 멈춘 그림 한 장)
 */
export default function AvatarThumb({ color, body, look, dye, label, scale, champ = 0 }: { color: string; body: string; look: readonly string[]; dye?: AvatarDye; label: string; /** 확대 배율 (기본 2 — 시상대는 자리마다 다르게) */ scale?: number; champ?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const spec = avatarColorSpec(color, dye);
  const key = look.join(",");
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const stage = new OutfitStage();
    const l = { color: spec, body, look: key ? key.split(",") : [], champ };
    const pose = { dir: DIR.down, walking: false };
    if (!champ || reduced) {
      stage.draw(ctx, 0, pose, l, true);
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < AURA_FRAME_MS) return;
      last = now;
      stage.draw(ctx, now, pose, l, false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spec, body, key, champ, reduced]);
  return (
    <span className={styles.crop} style={scale ? ({ "--s": scale } as CSSProperties) : undefined}>
      <canvas ref={ref} width={STAGE_W} height={STAGE_H} role="img" aria-label={label} />
    </span>
  );
}
