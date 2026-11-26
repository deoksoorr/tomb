import * as Phaser from "phaser";
import {
  CAMP_BOARD_SPOT,
  CAMP_BOUNDS,
  CAMP_BUS_SIGN,
  CAMP_BUS_STOP,
  CAMP_BUS_TIMETABLE,
  CAMP_FIRE,
  CAMP_FURNITURE,
  CAMP_HEIGHT,
  CAMP_NPCS,
  CAMP_OFFICE,
  CAMP_STREAM_HALF_W,
  CAMP_STREAM_TOP,
  BBQ_MENU,
  CAMP_WIDTH,
  CAMP_VIEW_BRIDGE_X,
  campStreamX,
  type CampNpcId,
  type Furniture,
} from "@tomb/protocol";
import { kstHour } from "@/lib/ambience";
import { imageBox, type SnowNpc } from "../world/snowNpc";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { seasonKey } from "../sprites/npcSeasonArt";
import { makeCanvas, mix, type Grid } from "../sprites/pixel";
import { bulbGlowSheet, christmasTree, lightString, lightStringOrigin, XTREE_H, XTREE_W } from "../sprites/winterArt";
import { addTwinkle } from "../world/conceptLights";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import * as Art from "./campArt";
import * as Lay from "./campLayout";
import { CampConceptDecor, campSkin, type CampActor } from "./CampConceptDecor";
import { CAMP_TEX_PREFIX, type CampInteractable, type CampLight, type CampMapApi, type CampTime } from "./campTypes";
import { RAFT_TOP_PAD, valleyTex } from "./campValleyTex";
import * as VA from "./valleyArt";
import * as V3 from "./valleyProps";
import * as V6 from "./valleyExtraArt";
import { MAP_HAMMOCKS } from "./campHammock";
import { FootbathBubbles } from "./campFootbathBubbles";

// 11/15 언젠가 캠핑장 맵 (CampMapApi 구현): 바닥(덩어리 텍스처, 화면 근처만), 나무·소품(칸 컬링, y 정렬), 이름표,
// 충돌, 시간대 풍경(새벽 물안개·일출빛 / 낮 다람쥐·물 반짝임 / 노을 단풍 / 밤 줄 조명·은하수·반딧불).
// 11/26 폭포 계곡 개편 (6차 시안): 아스라 폭포(움직이는 물줄기·거품·물보라·물안개·무지개)·달그늘 소·옛길 계곡·윤슬 낚시터·
// 캠프파이어 존·소슬 펜션 정원·놀이터·계곡 족욕탕. 집터(CAMP_LOTS) 안의 카라반·펜션·촌캉스 건물·앞마당·울타리는 집 화면 담당이 그린다
// (맵은 터 바닥 — 카라반 자갈 마당은 바닥 덩어리, 촌캉스 흙마당은 바닥 그림 — 과 터 사이 길·나무만).
// 집 화면 담당이 붙이는 곳: colliders(정적 충돌 그룹 — addCollider로 상자 더하기)·interactables(통째로 바꿔 끼우기)·addLight(밤 빛 더하기).
// 그림은 정류장 근처·버스 여행 동안 campPrebake가 조금씩 구워요. 한 번 구운 "camp-" 텍스처는 지우지 않아요 (다시 갈 때 멈추지 않게).
// 판(겨울·크리스마스, lib/mapConcept)이 바뀌면 그림을 통째로 다시 세운다 (충돌·자리는 그대로) — 관리자가 판을 바꿀 때 한 번.
// 매 프레임 일: 컬링 칸 경계가 바뀔 때만 보이기를 바꾸고, 폭포·물결 움직임은 폭포가 화면 근처일 때만 돌린다.

/** 소품 컬링 칸 */
const CELL = 256;
const CELL_COLS = Math.ceil(CAMP_WIDTH / CELL);
const CULL_PAD = 96;
const CHUNK = Art.CAMP_CHUNK;
const CHUNK_COLS = Math.ceil(CAMP_WIDTH / CHUNK);
const CHUNK_ROWS = Math.ceil(CAMP_HEIGHT / CHUNK);
/** 바닥에 붙은 그림 (아바타가 늘 위로) */
const FLAT = DEPTH.decal;
/** 위를 보는 널빤지 벤치: 이 줄(판 앞면)부터 아래만 앉은 사람 앞에 (그림 12줄, 1px 올려 깔아 좌석 y − 9부터 — 마을 BENCH_UP_BACK_ROW와 같은 높이) */
const PLANK_UP_FRONT_ROW = 4;
/** 머리 위 (물보라·물안개) — 어둠 막(DEPTH.dark)보다는 아래 */
const OVERHEAD = 90_000;
/** 폭포 움직임 주기 (물줄기·거품·물보라·물안개가 같은 시계) */
const LOOP = 3000;
/** 폭포가 화면 근처인지 보는 상자 */
const FALLS_AREA = { x: 400, y: -20, w: 480, h: 420 } as const;
const P = CAMP_TEX_PREFIX;

type Culled = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.BitmapText | Phaser.GameObjects.Graphics;
type Npc = { id: CampNpcId; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; x: number; y: number; on: boolean; phase: number; frame: number };
type Hopper = { img: Phaser.GameObjects.Image; from: { x: number; y: number }; to: { x: number; y: number }; t0: number; dur: number; rest: number };
type Mote = { img: Phaser.GameObjects.Image; x: number; y: number; t0: number; life: number; vx: number; vy: number };
type Drop = { img: Phaser.GameObjects.Image; x0: number; y0: number; vx: number; vy: number; s: number; life: number };
type Puff = { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; rise: number; a: number; sc: number };
type Phased = { img: Phaser.GameObjects.Image; x: number; y: number; ph: number };
type Fleck = { img: Phaser.GameObjects.Image; y0: number; off: number; k: number };

const SQUIRREL_HOURS = [7, 17] as const;
const hashR = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class CampMap implements CampMapApi {
  readonly width = CAMP_WIDTH;
  readonly height = CAMP_HEIGHT;
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  private baseItems: readonly CampInteractable[] = Lay.CAMP_INTERACTABLES;
  private cartItems: readonly CampInteractable[] = [];
  private allItems: readonly CampInteractable[] = Lay.CAMP_INTERACTABLES;
  /** E로 쓰는 것 (고정 목록 — 터 상호작용은 집 화면 담당이 바꿔 끼운다) + 11/23 붕어빵 수레 말 걸기 (열린 동안만 — game/world/BungeoCartView) */
  get interactables(): readonly CampInteractable[] {
    return this.allItems;
  }
  set interactables(v: readonly CampInteractable[]) {
    this.baseItems = v.filter((o) => o.kind !== "bungeo");
    this.allItems = this.cartItems.length ? [...this.baseItems, ...this.cartItems] : this.baseItems;
  }
  setCartItems(items: readonly CampInteractable[]): void {
    this.cartItems = items;
    this.allItems = items.length ? [...this.baseItems, ...items] : this.baseItems;
  }
  /** 밤 빛 (판마다 그리면서 모은다 — 모닥불·등·창·자판기·폭포 달빛) + 집 화면 담당이 더한 빛 */
  private lights: CampLight[] = [];
  private extraLights: readonly CampLight[] = [];
  get staticLights(): readonly CampLight[] {
    return this.extraLights.length ? [...this.lights, ...this.extraLights] : this.lights;
  }
  /** 집 화면 담당이 밤 빛을 더한다 (바꿀 때마다 통째로 — 장면이 Atmosphere에 다시 넘긴다) */
  setExtraLights(l: readonly CampLight[]): void {
    this.extraLights = l;
  }

  /** 판이 바뀌어도 남는 것 (작은 풀·하늘·NPC 이름표) */
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  /** 판마다 다시 세우는 그림 */
  private vis: Phaser.GameObjects.GameObject[] = [];
  private readonly chunks = new Map<number, Phaser.GameObjects.Image>();
  private readonly cells = new Map<number, Culled[]>();
  private readonly shownCells = new Set<number>();
  private lastCull = "";
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private labelScale = 0;
  private readonly npcs = new Map<CampNpcId, Npc>();
  /** 노을에 붉게 물드는 잎 나무 */
  private foliage: Phaser.GameObjects.Image[] = [];
  private sunsetK = -1;
  private bulbs: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; phase: number }[] = [];
  /** 자판기 앞판 불빛 (ADD, 어두울수록 밝다) */
  private vendingLit: Phaser.GameObjects.Image[] = [];
  private lit = -1;
  private readonly embers: Mote[] = [];
  private fireBoost = false;
  /** 바베큐 그릴 연기 (작은 풀) */
  private readonly smoke: { img: Phaser.GameObjects.Image; t0: number; life: number; x: number; y: number; vx: number }[] = [];
  private readonly sparkles: Mote[] = [];
  private readonly fireflies: Mote[] = [];
  private readonly squirrels: Hopper[] = [];
  private readonly mists: { img: Phaser.GameObjects.Image; x: number; y: number; phase: number }[] = [];
  /** 폭포 움직임 (판마다 다시 세운다) */
  private falls: Phaser.GameObjects.Image | null = null;
  private fallsGlow: Phaser.GameObjects.Image | null = null;
  private moonGlow: Phaser.GameObjects.Image | null = null;
  private rainbow: Phaser.GameObjects.Image | null = null;
  private foams: { img: Phaser.GameObjects.Image; fps: number; off: number }[] = [];
  private drops: Drop[] = [];
  private puffs: Puff[] = [];
  private ripples: Phased[] = [];
  private glints: Phased[] = [];
  private rare: Phaser.GameObjects.Image[] = [];
  private flecks: Fleck[] = [];
  /** 족욕탕 보글보글 (판마다 다시 세운다) */
  private footBubbles: FootbathBubbles | null = null;
  private fallsShown = true;
  private streamShown = true;
  /** 폭포 멍 (폭포 다리에 앉아 시점을 바꾼 동안 — 물보라·물안개를 더 짙게) */
  private fallsFocus = 0;
  private sunGlow!: Phaser.GameObjects.Image;
  private hour: number;
  private destroyed = false;
  private started = false;
  private concept: MapConcept;
  private snowy = false;
  private xmas = false;
  private decor: CampConceptDecor | null = null;
  private actors: () => Iterable<CampActor> = () => [];
  private xstar = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly reduced: boolean,
    /** true면 장면이 parts()를 프레임마다 조금씩 불러요 (버스 창밖 연출 동안 멈추지 않게) */
    staged = false,
    /** 11/17 처음 판 (겨울·크리스마스면 처음부터 그 그림으로) */
    concept: MapConcept = "default",
  ) {
    this.concept = concept;
    this.hour = kstHour(Date.now());
    this.colliders = scene.physics.add.staticGroup();
    this.furnitureColliders = scene.physics.add.staticGroup();
    const b = CAMP_BOUNDS;
    scene.physics.world.setBounds(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    if (!staged) {
      const g = this.parts();
      while (!g.next().done);
    }
  }

  /** 11/15 맵을 조금씩 만들어요. 한 조각마다 쉬어요(yield). 다 돌아야 맵이 다 선 거예요 */
  *parts(): Generator<void, void> {
    if (this.started) return;
    this.started = true;
    this.makeTextures();
    yield;

    let n = 0;
    for (const r of Lay.campStaticColliders()) {
      this.addCollider(this.colliders, r);
      if (++n % 60 === 0) yield;
    }
    for (const r of Lay.campFurnitureColliders()) {
      this.addCollider(this.furnitureColliders, r);
      if (++n % 60 === 0) yield;
    }
    yield;
    yield* this.drawAll();
    this.addNpcs();
    yield;
    this.addLabels();
    this.addPools();
    // 일출빛 (저수지 너머 숲). 11/26 은하수는 뺐다 — 위에서 본 맵이라 하늘이 없어 화면을 따라오는 흰 점으로만 보였다
    const s = this.scene;
    this.sunGlow = this.keep(s.add.image(Art.CAMP_SUNRISE.x, Art.CAMP_SUNRISE.y, Art.CAMP_TEX.sunGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 3).setScale(3.2).setVisible(false));
    yield;
    // 겨울·크리스마스 겉 장식 (관리소 굴뚝 연기·입김·반짝이는 눈 — 기본 판이면 아무것도 세우지 않는다)
    this.decor = new CampConceptDecor(s, this.reduced, (x, y, o) => this.cullExtra(x, y, o), () => this.actors());
    this.decor.apply(this.concept);
  }

  // ── 판 (겨울·크리스마스) ──

  private skin(base: string): string {
    return campSkin(this.scene, base, this.concept);
  }

  /** 판마다 다른 계곡 그림 키 (처음 쓰면 굽는다) */
  private vt(name: string): string {
    return valleyTex(this.scene, name, this.concept);
  }

  setActors(fn: () => Iterable<CampActor>): void {
    this.actors = fn;
  }

  /** 판을 바꾼다: 그림을 다 지우고 이 판 그림으로 다시 세운다 (충돌·자리·NPC 자리는 그대로) */
  setConcept(c: MapConcept): void {
    if (c === this.concept || this.destroyed) return;
    this.concept = c;
    this.clearVisuals();
    const g = this.drawAll();
    while (!g.next().done);
    for (const [k, img] of this.chunks) img.setTexture(this.chunkKey(k % CHUNK_COLS, Math.floor(k / CHUNK_COLS)));
    for (const n of this.npcs.values()) n.img.setTexture(seasonKey(Art.CAMP_TEX.npc(n.id), c), n.frame);
    this.lit = -1;
    this.sunsetK = -1;
    this.lastCull = "";
    this.decor?.apply(c);
  }

  private clearVisuals(): void {
    for (const o of this.vis) o.destroy();
    this.vis = [];
    this.cells.clear();
    this.shownCells.clear();
    this.lastCull = "";
    this.foliage = [];
    this.bulbs = [];
    this.vendingLit = [];
    this.falls = this.fallsGlow = this.moonGlow = this.rainbow = null;
    this.foams = [];
    this.drops = [];
    this.puffs = [];
    this.ripples = [];
    this.glints = [];
    this.rare = [];
    this.flecks = [];
    this.footBubbles?.destroy();
    this.footBubbles = null;
    this.lights = [];
  }

  /** 장식 그림을 컬링 칸에 넣는다 (장식이 지워지면 칸에서도 빠진다) */
  private cullExtra(x: number, y: number, o: Phaser.GameObjects.Image): void {
    const k = cellOf(x, y);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(o);
    o.setVisible(this.shownCells.has(k));
    o.once(Phaser.GameObjects.Events.DESTROY, () => {
      const l = this.cells.get(k);
      const i = l ? l.indexOf(o) : -1;
      if (l && i >= 0) l.splice(i, 1);
    });
  }

  // ── 텍스처 ──

  private makeTextures(): void {
    forEachCampTexture((key, build, linear) => {
      if (this.scene.textures.exists(key)) return;
      const out = build();
      const a: Art.ArtOut = "grid" in out ? out : { grid: out };
      addCanvasTexture(this.scene, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
    });
  }

  // ── 배치 도우미 ──

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private addCollider(group: Phaser.Physics.Arcade.StaticGroup, r: Lay.Rect): void {
    const z = this.scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    z.removeFromDisplayList();
    group.add(z);
  }

  /** 11/26 집 화면 담당이 정적 충돌 상자를 더한다 (집·울타리 — 다시 부르면 그 묶음만 바꾼다) */
  setLotColliders(rects: readonly Lay.Rect[]): void {
    for (const z of this.lotZones) {
      this.colliders.remove(z, true, true);
    }
    this.lotZones = rects.map((r) => {
      const z = this.scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      z.removeFromDisplayList();
      this.colliders.add(z);
      return z;
    });
  }
  private lotZones: Phaser.GameObjects.Zone[] = [];

  /** 컬링 칸에 그림을 넣는다 (받침 좌표 기준) */
  private cull<T extends Culled>(x: number, y: number, o: T): T {
    this.vis.push(o);
    const k = cellOf(x, y);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(o);
    o.setVisible(this.shownCells.has(k));
    return o;
  }

  /** 받침 가운데(바닥) 원점 그림 — 그림 맨 아래 lift줄이 그림자라 그만큼 내린다 */
  private prop(key: string, x: number, y: number, depth = y, lift = 2): Phaser.GameObjects.Image {
    return this.cull(x, y, this.scene.add.image(x, y + lift, key).setOrigin(0.5, 1).setDepth(depth));
  }
  /** 캠핑장 기본 그림 (판에 따라 눈 얹은 그림으로) */
  private cprop(base: string, x: number, y: number, depth = y, lift = 2): Phaser.GameObjects.Image {
    return this.prop(this.skin(base), x, y, depth, lift);
  }
  /** 왼쪽 위 원점 바닥 그림 */
  private flat(key: string, x: number, y: number, depth: number, cx = x, cy = y): Phaser.GameObjects.Image {
    return this.cull(cx, cy, this.scene.add.image(x, y, key).setOrigin(0, 0).setDepth(depth));
  }
  /** 컬링 밖에 그대로 두는 그림 (움직이는 것 — 화면 근처일 때만 매 프레임 돌린다) */
  private live<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.vis.push(o);
    return o;
  }
  private light(x: number, y: number, scale: number, tint: number, base: number): void {
    // 크리스마스판은 빛이 더 따뜻하고 넓다 (11/17 lightsFor와 같은 규칙)
    if (this.xmas) this.lights.push({ x, y, scale: scale * 1.18, tint: mix(tint, 0xffb060, 0.25), base: Math.min(1, base + 0.08) });
    else this.lights.push({ x, y, scale, tint, base });
  }
  private flame(x: number, y: number, depth: number, scale = 1, frame = 0): void {
    const T = Art.CAMP_TEX;
    if (!this.scene.anims.exists(`${P}flames`)) {
      this.scene.anims.create({ key: `${P}flames`, frames: Array.from({ length: Art.FLAME_FRAMES }, (_, i) => ({ key: T.flames, frame: i })), frameRate: this.reduced ? 4 : 9, repeat: -1 });
    }
    const f = this.scene.add.sprite(x, y, T.flames, frame).setOrigin(0.5, 1).setScale(scale).setDepth(depth);
    f.play({ key: `${P}flames`, startFrame: frame });
    this.cull(x, y, f);
  }

  // ── 그리기 (판마다) ──

  private *drawAll(): Generator<void, void> {
    this.snowy = isSnowy(this.concept);
    this.xmas = this.concept === "christmas";
    this.addCliffAndFalls();
    yield;
    this.addPoolFx();
    yield;
    this.addTrees();
    yield;
    this.addPlaza();
    this.addFacilities();
    yield;
    this.addBridges();
    this.addSmallFire();
    this.addFurniture();
    yield;
    this.addPlayground();
    yield;
    this.addFishing();
    yield;
    this.addCampfireZone();
    this.addLamps();
    // 폭포 달빛 (차가운 빛 — 밤에도 물줄기가 보이게)
    this.lights.push({ x: Lay.FALL_X, y: 120, scale: 1.8, tint: 0xa8ccff, base: 0.3 }, { x: Lay.PLUNGE.x, y: Lay.PLUNGE.y, scale: 2.0, tint: 0xb8d8ff, base: 0.28 });
    this.lastCull = "";
  }

  private addCliffAndFalls(): void {
    const s = this.scene;
    const B = VA.CLIFF_BOX;
    this.flat(this.vt("cliff"), B.x, B.y, FLAT + 4000, B.x + B.w / 2, 120);
    // 덩이 윗면에 선 침엽수·덤불 (회색 벽을 끊고 층이 보이게)
    const T = Art.CAMP_TEX;
    const onCap: [string, number, number][] = [
      ["M1L", 478, 0],
      ["M1L", 500, 1],
      ["M1L", 560, 2],
      ["M1R", 724, 1],
      ["M1R", 828, 0],
      ["M1R", 846, 2],
    ];
    for (const [id, x, v] of onCap) {
      const m = Lay.MASSES.find((q) => q.id === id)!;
      const y = Lay.massCap(m, x) + m.thick - 2;
      const key = v === 2 ? this.vt(`shrub${x % 2}`) : this.skin(v ? T.fir(x % 2) : T.spruce(x % 2));
      this.cull(x, y, s.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y));
    }
    // 절벽 양 끝 밑동 돌무더기
    for (const r of Lay.SCREE) this.prop(this.vt(`scree${r.seed}`), r.x, r.y, r.y).setFlipX(r.flip);
    const F = VA.FALLS_BOX;
    this.falls = this.live(s.add.image(F.x, F.y, this.vt("falls"), 0).setOrigin(0, 0).setDepth(FLAT + 4100));
    // 밤: 달빛에 물줄기가 은은히 빛난다 (같은 그림을 더하기로 한 겹 더)
    this.fallsGlow = this.live(s.add.image(F.x, F.y, this.vt("falls"), 0).setOrigin(0, 0).setDepth(DEPTH.lights + 2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
    this.moonGlow = this.live(s.add.image(Lay.FALL_X, 170, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9cc8ff).setDepth(DEPTH.lights + 1).setScale(1.6, 2.2).setAlpha(0));
    // 거품: 선반 위 · 소에 떨어지는 자리 · 가는 줄기 끝
    const foam = (name: string, x: number, y: number, fps: number, off: number) => {
      const img = this.live(s.add.image(x, y, this.vt(name), 0).setOrigin(0.5, 0.5).setDepth(FLAT + 4200));
      this.foams.push({ img, fps, off });
    };
    foam("foamLedge", 640, Lay.KNOB.y - Lay.KNOB.ry + 1, 8, 0);
    foam("foamPlunge", Lay.PLUNGE.x, Lay.PLUNGE.y - 2, 8, 2);
    foam("foamSmall", 523, 214, 8, 3);
    foam("foamSmall", 668, 207, 8, 1);
    if (!this.snowy) foam("foamSmall", 781, 212, 8, 4);
  }

  private addPoolFx(): void {
    const s = this.scene;
    const n = (full: number, low: number) => (this.reduced ? low : full);
    // 물결 고리 (폭포 앞으로 퍼진다)
    for (let i = 0; i < 4; i++) {
      const img = this.live(s.add.image(0, 0, this.vt("ripple")).setDepth(FLAT + 3500).setAlpha(0));
      this.ripples.push({ img, x: Lay.PLUNGE.x + (i % 2 ? -1 : 1) * (14 + hashR(i, 1) * 30), y: Lay.PLUNGE.y + 20 + hashR(i, 2) * 8, ph: i / 4 });
    }
    // 물보라 (폭포가 떨어지는 자리 + 선반)
    const dn = n(46, 16);
    for (let i = 0; i < dn; i++) {
      const ledge = i >= dn - 8;
      const img = this.live(s.add.image(0, 0, this.vt("drop")).setDepth(OVERHEAD - 6).setVisible(false));
      const x0 = ledge ? 640 + (hashR(i, 3) - 0.5) * 50 : Lay.PLUNGE.x + (hashR(i, 3) - 0.5) * 86;
      this.drops.push({
        img,
        x0,
        y0: ledge ? Lay.KNOB.y - 8 : Lay.PLUNGE.y - 6 + hashR(i, 4) * 8,
        vx: (x0 - (ledge ? 640 : Lay.PLUNGE.x)) * 0.9 + (hashR(i, 5) - 0.5) * 24,
        vy: -(ledge ? 22 : 44) - hashR(i, 6) * (ledge ? 20 : 46),
        s: hashR(i, 7),
        life: 520 + hashR(i, 8) * 520,
      });
    }
    // 물안개 (떨어지는 자리에서 천천히 피어오른다)
    for (let i = 0; i < n(9, 4); i++) {
      const img = this.live(s.add.image(0, 0, Art.CAMP_TEX.mist).setDepth(OVERHEAD - 8).setAlpha(0));
      this.puffs.push({ img, x: Lay.PLUNGE.x + (hashR(i, 9) - 0.5) * 110, y: Lay.PLUNGE.y + 6 + hashR(i, 10) * 10, ph: i / 9, rise: 16 + hashR(i, 11) * 22, a: 0.42 + hashR(i, 12) * 0.25, sc: 0.75 + hashR(i, 13) * 0.6 });
    }
    // 무지개 (낮, 물안개 오른쪽 앞)
    this.rainbow = this.live(s.add.image(Lay.PLUNGE.x + 62, Lay.PLUNGE.y + 30, this.vt("rainbow")).setOrigin(0.5, 1).setScale(0.5, 0.56).setDepth(OVERHEAD - 9).setAlpha(0));
    // 물 반짝임 (소·계곡)
    for (let i = 0; i < n(34, 12); i++) {
      let x = 0;
      let y = 0;
      if (i < 16) {
        const a = hashR(i, 14) * Math.PI * 2;
        const d = 0.25 + hashR(i, 15) * 0.6;
        x = Lay.POOL.x + Math.cos(a) * Lay.POOL.rx * d;
        y = Lay.POOL.y + 8 + Math.sin(a) * Lay.POOL.ry * d * 0.8;
      } else {
        y = 350 + hashR(i, 16) * 440;
        x = Lay.streamX(y) + (hashR(i, 17) - 0.5) * 18;
      }
      const img = this.live(s.add.image(Math.round(x), Math.round(y), Art.CAMP_TEX.sparkle).setDepth(FLAT + 3600).setAlpha(0));
      this.glints.push({ img, x, y, ph: hashR(i, 18) });
    }
    // 달그늘 소 희귀 물고기 자리: 가끔 한 군데서 반짝반짝 (UI 없음 — 눈썰미 좋은 사람만)
    for (let i = 0; i < 3; i++) this.rare.push(this.live(s.add.image(Lay.RARE_GLINT.x + [-5, 4, 0][i], Lay.RARE_GLINT.y + [0, 2, -3][i], Art.CAMP_TEX.sparkle).setDepth(FLAT + 3610).setAlpha(0)));
    // 계곡 물살 거품 조각 (물을 따라 흘러내린다)
    for (let i = 0; i < n(22, 8); i++) {
      const img = this.live(s.add.image(0, 0, this.vt("drop")).setDepth(FLAT + 3600).setScale(1, 0.5).setAlpha(0.85));
      this.flecks.push({ img, y0: hashR(i, 19), off: (hashR(i, 20) - 0.5) * 22, k: 1 + Math.floor(hashR(i, 21) * 2) });
    }
  }

  private addTrees(): void {
    const T = Art.CAMP_TEX;
    for (const t of Lay.CAMP_TREES) {
      const v = t.v % 2;
      const key = t.kind === "spruce" ? T.spruce(v) : t.kind === "pine" ? T.pine(v) : t.kind === "fir" ? T.fir(v) : t.kind === "maple" ? T.maple(v) : t.kind === "mapleO" ? T.mapleO(v) : t.kind === "yellow" ? T.yellow(v) : T.bush(v);
      const img = this.cprop(key, t.x, t.y);
      if (t.kind === "maple" || t.kind === "mapleO" || t.kind === "yellow") this.foliage.push(img);
    }
    for (const d of Lay.CAMP_DECOR) {
      const key = d.kind === "leafPile" ? T.leafPile(d.v) : d.kind === "mushroom" ? T.mushroom(d.v) : d.kind === "fern" ? T.fern(d.v) : T.pebbles(d.v);
      this.cprop(key, d.x, d.y, FLAT + d.y, 1);
    }
    for (const r of Lay.ROCKS) this.cprop(T.boulder(r.v), r.x, r.y).setScale(r.s, r.s * (0.8 + (r.x % 5) * 0.06)).setFlipX(r.x % 3 === 0);
  }

  /** 캠프파이어 존 큰 모닥불 광장 (통나무 의자는 가구로) */
  private addPlaza(): void {
    const T = Art.CAMP_TEX;
    const F = Lay.FIRE;
    this.prop(T.fireRing, F.x, F.y, F.y, 13);
    this.flame(F.x, F.y + 3, F.y + 1);
    // 크리스마스 트리 (광장 위쪽) + 전구 빛 + 별
    const X = Lay.XTREE_AT;
    if (this.xmas) {
      const t = christmasTree();
      this.xstar = t.star;
      const gk = `${P}v-xtreeGlow`;
      if (!this.scene.textures.exists(gk)) addCanvasTexture(this.scene, gk, { canvas: bulbGlowSheet(XTREE_W, XTREE_H, t.bulbs, t.star), frameW: XTREE_W, frameH: XTREE_H });
      this.prop(this.vt("xtree"), X.x, X.y, X.y, 1);
      this.cull(X.x, X.y, addTwinkle(this.scene, gk, X.x, X.y + 1, 0.5, 1, { reduced: this.reduced }));
      const halo = this.cull(X.x, X.y, this.scene.add.image(X.x - XTREE_W / 2 + this.xstar.x, X.y + 1 - XTREE_H + this.xstar.y + 1, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe08a).setScale(0.55).setAlpha(0.6).setDepth(DEPTH.lights + 3));
      if (!this.reduced) this.vis.push(this.scene.tweens.add({ targets: halo, alpha: { from: 0.35, to: 0.85 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }) as unknown as Phaser.GameObjects.GameObject);
      this.light(X.x, X.y - 34, 1.3, 0xffd890, 0.8);
      this.prop(this.vt("gifts0"), X.x + 22, X.y + 4);
      this.prop(this.vt("snowman0"), F.x + 128, F.y + 74);
    }
    // 조명 기둥 + 기둥을 잇는 전구 줄
    const tops = Lay.LIGHT_POLES.map((p) => {
      this.cprop(T.pole, p.x, p.y);
      return [p.x, p.y - 34, p.y] as const;
    });
    tops.forEach((a, i) => this.addString(a, tops[(i + 1) % tops.length], i));
    this.light(F.x, F.y - 16, 3.6, 0xffa048, 1);
    for (const p of Lay.LIGHT_POLES) this.light(p.x, p.y - 34, 0.7, 0xffcf78, 0.5);
    if (this.snowy) this.prop(this.vt("woodpile"), F.x - 112, F.y - 44);
  }

  /** 두 기둥 머리를 잇는 전구 줄: 크리스마스판은 색 전구(반짝임 겹), 아니면 전선 + 따뜻한 전구 (밤에 켜진다 — updateLights) */
  private addString(a: readonly [number, number, number], b: readonly [number, number, number], i: number): void {
    const s = this.scene;
    const depth = Math.max(a[2], b[2]) + 2;
    const mx = (a[0] + b[0]) / 2;
    if (this.xmas) {
      const dx = Math.round(b[0] - a[0]);
      const dy = Math.round(b[1] - a[1]);
      const sag = Math.max(5, Math.round(Math.hypot(dx, dy) * 0.09));
      const key = `${P}v-string-${dx}-${dy}-${sag}`;
      if (!s.textures.exists(key)) {
        const ls = lightString(dx, dy, sag);
        addCanvasTexture(s, key, { canvas: ls.canvas });
        addCanvasTexture(s, `${key}~glow`, { canvas: bulbGlowSheet(ls.canvas.width, ls.canvas.height, ls.bulbs), frameW: ls.canvas.width, frameH: ls.canvas.height });
      }
      const o = lightStringOrigin(dx, dy);
      const x = a[0] - o.ox;
      const y = a[1] - o.oy;
      this.cull(mx, depth, s.add.image(x, y, key).setOrigin(0, 0).setDepth(depth));
      this.cull(mx, depth, addTwinkle(s, `${key}~glow`, x, y, 0, 0, { reduced: this.reduced, phase: i % 2, alpha: 0.9 }));
      return;
    }
    const g = this.cull(mx, depth, s.add.graphics().setDepth(depth));
    g.lineStyle(1, 0x2a2018, 0.9);
    g.beginPath();
    const sag = Math.max(5, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.09);
    const pt = (t: number) => ({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * sag });
    for (let k = 0; k <= 16; k++) {
      const p = pt(k / 16);
      if (k === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.strokePath();
    for (let k = 1; k <= 6; k++) {
      const p = pt(k / 7);
      const img = this.cull(mx, depth, s.add.image(p.x, p.y + 1, Art.CAMP_TEX.bulb).setOrigin(0.5, 0).setDepth(depth + 1));
      const glow = this.cull(mx, depth, s.add.image(p.x, p.y + 3, Art.CAMP_TEX.bulbGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1).setAlpha(0));
      this.bulbs.push({ img, glow, phase: (i * 7 + k) * 1.7 });
    }
  }

  /** 정류장·관리소·바베큐·자판기 */
  private addFacilities(): void {
    const T = Art.CAMP_TEX;
    const s = this.scene;
    this.cprop(T.office, CAMP_OFFICE.x, CAMP_OFFICE.y, CAMP_OFFICE.y, 3);
    this.cprop(T.board, CAMP_BOARD_SPOT.x, CAMP_BOARD_SPOT.y);
    // 버스 정류장: 뒷벽은 벤치(qB, 정류장 − 8) 바로 뒤, 지붕·앞 기둥만 정류장 depth로 한 번 더 (앉은 사람 머리가 뒷벽에 가리지 않게)
    this.cprop(T.shelter, CAMP_BUS_STOP.x, CAMP_BUS_STOP.y, CAMP_BUS_STOP.y - 9);
    for (const [cx, cy, cw, ch] of Art.SHELTER_FRONT) this.cprop(T.shelter, CAMP_BUS_STOP.x, CAMP_BUS_STOP.y).setCrop(cx, cy, cw, ch);
    this.cprop(T.busSign, CAMP_BUS_SIGN.x, CAMP_BUS_SIGN.y);
    this.cprop(T.timetable, CAMP_BUS_TIMETABLE.x, CAMP_BUS_TIMETABLE.y);
    // 11/26 관리소 문 앞 「카라반 분양」 입간판은 뺐다 (운영자 「카라반, 촌캉스도 NPC만으로 통일」 — 분양은 언젠가 씨에게 말을 걸어서만)
    if (this.xmas) this.prop(this.vt("gifts1"), 250, 604);
    // 바베큐 그릴·탁자 (캠프파이어 존 윗줄) + 연기
    const B = Lay.BBQ;
    this.prop(T.bbqGrill, B.grill.x, B.grill.y);
    this.cprop(T.bbqTable, B.table.x, B.table.y);
    if (this.snowy) this.prop(this.vt("woodpile"), B.area.x + 14, B.area.y + 12);
    // 자판기 셋 (달그늘 소 오른쪽 둑 — 빨강 음료 · 파랑 따뜻한 커피 · 초록 간식)
    const vcol: [number, number, number, number][] = [
      [0xc8343a, 0xe0565a, 0x9a2228, 0xe86a6a],
      [0x3a6ab0, 0x5a8ad0, 0x284c88, 0x7aa0e0],
      [0x3a8a5a, 0x5aaa78, 0x286a40, 0x78c090],
    ];
    const red = vcol[0];
    for (const [i, v] of Lay.VENDING_ROW.entries()) {
      const base = this.skin(T.vending);
      const key = i === 0 ? base : `${base}~v${i}`;
      if (!s.textures.exists(key)) {
        const src = s.textures.get(base).getSourceImage() as HTMLCanvasElement;
        addCanvasTexture(s, key, {
          canvas: V3.recolorCanvas(src, (r, g, b) => {
            const k = red.indexOf((r << 16) | (g << 8) | b);
            if (k < 0) return null;
            const nn = vcol[i][k];
            return [(nn >> 16) & 255, (nn >> 8) & 255, nn & 255];
          }),
        });
      }
      this.prop(key, v.x, v.y);
      this.vendingLit.push(this.cull(v.x, v.y, s.add.image(v.x, v.y + 2, T.vendingLit).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(v.y + 0.1).setAlpha(0)));
      this.light(v.x, v.y - 16, 0.6, 0xc8ecff, 0.85);
    }
    const O = CAMP_OFFICE;
    this.light(O.x - 56, O.y - 22, 0.6, 0xffd890, 0.75);
    this.light(O.x - 20, O.y - 30, 0.45, 0xffc070, 0.8);
    this.light(O.x + 44, O.y - 22, 0.8, 0xffe0a0, 0.85);
    this.light(CAMP_BUS_STOP.x, CAMP_BUS_STOP.y - 40, 0.85, 0xfff0c8, 0.85);
    this.light(CAMP_BUS_TIMETABLE.x, CAMP_BUS_TIMETABLE.y - 18, 0.4, 0xd8f0ff, 0.6);
    this.light(B.grill.x, B.grill.y - 12, 1.1, 0xff8a40, 0.9);
    // 관리소·매점 처마 줄 조명
    this.addString([O.x - 84, O.y - 40, O.y], [O.x + 84, O.y - 40, O.y], 3);
  }

  /** 가구 (통나무 의자·벤치·그네 — 좌석 표 CAMP_FURNITURE) */
  private addFurniture(): void {
    const T = Art.CAMP_TEX;
    for (const f of CAMP_FURNITURE) {
      const key = furnitureKey(f);
      if (!key) continue;
      if (key === "swing") {
        // 11/26 그네 의자: 앉는 판(그림 12~18줄)이 앉은 사람 엉덩이 높이에 오게 6px 내려 깐다 (전에는 판이 머리 옆에 떠 있었다)
        this.prop(this.vt("swing"), f.x, f.y, f.y, 8);
        continue;
      }
      if (key === "plank") {
        // 11/26 등받이 없는 널빤지 벤치: 아래를 보면 판이 앉은 사람 다리 뒤(4px 올려 — 다리가 판 앞으로 내려온다),
        // 위를 보면(폭포 다리·불멍 앞 벤치) 판 윗면은 앉은 사람 뒤, 판 앞면·다리(PLANK_UP_FRONT_ROW줄부터)만 한 번 더 앞에 그려 엉덩이를 가린다.
        // 마을 위 보는 벤치(WorldMap — 좌석 y − 9부터 앞)와 같은 높이: 전에는 판 전체가 앞이라 머리 꼭대기만 보였다
        if (f.facing === 3) {
          this.cprop(T.plankBench2, f.x, f.y, f.y, -1);
          const front = this.cprop(T.plankBench2, f.x, f.y, f.y + 1.2, -1);
          front.setCrop(0, PLANK_UP_FRONT_ROW, front.width, front.height - PLANK_UP_FRONT_ROW);
        } else this.cprop(T.plankBench2, f.x, f.y, f.y, -2);
        continue;
      }
      this.cprop(key === "log" ? T.logChair : key === "rusty" ? T.rustyBench : T.bench, f.x, f.y, f.y);
    }
  }

  private addBridges(): void {
    const T = Art.CAMP_TEX;
    const vy = Lay.VIEW_BRIDGE.y;
    const vx = CAMP_VIEW_BRIDGE_X;
    const bx0 = vx - VA.VBRIDGE_W / 2;
    // 그림 위 빈 칸(VBRIDGE_PAD — 뒤 등갓)만큼 올려 깐다: 판자 윗줄(뒤 난간 받침) = 다리 y − 14
    const by0 = vy - 14 - VA.VBRIDGE_TOP;
    this.flat(this.vt("vbridge"), bx0, by0, FLAT + 2600, vx, vy);
    // 11/26 운영자 「다리 바깥에서 다리 쪽으로 걸치면 난간 뒤에 내가 있어야」: 판 전체는 바닥에 깔고, 뒤·앞 난간(+ 등 기둥)만 사람 깊이 사이에 한 번 더.
    // 소 쪽에 선 사람(발 ≤ 364)은 뒤 난간 뒤, 다리 위(372~393)는 뒤 난간 앞·앞 난간 뒤, 다리 앞(401~)은 앞 (막는 상자 Lay.VIEW_BRIDGE_RAIL)
    this.flat(this.vt("vbridgeBack"), bx0, by0, Lay.VIEW_BRIDGE_BACK_DEPTH, vx, vy);
    this.flat(this.vt("vbridgeFront"), bx0, by0, Lay.VIEW_BRIDGE_FRONT_DEPTH, vx, vy);
    for (const lp of VA.VBRIDGE_LAMPS) this.light(bx0 + lp.x, by0 + lp.y, 0.55, 0xffd28a, 0.85);
    const by = Lay.LOG_BRIDGE_Y;
    const bx = Math.round(Lay.streamX(by));
    this.flat(this.skin(T.bridge), bx - Art.BRIDGE_W / 2, by - Art.BRIDGE_H / 2, FLAT + 2600, bx, by);
  }

  /** 폭포 다리 앞 작은 모닥불 (통나무 넷은 가구로) */
  private addSmallFire(): void {
    const F = Lay.SMALL_FIRE;
    this.prop(Art.CAMP_TEX.fireRing, F.x, F.y, F.y, 8).setScale(0.62);
    this.flame(F.x, F.y + 2, F.y + 1, 0.62, 1);
    this.light(F.x, F.y - 10, 1.9, 0xffa048, 1);
  }

  // 소슬 펜션 구역: 집·앞마당·촌캉스 흙마당은 집 화면 담당(campHousingPlan)이 앞마당 단계에 맞춰 그린다 (맵은 풀밭 그대로).
  // 11/26 입구 나무 아치는 없앴어요 (운영자 — 길만 남김). 11/26 「펜션 분양」 입간판도 뺐어요 (운영자 「헷갈려한다」 — 펜션 분양은 소슬댁에게만)

  /** 놀이터 (트램펄린·워터 슬라이드/눈썰매장) · 펜션 정원 · 계곡 족욕탕 */
  private addPlayground(): void {
    const S = Lay.SLIDE;
    this.flat(this.vt("slide"), S.x - V3.SLIDE_ART.w / 2 - 6, S.y - 60, S.y + 40, S.x, S.y);
    const Tr = Lay.TRAMPOLINE;
    const by = Tr.y + Tr.ry + 10;
    this.prop(this.vt("trampB"), Tr.x, by, Tr.y - Tr.ry, 0);
    this.prop(this.vt("trampF"), Tr.x, by, Tr.y + Tr.ry + 4, 0);
    this.addPensionGarden();
    this.addFootBath();
  }

  private addPensionGarden(): void {
    const T = Art.CAMP_TEX;
    const G = Lay.PGARDEN;
    if (!this.snowy) this.flat(this.vt("lawn"), G.x0, G.y0, FLAT + 8, (G.x0 + G.x1) / 2, (G.y0 + G.y1) / 2);
    // 11/26 정원 작은 연못·아치 다리는 없앴어요 (운영자) — 그 자리는 잔디(겨울엔 눈) 그대로
    // 화로대 불멍 (통나무 넷은 가구로) · 장작더미
    const F = Lay.PG_FIRE;
    this.prop(T.fireRing, F.x, F.y, F.y, 8).setScale(0.62);
    this.flame(F.x, F.y + 2, F.y + 1, 0.62, 2);
    this.light(F.x, F.y - 10, 1.6, 0xffa048, 1);
    this.prop(this.vt("firewood"), Lay.PG_WOOD.x, Lay.PG_WOOD.y);
    this.addHammocks();
    for (const p of Lay.PG_PLANTERS) this.prop(this.vt(`planter${p.len}`), p.x, p.y);
    // 「소슬 펜션」 간판 · 꼬마전구 아치 · 정원등 · 관목 · 디딤돌
    const sg = Lay.PG_SIGN;
    this.prop(this.vt("penSign"), sg.x, sg.y);
    this.atlas.ensure("소슬 펜션");
    this.cull(sg.x, sg.y, this.scene.add.bitmapText(sg.x, sg.y - 16, FONT_KEY, "소슬 펜션", FONT_PX).setOrigin(0.5, 0.5).setTint(0xffe6a0).setScale(0.5).setDepth(sg.y + 1));
    this.light(sg.x, sg.y - 24, 0.5, 0xffd890, 0.8);
    this.prop(this.vt("lightArch"), Lay.PG_ARCH.x, Lay.PG_ARCH.y, Lay.PG_ARCH.y, 0);
    // 꼬마전구 아치: 빛은 꼭대기 하나만 (전구마다 빛을 두면 하얗게 번진다)
    this.light(Lay.PG_ARCH.x, Lay.PG_ARCH.y - 30, 0.35, 0xffe6a0, 0.7);
    for (const p of Lay.PG_LAMPS) {
      this.prop(this.vt("gLamp"), p.x, p.y);
      this.light(p.x, p.y - 12, 0.4, 0xffe0a0, 0.85);
    }
    for (const p of Lay.PG_SHRUBS) this.cprop(T.bush(p.v), p.x, p.y);
    for (const [i, p] of Lay.PG_STEPS.entries()) this.cull(p.x, p.y, this.scene.add.image(p.x, p.y, this.vt(`step${i % 2}`)).setDepth(FLAT + 20));
    // 크리스마스: 펜션 트리 (아닐 땐 관목)
    if (this.xmas) {
      this.prop(this.vt("xtree"), Lay.PG_TREE.x, Lay.PG_TREE.y, Lay.PG_TREE.y, 0).setScale(0.55);
      this.prop(this.vt("gifts0"), Lay.PG_TREE.x + 14, Lay.PG_TREE.y + 4);
    } else this.cprop(T.bush(0), Lay.PG_TREE.x, Lay.PG_TREE.y);
    this.prop(this.vt("bike"), Lay.PG_BIKE.x, Lay.PG_BIKE.y);
    this.prop(this.vt("car"), Lay.PG_CAR.x, Lay.PG_CAR.y);
  }

  /** 계곡 족욕탕 — 보글보글 끓는 돌 테 탕 + 나무 데크·벤치·등롱 */
  private addFootBath(): void {
    const F = Lay.FOOTBATH_AT;
    const fb = V6.footBathArt(this.xmas);
    const x0 = F.x - V6.FOOTBATH.w / 2;
    const y0 = F.y - V6.FOOTBATH.h;
    this.prop(this.vt("footbath"), F.x, F.y, y0 + 30, 0);
    for (const l of fb.lanterns) this.light(x0 + l.x, y0 + l.y, 0.5, 0xffd28a, 0.9);
    // 11/26 김(김 기둥·김 파티클)은 뺐어요 (운영자 「연기 빼고 보글보글만 더 빡세게」) — 물 위 거품이 올라와 톡 터지고 물결 고리가 번진다
    this.footBubbles = new FootbathBubbles(this.scene, x0, y0, y0 + 30.5, DEPTH.lights + 2, this.reduced);
    if (this.snowy) this.prop(this.vt("snowman1"), 364, 246);
  }

  /** 윤슬 낚시터: 넓은 잔교 · 4인 좌대 여섯 · 나룻배 선착장 · 부표 줄 · 낚시 바위 · 관리 부스 · 둑 낚시 의자 */
  private addFishing(): void {
    const Pi = Lay.PIER;
    this.flat(this.vt("wpier"), Pi.x0, Pi.y - 18, FLAT + 2700, (Pi.x0 + Pi.x1) / 2, Pi.y);
    for (const r of Lay.RAFTS) {
      // 11/26 좌대 마루는 바닥처럼 깔고(마루에 선·앉은 사람이 위에 — 전에는 좌대 그림이 낚시하는 사람을 덮었다),
      // 오두막 지붕·벽만 오두막 밑동 깊이로 한 번 더 (마루 뒤쪽에 선 사람 머리를 처마가 가린다)
      const key = this.vt(`raft${r.n}`);
      this.prop(key, r.x, r.y, FLAT + 2700, 0);
      // 11/26 좌대를 넓혀(그림 72×57) 오두막이 마루 뒤로 9 물러났다 — 밑동 깊이 받침 − 37
      // 11/26 물 건너 좌대 텍스처는 위에 빈 칸(RAFT_TOP_PAD — 지붕 위 눈이 잘리지 않게)이 있어 crop을 그만큼 내린다 (지붕 crop은 그 빈 칸까지)
      const tp = r.link ? 0 : RAFT_TOP_PAD;
      this.prop(key, r.x, r.y, r.y - 37, 0).setCrop(19, 0, 34, 12 + tp);
      this.prop(key, r.x, r.y, r.y - 37, 0).setCrop(21, 12 + tp, 30, 10);
      this.light(r.x - 6, r.y - 41, this.xmas ? 0.76 : 0.65, this.xmas ? 0xffd890 : 0xffc070, 0.85);
      // 11/26 물 건너 좌대 앞 사다리 작은 등 (밤에도 물에서 사다리가 보이게)
      if (!r.link) this.light(r.x, r.y - 6, 0.4, 0xfff0d0, 0.8);
    }
    // 나룻배 선착장 (배는 game/camp/CampRowboats가 그린다)
    const D = Lay.ROW_DOCK;
    this.flat(this.vt("rowdock"), D.x0, D.y - 19, FLAT + 2700, D.x0 + D.len / 2, D.y);
    this.light(D.x0 + 4, D.y - 17, 0.55, 0xffd28a, 0.9);
    this.prop(this.vt("boatSign"), Lay.BOAT_SIGN.x, Lay.BOAT_SIGN.y);
    const B = Lay.BUOY_LINE;
    this.flat(this.vt("buoys"), B.x0, B.y - 4, FLAT + 2700, (B.x0 + B.x1) / 2, B.y);
    // 달그늘 소 양옆 낚시 바위 여섯
    // 11/26 바위 위에 앉아 낚시하는 사람(발 = 바위 − 8)이 바위 그림 위에 오게 바위를 그 아래 깊이로 (전에는 바위가 몸을 덮었다)
    for (const r of Lay.POOL_ROCKS) this.prop(this.vt("fishRock"), r.x, r.y, r.y - 14).setFlipX(r.side > 0);
    // 이름 팻말 · 수영 안내 (미끼·대여 부스와 「낚시터 사장님」은 world/forage/Foraging이 그린다)
    this.cprop(Art.CAMP_TEX.board, Lay.POND_SIGN.x, Lay.POND_SIGN.y);
    this.prop(this.vt("swimSign"), Lay.SWIM_SIGN.x, Lay.SWIM_SIGN.y);
    if (this.snowy) for (const h of Lay.ICE_HOLES) this.cull(h.x, h.y, this.scene.add.image(h.x, h.y, this.vt("iceHole")).setDepth(FLAT + 2800));
    for (const f of Lay.POND_SPOTS) {
      const img = this.prop(this.vt("bankSeat"), f.x, f.y + 4, f.y);
      if (f.dir === "left") img.setFlipX(true);
    }
  }

  /** 캠프파이어 존 불멍 자리 둘 · 간식 수레 · 장작더미 (벤치·통나무는 가구로) */
  /** 11/26 누울 수 있는 해먹 (펜션 정원 간판 옆 · 캠프파이어 존 해먹 쉼터 둘 — campHammock). 받침 (x, y + 1), 깊이 받침 − 2 (마을 해먹과 같다) */
  private readonly hammockImgs = new Map<string, { img: Phaser.GameObjects.Image; full: string; posts: string }>();
  private addHammocks(): void {
    this.hammockImgs.clear();
    for (const h of MAP_HAMMOCKS) {
      const full = this.vt(h.skin === "campSun" ? "hammockSun" : "hammockMint");
      const img = this.prop(full, h.x, h.y, h.y - 2, 1);
      this.hammockImgs.set(h.id, { img, full, posts: this.vt("hammockPosts") });
    }
  }
  /** 누가 누워 있는 해먹은 기둥만 (줄·천·몸은 누운 사람 그림이 흔들리며 그린다) */
  setHammockBusy(busy: ReadonlySet<string>): void {
    for (const [id, h] of this.hammockImgs) {
      const key = busy.has(id) ? h.posts : h.full;
      if (h.img.texture.key !== key) h.img.setTexture(key);
    }
  }

  private addCampfireZone(): void {
    const T = Art.CAMP_TEX;
    for (const [i, p] of Lay.PITS.entries()) {
      this.prop(T.fireRing, p.x, p.y, p.y, 8).setScale(0.62);
      this.flame(p.x, p.y + 2, p.y + 1, 0.62, i);
      this.light(p.x, p.y - 10, 1.8, 0xffa048, 1);
    }
    this.prop(this.vt("snack"), Lay.SNACK.x, Lay.SNACK.y);
    this.light(Lay.SNACK.x, Lay.SNACK.y - 24, 0.8, 0xffd890, 0.85);
    for (const w of Lay.WOOD_STACKS) this.prop(this.vt("firewood"), w.x, w.y);
  }

  private addLamps(): void {
    for (const p of Lay.LAMPS) {
      this.prop(this.vt("lamp"), p.x, p.y);
      this.light(p.x, p.y - 20, 0.6, 0xffd28a, 0.85);
    }
  }

  // ── NPC·이름표 (판이 바뀌어도 남는다) ──

  private addNpcs(): void {
    const s = this.scene;
    for (const n of CAMP_NPCS) {
      const img = this.keep(s.add.image(n.x, n.y + 1, seasonKey(Art.CAMP_TEX.npc(n.id), this.concept), 0).setOrigin(0.5, 1).setDepth(n.y));
      if (n.facing === 1) img.setFlipX(true);
      this.atlas.ensure(n.name);
      const label = this.keep(s.add.bitmapText(n.x, n.y - Art.NPC_H + 2, FONT_KEY, n.name, FONT_PX).setOrigin(0.5, 1).setTint(0xffe8b0).setDepth(DEPTH.labels - 1));
      this.labels.push(label);
      const on = Lay.campNpcActive(n.id, this.hour);
      img.setVisible(on);
      label.setVisible(on);
      this.npcs.set(n.id, { id: n.id, img, label, x: n.x, y: n.y, on, phase: Math.random() * 1000, frame: 0 });
    }
  }

  private addLabel(x: number, y: number, text: string, tint: number, alpha = 0.88, originY = 1): void {
    this.atlas.ensure(text);
    const t = this.keep(this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1));
    this.labels.push(t);
  }

  private addLabels(): void {
    const water = 0xc8e4ec;
    const land = 0xf0dcb0;
    this.addLabel(Lay.FALL_X, 16, "아스라 폭포", water, 0.66);
    this.addLabel(Lay.POOL.x - 40, Lay.POOL.y + 58, "달그늘 소", water, 0.66);
    this.addLabel(Math.round(Lay.streamX(660)) + 2, 650, "옛길 계곡", water, 0.66);
    this.addLabel(Lay.FIRE.x + 6, Lay.FIRE.y + 106, "캠프파이어 존", land, 0.66);
    this.addLabel(Lay.POND.x, Lay.RES.y1 - 16, "윤슬 낚시터", water, 0.66);
    // 11/26 구역 이름: 「소슬 펜션」은 두 펜션 사이 위 · 「촌캉스」는 두 촌캉스 사이 위 (문패와 안 겹치게)
    this.addLabel(157, 236, "소슬 펜션", land, 0.66);
    this.addLabel(163, 30, "촌캉스", land, 0.66);
    this.addLabel(Lay.FOOTBATH_AT.x, Lay.FOOTBATH_AT.y - 120, "계곡 족욕탕", land, 0.66);
    // 정류장 노선 팻말 · 시간표
    this.addLabel(CAMP_BUS_STOP.x + 20, CAMP_BUS_STOP.y - Lay.CAMP_SHELTER_H - 4, "마을행 · 언젠가 캠핑장 정류장", 0xfff0c0, 0.95);
    this.addLabel(CAMP_BUS_TIMETABLE.x, CAMP_BUS_TIMETABLE.y - 32, "다음 버스: 언젠가", 0xd8ecff, 0.85);
    // 관리소·매점 현판 (오두막 그림의 빈 판 위)
    this.addLabel(CAMP_OFFICE.x - 50, CAMP_OFFICE.y - 37, "관리소", 0x5a3a22, 1, 0.5);
    this.addLabel(CAMP_OFFICE.x + 44, CAMP_OFFICE.y - 40, "매점", 0x5a3a22, 1, 0.5);
    this.addLabel(CAMP_BOARD_SPOT.x, CAMP_BOARD_SPOT.y - 36, "의뢰판", land, 0.8);
    // 11/26 이름 팻말 글자는 짧게, 「헤엄쳐서」 안내는 수영 표지판 위로 (긴 한 줄이 사장님 머리에 걸렸다)
    this.addLabel(Lay.POND_SIGN.x, Lay.POND_SIGN.y - 34, "윤슬 낚시터", 0xbfe6ff, 0.95);
    // 11/26 수영 안내는 잔교 위쪽 끝 팻말 위 (4~6번 좌대 사다리를 바로 앞에 두고)
    this.addLabel(Lay.SWIM_SIGN.x, Lay.SWIM_SIGN.y - 24, "4~6번 좌대는 헤엄쳐 가서 사다리로 올라가요", 0xbfe6ff, 0.95);
    // 11/26 옆 카라반 11번 분양 팻말 글자와 붙지 않게 길 쪽으로 조금
    this.addLabel(Lay.BOAT_SIGN.x + 14, Lay.BOAT_SIGN.y - 26, "나룻배 (2인)", 0xbfe6ff, 0.9);
  }

  /** 반짝임·불티·반딧불·다람쥐·물안개 (작은 풀 — 판이 바뀌어도 남는다) */
  private addPools(): void {
    const s = this.scene;
    const T = Art.CAMP_TEX;
    const n = (full: number, low: number) => (this.reduced ? low : full);
    for (let i = 0; i < n(16, 5); i++) this.embers.push({ img: this.keep(s.add.image(0, 0, T.ember).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 2).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
    for (let i = 0; i < n(16, 6); i++) this.sparkles.push({ img: this.keep(s.add.image(0, 0, T.sparkle).setDepth(FLAT + 3650).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
    for (let i = 0; i < n(10, 4); i++) this.fireflies.push({ img: this.keep(s.add.image(0, 0, T.firefly).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fireflies).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
    for (let i = 0; i < (this.reduced ? 3 : 7); i++)
      this.smoke.push({ img: this.keep(s.add.image(Lay.BBQ.grill.x, Lay.BBQ.grill.y, T.bbqSmoke).setDepth(Lay.BBQ.grill.y + 30).setVisible(false)), t0: -1, life: 0, x: 0, y: 0, vx: 0 });
    const trees = Lay.CAMP_SQUIRREL_TREES;
    if (trees.length >= 2)
      for (let i = 0; i < 3; i++) {
        const t = trees[(i * 4) % trees.length];
        const img = this.keep(s.add.image(t.x + 6, t.y + 2, T.squirrel, 0).setOrigin(0.5, 1).setDepth(t.y + 2).setVisible(false));
        this.squirrels.push({ img, from: { x: t.x + 6, y: t.y + 2 }, to: { x: t.x + 6, y: t.y + 2 }, t0: 0, dur: 1, rest: 1000 + i * 1500 });
      }
    for (const p of Lay.CAMP_MIST_SPOTS) {
      const img = this.keep(s.add.image(p.x, p.y, T.mist).setDepth(OVERHEAD - 8).setScale(1.4, 1.1).setAlpha(0).setVisible(false));
      this.mists.push({ img, x: p.x, y: p.y, phase: Math.random() * 10 });
    }
  }

  // ── CampMapApi ──

  standable(x: number, y: number): boolean {
    return Lay.campStandable(x, y);
  }

  /** 모닥불 둘레에 앉아 불멍 중 (CampfireView가 부른다 — 마을 WorldMap.boostCampfire와 같은 자리) */
  boostCampfire(id: string | null): void {
    this.fireBoost = id !== null;
  }

  /** 11/26 폭포 멍 (폭포 다리 의자에서 시점 바꾸기 — 물보라·물안개가 짙어진다) */
  setFallsFocus(on: boolean): void {
    this.fallsFocus = on ? 1 : 0;
  }

  /** 11/18 눈싸움: 관리소·매점 사람들도 맞는다 (나와 있는 사람만 — 그림 한 장: 머리에 눈, 움찔, 가끔 한마디) */
  snowNpcs(): readonly SnowNpc[] {
    return (this.snowList ??= [...this.npcs.values()].map((n): SnowNpc => ({ voice: "person", box: (out) => n.on && imageBox(n.img, out), img: () => n.img })));
  }
  private snowList: SnowNpc[] | null = null;

  npcVisible(id: CampNpcId): boolean {
    return this.npcs.get(id)?.on ?? false;
  }

  npcAnchor(id: CampNpcId): { x: number; y: number } | null {
    const n = this.npcs.get(id);
    return n && n.on ? { x: n.x, y: n.y - Art.NPC_H - 2 } : null;
  }

  underTarp(): boolean {
    return false;
  }

  update(time: number, delta: number, view: Phaser.Geom.Rectangle, t: CampTime): void {
    if (this.destroyed) return;
    this.hour = t.hour;
    this.updateCulling(view);
    this.updateLabels();
    this.updateNpcs(time);
    const night = t.hour >= 19.5 || t.hour < 5 ? 1 : 0;
    const dark = Math.max(t.darkness, night * 0.6);
    this.updateLights(time, dark);
    this.updateSunset(t.hour);
    this.updateFalls(time, view, dark);
    this.updateEmbers(time, delta, t.darkness);
    this.updateSmoke(time, delta, view);
    this.footBubbles?.update(time, view, dark, this.actors());
    this.updateSparkles(time, t);
    this.updateFireflies(time, t);
    this.updateSquirrels(time, t);
    this.updateMist(time, t);
    this.updateSky(time, t);
    this.decor?.update(time, view);
  }

  private updateCulling(view: Phaser.Geom.Rectangle): void {
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
      for (const o of this.cells.get(k) ?? []) o.setVisible(false);
      this.shownCells.delete(k);
    }
    for (const k of want) {
      if (this.shownCells.has(k)) continue;
      this.shownCells.add(k);
      for (const o of this.cells.get(k) ?? []) o.setVisible(true);
    }
    // 폭포·계곡 움직임 (화면 밖이면 멈추고 숨긴다)
    const F = FALLS_AREA;
    const fallsOn = view.right > F.x && view.x < F.x + F.w && view.bottom > F.y && view.y < F.y + F.h;
    if (fallsOn !== this.fallsShown) {
      this.fallsShown = fallsOn;
      for (const o of [this.falls, this.fallsGlow, this.moonGlow, this.rainbow]) o?.setVisible(fallsOn);
      for (const f of this.foams) f.img.setVisible(fallsOn);
      for (const p of this.puffs) p.img.setVisible(fallsOn);
      for (const r of this.ripples) r.img.setVisible(fallsOn);
      for (const r of this.rare) r.setVisible(fallsOn);
      if (!fallsOn) for (const d of this.drops) d.img.setVisible(false);
    }
    const streamOn = view.right > 560 && view.x < 720 && view.bottom > CAMP_STREAM_TOP;
    if (streamOn !== this.streamShown) {
      this.streamShown = streamOn;
      for (const f of this.flecks) f.img.setVisible(streamOn);
    }
  }

  private makeChunk(cx: number, cy: number): void {
    this.chunks.set(cy * CHUNK_COLS + cx, this.keep(this.scene.add.image(cx * CHUNK, cy * CHUNK, this.chunkKey(cx, cy)).setOrigin(0, 0).setDepth(DEPTH.ground)));
  }

  /** 이 판의 바닥 덩어리 텍스처 키 (없으면 굽는다 — 11/17 겨울·크리스마스는 겨울 바닥) */
  private chunkKey(cx: number, cy: number): string {
    const winter = isSnowy(this.concept);
    const key = winter ? Art.CAMP_TEX.winterGround(cx, cy) : Art.CAMP_TEX.ground(cx, cy);
    if (!this.scene.textures.exists(key)) {
      const { canvas, ctx } = makeCanvas(CHUNK, CHUNK);
      ctx.putImageData(new ImageData(Art.campGroundPixels(cx, cy, CHUNK, winter) as unknown as Uint8ClampedArray<ArrayBuffer>, CHUNK, CHUNK), 0, 0);
      addCanvasTexture(this.scene, key, { canvas });
      clampEdges(this.scene, key);
    }
    return key;
  }

  /** 글씨는 화면에서 늘 같은 크기 (1/zoom) */
  private updateLabels(): void {
    const s = 1 / (this.scene.cameras.main.zoom || 1);
    if (Math.abs(s - this.labelScale) < 1e-4) return;
    this.labelScale = s;
    for (const l of this.labels) l.setScale(s);
  }

  private updateNpcs(time: number): void {
    for (const n of this.npcs.values()) {
      const on = Lay.campNpcActive(n.id, this.hour);
      if (on !== n.on) {
        n.on = on;
        n.img.setVisible(on);
        n.label.setVisible(on);
      }
      if (!on || this.reduced) continue;
      const f = Math.floor((time + n.phase) / (n.id === "guitarist" ? 260 : 720)) % 2;
      if (f !== n.frame) {
        n.frame = f;
        n.img.setFrame(f);
      }
    }
  }

  /** 줄 조명·자판기: 어두워지면 켜진다 (전구 색 + 빛 번짐, 살짝 깜빡) */
  private updateLights(time: number, dark: number): void {
    const on = Math.max(0, Math.min(1, (dark - 0.18) / 0.4));
    const changed = Math.abs(on - this.lit) > 0.02;
    if (changed) {
      this.lit = on;
      const tint = mix(0x8a7a60, 0xfff4c8, on);
      for (const b of this.bulbs) {
        b.img.setTint(tint);
        b.glow.clearTint();
      }
      for (const v of this.vendingLit) v.setAlpha(0.15 + 0.7 * on);
    }
    if (on <= 0.01) {
      if (changed) for (const b of this.bulbs) b.glow.setAlpha(0);
      return;
    }
    const tw = this.reduced ? 0 : 0.12;
    for (const b of this.bulbs) {
      if (!b.glow.visible) continue;
      b.glow.setAlpha(on * (0.78 + tw * Math.sin(time / 380 + b.phase)));
    }
  }

  /** 노을(17~19시)에 단풍·노란 잎이 붉게 */
  private updateSunset(hour: number): void {
    const k = !isSnowy(this.concept) && hour >= 16.6 && hour <= 19.4 ? Math.sin(((hour - 16.6) / 2.8) * Math.PI) : 0;
    if (Math.abs(k - this.sunsetK) < 0.04) return;
    this.sunsetK = k;
    const tint = mix(0xffffff, 0xff9a78, k * 0.7);
    for (const f of this.foliage) {
      if (k <= 0.001) f.clearTint();
      else f.setTint(tint);
    }
  }

  /** 폭포 물줄기·거품·물보라·물안개·물결·무지개·반짝임 (3초 주기 시계 하나 — 화면 근처일 때만) */
  private updateFalls(time: number, view: Phaser.Geom.Rectangle, night: number): void {
    const lt = ((time % LOOP) + LOOP) % LOOP;
    if (this.streamShown)
      for (const f of this.flecks) {
        const k = (lt / LOOP) * f.k + f.y0;
        const y = 350 + (k % 1) * 470;
        if (y < view.y - 20 || y > view.bottom + 20) continue;
        f.img.setPosition(Math.round(Lay.streamX(y) + f.off * 0.6), Math.round(y));
      }
    for (const gl of this.glints) {
      if (gl.y < view.y - 10 || gl.y > view.bottom + 10 || gl.x < view.x - 10 || gl.x > view.right + 10) continue;
      const k = (lt / LOOP + gl.ph) % 1;
      const on = k < 0.18 ? Math.sin((k / 0.18) * Math.PI) : 0;
      gl.img.setAlpha(on * (night > 0.3 ? 0.8 : 0.95)).setBlendMode(night > 0.3 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
    if (!this.fallsShown || !this.falls) return;
    const frames = this.reduced ? 8 : 16;
    this.falls.setFrame(Math.floor(time / (1000 / frames)) % VA.FALL_FRAMES);
    this.fallsGlow?.setFrame(this.falls.frame.name).setAlpha(night > 0.3 ? 0.08 : 0);
    this.moonGlow?.setAlpha(night > 0.3 ? 0.13 + 0.03 * Math.sin((lt / LOOP) * Math.PI * 2) : 0);
    for (const f of this.foams) f.img.setFrame((Math.floor(time / (1000 / f.fps)) + f.off) % VA.FOAM_FRAMES);
    const boost = 1 + this.fallsFocus * 0.6;
    for (const d of this.drops) {
      const age = (((lt - d.s * LOOP) % LOOP) + LOOP) % LOOP;
      if (age > d.life) {
        if (d.img.visible) d.img.setVisible(false);
        continue;
      }
      const a = age / 1000;
      const x = d.x0 + d.vx * a;
      const y = d.y0 + d.vy * a + 0.5 * 170 * a * a;
      d.img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setAlpha(Math.min(1, 0.95 * (1 - age / d.life) * boost));
    }
    for (const p of this.puffs) {
      const k = (lt / LOOP + p.ph) % 1;
      const env = Math.sin(k * Math.PI);
      p.img
        .setPosition(p.x + Math.sin((k + p.ph) * Math.PI * 2) * 5, p.y - k * p.rise)
        .setScale(p.sc * (0.8 + k * 0.5) * (1 + this.fallsFocus * 0.2), p.sc * (0.7 + k * 0.3))
        .setAlpha(Math.min(0.9, p.a * env * (night > 0.3 ? 0.55 : 1) * boost));
    }
    for (const r of this.ripples) {
      const k = (lt / LOOP + r.ph) % 1;
      const kk = (k * 2) % 1;
      r.img.setPosition(r.x, r.y + kk * 10).setScale(0.5 + kk * 1.5, 0.5 + kk * 1.1).setAlpha(0.3 * (1 - kk) * Math.min(1, kk * 5));
    }
    this.rainbow?.setAlpha(night > 0.2 ? 0 : 0.17 + 0.05 * Math.sin((lt / LOOP) * Math.PI * 2));
    this.rare.forEach((img, i) => {
      const k = (lt / LOOP + 0.62 + i * 0.05) % 1;
      img.setAlpha(k < 0.08 ? Math.sin((k / 0.08) * Math.PI) * 0.9 : 0).setBlendMode(night > 0.3 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    });
  }

  /** 바베큐 그릴 위로 피어오르는 연기 (화면 근처일 때만) */
  private updateSmoke(time: number, delta: number, view: Phaser.Geom.Rectangle): void {
    const g = Lay.BBQ.grill;
    const near = Lay.inRect({ x: view.x - 60, y: view.y - 60, w: view.width + 120, h: view.height + 120 }, g.x, g.y);
    const dt = delta / 1000;
    for (const p of this.smoke) {
      if (p.t0 < 0 || time - p.t0 > p.life) {
        if (!near || Math.random() > 0.03) {
          if (p.t0 >= 0) p.img.setVisible(false);
          p.t0 = -1;
          continue;
        }
        p.t0 = time;
        p.life = 1600 + Math.random() * 1200;
        p.x = g.x - 6 + Math.random() * 12;
        p.y = g.y - 20;
        p.vx = 3 + Math.random() * 5;
        p.img.setVisible(true);
      }
      const k = (time - p.t0) / p.life;
      p.x += p.vx * dt;
      p.y -= 14 * dt;
      p.img.setPosition(p.x, p.y).setScale(0.8 + k * 1.6).setAlpha(0.7 * (1 - k));
    }
  }

  private updateEmbers(time: number, delta: number, dark: number): void {
    const dt = delta / 1000;
    for (const e of this.embers) {
      if (e.t0 < 0 || time - e.t0 > e.life) {
        // 불멍 중(모닥불 둘레에 앉음)이면 불티가 더 많이 (마을 boostCampfire와 같은 뜻)
        if (Math.random() > (this.fireBoost ? 0.14 : 0.04)) {
          if (e.t0 >= 0) e.img.setVisible(false);
          e.t0 = -1;
          continue;
        }
        e.t0 = time;
        e.life = 900 + Math.random() * 900;
        e.x = CAMP_FIRE.x + (Math.random() - 0.5) * 16;
        e.y = CAMP_FIRE.y - 8;
        e.vx = (Math.random() - 0.5) * 14;
        e.vy = -26 - Math.random() * 20;
        e.img.setVisible(true);
      }
      e.x += e.vx * dt + Math.sin((time - e.t0) / 140) * 0.2;
      e.y += e.vy * dt;
      const k = (time - e.t0) / e.life;
      e.img.setPosition(e.x, e.y).setAlpha((1 - k) * (0.55 + dark * 0.45));
    }
  }

  /** 계곡·저수지 물 반짝임 (낮에 더 많이 — 화면 안에서만) */
  private updateSparkles(time: number, t: CampTime): void {
    const want = t.rain > 0.3 ? 0.3 : 1 - t.darkness * 0.7;
    for (const s of this.sparkles) {
      if (s.t0 < 0 || time - s.t0 > s.life) {
        if (Math.random() > want * 0.05) {
          if (s.t0 >= 0) s.img.setVisible(false);
          s.t0 = -1;
          continue;
        }
        s.t0 = time;
        s.life = 500 + Math.random() * 600;
        if (Math.random() < 0.5) {
          s.y = CAMP_STREAM_TOP + 40 + Math.random() * (CAMP_HEIGHT - CAMP_STREAM_TOP - 40);
          s.x = campStreamX(s.y) + (Math.random() - 0.5) * CAMP_STREAM_HALF_W * 1.4;
        } else {
          s.x = Lay.RES.x0 + 8 + Math.random() * (Lay.RES.x1 - Lay.RES.x0 - 16);
          s.y = Lay.RES.y0 + 8 + Math.random() * (Lay.RES.y1 - Lay.RES.y0 - 16);
        }
        s.img.setPosition(Math.round(s.x), Math.round(s.y)).setVisible(true);
      }
      const k = (time - s.t0) / s.life;
      s.img.setAlpha(Math.sin(k * Math.PI) * (0.5 + 0.5 * (1 - t.darkness)));
    }
  }

  /** 반딧불 (밤, 비 안 오는 날): 계곡 물가와 캠프파이어 존 둘레 */
  private updateFireflies(time: number, t: CampTime): void {
    const night = t.hour >= 19.5 || t.hour < 4.5;
    const on = night && t.rain < 0.3 && !isSnowy(this.concept);
    this.fireflies.forEach((f, i) => {
      if (!on) {
        if (f.t0 >= 0) {
          f.img.setVisible(false);
          f.t0 = -1;
        }
        return;
      }
      if (f.t0 < 0) {
        f.t0 = time;
        if (i % 3 === 2) {
          const a = Math.random() * Math.PI * 2;
          f.x = CAMP_FIRE.x + Math.cos(a) * 140;
          f.y = CAMP_FIRE.y + Math.sin(a) * 100;
        } else {
          f.y = CAMP_STREAM_TOP + 60 + Math.random() * (CAMP_HEIGHT - CAMP_STREAM_TOP - 100);
          f.x = campStreamX(f.y) + (i % 2 ? 1 : -1) * (CAMP_STREAM_HALF_W + 14 + Math.random() * 30);
        }
        f.vx = Math.random() * 10;
        f.img.setVisible(true);
      }
      const p = (time - f.t0) / 1000 + f.vx;
      const x = f.x + Math.sin(p * 0.7) * 14 + Math.sin(p * 1.9) * 4;
      const y = f.y + Math.cos(p * 0.55) * 9 - 6;
      f.img.setPosition(x, y).setAlpha(0.35 + 0.65 * Math.max(0, Math.sin(p * 2.2 + i)));
    });
  }

  /** 낮(7~17시)에 다람쥐가 나무 사이를 깡충깡충 */
  private updateSquirrels(time: number, t: CampTime): void {
    const on = t.hour >= SQUIRREL_HOURS[0] && t.hour < SQUIRREL_HOURS[1] && t.rain < 0.3;
    const trees = Lay.CAMP_SQUIRREL_TREES;
    for (const q of this.squirrels) {
      if (q.img.visible !== on) q.img.setVisible(on);
      if (!on || this.reduced) continue;
      const k = (time - q.t0) / q.dur;
      if (k >= 1) {
        q.img.setPosition(q.to.x, q.to.y).setFrame(0);
        if (time - q.t0 - q.dur < q.rest) continue;
        const near = trees.filter((tr) => Math.hypot(tr.x - q.to.x, tr.y - q.to.y) < 220 && Math.hypot(tr.x - q.to.x, tr.y - q.to.y) > 20);
        const next = near.length ? near[Math.floor(Math.random() * near.length)] : trees[Math.floor(Math.random() * trees.length)];
        q.from = { x: q.to.x, y: q.to.y };
        q.to = { x: next.x + (Math.random() < 0.5 ? -7 : 7), y: next.y + 3 };
        q.t0 = time;
        q.dur = Math.max(600, Math.hypot(q.to.x - q.from.x, q.to.y - q.from.y) * 14);
        q.rest = 1500 + Math.random() * 4000;
        q.img.setFlipX(q.to.x < q.from.x);
        continue;
      }
      const x = q.from.x + (q.to.x - q.from.x) * k;
      const y = q.from.y + (q.to.y - q.from.y) * k;
      const hop = Math.abs(Math.sin(k * Math.PI * Math.max(2, Math.round(q.dur / 220)))) * 4;
      q.img.setPosition(x, y - hop).setDepth(y).setFrame(hop > 1.5 ? 1 : 0);
    }
  }

  /** 새벽(4~9시) 계곡 물안개 (안개 낀 날은 더 짙게) */
  private updateMist(time: number, t: CampTime): void {
    const dawn = t.hour >= 4 && t.hour <= 9.5 ? Math.max(0, Math.sin(((t.hour - 4) / 5.5) * Math.PI)) : 0;
    const k = Math.min(1, dawn * 0.85 + t.fog * 0.5);
    for (const m of this.mists) {
      if (k < 0.02) {
        if (m.img.visible) m.img.setVisible(false);
        continue;
      }
      if (!m.img.visible) m.img.setVisible(true);
      const drift = this.reduced ? 0 : Math.sin(time / 7000 + m.phase) * 18;
      m.img.setPosition(m.x + drift, m.y + Math.sin(time / 9000 + m.phase) * 6).setAlpha(k * (0.7 + 0.2 * Math.sin(time / 3000 + m.phase)));
    }
  }

  /** 일출빛(5~8시) */
  private updateSky(time: number, t: CampTime): void {
    const sunrise = t.hour >= 5 && t.hour <= 8 ? Math.sin(((t.hour - 5) / 3) * Math.PI) : 0;
    const sr = sunrise * (1 - t.rain) * (1 - t.fog * 0.5);
    if (sr > 0.02) this.sunGlow.setVisible(true).setAlpha(sr * (0.75 + 0.05 * Math.sin(time / 1500)));
    else if (this.sunGlow.visible) this.sunGlow.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.decor?.destroy();
    this.decor = null;
    this.footBubbles?.destroy();
    this.footBubbles = null;
    for (const o of this.vis) o.destroy();
    this.vis = [];
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.cells.clear();
    this.chunks.clear();
    this.labels.length = 0;
    // 장면을 닫을 때(SHUTDOWN)는 물리 세계가 그룹을 먼저 비운다 → 남아 있을 때만
    for (const g of [this.colliders, this.furnitureColliders]) if (g.children) g.clear(true, true);
    const s = this.scene;
    if (s.anims.exists(`${P}flames`)) s.anims.remove(`${P}flames`);
    // 11/15 그림(camp- 텍스처)은 지우지 않아요. 다시 올 때 굽지 않게 남겨 둬요
  }
}

function cellOf(x: number, y: number): number {
  return Math.floor(Math.max(0, y) / CELL) * CELL_COLS + Math.floor(Math.max(0, Math.min(CAMP_WIDTH - 1, x)) / CELL);
}

/** 가구 그림 종류 (null = 따로 그리는 자리 — 족욕탕 방석은 족욕탕 그림에 있다) */
function furnitureKey(f: Furniture): "log" | "rusty" | "bench" | "plank" | "swing" | null {
  if (f.id.startsWith("qT")) return null;
  if (/^q[LSG]\d/.test(f.id) || f.id === "qP4") return "log";
  if (f.id === "qB") return "rusty";
  if (f.id === "qF") return "bench";
  if (f.id === "qGS") return "swing";
  return "plank";
}


/** 바닥 덩어리는 이어 붙이는 그림이라 반복할 일이 없다 → CLAMP_TO_EDGE (배율이 소수일 때 가장자리 1px 줄 방지, WorldMap과 같다) */
export function clampEdges(scene: Phaser.Scene, key: string): void {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  const src = scene.textures.get(key).source[0];
  if (src?.glTexture && src.image instanceof HTMLCanvasElement) r.canvasToTexture(src.image, src.glTexture, true, src.flipY);
}

/** 캠핑장 기본 그림 굽는 목록 (CampMap이 장면을 만들 때, 또는 버스 창밖 연출 동안 campPrebake가 조금씩) */
export type CampTexBuild = () => Art.ArtOut | Grid;
export function forEachCampTexture(tex: (key: string, build: CampTexBuild, linear?: boolean) => void): void {
  const T = Art.CAMP_TEX;
  for (let v = 0; v < 2; v++) {
    tex(T.spruce(v), () => Art.spruceArt(v));
    tex(T.pine(v), () => Art.pineArt(v));
    tex(T.fir(v), () => Art.firArt(v));
    tex(T.maple(v), () => Art.mapleArt(v));
    tex(T.mapleO(v), () => Art.mapleOArt(v));
    tex(T.yellow(v), () => Art.yellowArt(v));
    tex(T.bush(v), () => Art.bushArt(v));
    tex(T.boulder(v), () => Art.boulderArt(v));
  }
  for (let v = 0; v < 3; v++) {
    tex(T.leafPile(v), () => Art.leafPileArt(v));
    tex(T.mushroom(v), () => Art.mushroomArt(v));
    tex(T.fern(v), () => Art.fernArt(v));
    tex(T.pebbles(v), () => Art.pebblesArt(v));
  }
  tex(T.logChair, Art.logChairArt);
  tex(T.bench, Art.benchArt);
  tex(T.rustyBench, Art.rustyBenchArt);
  tex(T.plankBench2, () => Art.plankBenchArt(2));
  tex(T.office, Art.officeArt);
  tex(T.board, Art.boardArt);
  tex(T.fireRing, Art.fireRingArt);
  tex(T.flames, Art.flamesArt);
  tex(T.bridge, Art.bridgeArt);
  tex(T.bbqGrill, Art.bbqGrillArt);
  tex(T.bbqTable, Art.bbqTableArt);
  tex(T.vending, Art.vendingArt);
  tex(T.vendingLit, Art.vendingLitArt);
  tex(T.bbqSmoke, Art.bbqSmokeArt);
  for (const m of BBQ_MENU) tex(T.bbqPlate(m.id), () => Art.bbqPlateArt(m.id));
  tex(T.pole, Art.poleArt);
  tex(T.bulb, Art.bulbArt);
  tex(T.bulbGlow, () => Art.glowArt(16, 0xffd890, 1.8), true);
  tex(T.shelter, Art.shelterArt);
  tex(T.busSign, Art.busSignArt);
  tex(T.timetable, Art.timetableArt);
  for (const n of CAMP_NPCS) tex(T.npc(n.id), () => Art.npcArt(n.id));
  // 11/17 겨울·크리스마스판 NPC 옷 (판마다 따로 — 판이 바뀌면 setConcept가 갈아 끼운다)
  for (const c of ["winter", "christmas"] as const) for (const n of CAMP_NPCS) tex(seasonKey(T.npc(n.id), c), () => Art.npcArt(n.id, c));
  tex(T.squirrel, Art.squirrelArt);
  tex(T.mist, Art.mistArt, true);
  tex(T.sunGlow, () => Art.glowArt(64, 0xffb070, 1.4), true);
  tex(T.sparkle, Art.sparkleArt);
  tex(T.ember, Art.emberArt);
  tex(T.firefly, Art.fireflyArt);
}
