"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { iconUrl } from "@/game/rpg/icons";
import type { IconArt } from "@/lib/rpg/catalog";

/** 사냥터 장비·포션·스킬 아이콘 (16×16을 정수배로 키운다) */
export default function RpgIcon({ art, size = 32 }: { art: IconArt; size?: number }) {
  const scale = Math.max(1, Math.round(size / 16));
  const px = 16 * scale;
  return <img src={iconUrl(art, scale)} width={px} height={px} alt="" aria-hidden="true" style={{ imageRendering: "pixelated", flex: "none" }} />;
}
