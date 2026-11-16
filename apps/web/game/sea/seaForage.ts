import type * as Phaser from "phaser";
import { SEA_FISHING_SPOTS, type Sid } from "@tomb/protocol";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Interactable } from "../world/layout";
import { Foraging } from "../world/forage/Foraging";
import { CampFishMarkers } from "../camp/campForage";

// 11/16 갯바위 낚시: 마을·캠핑장 낚시(game/world/forage/Foraging)를 바닷가 맵으로 그대로 써요.
// - 낚시 자리 = protocol SEA_FISHING_SPOTS (큰 갯바위 앞 턱·선착장 끝 데크). 1인 자리·같은 낚시 창·같은 연출·같은 하루 한도.
// - 자리 표시는 캠핑장 계곡 자리와 같은 그림 (낚시 의자·꽂아 둔 낚싯대·찌·물결·낚싯바늘 말풍선).
// - 바닷물고기 도감은 아직 없어서 호수 물고기가 잡혀요 (protocol 주석). 채집 지점·NPC·의뢰는 바닷가에 없어요.

export type SeaForageDeps = {
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

/** 바닷가 낚시 (Foraging을 바닷가 맵으로) + 지금 E로 쓸 수 있는 낚시 자리 */
export class SeaForage {
  readonly f: Foraging;
  private items: Interactable[] = [];

  constructor(d: SeaForageDeps) {
    this.f = new Foraging({ ...d, map: "sea", zone: new CampFishMarkers(d.scene, d.reduced, SEA_FISHING_SPOTS), setItems: (items) => (this.items = items) });
  }

  /** (x,y)에서 가장 가까운 낚시 자리 (반지름 안) */
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
