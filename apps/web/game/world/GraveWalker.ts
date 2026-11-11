import type * as Phaser from "phaser";
import { bridge } from "../bridge";
import type { Player, SeatRequester } from "../entities/Player";
import { AutoWalk } from "../logic/autoWalk";
import type { MoveInput } from "../logic/movement";
import { buildGrid, type Rect, type WalkGrid } from "../logic/pathfind";
import { standSpot, TIER_SIZE, type GravePlacement, type GraveLayout } from "./graveLayout";

// 41번: "내 묘비 가기" = 걸어가기. 맵 배치를 하드코딩하지 않고, 걷기 시작할 때 지금 있는 충돌체로 격자를 만든다
// (맵이 바뀌어도 그대로 동작). WorldScene은 go/cancel/steer만 부른다.

/** 격자 칸 (반 타일) */
const CELL = 8;
/** 발 상자 (Player BODY_W×BODY_H, 원점 = 발바닥 가운데) + 여유 1px */
const PAD = { l: 5, r: 5, t: 1, b: 6 };

export type WalkDeps = {
  scene: Phaser.Scene;
  player: () => Player;
  seats: () => SeatRequester;
  /** 이동을 막는 정적 충돌체 묶음 (맵·격자 소품·의자·벤치·묘비) */
  groups: () => Phaser.Physics.Arcade.StaticGroup[];
  /** 묘비 배치 (묘비 충돌체는 화면 근처 행에만 있으므로 배치에서 직접 막는다) */
  layout: () => GraveLayout;
  placement: (id: string) => GravePlacement | undefined;
  /** 물 (헤엄칠 수는 있지만 되도록 피한다) */
  water?: (x: number, y: number) => boolean;
  /** 걷기 시작 전에: 앉아 있으면 일어나기·불멍 화면 풀기·카메라 따라가기 */
  beforeWalk: () => void;
};

/** 정적 바디 → 사각형 */
export function bodyRects(groups: readonly Phaser.Physics.Arcade.StaticGroup[], out: Rect[] = []): Rect[] {
  for (const g of groups) {
    for (const o of g.getChildren()) {
      const b = (o as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody | null;
      if (b && b.enable !== false) out.push({ x: b.x, y: b.y, w: b.width, h: b.height });
    }
  }
  return out;
}

/** 모든 묘비의 충돌 상자 (GraveField.makeZone과 같은 크기: 받침 위 5px, 폭 = 모양의 collider) */
export function placementRects(layout: GraveLayout, out: Rect[] = []): Rect[] {
  for (const p of layout.placements) {
    if (!p) continue;
    const w = TIER_SIZE[p.shape]?.collider ?? 12;
    out.push({ x: p.x - w / 2, y: p.y - 5, w, h: 5 });
  }
  return out;
}

export class GraveWalker {
  private readonly walk = new AutoWalk();
  private readonly input: MoveInput = { ax: 0, ay: 0, run: false };
  /** 이번 길을 물을 피해서 찾았는지 (다시 찾을 때 같은 규칙으로) */
  private dry = true;

  constructor(private readonly d: WalkDeps) {}

  get active(): boolean {
    return this.walk.active;
  }

  private grid(avoidWater: boolean): WalkGrid {
    const b = this.d.scene.physics.world.bounds;
    const rects = placementRects(this.d.layout(), bodyRects(this.d.groups()));
    const water = avoidWater ? this.d.water : undefined;
    // 발 상자가 월드 경계 안에 머무는 곳만 (x ± 4, 위로 5)
    return buildGrid(b.width, b.height, CELL, rects, {
      ox: b.x,
      oy: b.y,
      pad: PAD,
      extraBlocked: (x, y) => x < b.x + PAD.l || x > b.right - PAD.r || y < b.y + PAD.b || y > b.bottom - 1 || !!water?.(x, y),
    });
  }

  /** 그 묘비 앞까지 걸어가기 시작. 묘비가 이 채널에 없으면 아무것도 하지 않는다 */
  go(graveId: string, now: number): void {
    const p = this.d.placement(graveId);
    if (!p) return;
    this.cancel();
    const pl = this.d.player();
    const goal = standSpot(p);
    const from = { x: pl.x, y: pl.y };
    this.dry = true;
    let r = this.walk.start(graveId, from, goal, p, this.grid(true), now);
    // 물을 피해서는 길이 없으면 헤엄쳐서라도
    if (r === "unreachable" && this.d.water) {
      this.dry = false;
      r = this.walk.start(graveId, from, goal, p, this.grid(false), now);
    }
    if (r === "near") {
      if (pl.sitting) pl.stand(now, this.d.seats());
      pl.faceTo(p.x, p.y, now);
      this.walk.cancel();
      bridge.emit("grave:walk", { graveId, status: "arrived" });
      return;
    }
    if (r === "unreachable") {
      bridge.emit("grave:walk", { graveId, status: "unreachable" });
      return;
    }
    this.d.beforeWalk();
    bridge.emit("grave:walk", { graveId, status: "started" });
  }

  /** 사용자 입력·상점·채널 이동 등으로 그만둔다 */
  cancel(): void {
    const id = this.walk.target;
    if (!this.walk.active || !id) return;
    this.walk.cancel();
    bridge.emit("grave:walk", { graveId: id, status: "cancelled" });
  }

  /**
   * 매 프레임 (hub.read 다음). 사용자가 움직이면 취소하고 사용자 입력을 그대로 둔다.
   * 걷는 중이면 move를 자동 입력으로 덮어쓴다.
   */
  steer(move: MoveInput, userMoving: boolean, now: number): void {
    if (!this.walk.active) return;
    if (userMoving) return this.cancel();
    const pl = this.d.player();
    if (pl.airborne) return;
    const id = this.walk.target!;
    const step = this.walk.steer({ x: pl.x, y: pl.y }, now, this.input);
    if (step === "arrived") {
      move.ax = move.ay = 0;
      move.run = false;
      pl.faceTo(this.walk.face.x, this.walk.face.y, now);
      this.walk.cancel();
      bridge.emit("grave:walk", { graveId: id, status: "arrived" });
      return;
    }
    if (step === "stuck") {
      if (!this.walk.repath({ x: pl.x, y: pl.y }, this.grid(this.dry), now)) {
        this.walk.cancel();
        move.ax = move.ay = 0;
        bridge.emit("grave:walk", { graveId: id, status: "unreachable" });
      }
      return;
    }
    move.ax = this.input.ax;
    move.ay = this.input.ay;
    move.run = this.input.run;
  }
}
