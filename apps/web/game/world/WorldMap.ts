import * as Phaser from "phaser";
import {
  CAMPFIRES,
  FURNITURE,
  HOUSE_LOT_H,
  HOUSE_LOT_W,
  HOUSE_LOTS,
  HOUSING_OFFICE,
  HUNT_GATE,
  LAKE,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHOP,
  SHRINE,
  TILE,
  WORLD_LOTS,
  ZONES,
  FERRY_DOCK,
  playerBounds,
  type Furniture,
} from "@tomb/protocol";
import { houseTitle } from "@/lib/housing/catalog";
import type { VillageHouse, VillageResponse } from "@/lib/housing/types";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { facadeGrid, facadeInfo, FACADE_H } from "../housing/art";
import { CHUNK, CHUNK_COLS, CHUNK_ROWS, drawGroundChunk } from "../sprites/ground";
import { SHOP_HUT_H } from "../sprites/extras";
import { CAVE_H, CAVE_TORCHES, FIRE_FRAMES, OFFICE_H, TORCH_TINT, WP } from "../sprites/worldProps";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import {
  allProps,
  benchWidth,
  CAMPFIRE_LIGHT,
  campfireCollider,
  cliffColliders,
  furnitureCollider,
  hammockPosts,
  houseCollider,
  interactables,
  lotInteractable,
  officeCollider,
  propCollider,
  propLight,
  RIVER_CURRENT,
  shopCollider,
  SHRINE_TREE,
  type Interactable,
  type PropDef,
  type Rect,
} from "./layout";

// 맵: 바닥(정사각 덩어리 텍스처, 화면 근처만 생성), 담장, 정문, 소품, 가구, 유령 잡화점·분양 사무소 오두막, 사냥터 동굴, 성황당,
// 주거 구역의 집(마을 정보를 받으면 setHouses), 구역 이름표, 충돌 박스.
// 맵이 넓어서 소품 그림은 칸(CELL px)마다 묶어 두고 화면 근처 칸만 보이게 한다 (모바일에서도 그리는 수가 일정).
// 모닥불: 돌 고리 + 일렁이는 불꽃 + 불티·연기 + 흔들리는 빛. 불멍(CampfireView) 중인 불은 불티를 더 많이 낸다.

export type LightSpot = { x: number; y: number; scale: number; tint: number; base: number };

/** 소품 그림 컬링 칸 크기 */
const CELL = 256;
const CELL_COLS = Math.ceil(MAP_WIDTH / CELL);
/** 화면 밖 여유 (큰 나무·지붕이 칸 경계에 걸쳐도 잘리지 않게) */
const CULL_PAD = 96;
/** 그네 틀은 받침보다 이만큼 뒤(depth)에 그려 탄 사람이 가려지지 않게 한다 */
const SWING_BEHIND = 8;
/** 납작한 바닥 소품은 바닥 장식 높이에 (아바타·묘비가 항상 위로) */
const FLAT = new Set<PropDef["kind"]>(["flowers", "mushroom", "leaves", "mat"]);

type Culled = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

export class WorldMap {
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  /** 주거 구역의 집 몸체 (마을 정보가 바뀌면 다시 만든다). 예전 이름(묘비 격자 소품) 그대로 둔다 */
  readonly gridColliders: Phaser.Physics.Arcade.StaticGroup;
  /** 의자·벤치 (점프 중에는 넘어갈 수 있도록 따로 둔다) */
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  private readonly chunks = new Map<number, Phaser.GameObjects.Image>();
  /** 컬링 칸 → 그 칸에 받침이 있는 그림 */
  private readonly cells = new Map<number, Culled[]>();
  private readonly shownCells = new Set<number>();
  private lastCull = "";
  private fixedItems: Interactable[] = interactables();
  private items: Interactable[] = this.fixedItems;
  readonly height = MAP_HEIGHT;
  /** 정적 빛 (석등·오두막 창·가로등) — Atmosphere가 그린다 */
  readonly staticLights: LightSpot[] = [];
  /** 집 창문 빛 (마을 정보가 바뀌면 다시) */
  gridLights: LightSpot[] = [];
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private houseObjs: Phaser.GameObjects.GameObject[] = [];
  private houseLabels: Phaser.GameObjects.BitmapText[] = [];
  private houseKey = "";
  /** 그네 줄·판 (받침 좌표 x*65536+y → 이미지) */
  private readonly swingSeats = new Map<number, Phaser.GameObjects.Image>();
  /** 모닥불 id → 불티·연기 이미터 */
  private readonly fires = new Map<string, { embers: Phaser.GameObjects.Particles.ParticleEmitter; smoke: Phaser.GameObjects.Particles.ParticleEmitter }>();
  private readonly reduced: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
  ) {
    this.colliders = scene.physics.add.staticGroup();
    this.gridColliders = scene.physics.add.staticGroup();
    this.furnitureColliders = scene.physics.add.staticGroup();
    this.reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // 정문 (윗담 가운데)
    scene.add.image(MAP_WIDTH / 2, 2 * TILE + 2, TEX.gate).setOrigin(0.5, 1).setDepth(2 * TILE);

    for (const p of allProps()) {
      this.cull(p.x, p.y, this.addPropImage(p));
      this.addPropBody(p, this.colliders, this.staticLights);
    }
    for (const f of FURNITURE) this.addFurniture(f);
    for (const r of cliffColliders()) this.addCollider(this.colliders, r);
    this.addCampfires();
    this.addWaterShimmer();

    // 유령 잡화점 오두막
    scene.add.image(SHOP.x, SHOP.y + 2, TEX.shopHut).setOrigin(0.5, 1).setDepth(SHOP.y);
    this.addCollider(this.colliders, shopCollider());
    for (const dx of [-14, 14]) this.staticLights.push({ x: SHOP.x + dx, y: SHOP.y - 17, scale: 0.4, tint: 0xffc870, base: 0.5 });
    this.addLabel(SHOP.x, SHOP.y - SHOP_HUT_H - 2, "유령 잡화점", 0xe8dcc0, 1);

    // 분양 사무소 (주거 구역 어귀)
    const O = HOUSING_OFFICE;
    scene.add.image(O.x, O.y + 2, WP.office).setOrigin(0.5, 1).setDepth(O.y);
    this.addCollider(this.colliders, officeCollider());
    for (const dx of [-15, 14]) this.staticLights.push({ x: O.x + dx, y: O.y - 16, scale: 0.4, tint: 0xffd98a, base: 0.5 });
    this.addLabel(O.x, O.y - OFFICE_H - 2, "분양 사무소", 0xd8e4ec, 1);

    // 사냥터 입구 (윗담의 바위 동굴 + 횃불)
    const caveY = HUNT_GATE.y - 8;
    scene.add.image(HUNT_GATE.x, caveY, WP.cave).setOrigin(0.5, 1).setDepth(caveY);
    for (const [dx, dy] of CAVE_TORCHES) this.staticLights.push({ x: HUNT_GATE.x + dx, y: caveY + dy - 1, scale: 0.55, tint: TORCH_TINT, base: 0.8 });
    // 이름은 동굴 왼쪽 담 위에 (동굴 위는 화면 밖에 걸린다)
    this.addLabel(HUNT_GATE.x - 42, caveY - CAVE_H / 2 + 4, "사냥터", 0xf0c8a0, 0.5);

    // 성황당 (나무·돌무더기는 소품)
    this.addLabel(SHRINE.x, SHRINE_TREE.y - 42, "성황당", 0xe8d0c0, 1);

    // 구역 이름 (은은하게)
    for (const z of ZONES) {
      if (z.id === "river" || z.id === "gate") continue;
      const at = ZONE_LABEL_AT[z.id] ?? { x: z.x + z.w / 2, y: z.y + 10 };
      this.addLabel(at.x, at.y, z.name, 0xd8ccb0, 1, 0.62);
    }
    this.addLabel(FERRY_DOCK.x, FERRY_DOCK.y - 44, "나루터", 0xd8ccb0, 1, 0.75);

    // 아래 담 (맵 맨 아래 줄은 바닥 타일이 담 면으로 그린다)
    this.applyBounds();
  }

  private applyBounds(): void {
    const b = playerBounds();
    this.scene.physics.world.setBounds(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  }

  private addLabel(x: number, y: number, text: string, tint: number, originY: number, alpha = 0.88): Phaser.GameObjects.BitmapText {
    this.atlas.ensure(text);
    const t = this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
    this.labels.push(t);
    return t;
  }

  /** 1/zoom 배율 글씨 (장소·구역·집 이름) */
  scaleLabels(s: number): void {
    for (const l of this.labels) if (l.scaleX !== s) l.setScale(s);
    for (const l of this.houseLabels) if (l.scaleX !== s) l.setScale(s);
  }

  private addCollider(group: Phaser.Physics.Arcade.StaticGroup, r: Rect): void {
    const z = this.scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    z.removeFromDisplayList();
    group.add(z);
  }

  /** 컬링 칸에 그림을 넣는다 (받침 좌표 기준) */
  private cull(x: number, y: number, o: Culled): void {
    const k = Math.floor(y / CELL) * CELL_COLS + Math.floor(x / CELL);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(o);
    o.setVisible(this.shownCells.has(k));
  }

  private propTexture(p: PropDef): string {
    const v = p.variant;
    switch (p.kind) {
      case "tree":
        return v % 2 ? TEX.tree1 : TEX.tree0;
      case "deadTree":
        return v % 2 ? TEX.dead1 : TEX.dead0;
      case "autumn":
        return v % 2 ? WP.autumn1 : WP.autumn0;
      case "maple":
        return v % 2 ? WP.maple1 : WP.maple0;
      case "ginkgo":
        return v % 2 ? WP.ginkgo1 : WP.ginkgo0;
      case "blossom":
        return v % 2 ? WP.blossom1 : WP.blossom0;
      case "pine":
        return v % 2 ? WP.pine1 : WP.pine0;
      case "snowPine":
        return v % 2 ? WP.snowPine1 : WP.snowPine0;
      case "bush":
        return v % 3 === 2 ? WP.bush2 : v % 3 ? WP.bush1 : WP.bush0;
      case "lantern":
        return TEX.lantern;
      case "lamp":
        return WP.lamp;
      case "table":
        return TEX.table;
      case "well":
        return WP.well;
      case "swing":
        return WP.swing;
      case "hammock":
        return WP.hammock;
      case "bell":
        return WP.bell;
      case "cairn":
        return v % 2 ? WP.cairn1 : WP.cairn0;
      case "flowers":
        return v % 3 === 2 ? WP.flowers2 : v % 3 ? WP.flowers1 : WP.flowers0;
      case "mushroom":
        return v % 2 ? WP.mushroom1 : WP.mushroom0;
      case "leaves":
        return v % 2 ? WP.leaves1 : WP.leaves0;
      case "pumpkin":
        return v % 2 ? WP.pumpkin1 : WP.pumpkin0;
      case "mat":
        return v % 2 ? WP.mat1 : WP.mat0;
      case "scarecrow":
        return WP.scarecrow;
      case "reeds":
        return v % 2 ? WP.reeds1 : WP.reeds0;
      case "jar":
        return WP.jar;
      case "boat":
        return WP.boat;
      case "shrineTree":
        return WP.shrineTree;
    }
  }

  /** 소품 그림 (텍스처 맨 아래 줄은 그림자 → 받침(y)이 그 위에 오도록 1px 내린다) */
  private addPropImage(p: PropDef): Phaser.GameObjects.Image {
    if (p.kind === "swing") {
      // 그네: 틀은 탄 사람 뒤에, 줄·판은 따로 (누가 타면 숨긴다 — 아바타가 자기 줄·판과 함께 앞뒤로 흔들린다)
      const frame = this.scene.add.image(p.x, p.y + 1, this.propTexture(p)).setOrigin(0.5, 1).setDepth(p.y - SWING_BEHIND);
      const seat = this.scene.add.image(p.x, p.y + 1, WP.swingSeat).setOrigin(0.5, 1).setDepth(p.y - SWING_BEHIND + 1);
      this.swingSeats.set(p.x * 65536 + p.y, seat);
      this.cull(p.x, p.y, seat);
      return frame;
    }
    if (p.kind === "boat") {
      // 물 위에 떠 있는 배: 살짝 오르내린다
      const img = this.scene.add.image(p.x, p.y + 2, WP.boat).setOrigin(0.5, 1).setDepth(p.y);
      if (!this.reduced) this.scene.tweens.add({ targets: img, y: p.y + 3, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      return img;
    }
    // 해먹: 누운 사람(받침 + 1)보다 뒤에
    const depth = FLAT.has(p.kind) ? DEPTH.decal + 3 : p.kind === "hammock" ? p.y - 2 : p.y;
    return this.scene.add.image(p.x, p.y + 1, this.propTexture(p)).setOrigin(0.5, 1).setDepth(depth);
  }

  /**
   * 그네 탄 사람 자리(좌석 = 그네 받침 y − 4)들을 받아, 사람이 있는 그네의 가만히 있는 줄·판을 숨긴다.
   * riders: [x0, y0, x1, y1, …] (프레임마다 재사용 배열)
   */
  updateSwings(riders: readonly number[], n: number): void {
    for (const [key, seat] of this.swingSeats) {
      const px = Math.floor(key / 65536);
      const py = key % 65536;
      let busy = false;
      for (let i = 0; i < n; i += 2) {
        if (Math.abs(riders[i] - px) <= 6 && Math.abs(riders[i + 1] - (py - 4)) <= 6) {
          busy = true;
          break;
        }
      }
      // 컬링으로 숨긴 칸이면 그대로 둔다 (칸이 보이면 다음 프레임에 맞춘다)
      const want = !busy && this.shownCells.has(Math.floor(py / CELL) * CELL_COLS + Math.floor(px / CELL));
      if (seat.visible !== want) seat.setVisible(want);
    }
  }

  /** 소품 충돌·빛 */
  private addPropBody(p: PropDef, group: Phaser.Physics.Arcade.StaticGroup, lights: LightSpot[]): void {
    const c = propCollider(p);
    if (c) this.addCollider(group, c);
    if (p.kind === "hammock") for (const r of hammockPosts(p)) this.addCollider(group, r);
    const l = propLight(p);
    if (l) lights.push({ x: p.x, y: p.y + l.dy, scale: l.scale, tint: l.tint, base: l.base });
  }

  /** 상호작용 대상 (고정 맵 + 주거 구역의 집 문·빈 필지) */
  get interactables(): readonly Interactable[] {
    return this.items;
  }

  private addFurniture(f: Furniture): void {
    let key: string;
    if (f.campfire) key = f.kind === "bench" ? WP.logSeat : WP.stumpSeat;
    else if (f.kind === "bench") {
      const w = benchWidth(f);
      key = w >= 72 ? TEX.bench4 : w >= 56 ? TEX.bench3 : TEX.bench2;
    } else key = f.facing === 1 ? TEX.chairLeft : f.facing === 2 ? TEX.chairRight : TEX.chairDown;
    this.cull(f.x, f.y, this.scene.add.image(f.x, f.y + 2, key).setOrigin(0.5, 1).setDepth(f.y));
    this.addCollider(this.furnitureColliders, furnitureCollider(f));
  }

  private addCampfires(): void {
    const scene = this.scene;
    if (!scene.anims.exists("fx-campfire-burn")) {
      scene.anims.create({
        key: "fx-campfire-burn",
        frames: Array.from({ length: FIRE_FRAMES }, (_, i) => ({ key: WP.fire, frame: i })),
        frameRate: this.reduced ? 4 : 10,
        repeat: -1,
      });
    }
    for (const c of CAMPFIRES) {
      scene.add.image(c.x, c.y + 1, WP.fireRing).setOrigin(0.5, 0.5).setDepth(DEPTH.decal + 2);
      const fire = scene.add.sprite(c.x, c.y + 2, WP.fire, 0).setOrigin(0.5, 1).setDepth(c.y);
      fire.play({ key: "fx-campfire-burn", startFrame: Math.floor(Math.random() * FIRE_FRAMES) });
      this.addCollider(this.colliders, campfireCollider(c));
      this.staticLights.push({ x: c.x, y: c.y + CAMPFIRE_LIGHT.dy, scale: CAMPFIRE_LIGHT.scale, tint: CAMPFIRE_LIGHT.tint, base: CAMPFIRE_LIGHT.base });
      const embers = scene.add
        .particles(c.x, c.y - 10, TEX.spark, {
          lifespan: { min: 900, max: 1700 },
          speedX: { min: -7, max: 7 },
          speedY: { min: -30, max: -16 },
          accelerationX: { min: -6, max: 6 },
          scale: { start: 0.42, end: 0.08 },
          alpha: { start: 1, end: 0 },
          tint: [0xffd060, 0xff9a40, 0xff6a2a],
          blendMode: Phaser.BlendModes.ADD,
          frequency: this.reduced ? 520 : 180,
          x: { min: -4, max: 4 },
        })
        .setDepth(DEPTH.lights + 3);
      const smoke = scene.add
        .particles(c.x, c.y - 18, WP.smoke, {
          lifespan: { min: 2200, max: 3200 },
          speedX: { min: -3, max: 5 },
          speedY: { min: -12, max: -7 },
          scale: { start: 0.35, end: 1.5 },
          alpha: { start: 0.22, end: 0 },
          frequency: this.reduced ? 1400 : 650,
        })
        .setDepth(c.y + 30);
      this.fires.set(c.id, { embers, smoke });
    }
  }

  /** 불멍 중인 모닥불은 불티를 더 많이 (null이면 모두 평소대로) */
  boostCampfire(id: string | null): void {
    for (const [k, f] of this.fires) {
      const on = k === id;
      f.embers.frequency = on ? (this.reduced ? 260 : 60) : this.reduced ? 520 : 180;
    }
  }

  /** 강·호수 물결 반짝임: 강은 하류 쪽으로 천천히 흐르고, 호수는 제자리에서 반짝인다 */
  private addWaterShimmer(): void {
    const spots: [number, number, boolean][] = [];
    for (let x = 80; x < 1560; x += 92) spots.push([x, 870 + ((x * 7) % 11) - 5 + (x > 1300 ? 14 : 0), true]);
    for (let i = 0; i < 8; i++) spots.push([LAKE.x - 150 + i * 42, LAKE.y - 50 + ((i * 37) % 90), false]);
    const drift = RIVER_CURRENT * 1.6;
    for (let i = 0; i < spots.length; i++) {
      const [x, y, river] = spots[i];
      const s = this.scene.add.image(x, y, TEX.shimmer).setDepth(DEPTH.decal + 1).setAlpha(0.5);
      this.cull(x, y, s);
      if (this.reduced) continue;
      if (river) this.scene.tweens.add({ targets: s, alpha: 0.05, x: x + drift, duration: 2200 + (i % 5) * 300, yoyo: false, repeat: -1, ease: "Sine.easeInOut" });
      else this.scene.tweens.add({ targets: s, alpha: 0.05, x: x + 3, duration: 1600 + i * 300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  /**
   * 주거 구역의 집을 다시 맞춘다 (분양 마을 정보). 번지 1..WORLD_LOTS만 메인 맵에 선다.
   * 집이 있는 필지: 외관 + 문패 2줄 + 창문 빛 + 몸체 충돌 + 문 상호작용. 빈 필지: "분양 중" 팻말 + 분양 문의 상호작용.
   * 바뀐 게 없으면 아무것도 하지 않는다.
   */
  setHouses(village: VillageResponse | null, myHouseId: string | null): boolean {
    const houses = (village?.houses ?? []).filter((h) => h.lot >= 1 && h.lot <= WORLD_LOTS);
    const taken = new Set((village?.taken ?? []).filter((l) => l <= WORLD_LOTS));
    const key = `${myHouseId}|${[...taken].join(",")}|${houses.map((h) => `${h.id}:${h.lot}:${h.tier}:${h.name}:${h.ownerName}:${h.score}:${JSON.stringify(h.exterior)}`).join("|")}`;
    if (key === this.houseKey) return false;
    this.houseKey = key;
    for (const o of this.houseObjs) o.destroy();
    for (const l of this.houseLabels) l.destroy();
    this.houseObjs = [];
    this.houseLabels = [];
    this.gridColliders.clear(true, true);
    this.gridLights = [];
    const byLot = new Map(houses.map((h) => [h.lot, h]));
    const items: Interactable[] = [];
    for (const lot of HOUSE_LOTS) {
      const h = byLot.get(lot.lot);
      if (h) this.drawHouse(h, lot, h.id === myHouseId);
      else this.drawEmptyLot(lot, taken.has(lot.lot));
      // 공사 중(정보 없이 자리만 찬) 필지는 상호작용이 없다
      const it = h || !taken.has(lot.lot) ? lotInteractable(lot.lot, h ? { id: h.id, name: h.name } : null) : null;
      if (it) items.push(it);
    }
    this.items = [...this.fixedItems, ...items];
    return true;
  }

  private drawHouse(h: VillageHouse, lot: (typeof HOUSE_LOTS)[number], mine: boolean): void {
    const tex = `village-facade-${h.tier}-${Object.values(h.exterior).join("-")}`;
    if (!this.scene.textures.exists(tex)) addCanvasTexture(this.scene, tex, { canvas: facadeGrid(h.exterior, h.tier).toCanvas() });
    const info = facadeInfo(h.exterior, h.tier);
    const baseY = lot.y + info.body.y + info.body.h;
    const img = this.scene.add.image(lot.x, lot.y + HOUSE_LOT_H - FACADE_H, tex).setOrigin(0, 0).setDepth(baseY);
    this.houseObjs.push(img);
    this.cull(lot.x + HOUSE_LOT_W / 2, baseY, img);
    this.addCollider(this.gridColliders, houseCollider(lot, h.tier));
    for (const l of info.lights) this.gridLights.push({ x: lot.x + l.x, y: lot.y + l.y, scale: l.r / 40, tint: l.color, base: 0.5 });
    const t = houseTitle(h.score);
    const line1 = `${lot.lot}번지 · ${h.name}${mine ? " (내 집)" : ""}`;
    const line2 = `${h.ownerName} · ${t.name} · ${h.score}점`;
    this.atlas.ensure(line1 + line2);
    const top = lot.y + info.body.y - 26;
    const cx = lot.x + HOUSE_LOT_W / 2;
    this.houseLabels.push(
      this.scene.add.bitmapText(cx, top, FONT_KEY, line1, FONT_PX).setOrigin(0.5, 1).setTint(mine ? 0xffe39a : 0xf2ead3).setAlpha(0.92).setDepth(DEPTH.labels - 1),
      this.scene.add.bitmapText(cx, top + 9, FONT_KEY, line2, FONT_PX).setOrigin(0.5, 1).setTint(0xb9b4a4).setAlpha(0.85).setDepth(DEPTH.labels - 1),
    );
  }

  private drawEmptyLot(lot: (typeof HOUSE_LOTS)[number], taken: boolean): void {
    const x = lot.x + HOUSE_LOT_W / 2;
    const y = lot.y + HOUSE_LOT_H - 24;
    const g = this.scene.add.graphics().setDepth(y);
    // 팻말 (말뚝 + 판) — 받침이 y
    g.fillStyle(0x553722).fillRect(x - 1, y - 12, 2, 12);
    g.fillStyle(taken ? 0x5f5d57 : 0x9c6d45).fillRect(x - 11, y - 21, 22, 11);
    g.lineStyle(1, 0x1a1612).strokeRect(x - 11, y - 21, 22, 11);
    g.fillStyle(0x3a2c22).fillRect(x - 7, y - 16, 14, 1);
    const fence = this.scene.add.graphics().setDepth(DEPTH.decal + 2);
    fence.lineStyle(1, 0xd9d4c3, 0.22).strokeRect(lot.x + 10, lot.y + 28, HOUSE_LOT_W - 20, HOUSE_LOT_H - 34);
    this.houseObjs.push(g, fence);
    const text = taken ? `${lot.lot}번지 · 공사 중` : `${lot.lot}번지 · 분양 중`;
    this.atlas.ensure(text);
    this.houseLabels.push(this.scene.add.bitmapText(x, y - 24, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setTint(taken ? 0x908b7b : 0xd9d4c3).setAlpha(0.8).setDepth(DEPTH.labels - 1));
  }

  /** @deprecated 묘비 수에 따라 맵이 늘어나던 시절의 호출. 이제 맵은 고정이라 경계만 다시 맞춘다 */
  setRows(rows?: number, graveCount?: number): void {
    void rows;
    void graveCount;
    this.applyBounds();
  }

  /** 화면 근처 바닥 덩어리만 만들고, 소품 그림은 화면 근처 칸만 보이게 한다 */
  update(view: Phaser.Geom.Rectangle): void {
    const cx0 = Math.max(0, Math.floor((view.x - 64) / CHUNK));
    const cx1 = Math.min(CHUNK_COLS - 1, Math.floor((view.right + 64) / CHUNK));
    const cy0 = Math.max(0, Math.floor((view.y - 64) / CHUNK));
    const cy1 = Math.min(CHUNK_ROWS - 1, Math.floor((view.bottom + 64) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.chunks.has(cy * CHUNK_COLS + cx)) this.makeChunk(cx, cy);

    const a0 = Math.max(0, Math.floor((view.x - CULL_PAD) / CELL));
    const a1 = Math.min(CELL_COLS - 1, Math.floor((view.right + CULL_PAD) / CELL));
    const b0 = Math.max(0, Math.floor((view.y - CULL_PAD) / CELL));
    const b1 = Math.floor((view.bottom + CULL_PAD + 64) / CELL);
    const sig = `${a0},${a1},${b0},${b1}`;
    if (sig === this.lastCull) return;
    this.lastCull = sig;
    const want = new Set<number>();
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) want.add(b * CELL_COLS + a);
    for (const k of this.shownCells) {
      if (want.has(k)) continue;
      for (const o of this.cells.get(k) ?? []) if (o.active) o.setVisible(false);
      this.shownCells.delete(k);
    }
    for (const k of want) {
      if (this.shownCells.has(k)) continue;
      this.shownCells.add(k);
      for (const o of this.cells.get(k) ?? []) if (o.active) o.setVisible(true);
    }
    // 지운 집 그림은 칸 목록에서도 뺀다
    for (const [k, list] of this.cells) {
      const live = list.filter((o) => o.active);
      if (live.length !== list.length) this.cells.set(k, live);
    }
  }

  /** 지금 보이는 소품 그림 수 (?debug·테스트용) */
  get gridImageCount(): number {
    let n = 0;
    for (const k of this.shownCells) n += this.cells.get(k)?.length ?? 0;
    return n;
  }

  private makeChunk(cx: number, cy: number): void {
    const key = `ground2-${cx}-${cy}`;
    if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, { canvas: drawGroundChunk(cx, cy) });
    const img = this.scene.add.image(cx * CHUNK, cy * CHUNK, key).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.chunks.set(cy * CHUNK_COLS + cx, img);
  }

  destroy(): void {
    this.colliders.clear(true, true);
    this.gridColliders.clear(true, true);
    this.furnitureColliders.clear(true, true);
  }
}

/** 구역 이름표 자리 (없으면 구역 위쪽 가운데) */
const ZONE_LABEL_AT: Partial<Record<string, { x: number; y: number }>> = {
  hill: { x: 240, y: 104 },
  graveyard: { x: 304, y: 394 },
  rest: { x: 648, y: 432 },
  plaza: { x: 1024, y: 262 },
  housing: { x: 1660, y: 214 },
  lake: { x: LAKE.x, y: LAKE.y - LAKE.ry + 26 },
  forest: { x: 330, y: 1120 },
  meadow: { x: 1000, y: 1068 },
};
