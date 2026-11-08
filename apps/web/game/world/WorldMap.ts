import * as Phaser from "phaser";
import { ALTAR_NAME, FURNITURE, MAP_WIDTH, SHOP, TILE, mapHeight, playerBounds, type Furniture } from "@tomb/protocol";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { CHUNK_H, drawGroundChunk } from "../sprites/ground";
import { ALTAR_CANDLES, LANTERN_LIGHT_DY } from "../sprites/props";
import { SHOP_HUT_H } from "../sprites/extras";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import {
  benchWidth,
  furnitureCollider,
  gridProps,
  pondColliders,
  POND,
  propCollider,
  shopCollider,
  UPPER_PROPS,
  type PropDef,
  type Rect,
} from "./layout";

// 맵: 바닥(덩어리 텍스처, 화면 근처만 생성), 담장, 정문, 소품, 가구, 유령 잡화점 오두막, 충돌 박스.
// 묘비 수에 따라 아래로 늘어나므로 setRows()로 높이·바닥 담장·격자 소품·물리 경계를 다시 맞춘다.

export type LightSpot = { x: number; y: number; scale: number; tint: number; base: number };

const KEEP_CHUNKS = 10;


export class WorldMap {
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly gridColliders: Phaser.Physics.Arcade.StaticGroup;
  private readonly chunks = new Map<number, Phaser.GameObjects.Image>();
  private chunkOrder: number[] = [];
  private gridObjects: Phaser.GameObjects.Image[] = [];
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

    // 정문 (윗담 가운데)
    scene.add.image(MAP_WIDTH / 2, 2 * TILE + 2, TEX.gate).setOrigin(0.5, 1).setDepth(2 * TILE);

    for (const p of UPPER_PROPS) this.addProp(p, this.colliders, null);
    for (const f of FURNITURE) this.addFurniture(f);
    for (const r of pondColliders()) this.addCollider(this.colliders, r);
    this.addPondShimmer();

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
    switch (p.kind) {
      case "tree":
        return p.variant ? TEX.tree1 : TEX.tree0;
      case "deadTree":
        return p.variant ? TEX.dead1 : TEX.dead0;
      case "lantern":
        return TEX.lantern;
      case "table":
        return TEX.table;
      case "altar":
        return TEX.altar;
    }
  }

  private addProp(p: PropDef, group: Phaser.Physics.Arcade.StaticGroup, track: Phaser.GameObjects.Image[] | null): void {
    // 텍스처 맨 아래 줄은 그림자 → 받침(y)이 그 위에 오도록 1px 내린다
    const img = this.scene.add.image(p.x, p.y + 1, this.propTexture(p)).setOrigin(0.5, 1).setDepth(p.y);
    track?.push(img);
    const c = propCollider(p);
    if (c) this.addCollider(group, c);
    if (p.kind === "lantern") {
      const spot = { x: p.x, y: p.y + LANTERN_LIGHT_DY, scale: 0.75, tint: 0xffc068, base: 0.7 };
      if (track) this.gridLights.push(spot);
      else this.staticLights.push(spot);
    }
  }

  private addFurniture(f: Furniture): void {
    let key: string;
    if (f.kind === "bench") {
      const w = benchWidth(f);
      key = w >= 72 ? TEX.bench4 : w >= 56 ? TEX.bench3 : TEX.bench2;
    }
    else key = f.facing === 1 ? TEX.chairLeft : f.facing === 2 ? TEX.chairRight : TEX.chairDown;
    this.scene.add.image(f.x, f.y + 2, key).setOrigin(0.5, 1).setDepth(f.y);
    this.addCollider(this.colliders, furnitureCollider(f));
  }

  private addPondShimmer(): void {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (let i = 0; i < 3; i++) {
      const s = this.scene.add
        .image(POND.x - 12 + i * 11, POND.y - 5 + (i % 2) * 6, TEX.shimmer)
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

    for (const o of this.gridObjects) o.destroy();
    this.gridObjects = [];
    this.gridLights = [];
    this.gridColliders.clear(true, true);
    for (const p of gridProps(rows)) if (p.y < this.height - TILE) this.addProp(p, this.gridColliders, this.gridObjects);

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
      const top = view.y - 48;
      const bottom = view.bottom + 48;
      for (const o of this.gridObjects) o.setVisible(o.y >= top && o.y - o.height <= bottom);
    }
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
  }
}
