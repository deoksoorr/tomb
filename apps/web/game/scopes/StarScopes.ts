import * as Phaser from "phaser";
import { DIR, scopeSeatId, type ScopeSpot, type Sid } from "@tomb/protocol";
import { bridge } from "../bridge";
import type { Player } from "../entities/Player";
import { STARGAZE_TAG } from "../entities/RemoteAvatar";
import { SPOT_TAKEN_HINT, SPOT_TAKEN_TOAST } from "../logic/spots";
import type { Sfx } from "../world/Sfx";
import { playLife } from "../world/life/sounds";
import { campScopeGrid, coinScopeGrid, SCOPE_TEX } from "./scopeArt";
import { SCOPE_E_RADIUS, scopeBaseRect } from "./scopeGeom";

// 11/16 망원경 늘리기 — 캠핑장·바닷가 망원경 (자리 좌표는 protocol scopes.ts).
// 마을 망원경(world/life/VillageLife.useStarSpot)과 같은 흐름: E → 앞자리로 서서 1인 자리(서버 좌석)를 청하고, 자리를 얻으면 별자리 잇기 창(portal:open telescope).
// 서버 답이 없으면(끊김·옛 서버) 1.5초 뒤 그냥 연다. 서버가 거절했는데 주인이 없으면(이 자리 종류를 모르는 옛 서버) 역시 그냥 연다.
// 바닷가 동전 망원경은 낮에 쓰면 바다 보기(장면이 넘겨 준 dayView)로, 밤에는 별자리 잇기.
//  - 캠핑장: 충돌·E 안내는 캠핑장 배치(campLayout)가 맡고, 이 모듈은 그림·자리 청하기만 (use)
//  - 바닷가: 바닷가 맵 모듈을 건드리지 않게 그림·충돌(맵 충돌 묶음에 더한다)·E(interact)·안내(hint)까지 여기서

export type StarScopesDeps = {
  spots: readonly ScopeSpot[];
  style: "camp" | "coin";
  player: () => Player;
  net: () => { online: boolean; mySid: Sid | null; sit(id: string): void };
  /** 좌석 주인 표 */
  seats: () => ReadonlyMap<string, Sid>;
  /** 서버가 1인 자리를 판정해 주는지 (입장 정보를 받았다) */
  judged: () => boolean;
  toast: (message: string) => void;
  sfx: Sfx;
  /** 주면 받침 충돌을 이 묶음에 더한다 (바닷가 — 플레이어와의 충돌은 장면이 이미 이 묶음에 걸어 두었다) */
  colliders?: Phaser.Physics.Arcade.StaticGroup;
  /** 지금 밤인지 (dayView가 있을 때만 본다) */
  night?: () => boolean;
  /** 낮에 쓰면 (바닷가: 바다 보기) */
  dayView?: () => void;
};

export function ensureScopeTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (!tx.exists(SCOPE_TEX.camp)) tx.addCanvas(SCOPE_TEX.camp, campScopeGrid().toCanvas());
  if (!tx.exists(SCOPE_TEX.coin)) tx.addCanvas(SCOPE_TEX.coin, coinScopeGrid().toCanvas());
}

export class StarScopes {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  private held: { id: string; spot: ScopeSpot } | null = null;
  private pending: { id: string; until: number } | null = null;
  private tagged = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly d: StarScopesDeps,
  ) {
    ensureScopeTextures(scene);
    const key = d.style === "camp" ? SCOPE_TEX.camp : SCOPE_TEX.coin;
    for (const s of d.spots) {
      this.images.push(scene.add.image(s.x, s.y + 1, key).setOrigin(0.5, 1).setDepth(s.y));
      if (d.colliders) {
        const r = scopeBaseRect(s);
        const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
        z.removeFromDisplayList();
        d.colliders.add(z);
        this.zones.push(z);
      }
    }
  }

  /** 앞자리가 가까운 망원경 (E 범위 안) */
  nearest(x: number, y: number): ScopeSpot | null {
    let best: ScopeSpot | null = null;
    let bd = SCOPE_E_RADIUS;
    for (const s of this.d.spots) {
      const dist = Math.hypot(s.ax - x, s.ay - y);
      if (dist <= bd) {
        best = s;
        bd = dist;
      }
    }
    return best;
  }

  private free(): boolean {
    const pl = this.d.player();
    return !pl.sitting && !pl.inWater && !pl.inBoat && !pl.anchored && !pl.airborne;
  }

  /** E (바닷가): 가까운 망원경을 썼으면 true */
  interact(): boolean {
    if (!this.free()) return false;
    const pl = this.d.player();
    const s = this.nearest(pl.x, pl.y);
    if (!s) return false;
    this.use(s);
    return true;
  }

  /** E 안내 (바닷가): 「E 망원경 보기」, 누가 쓰고 있으면 회색 안내 */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    if (!this.free()) return null;
    const pl = this.d.player();
    const s = this.nearest(pl.x, pl.y);
    if (!s || this.held?.spot === s) return null;
    const owner = this.d.seats().get(scopeSeatId(s));
    const net = this.d.net();
    if (owner !== undefined && owner !== net.mySid && net.online) return { x: s.ax, y: s.ay + 2, text: SPOT_TAKEN_HINT[s.kind] };
    return { x: s.ax, y: s.ay + 2, text: `${prefix}${this.label(s)}` };
  }

  /** 안내 글 (바닷가 동전 망원경은 낮·밤이 다르다) */
  label(s: ScopeSpot): string {
    if (s.kind === "binocular" && this.d.dayView && !this.d.night?.()) return "망원경으로 바다 보기";
    return "망원경으로 별자리 잇기";
  }

  /** 이 망원경 앞에 서서 본다 (캠핑장 E·탭은 장면이 여기로) */
  use(s: ScopeSpot): void {
    const id = scopeSeatId(s);
    const net = this.d.net();
    const judged = net.online && this.d.judged();
    const owner = this.d.seats().get(id);
    if (judged && owner !== undefined && owner !== net.mySid) {
      this.d.toast(SPOT_TAKEN_TOAST[s.kind]);
      return;
    }
    const pl = this.d.player();
    const now = this.scene.time.now;
    pl.warp(s.ax, s.ay, now, null);
    // 별 망원경은 하늘(받침 위)을, 동전 망원경은 그 너머 바다(아래)를 본다
    pl.dir = s.kind === "binocular" ? DIR.down : DIR.up;
    pl.view.apply(pl.state, pl.dir, now);
    this.held = { id, spot: s };
    if (!judged || owner === net.mySid) {
      this.open(s);
      return;
    }
    this.pending = { id, until: performance.now() + 1500 };
    net.sit(id);
  }

  private open(s: ScopeSpot): void {
    this.pending = null;
    playLife(this.d.sfx, "sparkle", 0.3);
    if (s.kind === "binocular" && this.d.dayView && !this.d.night?.()) {
      this.d.dayView();
      return;
    }
    bridge.emit("portal:open", { kind: "telescope" });
  }

  /** 좌석 알림: 내 자리가 확정되면 연다, 남이 먼저 잡았으면 비켜선다 */
  onSeat(seatId: string, sid: Sid | null): void {
    const me = this.d.net().mySid;
    if (this.pending?.id === seatId && sid === me && this.held) this.open(this.held.spot);
    else if (sid !== null && sid !== me && this.held?.id === seatId) this.lost(seatId);
  }

  /** 서버가 내 망원경 자리 요청을 거절했다. 내 요청이었으면 처리하고 true */
  onSeatDenied(seatId: string): boolean {
    if (this.held?.id !== seatId && this.pending?.id !== seatId) return false;
    // 주인이 없는데 거절 = 이 자리 종류를 모르는 옛 서버 → 판정 없이 그냥 본다
    if (this.d.seats().get(seatId) === undefined && this.held) {
      this.open(this.held.spot);
      return true;
    }
    this.lost(seatId);
    return true;
  }

  private lost(seatId: string): void {
    const h = this.held;
    this.held = null;
    this.pending = null;
    const pl = this.d.player();
    if (h) pl.warp(h.spot.ax + 14, h.spot.ay + (h.spot.kind === "binocular" ? -4 : 6), this.scene.time.now, null);
    this.d.toast(SPOT_TAKEN_TOAST[h?.spot.kind ?? (seatId.startsWith("y_") ? "binocular" : "telescope")]);
  }

  /** 매 프레임: 자리를 떠났는지, 이름표 위 「별 보는 중」(별 망원경만), 서버가 답이 없으면 그냥 연다 */
  update(): void {
    const h = this.held;
    const pl = this.d.player();
    if (h && Math.hypot(pl.x - h.spot.ax, pl.y - h.spot.ay) > 4) {
      this.held = null;
      this.pending = null;
    }
    const tag = this.held?.spot.kind === "telescope";
    if (tag || this.tagged) pl.view.setDoing(tag ? STARGAZE_TAG : null);
    this.tagged = tag;
    if (this.pending && performance.now() > this.pending.until && this.held) this.open(this.held.spot);
  }

  destroy(): void {
    for (const i of this.images) i.destroy();
    for (const z of this.zones) {
      this.d.colliders?.remove(z, true, true);
    }
    this.images.length = 0;
    this.zones.length = 0;
  }
}
