import { DYE_BOARD_H, DYE_BOARD_W, DYE_LIMIT } from "@/lib/dye/palette";

// 46번 염색 판 화면 계산 (순수 함수): 보이는 가운데(cx, cy — 판 칸 단위)와 배율(scale — 화면 px / 칸).
// 조준점은 화면 가운데에 있고 살짝 흔들린다(화면 px로 같은 폭 → 확대할수록 판 위에서는 덜 흔들린다).
// 11/12: 판은 상하좌우로 끝없이 이어진다 (좌표 한계 ±DYE_LIMIT칸 — 거기서만 멈춘다)

export type BoardView = { cx: number; cy: number; scale: number };

/** 가장 멀리 봐도 구역(판 한 장) 너비의 이 비율만 보인다 (보이는 구역은 많아야 2×2 — 그리기가 가볍다) */
export const MAX_VISIBLE = 0.45;
export const MAX_SCALE = 30;

export function minScale(viewW: number, viewH: number): number {
  return Math.max(viewW / (DYE_BOARD_W * MAX_VISIBLE), viewH / (DYE_BOARD_H * MAX_VISIBLE));
}

/** 배율·가운데를 판 안으로 맞춘다 (화면 가장자리가 판 밖으로 너무 나가지 않게) */
export function clampView(v: BoardView, viewW: number, viewH: number): BoardView {
  // 크기가 0·NaN이면(창이 아직 안 열림 등) 1px로 본다 → 배율 0·0 나누기 방지
  const vw = Number.isFinite(viewW) && viewW >= 1 ? viewW : 1;
  const vh = Number.isFinite(viewH) && viewH >= 1 ? viewH : 1;
  const lo = Math.min(MAX_SCALE, minScale(vw, vh));
  // 배율·가운데가 NaN·무한대면 한계(배율) 또는 판 가운데로 되돌린다 — 한 번 NaN이 되면 판이 영영 멈추던 원인
  const s0 = Number.isNaN(v.scale) ? lo : v.scale;
  const scale = Math.min(MAX_SCALE, Math.max(lo, s0));
  const hw = Math.min(DYE_LIMIT / 2, vw / scale / 2);
  const hh = Math.min(DYE_LIMIT / 2, vh / scale / 2);
  const cx = Math.min(DYE_LIMIT - hw, Math.max(hw - DYE_LIMIT, Number.isFinite(v.cx) ? v.cx : DYE_BOARD_W / 2));
  const cy = Math.min(DYE_LIMIT - hh, Math.max(hh - DYE_LIMIT, Number.isFinite(v.cy) ? v.cy : DYE_BOARD_H / 2));
  return { cx, cy, scale };
}

/** 휠 한 번의 배율 (한 번에 최대 2배·½배 — 아주 큰 deltaY·NaN도 안전하게) */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  if (!Number.isFinite(px)) return 1;
  return Math.exp(-Math.max(-433, Math.min(433, px)) * 0.0016);
}

/** 화면 좌표(보드 요소 안 px) → 판 좌표 */
export function toBoard(v: BoardView, viewW: number, viewH: number, sx: number, sy: number): { x: number; y: number } {
  return { x: v.cx + (sx - viewW / 2) / v.scale, y: v.cy + (sy - viewH / 2) / v.scale };
}

/** 화면 한 점(sx, sy)을 고정한 채 배율을 factor배 (휠·핀치) */
export function zoomAt(v: BoardView, viewW: number, viewH: number, sx: number, sy: number, factor: number): BoardView {
  // 먼저 지금 화면을 정상값으로 (NaN·0 배율 → 한계) 맞추고, 배율·고정점도 유한한 값만 쓴다
  const cur = clampView(v, viewW, viewH);
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const px = Number.isFinite(sx) ? sx : viewW / 2;
  const py = Number.isFinite(sy) ? sy : viewH / 2;
  const before = toBoard(cur, viewW, viewH, px, py);
  const scale = Math.min(MAX_SCALE, Math.max(minScale(viewW, viewH), cur.scale * f));
  const cx = before.x - (px - viewW / 2) / scale;
  const cy = before.y - (py - viewH / 2) / scale;
  return clampView({ cx, cy, scale }, viewW, viewH);
}

/** 조준점 흔들림 (화면 px): 두 사인파를 섞어 불규칙하게 */
export function wobble(tSec: number, amp: number): { dx: number; dy: number } {
  const dx = (Math.sin(tSec * 1.9) + 0.6 * Math.sin(tSec * 4.7 + 1.3) + 0.3 * Math.sin(tSec * 9.1 + 0.4)) / 1.9;
  const dy = (Math.sin(tSec * 1.5 + 2.1) + 0.6 * Math.sin(tSec * 5.3 + 0.7) + 0.3 * Math.sin(tSec * 8.3 + 2.9)) / 1.9;
  return { dx: dx * amp, dy: dy * amp };
}

/** 조준점이 가리키는 판 좌표 (화면 가운데 기준, 판 안으로 붙인다) */
export function aimPoint(v: BoardView, amp: number, tSec: number): { x: number; y: number } {
  const w = wobble(tSec, amp);
  const x = v.cx + w.dx / v.scale;
  const y = v.cy + w.dy / v.scale;
  return { x: Math.min(DYE_LIMIT - 0.001, Math.max(-DYE_LIMIT, x)), y: Math.min(DYE_LIMIT - 0.001, Math.max(-DYE_LIMIT, y)) };
}

/**
 * 11/12: 조준점이 포인터를 따라간다. at = 보드 요소 안 화면 좌표 (null이면 화면 가운데 — 폰·키보드).
 * 포인터 자리 + 흔들림 → 판 좌표 (판 안으로 붙인다)
 */
export function aimAt(v: BoardView, viewW: number, viewH: number, at: { x: number; y: number } | null, amp: number, tSec: number): { x: number; y: number } {
  const w = wobble(tSec, amp);
  const p = at ? toBoard(v, viewW, viewH, at.x, at.y) : { x: v.cx, y: v.cy };
  const x = p.x + w.dx / v.scale;
  const y = p.y + w.dy / v.scale;
  return { x: Math.min(DYE_LIMIT - 0.001, Math.max(-DYE_LIMIT, x)), y: Math.min(DYE_LIMIT - 0.001, Math.max(-DYE_LIMIT, y)) };
}

/**
 * 판 위 포인터(끌기·두 손가락) 기록 — 순수 상태라 테스트할 수 있다.
 * 11/12 제보: 조준점은 가운데 고정이라 커서 자리·마우스 클릭은 판에 아무 영향이 없어야 한다.
 *  - 마우스는 왼쪽 버튼으로 끌 때만 판을 옮긴다 (클릭·오른쪽 버튼·버튼 없이 지나가기는 무시)
 *  - 마우스는 두 손가락 확대가 될 수 없다 (남은 기록이 있으면 지운다)
 *  - 포인터 나감·붙잡기 풀림·창 초점 잃음 → 기록을 지운다 (남은 기록 때문에 끌기·확대가 엉뚱하게 이어지지 않게)
 */
export class BoardPointers {
  private map = new Map<number, { x: number; y: number; mouse: boolean }>();
  private moved = 0;

  get size(): number {
    return this.map.size;
  }

  /** 누름. 받아들였으면 true (붙잡기를 걸어도 된다) */
  down(id: number, type: string, button: number, x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const mouse = type === "mouse";
    if (mouse && button !== 0) return false;
    // 마우스·펜이 새로 누르면 남은 기록은 버린다 (두 손가락은 터치끼리만)
    if (type !== "touch" || [...this.map.values()].some((p) => p.mouse)) this.map.clear();
    if (this.map.size === 0) this.moved = 0;
    else this.moved = 99; // 두 손가락 = 확대·축소 (누르기가 아니다)
    this.map.set(id, { x, y, mouse });
    return true;
  }

  /** 움직임 → 새 화면 (판이 그대로면 null). buttons = PointerEvent.buttons */
  move(id: number, type: string, buttons: number, x: number, y: number, v: BoardView | null, w: number, h: number): BoardView | null {
    const prev = this.map.get(id);
    if (!prev || !v) return null;
    // 버튼을 놓은 채(창 밖에서 놓아 up을 못 받음) 지나가는 마우스 → 끌기 끝
    if (type === "mouse" && (buttons & 1) === 0) {
      this.map.delete(id);
      return null;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let next: BoardView;
    if (this.map.size >= 2) {
      const o = [...this.map.entries()].find(([k]) => k !== id)![1];
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
      const d1 = Math.hypot(x - o.x, y - o.y);
      next = d0 > 4 ? zoomAt(v, w, h, (x + o.x) / 2, (y + o.y) / 2, d1 / d0) : v;
    } else {
      const s = clampView(v, w, h);
      next = clampView({ cx: s.cx - (x - prev.x) / s.scale, cy: s.cy - (y - prev.y) / s.scale, scale: s.scale }, w, h);
      this.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
    }
    this.map.set(id, { ...prev, x, y });
    return next;
  }

  /** 뗌·취소·붙잡기 풀림. 폰에서 짧게 누른 자리 (그 자리를 가운데로 옮긴다) — 마우스는 늘 null */
  up(id: number): { x: number; y: number } | null {
    const p = this.map.get(id);
    this.map.delete(id);
    const tap = p && !p.mouse && this.map.size === 0 && this.moved <= 6 ? { x: p.x, y: p.y } : null;
    if (this.map.size === 0) this.moved = 0;
    return tap;
  }

  /** 취소·붙잡기 풀림·나감: 그 포인터만 잊는다 (누르기로 치지 않는다) */
  drop(id: number): void {
    this.map.delete(id);
    if (this.map.size === 0) this.moved = 0;
  }

  /** 창 초점 잃음 등: 모두 잊는다 */
  clear(): void {
    this.map.clear();
    this.moved = 0;
  }
}
