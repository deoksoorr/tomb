import type * as Phaser from "phaser";
import { CAMP_FISHING_SPOTS, DIR, type FishingSpot, type Sid } from "@tomb/protocol";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Interactable } from "../world/layout";
import { FTEX } from "../world/forage/art";
import { Foraging, type ForageZone } from "../world/forage/Foraging";
import { ensureZoneTextures, ZTEX } from "../world/forage/zoneArt";

// 11/15 캠핑장 도감 수집 (A-6): 마을 낚시·채집(game/world/forage/Foraging)을 캠핑장 맵으로 그대로 쓴다.
// - 계곡 물가 낚시 자리(protocol CAMP_FISHING_SPOTS, 강 물고기): 마을 낚시와 같은 1인 자리·같은 낚시 창·같은 연출.
//   자리마다 낚시 의자 + 꽂아 둔 낚싯대 + 찌·물결 + 가까이 오면 낚싯바늘 말풍선 (마을 납품 부두 FishZoneView의 자리 표시와 같은 그림)
// - 채집 지점(lib/forage/catalog CAMP_GATHER_NODES): 산책로 숲 곤충·약초, 산꼭대기·큰 바위 광석, 낙엽 숲 발굴.
//   서버가 마을 지점과 함께 알려 주고(forage:nodes) Foraging이 캠핑장 것만 그린다. 하루 한도·도감·15분 창은 마을과 같이 센다.
// - 팔기(어부 영감·수집가 유령)와 의뢰 게시판은 마을에만.

/** 바라보는 방향 → 단위 벡터 */
const STEP: Record<number, [number, number]> = { [DIR.down]: [0, 1], [DIR.up]: [0, -1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] };
/** 꽂아 둔 낚싯대의 찌 거리 (Foraging 던지는 거리와 같게) */
const CAST = 24;
/** 낚싯바늘 말풍선이 뜨는 거리 */
const HOOK_RADIUS = 40;

type Marker = {
  spot: FishingSpot;
  rod: Phaser.GameObjects.Graphics;
  bob: Phaser.GameObjects.Image;
  ripple: Phaser.GameObjects.Image;
  hook: Phaser.GameObjects.Image;
  by: number;
  phase: number;
  busy: boolean;
};

/** 계곡 낚시 자리 표시 (Foraging의 ForageZone). 11/16 바닷가 갯바위 낚시 자리도 같은 표시 (spots로 넘겨요, 아래를 보는 자리도) */
export class CampFishMarkers implements ForageZone {
  private readonly markers: Marker[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    spots: readonly FishingSpot[] = CAMP_FISHING_SPOTS,
  ) {
    ensureZoneTextures(scene);
    for (const s of spots) this.markers.push(this.make(s));
  }

  private make(s: FishingSpot): Marker {
    const scene = this.scene;
    const [dx, dy] = STEP[s.facing];
    scene.add.image(s.x, s.y + 2, ZTEX.stool).setOrigin(0.5, 1).setDepth(s.y - 1);
    // 꽂아 둔 낚싯대: 의자 옆 받침대 → 물 쪽으로 비스듬히 → 늘어진 줄 (계곡 자리는 옆, 바닷가 자리는 아래를 봐요)
    const hx = dy ? s.x + 7 : s.x - dx * 2;
    const hy = s.y + 3;
    const tipX = dy ? hx + 3 : hx + dx * 12;
    const tipY = dy ? hy - 10 + dy * 4 : hy - 9;
    const bx = dy ? hx + 3 : s.x + dx * CAST;
    const by = dy ? s.y + dy * CAST : s.y - 2;
    const rod = scene.add.graphics().setDepth(s.y + 1);
    rod.lineStyle(1, 0x3a2a1a, 1).lineBetween(hx - 1, hy, hx - 1, hy - 4).lineBetween(hx + 1, hy, hx + 1, hy - 4);
    rod.lineStyle(1, 0x7a5432, 1).lineBetween(hx, hy - 3, tipX, tipY);
    rod.fillStyle(0xe8d8a8, 1).fillRect(Math.round(hx + (tipX - hx) * 0.3), Math.round(hy - 3 + (tipY - hy + 3) * 0.3) - 1, 2, 2);
    const midX = (tipX + bx) / 2;
    const midY = Math.max(tipY, by - 3) + 2;
    rod.lineStyle(1, 0xd8e0e8, 0.45).lineBetween(tipX, tipY, midX, midY).lineBetween(midX, midY, bx, by - 3);
    const ripple = scene.add.image(bx, by, ZTEX.ripple(0)).setOrigin(0.5, 0.5).setDepth(DEPTH.decal + 4).setAlpha(0.55);
    const bob = scene.add.image(bx, by, FTEX.bobber).setOrigin(0.5, 1).setDepth(by + 1);
    const hook = scene.add.image(s.x, s.y - 26, ZTEX.hook).setOrigin(0.5, 1).setDepth(DEPTH.bubble - 3).setVisible(false);
    return { spot: s, rod, bob, ripple, hook, by, phase: (s.x * 7 + s.y * 3) % 1000, busy: false };
  }

  update(now: number, view: Phaser.Geom.Rectangle, _labelScale: number, seats: ReadonlyMap<string, Sid>, mySid: Sid | null, mine: string | null, me: { x: number; y: number }): void {
    let hookAt: Marker | null = null;
    let best = HOOK_RADIUS;
    if (!mine)
      for (const m of this.markers) {
        const d = Math.hypot(me.x - m.spot.x, me.y - m.spot.y);
        if (d < best) {
          best = d;
          hookAt = m;
        }
      }
    for (const m of this.markers) {
      const s = m.spot;
      const owner = seats.get(s.id);
      const busy = mine === s.id || owner !== undefined;
      if (busy !== m.busy) {
        m.busy = busy;
        m.rod.setVisible(!busy);
        m.bob.setVisible(!busy);
        m.ripple.setVisible(!busy);
      }
      const showHook = m === hookAt && !(owner !== undefined && owner === mySid);
      if (m.hook.visible !== showHook) m.hook.setVisible(showHook);
      if (showHook) {
        const taken = owner !== undefined;
        const lift = this.reduced || taken ? 0 : Math.sin((now + m.phase) / 260) * 1.5;
        m.hook.setTint(taken ? 0x8a8a8a : 0xffffff).setAlpha(taken ? 0.6 : 1);
        m.hook.setPosition(s.x, Math.round(s.y - 24 - lift));
      }
      const inView = s.x > view.x - 40 && s.x < view.right + 40 && s.y > view.y - 40 && s.y < view.bottom + 40;
      if (busy || !inView || this.reduced) continue;
      const t = (now + m.phase * 3) / 1000;
      m.bob.setY(Math.round(m.by + Math.sin(t * 2.2) * 0.7));
      const k = (t / 1.8) % 1;
      m.ripple.setTexture(ZTEX.ripple(k < 0.5 ? 0 : 1)).setAlpha(0.6 * (1 - k)).setScale(1 + k * 0.5, 1 + k * 0.3);
    }
  }
}

export type CampForageDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  colliders: Phaser.Physics.Arcade.StaticGroup;
  player: () => Player;
  net: () => RealtimeClient;
  seats: () => ReadonlyMap<string, Sid>;
  remotes: () => ReadonlyMap<Sid, RemoteAvatar>;
  toast: (message: string) => void;
};

/** 캠핑장 낚시·채집 (Foraging을 캠핑장 맵으로) + 지금 E로 쓸 수 있는 낚시 자리·채집 지점 */
export class CampForage {
  readonly f: Foraging;
  private items: Interactable[] = [];

  constructor(d: CampForageDeps) {
    this.f = new Foraging({ ...d, map: "camp", zone: new CampFishMarkers(d.scene, d.reduced), setItems: (items) => (this.items = items) });
  }

  /** (x,y)에서 가장 가까운 낚시 자리·채집 지점 (반지름 안) */
  nearest(x: number, y: number): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const o of this.items) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d <= o.r && d < bd) {
        best = o;
        bd = d;
      }
    }
    return best;
  }
}
