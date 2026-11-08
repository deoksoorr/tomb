import * as Phaser from "phaser";
import { GRID_COLS, graveSlot } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import { GraveView, PlotView } from "../entities/Grave";
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
//  - 충돌 박스는 배치(순서·외형·부활 대기석)가 바뀔 때만 다시 만든다. 꽃·살려주세요 수 변화는 그림만 바꾼다.

const EMPTY = buildLayout([], []);
const X_MARGIN = 20;

export type SetResult = { layoutChanged: boolean; rowsChanged: boolean };

export class GraveField {
  layout: GraveLayout = EMPTY;
  private graves: PublicGrave[] = [];
  private byId = new Map<string, PublicGrave>();
  private signature = "";
  private readonly views = new Map<number, GraveView>();
  private readonly reviveViews: (GraveView | null)[] = [];
  private readonly plots = new Map<number, PlotView>();
  private readonly pool: GraveView[] = [];
  private readonly plotPool: PlotView[] = [];
  private readonly animated: GraveView[] = [];
  private r0 = 0;
  private r1 = -1;
  private dirty = true;
  private lastView = new Phaser.Geom.Rectangle(-1, -1, 0, 0);
  private readonly rises = new Map<string, number>();
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;

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
    this.byId = new Map(graves.map((g) => [g.id, g]));
    this.layout = buildLayout(graves, reviveTop);
    const sig = layoutSignature(graves, reviveTop);
    const layoutChanged = sig !== this.signature;
    this.signature = sig;
    if (layoutChanged) this.rebuildColliders();
    this.dirty = true;
    return { layoutChanged, rowsChanged: prevRows !== this.layout.rows };
  }

  /** 흙이 덮이며 묘비가 솟아오르는 연출 */
  rise(id: string, now: number): void {
    this.rises.set(id, now);
    this.dirty = true;
  }

  private rebuildColliders(): void {
    this.colliders.clear(true, true);
    const add = (p: GravePlacement) => {
      const w = TIER_SIZE[p.tier].collider;
      // 충돌 전용 존은 그릴 게 없으니 디스플레이 리스트에서 뺀다 (묘비 1000기면 1000개)
      const zone = this.scene.add.zone(p.x, p.y - 2.5, w, 5);
      zone.removeFromDisplayList();
      this.colliders.add(zone);
    };
    for (const p of this.layout.placements) add(p);
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
    if (moved || this.dirty) {
      this.lastView.setTo(view.x, view.y, view.width, view.height);
      const [r0, r1] = visibleRows(view.y, view.bottom, this.layout.rows);
      if (this.dirty || r0 !== this.r0 || r1 !== this.r1) this.reconcile(r0, r1, now);
      this.cullX(view);
    }
    for (const v of this.animated) v.update(now, lightLevel);
    if (!this.reduced) for (const pv of this.plots.values()) pv.update(now, this.reduced);
  }

  private reconcile(r0: number, r1: number, now: number): void {
    const L = this.layout;
    const lo = Math.max(0, r0 * GRID_COLS);
    const hi = Math.min(L.count - 1, (r1 + 1) * GRID_COLS - 1);
    const full = this.dirty;

    for (const [i, v] of this.views) {
      if (full || i < lo || i > hi || L.promoted[i] || !L.placements[i]) {
        this.release(v);
        this.views.delete(i);
      }
    }
    for (const [i, pv] of this.plots) {
      if (full || i < lo || i > hi || !L.promoted[i]) {
        pv.unbind();
        this.plotPool.push(pv);
        this.plots.delete(i);
      }
    }
    for (let i = lo; i <= hi; i++) {
      if (L.promoted[i]) {
        if (!this.plots.has(i)) {
          const pv = this.plotPool.pop() ?? new PlotView(this.scene);
          const s = graveSlot(i);
          pv.bind(i, s.x, s.y);
          this.plots.set(i, pv);
        }
      } else if (!this.views.has(i)) {
        const v = this.acquire();
        const p = L.placements[i];
        v.bind(p, this.reduced, this.riseAt(p.id, now));
        this.views.set(i, v);
      }
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
        v.bind(p, this.reduced, this.riseAt(p.id, now));
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
    for (const v of this.views.values()) if (v.p) v.setVisible(v.p.x >= l && v.p.x <= r);
    for (const v of this.reviveViews) if (v?.p) v.setVisible(v.p.x >= l && v.p.x <= r && v.p.y >= t && v.p.y <= b);
    for (const pv of this.plots.values()) {
      const s = graveSlot(pv.index);
      pv.setVisible(s.x >= l && s.x <= r);
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
    for (const p of this.plots.values()) p.destroy();
    for (const p of this.plotPool) p.destroy();
    this.colliders.clear(true, true);
  }
}
