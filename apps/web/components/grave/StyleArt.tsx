"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { graveStylePreview, graveStylePreviewSize } from "@/game/sprites/graveStyles";
import { styleName } from "./graveStyles";

type Props = {
  style: string | undefined;
  /** "자동" 디자인의 모양을 정하는 향년 */
  ageDays: number;
  /** 정수 배율 */
  scale?: number;
  label?: string;
};

/** 묘비 디자인 그림: 게임 안 묘비와 같은 픽셀아트 (흙무덤 포함) */
export default function StyleArt({ style, ageDays, scale = 4, label }: Props) {
  const opts = { scale, ageDays };
  const id = style ?? "auto";
  const { width, height } = graveStylePreviewSize(id, opts);
  return (
    <img
      src={graveStylePreview(id, opts)}
      width={width}
      height={height}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      title={label ? undefined : styleName(style)}
      style={{ imageRendering: "pixelated", flex: "none" }}
    />
  );
}
