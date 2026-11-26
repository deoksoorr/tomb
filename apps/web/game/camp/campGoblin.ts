import type * as Phaser from "phaser";
import { attachGoblin, type GoblinActor } from "../world/life/GoblinActor";
import type { CampHost } from "./campHost";

// 11/26 황금 고블린을 캠핑장 장면에 붙이는 연결 (캠핑장 고블린 그리기·잡기, 다른 맵이면 마을행 정류장 쪽 화살표).
// CampScene은 맵 담당 파일이라 여기 한 함수로 모아 두었다. CampScene에 넣을 줄:
//   import { campGoblin } from "./campGoblin";                                           (import 줄)
//   private goblin: ReturnType<typeof campGoblin> | null = null;                         (필드)
//   this.goblin = campGoblin(this, h, () => this.player, () => this.rig.labelScale);     (create — this.life = new CampLife(...) 다음)
//   this.goblin?.addLights(lit);                                                         (updateLighting — this.life?.addLights(lit) 다음)
// 장면이 꺼질 때 치우는 건 attachGoblin이 SHUTDOWN·DESTROY에서 알아서 한다. callbacks()의 onGoblin·onGoblinGone·onGoblinCaught 세 줄은 지워도 된다(부르지 않는다).

export function campGoblin(scene: Phaser.Scene, h: Pick<CampHost, "atlas" | "sfx" | "reduced" | "net">, player: () => { x: number; y: number }, labelScale: () => number): GoblinActor {
  return attachGoblin({ scene, atlas: h.atlas, sfx: h.sfx, reduced: h.reduced, map: "camp", player, net: () => h.net, labelScale });
}
