import type * as Phaser from "phaser";
import { SEA_DIG_CLOSED_MSG, seaDigOpenAt, SEA_FISHING_SPOTS, SEA_TIDE_OUT_MSG, seaFishingSpotById, seaFishWetAt, type FishingSpot, type Sid } from "@tomb/protocol";
import { gatherNodeById, type GatherNode } from "@/lib/forage/catalog";
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
// - 11/16 2차: 바닷물고기(물 종류 sea)가 잡혀요. 낚시 창 제목은 「낚시 · 바다」.
// - 11/16 2차 갯벌 캐기: 갯벌 구멍(protocol SEA_DIG_HOLES = catalog SEA_GATHER_NODES, kind clam)이 마을 채집 지점처럼 피어나요.
//   물이 덮은 구멍은 그림·빛을 숨기고, 다가가면 안내만 (protocol seaDigOpenAt — 서버 seaDigOpen과 같은 계산). 게이지·하루 한도는 마을과 같아요.
//   NPC·의뢰 게시판은 바닷가에 없어요 (포구 시장 좌판은 game/sea/seaMarket).
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

/** 바닷가 낚시·갯벌 캐기 (Foraging을 바닷가 맵으로) + 지금 E로 쓸 수 있는 낚시 자리·갯벌 구멍 */
export class SeaForage {
  readonly f: Foraging;
  private items: Interactable[] = [];
  private readonly tide: () => number;

  constructor(d: SeaForageDeps) {
    this.tide = d.tide;
    // 11/16 물때 규칙: 찌 자리가 물속이어야 낚아요 (protocol seaFishWetAt — 서버도 같은 계산으로 막아요)
    const dry = (s: FishingSpot) => !seaFishWetAt(s, d.tide());
    const covered = (n: GatherNode) => n.kind === "clam" && !seaDigOpenAt(n, d.tide());
    this.f = new Foraging({
      ...d,
      map: "sea",
      zone: new CampFishMarkers(d.scene, d.reduced, SEA_FISHING_SPOTS, dry),
      setItems: (items) => (this.items = items),
      blocked: (s) => (dry(s) ? SEA_TIDE_OUT_MSG : null),
      nodeBlocked: (n) => (covered(n) ? SEA_DIG_CLOSED_MSG : null),
    });
  }

  /** 이 낚시 자리가 물이 빠져 지금 못 쓰는지 (자리 안내에 써요) */
  isDry(o: Interactable): boolean {
    const id = o.forage?.startsWith("fish:") ? o.forage.slice(5) : null;
    const s = id ? seaFishingSpotById(id) : undefined;
    return !!s && !seaFishWetAt(s, this.tide());
  }

  /** 11/16 이 자리·구멍을 물때 때문에 지금 못 쓰면 머리 위 안내 글 (쓸 수 있으면 null) */
  tideHint(o: Interactable): string | null {
    if (this.isDry(o)) return "물이 빠져서 지금은 낚시할 수 없어요";
    const n = o.forage?.startsWith("node:") ? gatherNodeById(o.forage.slice(5)) : undefined;
    return n && n.kind === "clam" && !seaDigOpenAt(n, this.tide()) ? SEA_DIG_CLOSED_MSG : null;
  }

  /** (x,y)에서 가장 가까운 낚시 자리·갯벌 구멍 (반지름 안) */
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
