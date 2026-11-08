/** [x, y, w, h, 색] */
export type PixelRect = readonly [number, number, number, number, string];

type Props = {
  width: number;
  height: number;
  rects: readonly PixelRect[];
  scale: number;
  className?: string;
  label?: string;
  /** CSS로 크기를 늘릴 때 (예: "xMidYMax slice") */
  preserveAspectRatio?: string;
};

/** 격자 단위 사각형들로 그린 픽셀 그림 (SVG, 확대해도 가장자리가 번지지 않는다) */
export default function PixelArt({ width, height, rects, scale, className, label, preserveAspectRatio }: Props) {
  return (
    <svg
      className={className}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserveAspectRatio}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects.map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </svg>
  );
}
