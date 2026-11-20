import * as Phaser from "phaser";
import { DIR, STATE, type DirId, type Sid } from "@tomb/protocol";
import { bgm } from "@/components/bgm/engine";
import { furnitureById, tierById, type PlotTier } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { buildOccupancy, findFreeSpot, footprint, gateTiles, newUid, nextRotation, SPIN_R0, spinDir } from "@/lib/housing/layout";
import { GROW_MS, plantStage, type PlantState } from "@/lib/housing/plants";
import { roomPlan, type RoomPlan } from "@/lib/housing/rooms";
import { placedSig } from "@/lib/housing/states";
import type { HouseLayout, Placed, PublicHouse } from "@/lib/housing/types";
import { errorMessage } from "@/lib/api";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import { INDOOR_FRONT } from "../entities/RemoteAvatar";
import { SAY_MS } from "../entities/SpeechBubble";
import type { InputHub } from "../input/InputHub";
import { interactLabel, isTouchUi, keyJosa } from "../input/keyHint";
import type { KeyAction } from "../input/Keyboard";
import { SPOT_TAKEN_HINT, SPOT_TAKEN_TOAST } from "../logic/spots";
import { besideFriend, findFollowed, FRIEND_ARRIVED, followDeadline } from "../logic/friendSpot";
import { standUpSpot } from "../logic/standUp";
import { emoSlotOfKey } from "../logic/emoBoard";
import { atExitDoor, type DoorGap } from "../logic/doorExit";
import { setDoorHint } from "../logic/doorHint";
import type { MoveInput } from "../logic/movement";
import { RoomPresence } from "../net/RoomPresence";
import type { NetPose } from "../net/sendThrottle";
import type { EmoteIcon } from "../sprites/emotes";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { Lighting, playerLightRadius } from "../world/Lighting";
import type { LightSpot } from "../world/WorldMap";
import { animFrames, artUp, DOG_BREATH_FRAMES, drawsTurned, floorGrid, furnitureGrid, hasNightArt, itemVariant, noFootShadow, sconceGrid, usesNightVariant, wallCapColor, wallFaceColor, WALL_H, wallGrid, windowGrid, WINDOW_W, yardGrid, zzzGrid } from "./art";
import type { HouseEditState, HouseTool } from "./events";
import { wornRingGrid } from "./seaFurnitureArt";
import { HouseSfx, hearGain, type HouseSound } from "./houseSfx";
import { HouseZoom } from "./houseZoom";
import {
  BOOK_LINES,
  BUSH_FINDS,
  clockText,
  DRINKS,
  FRAME_LINES,
  PRAY_LINES,
  RING_WEAR_MS,
  SHELL_LINE,
  SURF_LINES,
  WHEEL_LINES,
  houseSpots,
  houseTargets,
  itemDepthY,
  pickTarget,
  PIANO_NOTES,
  pickPondSeat,
  pondSeats,
  rugSeat,
  type PondSeat,
  RADIO_CHANNELS,
  SNACK_NAMES,
  SNACKS,
  TWINKLE,
  USE_LABEL,
  type HouseSpot,
  type HouseTarget,
  type PondSide,
  type StandSpot,
  type UseKind,
} from "./interact";
import { SEASON_FX, SEASON_LIGHTS, seasonLightLabel } from "./seasonUse";
import { BREED_PET_P1_MS, BREED_PET_P2_MS, isBreedFurniture, isCatFurniture } from "./breedFurnitureArt";

// 개인 집(하우징) 씬 — 3번 집 안 개편. 방문자끼리 같은 방(room "house:{id}")으로 서로 보이고 들린다.
//  - 집 안: 안쪽 벽(벽지·몰딩·걸레받이·창문·벽등) + 옆벽 + 앞벽(현관문) + 바닥 스킨. 넓은 터·대저택은 칸막이 벽으로 방이 나뉜다(lib/housing/rooms.ts).
//  - 낮에는 창으로 햇빛이 들고, 밤에는 창밖이 어두워지고 벽등·방 조명이 켜진다 (Atmosphere glow 기준).
//  - 가구 쓰기(game/housing/interact.ts): 앉기·눕기·읽기·욕조는 1인 자리(방 서버 좌석, 한 자리 한 명),
//    피아노 음·라디오·벽난로·스탠드·냉장고·고양이·커피·자판기·풍경·시계·화분·창문은 use 이벤트로 방 사람들에게 알린다.
//  - 아래 문 밖에서 시작하고, 문 밖으로 걸어 내려가면 월드(분양 사무소 앞)로 돌아간다.
//  - 주인은 편집 모드에서 물건을 끌어 옮기고(마우스·터치), 방향키로 한 칸씩 옮기고, R 돌리기(4방향·turn 가구)·뒤집기(나머지), Delete 치우기.
//    편집 결과는 house:state로 UI에 알리고, 저장은 UI가 API로 한다 (저장되면 house:data로 다시 받는다).

/** 따라 들어온 뒤 친구가 방에 보이기를 기다리는 시간 (방 접속·친구 목록 받기 포함) */
const FOLLOW_WAIT_MS = 12_000;

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
/** 11/19 시즌 가구를 쓸 때 이모티콘을 띄워 두는 시간 (그다음 한마디 말풍선) */
const SEASON_EMOTE_MS = 800;
/** 11/16 집 안 해먹에 누운 사람 depth: 해먹 가구 그림(아래 끝 = 칸 아래 끝)보다 앞 (interact seaHammockSpot 앵커 기준) */
const hammockDepth = (s: HouseSpot) => s.y + (s.tilt ? 32 : 7);
const ZOOM_MIN = 1.5;
const NEAR_SIGN = 22;
/** 밤 판정 (Atmosphere glow: 낮 0.1 … 밤 1) */
const NIGHT_GLOW = 0.55;

/** 받침에 맞춰 을/를 (사과를·삼각김밥을) */
const objectWord = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return w + (c >= 0 && c < 11172 && c % 28 !== 0 ? "을" : "를");
};

/** 피아노 앞에 앉아 있을 때 안내 (터치는 숫자 키가 없어 [상호작용]으로 한 음씩) */
const pianoPrompt = (touch: boolean) => (touch ? "연주하기 · 움직이면 일어나기" : "1~8 건반 · E 연주 · 움직이면 일어나기");

/** 화면에 뜰 수 있는 안내 문구 전부 (비트맵 글꼴에 미리 글자를 올린다). 데스크톱·터치 문구 둘 다 */
const allPrompts = () =>
  [...Object.values(USE_LABEL), ...Object.values(SPOT_TAKEN_HINT), "벽난로 불 끄기", "스탠드 끄기", "창문 닫기", pianoPrompt(false), pianoPrompt(true), "E · 일어나기", "E · 나가기"].join("");

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
  /** 11/19 가구를 쓴 직후 그 가구의 E 안내를 잠깐 숨긴다 (머리 위 한마디 말풍선과 겹쳐 읽히지 않게) */
  private promptQuiet: { u: string; until: number } | null = null;
  /** 현관 문 칸 (앞벽의 빈 두 칸, 문턱 = 앞벽 아래) — 문 앞에서 E로 나간다 (logic/doorExit) */
  private exitGap: DoorGap = { x0: 0, x1: 0, y: 0 };
  private titleLabel!: Phaser.GameObjects.BitmapText;
  private sign = { x: 0, y: 0 };
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  /** 같은 방(이 집) 사람들 */
  private presence: RoomPresence | null = null;
  private readonly pose: NetPose = { x: 0, y: 0, state: 0, dir: 0 };
  private presenceAt = 0;
  private presenceKey = "";
  /** 친구한테 가기로 따라 들어왔다: 이 이름의 친구가 방에 보이면 그 옆으로 옮긴다 (until = 기다리는 끝 시각) */
  private follow: { name: string; until: number } | null = null;
  private readonly view = new Phaser.Geom.Rectangle();
  private exiting = false;

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
  /** 연못 잔물결 장면 (동작 줄이기면 0에 멈춘다) */
  private pondAt = 0;
  private pondFrame = 0;
  /** 잠자는 강아지 숨 장면·가끔 떠오르는 z (동작 줄이기면 멈춘다) */
  private dogAt = 0;
  private dogFrame = 0;
  private dogZAt = 0;
  /** 11/19 품종 펫 가구가 가끔 하품하는 다음 시각 */
  private napYawnAt = 0;
  /** 밤에 달빛이 비치는 연못 자리 */
  private pondSpots: { x: number; y: number; r: number }[] = [];
  /** 잠깐 바뀌는 그림 (끄적인 화이트보드·눌린 오리·흔들리는 덤불…): u → 변형·끝나는 시각 */
  private flash = new Map<string, { v: string; until: number }>();
  /** 연못가 자리 (연못 u별 네 물가) — 배치가 바뀔 때 다시 계산 */
  private pondSeatList: (PondSeat & { u: string })[] = [];
  /** 내가 앉은 연못가 (앉아 있는 동안 연못 몸통과 부딪히지 않는다) */
  private pondSit: (PondSeat & { u: string }) | null = null;
  /** 연못가에 앉은 사람(나 "me"·다른 사람 sid) → 물에 잠긴 발끝을 덮는 물빛 조각 */
  private pondFeet = new Map<string, Phaser.GameObjects.Graphics>();
  /** 디딤돌 칸 (밟으면 발소리) */
  private stoneTiles = new Set<number>();
  private stepAt = 0;
  /** 다른 사람 자판·거품 소리 타이머 (sid → 다음 시각) */
  private remoteTick = new Map<Sid, number>();
  private varTick = 0;

  // ── 편집 ──
  private editing = false;
  private work: HouseLayout = { items: [], floor: "", wall: "" };
  private baseline = "";
  private selected: string | null = null;
  /** 상점에서 "놓아 보기"로 얹은 물건의 배치 id (가방에 없는 물건: 반투명, 저장·점수에서 빠진다) */
  private trialU: string | null = null;
  private drag: { u: string; offX: number; offY: number; from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  private pan: { sx: number; sy: number; cx: number; cy: number } | null = null;
  /** 마우스 휠·두 손가락 확대·축소 (마을과 같은 규칙·한계) */
  private zoomer: HouseZoom | null = null;
  private unsubs: (() => void)[] = [];

  constructor() {
    super("house");
  }

  init(data: HouseSceneData): void {
    this.data0 = data;
    this.tier = tierById(data.house.tier) ?? tierById("small")!;
    this.plan = roomPlan(this.tier);
    this.exiting = false;
    this.editing = false;
    this.selected = null;
    this.trialU = null;
    this.drag = null;
    this.pan = null;
    this.views = new Map();
    this.pondSpots = [];
    this.flash = new Map();
    this.stoneTiles = new Set();
    this.pondSeatList = [];
    this.pondSit = null;
    this.pondFeet = new Map();
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
    this.follow = null;
    this.promptQuiet = null;
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
    const guestbook = interactLabel("방명록 보기");
    atlas.ensure(title + guestbook + house.ownerName + "의 집" + allPrompts());
    this.titleLabel = this.add
      .bitmapText(this.W / 2, this.oy - WALL_H - 4, FONT_KEY, title, FONT_PX)
      .setOrigin(0.5, 1)
      .setTint(0xf2ead3)
      .setDepth(DEPTH.labels);
    const [g0, g1] = gateTiles(t);
    const outY = this.oy + t.h * T + FRONT_H;
    // 문턱 = 앞벽 윗줄 → 판정은 현관 앞 칸(방 안 마지막 줄)부터 현관·마당까지 (DOOR_PAD 한 칸 둘레)
    this.exitGap = { x0: this.ox + g0.x * T, x1: this.ox + (g1.x + 1) * T, y: this.oy + t.h * T };
    this.sign = { x: this.ox + g0.x * T - 14, y: outY + 18 };
    this.add.rectangle(this.sign.x, this.sign.y - 6, 2, 12, 0x553722).setDepth(this.sign.y);
    this.add.rectangle(this.sign.x, this.sign.y - 13, 14, 9, 0x9c6d45).setDepth(this.sign.y + 0.1).setStrokeStyle(1, 0x1a1612);
    this.add.rectangle(this.sign.x, this.sign.y - 14, 8, 1, 0x3a2c22).setDepth(this.sign.y + 0.2);
    this.add.rectangle(this.sign.x, this.sign.y - 11, 6, 1, 0x3a2c22).setDepth(this.sign.y + 0.2);
    this.prompt = this.add
      .bitmapText(this.sign.x, this.sign.y - 20, FONT_KEY, guestbook, FONT_PX)
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
    // 친구 창의 [친구한테 가기]로 이 집에 따라 들어왔으면 친구를 찾아 옆으로 (30초 넘게 지난 부탁은 버린다)
    const f = bridge.last("house:follow");
    // 기다림의 기준은 게임 루프 시각: 씬 시계(this.time.now)는 create 때 아직 옛 값이다 (followDeadline 설명)
    this.follow = f && f.houseId === this.data0.house.id && Date.now() - f.at < 30_000 ? { name: f.name, until: followDeadline(this.game.loop.time, FOLLOW_WAIT_MS) } : null;
    if (f) bridge.emit("house:follow", null);
    this.physics.add.collider(this.player.sprite, this.wallBodies);
    // 연못가에 걸터앉은 동안은 연못 몸통과 부딪히지 않는다 (발이 물 안까지 들어간다)
    this.physics.add.collider(this.player.sprite, this.itemBodies, undefined, () => !this.pondSit, this);
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
    // 휠·핀치 줌: 창이 떠 있어 게임 키가 막혀 있으면 받지 않는다. 두 손가락이 닿으면 편집 끌기는 그만둔다
    this.zoomer = new HouseZoom(canvas, cam.zoom, () => !this.data0.input.isBlocked, () => this.cancelDrag());
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
      this.zoomer?.destroy();
      this.zoomer = null;
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

  /** 지금 상태에 맞는 그림 변형 (불 켜짐·문 열림·화분 단계 + 4방향 가구의 방향) */
  private variantOf(p: Placed): string {
    const base = this.baseVariantOf(p);
    return furnitureById(p.i)?.spin ? itemVariant(p.i, base, { r: p.r }) : base;
  }

  private baseVariantOf(p: Placed): string {
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
      case "pond":
        // 돌린 방향(세로 그림)·밤(달)·잔물결 장면
        return itemVariant(p.i, "", { r: p.r, night: this.night, frame: this.data0.reduced ? 0 : this.pondFrame });
      case "sea_hammock":
        return this.hammockBusy().has(p.u) ? "lie" : "";
      case "leaf_shade": {
        // 11/20 이파리 햇빛가리개: 낮에만 바닥에 잎 그림자 (밤 조각 n이면 안 그린다) + 써 보면 잎이 살랑 (sway)
        const f = this.flash.get(p.u);
        return [f && f.until > this.time.now ? f.v : "", this.night ? "n" : ""].filter(Boolean).join("-");
      }
      case "sleepy_dog": {
        // 쓰다듬으면 잠깐 꼬리 끝이 들리고(wag), 평소엔 숨 장면 (동작 줄이기면 0에 멈춘다)
        const f = this.flash.get(p.u);
        if (f && f.until > this.time.now) return f.v;
        return this.dogFrame ? `b${this.dogFrame}` : "";
      }
      case "stone_lantern":
      case "candles":
      case "sea_lantern":
      case "ghost_lamp":
        // 값 1 = 꺼짐 (처음부터 켜져 있던 가구)
        return this.toggles.get(p.u) ? "off" : "";
      default: {
        // 11/19 시즌 불빛 가구도 같은 규칙 (값 1 = 꺼짐)
        if (SEASON_LIGHTS.has(p.i)) return this.toggles.get(p.u) ? "off" : "";
        const f = this.flash.get(p.u);
        if (f && f.until > this.time.now) return f.v;
        // 11/19 품종 펫 가구: 잠자는 강아지와 같은 박자로 숨 장면(눈 깜빡 + 꼬리 끝 살랑)
        return isBreedFurniture(p.i) && this.dogFrame ? "b1" : "";
      }
    }
  }

  /** 잠깐 다른 그림으로 바꿨다가 되돌린다 (ms 뒤) */
  private flashVariant(u: string, v: string, ms: number): void {
    this.flash.set(u, { v, until: this.time.now + ms });
    this.refreshVariant(u);
    this.time.delayedCall(ms + 30, () => {
      const f = this.flash.get(u);
      if (f && f.until <= this.time.now) {
        this.flash.delete(u);
        this.refreshVariant(u);
      }
    });
  }

  /** 꺼 둔 석등·촛대 */
  private isDark(p: Placed): boolean {
    return (p.i === "stone_lantern" || p.i === "candles" || p.i === "sea_lantern" || p.i === "ghost_lamp" || SEASON_LIGHTS.has(p.i)) && !!this.toggles.get(p.u);
  }

  /** 물건 그림의 불투명도: 놓아 보는 물건은 반투명, 끌어서 못 놓는 자리면 더 흐리게 */
  private alphaOf(u: string, ok = true): number {
    const a = u === this.trialU ? 0.62 : 1;
    return ok ? a : a * 0.55;
  }

  /** 물건 하나 놓기 (r: turn 물건은 90°씩 돌리고, 아니면 홀수일 때 좌우 뒤집기) */
  private placeView(p: Placed, v?: ItemView): ItemView | null {
    const def = furnitureById(p.i);
    const variant = def ? this.variantOf(p) : "";
    const key = def && this.itemTex(p.i, variant);
    if (!def || !key) return null;
    const fp = footprint(def, p.r);
    const img = v?.img ?? this.add.image(0, 0, key).setAlpha(this.alphaOf(p.u));
    // 그림이 바뀌면 보기 기록(variant)도 같이 고친다: tryMove·끌기처럼 돌려받은 보기를 다시 넣지 않는 길에서도
    // 다음 비교가 맞아야 한 바퀴 돌린 뒤 처음 그림(앞모습)으로 돌아온다
    if (v && v.variant !== variant) {
      img.setTexture(key);
      v.variant = variant;
    }
    const left = this.tileX(p.x);
    const bottom = this.tileY(p.y + fp.h);
    if (def.turn && drawsTurned(p.i)) {
      // 돌린 모습을 따로 그린 물건(연못): 그림은 돌리지 않고 r≥2면 좌우만 뒤집는다 (빛이 늘 왼쪽 위에서)
      img.setOrigin(0.5, 0.5).setPosition(left + (fp.w * T) / 2, bottom - (fp.h * T) / 2).setAngle(0).setFlipX(p.r % 4 >= 2);
    } else if (def.turn) {
      img.setOrigin(0.5, 0.5).setPosition(left + (fp.w * T) / 2, bottom - (fp.h * T) / 2).setAngle((p.r % 4) * 90).setFlipX(false);
    } else {
      // 4방향 가구는 오른쪽을 볼 때 옆모습을 뒤집고, 예전 값(0~3)·다른 물건은 홀수면 좌우 뒤집기
      const flip = def.spin && p.r >= SPIN_R0 ? spinDir(p.r) === 3 : p.r % 2 === 1;
      img.setOrigin(0, 1).setPosition(left, bottom).setAngle(0).setFlipX(flip);
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
      // 서 있는 물건: 발밑 그림자 (오른쪽 아래로 조금). 바닥에 낮게 깔린 연못은 빼고
      if (!noFootShadow(p.i)) {
        g.fillStyle(0x140c06, 0.28);
        g.fillRoundedRect(x + 2, y + fp.h * T - 6, fp.w * T - 2, 6, 3);
      }
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
    this.pondSpots = [];
    const spots: LightSpot[] = [];
    for (const g of this.glows.filter((x) => x.r !== 0)) g.img.destroy();
    this.glows = this.glows.filter((x) => x.r === 0);
    for (const p of this.work.items) {
      const def = furnitureById(p.i);
      if (!def) continue;
      const fp = footprint(def, p.r);
      const x = this.tileX(p.x) + (fp.w * T) / 2;
      const yb = this.tileY(p.y + fp.h);
      if (hasNightArt(p.i)) this.pondSpots.push({ x, y: yb - (fp.h * T) / 2, r: Math.max(fp.w, fp.h) * T * 0.9 });
      if (def.light && !this.isDark(p)) {
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
    this.zoomer?.reset(cam.zoom);
    this.applyBounds();
  }

  /** 지금 줌에 맞춘 카메라 경계 (화면이 집보다 넓으면 집이 가운데 오게) */
  private applyBounds(): void {
    const cam = this.cameras.main;
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
    this.stoneTiles = new Set(this.work.items.filter((p) => p.i === "stone_path").map((p) => p.y * 1000 + p.x));
    this.pondSeatList = this.work.items.filter((p) => p.i === "pond").flatMap((p) => pondSeats(p, this.work.items, this.tier, this.frame).map((s) => ({ ...s, u: p.u })));
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
      case "light":
        return seasonLightLabel(t.item, on) ?? (on ? "불 켜기" : USE_LABEL.light);
      case "season":
        return furnitureById(t.item)?.use ?? USE_LABEL.season;
      case "breed":
        return furnitureById(t.item)?.use ?? USE_LABEL.breed;
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
    // 쓴 가구의 E 안내는 말풍선이 떠 있는 동안 숨긴다
    this.promptQuiet = { u: t.u, until: now + SAY_MS };
    // 11/19 시즌 가구: 돌린 앞쪽 빈 칸에 서서 가구를 바라본다 (설 자리가 없으면 선 자리에서 바라보기만)
    if (t.stand) this.standAt(t.stand);
    else this.player.faceTo((t.rect.x0 + t.rect.x1) / 2, (t.rect.y0 + t.rect.y1) / 2, now);
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
      case "window":
      case "light": {
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
      case "dog":
        this.petDog(t.u, 1);
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
      default:
        return this.useMore(t);
    }
  }

  // ── 모든 가구 상호작용 (연출만: 포인트·아이템은 주지 않는다. 같은 방 사람에게는 use 이벤트로 같은 연출) ──

  /** 11/19 가구 앞 설 자리로 옮겨 가구를 바라본다 (앉아 있었으면 일어난다). 다른 사람 화면에도 그 자리로 보인다 */
  private standAt(s: StandSpot): void {
    const now = this.time.now;
    if (this.using) this.exitSpot();
    this.player.warp(s.x, s.y, now, NO_SEATS);
    this.presence?.client.warp(s.x, s.y);
    const [dx, dy] = s.facing === DIR.up ? [0, -8] : s.facing === DIR.down ? [0, 8] : s.facing === DIR.left ? [-8, 0] : [8, 0];
    this.player.faceTo(s.x + dx, s.y + dy, now);
  }

  /** 11/19 시즌 가구 써 보기 연출 (내가 쓴 것·다른 사람이 쓴 것 공용). a = 한마디 번호 */
  private playSeason(u: string, item: string, a: number, gain: number, view: { emote(k: EmoteIcon, now: number, ms?: number): void; say(t: string, now: number): void } | undefined): void {
    const fx = SEASON_FX[item];
    if (!fx) return;
    if (fx.v) this.flashVariant(u, fx.v, fx.ms ?? 1200);
    if (fx.sfx) this.sfx.play(fx.sfx, gain);
    // 말풍선은 한 자리 하나라 이모티콘을 먼저 짧게 띄우고 한마디로 바꾼다 (한마디가 없으면 이모티콘만)
    const line = fx.lines?.length ? fx.lines[a % fx.lines.length] : null;
    if (fx.emote) view?.emote(fx.emote, performance.now(), line ? SEASON_EMOTE_MS : undefined);
    if (line) {
      if (fx.emote) this.time.delayedCall(SEASON_EMOTE_MS, () => view?.say(line, performance.now()));
      else view?.say(line, performance.now());
    }
  }

  /** 바닥에 앉는다 (러그·꽃밭·연못가·나무 밑). 자리 없이 여럿이 앉을 수 있고, 움직이면 일어난다 */
  private sitGroundAt(x: number, y: number, dir: DirId): void {
    const now = this.time.now;
    if (this.using) this.exitSpot();
    this.player.warp(x, y, now, NO_SEATS);
    this.presence?.client.warp(x, y);
    this.player.dir = dir;
    this.player.sit(null, now, null);
  }

  private useMore(t: HouseTarget): void {
    const r = t.rect;
    const cx = (r.x0 + r.x1) / 2;
    const p = this.player;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    switch (t.use) {
      case "dip": {
        // 연못 둘레 네 물가 중 내가 선 쪽에서 가장 가까운 빈 물가에 연못을 보고 앉아 발을 담근다: 첨벙 + 잔물결
        const pond = this.work.items.find((x) => x.u === t.u);
        const others = this.presence ? [...this.presence.remotes.values()] : [];
        const seat = pond && pickPondSeat(pond, this.work.items, this.tier, this.frame, p.x, p.y, (x, y) => others.some((o) => Math.hypot(o.x - x, o.y - y) < 7));
        if (!seat) return this.notice("연못 둘레에 앉을 물가가 없어요. 둘레의 가구를 조금 옮겨 주세요.");
        this.pondSit = { ...seat, u: t.u };
        this.sitGroundAt(seat.x, seat.y, seat.facing);
        this.fxDip(t.u, 1, seat.side);
        this.emote("drop");
        this.emitUse(t.u, seat.side);
        return;
      }
      case "lean":
        this.sitGroundAt(cx, r.y1 + 1, DIR.down);
        this.sfx.play("rustle", 0.4);
        this.time.delayedCall(1200, () => this.emote("zzz"));
        this.emitUse(t.u, 0);
        return;
      case "breed":
        // 11/19 품종 펫 가구: 앞에 서서(seasonStandSpot) 쓰다듬으면 하트 + 품종 동작 (p1 → p2)
        this.petBreed(t.u, t.item, 1);
        this.emote("heart");
        this.emitUse(t.u, 0);
        return;
      case "season": {
        const fx = SEASON_FX[t.item];
        const i = fx?.lines?.length ? Math.floor(Math.random() * fx.lines.length) : 0;
        if (fx?.jump) p.jump(this.time.now, null);
        this.playSeason(t.u, t.item, i, 1, p.view);
        this.emitUse(t.u, i);
        return;
      }
      case "rug":
        // 11/19 니트 러그: 가구가 없는 러그 칸 중 가까운 곳에 앉고, 옆 칸에 가구(코코아 탁자…)가 있으면 그쪽을 본다
        if (t.item === "knit_rug") {
          const rug = this.work.items.find((x) => x.u === t.u);
          const seat = rug && rugSeat(rug, this.work.items, this.tier, this.frame, p.x, p.y);
          if (!seat) return this.notice("러그 위가 가구로 꽉 찼어요.");
          this.sitGroundAt(seat.x, seat.y, seat.facing);
          this.sfx.play("sheet", 0.6);
          this.emitUse(t.u, 0);
          return;
        }
      // falls through
      case "smell":
        // 지금 선 자리에서 가장 가까운 러그·꽃밭 위
        this.sitGroundAt(clamp(p.x, r.x0 + 4, r.x1 - 4), clamp(p.y, r.y0 + 8, r.y1 - 2), DIR.down);
        this.sfx.play("sheet", 0.6);
        if (t.use === "smell") {
          this.emote("flower");
          this.fxPuffs(cx, r.y0 + 6, [0xf0a0c0, 0xf0e080, 0xf6f2e8], 5, false);
        }
        this.emitUse(t.u, 0);
        return;
      case "tea":
        this.sfx.play("pour");
        this.fxPuffs(cx, r.y0 - 2, [0xf4f4f4], 4, false);
        this.time.delayedCall(900, () => this.emote("coffee"));
        this.notice("따뜻한 차 한 잔. 김이 모락모락.");
        this.emitUse(t.u, 0);
        return;
      case "scribble":
        this.sfx.play("marker");
        this.flashVariant(t.u, "draw", 6000);
        this.emote("idea");
        this.emitUse(t.u, 0);
        return;
      case "memo":
        this.sfx.play("page");
        this.flashVariant(t.u, "memo", 6000);
        this.emote("idea");
        this.emitUse(t.u, 0);
        return;
      case "squeak":
        this.sfx.play("squeak");
        this.flashVariant(t.u, "squish", 350);
        this.emote("laugh");
        this.emitUse(t.u, 0);
        return;
      case "straighten": {
        const i = Math.floor(Math.random() * FRAME_LINES.length);
        this.sfx.play("creak", 0.6);
        this.flashVariant(t.u, "tilt", 700);
        p.view.say(FRAME_LINES[i], performance.now());
        this.emitUse(t.u, i);
        return;
      }
      case "rummage": {
        const i = Math.floor(Math.random() * BUSH_FINDS.length);
        this.fxRummage(t.u, 1);
        this.time.delayedCall(700, () => {
          this.emote(BUSH_FINDS[i].emote);
          p.view.say(BUSH_FINDS[i].line, performance.now());
        });
        this.emitUse(t.u, i);
        return;
      }
      case "spore":
        this.sfx.play("sparkle");
        this.fxPuffs(cx, r.y1 - 6, [0x9fe8d0, 0xc8fff0, 0xe8fff8], 9, true);
        this.emitUse(t.u, 0);
        return;
      case "firefly":
        this.fxFireflies(t.u, cx, r.y1 - 8, 1);
        this.time.delayedCall(600, () => this.emote("wow"));
        this.emitUse(t.u, 0);
        return;
      case "pray": {
        const i = Math.floor(Math.random() * PRAY_LINES.length);
        this.flashVariant(t.u, "flower", 20_000);
        this.emote("flower");
        p.view.say(PRAY_LINES[i], performance.now());
        this.sfx.play("chime", 0.4);
        this.emitUse(t.u, i);
        return;
      }
      // ── 11/16 바닷가 세트 ──
      case "surf": {
        // 보드 앞에서 폴짝: 파도 소리 + 물보라 + 한마디
        const i = Math.floor(Math.random() * SURF_LINES.length);
        p.jump(this.time.now, null);
        this.sfx.play("surf");
        this.fxPuffs(p.x, p.y - 2, [0xcdf0ec, 0x8dd9de, 0xffffff], 6, false);
        p.view.say(SURF_LINES[i], performance.now());
        this.emitUse(t.u, i);
        return;
      }
      case "shell":
        this.sfx.play("surf");
        this.emote("tune");
        p.view.say(SHELL_LINE, performance.now());
        this.notice(`소라에 귀를 대 보니 ${SHELL_LINE}.`);
        this.emitUse(t.u, 0);
        return;
      case "ring":
        this.sfx.play("sheet", 0.7);
        this.flashVariant(t.u, "empty", RING_WEAR_MS);
        this.fxWornRing(() => ({ x: this.player.x, y: this.player.y, dir: this.player.dir }));
        this.time.delayedCall(300, () => this.emote("laugh"));
        this.notice("구명 튜브를 끼었어요. 둥둥!");
        this.emitUse(t.u, 0);
        return;
      case "wheel": {
        const i = Math.floor(Math.random() * WHEEL_LINES.length);
        this.fxWheel(t.u, 1);
        p.view.say(WHEEL_LINES[i], performance.now());
        this.emitUse(t.u, i);
        return;
      }
    }
  }

  /** 11/16 조타륜 돌리기: 살이 두 번 돌아가고 도르륵 */
  private fxWheel(u: string, gain: number): void {
    this.sfx.play("wheel", gain);
    this.flashVariant(u, "turn", 260);
    if (!this.data0.reduced) this.time.delayedCall(420, () => this.flashVariant(u, "turn", 260));
  }

  /**
   * 11/16 구명 튜브 끼기: 허리에 빨강·하양 고리를 RING_WEAR_MS 동안 두른다 (at = 그 사람 발 위치·방향, 없어지면 끝).
   * 고리 윗 반은 사람 뒤, 아랫 반은 사람 앞에 그려 몸에 낀 것처럼. 옆을 보면 고리가 좁아진다
   */
  private fxWornRing(at: () => { x: number; y: number; dir: DirId } | null): void {
    const tex = (part: "back" | "front", side: boolean) => this.canvasTex(`house-worn-ring-${part}-${side ? "s" : "f"}`, () => wornRingGrid(part, side).toCanvas());
    const first = at();
    if (!first) return;
    const back = this.add.image(first.x, first.y, tex("back", false)).setOrigin(0.5, 0.5);
    const front = this.add.image(first.x, first.y, tex("front", false)).setOrigin(0.5, 0.5);
    const until = this.time.now + RING_WEAR_MS;
    const place = (pos: { x: number; y: number; dir: DirId }) => {
      const side = pos.dir === DIR.left || pos.dir === DIR.right;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y - 7);
      back.setTexture(tex("back", side)).setPosition(x, y).setDepth(pos.y - 0.5);
      front.setTexture(tex("front", side)).setPosition(x, y).setDepth(pos.y + INDOOR_FRONT + 1);
    };
    place(first);
    const ev = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const pos = at();
        if (!pos || this.time.now >= until || !front.active) {
          ev.remove();
          back.destroy();
          front.destroy();
          return;
        }
        place(pos);
      },
    });
  }

  /** 연못 첨벙: 물가 앞쪽에서 잔물결 고리가 번진다 */
  private fxDip(u: string, gain: number, side: PondSide): void {
    this.sfx.play("splash", gain);
    const pond = this.work.items.find((x) => x.u === u);
    const seat = pond && pondSeats(pond, this.work.items, this.tier, this.frame)[side];
    if (!seat) return;
    // 앉은 쪽 발 앞에서 잔물결이 번진다
    const { x, y } = seat.foot;
    // 발끝에서 번진다: 연못 그림과 그 앞에 앉은 사람보다 위
    const depth = (this.views.get(u)?.img.depth ?? y) + 3;
    const n = this.data0.reduced ? 1 : 3;
    for (let i = 0; i < n; i++)
      this.time.delayedCall(i * 380, () => {
        const ring = this.add.ellipse(x + (i - 1) * 3, y, 6, 3).setStrokeStyle(1, 0xd6eeea, 0.9).setDepth(depth);
        ring.isFilled = false;
        this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 900, ease: "Sine.easeOut", onComplete: () => ring.destroy() });
        if (i > 0) this.sfx.play("bubble", gain * 0.6);
      });
  }

  /** 잠자는 강아지를 쓰다듬었다: 콧바람 + 꼬리 끝 톡 (깨지는 않는다) */
  /** 11/19 품종 펫 가구 쓰다듬기: 야옹(고양이)·한숨(강아지) + 품종 동작 두 장면 (움직임 줄이기면 소리만) */
  private petBreed(u: string, item: string, gain: number): void {
    this.sfx.play(isCatFurniture(item) ? "meow" : "dogSigh", gain);
    if (this.data0.reduced) return;
    this.flashVariant(u, "p1", BREED_PET_P1_MS);
    this.time.delayedCall(BREED_PET_P1_MS, () => this.flashVariant(u, "p2", BREED_PET_P2_MS));
  }

  private petDog(u: string, gain: number): void {
    this.sfx.play("dogSigh", gain);
    if (!this.data0.reduced) this.flashVariant(u, "wag", 520);
  }

  /** 잠자는 강아지 머리 위로 작은 z가 하나 떠올라 사라진다 */
  private floatZ(u: string): void {
    const v = this.views.get(u);
    if (!v) return;
    const flip = v.img.flipX;
    // 그림 원점 = 왼쪽 아래. 얼굴은 왼쪽(뒤집으면 오른쪽) 6px 언저리, 정수리는 바닥에서 9px 위
    const x = Math.round(v.img.x + (flip ? 10 : 6));
    const y = Math.round(v.img.y - 12);
    const key = this.canvasTex("house-zzz", () => zzzGrid().toCanvas());
    const z = this.add.image(x, y, key).setDepth(v.img.depth + 1).setAlpha(0.95);
    this.tweens.add({ targets: z, x: x + (flip ? -5 : 5), y: y - 12, alpha: 0, duration: 1900, ease: "Sine.easeOut", onComplete: () => z.destroy() });
  }

  /** 덤불 흔들기 (두 번) + 부스럭 */
  private fxRummage(u: string, gain: number): void {
    this.sfx.play("rustle", gain);
    this.flashVariant(u, "shake", 220);
    if (!this.data0.reduced) this.time.delayedCall(330, () => this.flashVariant(u, "shake", 220));
  }

  /** 작은 점들이 피어오른다 (김·꽃가루·포자). glow면 밤에도 빛난다 */
  private fxPuffs(x: number, y: number, colors: number[], n: number, glow: boolean): void {
    if (this.data0.reduced) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      const c = colors[i % colors.length];
      const dot = this.add
        .rectangle(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 4, 1.5, 1.5, c)
        .setDepth(glow ? DEPTH.lights + 1 : y + 30)
        .setAlpha(0.95);
      if (glow) dot.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: dot,
        y: dot.y - 10 - Math.random() * 10,
        x: dot.x + (Math.random() - 0.5) * 8,
        alpha: 0,
        delay: i * 90,
        duration: this.data0.reduced ? 500 : 1300 + Math.random() * 600,
        ease: "Sine.easeOut",
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** 반딧불 병을 열면 반딧불이 잠깐 날아다니다 사라진다 */
  private fxFireflies(u: string, x: number, y: number, gain: number): void {
    this.sfx.play("sparkle", gain);
    this.flashVariant(u, "open", 4200);
    const n = this.data0.reduced ? 2 : 6;
    for (let i = 0; i < n; i++) {
      const f = this.add.circle(x, y, 1.2, 0xe8ff9a).setDepth(DEPTH.lights + 1).setBlendMode(Phaser.BlendModes.ADD);
      const hops = this.data0.reduced ? 1 : 4;
      const path: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
      for (let k = 0; k < hops; k++) path.push({ targets: f, x: x + (Math.random() - 0.5) * 60, y: y - 6 - Math.random() * 30, duration: 700 + Math.random() * 300, ease: "Sine.easeInOut" });
      this.tweens.chain({ targets: f, tweens: [...path, { targets: f, x, y, alpha: 0, duration: 600 }], onComplete: () => f.destroy() });
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
    if (use === "light") {
      // 석등·촛대: 값 1 = 꺼짐. 밤 조명(빛 번짐)도 다시 계산
      this.applyLights();
      this.sfx.play(on ? "page" : "fireOn", gain * 0.6);
      return;
    }
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
        let lit = false;
        for (const [u, a] of Object.entries(r.states)) {
          const use = this.useByU.get(u);
          if (this.stateTouched.has(u) || (use !== "radio" && use !== "fire" && use !== "lamp" && use !== "window" && use !== "light")) continue;
          this.toggles.set(u, a);
          if (use === "window") win = true;
          else this.refreshVariant(u);
          if (use === "light") lit = true;
        }
        if (win) this.updateWindows();
        if (lit) this.applyLights();
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

  /**
   * 돌린 침대에 누운 사람: 누운 자세 그림을 침대 방향대로 눕힌다 (머리가 베개 쪽). 아바타 그림은 매 프레임 각도를 0으로 되돌리므로
   * 아바타 갱신 뒤 여기서 다시 기울인다 (나와 같은 방 사람 모두)
   */
  private tiltLying(): void {
    const tiltOf = (id: string | null | undefined) => (id ? (this.spots.find((s) => s.id === id)?.tilt ?? 0) : 0);
    const mine = this.using && this.player.anchored ? this.using.spot.tilt ?? 0 : 0;
    if (mine) this.player.sprite.setAngle(mine);
    if (this.presence) for (const r of this.presence.remotes.values()) {
      const t = r.stateId === STATE.lie || r.stateId === STATE.hammock ? tiltOf(r.seatId) : 0;
      if (t) r.view.sprite.setAngle(t);
      // 11/16 집 안 해먹에 누운 사람: 해먹 가구 그림(기둥) 앞에
      if (r.stateId === STATE.hammock) {
        const s = r.seatId ? this.spots.find((x) => x.id === r.seatId) : undefined;
        r.view.setHammockSkin(s?.kind === "hammockIn" ? "sea" : "village");
        if (s?.kind === "hammockIn") {
          r.view.depthOverride = hammockDepth(s);
          r.view.sprite.setDepth(r.view.depthOverride);
        }
      }
    }
    this.refreshHammocks();
  }

  /** 11/16 누가 누운 해먹 (나·같은 방 사람)의 배치 id */
  private hammockBusy(): Set<string> {
    const busy = new Set<string>();
    if (this.using?.spot.kind === "hammockIn" && this.player.state === "hammock") busy.add(this.using.spot.u);
    if (this.presence)
      for (const r of this.presence.remotes.values()) {
        if (r.stateId !== STATE.hammock || !r.seatId) continue;
        const s = this.spots.find((x) => x.id === r.seatId);
        if (s?.kind === "hammockIn") busy.add(s.u);
      }
    return busy;
  }

  /** 해먹 가구 그림: 누가 누우면 기둥만 (줄·천·몸은 누운 사람 그림이 그린다 — 마을 해먹과 같다) */
  private refreshHammocks(): void {
    for (const v of this.views.values()) if (v.p.i === "sea_hammock") this.refreshVariant(v.p.u);
  }

  /**
   * 연못가에 걸터앉은 사람(나·같은 방 사람): 연못 그림보다 앞에 그리고, 물에 잠긴 발끝은 물빛 조각으로 덮는다.
   * 아바타 갱신 뒤에 부른다: 다른 사람 그림은 갱신 때마다 깊이를 되돌리므로 그림 깊이를 바로 맞추고, 내 캐릭터는 일어나면 되돌린다
   */
  private updatePondSitters(): void {
    const seen = new Set<string>();
    const place = (key: string, view: { depthOverride: number | null; sprite: Phaser.GameObjects.Sprite }, seat: PondSeat & { u: string }) => {
      const depth = (this.views.get(seat.u)?.img.depth ?? seat.y) + 1;
      view.depthOverride = depth;
      view.sprite.setDepth(depth);
      seen.add(key);
      if (!seat.cover) return;
      let g = this.pondFeet.get(key);
      if (!g) {
        g = this.add.graphics();
        this.pondFeet.set(key, g);
      }
      // 발끝을 덮는 물 (가로로 납작한 조각 + 밝은 물결 한 줄)
      const water = this.night ? 0x2b465e : 0x47727a;
      const wide = seat.side === 1;
      g.clear();
      g.fillStyle(water, 0.92);
      g.fillEllipse(seat.foot.x, seat.foot.y + 1, wide ? 12 : 7, 4);
      g.fillStyle(this.night ? 0xa8b8d0 : 0xd6eeea, 0.7);
      g.fillRect(seat.foot.x - (wide ? 4 : 2), seat.foot.y - 1, wide ? 8 : 4, 1);
      g.setDepth(depth + 1);
    };
    const near = (x: number, y: number) => this.pondSeatList.find((s) => Math.abs(s.x - x) <= 2 && Math.abs(s.y - y) <= 2);
    // 나: 일어나면 끝
    const me = this.pondSit;
    if (me) {
      if (this.player.state === "sitGround" && Math.abs(this.player.x - me.x) <= 2 && Math.abs(this.player.y - me.y) <= 2) place("me", this.player.view, me);
      else {
        this.pondSit = null;
        this.player.view.depthOverride = null;
      }
    }
    if (this.presence)
      for (const [sid, r] of this.presence.remotes) {
        const seat = r.stateId === STATE.sitGround ? near(r.x, r.y) : undefined;
        if (seat) place(String(sid), r.view, seat);
      }
    for (const [key, g] of this.pondFeet)
      if (!seen.has(key)) {
        g.destroy();
        this.pondFeet.delete(key);
      }
  }

  /** 1인 자리에 앉기·눕기·읽기·욕조 (서버 점유 요청과 동시에 자리로) */
  private enterSpot(s: HouseSpot): void {
    const now = this.time.now;
    const pre = { x: this.player.x, y: this.player.y };
    if (s.kind === "chair") {
      this.player.sit({ id: s.id, furnitureId: s.u, x: s.x, y: s.y, facing: s.facing }, now, this.seatReq);
    } else if (s.kind === "hammockIn") {
      // 11/16 바닷가 세트 해먹: 마을 해먹과 같은 누운 그림 (줄·천·몸이 함께 흔들린다). 가구 그림은 기둥만 남긴다 (baseVariantOf)
      // 이 해먹 무늬(산호·조개·물빛 띠)로 눕는다 — 다른 사람 화면도 같은 무늬 (tiltLying)
      this.player.view.setHammockSkin("sea");
      this.player.attach("hammock", s.x, s.y, hammockDepth(s), now, this.seatReq, s.id);
      this.seatReq.sit(s.id);
      this.refreshHammocks();
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
    } else if (s.use === "piano") this.notice(isTouchUi() ? `${keyJosa("E", "를")} 누를 때마다 한 음씩 연주해요. 움직이면 일어나요.` : "숫자 1~8로 건반을 누르거나 E로 한 음씩 연주해요. 움직이면 일어나요.");
  }

  /**
   * 따라 들어온 친구 옆으로: 방에 친구(이름)가 보이면 둘레의 걸을 수 있는 칸(방 안, 벽·가구에 안 닿는 곳, 다른 사람과 안 겹치는 곳)으로
   * 순간이동하고 서버에도 알린다(warp). FOLLOW_WAIT_MS 안에 못 찾으면 안내만
   */
  private tryFollow(time: number): void {
    const f = this.follow;
    const pres = this.presence;
    if (!f || !pres) return;
    if (time > f.until) {
      this.follow = null;
      bridge.emit("friend:notice", { message: `집 안에서 ${f.name}님을 찾지 못했어요. 방금 나갔을 수 있어요.` });
      return;
    }
    if (!pres.client.online) return;
    const friend = findFollowed(pres.remotes.values(), f.name);
    if (!friend) return;
    this.follow = null;
    if (this.using) this.exitSpot();
    const others = [...pres.remotes.values()].map((r) => ({ x: r.x, y: r.y }));
    const spot = besideFriend({ x: friend.x, y: friend.y }, others, this.footBlocked());
    this.player.warp(spot.x, spot.y, time, NO_SEATS);
    this.player.faceTo(friend.x, friend.y, time);
    pres.client.warp(spot.x, spot.y);
    bridge.emit("friend:notice", { message: FRIEND_ARRIVED });
  }

  /** 발 상자(8×5)가 방 밖이거나 벽·가구에 닿으면 막힌 칸 (친구 옆 서기·일어나 설 자리) */
  private footBlocked(): (x: number, y: number) => boolean {
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const g of [this.wallBodies, this.itemBodies])
      for (const z of g.getChildren()) {
        const b = (z as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody | null;
        if (b) boxes.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      }
    const bounds = this.physics.world.bounds;
    return (x, y) =>
      x - 4 < bounds.x || x + 4 > bounds.right || y - 5 < bounds.y || y > bounds.bottom || boxes.some((b) => x - 4 < b.x + b.w && x + 4 > b.x && y - 5 < b.y + b.h && y > b.y);
  }

  /**
   * 일어나 설 자리 (game/logic/standUp): 앉기 전 자리가 비어 있으면 그대로, 다른 사람이 서 있거나 가구·벽에 막혔으면
   * 그 둘레·가구 앞쪽의 빈 칸 (11/19 "앉기 전 자리에 누가 있으면 안 내려가져요")
   */
  private standSpot(u: Using): { x: number; y: number } {
    const others = this.presence ? [...this.presence.remotes.values()].map((r) => ({ x: r.x, y: r.y })) : [];
    return standUpSpot(u.pre, { x: u.spot.x, y: u.spot.y }, others, this.footBlocked());
  }

  /** 자리에서 일어나 원래 서 있던 곳(막혔으면 그 둘레 빈 칸)으로 */
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
    const to = this.standSpot(u);
    this.player.warp(to.x, to.y, now, NO_SEATS);
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
      case "light":
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
      case "dog":
        this.petDog(u, gain);
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
      case "dip":
        this.fxDip(u, gain, (a % 4) as PondSide);
        r?.view.emote("drop", now);
        return;
      case "lean":
        this.sfx.play("rustle", gain * 0.4);
        return;
      case "rug":
        this.sfx.play("sheet", gain * 0.6);
        return;
      case "smell":
        this.sfx.play("sheet", gain * 0.6);
        r?.view.emote("flower", now);
        if (at) this.fxPuffs(at.x, at.y - 4, [0xf0a0c0, 0xf0e080, 0xf6f2e8], 5, false);
        return;
      case "tea":
        this.sfx.play("pour", gain);
        if (at) this.fxPuffs(at.x, at.y - 10, [0xf4f4f4], 4, false);
        r?.view.emote("coffee", now);
        return;
      case "scribble":
        this.sfx.play("marker", gain);
        this.flashVariant(u, "draw", 6000);
        r?.view.emote("idea", now);
        return;
      case "memo":
        this.sfx.play("page", gain);
        this.flashVariant(u, "memo", 6000);
        r?.view.emote("idea", now);
        return;
      case "squeak":
        this.sfx.play("squeak", gain);
        this.flashVariant(u, "squish", 350);
        r?.view.emote("laugh", now);
        return;
      case "straighten":
        this.sfx.play("creak", gain * 0.6);
        this.flashVariant(u, "tilt", 700);
        r?.view.say(FRAME_LINES[a % FRAME_LINES.length], now);
        return;
      case "rummage": {
        const find = BUSH_FINDS[a % BUSH_FINDS.length];
        this.fxRummage(u, gain);
        this.time.delayedCall(700, () => {
          r?.view.emote(find.emote, performance.now());
          r?.view.say(find.line, performance.now());
        });
        return;
      }
      case "spore":
        this.sfx.play("sparkle", gain);
        if (at) this.fxPuffs(at.x, at.y + 2, [0x9fe8d0, 0xc8fff0, 0xe8fff8], 9, true);
        return;
      case "firefly":
        if (at) this.fxFireflies(u, at.x, at.y, gain);
        r?.view.emote("wow", now);
        return;
      case "pray":
        this.flashVariant(u, "flower", 20_000);
        this.sfx.play("chime", gain * 0.4);
        r?.view.emote("flower", now);
        r?.view.say(PRAY_LINES[a % PRAY_LINES.length], now);
        return;
      // ── 11/16 바닷가 세트 ──
      case "surf":
        this.sfx.play("surf", gain);
        if (r) this.fxPuffs(r.x, r.y - 2, [0xcdf0ec, 0x8dd9de, 0xffffff], 6, false);
        r?.view.say(SURF_LINES[a % SURF_LINES.length], now);
        return;
      case "shell":
        this.sfx.play("surf", gain);
        r?.view.emote("tune", now);
        r?.view.say(SHELL_LINE, now);
        return;
      case "ring":
        this.sfx.play("sheet", gain * 0.7);
        this.flashVariant(u, "empty", RING_WEAR_MS);
        if (r) this.fxWornRing(() => (this.presence?.remotes.get(sid) === r ? { x: r.x, y: r.y, dir: r.netDir } : null));
        r?.view.emote("laugh", now);
        return;
      case "wheel":
        this.fxWheel(u, gain);
        r?.view.say(WHEEL_LINES[a % WHEEL_LINES.length], now);
        return;
      case "season": {
        const item = this.work.items.find((x) => x.u === u)?.i;
        if (item) this.playSeason(u, item, a, gain, r?.view);
        return;
      }
      case "breed": {
        const item = this.work.items.find((x) => x.u === u)?.i;
        if (item) this.petBreed(u, item, gain);
        r?.view.emote("heart", now);
        return;
      }
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
      } else if (u.spot.use === "massage") {
        // 11/20 안마의자: 앉아 있는 동안 덜덜덜 (등판이 엇갈린 그림을 짧게 번갈아)
        this.flashVariant(u.spot.u, "buzz", 260);
        u.next = time + 520;
      } else if (u.spot.use === "approve") {
        // 11/20 부장님 책상: 가끔 서류 넘기는 소리
        this.sfx.play("page", 0.5);
        u.next = time + 1800 + Math.random() * 1600;
      } else u.next = time + 1000;
    }
    // 다른 사람의 자리 소리 (자판·거품): 앉아 있는 자리로 안다
    if (this.presence) {
      for (const r of this.presence.remotes.values()) {
        const st = r.seatId ? this.spots.find((s) => s.id === r.seatId) : undefined;
        const use = st?.use;
        if (use !== "type" && use !== "bath" && use !== "massage") continue;
        const due = this.remoteTick.get(r.sid) ?? 0;
        if (time < due) continue;
        // 11/20 다른 사람이 앉은 안마의자도 덜덜덜 (소리 없이 그림만)
        if (use === "massage" && st) {
          this.flashVariant(st.u, "buzz", 260);
          this.remoteTick.set(r.sid, time + 520);
          continue;
        }
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
    // 디딤돌: 걸어서 밟으면 또각 발소리
    if (this.stoneTiles.size && time >= this.stepAt && (p.state === "walk" || p.state === "run")) {
      const tile = this.toTile(p.x, p.y - 2);
      if (this.stoneTiles.has(tile.y * 1000 + tile.x)) {
        this.stepAt = time + (p.state === "run" ? 200 : 300);
        this.sfx.play("step", 0.8);
      }
    }
    // 연못: 잔물결·반짝임 장면을 천천히 넘긴다 (동작 줄이기면 멈춤). 끌고 있는 연못은 건너뛴다 (제자리로 튀지 않게)
    if (!this.data0.reduced && time >= this.pondAt) {
      this.pondAt = time + 420;
      this.pondFrame = (this.pondFrame + 1) % animFrames("pond");
      for (const it of this.work.items) if (it.i === "pond" && this.drag?.u !== it.u) this.refreshVariant(it.u);
    }
    // 잠자는 강아지: 들숨(짧게)·날숨(길게)으로 등이 1px 오르내리고, 날숨 때 가끔 z 하나 (동작 줄이기면 멈춤)
    if (!this.data0.reduced && time >= this.dogAt) {
      this.dogFrame = (this.dogFrame + 1) % DOG_BREATH_FRAMES;
      this.dogAt = time + (this.dogFrame ? 1100 : 1500);
      let picked: string | null = null;
      let n = 0;
      for (const v of this.views.values()) {
        if (this.drag?.u === v.p.u) continue;
        // 11/19 품종 펫 가구도 같은 박자로 숨 쉰다 (z는 잠자는 강아지만)
        if (isBreedFurniture(v.p.i)) {
          this.refreshVariant(v.p.u);
          continue;
        }
        if (v.p.i !== "sleepy_dog") continue;
        this.refreshVariant(v.p.u);
        if (Math.random() * ++n < 1) picked = v.p.u; // 강아지가 여럿이면 하나를 고르게 뽑는다
      }
      // 11/19 품종 펫 가구 하나가 가끔 하품 (뒷모습은 귀 쫑긋)
      if (!this.dogFrame && time >= this.napYawnAt) {
        this.napYawnAt = time + 7000 + Math.random() * 6000;
        const naps = [...this.views.values()].filter((v) => isBreedFurniture(v.p.i) && this.drag?.u !== v.p.u && !this.flash.has(v.p.u));
        if (naps.length) this.flashVariant(naps[Math.floor(Math.random() * naps.length)].p.u, "y1", 1100);
      }
      if (picked && !this.dogFrame && time >= this.dogZAt) {
        this.dogZAt = time + 2600 + Math.random() * 2400;
        this.floatZ(picked);
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
    if (a === "interact" && this.atExit()) {
      this.leave();
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
      const to = this.standSpot(u);
      this.player.warp(to.x, to.y, time, NO_SEATS);
    }
    const cam = this.cameras.main;
    // 휠·핀치 줌 (편집 중에는 경계 없이 그 자리에서)
    const z = this.zoomer;
    if (z && (z.step(delta) || cam.zoom !== z.zoom)) {
      cam.setZoom(z.zoom);
      if (!this.editing) this.applyBounds();
    }
    const s = 1 / cam.zoom;
    this.player.view.sync(time, s);
    if (this.follow) this.tryFollow(time);
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
    this.tiltLying();
    this.updatePondSitters();
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
      // 밤 그림이 따로 있는 물건 (연못에 달이 비친다)
      // 11/20 이파리 햇빛가리개도 (낮에만 잎 그림자 — usesNightVariant)
      for (const it of this.work.items) if (usesNightVariant(it.i)) this.refreshVariant(it.u);
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
      // 연못에 비친 달빛 (은은하게)
      if (night) for (const ps of this.pondSpots) this.lighting.add(ps.x, ps.y, ps.r, 0.4);
    }
    this.lighting.end();

    if (this.editing) return;
  }

  /** 현관 문 앞에 서 있다 (E 나가기). 11/19 걸어서 저절로 나가기는 없앴다 */
  private atExit(): boolean {
    return !this.editing && !this.using && atExitDoor(this.player.x, this.player.y, this.exitGap);
  }

  private updateUsePrompt(s: number, nearSign: boolean): void {
    const p = this.usePrompt;
    let text = "";
    let x = 0;
    let y = 0;
    let grey = false;
    let door = false;
    if (this.using && !this.editing) {
      const u = this.using;
      text = u.spot.use === "piano" ? pianoPrompt(isTouchUi()) : interactLabel("일어나기");
      x = this.player.x;
      y = this.player.y + 14;
      p.setOrigin(0.5, 0);
    } else if (!nearSign && this.atExit()) {
      door = true;
      // 11/19 캐릭터 오른쪽 옆 (머리 위는 이름표·칭호와 겹치고, 현관·마당은 화면 아래 끝이라 발밑은 잘린다)
      text = interactLabel("나가기");
      x = this.player.x + 12;
      y = this.player.y - 10;
      p.setOrigin(0, 0.5);
    } else if (this.target && !nearSign && !(this.promptQuiet && this.promptQuiet.u === this.target.u && this.time.now < this.promptQuiet.until)) {
      const t = this.target;
      grey = !!t.spot && this.takenByOther(t.spot.id);
      text = grey ? this.labelOf(t) : interactLabel(this.labelOf(t));
      x = (t.rect.x0 + t.rect.x1) / 2;
      y = t.use === "window" ? this.oy + 2 : t.rect.y0 - Math.min(16, artUp(t.item) + 2);
      if (t.use === "window") p.setOrigin(0.5, 0);
      else p.setOrigin(0.5, 1);
    }
    setDoorHint(door ? "나가기" : null);
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

  /** 저장·점수에 들어가는 배치 (놓아 보는 물건은 뺀다) */
  private savedWork(): HouseLayout {
    return this.trialU ? { ...this.work, items: this.work.items.filter((i) => i.u !== this.trialU) } : this.work;
  }

  private emitState(): void {
    const w = this.savedWork();
    const trial = this.trialU ? this.work.items.find((i) => i.u === this.trialU) : undefined;
    const st: HouseEditState = {
      editing: this.editing,
      items: structuredClone(w.items),
      floor: w.floor,
      wall: w.wall,
      selected: this.selected,
      dirty: JSON.stringify(w) !== this.baseline,
      trial: trial ? { u: trial.u, itemId: trial.i } : null,
    };
    bridge.emit("house:state", st);
  }

  private setEditing(on: boolean, revert: boolean): void {
    if (!this.data0.mine || this.exiting) return;
    if (on && this.using) this.exitSpot();
    // 편집을 마치거나 되돌리면 놓아 보던 물건은 치운다
    if (!on || revert) this.dropTrial();
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
      this.zoomer?.reset(cam.zoom);
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
    // 놓아 보는 물건은 촛불색 테두리
    const ok = p.u === this.trialU ? 0xe8c070 : 0x9fc5a8;
    g.lineStyle(1, valid ? ok : 0xd08a76, 1);
    g.fillStyle(valid ? ok : 0xd08a76, 0.18);
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

  /** 놓아 보던 물건을 치운다 (없으면 그대로) */
  private dropTrial(): void {
    const u = this.trialU;
    if (!u) return;
    this.trialU = null;
    this.work.items = this.work.items.filter((i) => i.u !== u);
    this.views.get(u)?.img.destroy();
    this.views.delete(u);
    if (this.selected === u) this.selected = null;
    if (this.drag?.u === u) this.drag = null;
    this.rebuildBodies();
    this.applyLights();
  }

  private tool(t: HouseTool): void {
    if (!this.editing) return;
    // 놓아 보는 중에 고른 게 없으면 돌리기는 놓아 보는 물건에
    const pick = this.selected ?? (t.action === "rotate" ? this.trialU : null);
    const p = pick ? this.work.items.find((i) => i.u === pick) : undefined;
    switch (t.action) {
      case "try": {
        // 상점 "놓아 보기": 사지 않고 반투명으로 얹어 본다 (저장·점수에서 빠진다)
        const def = furnitureById(t.itemId);
        if (!def || def.skin || def.ext) return;
        this.dropTrial();
        const c = this.toTile(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
        const spot = findFreeSpot(this.work.items, this.tier, def, 0, c.x, c.y);
        if (!spot) {
          this.changed();
          return this.notice("놓아 볼 빈자리가 없어요. 다른 물건을 옮기거나 치워 주세요.");
        }
        const np: Placed = { u: newUid(this.work.items), i: def.id, x: spot.x, y: spot.y, r: 0 };
        this.trialU = np.u;
        this.work.items.push(np);
        const v = this.placeView(np);
        if (v) this.views.set(np.u, v);
        this.rebuildBodies();
        this.applyLights();
        this.selected = np.u;
        return this.changed();
      }
      case "tryEnd": {
        const u = this.trialU;
        if (!u) return;
        if (!t.keep) {
          this.dropTrial();
          return this.changed();
        }
        // 샀거나 가방에 남은 게 있다: 진짜 물건으로 (그 자리 그대로)
        if (this.work.items.length - 1 >= this.tier.maxItems) return this.notice(`${this.tier.name}에는 ${this.tier.maxItems}개까지 놓을 수 있어요.`);
        this.trialU = null;
        this.views.get(u)?.img.setAlpha(1);
        this.selected = u;
        return this.changed();
      }
      case "place": {
        const def = furnitureById(t.itemId);
        if (!def || def.skin) return;
        if (this.savedWork().items.length >= this.tier.maxItems) return this.notice(`${this.tier.name}에는 ${this.tier.maxItems}개까지 놓을 수 있어요.`);
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
        const r = nextRotation(furnitureById(p.i)!, p.r);
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
        if (p.u === this.trialU) {
          this.dropTrial();
          return this.changed();
        }
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
    if (!this.editing || this.zoomer?.pinching) return;
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
      v?.img.setAlpha(this.alphaOf(p.u, ok));
      this.drawSelection(ok);
    } else if (this.pan) {
      const cam = this.cameras.main;
      cam.setScroll(this.pan.cx - (e.clientX - this.pan.sx) / cam.zoom, this.pan.cy - (e.clientY - this.pan.sy) / cam.zoom);
    }
  };

  /** 두 손가락 줌이 시작됐다: 끌던 물건은 제자리로, 화면 끌기도 그만 */
  private cancelDrag(): void {
    this.pan = null;
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const p = this.work.items.find((i) => i.u === d.u);
    const v = p ? this.views.get(p.u) : undefined;
    if (p && v) this.placeView(p, v);
    if (p) v?.img.setAlpha(this.alphaOf(p.u));
    this.changed();
  }

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
    v?.img.setAlpha(this.alphaOf(p.u));
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
    this.trialU = null;
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
      trial: this.trialU,
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
