import * as Phaser from "phaser";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import { houseTitle } from "@/lib/housing/catalog";
import type { VillageHouse } from "@/lib/housing/types";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { WP } from "../sprites/worldProps";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { emptyLotLayers, litAlpha, lotLayers, type LotSize } from "./exterior";

// 필지 한 칸을 Phaser 오브젝트로 세운다 (메인 맵 주거 구역 WorldMap.setHouses · 분양 마을 VillageScene 공용).
//  마당(바닥 깊이) → 집(깊이 = 집 밑변) → 밤 창 불빛(집 바로 위, 시간대에 따라 알파) → 앞 울타리·우편함·간판·가로등(깊이 = 필지 아랫변)
//  + 굴뚝 연기 + 문패 2줄(지붕 위). 필지 위치·크기는 호출자가 준다 (위치는 맵 레이아웃 담당).

export type LotSpot = { lot: number; x: number; y: number };
export type LotLight = { x: number; y: number; scale: number; tint: number; base: number };

export type LotGfx = {
  /** 지울 때 destroy할 것 전부 (문패 제외) */
  objs: Phaser.GameObjects.GameObject[];
  /** 화면 근처일 때만 보이게 할 그림 (컬링 기준점 = 필지 아래 가운데) */
  images: Phaser.GameObjects.Image[];
  labels: Phaser.GameObjects.BitmapText[];
  lights: LotLight[];
  /** 집 몸체 충돌 (월드 좌표). 빈 필지면 null */
  body: { x: number; y: number; w: number; h: number } | null;
  /** 문 앞 (월드 좌표) */
  door: { x: number; y: number } | null;
};

export type LotOpts = { reduced: boolean; labelDepth?: number };

const texKey = (prefix: string, tier: string, size: LotSize, ext: object) => `lot-${prefix}-${tier}-${size.w}x${size.h}-${Object.values(ext).join("-")}`;

function canvasTex(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) addCanvasTexture(scene, key, { canvas: make() });
  return key;
}

export function drawHouseLot(scene: Phaser.Scene, atlas: GlyphAtlas, lot: LotSpot, size: LotSize, h: VillageHouse, mine: boolean, opts: LotOpts): LotGfx {
  const L = lotLayers(h.exterior, h.tier, size);
  const info = L.info;
  const base = lot.y + info.baseY;
  const ground = scene.add.image(lot.x, lot.y, canvasTex(scene, texKey("ground", h.tier, size, h.exterior), () => L.ground.toCanvas())).setOrigin(0, 0).setDepth(DEPTH.decal + 1);
  const back = scene.add.image(lot.x, lot.y, canvasTex(scene, texKey("back", h.tier, size, {}), () => L.back.toCanvas())).setOrigin(0, 0).setDepth(lot.y + L.backBase);
  const house = scene.add.image(lot.x, lot.y, canvasTex(scene, texKey("house", h.tier, size, h.exterior), () => L.house.toCanvas())).setOrigin(0, 0).setDepth(base);
  const lit = scene.add
    .image(lot.x, lot.y, canvasTex(scene, texKey("lit", h.tier, size, h.exterior), () => L.lit.toCanvas()))
    .setOrigin(0, 0)
    .setDepth(base + 0.01);
  trackLit(scene, lit);
  const front = scene.add.image(lot.x, lot.y, canvasTex(scene, texKey("front", h.tier, size, h.exterior), () => L.front.toCanvas())).setOrigin(0, 0).setDepth(lot.y + size.h - 2);
  const objs: Phaser.GameObjects.GameObject[] = [ground, back, house, lit, front];
  // 굴뚝 연기 (움직임 줄이기면 끈다)
  if (!opts.reduced && scene.textures.exists(WP.smoke))
    for (const [i, c] of info.chimneys.entries()) {
      const smoke = scene.add
        .particles(lot.x + c.x, lot.y + c.y, WP.smoke, {
          lifespan: { min: 2600, max: 3600 },
          speedX: { min: 1, max: 6 },
          speedY: { min: -11, max: -6 },
          scale: { start: 0.22, end: 0.9 },
          alpha: { start: 0.3, end: 0 },
          frequency: 900 + ((lot.lot * 7 + i * 3) % 5) * 120,
        })
        .setDepth(base + 0.02);
      objs.push(smoke);
    }
  // 문패: 지붕 위 두 줄
  const t = houseTitle(h.score);
  const line1 = `${lot.lot}번지 · ${h.name}${mine ? " (내 집)" : ""}`;
  const line2 = `${h.ownerName} · ${t.name} · ${h.score}점`;
  atlas.ensure(line1 + line2);
  const cx = lot.x + size.w / 2;
  const bottom = lot.y + info.roofTop - 2;
  const depth = opts.labelDepth ?? DEPTH.labels - 1;
  const labels = [
    scene.add.bitmapText(cx, bottom - 9, FONT_KEY, line1, FONT_PX).setOrigin(0.5, 1).setTint(mine ? 0xffe39a : 0xf2ead3).setAlpha(0.92).setDepth(depth),
    scene.add.bitmapText(cx, bottom, FONT_KEY, line2, FONT_PX).setOrigin(0.5, 1).setTint(0xb9b4a4).setAlpha(0.85).setDepth(depth),
  ];
  return {
    objs,
    images: [ground, back, house, lit, front],
    labels,
    lights: info.lights.map((l) => ({ x: lot.x + l.x, y: lot.y + l.y, scale: l.r / 40, tint: l.color, base: 0.5 })),
    body: { x: lot.x + info.body.x, y: lot.y + info.body.y, w: info.body.w, h: info.body.h },
    door: { x: lot.x + info.door.x, y: lot.y + info.door.y },
  };
}

export function drawEmptyLot(scene: Phaser.Scene, atlas: GlyphAtlas, lot: LotSpot, size: LotSize, taken: boolean, opts: LotOpts): LotGfx {
  const L = emptyLotLayers(taken, size);
  const kind = taken ? "taken" : "free";
  const ground = scene.add.image(lot.x, lot.y, canvasTex(scene, `lot-empty-ground-${kind}-${size.w}x${size.h}`, () => L.ground.toCanvas())).setOrigin(0, 0).setDepth(DEPTH.decal + 1);
  const front = scene.add.image(lot.x, lot.y, canvasTex(scene, `lot-empty-front-${kind}-${size.w}x${size.h}`, () => L.front.toCanvas())).setOrigin(0, 0).setDepth(lot.y + L.signY);
  const text = taken ? `${lot.lot}번지 · 공사 중` : `${lot.lot}번지 · 분양 중`;
  atlas.ensure(text);
  const label = scene.add
    .bitmapText(lot.x + size.w / 2, lot.y + L.signY - 24, FONT_KEY, text, FONT_PX)
    .setOrigin(0.5, 1)
    .setTint(taken ? 0x908b7b : 0xd9d4c3)
    .setAlpha(0.8)
    .setDepth(opts.labelDepth ?? DEPTH.labels - 1);
  return { objs: [ground, front], images: [ground, front], labels: [label], lights: [], body: null, door: null };
}

// ── 밤 창 불빛: 씬마다 타이머 하나가 시간대(KST, ?time= 덮어쓰기 포함)를 보고 알파를 맞춘다 ──

const litSets = new WeakMap<Phaser.Scene, Set<Phaser.GameObjects.Image>>();

function currentLit(): number {
  const search = typeof location === "undefined" ? "" : location.search;
  return litAlpha(ambienceAt(Date.now(), parseAmbienceOverride(search)).palette.lightGlow);
}

function trackLit(scene: Phaser.Scene, img: Phaser.GameObjects.Image): void {
  let set = litSets.get(scene);
  if (!set) {
    const s = new Set<Phaser.GameObjects.Image>();
    litSets.set(scene, s);
    set = s;
    scene.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        const a = currentLit();
        for (const o of s) {
          if (!o.active) s.delete(o);
          else o.setAlpha(a);
        }
      },
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => litSets.delete(scene));
  }
  set.add(img);
  img.setAlpha(currentLit());
}
