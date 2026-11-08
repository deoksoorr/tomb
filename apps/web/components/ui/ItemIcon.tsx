"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { itemIcon, itemIconBase } from "@/game/sprites/itemIcons";

/**
 * 아이템 픽셀 아이콘 (가방·상점·가이드·폭죽 공용). 게임과 같은 그림을 정수 배율로 키운다.
 * size: 대략의 화면 크기(px). 원본(16 또는 디자인권 32)의 정수배 중 가장 가까운 크기로 그린다.
 */
export default function ItemIcon({ itemId, size = 32 }: { itemId: string; size?: number }) {
  const base = itemIconBase(itemId);
  const scale = Math.max(1, Math.round(size / base));
  const px = base * scale;
  return (
    <img
      src={itemIcon(itemId, scale)}
      width={px}
      height={px}
      alt=""
      aria-hidden="true"
      style={{ imageRendering: "pixelated", flex: "none" }}
    />
  );
}
