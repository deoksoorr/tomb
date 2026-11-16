import * as Phaser from "phaser";
import {
  SEA_BOAT,
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_BUOYS,
  SEA_BUS_SIGN,
  SEA_BUS_STOP,
  SEA_BUS_TIMETABLE,
  SEA_DEEP_Y,
  SEA_FLAT_Y0,
  SEA_FOOTBATH,
  BBQ_MENU,
  SEA_FURNITURE,
  SEA_EDGE_SEATS,
  SEA_SPOTS,
  SEA_LOUNGER_FRONT_Y,
  SEA_MATS,
  SEA_FISHING_LEDGES,
  SEA_GHOST_BERTH,
  SEA_GULL_PERCHES,
  SEA_HEIGHT,
  SEA_KIOSK,
  SEA_LIGHTHOUSE,
  SEA_LOTS,
  SEA_LOT_LANTERNS,
  SEA_LOT_MAILBOX,
  SEA_MARKET,
  SEA_PIER,
  SEA_PIER_END,
  SEA_REALTY,
  SEA_ROCKS,
  SEA_TIDE_POOLS,
  SEA_WIDTH,
  SEA_ZONES,
  TIDE_HIGH_Y,
  seaLotSign,
  tideLineY,
} from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { bbqPlateArt, CAMP_TEX } from "../camp/campArt";
import { DEPTH } from "../config";
import { makeCanvas, mix } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { PLATE_MINT, PLATE_WOOD, SignPlate } from "../world/SignPlate";
import { worldTintOf } from "../world/worldTint";
import * as Art from "./seaArt";
import { noise1, shoreDelay, shoreReach, WaveTrain } from "./seaWaves";
import * as Lay from "./seaLayout";
import { type SeaInteractable, type SeaLight, type SeaMapApi, type SeaTime } from "./seaTypes";

// 11/16 달물결 포구 맵 (SeaMapApi 구현): 바닥(덩어리 텍스처, 화면 근처만), 건물·소품(칸 컬링, y 정렬), 이름표, 충돌,
// 물때 그림(물가 선·물거품·물러난 거품 자국·젖은 모래·먼바다 반짝임), 배와 부표 흔들림, 물보라, 갈매기 여덟 마리, 밤 가로등·등대 불빛.
// 물은 갯벌 위에 덮어 그리기만 해요 (충돌은 늘 같아요). 물 층은 바닥 장식보다 위, 선착장·방파제 판과 모든 y 정렬 그림(사람 포함)보다 아래예요.
// 그림은 정류장 근처·버스 여행 동안 seaPrebake가 조금씩 구워요. 한 번 구운 "sea-" 텍스처는 지우지 않아요.
// 매 프레임 일은 물 층 위치 옮기기와 작은 풀(물보라 10·반짝임 10·갈매기 8)뿐이라 가벼워요.

/** 소품 컬링 칸 */
const CELL = 256;
const CELL_COLS = Math.ceil(SEA_WIDTH / CELL);
/** 시장(가로 280)이 칸 경계에서 사라지지 않게 넉넉히 */
const CULL_PAD = 160;
const CHUNK = Art.SEA_CHUNK;
const CHUNK_COLS = Math.ceil(SEA_WIDTH / CHUNK);
const CHUNK_ROWS = Math.ceil(SEA_HEIGHT / CHUNK);
/** 바닥에 붙은 그림 (아바타가 늘 위로) */
const FLAT = DEPTH.decal;
/** 머리 위 (나는 갈매기) — 어둠 막(DEPTH.dark)보다는 아래 */
const OVERHEAD = 90_000;

/**
 * 물 층 depth. 바닥 장식(FLAT + y, 최대 FLAT + 960)보다 위, 모든 y 정렬 그림(0..960 — 사람·바위·배·말뚝)보다 아래.
 * 선착장·방파제 판(deck)은 물 위에 깔려요
 */
export const SEA_DEPTH = {
  wet: DEPTH.decal + 3000,
  lace: DEPTH.decal + 3100,
  water: DEPTH.decal + 3200,
  foam: DEPTH.decal + 3300,
  shimmer: DEPTH.decal + 3400,
  glint: DEPTH.decal + 3500,
  deck: DEPTH.decal + 4000,
} as const;

/** 물가가 밀려왔다 빠지는 한 번의 보통 길이 (ms) — 11/16부터 파도마다 4~9초로 달라요 (seaWaves) */
export const SURGE_MS = 6000;
/** 밀려올 때 물가가 올라오는 가장 큰 폭 (px, 큰 파도 × 가장 멀리 닿는 곳) — 젖은 모래 띠가 이보다 위에서 시작해요 */
export const SURGE_PX = 100;
/** 물보라 자리 고르기용 물가 칸 (px) */
const SEG_W = 32;
const SEGS = Math.ceil(SEA_WIDTH / SEG_W);
/**
 * 11/16 사용자 "파도가 32px 조각으로 끊겨 보여요" → 물가는 이어진 곡선 하나 (Phaser Rope 띠).
 * RSTEP px마다 조절점에서 파도 높이를 바로 계산하고 (잡음이 부드러워 곡선도 부드러워요), 그 사이는 띠가 곧게 이어요.
 * 무늬는 월드 좌표로 붙여요 (텍스처가 2의 거듭제곱이라 REPEAT로 되풀이)
 */
const RSTEP = 8;
const RN = SEA_WIDTH / RSTEP + 1;
/** 반짝임 풀 크기 (낮 햇빛·밤 달빛 별) · 밤 물가 물빛 점 */
const STARS = 26;
const STARS_REDUCED = 8;
const GLOWS = 14;
/** 물 몸통 높이 (만조 물가에서 맵 아래까지 + 여유) */
/** 젖은 모래가 마르는 빠르기 (px/ms — 1분에 1.5px) */
const DRY_PX_PER_MS = 1.5 / 60_000;
/** 젖은 모래 띠 최대 높이 */
const WET_MAX = 70;
/** 갈매기가 이만큼 가까이 사람이 오면 날아올라요 */
const GULL_SCARE = 56;
const GULLS = 8;

type Culled = Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText;
type Mote = { img: Phaser.GameObjects.Image; x: number; y: number; t0: number; life: number };
type Perch = { x: number; y: number; lift: number };
type GullMode = "circle" | "land" | "perch" | "flee";
type Gull = {
  img: Phaser.GameObjects.Image;
  mode: GullMode;
  x: number;
  y: number;
  /** 맴도는 원 */
  cx: number;
  cy: number;
  rad: number;
  ang: number;
  spd: number;
  /** 이동 (land·flee) */
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t0: number;
  dur: number;
  perch: number;
  until: number;
  phase: number;
};

/** 시험·장면용: 지금 물가 선 (물 몸통이 시작하는 y, 밀려옴 포함) */
export type SeaWaterState = { level: number; lineY: number; edgeY: number; wetTop: number };

export class SeaMap implements SeaMapApi {
  readonly width = SEA_WIDTH;
  readonly height = SEA_HEIGHT;
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  readonly interactables: readonly SeaInteractable[] = Lay.SEA_INTERACTABLES;
  readonly staticLights: readonly SeaLight[] = Lay.SEA_LIGHTS;

  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly chunks = new Map<number, Phaser.GameObjects.Image>();
  private readonly cells = new Map<number, Culled[]>();
  private readonly shownCells = new Set<number>();
  private lastCull = "";
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private labelScale = 0;
  private destroyed = false;
  private started = false;

  // 물
  /** 11/16 물 몸통·물가 거품 (조각마다 — 파도가 닿는 때·폭이 달라요) */
  private readonly strips: Phaser.GameObjects.Rope[] = [];
  private waterR: Phaser.GameObjects.Rope | null = null;
  private foamR: Phaser.GameObjects.Rope | null = null;
  private duskWaterR: Phaser.GameObjects.Rope | null = null;
  private duskFoamR: Phaser.GameObjects.Rope | null = null;
  private laceR: Phaser.GameObjects.Rope | null = null;
  private sheenR: Phaser.GameObjects.Rope | null = null;
  // 조절점마다 (RN개)
  private readonly pSurge = new Float32Array(RN);
  private readonly pFoam = new Float32Array(RN);
  private readonly pTop = new Float32Array(RN);
  private water: Phaser.GameObjects.Rope | null = null;
  private foam: Phaser.GameObjects.Rope | null = null;
  private readonly waves = new WaveTrain((Date.now() ^ 0x5eaf00d) >>> 0);
  private lastBig = 0;
  /** 11/16 먼바다 깊이 그늘·지나가는 빛 띠·반짝이는 별·밤 물빛 */
  private depthShade: Phaser.GameObjects.Image | null = null;
  private sheen: Phaser.GameObjects.Image | null = null;
  private readonly stars: (Mote & { s: number })[] = [];
  private readonly glows: (Mote & { drift: number })[] = [];
  /** 11/16 간판 이름표 (시장·부동산·매점·오두막 터·정류장) */
  private readonly plates: SignPlate[] = [];
  private lace: Phaser.GameObjects.TileSprite | null = null;
  private wet: Phaser.GameObjects.Image | null = null;
  private shimmer: Phaser.GameObjects.TileSprite | null = null;
  private level = Number.NaN;
  private wetTop = Number.NaN;
  private lastTime = -1;
  /** 지금 물 (시험·장면용) */
  readonly waterState: SeaWaterState = { level: 1, lineY: TIDE_HIGH_Y, edgeY: TIDE_HIGH_Y, wetTop: TIDE_HIGH_Y };
  private boat: Phaser.GameObjects.Image | null = null;
  private readonly buoys: { img: Phaser.GameObjects.Image; x: number; y: number; phase: number }[] = [];
  private readonly sprays: (Mote & { vy: number; vx: number; s: number })[] = [];
  /** 11/16 물가 조각마다: 이번 파도가 닿은 가장 높은 곳 (천천히 물러나요 — 그 사이에 레이스·젖은 윤기가 남아요) */
  private readonly reachTop = new Float32Array(RN).fill(Number.NaN);
  private readonly segSurge: number[] = new Array<number>(SEGS).fill(0);
  /** 11/16 저녁 물 (노을이 비친 물·거품 — 저녁에만 낮 물 위에 겹쳐요) */
  /** 11/16 저녁 해가 비친 금빛 물결 길 (작은 풀) */
  private readonly golds: Phaser.GameObjects.Image[] = [];
  /** 물보라 다음 기회 시각 (포아송 — 들쭉날쭉) */
  private nextSprayAt = 0;
  private readonly glints: Mote[] = [];
  private readonly lampGlows: Phaser.GameObjects.Image[] = [];
  /** 11/16 갈매기가 날아오르며 울 때 (월드 좌표, 놀라서인지) */
  onGullCall: ((x: number, y: number, scared: boolean) => void) | null = null;
  private readonly rockFoams: { img: Phaser.GameObjects.Image; y: number; phase: number }[] = [];
  /** 11/16 앞줄 선베드 (큰 파도가 발치를 적시면 물보라 — at = 다음에 튈 수 있는 때) */
  private readonly frontLoungers = SEA_SPOTS.loungers.filter((l) => l.y === SEA_LOUNGER_FRONT_Y).map((l) => ({ x: l.x, y: l.y, at: 0 }));
  private readonly crabs: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private beacon: Phaser.GameObjects.Image | null = null;
  private lit = -1;
  private readonly gulls: Gull[] = [];
  private readonly perches: Perch[] = [];
  private readonly perchTaken: (number | null)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly reduced: boolean,
    /** true면 장면이 parts()를 프레임마다 조금씩 불러요 (버스 창밖 연출 동안 멈추지 않게) */
    staged = false,
  ) {
    this.colliders = scene.physics.add.staticGroup();
    this.furnitureColliders = scene.physics.add.staticGroup();
    if (!staged) {
      const g = this.parts();
      while (!g.next().done);
    }
  }

  /** 맵을 조금씩 만들어요. 한 조각마다 쉬어요(yield). 다 돌아야 맵이 다 선 거예요 */
  *parts(): Generator<void, void> {
    if (this.started) return;
    this.started = true;
    const jobs: [string, SeaTexBuild, boolean][] = [];
    forEachSeaTexture((key, build, linear) => jobs.push([key, build, !!linear]));
    let n = 0;
    for (const [key, build, linear] of jobs) {
      if (this.scene.textures.exists(key)) continue;
      this.tex(key, build, linear);
      if (++n % 6 === 0) yield;
    }
    yield;
    n = 0;
    for (const r of Lay.seaStaticColliders()) {
      this.addCollider(this.colliders, r);
      if (++n % 40 === 0) yield;
    }
    for (const r of Lay.seaFurnitureColliders()) this.addCollider(this.furnitureColliders, r);
    yield;
    this.addGroundDecor();
    yield;
    this.addWater();
    yield;
    this.addDecks();
    yield;
    this.addTrees();
    yield;
    this.addStructures();
    yield;
    this.addShore();
    yield;
    this.addLabels();
    yield;
    this.addPools();
    yield;
    this.addGulls();
  }

  // ── 텍스처 ──

  private tex(key: string, build: SeaTexBuild, linear = false): void {
    if (this.scene.textures.exists(key)) return;
    const out = build();
    const a: Art.ArtOut = "grid" in out ? out : { grid: out };
    addCanvasTexture(this.scene, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
  }

  // ── 배치 ──

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private addCollider(group: Phaser.Physics.Arcade.StaticGroup, r: Lay.Rect): void {
    const z = this.scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    z.removeFromDisplayList();
    group.add(z);
  }

  /** 컬링 칸에 그림을 넣는다 (받침 좌표 기준) */
  private cull<T extends Culled>(x: number, y: number, o: T): T {
    this.keep(o);
    const k = Math.floor(Math.max(0, Math.min(SEA_HEIGHT - 1, y)) / CELL) * CELL_COLS + Math.floor(Math.max(0, Math.min(SEA_WIDTH - 1, x)) / CELL);
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

  private addGroundDecor(): void {
    const T = Art.SEA_TEX;
    for (const d of Lay.SEA_DECOR) {
      const key = d.kind === "beachGrass" ? T.beachGrass(d.v) : d.kind === "shell" ? T.shell(d.v) : d.kind === "flower" ? T.flower(d.v) : d.kind === "stone" ? T.stone(d.v % 2) : T.drift;
      this.prop(key, d.x, d.y, FLAT + d.y, 1);
    }
  }

  /** 물 층: 젖은 모래 · 물러난 거품 자국 · 물 몸통 · 물가 거품 · 먼바다 반짝임 (모두 맵 폭, 위치만 옮겨요) */
  private addWater(): void {
    const s = this.scene;
    const T = Art.SEA_TEX;
    this.wet = this.keep(s.add.image(0, TIDE_HIGH_Y, T.wet).setOrigin(0, 0).setDisplaySize(SEA_WIDTH, 1).setDepth(SEA_DEPTH.wet));
    // 11/16 물러난 거품 자국·젖은 윤기도 물가 조각마다 (파도가 닿은 곳이 조각마다 달라요)
    this.lace = null;
    // 11/16 물가는 이어진 띠 여섯 (물 몸통·저녁 물·거품·저녁 거품·거품 자국·젖은 윤기)
    const strip = (key: string, depth: number, visible = true): Phaser.GameObjects.Rope => {
      const pts = Array.from({ length: RN }, (_, i) => ({ x: i * RSTEP, y: 0 }));
      const r = this.keep(s.add.rope(0, 0, key, undefined, pts, true).setDepth(depth).setVisible(visible));
      this.strips.push(r);
      return r;
    };
    this.sheenR = strip(T.sheenWet, SEA_DEPTH.wet + 10, false);
    this.laceR = strip(T.lace, SEA_DEPTH.lace, false);
    this.waterR = strip(T.water, SEA_DEPTH.water);
    this.duskWaterR = strip(T.duskWater, SEA_DEPTH.water + 1, false);
    this.foamR = strip(T.foam, SEA_DEPTH.foam);
    this.duskFoamR = strip(T.duskFoam, SEA_DEPTH.foam + 1, false);
    this.water = this.waterR;
    this.foam = this.foamR;
    // 11/16 깊이 띠는 물 몸통 그림이 맡아요 (따로 덮던 그늘은 뺐어요)
    // 11/16 물 층(물 몸통·거품·반짝임)은 땅 색조 곱하기에서 빼요 — 저녁엔 땅만 주황 햇빛을 곱하고 물은 노을이 비친 그림으로 (시안).
    // 물 층 앞(젖은 모래·거품 자국 다음)에서 끄고 선착장·방파제 판 앞에서 다시 켜요. 낮·밤 물빛은 SeaMap이 같은 색조를 직접 곱해요
    const ctl = worldTintOf(s.game);
    if (ctl) {
      for (const [depth, on] of [
        [SEA_DEPTH.lace + 50, false],
        [SEA_DEPTH.deck - 10, true],
      ] as const) {
        const e = s.add.extern();
        (e as unknown as { render: () => void }).render = () => {
          ctl.active = on;
        };
        this.keep(e.setDepth(depth));
      }
    }
    for (let i = 0; i < (this.reduced ? 36 : 120); i++) this.golds.push(this.keep(s.add.image(0, 0, T.goldStreak).setOrigin(0, 0.5).setDepth(SEA_DEPTH.glint + 2).setVisible(false))); // 시안처럼 금빛으로 덮어요 (더하기면 분홍 물 위에서 하얗게 바래요)
    this.sheen = this.keep(s.add.image(0, TIDE_HIGH_Y, T.sheen).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(SEA_DEPTH.shimmer + 10).setAlpha(0).setVisible(!this.reduced));
    this.shimmer = this.keep(s.add.tileSprite(0, SEA_DEEP_Y - 6, SEA_WIDTH, SEA_HEIGHT - SEA_DEEP_Y + 6, T.shimmer).setOrigin(0, 0).setDepth(SEA_DEPTH.shimmer).setAlpha(0.5));
  }

  /** 선착장·방파제 판 (물 위에 깔려요 — 위를 걸어요) */
  private addDecks(): void {
    const s = this.scene;
    const T = Art.SEA_TEX;
    this.keep(s.add.image(SEA_PIER.x, SEA_PIER.y, T.pier).setOrigin(0, 0).setDepth(SEA_DEPTH.deck));
    this.keep(s.add.image(SEA_PIER_END.x, SEA_PIER_END.y, T.pierEnd).setOrigin(0, 0).setDepth(SEA_DEPTH.deck + 1));
    this.keep(s.add.image(SEA_BREAKWATER.x, SEA_BREAKWATER.y, T.breakwater).setOrigin(0, 0).setDepth(SEA_DEPTH.deck));
    this.keep(s.add.image(SEA_BREAKWATER_TIP.x, SEA_BREAKWATER_TIP.y, T.tip).setOrigin(0, 0).setDepth(SEA_DEPTH.deck + 1));
  }

  private addTrees(): void {
    const T = Art.SEA_TEX;
    for (const t of Lay.SEA_TREES) this.prop(t.kind === "pine" ? T.pine(t.v) : t.kind === "palm" ? T.palm : T.bush(t.v), t.x, t.y);
  }

  private addStructures(): void {
    const T = Art.SEA_TEX;
    const s = this.scene;
    // 버스 정류장: 뒷벽은 벤치(pB, 정류장 − 8) 바로 뒤, 지붕·앞 기둥만 정류장 depth로 한 번 더 (앉은 사람 머리가 뒷벽에 가리지 않게 — 캠핑장과 같아요)
    this.prop(T.shelter, SEA_BUS_STOP.x, SEA_BUS_STOP.y, SEA_BUS_STOP.y - 9);
    for (const [cx, cy, cw, ch] of Art.SHELTER_FRONT) this.prop(T.shelter, SEA_BUS_STOP.x, SEA_BUS_STOP.y).setCrop(cx, cy, cw, ch);
    this.prop(T.busSign, SEA_BUS_SIGN.x, SEA_BUS_SIGN.y);
    this.prop(T.timetable, SEA_BUS_TIMETABLE.x, SEA_BUS_TIMETABLE.y);
    for (const f of SEA_FURNITURE) if (!SEA_EDGE_SEATS.includes(f.id)) this.prop(T.bench, f.x, f.y, f.y);
    // 11/16 쉴거리: 선베드(누운 사람이 위에 그려지게 받침보다 조금 뒤 depth) · 파라솔 돗자리(돗자리는 바닥, 갓은 앉은 사람 위) · 돗자리
    // 11/16 선베드 depth는 받침 − 4 (옆에 선 사람과 바르게 겹치게 — 누운 사람은 그보다 앞, SeaScene LOUNGER_LIE_FRONT)
    for (const l of SEA_SPOTS.loungers) this.prop(T.lounger, l.x, l.y, l.y - 4);
    // 11/16 파라솔은 선베드 한 벌 가운데. 기둥은 기둥 밑 y로 (앞에 선 사람이 기둥에 가리지 않게 — 사용자),
    // 갓은 그 아래에 선 사람 머리 위로 덮이게 기둥 밑보다 조금 앞 depth (갓 아래로 사람이 지나가는 건 기둥 뒤쪽뿐이에요)
    SEA_SPOTS.parasols.forEach((p, i) => {
      this.prop(T.parasol(i % 2), p.x, p.y, p.y).setCrop(0, Art.PARASOL_CANOPY_H, Art.PARASOL_W, Art.PARASOL_H - Art.PARASOL_CANOPY_H);
      this.prop(T.parasol(i % 2), p.x, p.y, p.y + 12).setCrop(0, 0, Art.PARASOL_W, Art.PARASOL_CANOPY_H);
    });
    SEA_MATS.forEach((m, i) => this.prop(T.mat(i % 3 === 1 ? 1 : i % 3 === 2 ? 2 : 0), m.x, m.y + 8, FLAT + m.y, 2));
    // 시장·부동산·매점 (현판 글씨는 판 크기에 맞춰 월드 크기 그대로)
    // 11/16 간판 글씨는 판 위에 뜨는 이름표로 (사용자: "간판 글씨가 안 읽혀요" — 늘 같은 화면 크기, 진한 판에 밝은 글씨)
    this.prop(T.market, SEA_MARKET.x, SEA_MARKET.y, SEA_MARKET.y, 3);
    this.plate(SEA_MARKET.x, SEA_MARKET.y - 95, "포구 시장"); // 현판(물고기 그림) 위에 선 작은 나무 간판
    this.prop(T.realty, SEA_REALTY.x, SEA_REALTY.y, SEA_REALTY.y, 3);
    this.plate(SEA_REALTY.x, SEA_REALTY.y - 55, "포구 부동산"); // 문 위 현판(작은 집 그림) 위
    this.prop(T.kiosk, SEA_KIOSK.x, SEA_KIOSK.y, SEA_KIOSK.y, 3);
    this.plate(SEA_KIOSK.x, SEA_KIOSK.y - 58, "매점");
    // 오두막 터 6: 뒤·옆 울타리는 터 뒤 depth, 앞 울타리는 터 앞 depth로 (터 안에 선 사람이 울타리 사이에 보이게)
    for (const l of SEA_LOTS) {
      const x = l.x - 2;
      const y = l.y - Art.LOT_RISE;
      const key = T.lot(l.n);
      const sz = Art.lotArtSize(l);
      this.cull(l.x + l.w / 2, l.y, s.add.image(x, y, key).setOrigin(0, 0).setDepth(l.y + 1).setCrop(0, 0, sz.w, sz.front));
      this.cull(l.x + l.w / 2, l.y + l.h, s.add.image(x, y, key).setOrigin(0, 0).setDepth(l.y + l.h).setCrop(0, sz.front, sz.w, sz.h - sz.front));
      const sg = seaLotSign(l);
      // 11/16 「분양 준비 중」은 땅에 꽂은 작은 민트 칠 판 하나로 (예전 팻말 그림 + 두꺼운 판은 뺐어요). 터 번호는 출입구 기둥 패에
      this.plate(sg.x, sg.y, "분양 준비 중", PLATE_MINT);
    }
    // 11/16 오두막 단지 우편함·등불 기둥 (골목 옆)
    this.prop(T.mailbox, SEA_LOT_MAILBOX.x, SEA_LOT_MAILBOX.y);
    for (const p of SEA_LOT_LANTERNS) {
      this.prop(T.lamp, p.x, p.y);
      this.lampGlows.push(this.cull(p.x, p.y, s.add.image(p.x, p.y - 32, T.lampGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1).setAlpha(0)));
    }
    // 등대 (끝 데크 뒤쪽)
    this.prop(T.lighthouse, SEA_LIGHTHOUSE.x, SEA_LIGHTHOUSE.y, SEA_LIGHTHOUSE.y, 3);
    // 가로등·생선 상자·그물 틀
    for (const p of Lay.SEA_LAMPS) {
      this.prop(T.lamp, p.x, p.y);
      this.lampGlows.push(this.cull(p.x, p.y, s.add.image(p.x, p.y - 32, T.lampGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1).setAlpha(0)));
    }
    for (const p of Lay.SEA_CRATES) this.prop(T.crates, p.x, p.y);
    this.prop(T.netRack, Lay.SEA_NET_RACK.x, Lay.SEA_NET_RACK.y);
  }

  /** 바닷가 쪽: 말뚝·테트라포드·바위·족욕 바위·배·부표 */
  private addShore(): void {
    const T = Art.SEA_TEX;
    const s = this.scene;
    for (const p of Lay.SEA_PIER_POSTS) this.prop(T.post, p.x, p.y);
    for (const t of Lay.SEA_TETRAPODS) this.prop(T.tetra(t.v), t.x, t.y);
    SEA_ROCKS.forEach((r, i) => {
      this.prop(T.rock(i), r.x, Math.round(r.y + r.ry * 0.7 + 2), r.y + r.ry * 0.5);
      // 11/16 갯바위에 물이 차면 밑동에 거품 고리 (물이 빠지면 투명)
      const foam = this.cull(r.x, r.y, s.add.image(r.x, Math.round(r.y + r.ry * 0.55), T.rockFoam(i)).setDepth(r.y + r.ry * 0.5 - 1).setAlpha(0));
      this.rockFoams.push({ img: foam, y: r.y + r.ry * 0.55, phase: i * 1.7 });
    });
    // 11/16 갯바위 낚시 발판 (데크처럼 물 위에 그려요)
    for (const r of SEA_FISHING_LEDGES) this.cull(r.x + r.w / 2, r.y, s.add.image(r.x + r.w / 2, r.y + r.h + 1, T.ledge).setOrigin(0.5, 1).setDepth(SEA_DEPTH.deck));
    // 11/16 게 (물이 빠졌을 때만 바위 둘레에 나와요)
    for (const c of Lay.SEA_CRABS) this.crabs.push({ img: this.cull(c.x, c.y, s.add.image(c.x, c.y + 1, T.crab).setOrigin(0.5, 1).setDepth(c.y).setAlpha(0)), x: c.x, y: c.y });
    this.prop(T.footbath, SEA_FOOTBATH.x, SEA_FOOTBATH.y + 8, SEA_FOOTBATH.y - 6, 0);
    // 배·부표는 매 프레임 흔들려서 컬링하지 않아요 (몇 개뿐)
    this.boat = this.keep(s.add.image(SEA_BOAT.x, SEA_BOAT.y + 6, T.boat).setOrigin(0.5, 1).setDepth(SEA_BOAT.y));
    SEA_BUOYS.forEach((b, i) => this.buoys.push({ img: this.keep(s.add.image(b.x, b.y, T.buoy).setOrigin(0.5, 1).setDepth(b.y)), x: b.x, y: b.y, phase: i * 1.9 }));
  }

  /** 11/16 간판 이름표 (판 아랫변 = y). 화면에서 늘 같은 크기라 멀리서도 읽혀요 */
  private plate(x: number, y: number, text: string, style = PLATE_WOOD): void {
    const p = new SignPlate(this.scene, this.atlas, x, y, text, style);
    this.keep(p.text);
    this.keep(p.bg);
    this.plates.push(p);
  }

  private addLabel(x: number, y: number, text: string, tint: number, alpha = 0.88, originY = 1): void {
    this.atlas.ensure(text);
    const t = this.keep(this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1));
    this.labels.push(t);
  }

  private addLabels(): void {
    for (const z of SEA_ZONES) {
      // 정류장은 노선 팻말 글씨, 시장·부동산은 현판 글씨로
      if (z.id === "busStop" || z.id === "market" || z.id === "realty") continue;
      const at = Lay.zoneLabelAt(z.name) ?? { x: z.x + z.w / 2, y: z.y + 10 };
      this.addLabel(at.x, at.y, z.name, z.id === "flat" || z.id === "pier" || z.id === "breakwater" ? 0xc8e4ec : 0xf0dcb0, 0.66);
    }
    // 11/16 정류장은 간판 없이 떠 있는 이름표만 (마을 정류장 이름표와 같은 모양)
    // 지붕 위 가운데는 화면 위 물때 시계와 겹쳐서 노선 팻말 위에 둬요
    this.addLabel(SEA_BUS_SIGN.x, SEA_BUS_SIGN.y - 54, "마을 버스 정류장", 0xc8f0d8, 1);
  }

  /** 물보라·반짝임 (작은 풀) · 등대 불빛 */
  private addPools(): void {
    const s = this.scene;
    const T = Art.SEA_TEX;
    const n = (full: number, low: number) => (this.reduced ? low : full);
    for (let i = 0; i < n(24, 6); i++) this.sprays.push({ img: this.keep(s.add.image(0, 0, T.spray).setOrigin(0.5, 1).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vy: 0, vx: 0, s: 1 });
    for (let i = 0; i < n(10, 4); i++) this.glints.push({ img: this.keep(s.add.image(0, 0, T.sparkle).setDepth(SEA_DEPTH.glint).setVisible(false)), x: 0, y: 0, t0: -1, life: 0 });
    // 11/16 물 위 반짝이는 별 (ADD — 낮 햇빛, 밤 달빛) · 밤 물가 물빛 점
    for (let i = 0; i < n(STARS, STARS_REDUCED); i++)
      this.stars.push({ img: this.keep(s.add.image(0, 0, T.star).setBlendMode(Phaser.BlendModes.ADD).setDepth(SEA_DEPTH.glint + 1).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, s: 1 });
    for (let i = 0; i < n(GLOWS, 4); i++)
      this.glows.push({ img: this.keep(s.add.image(0, 0, T.glowDot).setBlendMode(Phaser.BlendModes.ADD).setDepth(SEA_DEPTH.glint).setTint(0x7ff4ea).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, drift: 0 });
    this.beacon = this.keep(s.add.image(Lay.SEA_LIGHTHOUSE_LAMP.x, Lay.SEA_LIGHTHOUSE_LAMP.y, T.beaconGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 2).setScale(2.4).setAlpha(0));
  }

  // ── 갈매기 ──

  private addGulls(): void {
    const s = this.scene;
    // 앉는 자리: 선착장 말뚝·방파제 위 (protocol SEA_GULL_PERCHES) + 갯바위 꼭대기 둘
    for (const p of SEA_GULL_PERCHES) {
      const onPost = Lay.SEA_PIER_POSTS.some((q) => Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2);
      this.perches.push({ x: p.x, y: p.y, lift: onPost ? 11 : 0 });
    }
    for (const r of SEA_ROCKS.slice(0, 2)) this.perches.push({ x: r.x - 4, y: r.y, lift: r.ry + 8 });
    for (let i = 0; i < this.perches.length; i++) this.perchTaken.push(null);
    for (let i = 0; i < GULLS; i++) {
      const img = this.keep(s.add.image(0, 0, Art.SEA_TEX.gull, 1).setOrigin(0.5, 1).setDepth(OVERHEAD));
      const g: Gull = { img, mode: "circle", x: 0, y: 0, cx: 0, cy: 0, rad: 60, ang: 0, spd: 0.001, fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, dur: 1, perch: -1, until: 0, phase: Math.random() * 4000 };
      this.gulls.push(g);
      // 처음엔 반쯤은 앉아 있어요
      if (i % 2 === 0 && this.freePerch(i) >= 0) {
        const pi = this.freePerch(i);
        this.sitGull(g, pi, 0, i);
      } else this.newCircle(g, 0, true);
    }
  }

  private freePerch(seed: number, preferBreakwater = false): number {
    const n = this.perches.length;
    for (let k = 0; k < n; k++) {
      const i = (seed * 3 + k) % n;
      if (this.perchTaken[i] !== null) continue;
      if (preferBreakwater && this.perches[i].x < SEA_BREAKWATER.x - 20 && k < n - 1) continue;
      return i;
    }
    return -1;
  }

  private sitGull(g: Gull, pi: number, now: number, who: number): void {
    const p = this.perches[pi];
    g.mode = "perch";
    g.perch = pi;
    this.perchTaken[pi] = who;
    g.x = p.x;
    g.y = p.y - p.lift;
    g.until = now + 10_000 + Math.random() * 16_000;
    g.img.setFrame(3).setPosition(Math.round(g.x), Math.round(g.y)).setDepth(p.y + 1).setFlipX(Math.random() < 0.5);
  }

  private newCircle(g: Gull, now: number, place = false): void {
    g.mode = "circle";
    g.cx = 220 + Math.random() * 880;
    g.cy = SEA_FLAT_Y0 + 80 + Math.random() * 260;
    g.rad = 40 + Math.random() * 70;
    g.spd = (0.0006 + Math.random() * 0.0006) * (Math.random() < 0.5 ? -1 : 1);
    g.ang = Math.random() * Math.PI * 2;
    g.until = now + 8_000 + Math.random() * 14_000;
    if (place) {
      g.x = g.cx + Math.cos(g.ang) * g.rad;
      g.y = g.cy + Math.sin(g.ang) * g.rad * 0.55 - 30;
    }
    g.img.setDepth(OVERHEAD);
  }

  /** 지금 자리에서 (tx,ty)로 날아가요 */
  private flyTo(g: Gull, mode: "land" | "flee", tx: number, ty: number, now: number, speed: number): void {
    g.mode = mode;
    g.fx = g.x;
    g.fy = g.y;
    g.tx = tx;
    g.ty = ty;
    g.t0 = now;
    g.dur = Math.max(400, Math.hypot(tx - g.x, ty - g.y) / speed);
    g.img.setDepth(OVERHEAD);
  }

  private updateGulls(time: number, delta: number, t: SeaTime): void {
    const night = t.darkness > 0.72;
    const wetDay = t.rain > 0.3;
    this.gulls.forEach((g, i) => {
      switch (g.mode) {
        case "perch": {
          const p = this.perches[g.perch];
          const scared = t.actors.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < GULL_SCARE);
          if (scared || (time > g.until && !night)) {
            this.perchTaken[g.perch] = null;
            g.perch = -1;
            g.img.setFrame(5);
            // 11/16 날아오를 때 가끔 울어요 (SeaScene이 거리로 크기를 정해요)
            if (Math.random() < (scared ? 0.7 : 0.35)) this.onGullCall?.(g.x, g.y, scared);
            const away = scared ? 1 : 0.6;
            this.newCircle(g, time);
            const ax = g.cx + Math.cos(g.ang) * g.rad;
            const ay = g.cy + Math.sin(g.ang) * g.rad * 0.55 - 30;
            this.flyTo(g, "flee", ax, ay, time, scared ? 0.16 * away + 0.04 : 0.08);
            return;
          }
          // 가끔 고개를 돌려요
          if (!this.reduced) g.img.setFrame(Math.floor((time + g.phase) / 1700) % 5 === 0 ? 4 : 3);
          return;
        }
        case "circle": {
          g.ang += g.spd * delta;
          g.x = g.cx + Math.cos(g.ang) * g.rad;
          g.y = g.cy + Math.sin(g.ang) * g.rad * 0.55 - 30;
          // 밤·비 오는 날엔 앉을 데를 찾아요 (비 오면 방파제로)
          if (time > g.until || night || wetDay) {
            const pi = this.freePerch(i + Math.floor(time / 1000), wetDay);
            if (pi >= 0 && !t.actors.some((a) => Math.hypot(a.x - this.perches[pi].x, a.y - this.perches[pi].y) < GULL_SCARE * 1.5)) {
              this.perchTaken[pi] = i;
              g.perch = pi;
              const p = this.perches[pi];
              this.flyTo(g, "land", p.x, p.y - p.lift, time, 0.07);
            } else g.until = time + 4000;
          }
          this.flap(g, time, Math.cos(g.ang) * g.spd < 0, 0.35);
          return;
        }
        case "land":
        case "flee": {
          const k = Math.min(1, (time - g.t0) / g.dur);
          const e = k * k * (3 - 2 * k);
          // 내려앉을 땐 살짝 위로 휘어 와요
          const arc = Math.sin(k * Math.PI) * (g.mode === "land" ? 18 : 10);
          g.x = g.fx + (g.tx - g.fx) * e;
          g.y = g.fy + (g.ty - g.fy) * e - arc;
          this.flap(g, time, g.tx < g.fx, g.mode === "flee" ? 1 : 0.7);
          if (k >= 1) {
            if (g.mode === "land" && g.perch >= 0) this.sitGull(g, g.perch, time, i);
            else g.mode = "circle";
          }
          return;
        }
      }
    });
    for (const g of this.gulls) if (g.mode !== "perch") g.img.setPosition(Math.round(g.x), Math.round(g.y));
  }

  /** 날갯짓 (가끔 미끄러지듯 활공) */
  private flap(g: Gull, time: number, left: boolean, beat: number): void {
    const cyc = (time + g.phase) % 4000;
    const flapping = cyc < 4000 * beat;
    const f = flapping && !this.reduced ? [0, 1, 2, 1][Math.floor((time + g.phase) / 110) % 4] : 1;
    g.img.setFrame(f).setFlipX(left);
  }

  // ── SeaMapApi ──

  standable(x: number, y: number): boolean {
    return Lay.seaStandable(x, y);
  }

  /** 1차엔 자리 따라 바뀌는 그림이 없어요 (다음 차수 쉴거리 — 선베드·해먹 — 가 여기에 붙어요) */
  setSeatTaken(seatId: string, taken: boolean): void {
    void seatId;
    void taken;
  }

  update(time: number, delta: number, view: Phaser.Geom.Rectangle, t: SeaTime): void {
    if (this.destroyed || !this.water) return;
    this.updateCulling(view);
    this.updateLabels();
    this.updateTide(time, delta, t);
    this.updateBoats(time);
    this.updateSpray(time, view);
    this.updateRocks(time);
    this.updateGlints(time, view, t);
    this.updateLights(time, t);
    if (this.gulls.length) this.updateGulls(time, Math.min(delta, 100), t);
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
  }

  private makeChunk(cx: number, cy: number): void {
    const key = Art.SEA_TEX.ground(cx, cy);
    if (!this.scene.textures.exists(key)) {
      const { canvas, ctx } = makeCanvas(CHUNK, CHUNK);
      ctx.putImageData(new ImageData(Art.seaGroundPixels(cx, cy) as unknown as Uint8ClampedArray<ArrayBuffer>, CHUNK, CHUNK), 0, 0);
      addCanvasTexture(this.scene, key, { canvas });
      clampEdges(this.scene, key);
    }
    this.chunks.set(cy * CHUNK_COLS + cx, this.keep(this.scene.add.image(cx * CHUNK, cy * CHUNK, key).setOrigin(0, 0).setDepth(DEPTH.ground)));
  }

  /** 글씨는 화면에서 늘 같은 크기 (1/zoom) */
  private updateLabels(): void {
    const s = 1 / (this.scene.cameras.main.zoom || 1);
    if (Math.abs(s - this.labelScale) < 1e-4) return;
    this.labelScale = s;
    for (const l of this.labels) l.setScale(s);
    for (const p of this.plates) p.setScale(s);
  }

  /**
   * 물때: 물 높이는 부드럽게 따라가고(시험용으로 물때를 확 밀어도 2초쯤 걸려 옮겨요), 그 위로 파도가 밀려왔다 빠져요.
   * 11/16 파도는 하나마다 길이·높이가 다르고 가끔 큰 파도가 몰려와요(seaWaves). 물가 조각(32px)마다 닿는 때·폭이 달라 한 줄로 오지 않아요.
   * 막 드러난 갯벌은 젖은 띠로 남았다가 천천히 말라요 (물이 빠지는 동안 띠가 넓어지고, 들어올 땐 물가 바로 위만)
   */
  private updateTide(time: number, delta: number, t: SeaTime): void {
    const dt = this.lastTime < 0 ? 0 : Math.min(1000, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    if (Number.isNaN(this.level)) this.level = t.tide;
    else this.level += (t.tide - this.level) * Math.min(1, delta / 600);
    const lineY = tideLineY(this.level);
    // 밤엔 물빛을 깊은 남색 쪽으로, 거품은 달빛 도는 흰색 (전체 어둠은 Atmosphere가 덮어요)
    const night = Math.min(1, t.darkness);
    // 물은 땅 색조 곱하기에서 빠져 있어요 → 같은 색조(저녁 주황은 빼고)를 직접 곱하고, 밤엔 깊은 남색으로 조금 더
    const world = this.tintNow(t.dusk);
    const waterTint = mulColor(world, mix(0xffffff, 0x8c9ce0, night * 0.6));
    const foamTint = mulColor(world, mix(0xffffff, 0xd4dcff, night * 0.5));
    const duskOn = t.dusk > 0.01 && !this.reduced ? t.dusk : t.dusk > 0.5 ? 1 : 0;
    const scrollX = this.reduced ? 0 : time * 0.003;
    const foamScroll = this.reduced ? 0 : time * 0.006;
    let minEdge = Infinity;
    let sumBody = 0;
    const P = this.pSurge;
    for (let i = 0; i < RN; i++) {
      const x = i * RSTEP;
      P[i] = this.reduced ? 3 : this.waves.surgeAt(time - shoreDelay(x, time)) * shoreReach(x, time);
    }
    for (let j = 0; j < SEGS; j++) this.segSurge[j] = P[Math.min(RN - 1, Math.round((j * SEG_W + SEG_W / 2) / RSTEP))];
    const water = this.waterR!;
    const foam = this.foamR!;
    const lace = this.laceR!;
    const sheen = this.sheenR!;
    const WV = water.vertices;
    const WU = water.uv;
    const FV = foam.vertices;
    const FU = foam.uv;
    const LV = lace.vertices;
    const LU = lace.uv;
    const LA = lace.alphas;
    const SV = sheen.vertices;
    const SU = sheen.uv;
    const SA = sheen.alphas;
    const bodyBot = SEA_HEIGHT + 8;
    const TW = Art.WATER_TILE_W;
    const TH = Art.WATER_TILE_H;
    const laceA = 1 - night * 0.4;
    const sheenA = 1 - night * 0.5;
    let anyGap = false;
    for (let i = 0; i < RN; i++) {
      const x = i * RSTEP;
      const surge = P[i];
      const edge = lineY - surge;
      if (edge < minEdge) minEdge = edge;
      const foamY = Math.round(edge - Art.FOAM_TOP);
      this.pFoam[i] = foamY;
      // 물 몸통은 거품 띠의 얕은 물 아래에서 시작해요 (거품 띠 아래쪽은 디더로 투명해지며 몸통과 섞여요)
      const bodyY = foamY + 14;
      sumBody += bodyY;
      const k = i * 4;
      // 물 몸통: 무늬 줄은 물가 선(물때)에 맞춰요 — 파도로 오르내려도 띠 무늬는 제자리
      WV[k] = x;
      WV[k + 1] = bodyY;
      WV[k + 2] = x;
      WV[k + 3] = bodyBot;
      WU[k] = WU[k + 2] = (x + scrollX) / TW;
      WU[k + 1] = (bodyY - lineY + Art.WATER_ROW0) / TH;
      WU[k + 3] = (bodyBot - lineY + Art.WATER_ROW0) / TH;
      // 거품: 밀려올 때 무늬가 조금 옆으로 밀려요 (곳마다 다르게, 곡선이라 끊기지 않아요)
      FV[k] = x;
      FV[k + 1] = foamY;
      FV[k + 2] = x;
      FV[k + 3] = foamY + Art.FOAM_H;
      FU[k] = FU[k + 2] = (x + foamScroll + surge * 2.2) / Art.FOAM_W;
      FU[k + 1] = 0;
      FU[k + 3] = Art.FOAM_H / Art.FOAM_TEX_H;
      // 파도가 닿은 가장 높은 곳: 밀려오면 바로 따라 오르고, 빠질 땐 천천히 (그 사이 젖은 윤기·거품 자국)
      let top = this.reachTop[i];
      if (Number.isNaN(top) || edge < top) top = edge;
      else top = Math.min(edge, top + dt * 0.006);
      // 11/16 물때를 한 번에 바꾸거나 썰물이 빠를 때 젖은 띠가 갯벌 전체를 덮지 않게 (최대 48px)
      if (edge - top > 48) top = edge - 48;
      this.reachTop[i] = top;
      const gap = this.reduced ? 0 : edge - top;
      if (gap > 2) anyGap = true;
      const ty = Math.round(top);
      SV[k] = x;
      SV[k + 1] = ty;
      SV[k + 2] = x;
      SV[k + 3] = ty + 54;
      SU[k] = SU[k + 2] = x / Art.SHEEN_WET_TILE;
      SU[k + 1] = ty / Art.SHEEN_WET_TILE;
      SU[k + 3] = (ty + 54) / Art.SHEEN_WET_TILE;
      SA[i * 2] = SA[i * 2 + 1] = gap > 2 ? Math.min(1, gap / 14) * sheenA : 0;
      LV[k] = x;
      LV[k + 1] = ty - 2;
      LV[k + 2] = x;
      LV[k + 3] = ty + 4;
      LU[k] = LU[k + 2] = (x + 53) / Art.FOAM_W;
      LU[k + 1] = 0;
      LU[k + 3] = 6 / Art.LACE_TEX_H;
      LA[i * 2] = LA[i * 2 + 1] = gap > 2 ? Math.min(0.9, gap / 10) * laceA : 0;
    }
    for (const r of this.strips) r.dirty = false;
    water.colors.fill(waterTint);
    foam.colors.fill(foamTint);
    lace.colors.fill(duskOn > 0 ? mix(0xffffff, 0xffe1dc, duskOn) : 0xffffff);
    sheen.setVisible(anyGap);
    lace.setVisible(anyGap);
    const dw = this.duskWaterR!;
    const df = this.duskFoamR!;
    if (duskOn > 0) {
      dw.setVisible(true).setAlpha(duskOn);
      df.setVisible(true).setAlpha(duskOn);
      dw.vertices.set(WV);
      dw.uv.set(WU);
      df.vertices.set(FV);
      df.uv.set(FU);
      dw.dirty = df.dirty = false;
    } else if (dw.visible) {
      dw.setVisible(false);
      df.setVisible(false);
    }
    const edgeY = minEdge;
    const minTop = lineY - SURGE_PX - 10;
    if (Number.isNaN(this.wetTop)) this.wetTop = minTop - (t.trend < 0 ? 30 : 0);
    this.wetTop = Math.max(lineY - WET_MAX, Math.min(minTop, this.wetTop + dt * DRY_PX_PER_MS));
    const st = this.waterState;
    st.level = this.level;
    st.lineY = lineY;
    st.edgeY = edgeY;
    st.wetTop = this.wetTop;

    const wetH = Math.max(1, edgeY + 6 - this.wetTop);
    this.wet!.setY(Math.round(this.wetTop)).setDisplaySize(SEA_WIDTH, wetH);
    this.shimmer!.tilePositionX = this.reduced ? 0 : (time * 0.006) % 128;
    this.shimmer!.tilePositionY = this.reduced ? 0 : Math.sin(time / 2600) * 3;
    this.shimmer!.setAlpha(Math.max(0.1, (0.6 - 0.25 * night) * (1 - t.rain * 0.5) * (1 - t.fog * 0.4)));
    const meanBody = sumBody / RN;
    // 지나가는 빛 띠: 14초마다 물 위를 가로질러요 (밤엔 달빛처럼 옅게)
    if (this.sheen!.visible) {
      const k = ((time / 14_000) % 1 + 1) % 1;
      const top = Math.round(meanBody);
      this.sheen!.setPosition(-200 + k * (SEA_WIDTH + 400), top)
        .setDisplaySize(240, Math.max(1, SEA_HEIGHT - top))
        .setAlpha((0.16 - 0.08 * night) * (1 - t.rain * 0.6) * (1 - t.fog * 0.5))
        .setTint(night > 0.5 ? 0xc8d8ff : 0xfffcf0);
    }
  }

  /** 낚싯배·부표: 물결 따라 흔들리고, 물이 차면 조금 떠올라요 */
  private updateBoats(time: number): void {
    const amp = this.reduced ? 0.4 : 1;
    const rise = (this.level - 0.5) * 3;
    if (this.boat) {
      this.boat.setY(Math.round(SEA_BOAT.y + 6 + Math.sin(time / 1100) * 1.4 * amp - rise));
      this.boat.setRotation(Math.sin(time / 1700) * 0.025 * amp);
    }
    for (const b of this.buoys) {
      b.img.setY(Math.round(b.y + Math.sin(time / 800 + b.phase) * 1.6 * amp - rise));
      b.img.setRotation(Math.sin(time / 650 + b.phase) * 0.12 * amp);
    }
  }

  /**
   * 물보라 (화면 근처만). 11/16 사용자 "규칙적이라 싫다" → 정해진 박자 없이:
   *  - 방파제·갯바위: 포아송 과정으로 들쭉날쭉 (느린 잡음이 "기분"을 바꿔 한동안 잠잠하다가 몰아치기도 해요), 한 번에 1~여러 개
   *  - 큰 파도가 꼭대기에 오를 때: 방파제에 크게 튀고, 물가에서 가장 높이 올라온 곳 몇 군데에도 부서지는 물보라
   *  - 알갱이마다 높이·옆으로 튀는 쪽·크기가 달라요
   */
  private updateSpray(time: number, view: Phaser.Geom.Rectangle): void {
    const st = this.waterState;
    if (this.nextSprayAt === 0) this.nextSprayAt = time + 400 + Math.random() * 2000;
    const mood = noise1(time / 9000, 41);
    const rate = this.reduced ? 0.12 : mood < 0.3 ? 0 : (mood - 0.3) * 2.2; // 1초에 몇 번
    if (time >= this.nextSprayAt) {
      // 다음 기회까지 지수 분포 (평균 1/rate초, 잠잠할 땐 다시 보러 와요)
      this.nextSprayAt = time + (rate > 0.01 ? (-Math.log(1 - Math.random()) / rate) * 1000 : 1500 + Math.random() * 2500);
      if (rate > 0.01) {
        const n = 1 + Math.floor(-Math.log(1 - Math.random()) * (this.reduced ? 0.3 : 1.6));
        const at = this.sprayPoint(st.edgeY);
        if (at) for (let k = 0; k < n; k++) this.spawnSpray(time + k * (40 + Math.random() * 90), at.x + (Math.random() - 0.5) * 14, at.y + (Math.random() - 0.5) * 6, 5 + Math.random() * 14, view);
      }
    }
    // 11/16 만조에 드문 큰 파도가 앞줄 선베드 발치까지 오면 발치에 작은 물보라 (선베드마다 2초에 한 번까지)
    if (!this.reduced)
      for (const l of this.frontLoungers) {
        const i = Math.max(0, Math.min(RN - 1, Math.round(l.x / RSTEP)));
        const edge = st.lineY - this.pSurge[i];
        if (edge > l.y + 2 || time < l.at) continue;
        l.at = time + 2000;
        for (let k = 0; k < 3; k++) this.spawnSpray(time + k * 90, l.x + (Math.random() - 0.5) * 18, l.y + 2, 4 + Math.random() * 8, view);
      }
    const big = this.waves.bigPeak(time, this.lastBig);
    if (big) {
      this.lastBig = big.id;
      const burst = this.reduced ? 2 : 4 + Math.floor(Math.random() * 8);
      for (let k = 0; k < burst; k++) {
        const at = this.sprayPoint(st.edgeY);
        if (at) this.spawnSpray(time + Math.random() * 500, at.x, at.y, 12 + Math.random() * 18, view);
      }
      // 물가에서 가장 높이 올라온 조각 몇 군데 (부서지는 파도)
      if (!this.reduced) {
        const order = this.segSurge.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
        const m = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < m && k < order.length; k++) {
          const i = order[Math.floor(Math.random() * Math.min(8, order.length))][1];
          const x = i * SEG_W + Math.random() * SEG_W;
          this.spawnSpray(time + 200 + Math.random() * 600, x, st.lineY - this.segSurge[i] + 6, 6 + Math.random() * 10, view);
        }
      }
    }
    for (const s of this.sprays) {
      if (s.t0 < 0) continue;
      const k = (time - s.t0) / s.life;
      if (k < 0) {
        s.img.setVisible(false);
        continue;
      }
      if (k >= 1) {
        s.t0 = -1;
        s.img.setVisible(false);
        continue;
      }
      s.img
        .setVisible(true)
        .setPosition(Math.round(s.x + s.vx * k), Math.round(s.y - Math.sin(k * Math.PI * 0.8) * s.vy))
        .setAlpha(1 - k * k)
        .setScale(s.s * (0.7 + k * 0.6));
    }
  }

  /** 물보라 알갱이 하나 (풀에 빈 것이 있고 화면 근처일 때만) */
  private spawnSpray(t0: number, x: number, y: number, vy: number, view: Phaser.Geom.Rectangle): void {
    if (x < view.x - 40 || x > view.right + 40 || y < view.y - 40 || y > view.bottom + 60) return;
    const free = this.sprays.find((s) => s.t0 < 0);
    if (!free) return;
    free.t0 = t0;
    free.life = 420 + Math.random() * 600;
    free.x = x;
    free.y = y;
    free.vy = vy;
    free.vx = (Math.random() - 0.5) * 16;
    free.s = 0.6 + Math.random() * 0.9;
    free.img.setPosition(x, y).setDepth(y + 14).setVisible(false).setFlipX(Math.random() < 0.5);
  }

  /** 물보라가 이는 자리 하나 (없으면 null): 방파제 양옆(물에 잠긴 곳)·끝 데크 앞·물에 닿은 갯바위 */
  /** 11/16 갯바위 거품 고리 (물에 잠긴 바위만, 물결 따라 숨 쉬듯) · 게는 물이 빠진 동안만 */
  private updateRocks(time: number): void {
    const edgeY = this.waterState.edgeY;
    for (const f of this.rockFoams) {
      const wet = edgeY < f.y;
      f.img.setAlpha(wet ? 0.55 + 0.35 * Math.sin(time / 700 + f.phase) : 0);
    }
    for (const c of this.crabs) {
      const dry = edgeY > c.y + 20;
      c.img.setAlpha(dry ? 1 : 0);
      // 옆걸음 조금
      if (dry) c.img.x = Math.round(c.x + Math.sin(time / 1600 + c.x) * 6);
    }
  }

  private sprayPoint(edgeY: number): { x: number; y: number } | null {
    const B = SEA_BREAKWATER;
    const T = SEA_BREAKWATER_TIP;
    const r = Math.random();
    // 11/16 갯바위가 잠겨 있으면 물보라 반은 바위에서
    if (r < 0.5) {
      const k = this.wetRockSpray(edgeY);
      if (k) return k;
    }
    if (r < 0.78) {
      const y0 = Math.max(edgeY + 4, SEA_FLAT_Y0 + 14);
      const y1 = T.y + T.h;
      if (y1 <= y0) return null;
      const right = Math.random() < 0.5;
      return { x: right ? B.x + B.w + 12 + Math.random() * 6 : B.x - 12 - Math.random() * 6, y: y0 + Math.random() * (y1 - y0) };
    }
    return { x: T.x + Math.random() * T.w, y: T.y + T.h + 4 };
  }
  private wetRockSpray(edgeY: number): { x: number; y: number } | null {
    const wetRocks = SEA_ROCKS.filter((k) => edgeY < k.y + k.ry);
    if (!wetRocks.length) return null;
    const k = wetRocks[Math.floor(Math.random() * wetRocks.length)];
    return { x: k.x + (Math.random() - 0.5) * k.rx * 1.6, y: Math.max(k.y - k.ry * 0.2, edgeY + 2) + k.ry * 0.6 };
  }

  /** 반짝임: 낮엔 물 위 햇빛, 간조엔 드러난 물웅덩이도 (화면 안만) */
  private updateGlints(time: number, view: Phaser.Geom.Rectangle, t: SeaTime): void {
    const want = (1 - t.darkness * 0.85) * (1 - t.rain * 0.7) * (1 - t.fog * 0.6);
    const edgeY = this.waterState.edgeY;
    for (const g of this.glints) {
      if (g.t0 < 0 || time - g.t0 > g.life) {
        if (g.t0 >= 0) g.img.setVisible(false);
        g.t0 = -1;
        if (Math.random() > want * 0.06) continue;
        let x = view.x + Math.random() * view.width;
        let y = Math.max(edgeY + 14, view.y) + Math.random() * Math.max(0, view.bottom - Math.max(edgeY + 14, view.y));
        // 드러난 물웅덩이
        const dry = SEA_TIDE_POOLS.filter((p) => p.y + p.ry < edgeY - 4);
        if (dry.length && Math.random() < 0.35) {
          const p = dry[Math.floor(Math.random() * dry.length)];
          x = p.x + (Math.random() - 0.5) * p.rx * 1.4;
          y = p.y + (Math.random() - 0.5) * p.ry;
        }
        if (y > SEA_HEIGHT || y < view.y || y > view.bottom) continue;
        g.t0 = time;
        g.life = 450 + Math.random() * 650;
        g.img.setPosition(Math.round(x), Math.round(y)).setVisible(true);
      }
      const k = (time - g.t0) / g.life;
      g.img.setAlpha(Math.sin(k * Math.PI) * (0.4 + 0.6 * want));
    }
    this.updateStars(time, view, t);
    this.updateGlows(time, view, t);
    this.updateGold(time, view, t);
  }

  /** 지금 땅에 곱하는 색조 (저녁 주황은 빼고 — 물은 노을 그림이 맡아요) */
  private tintNow(dusk: number): number {
    const ctl = worldTintOf(this.scene.game);
    if (!ctl) return 0xffffff;
    // 저녁엔 땅 색조가 주황 햇빛이라 물에는 그만큼 흰색 쪽으로
    return mix(ctl.world, 0xffffff, Math.min(1, dusk));
  }

  /**
   * 11/16 저녁 금빛 물결 길 (시안): 화면 가운데 조금 왼쪽(선착장 판에 덜 가리게), 물가에서 아래로 갈수록 넓게 흔들리는 짧은 금빛 가로 줄 (세기 0.75).
   * 줄마다 길이·흔들림이 달라 반짝여요. 저녁에만, 물 위에만
   */
  private updateGold(time: number, view: Phaser.Geom.Rectangle, t: SeaTime): void {
    const on = t.dusk * (1 - t.rain * 0.7) * (1 - t.fog * 0.6);
    if (on <= 0.02) {
      if (this.golds.length && this.golds[0].visible) for (const g of this.golds) g.setVisible(false);
      return;
    }
    const top = Math.max(this.waterState.edgeY + 16, view.y);
    const cx = view.x + view.width * 0.42;
    const ts = this.reduced ? 0 : time / 1000;
    let k = 0;
    for (let y = Math.ceil(top / 6) * 6; y < Math.min(SEA_HEIGHT, view.bottom) && k < this.golds.length; y += 6) {
      const spread = 16 + (y - top) * 0.35;
      for (let j = 0; j < 3 && k < this.golds.length; j++, k++) {
        const x = cx + Math.sin(y * 0.175 + ts * 2 + j * 2.1) * spread;
        const len = 10 + ((y / 6 + j) % 4) * 4;
        const shimmer = this.reduced ? 1 : 0.65 + 0.35 * Math.sin(ts * 5 + y * 0.31 + j);
        this.golds[k].setVisible(true).setPosition(Math.round(x), y).setDisplaySize(len, 2).setAlpha(Math.min(1, 0.95 * on * shimmer));
      }
    }
    for (; k < this.golds.length; k++) if (this.golds[k].visible) this.golds[k].setVisible(false);
  }

  /**
   * 11/16 물 위 반짝이는 별 (사용자: "바다가 빛나고 반짝였으면"): 화면 안 물 위 아무 데나 생겨 커졌다 작아지며 사라져요.
   * 낮엔 햇빛(따뜻한 흰색, 많이), 밤엔 달빛(푸른 흰색, 적게). 비·안개엔 줄어요. 움직임 줄이기면 적게·천천히
   */
  private updateStars(time: number, view: Phaser.Geom.Rectangle, t: SeaTime): void {
    const night = Math.min(1, t.darkness);
    const want = (1 - night * 0.55) * (1 - t.rain * 0.8) * (1 - t.fog * 0.6);
    const top = Math.max(this.waterState.edgeY + 12, view.y);
    const bottom = Math.min(SEA_HEIGHT, view.bottom);
    const tint = night > 0.5 ? 0xd8e4ff : 0xfffcec;
    for (const g of this.stars) {
      if (g.t0 < 0 || time - g.t0 > g.life) {
        if (g.t0 >= 0) g.img.setVisible(false);
        g.t0 = -1;
        if (bottom <= top || Math.random() > want * (this.reduced ? 0.02 : 0.08)) continue;
        g.x = Math.round(view.x + Math.random() * view.width);
        g.y = Math.round(top + Math.random() * (bottom - top));
        // 11/16 유령선 자리는 비워 둬요 (다음 차수에 배가 들어와요)
        const C = SEA_GHOST_BERTH.clear;
        if (g.x >= C.x && g.x <= C.x + C.w && g.y >= C.y && g.y <= C.y + C.h) continue;
        g.t0 = time;
        g.life = (this.reduced ? 1400 : 600) + Math.random() * 900;
        g.s = 0.6 + Math.random() * 0.7;
        g.img.setPosition(g.x, g.y).setTint(tint).setVisible(true);
      }
      const k = (time - g.t0) / g.life;
      const tw = Math.sin(k * Math.PI);
      g.img.setAlpha(tw * (0.55 + 0.45 * want)).setScale(g.s * (0.4 + 0.8 * tw));
    }
  }

  /** 11/16 밤 물가 물빛: 어두워지면 물가 가까이 청록 빛 점이 천천히 떠올랐다 사라져요 */
  private updateGlows(time: number, view: Phaser.Geom.Rectangle, t: SeaTime): void {
    const on = Math.max(0, Math.min(1, (t.darkness - 0.45) / 0.35)) * (1 - t.rain * 0.5);
    const edge = this.waterState.edgeY;
    for (const g of this.glows) {
      if (g.t0 < 0 || time - g.t0 > g.life) {
        if (g.t0 >= 0) g.img.setVisible(false);
        g.t0 = -1;
        if (on <= 0.01 || Math.random() > on * 0.05) continue;
        g.x = Math.round(view.x + Math.random() * view.width);
        g.y = Math.round(edge + 8 + Math.random() * 36);
        if (g.y < view.y || g.y > view.bottom) continue;
        g.t0 = time;
        g.life = 1800 + Math.random() * 2200;
        g.drift = (Math.random() - 0.5) * 6;
        g.img.setPosition(g.x, g.y).setVisible(true);
      }
      const k = (time - g.t0) / g.life;
      g.img.setAlpha(Math.sin(k * Math.PI) * 0.75 * on).setPosition(g.x + (this.reduced ? 0 : g.drift * k), g.y);
    }
  }

  /** 가로등·등대 불빛 (어두워지면, 안개 낀 날엔 낮에도 등대가 켜져요) */
  private updateLights(time: number, t: SeaTime): void {
    const on = Math.max(0, Math.min(1, (t.darkness - 0.18) / 0.4));
    if (Math.abs(on - this.lit) > 0.02) {
      this.lit = on;
      for (const g of this.lampGlows) g.setAlpha(on * 0.85);
    }
    const beacon = Math.max(on, Math.min(1, t.fog * 1.2) * 0.8);
    this.beacon?.setAlpha(beacon <= 0.01 ? 0 : beacon * (0.82 + (this.reduced ? 0 : 0.18 * Math.sin(time / 520))));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.cells.clear();
    this.chunks.clear();
    this.labels.length = 0;
    this.gulls.length = 0;
    this.sprays.length = 0;
    this.glints.length = 0;
    this.stars.length = 0;
    this.glows.length = 0;
    this.plates.length = 0;
    this.strips.length = 0;
    this.waterR = this.foamR = this.duskWaterR = this.duskFoamR = this.laceR = this.sheenR = null;
    this.reachTop.fill(Number.NaN);
    this.buoys.length = 0;
    this.lampGlows.length = 0;
    this.rockFoams.length = 0;
    this.crabs.length = 0;
    this.water = this.foam = this.lace = this.shimmer = null;
    this.wet = this.boat = this.beacon = this.depthShade = this.sheen = null;

    this.golds.length = 0;
    for (const g of [this.colliders, this.furnitureColliders]) if (g.children) g.clear(true, true);
    // 그림(sea- 텍스처)은 지우지 않아요. 다시 올 때 굽지 않게 남겨 둬요
  }
}

/** 바닥 덩어리는 이어 붙이는 그림이라 반복할 일이 없어요 → CLAMP_TO_EDGE (캠핑장과 같아요) */
export function clampEdges(scene: Phaser.Scene, key: string): void {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  const src = scene.textures.get(key).source[0];
  if (src?.glTexture && src.image instanceof HTMLCanvasElement) r.canvasToTexture(src.image, src.glTexture, true, src.flipY);
}

/** 바닷가 그림 굽는 목록 (SeaMap이 장면을 만들 때, 또는 버스 창밖 연출 동안 seaPrebake가 조금씩) */
export type SeaTexBuild = () => Art.ArtOut | ReturnType<typeof Art.marketArt>;
export function forEachSeaTexture(tex: (key: string, build: SeaTexBuild, linear?: boolean) => void): void {
  const T = Art.SEA_TEX;
  for (let v = 0; v < 2; v++) {
    tex(T.pine(v), () => Art.pineArt(v));
    tex(T.bush(v), () => Art.bushArt(v));
  }
  tex(T.palm, Art.palmArt);
  for (let v = 0; v < 3; v++) {
    tex(T.beachGrass(v), () => Art.beachGrassArt(v));
    tex(T.shell(v), () => Art.shellArt(v));
    tex(T.flower(v), () => Art.flowerArt(v));
    tex(T.tetra(v), () => Art.tetraArt(v));
  }
  tex(T.drift, Art.driftArt);
  // 물 층은 바닷가에 내리자마자 보여요 → 앞쪽에
  tex(T.water, Art.waterArt);
  tex(T.foam, Art.foamArt);
  tex(T.lace, Art.laceArt);
  tex(T.wet, Art.wetArt, true);
  tex(T.shimmer, Art.shimmerArt);
  tex(T.star, Art.starArt);
  tex(T.glowDot, Art.glowDotArt);
  tex(T.sheen, Art.sheenArt, true);
  tex(T.depthShade, Art.depthShadeArt, true);
  tex(T.sheenWet, Art.sheenWetArt);
  tex(T.duskWater, Art.duskWaterArt);
  tex(T.duskFoam, Art.duskFoamArt);
  tex(T.goldStreak, Art.goldStreakArt);
  tex(T.shelter, Art.shelterArt);
  tex(T.busSign, Art.busSignArt);
  tex(T.timetable, Art.timetableArt);
  tex(T.bench, Art.benchArt);
  tex(T.market, Art.marketArt);
  tex(T.realty, Art.realtyArt);
  tex(T.kiosk, Art.kioskArt);
  for (const l of SEA_LOTS) tex(T.lot(l.n), () => Art.lotArt(l));
  tex(T.mailbox, Art.mailboxArt);
  tex(T.stone(0), () => Art.stoneArt(0));
  tex(T.stone(1), () => Art.stoneArt(1));
  tex(T.crab, Art.crabArt);
  tex(T.ledge, Art.ledgeArt);
  for (let v = 0; v < 3; v++) tex(T.mat(v), () => Art.matArt(v));
  for (let v = 0; v < 2; v++) tex(T.parasol(v), () => Art.parasolArt(v));
  tex(T.lounger, Art.loungerArt);
  // 11/16 매점 먹거리·마실 거리 그림 (먹을 때 머리 위에 뜨는 접시·잔 — 캠핑장과 같은 그림, 바닷가에서 바로 들어오면 아직 없어요)
  for (const m of BBQ_MENU) tex(CAMP_TEX.bbqPlate(m.id), () => bbqPlateArt(m.id));
  tex(T.lotSign, Art.lotSignArt);
  tex(T.pier, Art.pierArt);
  tex(T.pierEnd, Art.pierEndArt);
  tex(T.post, Art.postArt);
  tex(T.breakwater, Art.breakwaterArt);
  tex(T.tip, Art.tipArt);
  tex(T.lighthouse, Art.lighthouseArt);
  tex(T.boat, Art.boatArt);
  tex(T.buoy, Art.buoyArt);
  SEA_ROCKS.forEach((_r, i) => {
    tex(T.rock(i), () => Art.rockArt(i));
    tex(T.rockFoam(i), () => Art.rockFoamArt(i));
  });
  tex(T.footbath, Art.footbathArt);
  tex(T.lamp, Art.lampArt);
  tex(T.lampGlow, () => Art.glowArt(24, 0xffe2a8, 1.8), true);
  tex(T.beaconGlow, () => Art.glowArt(48, 0xfff4c8, 1.5), true);
  tex(T.crates, Art.cratesArt);
  tex(T.netRack, Art.netRackArt);
  tex(T.gull, Art.gullArt);
  tex(T.spray, Art.sprayArt);
  tex(T.sparkle, Art.sparkleArt);
}

/** 두 색 곱하기 (0xRRGGBB) */
function mulColor(a: number, b: number): number {
  const c = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
