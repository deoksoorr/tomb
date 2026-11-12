import * as Phaser from "phaser";
import {
  CAMPFIRES,
  FURNITURE,
  HOUSE_LOT_H,
  HOUSE_LOT_W,
  HOUSE_LOTS,
  HOUSING_OFFICE,
  HUNT_GATE,
  HUNT_SIGN,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHOP,
  TILE,
  WORLD_LOTS,
  ZONES,
  FERRY_DOCK,
  GRAVE_AREAS,
  PONDS,
  RIVER_PATH,
  riverYAt,
  playerBounds,
  type Furniture,
} from "@tomb/protocol";
import type { VillageHouse, VillageResponse } from "@/lib/housing/types";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { drawEmptyLot, drawHouseLot, type LotGfx } from "../housing/worldLots";
import { CHUNK, CHUNK_COLS, CHUNK_ROWS, drawGroundChunk } from "../sprites/ground";
import { SHOP_HUT_H } from "../sprites/extras";
import { CAVE_TORCHES, FIRE_FRAMES, OFFICE_H, TORCH_TINT, WP } from "../sprites/worldProps";
import { BIG_FIRE_FRAMES, FENCE_H_W, GRAVE_GATE_H, GY } from "../sprites/graveyardProps";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { FISH_ZONE_LIGHTS } from "./fishZone";
import { ZOO_LIGHTS } from "./zoo/zooLayout";
import {
  allDeckRails,
  allProps,
  ARCH_GATES,
  benchWidth,
  BIG_FIRE_LIGHT,
  CAMPFIRE_LIGHT,
  ELLIPSES,
  FENCE_RUNS,
  fenceCollider,
  gateCenter,
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
/** 14번: 작은 모닥불 그림 배율 (돌 고리·불꽃. 충돌·둘레 자리 좌표는 그대로) */
const CAMPFIRE_ART_SCALE = 1.2;

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
  /** 주거 구역 집 문·빈 필지 */
  private houseItems: Interactable[] = [];
  /** 다른 모듈이 덧붙이는 상호작용 (4·32번 낚시 자리·NPC·채집 지점 — game/world/forage) */
  private extraItems: Interactable[] = [];
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
  private readonly fires = new Map<string, { embers: Phaser.GameObjects.Particles.ParticleEmitter; smoke: Phaser.GameObjects.Particles.ParticleEmitter; big?: boolean }>();
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
    this.addFences();
    for (const r of allDeckRails()) this.addCollider(this.colliders, r); // F13 다리·나루터·잔교 난간
    this.addCampfires();
    this.addWaterShimmer();

    // 유령 잡화점 오두막
    scene.add.image(SHOP.x, SHOP.y + 2, TEX.shopHut).setOrigin(0.5, 1).setDepth(SHOP.y);
    this.addCollider(this.colliders, shopCollider());
    for (const dx of [-14, 14]) this.staticLights.push({ x: SHOP.x + dx, y: SHOP.y - 17, scale: 0.4, tint: 0xffc870, base: 0.5 });
    this.addLabel(SHOP.x, SHOP.y - SHOP_HUT_H + 3, "유령 잡화점", 0xe8dcc0, 1); // 지붕(굴뚝) 바로 위

    // 분양 사무소 (주거 구역 어귀)
    const O = HOUSING_OFFICE;
    scene.add.image(O.x, O.y + 2, WP.office).setOrigin(0.5, 1).setDepth(O.y);
    this.addCollider(this.colliders, officeCollider());
    for (const dx of [-15, 14]) this.staticLights.push({ x: O.x + dx, y: O.y - 16, scale: 0.4, tint: 0xffd98a, base: 0.5 });
    this.addLabel(O.x, O.y - OFFICE_H + 6, "분양 사무소", 0xd8e4ec, 1); // 지붕 바로 위

    // 사냥터 입구 (윗담의 바위 동굴 + 횃불)
    const caveY = HUNT_GATE.y - 8;
    scene.add.image(HUNT_GATE.x, caveY, WP.cave).setOrigin(0.5, 1).setDepth(caveY);
    for (const [dx, dy] of CAVE_TORCHES) this.staticLights.push({ x: HUNT_GATE.x + dx, y: caveY + dy - 1, scale: 0.55, tint: TORCH_TINT, base: 0.8 });
    // 이름은 동굴 입구 안쪽 어둠 위에 + 길가 팻말 (F6: 스폰에서 바로 보이게)
    this.addLabel(HUNT_GATE.x, caveY - 13, "사냥터", 0xf0c8a0, 0.5, 0.95); // 동굴 입구(어두운 굴 안)에 — 위쪽 화면 막대에 가리지 않게
    this.addLabel(HUNT_SIGN.x, HUNT_SIGN.y - 34, "사냥터 입구 ↗", 0xffd6a8, 1, 0.95);

    // 성황당 (나무·돌무더기는 소품)
    this.addLabel(SHRINE_TREE.x - 4, SHRINE_TREE.y - 33, "성황당", 0xe8d0c0, 1); // 천을 묶은 나무 꼭대기 바로 위 (종루와 겹치지 않게)

    // 구역 이름 (은은하게). 묘역 이름은 문 아치 팻말에 (addFences)
    for (const z of ZONES) {
      if (z.id === "river" || z.id === "gate" || z.id === "graveyard" || z.id === "fishing" || z.id === "zoo") continue; // 낚시터·동물원 이름은 아치 현판에
      const at = ZONE_LABEL_AT[z.name] ?? { x: z.x + z.w / 2, y: z.y + 10 };
      this.addLabel(at.x, at.y, z.name, z.id === "pond" ? 0xc8d8e0 : 0xd8ccb0, 1, 0.62);
    }
    this.addLabel(FERRY_DOCK.x, FERRY_DOCK.y - 44, "나루터", 0xd8ccb0, 1, 0.75);
    // 낚시터 등불 (아치·잔교 끝·데크 남쪽 끝). 장식 그림과 "낚시터" 현판은 forage/FishZoneView
    this.staticLights.push(...FISH_ZONE_LIGHTS);
    // 동물원 등불 (정문 석등·아치·분양 노점). 울타리·우리·동물·사육사 그림은 zoo/ZooView
    this.staticLights.push(...ZOO_LIGHTS);

    // 아래 담 (맵 맨 아래 줄은 바닥 타일이 담 면으로 그린다)
    this.applyBounds();
  }

  /** 묘역 철책 (가로 칸·세로 칸·모서리 돌기둥) + 묘역 문 아치와 이름 팻말 (F1·F4) */
  private addFences(): void {
    const scene = this.scene;
    const posts = new Set<string>();
    const post = (x: number, y: number) => {
      const k = `${x},${y}`;
      if (posts.has(k)) return;
      posts.add(k);
      this.cull(x, y, scene.add.image(x, y + 2, GY.fencePost).setOrigin(0.5, 1).setDepth(y + 1));
    };
    for (const f of FENCE_RUNS) {
      this.addCollider(this.colliders, fenceCollider(f));
      if (f.y0 === f.y1) {
        for (let x = f.x0; x < f.x1; x += FENCE_H_W) {
          const w = Math.min(FENCE_H_W, f.x1 - x);
          const img = scene.add.image(x, f.y0 + 1, GY.fenceH).setOrigin(0, 1).setDepth(f.y0);
          if (w < FENCE_H_W) img.setCrop(0, 0, w, img.height);
          this.cull(x + w / 2, f.y0, img);
        }
      } else {
        for (let y = f.y0 + 8; y <= f.y1; y += 8) this.cull(f.x0, y, scene.add.image(f.x0, y + 1, GY.fenceV).setOrigin(0.5, 1).setDepth(y));
      }
      post(f.x0, f.y0);
      post(f.x1, f.y1);
    }
    for (const g of ARCH_GATES) {
      const c = gateCenter(g);
      this.cull(c.x, c.y, scene.add.image(c.x, c.y + 2, GY.gate).setOrigin(0.5, 1).setDepth(c.y + 2));
      const area = GRAVE_AREAS.find((a) => a.id === g.area)!;
      this.addLabel(c.x, c.y - GRAVE_GATE_H + 2, area.name, 0xe6dcc8, 1, 0.92);
    }
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
      // ── F1 묘지 마을 (sprites/graveyardProps.ts) ──
      case "willow":
        return v % 2 ? GY.willow1 : GY.willow0;
      case "oldGrave":
        return [GY.old0, GY.old1, GY.old2, GY.old3, GY.old4][v % 5];
      case "candle":
        return v % 2 ? GY.candle1 : GY.candle0;
      case "crypt":
        return GY.crypt;
      case "mist":
        return v % 2 ? GY.mist1 : GY.mist0;
      case "sign":
        return GY.sign;
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
    if (p.kind === "mist") {
      // 땅안개: 바닥에 깔려 천천히 흘러가며 옅어졌다 짙어진다 (묘비 받침을 살짝 덮는다)
      const img = this.scene.add.image(p.x, p.y, this.propTexture(p)).setOrigin(0.5, 0.5).setDepth(p.y + 6).setAlpha(0.7).setScale(1.25);
      if (!this.reduced)
        this.scene.tweens.add({ targets: img, x: p.x + 14, alpha: 0.35, duration: 5200 + (p.x % 7) * 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
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

  /** 덧붙이는 상호작용 대상을 통째로 바꾼다 (낚시·채집: 피어 있는 지점이 바뀔 때마다) */
  setExtraItems(items: Interactable[]): void {
    this.extraItems = items;
    this.items = [...this.fixedItems, ...this.houseItems, ...this.extraItems];
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
    if (!scene.anims.exists("fx-bigfire-burn")) {
      scene.anims.create({
        key: "fx-bigfire-burn",
        frames: Array.from({ length: BIG_FIRE_FRAMES }, (_, i) => ({ key: GY.bigFire, frame: i })),
        frameRate: this.reduced ? 4 : 11,
        repeat: -1,
      });
    }
    for (const c of CAMPFIRES) {
      if (c.big) {
        this.addBigFire(c);
        continue;
      }
      // 14번: 그림만 조금 크게 (충돌·둘레 자리 좌표는 protocol 그대로)
      scene.add.image(c.x, c.y + 1, WP.fireRing).setOrigin(0.5, 0.5).setDepth(DEPTH.decal + 2).setScale(CAMPFIRE_ART_SCALE);
      const fire = scene.add.sprite(c.x, c.y + 2, WP.fire, 0).setOrigin(0.5, 1).setDepth(c.y).setScale(CAMPFIRE_ART_SCALE);
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

  /** 광장의 아주 큰 모닥불 (F1): 넓은 돌 화덕 + 키 큰 불꽃 두 겹 + 많은 불티·연기 + 광장을 덮는 따뜻한 빛 */
  private addBigFire(c: (typeof CAMPFIRES)[number]): void {
    const scene = this.scene;
    // 14번: 큰 불도 조금 더 크게 (화덕 1.15→1.25, 불꽃 1.1/1.35→1.2/1.45 — 충돌·둘레 자리는 그대로)
    scene.add.image(c.x, c.y + 2, GY.bigRing).setOrigin(0.5, 0.5).setDepth(DEPTH.decal + 2).setScale(1.25);
    const back = scene.add.sprite(c.x - 8, c.y - 2, GY.bigFire, 0).setOrigin(0.5, 1).setDepth(c.y - 1).setScale(1.2).setAlpha(0.85);
    back.play({ key: "fx-bigfire-burn", startFrame: 3 });
    const fire = scene.add.sprite(c.x + 2, c.y + 5, GY.bigFire, 0).setOrigin(0.5, 1).setDepth(c.y).setScale(1.45);
    fire.play({ key: "fx-bigfire-burn", startFrame: 0 });
    this.addCollider(this.colliders, campfireCollider(c));
    this.staticLights.push({ x: c.x, y: c.y + BIG_FIRE_LIGHT.dy, scale: BIG_FIRE_LIGHT.scale, tint: BIG_FIRE_LIGHT.tint, base: BIG_FIRE_LIGHT.base });
    this.staticLights.push({ x: c.x, y: c.y - 30, scale: 1.4, tint: 0xffd070, base: 0.9 });
    const embers = scene.add
      .particles(c.x, c.y - 34, TEX.spark, {
        lifespan: { min: 1200, max: 2400 },
        speedX: { min: -14, max: 14 },
        speedY: { min: -46, max: -22 },
        accelerationX: { min: -8, max: 8 },
        scale: { start: 0.55, end: 0.08 },
        alpha: { start: 1, end: 0 },
        tint: [0xffd060, 0xff9a40, 0xff6a2a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: this.reduced ? 320 : 70,
        x: { min: -12, max: 12 },
      })
      .setDepth(DEPTH.lights + 3);
    const smoke = scene.add
      .particles(c.x, c.y - 66, WP.smoke, {
        lifespan: { min: 3000, max: 4400 },
        speedX: { min: -4, max: 7 },
        speedY: { min: -16, max: -9 },
        scale: { start: 0.6, end: 2.4 },
        alpha: { start: 0.2, end: 0 },
        frequency: this.reduced ? 1200 : 420,
      })
      .setDepth(c.y + 60);
    this.fires.set(c.id, { embers, smoke, big: true });
  }

  /** 불멍 중인 모닥불은 불티를 더 많이 (null이면 모두 평소대로) */
  boostCampfire(id: string | null): void {
    for (const [k, f] of this.fires) {
      const on = k === id;
      f.embers.frequency = f.big ? (on ? (this.reduced ? 200 : 40) : this.reduced ? 320 : 70) : on ? (this.reduced ? 260 : 60) : this.reduced ? 520 : 180;
    }
  }

  /** 강·호수 물결 반짝임: 강은 하류 쪽으로 천천히 흐르고, 호수는 제자리에서 반짝인다 */
  private addWaterShimmer(): void {
    const spots: [number, number, boolean][] = [];
    const riverEnd = RIVER_PATH[RIVER_PATH.length - 3].x;
    for (let x = 60; x < riverEnd; x += 84) spots.push([x, Math.round(riverYAt(x)) + ((x * 7) % 11) - 5, true]);
    // 호수·연못: 크기에 맞춰 몇 개씩 제자리에서
    for (const e of ELLIPSES) {
      const n = Math.max(2, Math.round((e.rx * e.ry) / 1800));
      for (let i = 0; i < n; i++) spots.push([Math.round(e.x - e.rx * 0.6 + ((i * 53) % Math.round(e.rx * 1.2))), Math.round(e.y - e.ry * 0.5 + ((i * 37) % Math.round(e.ry))), false]);
    }
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
    this.houseItems = items;
    this.items = [...this.fixedItems, ...this.houseItems, ...this.extraItems];
    return true;
  }

  // 필지 그림은 game/housing/worldLots.ts (F2: 터 크기별 집·마당·울타리·밤 창 불빛·굴뚝 연기)
  private drawHouse(h: VillageHouse, lot: (typeof HOUSE_LOTS)[number], mine: boolean): void {
    this.addLotGfx(drawHouseLot(this.scene, this.atlas, lot, { w: HOUSE_LOT_W, h: HOUSE_LOT_H }, h, mine, { reduced: this.reduced }), lot);
    this.addCollider(this.gridColliders, houseCollider(lot, h.tier));
  }

  private drawEmptyLot(lot: (typeof HOUSE_LOTS)[number], taken: boolean): void {
    this.addLotGfx(drawEmptyLot(this.scene, this.atlas, lot, { w: HOUSE_LOT_W, h: HOUSE_LOT_H }, taken, { reduced: this.reduced }), lot);
  }

  private addLotGfx(d: LotGfx, lot: (typeof HOUSE_LOTS)[number]): void {
    this.houseObjs.push(...d.objs);
    for (const img of d.images) this.cull(lot.x + HOUSE_LOT_W / 2, lot.y + HOUSE_LOT_H, img);
    this.houseLabels.push(...d.labels);
    this.gridLights.push(...d.lights);
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
  "별 보기 언덕": { x: 150, y: 92 },
  "모닥불 광장": { x: 720, y: 252 },
  "주거 구역": { x: 1200, y: 214 },
  "호수": { x: 1236, y: 962 },
  "달빛 연못": { x: PONDS[0].x, y: PONDS[0].y + PONDS[0].ry + 26 },
  "까마귀 연못": { x: PONDS[1].x - 40, y: PONDS[1].y - 8 },
  "안개 연못": { x: PONDS[2].x, y: PONDS[2].y + 6 },
  "안개 숲": { x: 500, y: 800 },
  "호박밭": { x: 990, y: 1000 },
};
