import { buildBoard, chunkRgba, chunkSpots, DYE_BOARD_H, DYE_BOARD_W, type DyeBoard, type DyeTier } from "@/lib/dye/palette";

// 11/22 염색 판 타일 일꾼: 구역 그림(RGBA)을 화면 밖 스레드에서 계산한다 (예전엔 화면 스레드에서 한 장에 ~37ms → 판이 툭툭 끊겼다).
// 같은 palette.ts 함수를 쓰므로 그림은 화면 스레드 계산과 한 칸도 다르지 않다. 색 판정(서버·조준점)은 이 그림을 쓰지 않는다.

export type TileJob = { seed: string; tier: DyeTier; i: number; j: number; step: number };
export type TileDone = TileJob & { w: number; h: number; buf: ArrayBuffer; spots: ReturnType<typeof chunkSpots> };

let board: DyeBoard | null = null;

self.onmessage = (e: MessageEvent<TileJob>) => {
  const { seed, tier, i, j, step } = e.data;
  // 넓게 볼 때 보이는 구역 + 이웃까지 오가므로 팔레트를 넉넉히 기억한다 (화면 스레드 판은 그대로 48)
  if (!board || board.seed !== seed || board.tier !== tier) board = buildBoard(seed, tier, 160);
  const px = chunkRgba(board, i, j, step);
  const done: TileDone = { seed, tier, i, j, step, w: Math.ceil(DYE_BOARD_W / step), h: Math.ceil(DYE_BOARD_H / step), buf: px.buffer as ArrayBuffer, spots: chunkSpots(board, i, j) };
  (self as unknown as { postMessage(m: TileDone, t: Transferable[]): void }).postMessage(done, [done.buf]);
};
