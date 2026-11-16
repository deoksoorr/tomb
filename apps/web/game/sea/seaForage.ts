import type * as Phaser from "phaser";
import { SEA_FISHING_SPOTS, SEA_TIDE_OUT_MSG, seaFishingSpotById, seaFishWetAt, type FishingSpot, type Sid } from "@tomb/protocol";
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
// - 물때: 찌 자리(자리 앞 24px)가 물속일 때만 (간조엔 갯바위 자리를 못 써요, 선착장 끝은 늘 돼요). 낚는 중에 마르면 안내하고 일어나요.

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
  /** 지금 화면 물 높이 (0..1, 물때 시계 — ?tide= 시험 값도) */
  tide: () => number;
};

/** 바닷가 낚시 (Foraging을 바닷가 맵으로) + 지금 E로 쓸 수 있는 낚시 자리 */
export class SeaForage {
  readonly f: Foraging;
  private items: Interactable[] = [];
  private readonly tide: () => number;

  constructor(d: SeaForageDeps) {
    this.tide = d.tide;
    // 11/16 물때 규칙: 찌 자리가 물속이어야 낚아요 (protocol seaFishWetAt — 서버도 같은 계산으로 막아요)
    const dry = (s: FishingSpot) => !seaFishWetAt(s, d.tide());
    this.f = new Foraging({
      ...d,
      map: "sea",
      zone: new CampFishMarkers(d.scene, d.reduced, SEA_FISHING_SPOTS, dry),
      setItems: (items) => (this.items = items),
      blocked: (s) => (dry(s) ? SEA_TIDE_OUT_MSG : null),
    });
  }

  /** 이 낚시 자리가 물이 빠져 지금 못 쓰는지 (자리 안내에 써요) */
  isDry(o: Interactable): boolean {
    const id = o.forage?.startsWith("fish:") ? o.forage.slice(5) : null;
    const s = id ? seaFishingSpotById(id) : undefined;
    return !!s && !seaFishWetAt(s, this.tide());
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
