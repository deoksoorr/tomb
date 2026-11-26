import type * as Phaser from "phaser";
import type { NpcMap } from "@/lib/forage/catalog";
import type { FirstGuideTarget } from "@/lib/retain";
import { bridge } from "../bridge";
import { findPath, type WalkGrid } from "../logic/pathfind";
import { awayRouteTargets, sellerRoute } from "./awayRouteMath";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { RouteGuide } from "./RouteGuide";
import type { Pt } from "./routeGuideMath";

// 11/26 캠핑장·바닷가 길 안내 (오늘 미션 「팔기」만): 마을 대신 지금 맵에서 가장 가까운 상인(캠핑장 = 낚시터 사장님, 바닷가 = 해녀 할망)까지
// 마을과 같은 금빛 화살표(RouteGuide). 다른 목적지(벤치·채집 지점 …)는 마을에 돌아가면 마을 장면이 이어서 보여 준다.
// 순수 계산(목적지·격자)은 awayRouteMath.
export { gridOfCells } from "./awayRouteMath";

export type AwayRouteDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  map: Exclude<NpcMap, "village">;
  player: () => Pt;
  /** 걸어서 가는 격자 (물을 피한 것 먼저, 없으면 헤엄 격자) */
  grids: () => readonly WalkGrid[];
};

export class AwayRoute {
  /** 안내를 처음 켤 때 만든다 (표시 풀 이미지가 많아 안 쓰는 판에는 만들지 않는다) */
  private guide: RouteGuide | null = null;
  private target: FirstGuideTarget | null = null;
  private readonly off: () => void;

  constructor(private readonly d: AwayRouteDeps) {
    this.off = bridge.on("route:guide", ({ target }) => this.set(target));
    // 마을에서 켜 두고 왔으면 이어서
    this.set(bridge.last("route:guide")?.target ?? null);
  }

  private set(target: FirstGuideTarget | null): void {
    this.target = target && awayRouteTargets.includes(target) ? target : null;
    if (this.target && !this.guide) {
      const d = this.d;
      this.guide = new RouteGuide({
        scene: d.scene,
        atlas: d.atlas,
        reduced: d.reduced,
        player: d.player,
        route: (from, to) => {
          for (const g of d.grids()) {
            const p = findPath(g, from, to);
            if (p?.length) return p;
          }
          return null;
        },
      });
    }
    this.guide?.set(this.target ? () => sellerRoute(this.d.map, this.d.player()) : null);
  }

  /** 매 프레임. 닿았거나 갈 곳이 없으면 끝내고 화면에 알린다 (마을 WorldScene.updateRoute와 같다) */
  update(now: number, view: Phaser.Geom.Rectangle, labelScale: number, hidden: boolean): void {
    const t = this.target;
    if (!t) return;
    const r = this.guide?.update(now, view, labelScale, hidden);
    if (!r) return;
    bridge.emit("route:state", { target: t, status: r });
    bridge.emit("route:guide", { target: null });
  }

  destroy(): void {
    this.off();
    this.guide?.destroy();
    this.guide = null;
  }
}
