import * as Phaser from "phaser";
import { ALTAR_NAME, FURNITURE, GRID_DY, GRID_Y0, HOUSING_OFFICE, HUNT_GATE, MAP_WIDTH, SHOP, SHRINE, TILE, mapHeight, playerBounds, type Furniture } from "@tomb/protocol";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { CHUNK_H, drawGroundChunk } from "../sprites/ground";
import { ALTAR_CANDLES } from "../sprites/props";
import { SHOP_HUT_H } from "../sprites/extras";
import { CAVE_H, CAVE_TORCHES, OFFICE_H, TORCH_TINT, WP } from "../sprites/worldProps";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import {
  benchWidth,
  BRIDGE,
  furnitureCollider,
  gridProps,
  interactables,
  officeCollider,
  POND,
  POOL,
  propCollider,
  propLight,
  shopCollider,
  SHRINE_TREE,
  UPPER_PROPS,
  type Interactable,
  type PropDef,
  type Rect,
} from "./layout";

// 맵: 바닥(덩어리 텍스처, 화면 근처만 생성), 담장, 정문, 소품, 가구, 유령 잡화점·분양 사무소 오두막, 사냥터 동굴, 성황당, 충돌 박스.
// 묘비 수에 따라 아래로 늘어나므로 setRows()로 높이·바닥 담장·격자 소품·물리 경계·상호작용 대상을 다시 맞춘다.
// 격자 구역 소품은 충돌·빛·상호작용은 모두 미리 만들고, 그림은 화면 근처 띠(BAND_ROWS행)만 만들어 둔다 (수백 행에서도 비용이 일정).

export type LightSpot = { x: number; y: number; scale: number; tint: number; base: number };

const KEEP_CHUNKS = 10;
/** 격자 소품 그림을 만드는 단위 (행) */
const BAND_ROWS = 6;
const BAND_H = BAND_ROWS * GRID_DY;
/** 납작한 바닥 소품은 바닥 장식 높이에 (아바타·묘비가 항상 위로) */
const FLAT = new Set<PropDef["kind"]>(["flowers", "mushroom"]);

function bandOf(y: number): number {
  return Math.floor((y - GRID_Y0) / BAND_H);
}


export class WorldMap {
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly gridColliders: Phaser.Physics.Arcade.StaticGroup;
  /** 의자·벤치 (점프 중에는 넘어갈 수 있도록 따로 둔다) */
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  private readonly chunks = new Map<number, Phaser.GameObjects.Image>();
  private chunkOrder: number[] = [];
  /** 격자 소품: 띠 번호 → 정의 / 지금 만들어 둔 그림 */
  private gridBands = new Map<number, PropDef[]>();
  private readonly liveBands = new Map<number, Phaser.GameObjects.Image[]>();
  private items: Interactable[] = interactables(0);
  private readonly bottomWall: Phaser.GameObjects.TileSprite;
  height = mapHeight(0);
  private rows = -1;
  /** 정적 빛 (석등·제단 촛불·오두막 창) — Atmosphere가 그린다 */
  readonly staticLights: LightSpot[] = [];
  gridLights: LightSpot[] = [];
  /** 격자 소품 컬링용 */
  private lastViewY = NaN;
  private lastViewH = NaN;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    atlas: GlyphAtlas,
  ) {
    this.colliders = scene.physics.add.staticGroup();
    this.gridColliders = scene.physics.add.staticGroup();
    this.furnitureColliders = scene.physics.add.staticGroup();

    // 정문 (윗담 가운데)
    scene.add.image(MAP_WIDTH / 2, 2 * TILE + 2, TEX.gate).setOrigin(0.5, 1).setDepth(2 * TILE);

    for (const p of UPPER_PROPS) {
      this.addPropImage(p);
      this.addPropBody(p, this.colliders, this.staticLights);
    }
    for (const f of FURNITURE) this.addFurniture(f);
    this.addPondShimmer();
    // 시내 위 작은 다리 (바닥 높이)
    scene.add.image(BRIDGE.x, BRIDGE.y, WP.bridge).setOrigin(0.5, 1).setDepth(DEPTH.decal + 2);

    // 제단 촛불 + "부활 대기석" 글씨
    const altar = UPPER_PROPS.find((p) => p.kind === "altar");
    if (altar) {
      for (const [dx, dy] of ALTAR_CANDLES) {
        scene.add.sprite(altar.x + dx, altar.y + dy + 6, TEX.candle, 0).setOrigin(0.5, 1).setDepth(altar.y + 1).play("fx-candle-flicker");
        this.staticLights.push({ x: altar.x + dx, y: altar.y + dy - 1, scale: 0.4, tint: 0xffc870, base: 0.55 });
      }
      this.addLabel(atlas, altar.x, altar.y + 4, ALTAR_NAME, 0xcfc6a8, 0);
    }

    // 유령 잡화점 오두막
    scene.add.image(SHOP.x, SHOP.y + 2, TEX.shopHut).setOrigin(0.5, 1).setDepth(SHOP.y);
    this.addCollider(this.colliders, shopCollider());
    for (const dx of [-14, 14]) this.staticLights.push({ x: SHOP.x + dx, y: SHOP.y - 17, scale: 0.4, tint: 0xffc870, base: 0.5 });
    this.addLabel(atlas, SHOP.x, SHOP.y - SHOP_HUT_H - 2, "유령 잡화점", 0xe8dcc0, 1);

    // 분양 사무소 (오른쪽 정원, 잡화점과 대칭)
    const O = HOUSING_OFFICE;
    scene.add.image(O.x, O.y + 2, WP.office).setOrigin(0.5, 1).setDepth(O.y);
    this.addCollider(this.colliders, officeCollider());
    for (const dx of [-15, 14]) this.staticLights.push({ x: O.x + dx, y: O.y - 16, scale: 0.4, tint: 0xffd98a, base: 0.5 });
    this.addLabel(atlas, O.x, O.y - OFFICE_H - 2, "분양 사무소", 0xd8e4ec, 1);

    // 사냥터 입구 (윗담의 바위 동굴 + 횃불)
    const caveY = HUNT_GATE.y - 8;
    scene.add.image(HUNT_GATE.x, caveY, WP.cave).setOrigin(0.5, 1).setDepth(caveY);
    for (const [dx, dy] of CAVE_TORCHES) this.staticLights.push({ x: HUNT_GATE.x + dx, y: caveY + dy - 1, scale: 0.55, tint: TORCH_TINT, base: 0.8 });
    // 이름은 동굴 왼쪽 담 위에 (동굴 위는 화면 밖에 걸린다)
    this.addLabel(atlas, HUNT_GATE.x - 42, caveY - CAVE_H / 2 + 4, "사냥터", 0xf0c8a0, 0.5);

    // 성황당 (나무·돌무더기는 UPPER_PROPS)
    this.addLabel(atlas, SHRINE.x, SHRINE_TREE.y - 42, "성황당", 0xe8d0c0, 1);

    this.bottomWall = scene.add.tileSprite(MAP_WIDTH / 2, this.height, MAP_WIDTH, TILE, TEX.wallFace).setOrigin(0.5, 1);
  }

  private addLabel(atlas: GlyphAtlas, x: number, y: number, text: string, tint: number, originY: number): void {
    atlas.ensure(text);
    this.labels.push(
      this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(0.88).setDepth(DEPTH.labels - 1),
    );
  }

  /** 1/zoom 배율 글씨 (제단·잡화점 이름) */
  scaleLabels(s: number): void {
    for (const l of this.labels) if (l.scaleX !== s) l.setScale(s);
  }

  private addCollider(group: Phaser.Physics.Arcade.StaticGroup, r: Rect): void {
    const z = this.scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    z.removeFromDisplayList();
    group.add(z);
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
      case "blossom":
        return v % 2 ? WP.blossom1 : WP.blossom0;
      case "pine":
        return v % 2 ? WP.pine1 : WP.pine0;
      case "bush":
        return v % 3 === 2 ? WP.bush2 : v % 3 ? WP.bush1 : WP.bush0;
      case "lantern":
        return TEX.lantern;
      case "table":
        return TEX.table;
      case "altar":
        return TEX.altar;
      case "well":
        return WP.well;
      case "swing":
        return WP.swing;
      case "bell":
        return WP.bell;
      case "cairn":
        return v % 2 ? WP.cairn1 : WP.cairn0;
      case "flowers":
        return v % 3 === 2 ? WP.flowers2 : v % 3 ? WP.flowers1 : WP.flowers0;
      case "mushroom":
        return v % 2 ? WP.mushroom1 : WP.mushroom0;
      case "scarecrow":
        return WP.scarecrow;
      case "reeds":
        return v % 2 ? WP.reeds1 : WP.reeds0;
      case "jar":
        return WP.jar;
      case "shrineTree":
        return WP.shrineTree;
    }
  }

  /** 소품 그림 (텍스처 맨 아래 줄은 그림자 → 받침(y)이 그 위에 오도록 1px 내린다) */
  private addPropImage(p: PropDef): Phaser.GameObjects.Image {
    return this.scene.add
      .image(p.x, p.y + 1, this.propTexture(p))
      .setOrigin(0.5, 1)
      .setDepth(FLAT.has(p.kind) ? DEPTH.decal + 3 : p.y);
  }

  /** 소품 충돌·빛 */
  private addPropBody(p: PropDef, group: Phaser.Physics.Arcade.StaticGroup, lights: LightSpot[]): void {
    const c = propCollider(p);
    if (c) this.addCollider(group, c);
    const l = propLight(p);
    if (l) lights.push({ x: p.x, y: p.y + l.dy, scale: l.scale, tint: l.tint, base: l.base });
  }

  /** 상호작용 대상 (위쪽 고정 구역 + 격자 구역). setRows마다 갱신 */
  get interactables(): readonly Interactable[] {
    return this.items;
  }

  private addFurniture(f: Furniture): void {
    let key: string;
    if (f.kind === "bench") {
      const w = benchWidth(f);
      key = w >= 72 ? TEX.bench4 : w >= 56 ? TEX.bench3 : TEX.bench2;
    }
    else key = f.facing === 1 ? TEX.chairLeft : f.facing === 2 ? TEX.chairRight : TEX.chairDown;
    this.scene.add.image(f.x, f.y + 2, key).setOrigin(0.5, 1).setDepth(f.y);
    this.addCollider(this.furnitureColliders, furnitureCollider(f));
  }

  private addPondShimmer(): void {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const spots = [0, 1, 2].map((i) => [POND.x - 12 + i * 11, POND.y - 5 + (i % 2) * 6]);
    spots.push([POOL.x - 4, POOL.y - 2], [POOL.x + 58, POOL.y + 1]);
    for (let i = 0; i < spots.length; i++) {
      const s = this.scene.add
        .image(spots[i][0], spots[i][1], TEX.shimmer)
        .setDepth(DEPTH.decal + 1)
        .setAlpha(0.5);
      if (!reduced)
        this.scene.tweens.add({ targets: s, alpha: 0.05, x: s.x + 3, duration: 1600 + i * 400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  /** 묘비 행 수가 바뀌면 맵 높이·경계·격자 소품을 다시 맞춘다 */
  setRows(rows: number, graveCount: number): void {
    if (rows === this.rows) return;
    this.rows = rows;
    this.height = mapHeight(graveCount);
    this.bottomWall.setY(this.height).setDepth(this.height);

    for (const imgs of this.liveBands.values()) for (const o of imgs) o.destroy();
    this.liveBands.clear();
    this.gridBands.clear();
    this.gridLights = [];
    this.gridColliders.clear(true, true);
    for (const p of gridProps(rows)) {
      if (p.y >= this.height - TILE) continue;
      this.addPropBody(p, this.gridColliders, this.gridLights);
      const k = bandOf(p.y);
      let list = this.gridBands.get(k);
      if (!list) this.gridBands.set(k, (list = []));
      list.push(p);
    }
    this.items = interactables(rows).filter((i) => i.y < this.height - TILE);

    const b = playerBounds(graveCount);
    this.scene.physics.world.setBounds(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    this.lastViewY = NaN;
  }

  /** 화면 근처 바닥 덩어리만 만들고, 격자 소품은 화면 밖이면 숨긴다 */
  update(view: Phaser.Geom.Rectangle): void {
    const first = Math.max(0, Math.floor((view.y - 64) / CHUNK_H));
    const last = Math.floor((Math.min(view.bottom, this.height) + 64) / CHUNK_H);
    for (let i = first; i <= last; i++) {
      if (!this.chunks.has(i)) this.makeChunk(i);
      else if (this.chunkOrder[this.chunkOrder.length - 1] !== i) {
        // LRU: 지금 보이는 덩어리는 뒤로 보내 버려지지 않게
        this.chunkOrder.splice(this.chunkOrder.indexOf(i), 1);
        this.chunkOrder.push(i);
      }
    }

    if (view.y !== this.lastViewY || view.height !== this.lastViewH) {
      this.lastViewY = view.y;
      this.lastViewH = view.height;
      // 화면 근처 띠만 그림을 만들고, 멀어진 띠는 버린다
      const b0 = bandOf(view.y - 64);
      const b1 = bandOf(view.bottom + 64);
      for (const [k, imgs] of this.liveBands) {
        if (k >= b0 - 1 && k <= b1 + 1) continue;
        for (const o of imgs) o.destroy();
        this.liveBands.delete(k);
      }
      for (let k = b0; k <= b1; k++) {
        if (this.liveBands.has(k)) continue;
        const defs = this.gridBands.get(k);
        if (defs) this.liveBands.set(k, defs.map((p) => this.addPropImage(p)));
      }
    }
  }

  /** 지금 만들어 둔 격자 소품 그림 수 (?debug·테스트용) */
  get gridImageCount(): number {
    let n = 0;
    for (const imgs of this.liveBands.values()) n += imgs.length;
    return n;
  }

  private chunkKey(i: number): string {
    return `ground-${i}`;
  }

  private makeChunk(i: number): void {
    const key = this.chunkKey(i);
    if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, { canvas: drawGroundChunk(i) });
    const img = this.scene.add.image(0, i * CHUNK_H, key).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.chunks.set(i, img);
    this.chunkOrder.push(i);
    // 오래된 덩어리는 버려서 GPU 메모리를 묶어 둔다
    while (this.chunkOrder.length > KEEP_CHUNKS) {
      const old = this.chunkOrder.shift()!;
      this.chunks.get(old)?.destroy();
      this.chunks.delete(old);
      this.scene.textures.remove(this.chunkKey(old));
    }
  }

  destroy(): void {
    this.colliders.clear(true, true);
    this.gridColliders.clear(true, true);
    this.furnitureColliders.clear(true, true);
    for (const imgs of this.liveBands.values()) for (const o of imgs) o.destroy();
    this.liveBands.clear();
  }
}
