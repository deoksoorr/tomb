import * as Phaser from "phaser";
import type { PublicGrave } from "@/lib/types";
import { GraveView } from "../entities/Grave";
import { buildLayout, layoutSignature, TIER_SIZE, type GraveLayout, type GravePlacement } from "./graveLayout";

// 묘비 전체를 관리한다. 묘역은 작은 구역 하나(최대 GRAVEYARD_CAPACITY = 32기)라 모두 붙여 두고:
//  - 화면(worldView) 밖 묘비는 숨기기만 한다 (카메라가 움직일 때만 다시 계산).
//  - 충돌 박스도 32개뿐이라 배치가 바뀔 때 한 번에 만든다.
//  - 꽃 수 변화는 그림만 바꾼다. 꾸미기는 만료 시각이 지나면 다시 배치해서 지운다.

const EMPTY = buildLayout([], []);
const X_MARGIN = 20;

export type SetResult = { layoutChanged: boolean; rowsChanged: boolean };

export class GraveField {
  layout: GraveLayout = EMPTY;
  private graves: PublicGrave[] = [];
  private byId = new Map<string, PublicGrave>();
  private signature = "";
  private readonly views = new Map<string, GraveView>();
  private readonly pool: GraveView[] = [];
  private readonly animated: GraveView[] = [];
  private dirty = true;
  private lastView = new Phaser.Geom.Rectangle(-1, -1, 0, 0);
  private readonly rises = new Map<string, number>();
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
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

  setData(graves: PublicGrave[], reviveTop: string[] = []): SetResult {
    const prevRows = this.layout.rows;
    this.graves = graves;
    this.byId = new Map(graves.map((g) => [g.id, g]));
    this.layout = buildLayout(graves, reviveTop);
    const sig = layoutSignature(graves);
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

  /** 배치가 바뀌면 충돌 박스를 모두 다시 만든다 (최대 32개) */
  private resetColliders(): void {
    this.colliders.clear(true, true);
    for (const p of this.layout.placements) this.makeZone(p);
  }

  /** 지금 충돌 박스가 있는 묘비 수 (테스트·디버그) */
  get colliderCount(): number {
    return this.colliders.getLength();
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
      this.layout = buildLayout(this.graves, [], Date.now());
      this.dirty = true;
    }
    if (this.dirty) this.reconcile(now);
    if (moved || this.dirty) {
      this.lastView.setTo(view.x, view.y, view.width, view.height);
      this.cull(view);
    }
    this.dirty = false;
    for (const v of this.animated) v.update(now, lightLevel);
  }

  /** 배치가 바뀌면 묘비 그림을 다시 붙인다 (모두 풀에 돌려보내고 다시 꺼낸다) */
  private reconcile(now: number): void {
    for (const v of this.views.values()) this.release(v);
    this.views.clear();
    for (const p of this.layout.placements) {
      const v = this.acquire();
      v.bind(p, this.reduced, this.riseAt(p.id, now), this.mine.has(p.id));
      this.views.set(p.id, v);
    }
    this.animated.length = 0;
    for (const v of this.views.values()) if (v.animated) this.animated.push(v);
  }

  /** 화면 밖 묘비는 숨긴다 */
  private cull(view: Phaser.Geom.Rectangle): void {
    const l = view.x - X_MARGIN;
    const r = view.right + X_MARGIN;
    const t = view.y - 12;
    const b = view.bottom + 44;
    const vis = this.visibleViews;
    vis.length = 0;
    for (const v of this.views.values()) {
      if (!v.p) continue;
      const on = v.p.x >= l && v.p.x <= r && v.p.y >= t && v.p.y <= b;
      v.setVisible(on);
      if (on) vis.push(v);
    }
  }

  /** 디버그/테스트용: 지금 붙어 있는 묘비 수 */
  get boundCount(): number {
    return this.views.size;
  }

  destroy(): void {
    for (const v of this.views.values()) v.destroy();
    for (const v of this.pool) v.destroy();
    this.colliders.clear(true, true);
  }
}
