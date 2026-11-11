import { TILE } from "@tomb/protocol";
import type { MoveInput } from "./movement";
import { findPath, remainingLength, type Pt, type WalkGrid } from "./pathfind";

// 자동 걷기 (41번: 내 묘비까지 걸어가기). 길을 찾아 두고 매 프레임 이동 입력(축)을 채운다 —
// 플레이어는 키를 누른 것처럼 걷고 달리므로 남들 화면에도 평소처럼 걸어가는 모습이 간다(순간이동 없음).
// 순수 로직이라 Phaser 없이 테스트한다. 취소(사용자 입력)는 씬이 cancel()로 알린다.

/** 이만큼 가까우면 걷지 않고 바라보기만 */
export const NEAR_ENOUGH = 1.5 * TILE;
/** 남은 길이 이보다 길면 달린다 */
export const RUN_OVER = 10 * TILE;
/** 웨이포인트 도착 판정 (중간 / 끝) */
const WAYPOINT_R = 4;
const ARRIVE_R = 3;
const SLOW_R = 10;
/** 이 시간 동안 남은 거리가 줄지 않으면 막힌 것으로 본다 */
export const STUCK_MS = 1500;
const PROGRESS_EPS = 2;

export type WalkStart = "started" | "near" | "unreachable";
export type WalkStep = "walking" | "arrived" | "stuck" | "idle";

export class AutoWalk {
  private path: Pt[] | null = null;
  private idx = 0;
  private goal: Pt = { x: 0, y: 0 };
  /** 진행 판정: 마지막으로 남은 거리가 줄어든 시각과 그때 거리 */
  private bestLeft = Infinity;
  private progressAt = 0;
  private repathed = false;
  /** 걷는 중인 묘비 id */
  target: string | null = null;
  /** 도착하면 바라볼 곳 */
  face: Pt = { x: 0, y: 0 };

  get active(): boolean {
    return this.path !== null;
  }

  /** 길 찾기. near = 이미 가까움(걷지 않음), unreachable = 길 없음 */
  start(target: string, from: Pt, goal: Pt, face: Pt, grid: WalkGrid, now: number): WalkStart {
    this.cancel();
    this.target = target;
    this.goal = { ...goal };
    this.face = { ...face };
    if (Math.hypot(goal.x - from.x, goal.y - from.y) < NEAR_ENOUGH) return "near";
    const path = findPath(grid, from, goal);
    if (!path?.length) {
      this.target = null;
      return "unreachable";
    }
    this.begin(path, from, now);
    this.repathed = false;
    return "started";
  }

  /** 막혔을 때 지금 자리에서 한 번 더 길을 찾는다. 다시 찾았으면 true */
  repath(from: Pt, grid: WalkGrid, now: number): boolean {
    if (this.repathed || !this.target) return false;
    this.repathed = true;
    const path = findPath(grid, from, this.goal);
    if (!path?.length) return false;
    this.begin(path, from, now);
    return true;
  }

  private begin(path: Pt[], from: Pt, now: number): void {
    this.path = path;
    this.idx = 0;
    this.bestLeft = remainingLength(from, path, 0);
    this.progressAt = now;
  }

  cancel(): void {
    this.path = null;
    this.idx = 0;
    this.target = null;
  }

  /** 이번 프레임 이동 입력을 out에 채운다. arrived면 out은 0 (호출자가 바라보기·알림 후 cancel) */
  steer(pos: Pt, now: number, out: MoveInput): WalkStep {
    const path = this.path;
    if (!path) return "idle";
    out.ax = out.ay = 0;
    out.run = false;
    while (this.idx < path.length) {
      const last = this.idx === path.length - 1;
      const w = path[this.idx];
      if (Math.hypot(w.x - pos.x, w.y - pos.y) > (last ? ARRIVE_R : WAYPOINT_R)) break;
      this.idx++;
    }
    if (this.idx >= path.length) {
      this.path = null;
      return "arrived";
    }
    const left = remainingLength(pos, path, this.idx);
    if (left < this.bestLeft - PROGRESS_EPS) {
      this.bestLeft = left;
      this.progressAt = now;
    } else if (now - this.progressAt > STUCK_MS) return "stuck";
    const w = path[this.idx];
    const dx = w.x - pos.x;
    const dy = w.y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    // 마지막 몇 픽셀은 살살 (프레임이 느려도 도착점을 넘나들며 맴돌지 않게)
    const k = this.idx === path.length - 1 && d < SLOW_R ? 0.5 : 1;
    out.ax = (dx / d) * k;
    out.ay = (dy / d) * k;
    out.run = left > RUN_OVER;
    return "walking";
  }
}
