import { Grid, type Color } from "./pixel";

// 11/26 운영자 「월척 잉어 데리고 다닐 때 좌우 쪽 보면 꼬리가 잘린다」: 프레임 끝 열(·맨 윗줄)까지 칠한 그림은
// 외곽선이 프레임 밖으로 나가 그려지지 않아, 꼬리지느러미·뿔 끝이 칼로 자른 듯 평평하게 보였다.
// 프레임을 좌우 x칸·위 top칸 넓혀 옮겨 담고, 끝에 닿은 칠한 픽셀 바깥 한 칸에 그 그림의 외곽선(색·알파)을 이어 그린다.
// = 처음부터 넓은 캔버스에 그렸다면 outline(4방향)이 둘렀을 자리와 같다. 좌우를 똑같이 넓혀 가운데(ox 0.5)·발밑(oy 1)은 그대로.
// (분양사 미리보기 petPreviewSheet와 같은 방식을 게임 그림 자체에 적용)

type Art = { w: number; h: number; frames: number; build: () => Grid };

/** 덧댄 여백 (좌우 각 x칸, 위 top칸) — 아이콘처럼 원래 칸 기준으로 그리는 곳이 빼서 쓴다 */
export type ArtPad = { x: number; top: number };

/**
 * 프레임마다 여백을 두고 끝에 닿은 칠한 픽셀을 외곽선으로 닫은 그림.
 * 닫는 것은 완전히 불투명하고 외곽선 색과 다른 픽셀만 (반투명 물보라·눈가루, 이미 테 색인 픽셀은 그대로)
 */
export function padArt<A extends Art>(a: A, line: Color, alpha: number, pad: Partial<ArtPad>): A & { pad: ArtPad } {
  const px = pad.x ?? 0;
  const pt = pad.top ?? 0;
  const W = a.w + px * 2;
  const H = a.h + pt;
  return {
    ...a,
    w: W,
    h: H,
    pad: { x: px, top: pt },
    build: () => {
      const src = a.build();
      const g = new Grid(W * a.frames, H);
      for (let f = 0; f < a.frames; f++) {
        const at = (x: number, y: number) => src.px[y * src.w + f * a.w + x];
        for (let y = 0; y < a.h; y++)
          for (let x = 0; x < a.w; x++) {
            const v = at(x, y);
            if (v & 255) g.px[(y + pt) * g.w + f * W + px + x] = v;
          }
        const open = (x: number, y: number) => {
          const v = at(x, y);
          return (v & 255) === 255 && !nearLine(v >>> 8, line);
        };
        const ox = f * W + px;
        if (px)
          for (let y = 0; y < a.h; y++) {
            if (open(0, y)) g.set(ox - 1, y + pt, line, alpha);
            if (open(a.w - 1, y)) g.set(ox + a.w, y + pt, line, alpha);
          }
        if (pt) for (let x = 0; x < a.w; x++) if (open(x, 0)) g.set(ox + x, pt - 1, line, alpha);
      }
      return g;
    },
  };
}

/** 외곽선 색에 가까운지 (outline의 오른쪽 끝 닫기가 테 색을 섞어 둔 픽셀도 이미 닫힌 것으로 본다) */
function nearLine(c: Color, line: Color): boolean {
  const d = (s: number) => Math.abs(((c >> s) & 255) - ((line >> s) & 255));
  return Math.max(d(16), d(8), d(0)) <= 40;
}
