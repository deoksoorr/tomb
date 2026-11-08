import * as Phaser from "phaser";
import { GRID_COLS } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import { GraveView } from "../entities/Grave";
import {
  buildLayout,
  layoutSignature,
  TIER_SIZE,
  visibleRows,
  type GraveLayout,
  type GravePlacement,
} from "./graveLayout";

// 묘비 전체를 관리한다. 500기 이상에서도 60fps를 지키기 위해:
//  - 화면(worldView)에 걸치는 격자 행만 풀에서 GraveView를 꺼내 붙이고, 벗어난 행은 돌려보낸다.
//  - 카메라가 움직이지 않으면 아무것도 다시 계산하지 않는다 (흔들림·빛이 있는 묘비만 매 프레임 갱신).
//  - 충돌 박스도 화면 근처 행(±COLLIDER_ROWS)만 둔다. 플레이어만 부딪히므로 그 밖은 필요 없다.
//    → 묘비 목록을 받은 첫 프레임에 수백 개의 정적 바디를 만들지 않아 로딩이 끊기지 않는다.
//  - 꽃·살려주세요 수 변화는 그림만 바꾼다. 꾸미기는 만료 시각이 지나면 다시 배치해서 지운다.

const EMPTY = buildLayout([], []);
const X_MARGIN = 20;
/** 화면 행 범위 위아래로 이만큼 더 충돌 박스를 둔다 */
const COLLIDER_ROWS = 2;

export type SetResult = { layoutChanged: boolean; rowsChanged: boolean };

export class GraveField {
  layout: GraveLayout = EMPTY;
  private graves: PublicGrave[] = [];
  private byId = new Map<string, PublicGrave>();
  private signature = "";
  private readonly views = new Map<number, GraveView>();
  private readonly reviveViews: (GraveView | null)[] = [];
  private readonly pool: GraveView[] = [];
  private readonly animated: GraveView[] = [];
  private r0 = 0;
  private r1 = -1;
  private dirty = true;
  private lastView = new Phaser.Geom.Rectangle(-1, -1, 0, 0);
  private readonly rises = new Map<string, number>();
  private readonly rowsTmp: [number, number] = [0, -1];
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  private readonly zones = new Map<number, Phaser.GameObjects.Zone>();
  private reviveZones: Phaser.GameObjects.Zone[] = [];
  private cr0 = 0;
  private cr1 = -1;
  private reviveTop: string[] = [];
  /** 지금 화면에 보이는 묘비 (조명용, 컬링할 때 다시 채운다) */
  readonly visibleViews: GraveView[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {
    this.colliders = scene.physics.add.staticGroup();
  }

  get count(): number {
    return this.graves.length;
  }

  grave(id: string): PublicGrave | undefined {
    return this.byId.get(id);
  }

  placement(id: string): GravePlacement | undefined {
    return this.layout.byId.get(id);
  }

  setData(graves: PublicGrave[], reviveTop: string[]): SetResult {
    const prevRows = this.layout.rows;
    this.graves = graves;
    this.reviveTop = reviveTop;
    this.byId = new Map(graves.map((g) => [g.id, g]));
    this.layout = buildLayout(graves, reviveTop);
    const sig = layoutSignature(graves, reviveTop);
    const layoutChanged = sig !== this.signature;
    this.signature = sig;
    if (layoutChanged) this.resetColliders();
    this.dirty = true;
    return { layoutChanged, rowsChanged: prevRows !== this.layout.rows };
  }

  private mine = new Set<string>();

  /** 내 묘비 (graves:mine) — 표시 깃발을 붙인다 */
  setMine(ids: readonly string[]): void {
    const next = new Set(ids);
    if (next.size === this.mine.size && [...next].every((id) => this.mine.has(id))) return;
    this.mine = next;
    this.dirty = true;
  }

  isMine(id: string): boolean {
    return this.mine.has(id);
  }

  /** 흙이 덮이며 묘비가 솟아오르는 연출 */
  rise(id: string, now: number): void {
    this.rises.set(id, now);
    this.dirty = true;
  }

  private makeZone(p: GravePlacement): Phaser.GameObjects.Zone {
    const w = TIER_SIZE[p.shape].collider;
    // 충돌 전용 존은 그릴 게 없으니 디스플레이 리스트에서 뺀다
    const zone = this.scene.add.zone(p.x, p.y - 2.5, w, 5);
    zone.removeFromDisplayList();
    this.colliders.add(zone);
    return zone;
  }

  /** 배치가 바뀌면 충돌 박스를 비우고 (부활 대기석만 바로) 화면 근처 행은 다음 프레임에 다시 만든다 */
  private resetColliders(): void {
    this.colliders.clear(true, true);
    this.zones.clear();
    this.reviveZones = [];
    for (const p of this.layout.revive) if (p) this.reviveZones.push(this.makeZone(p));
    this.cr0 = 0;
    this.cr1 = -1;
  }

  /** 충돌 박스 창을 화면 행 ±COLLIDER_ROWS에 맞춘다 */
  private syncColliders(r0: number, r1: number): void {
    const L = this.layout;
    const a = Math.max(0, r0 - COLLIDER_ROWS);
    const b = Math.min(L.rows - 1, r1 + COLLIDER_ROWS);
    if (a === this.cr0 && b === this.cr1) return;
    const lo = a * GRID_COLS;
    const hi = Math.min(L.count - 1, (b + 1) * GRID_COLS - 1);
    for (const [i, z] of this.zones) {
      if (i < lo || i > hi) {
        this.colliders.remove(z, true, true);
        this.zones.delete(i);
      }
    }
    for (let i = lo; i <= hi; i++) {
      if (this.zones.has(i)) continue;
      this.zones.set(i, this.makeZone(L.placements[i]));
    }
    this.cr0 = a;
    this.cr1 = b;
  }

  /** 지금 충돌 박스가 있는 묘비 수 (테스트·디버그) */
  get colliderCount(): number {
    return this.zones.size + this.reviveZones.length;
  }

  private acquire(): GraveView {
    return this.pool.pop() ?? new GraveView(this.scene);
  }

  private release(v: GraveView): void {
    v.unbind();
    this.pool.push(v);
  }

  private riseAt(id: string, now: number): number {
    const t = this.rises.get(id);
    if (t === undefined) return 0;
    if (now - t > 3000) {
      this.rises.delete(id);
      return 0;
    }
    return t;
  }

  /** 매 프레임. view = camera.worldView */
  update(now: number, view: Phaser.Geom.Rectangle, lightLevel: number): void {
    const moved =
      view.x !== this.lastView.x || view.y !== this.lastView.y || view.width !== this.lastView.width || view.height !== this.lastView.height;
    // (now는 게임 시계, 꾸미기 만료는 실제 시각)
    if (this.layout.decorExpiresAt !== Infinity && Date.now() >= this.layout.decorExpiresAt) {
      // 꾸미기 만료 → 같은 목록으로 다시 배치 (만료된 건 빠진다)
      this.layout = buildLayout(this.graves, this.reviveTop, Date.now());
      this.dirty = true;
    }
    if (moved || this.dirty) {
      this.lastView.setTo(view.x, view.y, view.width, view.height);
      const [r0, r1] = visibleRows(view.y, view.bottom, this.layout.rows, this.rowsTmp);
      if (this.dirty || r0 !== this.r0 || r1 !== this.r1) this.reconcile(r0, r1, now);
      this.syncColliders(r0, r1);
      this.cullX(view);
    }
    for (const v of this.animated) v.update(now, lightLevel);
  }

  private reconcile(r0: number, r1: number, now: number): void {
    const L = this.layout;
    const lo = Math.max(0, r0 * GRID_COLS);
    const hi = Math.min(L.count - 1, (r1 + 1) * GRID_COLS - 1);
    const full = this.dirty;

    for (const [i, v] of this.views) {
      if (full || i < lo || i > hi || !L.placements[i]) {
        this.release(v);
        this.views.delete(i);
      }
    }
    // 격자에는 언제나 진짜 묘비 (명당으로 올라가도 자리를 비우지 않는다)
    for (let i = lo; i <= hi; i++) {
      if (this.views.has(i)) continue;
      const v = this.acquire();
      const p = L.placements[i];
      v.bind(p, this.reduced, this.riseAt(p.id, now), this.mine.has(p.id));
      this.views.set(i, v);
    }

    if (full) {
      for (let rank = 0; rank < L.revive.length; rank++) {
        const p = L.revive[rank];
        let v = this.reviveViews[rank] ?? null;
        if (!p) {
          if (v) {
            this.release(v);
            this.reviveViews[rank] = null;
          }
          continue;
        }
        if (!v) v = this.reviveViews[rank] = this.acquire();
        v.bind(p, this.reduced, this.riseAt(p.id, now), this.mine.has(p.id));
      }
    }

    this.animated.length = 0;
    for (const v of this.views.values()) if (v.animated) this.animated.push(v);
    for (const v of this.reviveViews) if (v?.animated) this.animated.push(v);
    this.r0 = r0;
    this.r1 = r1;
    this.dirty = false;
  }

  /** 줌인 상태에서는 한 행의 일부만 보이므로 가로로도 숨긴다 */
  private cullX(view: Phaser.Geom.Rectangle): void {
    const l = view.x - X_MARGIN;
    const r = view.right + X_MARGIN;
    const t = view.y - 40;
    const b = view.bottom + 20;
    const vis = this.visibleViews;
    vis.length = 0;
    for (const v of this.views.values()) {
      if (!v.p) continue;
      const on = v.p.x >= l && v.p.x <= r;
      v.setVisible(on);
      if (on) vis.push(v);
    }
    for (const v of this.reviveViews) {
      if (!v?.p) continue;
      const on = v.p.x >= l && v.p.x <= r && v.p.y >= t && v.p.y <= b;
      v.setVisible(on);
      if (on) vis.push(v);
    }
  }

  /** 디버그/테스트용: 지금 붙어 있는 묘비 수 */
  get boundCount(): number {
    return this.views.size + this.reviveViews.filter(Boolean).length;
  }

  destroy(): void {
    for (const v of this.views.values()) v.destroy();
    for (const v of this.reviveViews) v?.destroy();
    for (const v of this.pool) v.destroy();
    this.colliders.clear(true, true);
  }
}
