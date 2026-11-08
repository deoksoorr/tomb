import { JUMP_HEIGHT, JUMP_MS } from "@tomb/protocol";

// 점프 (순수). Space(모바일 점프 버튼)로 JUMP_MS 동안 포물선으로 뛰어오르고, 그동안 묘비 같은 낮은 장애물을 넘는다.

/** 착지 뒤 다음 점프까지 */
export const JUMP_COOLDOWN_MS = 150;

/** 뛰어오른 지 t ms 뒤의 높이 (포물선, 0..JUMP_HEIGHT..0) */
export function jumpHeight(t: number): number {
  if (!(t > 0) || t >= JUMP_MS) return 0;
  const u = t / JUMP_MS;
  return JUMP_HEIGHT * 4 * u * (1 - u);
}

/** 그림자 크기 (높이 올라갈수록 작아진다) 0.6..1 */
export function shadowScale(h: number): number {
  return 1 - 0.4 * Math.max(0, Math.min(1, h / JUMP_HEIGHT));
}

/** 지금 점프할 수 있는지: 공중이 아니고, 착지 뒤 쿨다운이 지났을 때 */
export function canJump(now: number, airborne: boolean, landedAt: number): boolean {
  return !airborne && now - landedAt >= JUMP_COOLDOWN_MS;
}

export type Box = { x: number; y: number; w: number; h: number };

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** a를 b 밖으로 빼내는 가장 짧은 이동 (겹치지 않으면 0,0) */
export function pushOut(a: Box, b: Box): { dx: number; dy: number } {
  if (!overlaps(a, b)) return { dx: 0, dy: 0 };
  const EPS = 0.5;
  const left = b.x - (a.x + a.w) - EPS;
  const right = b.x + b.w - a.x + EPS;
  const up = b.y - (a.y + a.h) - EPS;
  const down = b.y + b.h - a.y + EPS;
  const best = [
    { dx: left, dy: 0, d: -left },
    { dx: right, dy: 0, d: right },
    { dx: 0, dy: up, d: -up },
    { dx: 0, dy: down, d: down },
  ].sort((p, q) => p.d - q.d)[0];
  return { dx: best.dx, dy: best.dy };
}

/** 여러 장애물에서 빠져나오기 (최대 4번 밀어 본다). 다 빠져나오면 이동량, 못 빠져나오면 null */
export function escape(a: Box, obstacles: readonly Box[]): { dx: number; dy: number } | null {
  const cur = { ...a };
  for (let i = 0; i < 4; i++) {
    const hit = obstacles.find((o) => overlaps(cur, o));
    if (!hit) return { dx: cur.x - a.x, dy: cur.y - a.y };
    const d = pushOut(cur, hit);
    cur.x += d.dx;
    cur.y += d.dy;
  }
  return obstacles.some((o) => overlaps(cur, o)) ? null : { dx: cur.x - a.x, dy: cur.y - a.y };
}
