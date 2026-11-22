// 11/22 새싹 표시 그림 (시안 A 「두 잎 새싹 + 흙」, 운영자 승인). 게임 이름표(Phaser 텍스처)와 채팅(SVG)이 같은 픽셀을 쓴다.
// 그림 9×9 + 이름 글자처럼 1px 어두운 외곽선을 둘러 11×11 — 갈무리 12px 이름 글자와 키가 맞는다 (1:1 픽셀)

/** 말풍선 글 (머리 위 새싹에 올리거나 누르면, 채팅 새싹에 올리거나 누르면) */
export const SPROUT_TIP = "마을에 온 지 얼마 안 된 이웃이에요";

const PAL: Readonly<Record<string, string>> = {
  H: "#e6ffa0", // 잎 하이라이트 (새순 연두)
  L: "#a8ec68", // 잎 밝은
  M: "#5cc96a", // 잎 가운데
  D: "#2f8f4a", // 잎 그늘
  S: "#4fae55", // 줄기
  Q: "#5a3a24", // 흙
};
/** 외곽선 (게임 이름 글자 외곽선과 같은 색·투명도) */
const OUTLINE = "rgba(10,11,16,0.92)";

const ART = [
  "......HL.",
  ".HL..HLLM",
  "HLLM.LLMD",
  "LMMD.MMD.",
  ".MDDSDD..",
  "....S....",
  "....S....",
  "....S....",
  "..QQQQQ..",
];

/** 외곽선까지 포함한 크기 (px) */
export const SPROUT_W = ART[0].length + 2;
export const SPROUT_H = ART.length + 2;

/** 칸마다 색 (null = 비움). [y][x], 외곽선 포함 SPROUT_W × SPROUT_H */
export function sproutPixels(): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: SPROUT_H }, () => Array<string | null>(SPROUT_W).fill(null));
  ART.forEach((row, y) => [...row].forEach((ch, x) => void (ch !== "." && (grid[y + 1][x + 1] = PAL[ch] ?? null))));
  const out = grid.map((r) => r.slice());
  for (let y = 0; y < SPROUT_H; y++)
    for (let x = 0; x < SPROUT_W; x++) {
      if (grid[y][x]) continue;
      if (grid[y][x - 1] || grid[y][x + 1] || grid[y - 1]?.[x] || grid[y + 1]?.[x]) out[y][x] = OUTLINE;
    }
  return out;
}

/** 채팅·말풍선용 SVG (data URI). 칸 하나 = 1 단위 → CSS 크기로 키운다 (shape-rendering crispEdges) */
export function sproutSvgUri(): string {
  const px = sproutPixels();
  let rects = "";
  px.forEach((row, y) => row.forEach((c, x) => void (c && (rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPROUT_W} ${SPROUT_H}" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
