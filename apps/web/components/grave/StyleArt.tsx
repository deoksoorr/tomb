import { graveStylePreview, graveStylePreviewSize } from "@/game/sprites/graveStyles";
import GraveArt from "./GraveArt";
import { styleShape } from "./graveStyles";
import styles from "./StyleArt.module.css";

type Props = {
  style: string | undefined;
  /** "자동" 디자인의 모양을 정하는 향년 */
  ageDays: number;
  flowers?: number;
  scale?: number;
  label?: string;
};

/**
 * 묘비 디자인 그림. 생존 기간 모양·무료 디자인은 기존 픽셀 그림(꽃 포함)으로,
 * 유료 디자인은 게임과 같은 그림(game/sprites/graveStyles — Phaser 없이 canvas만 쓴다)으로 그린다.
 * 이 컴포넌트는 폼·상점 같은 대화상자 안에서만 쓰여 서버에서 렌더링되지 않는다.
 */
export default function StyleArt({ style, ageDays, flowers, scale = 4, label }: Props) {
  const shape = styleShape(style, ageDays);
  if (shape) return <GraveArt shape={shape} flowers={flowers} scale={scale} label={label} />;
  if (typeof document === "undefined" || !style) return null;
  const { width, height } = graveStylePreviewSize(style, { scale, ageDays });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- canvas로 만든 dataURL이라 next/image 최적화 대상이 아니다
    <img
      className={styles.art}
      src={graveStylePreview(style, { scale, ageDays })}
      width={width}
      height={height}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
    />
  );
}
