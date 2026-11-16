import type * as Phaser from "phaser";
import { bridge } from "../bridge";
import type { Player, SeatRequester } from "../entities/Player";
import { AutoWalk } from "../logic/autoWalk";
import type { MoveInput } from "../logic/movement";
import type { Rect, WalkGrid } from "../logic/pathfind";
import { standSpot, TIER_SIZE, type GravePlacement, type GraveLayout } from "./graveLayout";
import { PORTAL_WALK, WalkGridCache, walkGridOf, type WalkPortal } from "./portalWalk";

// 41번: "내 묘비 가기" = 걸어가기. 맵 배치를 하드코딩하지 않고, 걷기 시작할 때 지금 있는 충돌체로 격자를 만든다
// (맵이 바뀌어도 그대로 동작). WorldScene은 go/goPortal/cancel/steer만 부른다.
// 11/16 [사냥] 버튼도 같은 걷기로 사냥터 입구까지 간다 (goPortal → 도착하면 portal:open, 진행은 portal:walk).
// 격자 규칙(칸·발 상자 여유)은 portalWalk.ts — 테스트도 같은 규칙으로 길을 찾는다.

/** 지금 걷는 목적지 */
type Goal = { kind: "grave"; id: string } | { kind: "portal"; portal: WalkPortal };
type Status = "started" | "arrived" | "cancelled" | "unreachable";

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
  private goal: Goal | null = null;
  /** 물 피하기 격자 캐시 (물 판정이 칸마다라 가장 무겁다) */
  private readonly cache = new WalkGridCache();

  constructor(private readonly d: WalkDeps) {}

  get active(): boolean {
    return this.walk.active;
  }

  /** 사냥터 입구 등으로 걷는 중이면 그 입구 */
  get portal(): WalkPortal | null {
    return this.walk.active && this.goal?.kind === "portal" ? this.goal.portal : null;
  }

  private grid(avoidWater: boolean, fresh = false): WalkGrid {
    const b = this.d.scene.physics.world.bounds;
    const rects = placementRects(this.d.layout(), bodyRects(this.d.groups()));
    const water = avoidWater ? this.d.water : undefined;
    const build = () => walkGridOf(b, rects, water);
    if (fresh) this.cache.clear();
    return this.cache.get(`${avoidWater ? 1 : 0}:${rects.length}:${b.x},${b.y},${b.width},${b.height}`, this.d.scene.time.now, build);
  }

  private report(status: Status): void {
    const g = this.goal;
    if (!g) return;
    if (g.kind === "grave") bridge.emit("grave:walk", { graveId: g.id, status });
    else bridge.emit("portal:walk", { kind: g.portal, status });
  }

  /** 도착: 바라보고 알린다. 입구면 입구 창을 연다 (입구 앞에서 E를 누른 것과 같다) */
  private arrive(face: { x: number; y: number }, now: number): void {
    const pl = this.d.player();
    if (pl.sitting) pl.stand(now, this.d.seats());
    pl.faceTo(face.x, face.y, now);
    this.walk.cancel();
    this.report("arrived");
    const g = this.goal;
    this.goal = null;
    if (g?.kind === "portal") bridge.emit("portal:open", { kind: g.portal });
  }

  /** 길을 찾아 걷기 시작 (물을 피해서 길이 없으면 헤엄쳐서라도) */
  private begin(goal: Goal, to: { x: number; y: number }, face: { x: number; y: number }, now: number): void {
    this.cancel();
    this.goal = goal;
    const pl = this.d.player();
    const from = { x: pl.x, y: pl.y };
    const key = goal.kind === "grave" ? goal.id : `portal:${goal.portal}`;
    this.dry = true;
    let r = this.walk.start(key, from, to, face, this.grid(true), now);
    if (r === "unreachable" && this.d.water) {
      this.dry = false;
      r = this.walk.start(key, from, to, face, this.grid(false), now);
    }
    if (r === "near") return this.arrive(face, now);
    if (r === "unreachable") {
      this.report("unreachable");
      this.goal = null;
      return;
    }
    this.d.beforeWalk();
    this.report("started");
  }

  /** 그 묘비 앞까지 걸어가기 시작. 묘비가 이 채널에 없으면 아무것도 하지 않는다 */
  go(graveId: string, now: number): void {
    const p = this.d.placement(graveId);
    if (!p) return;
    this.begin({ kind: "grave", id: graveId }, standSpot(p), p, now);
  }

  /** 11/16 입구(사냥터) 앞까지 걸어가기 시작. 도착하면 portal:open */
  goPortal(portal: WalkPortal, now: number): void {
    const w = PORTAL_WALK[portal];
    this.begin({ kind: "portal", portal }, w.goal, w.face, now);
  }

  /** 사용자 입력·상점·채널 이동 등으로 그만둔다 */
  cancel(): void {
    if (!this.walk.active || !this.walk.target) return;
    this.walk.cancel();
    this.report("cancelled");
    this.goal = null;
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
    // 입구로 갈 때는 평소 걸음 (달리기를 켜 두었거나 Shift를 누르고 있으면 달린다). 묘비 가기는 먼 길이면 저절로 달린다
    const userRun = move.run;
    const step = this.walk.steer({ x: pl.x, y: pl.y }, now, this.input);
    if (step === "arrived") {
      move.ax = move.ay = 0;
      move.run = false;
      this.arrive(this.walk.face, now);
      return;
    }
    if (step === "stuck") {
      // 막혔으면 새 격자로 한 번 더 찾는다 (묘비·집이 새로 섰을 수 있다)
      if (!this.walk.repath({ x: pl.x, y: pl.y }, this.grid(this.dry, true), now)) {
        this.walk.cancel();
        move.ax = move.ay = 0;
        this.report("unreachable");
        this.goal = null;
      }
      return;
    }
    move.ax = this.input.ax;
    move.ay = this.input.ay;
    move.run = this.goal?.kind === "portal" ? userRun : this.input.run;
  }
}
