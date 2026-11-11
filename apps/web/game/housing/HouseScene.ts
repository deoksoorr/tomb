import * as Phaser from "phaser";
import { DIR } from "@tomb/protocol";
import { furnitureById, tierById, type PlotTier } from "@/lib/housing/catalog";
import { buildOccupancy, findFreeSpot, footprint, gateTiles, newUid } from "@/lib/housing/layout";
import type { HouseLayout, Placed, PublicHouse } from "@/lib/housing/types";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import type { MoveInput } from "../logic/movement";
import { RoomPresence } from "../net/RoomPresence";
import type { NetPose } from "../net/sendThrottle";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { Lighting, playerLightRadius } from "../world/Lighting";
import type { LightSpot } from "../world/WorldMap";
import { artUp, floorGrid, furnitureGrid, WALL_H, wallGrid } from "./art";
import type { HouseEditState, HouseTool } from "./events";

// 개인 묘역(하우징) 씬. 혼자 들어오는 공간이다 (방문자끼리 서로 보이지 않는다).
//  - 월드와 같은 밤 분위기(Atmosphere·Lighting)를 그대로 쓴다. 석등·촛대 같은 물건은 빛을 낸다.
//  - 아래 문 밖에서 시작하고, 문 밖으로 걸어 내려가면 월드(분양 사무소 앞)로 돌아간다.
//  - 주인은 편집 모드에서 물건을 끌어 옮기고(마우스·터치), 방향키로 한 칸씩 옮기고, R 돌리기, Delete 치우기.
//    편집 결과는 house:state로 UI에 알리고, 저장은 UI가 API로 한다 (저장되면 house:data로 다시 받는다).

export type HouseSceneData = {
  house: PublicHouse;
  mine: boolean;
  atlas: GlyphAtlas;
  input: InputHub;
  color: string;
  name: string;
  look: readonly string[];
  /** 내 몸 모양 (AVATAR_BODIES id). 없으면 hood */
  body?: string;
  reduced: boolean;
  /** 편집 모드로 시작 (저장 뒤 다시 그릴 때 유지) */
  editing?: boolean;
  onExit(): void;
};

const T = 16;
/** 바깥 여백(칸): 좌우 1칸 + 담장 1칸, 위쪽은 이름표 자리, 아래는 문 밖 길 3칸 */
const SIDE = 2;
const TOP = 2.5;
const BELOW = 3;
const NO_SEATS: SeatRequester = { sit: () => undefined, stand: () => undefined };
const ZOOM_MIN = 1.5;
const NEAR_SIGN = 22;

type ItemView = { p: Placed; img: Phaser.GameObjects.Image };

export class HouseScene extends Phaser.Scene {
  private data0!: HouseSceneData;
  private tier!: PlotTier;
  private ox = 0;
  private oy = 0;
  private W = 0;
  private H = 0;
  private player!: Player;
  private atmos!: Atmosphere;
  private lighting!: Lighting;
  private playerGlow!: Phaser.GameObjects.Image;
  private ground: Phaser.GameObjects.Image | null = null;
  private walls: Phaser.GameObjects.GameObject[] = [];
  private wallBodies!: Phaser.Physics.Arcade.StaticGroup;
  private itemBodies!: Phaser.Physics.Arcade.StaticGroup;
  private views = new Map<string, ItemView>();
  private glowSpots: { x: number; y: number; r: number; color: number }[] = [];
  private grid!: Phaser.GameObjects.Graphics;
  private sel!: Phaser.GameObjects.Graphics;
  private prompt!: Phaser.GameObjects.BitmapText;
  private titleLabel!: Phaser.GameObjects.BitmapText;
  private sign = { x: 0, y: 0 };
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  /** 같은 방(마을·이 집) 사람들 */
  private presence: RoomPresence | null = null;
  private readonly pose: NetPose = { x: 0, y: 0, state: 0, dir: 0 };
  private presenceAt = 0;
  private presenceKey = "";
  private readonly view = new Phaser.Geom.Rectangle();
  private exiting = false;
  private armed = false;

  // ── 편집 ──
  private editing = false;
  private work: HouseLayout = { items: [], floor: "", wall: "" };
  private baseline = "";
  private selected: string | null = null;
  private drag: { u: string; offX: number; offY: number; from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  private pan: { sx: number; sy: number; cx: number; cy: number } | null = null;
  private unsubs: (() => void)[] = [];

  constructor() {
    super("house");
  }

  init(data: HouseSceneData): void {
    this.data0 = data;
    this.tier = tierById(data.house.tier) ?? tierById("small")!;
    this.exiting = false;
    this.armed = false;
    this.editing = false;
    this.selected = null;
    this.drag = null;
    this.pan = null;
    this.views = new Map();
    this.walls = [];
    this.ground = null;
    this.glowSpots = [];
    this.unsubs = [];
    this.work = structuredClone(data.house.layout);
    this.baseline = JSON.stringify(this.work);
  }

  create(): void {
    const { atlas, house } = this.data0;
    const t = this.tier;
    this.cameras.main.setBackgroundColor("#10120e");
    this.ox = SIDE * T;
    this.oy = Math.round(TOP * T);
    this.W = (t.w + SIDE * 2) * T;
    this.H = this.oy + (t.h + 1) * T + BELOW * T;

    this.wallBodies = this.physics.add.staticGroup();
    this.itemBodies = this.physics.add.staticGroup();
    this.drawGround();
    this.drawWalls();
    this.drawItems();

    // 이름표 (위 담장 위) + 방명록 팻말 (문 밖 왼쪽)
    const title = `${house.name}`;
    atlas.ensure(title + "E · 방명록 보기" + house.ownerName + "의 묘역");
    this.titleLabel = this.add
      .bitmapText(this.W / 2, this.oy - T - 4, FONT_KEY, title, FONT_PX)
      .setOrigin(0.5, 1)
      .setTint(0xf2ead3)
      .setDepth(DEPTH.labels);
    const [g0] = gateTiles(t);
    this.sign = { x: this.ox + g0.x * T - 14, y: this.oy + (t.h + 1) * T + 14 };
    this.add.rectangle(this.sign.x, this.sign.y - 6, 2, 12, 0x553722).setDepth(this.sign.y);
    this.add.rectangle(this.sign.x, this.sign.y - 13, 14, 9, 0x9c6d45).setDepth(this.sign.y + 0.1).setStrokeStyle(1, 0x1a1612);
    this.add.rectangle(this.sign.x, this.sign.y - 14, 8, 1, 0x3a2c22).setDepth(this.sign.y + 0.2);
    this.add.rectangle(this.sign.x, this.sign.y - 11, 6, 1, 0x3a2c22).setDepth(this.sign.y + 0.2);
    this.prompt = this.add
      .bitmapText(this.sign.x, this.sign.y - 20, FONT_KEY, "E · 방명록 보기", FONT_PX)
      .setOrigin(0.5, 1)
      .setTint(0xffe39a)
      .setDepth(DEPTH.labels)
      .setVisible(false);

    // 문 밖에서 시작
    const sx = this.ox + (t.w / 2) * T;
    const sy = this.oy + (t.h + 1) * T + 22;
    this.player = new Player(this, atlas, sx, sy, this.data0.color, this.data0.name, this.data0.body);
    this.player.view.setLook(this.data0.look);
    this.presenceKey = "";
    this.presence = new RoomPresence(this, {
      atlas: this.data0.atlas,
      room: `house:${this.data0.house.id}`,
      me: this.player.view,
      getPose: () => this.player.netPose(this.pose),
    });
    this.player.dir = DIR.up;
    this.physics.add.collider(this.player.sprite, this.wallBodies);
    this.physics.add.collider(this.player.sprite, this.itemBodies);
    this.physics.world.setBounds(T, this.oy - T, this.W - 2 * T, this.H - (this.oy - T));

    // 집 안: 비·눈·낙엽은 그리지 않고 빗소리·천둥은 벽 너머로 먹먹하게
    this.atmos = new Atmosphere(this, this.data0.reduced, window.location.search, { indoor: true });
    this.lighting = new Lighting(this);
    this.playerGlow = this.add.image(sx, sy, "fx-glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a8).setDepth(DEPTH.lights);
    this.applyLights();

    this.grid = this.add.graphics().setDepth(DEPTH.labels - 2).setVisible(false);
    this.sel = this.add.graphics().setDepth(DEPTH.labels - 1);

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.fitCamera();
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 10);

    this.data0.input.setHandler((a) => this.onAction(a));
    const canvas = this.game.canvas;
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey, true);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.unsubs.push(
      bridge.on("house:edit", ({ on, revert }) => this.setEditing(on, !!revert)),
      bridge.on("house:tool", (t2) => this.tool(t2)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener("pointerdown", this.onDown);
      window.removeEventListener("pointermove", this.onMove);
      window.removeEventListener("pointerup", this.onUp);
      window.removeEventListener("keydown", this.onKey, true);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      for (const u of this.unsubs.splice(0)) u();
      this.atmos.destroy();
      this.lighting.destroy();
      this.presence?.destroy();
      this.presence = null;
      this.player.destroy();
    });

    if (this.data0.editing && this.data0.mine) this.setEditing(true, false);
    else this.emitState();
  }

  // ── 좌표 ──

  private tileX = (x: number) => this.ox + x * T;
  private tileY = (y: number) => this.oy + y * T;

  private worldPoint(e: PointerEvent): { x: number; y: number } {
    const r = this.game.canvas.getBoundingClientRect();
    const p = this.cameras.main.getWorldPoint(
      ((e.clientX - r.left) * this.game.canvas.width) / Math.max(1, r.width),
      ((e.clientY - r.top) * this.game.canvas.height) / Math.max(1, r.height),
    );
    return { x: p.x, y: p.y };
  }

  private toTile(wx: number, wy: number) {
    return { x: Math.floor((wx - this.ox) / T), y: Math.floor((wy - this.oy) / T) };
  }

  // ── 그리기 ──

  private canvasTex(key: string, make: () => HTMLCanvasElement): string {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, make());
    return key;
  }

  private drawGround(): void {
    this.ground?.destroy();
    const t = this.tier;
    const key = `house-ground-${this.work.floor}-${t.id}`;
    this.canvasTex(key, () => {
      const c = document.createElement("canvas");
      c.width = this.W;
      c.height = this.H;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      const outside = [0, 1, 2, 3].map((v) => floorGrid("floor_grass", v).toCanvas());
      const inside = [0, 1, 2, 3].map((v) => floorGrid(this.work.floor, v).toCanvas());
      for (let y = 0; y * T < this.H; y++)
        for (let x = 0; x * T < this.W; x++) ctx.drawImage(outside[(x * 7 + y * 3) % 4], x * T, y * T);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, this.W, this.H);
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) ctx.drawImage(inside[(x * 5 + y * 3) % 4], this.tileX(x), this.tileY(y));
      // 문 밖 길
      ctx.fillStyle = "#4a443a";
      const gx = this.tileX(t.w / 2 - 1);
      ctx.fillRect(gx + 4, this.tileY(t.h), 2 * T - 8, (BELOW + 1) * T);
      ctx.fillStyle = "#5a5446";
      for (let y = this.tileY(t.h) + 4; y < this.H; y += 10) ctx.fillRect(gx + 8 + ((y / 10) % 2) * 6, y, 10, 5);
      return c;
    });
    this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.ground);
  }

  private drawWalls(): void {
    for (const w of this.walls) w.destroy();
    this.walls = [];
    this.wallBodies.clear(true, true);
    const t = this.tier;
    const keys = [0, 1, 2, 3].map((v) => this.canvasTex(`house-wall-${this.work.wall}-${v}`, () => wallGrid(this.work.wall, v).toCanvas()));
    const gate = gateTiles(t);
    const put = (x: number, y: number) => {
      const px = this.tileX(x);
      const py = this.tileY(y) + T;
      this.walls.push(this.add.image(px, py, keys[(x * 3 + y) & 3]).setOrigin(0, 1).setDepth(py - 2));
    };
    for (let x = -1; x <= t.w; x++) {
      put(x, -1);
      if (!gate.some((g) => g.x === x)) put(x, t.h);
    }
    for (let y = 0; y < t.h; y++) {
      put(-1, y);
      put(t.w, y);
    }
    // 문기둥
    for (const gx of [gate[0].x - 0.5, gate[1].x + 1.5]) {
      this.walls.push(this.add.rectangle(this.tileX(gx), this.tileY(t.h) + T - 6, 4, WALL_H - 4, 0x3a2c22).setOrigin(0.5, 1).setDepth(this.tileY(t.h) + T));
    }
    // 충돌: 담장 고리(문 2칸 제외)
    const zone = (x: number, y: number, w: number, h: number) => {
      const z = this.add.zone(x + w / 2, y + h / 2, w, h);
      z.removeFromDisplayList();
      this.wallBodies.add(z);
    };
    const L = this.tileX(-1);
    const R = this.tileX(t.w);
    zone(L, this.tileY(-1) + 6, R + T - L, T - 6);
    zone(L, this.tileY(0), T - 4, t.h * T);
    zone(R + 4, this.tileY(0), T - 4, t.h * T);
    const by = this.tileY(t.h) + 6;
    zone(L, by, this.tileX(gate[0].x) - L, T - 6);
    zone(this.tileX(gate[1].x + 1), by, R + T - this.tileX(gate[1].x + 1), T - 6);
  }

  private itemTex(id: string): string | null {
    const key = `house-item-${id}`;
    if (this.textures.exists(key)) return key;
    const g = furnitureGrid(id);
    if (!g) return null;
    this.textures.addCanvas(key, g.toCanvas());
    return key;
  }

  /** 물건 하나 놓기 (r: turn 물건은 90°씩 돌리고, 아니면 홀수일 때 좌우 뒤집기) */
  private placeView(p: Placed, v?: ItemView): ItemView | null {
    const def = furnitureById(p.i);
    const key = def && this.itemTex(p.i);
    if (!def || !key) return null;
    const fp = footprint(def, p.r);
    const img = v?.img ?? this.add.image(0, 0, key);
    const left = this.tileX(p.x);
    const bottom = this.tileY(p.y + fp.h);
    if (def.turn) {
      img.setOrigin(0.5, 0.5).setPosition(left + (fp.w * T) / 2, bottom - (fp.h * T) / 2).setAngle((p.r % 4) * 90).setFlipX(false);
    } else {
      img.setOrigin(0, 1).setPosition(left, bottom).setAngle(0).setFlipX(p.r % 2 === 1);
    }
    img.setDepth(def.floor ? DEPTH.decal + bottom : bottom - 1);
    return { p, img };
  }

  private drawItems(): void {
    for (const v of this.views.values()) v.img.destroy();
    this.views.clear();
    for (const p of this.work.items) {
      const v = this.placeView(p);
      if (v) this.views.set(p.u, v);
    }
    this.rebuildBodies();
  }

  private rebuildBodies(): void {
    this.itemBodies.clear(true, true);
    for (const p of this.work.items) {
      const def = furnitureById(p.i);
      if (!def || def.floor) continue;
      const fp = footprint(def, p.r);
      // 발밑 기준이라 위쪽 절반은 뒤로 지나갈 수 있게 조금 줄인다
      const x = this.tileX(p.x) + 2;
      const y = this.tileY(p.y) + 6;
      const z = this.add.zone(x + (fp.w * T - 4) / 2, y + (fp.h * T - 8) / 2, fp.w * T - 4, fp.h * T - 8);
      z.removeFromDisplayList();
      this.itemBodies.add(z);
    }
  }

  private applyLights(): void {
    this.glowSpots = [];
    const spots: LightSpot[] = [];
    for (const p of this.work.items) {
      const def = furnitureById(p.i);
      if (!def?.light) continue;
      const fp = footprint(def, p.r);
      const x = this.tileX(p.x) + (fp.w * T) / 2;
      const y = this.tileY(p.y + fp.h) - Math.min(14, artUp(p.i) + 6);
      this.glowSpots.push({ x, y, r: def.light.r, color: def.light.color });
      spots.push({ x, y, scale: def.light.r / 40, tint: def.light.color, base: 0.5 });
    }
    this.atmos.setStaticLights(spots);
  }

  private fitCamera(): void {
    const cam = this.cameras.main;
    const fit = Math.min(cam.width / this.W, cam.height / this.H);
    cam.setZoom(Math.max(ZOOM_MIN, Math.min(4, Math.floor(fit * 2) / 2)));
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    cam.setBounds(vw > this.W ? (this.W - vw) / 2 : 0, vh > this.H ? (this.H - vh) / 2 : 0, Math.max(this.W, vw), Math.max(this.H, vh));
  }

  private onResize(): void {
    this.fitCamera();
    if (this.editing) this.cameras.main.removeBounds();
    this.atmos.resize();
    this.lighting.resize();
  }

  // ── 플레이 ──

  private nearSign(): boolean {
    return Math.hypot(this.player.x - this.sign.x, this.player.y - this.sign.y) < NEAR_SIGN;
  }

  private onAction(a: KeyAction): void {
    if (this.exiting || this.editing) return;
    if (a === "interact" && this.nearSign()) {
      this.player.faceTo(this.sign.x, this.sign.y, this.time.now);
      bridge.emit("house:guestbook");
      return;
    }
    if (a === "jump") this.player.jump(this.time.now, NO_SEATS);
    else if (a === "sit") {
      if (this.player.sitting) this.player.stand(this.time.now, NO_SEATS);
      else this.player.sit(null, this.time.now, NO_SEATS);
    }
  }

  update(time: number, delta: number): void {
    if (this.exiting) return;
    const input = this.data0.input;
    input.read(this.move);
    if (input.isBlocked || this.editing) this.move.ax = this.move.ay = 0;
    this.player.update(this.move, time, NO_SEATS);
    const cam = this.cameras.main;
    const s = 1 / cam.zoom;
    this.player.view.sync(time, s);
    if (this.presence) {
      const now = performance.now();
      this.presence.update(now, cam.worldView, s);
      // 함께 있는 사람 수·집주인 여부를 UI에 (바뀔 때만, 1초마다 확인)
      if (now >= this.presenceAt) {
        this.presenceAt = now + 1000;
        const st = this.presence.status;
        const ownerHere = !!this.data0.mine || [...this.presence.remotes.values()].some((r) => r.name === this.data0.house.ownerName);
        const key = `${st.count}|${this.presence.client.online}|${ownerHere}`;
        if (key !== this.presenceKey) {
          this.presenceKey = key;
          bridge.emit("house:presence", { where: "house", count: st.count, online: this.presence.client.online, ownerHere });
        }
      }
    }
    this.prompt.setScale(s).setVisible(!this.editing && this.nearSign());
    this.titleLabel.setScale(s);

    const view = cam.worldView;
    this.view.setTo(view.x, view.y, view.width, view.height);
    this.atmos.update(time, Math.min(delta, 100), this.view);
    const L = this.atmos.levels;
    const lantern = this.player.view.lantern;
    const r = playerLightRadius(L.glow, lantern);
    this.playerGlow
      .setPosition(this.player.x, this.player.y - 9)
      .setScale((r * 1.6) / 64)
      .setAlpha((0.05 + 0.13 * L.glow) * Math.min(1, L.darkness * 3));
    this.lighting.begin(this.view, L.darkness);
    if (L.darkness > 0.004) {
      this.lighting.add(this.player.x, this.player.y - 8, this.editing ? Math.max(r, 160) : r, 0.92);
      for (const l of this.glowSpots) this.lighting.add(l.x, l.y, l.r * 2.2, 0.75 + 0.05 * Math.sin(time / 300 + l.x));
      this.lighting.add(this.sign.x, this.sign.y - 10, 26, 0.5);
    }
    this.lighting.end();

    if (this.editing) return;
    // 문 밖 아래 끝까지 내려가면 나간다
    if (this.player.y < this.H - 22) this.armed = true;
    if (this.armed && this.player.y > this.H - 12 && this.move.ay > 0) this.leave();
  }

  leave(): void {
    if (this.exiting) return;
    this.exiting = true;
    this.data0.input.setHandler(null);
    this.data0.onExit();
  }

  // ── 편집 모드 ──

  private emitState(): void {
    const st: HouseEditState = {
      editing: this.editing,
      items: structuredClone(this.work.items),
      floor: this.work.floor,
      wall: this.work.wall,
      selected: this.selected,
      dirty: JSON.stringify(this.work) !== this.baseline,
    };
    bridge.emit("house:state", st);
  }

  private setEditing(on: boolean, revert: boolean): void {
    if (!this.data0.mine || this.exiting) return;
    if (revert) {
      this.work = JSON.parse(this.baseline) as HouseLayout;
      this.refreshAll();
    }
    this.editing = on;
    this.selected = null;
    this.drag = null;
    this.grid.setVisible(on);
    if (on) {
      this.drawGrid();
      if (this.player.sitting) this.player.stand(this.time.now, NO_SEATS);
      this.cameras.main.stopFollow();
      // 위 정보 막대(약 90px)와 아래 편집 도구(화면 높이의 약 40%) 사이에 묘역이 들어오게 줌·위치를 맞춘다
      const cam = this.cameras.main;
      cam.removeBounds();
      const top = 90;
      const bottom = cam.height * 0.6;
      const plotH = (this.tier.h + 2) * T;
      const fit = Math.min(cam.width / this.W, Math.max(1, bottom - top) / plotH);
      cam.setZoom(Math.max(ZOOM_MIN, Math.min(cam.zoom, Math.floor(fit * 2) / 2)));
      const mid = (top + bottom) / 2;
      cam.pan(this.W / 2, this.oy + (this.tier.h * T) / 2 + (cam.height / 2 - mid) / cam.zoom, 300, "Sine.easeInOut");
    } else {
      this.fitCamera();
      this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 10);
      // 편집으로 물건이 내 자리에 놓였으면 문 밖으로 비켜 준다
      if (this.overlapsSolid(this.player.x, this.player.y)) {
        this.player.warp(this.ox + (this.tier.w / 2) * T, this.oy + (this.tier.h + 1) * T + 22, this.time.now, NO_SEATS);
      }
    }
    this.drawSelection();
    this.emitState();
  }

  private overlapsSolid(x: number, y: number): boolean {
    const tile = this.toTile(x, y - 2);
    const occ = buildOccupancy(this.work.items, this.tier);
    const u = occ.stand.get(tile.y * 1000 + tile.x);
    return u !== undefined;
  }

  private refreshAll(): void {
    this.drawGround();
    this.drawWalls();
    this.drawItems();
    this.applyLights();
  }

  private drawGrid(): void {
    const g = this.grid;
    const t = this.tier;
    g.clear();
    g.lineStyle(1, 0xd9d4c3, 0.18);
    for (let x = 0; x <= t.w; x++) g.lineBetween(this.tileX(x), this.tileY(0), this.tileX(x), this.tileY(t.h));
    for (let y = 0; y <= t.h; y++) g.lineBetween(this.tileX(0), this.tileY(y), this.tileX(t.w), this.tileY(y));
    g.fillStyle(0xd08a76, 0.28);
    for (const gt of gateTiles(t)) g.fillRect(this.tileX(gt.x), this.tileY(gt.y), T, T);
  }

  private drawSelection(valid = true): void {
    const g = this.sel;
    g.clear();
    if (!this.editing || !this.selected) return;
    const p = this.work.items.find((i) => i.u === this.selected);
    const def = p && furnitureById(p.i);
    if (!p || !def) return;
    const pos = this.drag?.u === p.u ? this.drag.to : p;
    const fp = footprint(def, p.r);
    g.lineStyle(1, valid ? 0x9fc5a8 : 0xd08a76, 1);
    g.fillStyle(valid ? 0x9fc5a8 : 0xd08a76, 0.18);
    g.fillRect(this.tileX(pos.x), this.tileY(pos.y), fp.w * T, fp.h * T);
    g.strokeRect(this.tileX(pos.x) + 0.5, this.tileY(pos.y) + 0.5, fp.w * T - 1, fp.h * T - 1);
  }

  /** p를 (x,y,r)로 옮길 수 있으면 옮기고 true */
  private tryMove(u: string, x: number, y: number, r?: number): boolean {
    const p = this.work.items.find((i) => i.u === u);
    const def = p && furnitureById(p.i);
    if (!p || !def) return false;
    const nr = r ?? p.r;
    const occ = buildOccupancy(this.work.items, this.tier, u);
    if (occ.check(def, x, y, nr) !== null) return false;
    p.x = x;
    p.y = y;
    p.r = nr;
    const v = this.views.get(u);
    if (v) this.placeView(p, v);
    this.rebuildBodies();
    this.applyLights();
    return true;
  }

  private changed(): void {
    this.drawSelection();
    this.emitState();
  }

  private notice(message: string): void {
    bridge.emit("house:notice", { message });
  }

  private tool(t: HouseTool): void {
    if (!this.editing) return;
    const p = this.selected ? this.work.items.find((i) => i.u === this.selected) : undefined;
    switch (t.action) {
      case "place": {
        const def = furnitureById(t.itemId);
        if (!def || def.skin) return;
        if (this.work.items.length >= this.tier.maxItems) return this.notice(`${this.tier.name}에는 ${this.tier.maxItems}개까지 놓을 수 있어요.`);
        const c = this.toTile(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
        const spot = findFreeSpot(this.work.items, this.tier, def, 0, c.x, c.y);
        if (!spot) return this.notice("빈자리가 없어요. 다른 물건을 옮기거나 치워 주세요.");
        const np: Placed = { u: newUid(this.work.items), i: def.id, x: spot.x, y: spot.y, r: 0 };
        this.work.items.push(np);
        const v = this.placeView(np);
        if (v) this.views.set(np.u, v);
        this.rebuildBodies();
        this.applyLights();
        this.selected = np.u;
        return this.changed();
      }
      case "rotate": {
        if (!p) return;
        const r = (p.r + 1) % 4;
        if (!this.tryMove(p.u, p.x, p.y, r)) {
          const def = furnitureById(p.i)!;
          const spot = findFreeSpot(
            this.work.items.filter((i) => i.u !== p.u),
            this.tier,
            def,
            r,
            p.x,
            p.y,
          );
          if (!spot || !this.tryMove(p.u, spot.x, spot.y, r)) return this.notice("돌릴 자리가 없어요.");
        }
        return this.changed();
      }
      case "remove": {
        if (!p) return;
        this.work.items = this.work.items.filter((i) => i.u !== p.u);
        this.views.get(p.u)?.img.destroy();
        this.views.delete(p.u);
        this.rebuildBodies();
        this.applyLights();
        this.selected = null;
        return this.changed();
      }
      case "deselect":
        this.selected = null;
        return this.changed();
      case "nudge":
        if (p && !this.tryMove(p.u, p.x + t.dx, p.y + t.dy)) {
          // 막힌 방향: 선택 표시를 잠깐 흐리게
          this.sel.setAlpha(0.4);
          this.time.delayedCall(120, () => this.sel.setAlpha(1));
        }
        return this.changed();
      case "skin":
        if (t.floor) this.work.floor = t.floor;
        if (t.wall) this.work.wall = t.wall;
        if (t.floor) this.drawGround();
        if (t.wall) this.drawWalls();
        return this.changed();
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.editing || this.data0.input.isBlocked || e.button > 0) return;
    const w = this.worldPoint(e);
    const tile = this.toTile(w.x, w.y);
    const occ = buildOccupancy(this.work.items, this.tier);
    // 위로 솟은 그림(책장 윗부분 등)을 눌러도 잡히게 한 칸 아래도 본다
    const u = occ.at(tile.x, tile.y) ?? occ.stand.get((tile.y + 1) * 1000 + tile.x);
    if (u) {
      const p = this.work.items.find((i) => i.u === u)!;
      this.selected = u;
      this.drag = { u, offX: tile.x - p.x, offY: tile.y - p.y, from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y } };
      this.changed();
    } else {
      if (this.selected) {
        this.selected = null;
        this.changed();
      }
      const cam = this.cameras.main;
      this.pan = { sx: e.clientX, sy: e.clientY, cx: cam.scrollX, cy: cam.scrollY };
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.editing) return;
    if (this.drag) {
      const w = this.worldPoint(e);
      const tile = this.toTile(w.x, w.y);
      const to = { x: tile.x - this.drag.offX, y: tile.y - this.drag.offY };
      if (to.x === this.drag.to.x && to.y === this.drag.to.y) return;
      this.drag.to = to;
      const p = this.work.items.find((i) => i.u === this.drag!.u)!;
      const def = furnitureById(p.i)!;
      const ok = buildOccupancy(this.work.items, this.tier, p.u).check(def, to.x, to.y, p.r) === null;
      // 끄는 동안 그림을 따라 움직이고, 놓을 수 없는 자리면 빨갛게 보인다
      const v = this.views.get(p.u);
      if (v) this.placeView({ ...p, x: to.x, y: to.y }, v);
      v?.img.setAlpha(ok ? 1 : 0.55);
      this.drawSelection(ok);
    } else if (this.pan) {
      const cam = this.cameras.main;
      cam.setScroll(this.pan.cx - (e.clientX - this.pan.sx) / cam.zoom, this.pan.cy - (e.clientY - this.pan.sy) / cam.zoom);
    }
  };

  private onUp = () => {
    this.pan = null;
    const d = this.drag;
    if (!d || !this.editing) return;
    this.drag = null;
    const p = this.work.items.find((i) => i.u === d.u);
    if (!p) return;
    const moved = (d.to.x !== p.x || d.to.y !== p.y) && this.tryMove(p.u, d.to.x, d.to.y);
    const v = this.views.get(p.u);
    if (!moved && v) this.placeView(p, v);
    v?.img.setAlpha(1);
    this.changed();
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.editing || this.data0.input.isBlocked) return;
    const k = e.code;
    const dir: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      KeyW: [0, -1],
      ArrowDown: [0, 1],
      KeyS: [0, 1],
      ArrowLeft: [-1, 0],
      KeyA: [-1, 0],
      ArrowRight: [1, 0],
      KeyD: [1, 0],
    };
    let used = true;
    if (dir[k]) {
      if (this.selected) this.tool({ action: "nudge", dx: dir[k][0], dy: dir[k][1] });
      else {
        const cam = this.cameras.main;
        cam.setScroll(cam.scrollX + dir[k][0] * T, cam.scrollY + dir[k][1] * T);
      }
    } else if (k === "KeyR") this.tool({ action: "rotate" });
    else if (k === "Delete" || k === "Backspace" || k === "KeyX") this.tool({ action: "remove" });
    else if (k === "Escape" && this.selected) this.tool({ action: "deselect" });
    else if (k === "BracketRight" || k === "BracketLeft" || k === "KeyQ" || k === "KeyE") {
      // 물건 차례로 고르기
      const items = this.work.items;
      if (!items.length) return;
      const i = items.findIndex((p) => p.u === this.selected);
      const step = k === "BracketLeft" || k === "KeyQ" ? -1 : 1;
      this.selected = items[(i + step + items.length) % items.length].u;
      this.changed();
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /** 저장 뒤: 새 기준으로 */
  markSaved(house: PublicHouse): void {
    this.work = structuredClone(house.layout);
    this.baseline = JSON.stringify(this.work);
    this.refreshAll();
    this.changed();
  }

  /** 테스트·디버그용 */
  get debugState() {
    return { editing: this.editing, items: this.work.items.length, selected: this.selected, player: { x: this.player.x, y: this.player.y }, H: this.H };
  }
}
