"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { avatarPreview, avatarPreviewSize } from "@/game/sprites/avatar";

/** 아바타 미리보기: 게임 안과 같은 그림 (정면, 정수 배율). 하이드레이션 뒤에만 그린다 (캔버스 사용) */
export default function AvatarSprite({ color, body, scale = 3 }: { color: string; body?: string; scale?: number }) {
  const { width, height } = avatarPreviewSize(scale);
  return (
    <img
      src={avatarPreview(body ?? "hood", color, scale)}
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
      style={{ imageRendering: "pixelated", flex: "none" }}
    />
  );
}
