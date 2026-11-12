import { DYE_BOARD_H, DYE_BOARD_W } from "@/lib/dye/palette";

// 46번 염색 판 화면 계산 (순수 함수): 보이는 가운데(cx, cy — 판 칸 단위)와 배율(scale — 화면 px / 칸).
// 조준점은 화면 가운데에 있고 살짝 흔들린다(화면 px로 같은 폭 → 확대할수록 판 위에서는 덜 흔들린다).

export type BoardView = { cx: number; cy: number; scale: number };

/** 가장 멀리 봐도 판 너비의 이 비율만 보인다 (판 전체를 한눈에 볼 수 없다) */
export const MAX_VISIBLE = 0.45;
export const MAX_SCALE = 30;

export function minScale(viewW: number, viewH: number): number {
  return Math.max(viewW / (DYE_BOARD_W * MAX_VISIBLE), viewH / (DYE_BOARD_H * MAX_VISIBLE));
}

/** 배율·가운데를 판 안으로 맞춘다 (화면 가장자리가 판 밖으로 너무 나가지 않게) */
export function clampView(v: BoardView, viewW: number, viewH: number): BoardView {
  const scale = Math.min(MAX_SCALE, Math.max(minScale(viewW, viewH), v.scale));
  const hw = viewW / scale / 2;
  const hh = viewH / scale / 2;
  const cx = Math.min(DYE_BOARD_W - hw, Math.max(hw, v.cx));
  const cy = Math.min(DYE_BOARD_H - hh, Math.max(hh, v.cy));
  return { cx, cy, scale };
}

/** 화면 좌표(보드 요소 안 px) → 판 좌표 */
export function toBoard(v: BoardView, viewW: number, viewH: number, sx: number, sy: number): { x: number; y: number } {
  return { x: v.cx + (sx - viewW / 2) / v.scale, y: v.cy + (sy - viewH / 2) / v.scale };
}

/** 화면 한 점(sx, sy)을 고정한 채 배율을 factor배 (휠·핀치) */
export function zoomAt(v: BoardView, viewW: number, viewH: number, sx: number, sy: number, factor: number): BoardView {
  const before = toBoard(v, viewW, viewH, sx, sy);
  const scale = Math.min(MAX_SCALE, Math.max(minScale(viewW, viewH), v.scale * factor));
  const cx = before.x - (sx - viewW / 2) / scale;
  const cy = before.y - (sy - viewH / 2) / scale;
  return clampView({ cx, cy, scale }, viewW, viewH);
}

/** 조준점 흔들림 (화면 px): 두 사인파를 섞어 불규칙하게 */
export function wobble(tSec: number, amp: number): { dx: number; dy: number } {
  const dx = (Math.sin(tSec * 1.9) + 0.6 * Math.sin(tSec * 4.7 + 1.3) + 0.3 * Math.sin(tSec * 9.1 + 0.4)) / 1.9;
  const dy = (Math.sin(tSec * 1.5 + 2.1) + 0.6 * Math.sin(tSec * 5.3 + 0.7) + 0.3 * Math.sin(tSec * 8.3 + 2.9)) / 1.9;
  return { dx: dx * amp, dy: dy * amp };
}

/** 조준점이 가리키는 판 좌표 (판 안으로 붙인다) */
export function aimPoint(v: BoardView, amp: number, tSec: number): { x: number; y: number } {
  const w = wobble(tSec, amp);
  const x = v.cx + w.dx / v.scale;
  const y = v.cy + w.dy / v.scale;
  return { x: Math.min(DYE_BOARD_W - 0.001, Math.max(0, x)), y: Math.min(DYE_BOARD_H - 0.001, Math.max(0, y)) };
}
