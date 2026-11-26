import * as Phaser from "phaser";
import { CAMP_LOTS, campLotByNo, type CampYard, type CaravanModel } from "@tomb/protocol";
import type { MapConcept } from "@/lib/mapConcept";
import { installProcedural, preloadFiles } from "../assets/manifest";
import { DEPTH } from "../config";
import { hash2 } from "../sprites/pixel";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { installWorldTint } from "../world/worldTint";
import { CampHousing } from "./campHousing";
import { campHomeSeatsOf, campSeatZones } from "./campHousingPlan";
import type { CampVillageHouse } from "./campSaleApi";
import type { CampInteractable } from "./campTypes";

// 11/26 개발 확인용 (app/dev/camp-homes): 캠핑장 집 16채를 실제 터 자리에 그대로 세워 본다 (맵 그림 없이 땅만).
// 캠핑장 장면(CampScene)에 붙이기 전에 겉모습·앞마당 단계·넓히기·겨울판·밤 불빛·앉을 자리·문 자리를 캡처로 확인한다. 실서버에서는 404.

export type SheetOpts = {
  cx: number;
  cy: number;
  zoom: number;
  stage: CampYard;
  wide: boolean;
  /** all = 16채 모두 분양 · none = 모두 빈 터 · mix = 홀짝 */
  owned: "all" | "none" | "mix";
  concept: MapConcept;
  night: boolean;
  /** 앉을 자리 점 (초록 = 열림 · 빨강 = 닫힘) · 문 자리 (노랑) */
  marks: boolean;
  /** 11/26 카라반 모델을 모든 카라반 자리에 (없으면 자리 번호대로) — 배치 점검 시트 */
  model?: CaravanModel;
};

const NAMES = [
  "콩이네",
  "별바라기네",
  "달빛캠퍼",
  "모닥불러",
  "새벽물소리",
  "강태공네",
  "눈사람클럽",
  "솜사탕네",
  "마시멜로네",
  "도토리네",
  "구름캠프",
  "느긋한집",
  "솔바람 휴가",
  "달빛 하우스",
  "싸리울 쉼터",
  "감나무 별장",
];

export class CampHousingSheet extends Phaser.Scene {
  private opts!: SheetOpts;
  homes: CampHousing | null = null;

  constructor() {
    super("campHomesSheet");
  }

  init(o: SheetOpts): void {
    this.opts = o;
  }

  preload(): void {
    preloadFiles(this);
  }

  create(): void {
    installProcedural(this);
    const atlas = new GlyphAtlas(this);
    const o = this.opts;
    const snowy = o.concept !== "default";
    // 땅 (맵 그림 대신 고른 풀밭·눈밭 + 잔 무늬)
    const W = 1280;
    const H = 800;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const n = hash2(x >> 1, y >> 1, 7) * 0.08 - 0.04;
        const base = snowy ? [232, 238, 244] : [118, 156, 86];
        const j = (y * W + x) * 4;
        img.data[j] = Math.round(base[0] * (1 + n));
        img.data[j + 1] = Math.round(base[1] * (1 + n));
        img.data[j + 2] = Math.round(base[2] * (1 + n));
        img.data[j + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas("sheet-ground", c);
    this.add.image(0, 0, "sheet-ground").setOrigin(0, 0).setDepth(DEPTH.ground);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setZoom(o.zoom);
    cam.centerOn(o.cx, o.cy);
    cam.setRoundPixels(true);
    if (o.night) this.add.rectangle(0, 0, W, H, 0x0a1430, 0.62).setOrigin(0, 0).setDepth(DEPTH.dark);

    const map = { colliders: this.physics.add.staticGroup(), furnitureColliders: this.physics.add.staticGroup(), interactables: [] as readonly CampInteractable[] };
    this.homes = new CampHousing({ scene: this, atlas, reduced: false, map, concept: () => o.concept, channel: () => null, warp: () => undefined, toast: () => undefined });
    const houses: CampVillageHouse[] = CAMP_LOTS.filter((l) => o.owned === "all" || (o.owned === "mix" && l.lot % 2 === 1)).map((l) => ({
      id: `h${l.lot}`,
      ch: 1,
      lot: l.lot,
      name: NAMES[l.lot - 1],
      ownerName: `캠퍼${l.lot}`,
      tier: o.wide ? "wide" : "small",
      score: 120 + l.lot * 7,
      likes: 3,
      items: 10,
      createdAt: 0,
      exterior: {} as CampVillageHouse["exterior"],
      camp: { kind: l.kind, yard: o.stage, ...(l.kind === "caravan" && o.model ? { design: { model: o.model, color: l.lot % 4, awning: (l.lot + 1) % 4 } } : {}) },
    }));
    this.homes.setHouses(houses, [], "h1");
    this.homes.update(o.night ? 0.9 : 0.05, 1 / o.zoom);
    if (o.marks) {
      const g = this.add.graphics().setDepth(DEPTH.labels - 5);
      for (const l of CAMP_LOTS) {
        const h = houses.find((x) => x.lot === l.lot) ?? null;
        for (const s of campHomeSeatsOf(l)) {
          const open = this.homes.seatOpen(s.id);
          if (!open && !h) continue;
          g.fillStyle(open ? 0x22dd66 : 0xdd3344, open ? 0.9 : 0.5).fillCircle(s.x, s.y, 2);
          // 보는 쪽 (0 아래 · 1 왼쪽 · 2 오른쪽 · 3 위 — DIR)
          const d = [
            [0, 4],
            [-4, 0],
            [4, 0],
            [0, -4],
          ][s.facing] ?? [0, 0];
          g.lineStyle(1, 0x22dd66, open ? 0.9 : 0).lineBetween(s.x, s.y, s.x + d[0], s.y + d[1]);
        }
      }
      for (const i of map.interactables) g.lineStyle(1, 0xffe040, 0.9).strokeCircle(i.x, i.y, (i as { r: number }).r);
      // 11/26 원두막·평상·정자 오르는 자리 (하늘색 — 이 안에서만 그 방석을 고른다)
      for (const z of campSeatZones(CAMP_LOTS)) if (z.seats.some((id) => this.homes?.seatOpen(id))) for (const r of z.rects) g.lineStyle(1, 0x40e0ff, 0.95).strokeRect(r.x, r.y, r.w, r.h);
      // 터 테두리 (점선 대신 옅은 선)
      for (const l of CAMP_LOTS) g.lineStyle(1, 0xffffff, 0.25).strokeRect(l.x, l.y, l.w, l.h);
      // 막는 상자
      for (const grp of [map.colliders, map.furnitureColliders])
        grp.getChildren().forEach((z) => {
          const b = (z as unknown as { body: Phaser.Physics.Arcade.StaticBody }).body;
          if (b) g.lineStyle(1, grp === map.colliders ? 0xff4040 : 0x40a0ff, 0.6).strokeRect(b.x, b.y, b.width, b.height);
        });
    }
    void campLotByNo;
  }
}

export function bootCampHomesSheet(parent: HTMLElement, opts: SheetOpts): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#141519",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    autoFocus: false,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || window.innerWidth, height: parent.clientHeight || window.innerHeight, min: { width: 1, height: 1 }, autoRound: true },
    render: { powerPreference: "high-performance", antialiasGL: false, preserveDrawingBuffer: true },
    physics: { default: "arcade", arcade: { debug: false } },
    callbacks: { postBoot: (g) => void installWorldTint(g) },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    scene: [],
  });
  game.scene.add("campHomesSheet", CampHousingSheet, true, opts);
  (window as unknown as { __campHomes?: unknown }).__campHomes = { game, scene: () => game.scene.getScene("campHomesSheet") as unknown as CampHousingSheet };
  return game;
}
