import * as Phaser from "phaser";
import { DIR, type Sid } from "@tomb/protocol";
import { bgm } from "@/components/bgm/engine";
import { furnitureById, tierById, type PlotTier } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { buildOccupancy, findFreeSpot, footprint, gateTiles, newUid } from "@/lib/housing/layout";
import { GROW_MS, plantStage, type PlantState } from "@/lib/housing/plants";
import { roomPlan, type RoomPlan } from "@/lib/housing/rooms";
import { placedSig } from "@/lib/housing/states";
import type { HouseLayout, Placed, PublicHouse } from "@/lib/housing/types";
import { errorMessage } from "@/lib/api";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import { INDOOR_FRONT } from "../entities/RemoteAvatar";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import { SPOT_TAKEN_HINT, SPOT_TAKEN_TOAST } from "../logic/spots";
import { emoSlotOfKey } from "../logic/emoBoard";
import type { MoveInput } from "../logic/movement";
import { RoomPresence } from "../net/RoomPresence";
import type { NetPose } from "../net/sendThrottle";
import type { EmoteIcon } from "../sprites/emotes";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { Lighting, playerLightRadius } from "../world/Lighting";
import type { LightSpot } from "../world/WorldMap";
import { artUp, floorGrid, furnitureGrid, sconceGrid, wallCapColor, wallFaceColor, WALL_H, wallGrid, windowGrid, WINDOW_W, yardGrid } from "./art";
import type { HouseEditState, HouseTool } from "./events";
import { HouseSfx, hearGain, type HouseSound } from "./houseSfx";
import {
  BOOK_LINES,
  clockText,
  DRINKS,
  houseSpots,
  houseTargets,
  itemDepthY,
  pickTarget,
  PIANO_NOTES,
  RADIO_CHANNELS,
  SNACK_NAMES,
  SNACKS,
  TWINKLE,
  USE_LABEL,
  type HouseSpot,
  type HouseTarget,
  type UseKind,
} from "./interact";

// 개인 집(하우징) 씬 — 3번 집 안 개편. 방문자끼리 같은 방(room "house:{id}")으로 서로 보이고 들린다.
//  - 집 안: 안쪽 벽(벽지·몰딩·걸레받이·창문·벽등) + 옆벽 + 앞벽(현관문) + 바닥 스킨. 넓은 터·대저택은 칸막이 벽으로 방이 나뉜다(lib/housing/rooms.ts).
//  - 낮에는 창으로 햇빛이 들고, 밤에는 창밖이 어두워지고 벽등·방 조명이 켜진다 (Atmosphere glow 기준).
//  - 가구 쓰기(game/housing/interact.ts): 앉기·눕기·읽기·욕조는 1인 자리(방 서버 좌석, 한 자리 한 명),
//    피아노 음·라디오·벽난로·스탠드·냉장고·고양이·커피·자판기·풍경·시계·화분·창문은 use 이벤트로 방 사람들에게 알린다.
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
/** 바깥 여백(칸): 좌우 2칸(옆벽 포함), 위쪽은 안쪽 벽(WALL_H) + 이름표 자리, 아래는 앞벽 + 문 밖 길 3칸 */
const SIDE = 2;
const TOP_PX = WALL_H + 26;
const BELOW = 3;
/** 옆벽·앞벽 두께 (px) */
const WALL_T = 8;
/** 칸막이 벽: 두께·높이 (px) */
const PART_W = 6;
const PART_H = 26;
/** 앞벽 높이 (윗면 + 바깥 면) */
const FRONT_H = 14;
const NO_SEATS: SeatRequester = { sit: () => undefined, stand: () => undefined };
const ZOOM_MIN = 1.5;
const NEAR_SIGN = 22;
/** 밤 판정 (Atmosphere glow: 낮 0.1 … 밤 1) */
const NIGHT_GLOW = 0.55;

/** 받침에 맞춰 을/를 (사과를·삼각김밥을) */
const objectWord = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return w + (c >= 0 && c < 11172 && c % 28 !== 0 ? "을" : "를");
};

/** 화면에 뜰 수 있는 안내 문구 전부 (비트맵 글꼴에 미리 글자를 올린다) */
const allPrompts = () =>
  [...Object.values(USE_LABEL), ...Object.values(SPOT_TAKEN_HINT), "벽난로 불 끄기", "스탠드 끄기", "창문 닫기", "1~8 건반 · E 연주 · 움직이면 일어나기", "E · 일어나기"].join("");

type ItemView = { p: Placed; img: Phaser.GameObjects.Image; variant: string };
type Using = { spot: HouseSpot; pre: { x: number; y: number }; at: number; next: number; note: number };
type Glow = { img: Phaser.GameObjects.Image; x: number; y: number; r: number; color: number; on: () => boolean; flicker?: boolean };

export class HouseScene extends Phaser.Scene {
  private data0!: HouseSceneData;
  private tier!: PlotTier;
  private plan!: RoomPlan;
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
  private shadows!: Phaser.GameObjects.Graphics;
  private rugShadows!: Phaser.GameObjects.Graphics;
  private sunPools!: Phaser.GameObjects.Graphics;
  private prompt!: Phaser.GameObjects.BitmapText;
  private usePrompt!: Phaser.GameObjects.BitmapText;
  private titleLabel!: Phaser.GameObjects.BitmapText;
  private sign = { x: 0, y: 0 };
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  /** 같은 방(이 집) 사람들 */
  private presence: RoomPresence | null = null;
  private readonly pose: NetPose = { x: 0, y: 0, state: 0, dir: 0 };
  private presenceAt = 0;
  private presenceKey = "";
  private readonly view = new Phaser.Geom.Rectangle();
  private exiting = false;
  private armed = false;

  // ── 3번 가구 쓰기 ──
  private sfx!: HouseSfx;
  private spots: HouseSpot[] = [];
  private targets: HouseTarget[] = [];
  /** 배치 id(또는 "w0"…) → 쓰는 방식 (다른 사람의 use 이벤트를 풀 때) */
  private useByU = new Map<string, UseKind>();
  private target: HouseTarget | null = null;
  private using: Using | null = null;
  /** 켜고 끄는 가구·창문 상태 (u → 값). 방 사람들과 use 이벤트로 맞춘다 */
  private toggles = new Map<string, number>();
  /** 방 입장 뒤 내가 바꿨거나 중계로 받은 u (늦게 온 저장값이 덮어쓰지 않게) */
  private stateTouched = new Set<string>();
  /** 저장 대기 중인 상태 (u → 값). 연타는 모아서 한 번에 보낸다 */
  private statePending = new Map<string, number>();
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  /** 냉장고 문이 열려 있는 동안 (u → 닫힐 시각) */
  private openUntil = new Map<string, number>();
  private plants: Record<string, PlantState> = {};
  private plantClock = 0;
  private windows: { img: Phaser.GameObjects.Image; key: string }[] = [];
  private sconces: { img: Phaser.GameObjects.Image; on: boolean }[] = [];
  private glows: Glow[] = [];
  private night = false;
  private nextAmbient = 0;
  private flameAt = 0;
  private flameFrame = 0;
  /** 다른 사람 자판·거품 소리 타이머 (sid → 다음 시각) */
  private remoteTick = new Map<Sid, number>();
  private varTick = 0;

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
    this.plan = roomPlan(this.tier);
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
    this.using = null;
    this.target = null;
    this.toggles = new Map();
    this.stateTouched = new Set();
    this.statePending = new Map();
    this.stateTimer = null;
    this.openUntil = new Map();
    this.plants = {};
    this.windows = [];
    this.sconces = [];
    this.glows = [];
    this.remoteTick = new Map();
    this.work = structuredClone(data.house.layout);
    this.baseline = JSON.stringify(this.work);
  }

  create(): void {
    const { atlas, house } = this.data0;
    const t = this.tier;
    this.cameras.main.setBackgroundColor("#10120e");
    this.ox = SIDE * T;
    this.oy = TOP_PX;
    this.W = (t.w + SIDE * 2) * T;
    this.H = this.oy + t.h * T + FRONT_H + BELOW * T;

    this.wallBodies = this.physics.add.staticGroup();
    this.itemBodies = this.physics.add.staticGroup();
    this.rugShadows = this.add.graphics().setDepth(DEPTH.decal - 1);
    this.shadows = this.add.graphics().setDepth(DEPTH.decal + 20_000);
    this.sunPools = this.add.graphics().setDepth(DEPTH.decal + 20_001).setBlendMode(Phaser.BlendModes.ADD);
    this.sfx = new HouseSfx();
    this.computeTargets();
    this.drawGround();
    this.drawWalls();
    this.drawItems();

    // 이름표 (안쪽 벽 위) + 방명록 팻말 (문 밖 왼쪽)
    const title = `${house.name}`;
    atlas.ensure(title + "E · 방명록 보기" + house.ownerName + "의 집" + allPrompts());
    this.titleLabel = this.add
      .bitmapText(this.W / 2, this.oy - WALL_H - 4, FONT_KEY, title, FONT_PX)
      .setOrigin(0.5, 1)
      .setTint(0xf2ead3)
      .setDepth(DEPTH.labels);
    const [g0] = gateTiles(t);
    const outY = this.oy + t.h * T + FRONT_H;
    this.sign = { x: this.ox + g0.x * T - 14, y: outY + 18 };
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
    this.usePrompt = this.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setTint(0xffe39a).setDepth(DEPTH.labels).setVisible(false);

    // 문 밖에서 시작
    const sx = this.ox + (t.w / 2) * T;
    const sy = outY + 22;
    this.player = new Player(this, atlas, sx, sy, this.data0.color, this.data0.name, this.data0.body);
    this.player.view.setLook(this.data0.look);
    this.presenceKey = "";
    this.presence = new RoomPresence(this, {
      atlas: this.data0.atlas,
      room: `house:${this.data0.house.id}`,
      me: this.player.view,
      expressions: true,
      getPose: () => this.player.netPose(this.pose),
      onSeatDenied: (id) => this.onSeatDenied(id),
      onUse: (sid, u, a) => this.onRemoteUse(sid, u, a),
    });
    this.player.dir = DIR.up;
    this.physics.add.collider(this.player.sprite, this.wallBodies);
    this.physics.add.collider(this.player.sprite, this.itemBodies);
    this.physics.world.setBounds(T, this.oy - 12, this.W - 2 * T, this.H - (this.oy - 12));

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
      // 방을 나가도 마지막으로 바꾼 상태는 저장한다
      this.flushStates();
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
      this.sfx.destroy();
      this.player.destroy();
    });

    this.loadPlants();
    this.loadStates();
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

  private get frame() {
    return { ox: this.ox, oy: this.oy };
  }

  // ── 그리기 ──

  private canvasTex(key: string, make: () => HTMLCanvasElement): string {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, make());
    return key;
  }

  /** 바닥: 집 밖 마당 + 집 안 바닥 스킨 + 벽 밑 그늘 + 현관 매트 + 문 밖 길 */
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
      const outside = [0, 1, 2, 3].map((v) => yardGrid(v).toCanvas());
      const inside = [0, 1, 2, 3].map((v) => floorGrid(this.work.floor, v).toCanvas());
      for (let y = 0; y * T < this.H; y++) for (let x = 0; x * T < this.W; x++) ctx.drawImage(outside[(x * 7 + y * 3) % 4], x * T, y * T);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, this.W, this.H);
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) ctx.drawImage(inside[(x * 5 + y * 3) % 4], this.tileX(x), this.tileY(y));
      const L = this.tileX(0);
      const R = this.tileX(t.w);
      const top = this.tileY(0);
      const bottom = this.tileY(t.h);
      // 벽 밑 그늘 (안쪽 벽 아래로 진하게, 옆벽 옆으로 옅게)
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgba(20,12,6,${0.32 * (1 - i / 8)})`;
        ctx.fillRect(L, top + i, R - L, 1);
        ctx.fillStyle = `rgba(20,12,6,${0.18 * (1 - i / 8)})`;
        ctx.fillRect(L + i, top, 1, bottom - top);
        ctx.fillRect(R - 1 - i, top, 1, bottom - top);
      }
      // 칸막이 벽 밑 그늘
      for (const p of this.plan.partitions) {
        const px = this.tileX(p.x);
        ctx.fillStyle = "rgba(20,12,6,0.22)";
        ctx.fillRect(px + PART_W / 2, top, 3, bottom - top);
      }
      // 현관 매트 (문 안쪽)
      const gate = gateTiles(t);
      const gx = this.tileX(gate[0].x);
      ctx.fillStyle = "#5a3a2a";
      ctx.fillRect(gx + 4, bottom - 11, 2 * T - 8, 9);
      ctx.fillStyle = "#8a5a3a";
      ctx.fillRect(gx + 5, bottom - 10, 2 * T - 10, 7);
      ctx.fillStyle = "#a8744a";
      for (let x = gx + 7; x < gx + 2 * T - 6; x += 4) ctx.fillRect(x, bottom - 8, 2, 3);
      // 문 밖 길
      ctx.fillStyle = "#4a443a";
      ctx.fillRect(gx + 4, bottom + FRONT_H - 4, 2 * T - 8, this.H - bottom);
      ctx.fillStyle = "#5a5446";
      for (let y = bottom + FRONT_H; y < this.H; y += 10) ctx.fillRect(gx + 8 + ((y / 10) % 2) * 6, y, 10, 5);
      return c;
    });
    this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.ground);
  }

  /** 벽: 안쪽 벽(벽지·창문·벽등) + 옆벽 + 앞벽(현관) + 칸막이 벽, 그리고 충돌 */
  private drawWalls(): void {
    for (const w of this.walls) w.destroy();
    this.walls = [];
    this.windows = [];
    this.sconces = [];
    this.glows = this.glows.filter((g) => {
      if (g.flicker !== undefined || g.r !== 0) return true;
      g.img.destroy();
      return false;
    });
    this.wallBodies.clear(true, true);
    const t = this.tier;
    const wallId = this.work.wall;
    const L = this.tileX(0);
    const R = this.tileX(t.w);
    const top = this.tileY(0);
    const bottom = this.tileY(t.h);
    // 안쪽 벽 (한 장)
    const backKey = this.canvasTex(`house-back-${wallId}-${t.id}`, () => {
      const c = document.createElement("canvas");
      c.width = t.w * T;
      c.height = WALL_H;
      const ctx = c.getContext("2d")!;
      for (let x = 0; x < t.w; x++) ctx.drawImage(wallGrid(wallId, (x * 3) & 3).toCanvas(), x * T, 0);
      return c;
    });
    this.walls.push(this.add.image(L, top, backKey).setOrigin(0, 1).setDepth(top - 2));
    // 창문 (낮·밤, 열림·닫힘은 updateWindows가 바꾼다)
    this.plan.windows.forEach((w, i) => {
      const x = L + w.x * T + (w.w * T - WINDOW_W) / 2;
      const img = this.add.image(x, top - 9, this.windowKey(this.night, this.isOpen(`w${i}`))).setOrigin(0, 1).setDepth(top - 1);
      this.walls.push(img);
      this.windows.push({ img, key: "" });
    });
    // 벽등: 방마다 창문 사이 또는 창문 양옆
    for (const room of this.plan.rooms) {
      const wins = this.plan.windows.filter((w) => w.x >= room.x0 && w.x < room.x1);
      const xs: number[] = [];
      if (wins.length >= 2) xs.push(((wins[0].x + wins[0].w + wins[1].x) / 2) * T);
      else if (wins.length === 1) xs.push(wins[0].x * T - 7, (wins[0].x + wins[0].w) * T + 7);
      for (const sx of xs) {
        if (sx < room.x0 * T + 6 || sx > room.x1 * T - 6) continue;
        const img = this.add.image(L + sx, top - 16, this.sconceKey(this.night)).setOrigin(0.5, 1).setDepth(top - 1);
        this.walls.push(img);
        this.sconces.push({ img, on: this.night });
        const glow = this.add.image(L + sx, top - 20, "fx-glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd890).setDepth(DEPTH.lights).setAlpha(0);
        this.glows.push({ img: glow, x: L + sx, y: top - 20, r: 0, color: 0xffd890, on: () => this.night });
      }
    }
    // 옆벽 (위에서 본 윗면) + 바깥 모서리
    const cap = wallCapColor(wallId);
    for (const x of [L - WALL_T, R]) {
      this.walls.push(this.add.rectangle(x, top - WALL_H, WALL_T, bottom - top + WALL_H + FRONT_H - 4, cap).setOrigin(0, 0).setDepth(bottom + FRONT_H));
      this.walls.push(this.add.rectangle(x + (x < L ? WALL_T - 1 : 0), top - WALL_H, 1, bottom - top + WALL_H, 0x000000, 0.35).setOrigin(0, 0).setDepth(bottom + FRONT_H));
    }
    this.walls.push(this.add.rectangle(L - WALL_T, top - WALL_H - 3, R - L + 2 * WALL_T, 3, cap).setOrigin(0, 0).setDepth(top - 1));
    // 앞벽 (윗면 + 바깥 판자 면), 가운데 현관 2칸은 비운다
    const gate = gateTiles(t);
    const gL = this.tileX(gate[0].x);
    const gR = this.tileX(gate[1].x + 1);
    const face = 0x6a4a30;
    for (const [x0, x1] of [
      [L - WALL_T, gL],
      [gR, R + WALL_T],
    ]) {
      this.walls.push(this.add.rectangle(x0, bottom, x1 - x0, 5, cap).setOrigin(0, 0).setDepth(bottom + FRONT_H));
      const fr = this.add.rectangle(x0, bottom + 5, x1 - x0, FRONT_H - 5, face).setOrigin(0, 0).setDepth(bottom + FRONT_H);
      this.walls.push(fr);
      for (let yy = bottom + 8; yy < bottom + FRONT_H; yy += 3)
        this.walls.push(this.add.rectangle(x0, yy, x1 - x0, 1, 0x4a3020).setOrigin(0, 0).setDepth(bottom + FRONT_H + 0.1));
    }
    // 현관 문틀 (기둥 + 열린 문짝)
    for (const gx of [gL - 2, gR - 1]) this.walls.push(this.add.rectangle(gx, bottom - 18, 3, 18 + FRONT_H, 0x3a2416).setOrigin(0, 0).setDepth(bottom + FRONT_H + 0.2));
    this.walls.push(this.add.rectangle(gR + 2, bottom - 14, 5, 18, 0x8a5a36).setOrigin(0, 0).setDepth(bottom + FRONT_H + 0.2).setStrokeStyle(1, 0x2a1a10));
    // 칸막이 벽 (경계선 위의 얇은 벽, 문 줄은 비운다)
    const faceC = wallFaceColor(wallId);
    for (const p of this.plan.partitions) {
      const px = this.tileX(p.x);
      const segs: [number, number][] = [
        [top, this.tileY(p.door[0])],
        [this.tileY(p.door[1] + 1), bottom],
      ];
      for (const [y0, y1] of segs) {
        if (y1 - y0 < 2) continue;
        // 윗면(높이만큼 위로 올려 그린다) + 앞에서 보이는 끝면 + 걸레받이
        this.walls.push(this.add.rectangle(px - PART_W / 2, y0 - PART_H, PART_W, y1 - y0, cap).setOrigin(0, 0).setDepth(y1));
        this.walls.push(this.add.rectangle(px - PART_W / 2, y1 - PART_H, PART_W, PART_H, faceC).setOrigin(0, 0).setDepth(y1).setStrokeStyle(1, 0x1a1210, 0.6));
        this.walls.push(this.add.rectangle(px - PART_W / 2, y1 - 4, PART_W, 4, 0x5a3a22).setOrigin(0, 0).setDepth(y1 + 0.1));
        this.zone(px - PART_W / 2, y0, PART_W, y1 - y0 - 2);
      }
    }
    // 충돌: 안쪽 벽·옆벽·앞벽(현관 2칸 제외)
    this.zone(L - WALL_T, top - 14, R - L + 2 * WALL_T, 14);
    this.zone(L - WALL_T, top, WALL_T - 3, bottom - top + FRONT_H);
    this.zone(R + 3, top, WALL_T - 3, bottom - top + FRONT_H);
    this.zone(L - WALL_T, bottom + 4, gL - (L - WALL_T), FRONT_H - 6);
    this.zone(gR, bottom + 4, R + WALL_T - gR, FRONT_H - 6);
    this.updateWindows(true);
  }

  private zone(x: number, y: number, w: number, h: number): void {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    z.removeFromDisplayList();
    this.wallBodies.add(z);
  }

  private windowKey(night: boolean, open: boolean): string {
    return this.canvasTex(`house-window-${night ? "n" : "d"}-${open ? "o" : "c"}`, () => windowGrid(night, open).toCanvas());
  }

  private sconceKey(on: boolean): string {
    return this.canvasTex(`house-sconce-${on ? 1 : 0}`, () => sconceGrid(on).toCanvas());
  }

  /** 낮밤·열림이 바뀌면 창문·벽등 그림을 바꾸고 햇빛 자국을 다시 그린다 */
  private updateWindows(force = false): void {
    this.windows.forEach((w, i) => {
      const key = this.windowKey(this.night, this.isOpen(`w${i}`));
      if (force || key !== w.key) {
        w.key = key;
        w.img.setTexture(key);
      }
    });
    for (const s of this.sconces) if (force || s.on !== this.night) s.img.setTexture(this.sconceKey((s.on = this.night)));
    const g = this.sunPools.clear();
    if (this.night) return;
    const top = this.tileY(0);
    this.plan.windows.forEach((w) => {
      const x0 = this.tileX(w.x) + 2;
      const x1 = this.tileX(w.x + w.w) - 2;
      // 비스듬히 들어오는 햇빛 (오후 해: 오른쪽 아래로)
      g.fillStyle(0xfff0c8, 0.16);
      g.fillPoints(
        [
          { x: x0, y: top },
          { x: x1, y: top },
          { x: x1 + 14, y: top + 30 },
          { x: x0 + 14, y: top + 30 },
        ],
        true,
      );
      g.fillStyle(0xfff6dc, 0.1);
      g.fillRect(x0 + 8, top + 10, x1 - x0 - 4, 2);
    });
  }

  /** 물건 그림 텍스처 (변형별) */
  private itemTex(id: string, variant = ""): string | null {
    const key = `house-item-${id}${variant ? `-${variant}` : ""}`;
    if (this.textures.exists(key)) return key;
    const g = furnitureGrid(id, variant);
    if (!g) return null;
    this.textures.addCanvas(key, g.toCanvas());
    return key;
  }

  /** 지금 상태에 맞는 그림 변형 (불 켜짐·문 열림·화분 단계) */
  private variantOf(p: Placed): string {
    switch (p.i) {
      case "pot":
        return `s${plantStage(this.plants[p.u], Date.now())}`;
      case "fireplace":
        return this.toggles.get(p.u) ? (this.flameFrame ? "on2" : "on") : "";
      case "floor_lamp":
        return this.toggles.get(p.u) ? "on" : "";
      case "radio":
        return this.toggles.get(p.u) ? "on" : "";
      case "fridge":
        return (this.openUntil.get(p.u) ?? 0) > this.time.now ? "open" : "";
      default:
        return "";
    }
  }

  /** 물건 하나 놓기 (r: turn 물건은 90°씩 돌리고, 아니면 홀수일 때 좌우 뒤집기) */
  private placeView(p: Placed, v?: ItemView): ItemView | null {
    const def = furnitureById(p.i);
    const variant = def ? this.variantOf(p) : "";
    const key = def && this.itemTex(p.i, variant);
    if (!def || !key) return null;
    const fp = footprint(def, p.r);
    const img = v?.img ?? this.add.image(0, 0, key);
    if (v && v.variant !== variant) img.setTexture(key);
    const left = this.tileX(p.x);
    const bottom = this.tileY(p.y + fp.h);
    if (def.turn) {
      img.setOrigin(0.5, 0.5).setPosition(left + (fp.w * T) / 2, bottom - (fp.h * T) / 2).setAngle((p.r % 4) * 90).setFlipX(false);
    } else {
      img.setOrigin(0, 1).setPosition(left, bottom).setAngle(0).setFlipX(p.r % 2 === 1);
    }
    img.setDepth(def.floor ? DEPTH.decal + bottom : itemDepthY(p, def, this.spots, this.frame));
    return { p, img, variant };
  }

  /** 상태가 바뀐 물건만 그림을 바꾼다 */
  private refreshVariant(u: string): void {
    const v = this.views.get(u);
    if (!v) return;
    const nv = this.placeView(v.p, v);
    if (nv) this.views.set(u, nv);
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
    // 배치가 바뀌었다: 1인 자리·쓸 대상을 다시 계산하고, 자리에 맞춰 가구 depth도 다시
    this.computeTargets();
    for (const v of this.views.values()) {
      const def = furnitureById(v.p.i);
      if (def && !def.floor) v.img.setDepth(itemDepthY(v.p, def, this.spots, this.frame));
    }
    this.itemBodies.clear(true, true);
    const g = this.shadows.clear();
    const rg = this.rugShadows.clear();
    for (const p of this.work.items) {
      const def = furnitureById(p.i);
      if (!def) continue;
      const fp = footprint(def, p.r);
      const x = this.tileX(p.x);
      const y = this.tileY(p.y);
      if (def.floor) {
        // 러그·돌길: 아래로 살짝 그림자
        rg.fillStyle(0x000000, 0.28);
        rg.fillRect(x + 1, y + 2, fp.w * T - 1, fp.h * T - 1);
        continue;
      }
      // 서 있는 물건: 발밑 그림자 (오른쪽 아래로 조금)
      g.fillStyle(0x140c06, 0.28);
      g.fillRoundedRect(x + 2, y + fp.h * T - 6, fp.w * T - 2, 6, 3);
      // 발밑 기준이라 위쪽 절반은 뒤로 지나갈 수 있게 조금 줄인다
      const bx = x + 2;
      const by = y + 6;
      const z = this.add.zone(bx + (fp.w * T - 4) / 2, by + (fp.h * T - 8) / 2, fp.w * T - 4, fp.h * T - 8);
      z.removeFromDisplayList();
      this.itemBodies.add(z);
    }
  }

  private applyLights(): void {
    this.glowSpots = [];
    const spots: LightSpot[] = [];
    for (const g of this.glows.filter((x) => x.r !== 0)) g.img.destroy();
    this.glows = this.glows.filter((x) => x.r === 0);
    for (const p of this.work.items) {
      const def = furnitureById(p.i);
      if (!def) continue;
      const fp = footprint(def, p.r);
      const x = this.tileX(p.x) + (fp.w * T) / 2;
      const yb = this.tileY(p.y + fp.h);
      if (def.light) {
        const y = yb - Math.min(14, artUp(p.i) + 6);
        this.glowSpots.push({ x, y, r: def.light.r, color: def.light.color });
        spots.push({ x, y, scale: def.light.r / 40, tint: def.light.color, base: 0.5 });
      }
      // 켜고 끄는 빛 (벽난로·스탠드)
      if (p.i === "fireplace" || p.i === "floor_lamp") {
        const fire = p.i === "fireplace";
        const gy = fire ? yb - 8 : yb - 26;
        const color = fire ? 0xff9a50 : 0xffe0a0;
        const img = this.add.image(x, gy, "fx-glow").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(DEPTH.lights).setAlpha(0);
        this.glows.push({ img, x, y: gy, r: fire ? 56 : 44, color, on: () => !!this.toggles.get(p.u), flicker: fire });
      }
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

  // ── 가구 쓰기 (3번) ──

  /** 배치가 바뀌면 자리·대상을 다시 계산한다 */
  private computeTargets(): void {
    this.spots = houseSpots(this.work.items, this.tier, this.frame);
    this.targets = houseTargets(this.work.items, this.tier, this.plan, this.frame);
    this.useByU = new Map();
    for (const t of this.targets) if (!this.useByU.has(t.u) || t.spot) this.useByU.set(t.u, t.use);
  }

  private isOpen(u: string): boolean {
    return !!this.toggles.get(u);
  }

  private takenByOther(id: string): boolean {
    const p = this.presence;
    if (!p) return false;
    const sid = p.seats.get(id);
    return sid !== undefined && sid !== p.client.mySid;
  }

  private readonly seatReq: SeatRequester = {
    sit: (id) => {
      if (this.presence?.spots) this.presence.sit(id);
    },
    stand: () => {
      if (this.presence?.spots) this.presence.stand();
    },
  };

  /** 대상의 지금 안내 문구 (켜짐·열림이면 끄기·닫기) */
  private labelOf(t: HouseTarget): string {
    if (t.spot && this.takenByOther(t.spot.id)) return SPOT_TAKEN_HINT[t.spot.kind];
    const on = !!this.toggles.get(t.u);
    switch (t.use) {
      case "fire":
        return on ? "벽난로 불 끄기" : USE_LABEL.fire;
      case "lamp":
        return on ? "스탠드 끄기" : USE_LABEL.lamp;
      case "window":
        return on ? "창문 닫기" : USE_LABEL.window;
      default:
        return USE_LABEL[t.use];
    }
  }

  private emitUse(u: string, a: number): void {
    this.presence?.use(u, a);
  }

  private emote(kind: EmoteIcon): void {
    this.player.view.emote(kind, performance.now());
  }

  private notice(message: string): void {
    bridge.emit("house:notice", { message });
  }

  private use(t: HouseTarget): void {
    const now = this.time.now;
    if (t.spot) {
      if (this.takenByOther(t.spot.id)) return this.notice(SPOT_TAKEN_TOAST[t.spot.kind]);
      return this.enterSpot(t.spot);
    }
    this.player.faceTo((t.rect.x0 + t.rect.x1) / 2, (t.rect.y0 + t.rect.y1) / 2, now);
    switch (t.use) {
      case "radio": {
        const ch = ((this.toggles.get(t.u) ?? 0) + 1) % (RADIO_CHANNELS + 1);
        this.toggles.set(t.u, ch);
        this.refreshVariant(t.u);
        this.sfx.play("static");
        if (ch > 0) this.sfx.play("tune");
        this.emitUse(t.u, ch);
        this.saveState(t.u, ch);
        // 내 BGM 채널을 바꾼다 (다른 사람에게는 지직 소리만)
        const st = bgm.getSnapshot();
        if (ch > 0 && st.playlists.length) {
          const pl = st.playlists[(ch - 1) % st.playlists.length];
          bgm.setPlaylist(pl.id);
          if (!st.playing) bgm.play();
          this.notice(`라디오 ${ch}번 채널: ${pl.title}`);
        } else this.notice(ch > 0 ? `라디오 ${ch}번 채널: 지지직…` : "라디오를 껐어요.");
        return;
      }
      case "fire":
      case "lamp":
      case "window": {
        const on = this.toggles.get(t.u) ? 0 : 1;
        this.applyToggle(t.u, t.use, on, 1);
        this.emitUse(t.u, on);
        this.saveState(t.u, on);
        return;
      }
      case "fridge": {
        const i = Math.floor(Math.random() * SNACKS.length);
        this.openFridge(t.u, 1);
        this.emote(SNACKS[i]);
        this.notice(`냉장고에서 ${objectWord(SNACK_NAMES[SNACKS[i]])} 꺼냈어요.`);
        this.emitUse(t.u, i);
        return;
      }
      case "pet":
        this.sfx.play("meow");
        this.emote("heart");
        this.emitUse(t.u, 0);
        return;
      case "coffee":
        this.sfx.play("coffee");
        this.time.delayedCall(1100, () => this.emote("coffee"));
        this.emitUse(t.u, 0);
        return;
      case "vend": {
        const i = Math.floor(Math.random() * DRINKS.length);
        this.sfx.play("vend");
        this.time.delayedCall(500, () => this.emote(DRINKS[i]));
        this.emitUse(t.u, i);
        return;
      }
      case "chime":
        this.sfx.play("chime");
        this.emote("note");
        this.emitUse(t.u, 0);
        return;
      case "clock":
        this.sfx.play("bong");
        this.player.view.say(clockText(Date.now()), performance.now());
        this.emitUse(t.u, 0);
        return;
      case "water":
        return this.water(t.u);
    }
  }

  /** 켜고 끄는 것 반영 (내가 했으면 gain 1, 다른 사람이면 거리 감쇠) */
  private applyToggle(u: string, use: UseKind, on: number, gain: number): void {
    this.toggles.set(u, on);
    if (use === "window") {
      this.updateWindows();
      this.sfx.play("creak", gain);
      if (on) this.nextAmbient = this.time.now + 400;
      return;
    }
    this.refreshVariant(u);
    if (use === "fire") this.sfx.play(on ? "fireOn" : "pop", gain);
    else this.sfx.play("click", gain);
  }

  private openFridge(u: string, gain: number): void {
    this.openUntil.set(u, this.time.now + 1600);
    this.refreshVariant(u);
    this.sfx.play("fridge", gain);
    this.time.delayedCall(1650, () => this.refreshVariant(u));
  }

  private water(u: string): void {
    const id = this.data0.house.id;
    housingApi
      .water(id, u)
      .then((r) => {
        if (!this.scene.isActive()) return;
        this.setPlants(r.plants, r.now);
        this.sfx.play("pour");
        this.emote("drop");
        this.notice(`화분에 물을 줬어요. ${Math.round(GROW_MS / 60_000)}분쯤 지나면 쑥 자라요.`);
        this.emitUse(u, 1);
      })
      .catch((e) => this.notice(errorMessage(e)));
  }

  /** 방 입장: 저장된 불·스탠드·라디오·창문 상태를 받아 조용히 맞춘다 */
  private loadStates(): void {
    housingApi
      .states(this.data0.house.id)
      .then((r) => {
        if (!this.scene.isActive()) return;
        let win = false;
        for (const [u, a] of Object.entries(r.states)) {
          const use = this.useByU.get(u);
          if (this.stateTouched.has(u) || (use !== "radio" && use !== "fire" && use !== "lamp" && use !== "window")) continue;
          this.toggles.set(u, a);
          if (use === "window") win = true;
          else this.refreshVariant(u);
        }
        if (win) this.updateWindows();
      })
      .catch(() => undefined);
  }

  /** 바꾼 상태를 서버에 남긴다 (나갔다 와도·나중에 온 사람도 그대로). 600ms 안의 연타는 마지막 값만 */
  private saveState(u: string, a: number): void {
    this.stateTouched.add(u);
    this.statePending.set(u, a);
    if (this.stateTimer === null) this.stateTimer = setTimeout(() => this.flushStates(), 600);
  }

  private flushStates(): void {
    if (this.stateTimer !== null) clearTimeout(this.stateTimer);
    this.stateTimer = null;
    const id = this.data0.house.id;
    for (const [u, a] of this.statePending) housingApi.setState(id, u, a).catch(() => undefined);
    this.statePending.clear();
  }

  private loadPlants(): void {
    housingApi
      .plants(this.data0.house.id)
      .then((r) => this.scene.isActive() && this.setPlants(r.plants, r.now))
      .catch(() => undefined);
  }

  private setPlants(plants: Record<string, PlantState>, serverNow: number): void {
    // 서버 시각과 내 시계 차이만큼 기록을 옮겨 둔다 (단계 계산은 내 시계로)
    const skew = Date.now() - serverNow;
    this.plants = Object.fromEntries(Object.entries(plants).map(([u, s]) => [u, { n: s.n, at: s.at + skew }]));
    for (const p of this.work.items) if (p.i === "pot") this.refreshVariant(p.u);
  }

  /** 1인 자리에 앉기·눕기·읽기·욕조 (서버 점유 요청과 동시에 자리로) */
  private enterSpot(s: HouseSpot): void {
    const now = this.time.now;
    const pre = { x: this.player.x, y: this.player.y };
    if (s.kind === "chair") {
      this.player.sit({ id: s.id, furnitureId: s.u, x: s.x, y: s.y, facing: s.facing }, now, this.seatReq);
    } else {
      const kind = s.kind === "bed" ? "lie" : s.kind === "book" ? "read" : "bath";
      this.player.attach(kind, s.x, s.y, s.y + INDOOR_FRONT, now, this.seatReq, s.id);
      this.seatReq.sit(s.id);
    }
    this.using = { spot: s, pre, at: now, next: now + 300, note: 0 };
    if (s.use === "lie") this.sfx.play("sheet");
    else if (s.use === "bath") this.sfx.play("splash");
    else if (s.use === "read") {
      const i = Math.floor(Math.random() * BOOK_LINES.length);
      this.sfx.play("page");
      this.player.view.say(BOOK_LINES[i], performance.now());
      this.emitUse(s.u, i);
    } else if (s.use === "piano") this.notice("숫자 1~8로 건반을 누르거나 E로 한 음씩 연주해요. 움직이면 일어나요.");
  }

  /** 자리에서 일어나 원래 서 있던 곳으로 */
  private exitSpot(): void {
    const u = this.using;
    if (!u) return;
    this.using = null;
    const now = this.time.now;
    if (this.player.sitting) this.player.stand(now, this.seatReq);
    else if (this.player.anchored) {
      this.player.leaveAnchor(now, true);
      this.seatReq.stand();
    }
    this.player.warp(u.pre.x, u.pre.y, now, NO_SEATS);
  }

  private onSeatDenied(id: string): void {
    if (this.using?.spot.id !== id) return;
    const kind = this.using.spot.kind;
    this.exitSpot();
    this.notice(SPOT_TAKEN_TOAST[kind]);
  }

  /** 피아노 한 음 (내가 침) */
  private playNote(i: number): void {
    const u = this.using;
    if (!u || u.spot.use !== "piano") return;
    const n = Math.max(0, Math.min(PIANO_NOTES - 1, i));
    this.sfx.note(n);
    this.emitUse(u.spot.u, n);
    if (Math.random() < 0.3) this.emote("note");
  }

  /** 다른 사람이 가구를 썼다 */
  private onRemoteUse(sid: Sid, u: string, a: number): void {
    const r = this.presence?.remotes.get(sid);
    const use = this.useByU.get(u);
    if (!use) return;
    const at = this.whereU(u) ?? (r ? { x: r.x, y: r.y } : null);
    const gain = at ? hearGain(Math.hypot(at.x - this.player.x, at.y - this.player.y)) : 0.5;
    const now = performance.now();
    switch (use) {
      case "piano":
        this.sfx.note(a, gain);
        return;
      case "read":
        if (r) r.view.say(BOOK_LINES[a % BOOK_LINES.length], now);
        this.sfx.play("page", gain);
        return;
      case "radio":
        this.stateTouched.add(u);
        this.toggles.set(u, a);
        this.refreshVariant(u);
        this.sfx.play("static", gain);
        if (a > 0) this.sfx.play("tune", gain);
        return;
      case "fire":
      case "lamp":
      case "window":
        this.stateTouched.add(u);
        this.applyToggle(u, use, a ? 1 : 0, gain);
        return;
      case "fridge":
        this.openFridge(u, gain);
        r?.view.emote(SNACKS[a % SNACKS.length], now);
        return;
      case "pet":
        this.sfx.play("meow", gain);
        r?.view.emote("heart", now);
        return;
      case "coffee":
        this.sfx.play("coffee", gain);
        r?.view.emote("coffee", now);
        return;
      case "vend":
        this.sfx.play("vend", gain);
        r?.view.emote(DRINKS[a % DRINKS.length], now);
        return;
      case "chime":
        this.sfx.play("chime", gain);
        r?.view.emote("note", now);
        return;
      case "clock":
        this.sfx.play("bong", gain);
        r?.view.emote("clock", now);
        return;
      case "water":
        this.sfx.play("pour", gain);
        r?.view.emote("drop", now);
        this.loadPlants();
        return;
    }
  }

  /** 배치 id의 가운데 (창문은 창 아래) */
  private whereU(u: string): { x: number; y: number } | null {
    const t = this.targets.find((x) => x.u === u);
    return t ? { x: (t.rect.x0 + t.rect.x1) / 2, y: (t.rect.y0 + t.rect.y1) / 2 } : null;
  }

  /** 매 프레임 가구 소리·불꽃·빛 */
  private tickUse(time: number): void {
    const p = this.player;
    // 내 자리 소리 (자판·거품·숨소리)
    const u = this.using;
    if (u && time >= u.next) {
      if (u.spot.use === "type") {
        this.sfx.play("key", 0.8);
        u.next = time + (Math.random() < 0.12 ? 500 + Math.random() * 700 : 70 + Math.random() * 110);
      } else if (u.spot.use === "bath") {
        this.sfx.play("bubble", 0.7);
        u.next = time + 500 + Math.random() * 900;
      } else if (u.spot.use === "lie") {
        if (time - u.at > 5000) this.sfx.play("snore", 0.6);
        u.next = time + 3500;
      } else u.next = time + 1000;
    }
    // 다른 사람의 자리 소리 (자판·거품): 앉아 있는 자리로 안다
    if (this.presence) {
      for (const r of this.presence.remotes.values()) {
        const use = r.seatId ? this.spots.find((s) => s.id === r.seatId)?.use : undefined;
        if (use !== "type" && use !== "bath") continue;
        const due = this.remoteTick.get(r.sid) ?? 0;
        if (time < due) continue;
        const gain = hearGain(Math.hypot(r.x - p.x, r.y - p.y));
        if (use === "type") {
          this.sfx.play("key", 0.8 * gain);
          this.remoteTick.set(r.sid, time + (Math.random() < 0.12 ? 500 + Math.random() * 700 : 70 + Math.random() * 110));
        } else {
          this.sfx.play("bubble", 0.7 * gain);
          this.remoteTick.set(r.sid, time + 600 + Math.random() * 900);
        }
      }
    }
    // 벽난로: 불꽃 두 장 번갈아 + 타닥 소리
    if (time >= this.flameAt) {
      this.flameAt = time + 220;
      this.flameFrame ^= 1;
      for (const it of this.work.items) {
        if (it.i !== "fireplace" || !this.toggles.get(it.u)) continue;
        this.refreshVariant(it.u);
        const at = this.whereU(it.u);
        if (at && Math.random() < 0.45) this.sfx.play("pop", 0.7 * hearGain(Math.hypot(at.x - p.x, at.y - p.y)));
      }
    }
    // 열린 창: 바깥 소리 (낮 새소리·밤 귀뚜라미·가끔 바람)
    if (time >= this.nextAmbient) {
      this.nextAmbient = time + 1200 + Math.random() * 2500;
      this.plan.windows.forEach((w, i) => {
        if (!this.isOpen(`w${i}`)) return;
        const x = this.tileX(w.x + w.w / 2);
        const gain = 0.8 * hearGain(Math.hypot(x - p.x, this.oy - p.y));
        const pick: HouseSound = Math.random() < 0.15 ? "wind" : this.night ? "cricket" : "bird";
        this.sfx.play(pick, gain);
      });
    }
    // 화분은 시간이 지나면 자란다 (30초마다 단계 다시 보기)
    if (time >= this.plantClock) {
      this.plantClock = time + 30_000;
      for (const it of this.work.items) if (it.i === "pot") this.refreshVariant(it.u);
    }
  }

  // ── 플레이 ──

  private nearSign(): boolean {
    return Math.hypot(this.player.x - this.sign.x, this.player.y - this.sign.y) < NEAR_SIGN;
  }

  private onAction(a: KeyAction): void {
    if (this.exiting || this.editing) return;
    const now = this.time.now;
    if (this.using) {
      // 피아노 앞: E = 가락 한 음, 1·2(손 흔들기·환호 키)는 건반 → onKey가 친다
      if (this.using.spot.use === "piano" && a === "interact") {
        const u = this.using;
        this.playNote(TWINKLE[u.note % TWINKLE.length]);
        u.note++;
        return;
      }
      if (this.using.spot.use === "piano" && (a === "wave" || a === "cheer")) return;
      if (a === "interact" || a === "jump" || a === "sit") this.exitSpot();
      return;
    }
    if (a === "interact" && this.nearSign()) {
      this.player.faceTo(this.sign.x, this.sign.y, now);
      bridge.emit("house:guestbook");
      return;
    }
    if (a === "interact" && this.target) {
      this.use(this.target);
      return;
    }
    if (a === "wave" || a === "cheer") {
      this.presence?.act(a);
      return;
    }
    // 3~9 이모티콘 판 (월드와 같은 키)
    if (a.startsWith("emo")) {
      const slot = emoSlotOfKey(Number(a.slice(3)));
      if (slot?.kind === "emo") this.presence?.emo(slot.id);
      return;
    }
    if (a === "jump") this.player.jump(now, NO_SEATS);
    else if (a === "sit") {
      if (this.player.sitting) this.player.stand(now, NO_SEATS);
      else this.player.sit(null, now, NO_SEATS);
    }
  }

  update(time: number, delta: number): void {
    if (this.exiting) return;
    const input = this.data0.input;
    input.read(this.move);
    if (input.isBlocked || this.editing) this.move.ax = this.move.ay = 0;
    this.player.update(this.move, time, this.using ? this.seatReq : NO_SEATS);
    // 움직여서 자리에서 일어났다 → 원래 서 있던 곳으로 (가구 안에 끼지 않게)
    if (this.using && !this.player.sitting && !this.player.anchored) {
      const u = this.using;
      this.using = null;
      if (u.spot.kind !== "chair") this.seatReq.stand();
      this.player.warp(u.pre.x, u.pre.y, time, NO_SEATS);
    }
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
    // 가구 안내 (가장 가까운 것 하나)
    this.target = this.editing || this.using ? null : pickTarget(this.targets, this.player.x, this.player.y, (id) => this.takenByOther(id));
    const nearSign = !this.editing && this.nearSign();
    this.prompt.setScale(s).setVisible(nearSign);
    this.titleLabel.setScale(s);
    this.updateUsePrompt(s, nearSign);
    this.tickUse(time);

    const view = cam.worldView;
    this.view.setTo(view.x, view.y, view.width, view.height);
    this.atmos.update(time, Math.min(delta, 100), this.view);
    const L = this.atmos.levels;
    const night = L.glow > NIGHT_GLOW;
    if (night !== this.night) {
      this.night = night;
      this.updateWindows();
    }
    const lantern = this.player.view.lantern;
    const r = playerLightRadius(L.glow, lantern);
    this.playerGlow
      .setPosition(this.player.x, this.player.y - 9)
      .setScale((r * 1.6) / 64)
      .setAlpha((0.05 + 0.13 * L.glow) * Math.min(1, L.darkness * 3));
    // 켜진 빛 (벽등·벽난로·스탠드): 밤일수록 또렷
    const glowK = 0.25 + 0.75 * L.glow;
    for (const g of this.glows) {
      const on = g.on();
      const fl = g.flicker ? 0.85 + 0.15 * Math.sin(time / 90 + g.x) * Math.sin(time / 37) : 1;
      const rr = g.r || 34;
      g.img.setScale((rr * 2) / 64).setAlpha(on ? 0.5 * glowK * fl : 0);
    }
    this.lighting.begin(this.view, L.darkness);
    if (L.darkness > 0.004) {
      this.lighting.add(this.player.x, this.player.y - 8, this.editing ? Math.max(r, 160) : r, 0.92);
      for (const l of this.glowSpots) this.lighting.add(l.x, l.y, l.r * 2.2, 0.75 + 0.05 * Math.sin(time / 300 + l.x));
      for (const g of this.glows) if (g.on()) this.lighting.add(g.x, g.y, (g.r || 40) * 2.4, 0.85);
      // 밤에는 방마다 천장 조명이 켜진다
      if (night)
        for (const room of this.plan.rooms) {
          const cx = this.tileX((room.x0 + room.x1) / 2);
          const cy = this.tileY(this.tier.h / 2);
          this.lighting.add(cx, cy, Math.max(room.x1 - room.x0, this.tier.h) * T * 0.75, 0.7);
        }
      this.lighting.add(this.sign.x, this.sign.y - 10, 26, 0.5);
    }
    this.lighting.end();

    if (this.editing) return;
    // 문 밖 아래 끝까지 내려가면 나간다
    if (this.player.y < this.H - 22) this.armed = true;
    if (this.armed && this.player.y > this.H - 12 && this.move.ay > 0) this.leave();
  }

  private updateUsePrompt(s: number, nearSign: boolean): void {
    const p = this.usePrompt;
    let text = "";
    let x = 0;
    let y = 0;
    let grey = false;
    if (this.using && !this.editing) {
      const u = this.using;
      text = u.spot.use === "piano" ? "1~8 건반 · E 연주 · 움직이면 일어나기" : "E · 일어나기";
      x = this.player.x;
      y = this.player.y + 14;
      p.setOrigin(0.5, 0);
    } else if (this.target && !nearSign) {
      const t = this.target;
      grey = !!t.spot && this.takenByOther(t.spot.id);
      text = grey ? this.labelOf(t) : `E · ${this.labelOf(t)}`;
      x = (t.rect.x0 + t.rect.x1) / 2;
      y = t.use === "window" ? this.oy + 2 : t.rect.y0 - Math.min(16, artUp(t.item) + 2);
      if (t.use === "window") p.setOrigin(0.5, 0);
      else p.setOrigin(0.5, 1);
    }
    if (!text) {
      p.setVisible(false);
      return;
    }
    if (p.text !== text) p.setText(text);
    p.setPosition(x, y).setScale(s).setTint(grey ? 0xa8a49a : 0xffe39a).setVisible(true);
  }

  leave(): void {
    if (this.exiting) return;
    if (this.using) this.exitSpot();
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
    if (on && this.using) this.exitSpot();
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
      // 위 정보 막대(약 90px)와 아래 편집 도구(화면 높이의 약 40%) 사이에 집이 들어오게 줌·위치를 맞춘다
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
    // 3번 피아노 앞: 숫자 1~8 = 건반 (도레미파솔라시도)
    if (!this.editing && this.using?.spot.use === "piano" && !this.data0.input.isBlocked && !e.repeat) {
      const m = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
      if (m) {
        this.playNote(Number(m[1]) - 1);
        e.preventDefault();
        return;
      }
    }
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
    // 치우거나 옮긴 가구의 켜짐 상태는 서버처럼 지운다 (창문 "w0"…은 배치가 아니라 그대로)
    const before = new Map((JSON.parse(this.baseline) as HouseLayout).items.map((p) => [p.u, placedSig(p)]));
    const after = new Map(house.layout.items.map((p) => [p.u, placedSig(p)]));
    for (const u of [...this.toggles.keys()]) if ((before.has(u) || after.has(u)) && before.get(u) !== after.get(u)) this.toggles.delete(u);
    this.work = structuredClone(house.layout);
    this.baseline = JSON.stringify(this.work);
    this.refreshAll();
    this.changed();
  }

  /** 테스트·디버그용 */
  get debugState() {
    return {
      editing: this.editing,
      items: this.work.items.length,
      selected: this.selected,
      player: { x: this.player.x, y: this.player.y, state: this.player.state },
      H: this.H,
      // 3번 QA: 쓸 대상·자리·켜짐 상태
      using: this.using ? { id: this.using.spot.id, use: this.using.spot.use } : null,
      target: this.target ? { key: this.target.key, use: this.target.use } : null,
      targets: this.targets.map((t) => ({ key: t.key, use: t.use, u: t.u, item: t.item, rect: t.rect, spot: t.spot ? { id: t.spot.id, x: t.spot.x, y: t.spot.y } : null })),
      toggles: Object.fromEntries(this.toggles),
      seats: Object.fromEntries(this.presence?.seats ?? []),
      night: this.night,
      plants: this.plants,
    };
  }
}
