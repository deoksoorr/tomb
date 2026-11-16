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
  SEA_FURNITURE,
  SEA_GULL_PERCHES,
  SEA_HEIGHT,
  SEA_KIOSK,
  SEA_LIGHTHOUSE,
  SEA_LOTS,
  SEA_MARKET,
  SEA_PIER,
  SEA_PIER_END,
  SEA_REALTY,
  SEA_ROCKS,
  SEA_SHELTER_H,
  SEA_TIDE_POOLS,
  SEA_WIDTH,
  SEA_ZONES,
  TIDE_HIGH_Y,
  seaLotSign,
  tideLineY,
} from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { makeCanvas, mix } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import * as Art from "./seaArt";
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

/** 물가가 밀려왔다 빠지는 한 번 (ms) — 물때와 따로 */
export const SURGE_MS = 6000;
/** 밀려올 때 물가가 올라오는 폭 (px) */
export const SURGE_PX = 7;
/** 물 몸통 높이 (만조 물가에서 맵 아래까지 + 여유) */
const BODY_H = SEA_HEIGHT - TIDE_HIGH_Y + 48;
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
  private water: Phaser.GameObjects.TileSprite | null = null;
  private foam: Phaser.GameObjects.TileSprite | null = null;
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
  private readonly sprays: (Mote & { vy: number })[] = [];
  private readonly glints: Mote[] = [];
  private readonly lampGlows: Phaser.GameObjects.Image[] = [];
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
      const key = d.kind === "beachGrass" ? T.beachGrass(d.v) : d.kind === "shell" ? T.shell(d.v) : d.kind === "flower" ? T.flower(d.v) : T.drift;
      this.prop(key, d.x, d.y, FLAT + d.y, 1);
    }
  }

  /** 물 층: 젖은 모래 · 물러난 거품 자국 · 물 몸통 · 물가 거품 · 먼바다 반짝임 (모두 맵 폭, 위치만 옮겨요) */
  private addWater(): void {
    const s = this.scene;
    const T = Art.SEA_TEX;
    this.wet = this.keep(s.add.image(0, TIDE_HIGH_Y, T.wet).setOrigin(0, 0).setDisplaySize(SEA_WIDTH, 1).setDepth(SEA_DEPTH.wet));
    this.lace = this.keep(s.add.tileSprite(0, TIDE_HIGH_Y, SEA_WIDTH, 6, T.lace).setOrigin(0, 0).setDepth(SEA_DEPTH.lace).setAlpha(0.7).setVisible(!this.reduced));
    this.water = this.keep(s.add.tileSprite(0, TIDE_HIGH_Y, SEA_WIDTH, BODY_H, T.water).setOrigin(0, 0).setDepth(SEA_DEPTH.water));
    this.foam = this.keep(s.add.tileSprite(0, TIDE_HIGH_Y, SEA_WIDTH, Art.FOAM_H, T.foam).setOrigin(0, 0).setDepth(SEA_DEPTH.foam));
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
    for (const f of SEA_FURNITURE) this.prop(T.bench, f.x, f.y, f.y);
    // 시장·부동산·매점 (현판 글씨는 판 크기에 맞춰 월드 크기 그대로)
    this.prop(T.market, SEA_MARKET.x, SEA_MARKET.y, SEA_MARKET.y, 3);
    this.boardText(SEA_MARKET.x + Art.MARKET_SIGN.dx, SEA_MARKET.y + Art.MARKET_SIGN.dy, "포구 시장", 62, 0x2a4a66, SEA_MARKET.y + 0.5);
    this.prop(T.realty, SEA_REALTY.x, SEA_REALTY.y, SEA_REALTY.y, 3);
    this.boardText(SEA_REALTY.x + Art.REALTY_SIGN.dx, SEA_REALTY.y + Art.REALTY_SIGN.dy, "포구 부동산", 74, 0x5a3022, SEA_REALTY.y + 0.5);
    this.prop(T.kiosk, SEA_KIOSK.x, SEA_KIOSK.y, SEA_KIOSK.y, 3);
    this.boardText(SEA_KIOSK.x + Art.KIOSK_SIGN.dx, SEA_KIOSK.y + Art.KIOSK_SIGN.dy, "매점", 30, 0x8a2a1e, SEA_KIOSK.y + 0.5);
    // 오두막 터 6: 뒤·옆 울타리는 터 뒤 depth, 앞 울타리는 터 앞 depth로 (터 안에 선 사람이 울타리 사이에 보이게)
    for (const l of SEA_LOTS) {
      const x = l.x - 2;
      const y = l.y - Art.LOT_RISE;
      const key = T.lot(l.n);
      this.cull(l.x + l.w / 2, l.y, s.add.image(x, y, key).setOrigin(0, 0).setDepth(l.y + 1).setCrop(0, 0, Art.LOT_ART_W, Art.LOT_FRONT_Y));
      this.cull(l.x + l.w / 2, l.y + l.h, s.add.image(x, y, key).setOrigin(0, 0).setDepth(l.y + l.h).setCrop(0, Art.LOT_FRONT_Y, Art.LOT_ART_W, Art.LOT_ART_H - Art.LOT_FRONT_Y));
      const sg = seaLotSign(l);
      this.prop(T.lotSign, sg.x, sg.y);
      this.boardText(sg.x, sg.y + Art.LOT_SIGN_TEXT_DY, "분양 준비 중", Art.LOT_SIGN_W - 8, 0x4a3a2a, sg.y + 0.5);
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
    SEA_ROCKS.forEach((r, i) => this.prop(T.rock(i), r.x, Math.round(r.y + r.ry * 0.7 + 2), r.y + r.ry * 0.5));
    this.prop(T.footbath, SEA_FOOTBATH.x, SEA_FOOTBATH.y + 8, SEA_FOOTBATH.y - 6, 0);
    // 배·부표는 매 프레임 흔들려서 컬링하지 않아요 (몇 개뿐)
    this.boat = this.keep(s.add.image(SEA_BOAT.x, SEA_BOAT.y + 6, T.boat).setOrigin(0.5, 1).setDepth(SEA_BOAT.y));
    SEA_BUOYS.forEach((b, i) => this.buoys.push({ img: this.keep(s.add.image(b.x, b.y, T.buoy).setOrigin(0.5, 1).setDepth(b.y)), x: b.x, y: b.y, phase: i * 1.9 }));
  }

  /** 간판 글씨 (판 안에 꽉 차게 — 월드 크기 그대로, 이름표처럼 줌에 따라 줄지 않아요) */
  private boardText(x: number, y: number, text: string, maxW: number, tint: number, depth: number): void {
    this.atlas.ensure(text);
    const t = this.cull(x, depth, this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 0.5).setTint(tint).setDepth(depth));
    t.setScale(Math.min(1, maxW / Math.max(1, t.width)));
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
    this.addLabel(SEA_BUS_STOP.x + 20, SEA_BUS_STOP.y - SEA_SHELTER_H - 4, "마을행 · To Village", 0xfff0c0, 0.95);
  }

  /** 물보라·반짝임 (작은 풀) · 등대 불빛 */
  private addPools(): void {
    const s = this.scene;
    const T = Art.SEA_TEX;
    const n = (full: number, low: number) => (this.reduced ? low : full);
    for (let i = 0; i < n(10, 3); i++) this.sprays.push({ img: this.keep(s.add.image(0, 0, T.spray).setOrigin(0.5, 1).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vy: 0 });
    for (let i = 0; i < n(10, 4); i++) this.glints.push({ img: this.keep(s.add.image(0, 0, T.sparkle).setDepth(SEA_DEPTH.glint).setVisible(false)), x: 0, y: 0, t0: -1, life: 0 });
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
  }

  /**
   * 물때: 물 높이는 부드럽게 따라가고(시험용으로 물때를 확 밀어도 2초쯤 걸려 옮겨요), 물가는 6초마다 조금 밀려왔다 빠져요.
   * 막 드러난 갯벌은 젖은 띠로 남았다가 천천히 말라요 (물이 빠지는 동안 띠가 넓어지고, 들어올 땐 물가 바로 위만)
   */
  private updateTide(time: number, delta: number, t: SeaTime): void {
    const dt = this.lastTime < 0 ? 0 : Math.min(1000, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    if (Number.isNaN(this.level)) this.level = t.tide;
    else this.level += (t.tide - this.level) * Math.min(1, delta / 600);
    const lineY = tideLineY(this.level);
    const surge = this.reduced ? 3 : SURGE_PX * (0.5 - 0.5 * Math.cos((2 * Math.PI * time) / SURGE_MS));
    const edgeY = lineY - surge;
    const minTop = lineY - SURGE_PX - 10;
    if (Number.isNaN(this.wetTop)) this.wetTop = minTop - (t.trend < 0 ? 30 : 0);
    this.wetTop = Math.max(lineY - WET_MAX, Math.min(minTop, this.wetTop + dt * DRY_PX_PER_MS));
    const st = this.waterState;
    st.level = this.level;
    st.lineY = lineY;
    st.edgeY = edgeY;
    st.wetTop = this.wetTop;

    const foamY = Math.round(edgeY - 5);
    this.foam!.setY(foamY);
    this.foam!.tilePositionX = this.reduced ? 0 : (time * 0.006 + surge * 1.5) % Art.FOAM_W;
    const bodyY = foamY + Art.FOAM_H;
    this.water!.setY(bodyY);
    this.water!.tilePositionY = bodyY;
    this.water!.tilePositionX = this.reduced ? 0 : (time * 0.003) % Art.WATER_TILE_W;
    // 밤엔 물빛을 조금 더 깊게 (전체 어둠은 Atmosphere가 덮어요)
    const night = Math.min(1, t.darkness);
    const tint = mix(0xffffff, 0x9aaccc, night * 0.6);
    this.water!.setTint(tint);
    this.foam!.setTint(mix(0xffffff, 0xc8d4e8, night * 0.5));
    if (this.lace!.visible) {
      // 물러난 거품 자국: 밀려온 물보다 조금 늦게 따라와요 (물이 빠질 때 갯벌 위에 남아 보여요)
      const lag = SURGE_PX * (0.5 - 0.5 * Math.cos((2 * Math.PI * (time - 1500)) / SURGE_MS));
      this.lace!.setY(Math.round(lineY - lag - 2));
      this.lace!.tilePositionX = (time * 0.004) % Art.FOAM_W;
    }
    const wetH = Math.max(1, edgeY + 6 - this.wetTop);
    this.wet!.setY(Math.round(this.wetTop)).setDisplaySize(SEA_WIDTH, wetH);
    this.shimmer!.tilePositionX = this.reduced ? 0 : (time * 0.006) % 128;
    this.shimmer!.tilePositionY = this.reduced ? 0 : Math.sin(time / 2600) * 3;
    this.shimmer!.setAlpha(Math.max(0.08, (0.55 - 0.32 * night) * (1 - t.rain * 0.5) * (1 - t.fog * 0.4)));
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

  /** 물보라: 밀려온 물이 방파제 테트라포드·갯바위에 부딪힐 때 (화면 근처만) */
  private updateSpray(time: number, view: Phaser.Geom.Rectangle): void {
    const st = this.waterState;
    const phase = (((time % SURGE_MS) + SURGE_MS) % SURGE_MS) / SURGE_MS;
    const peak = phase > 0.38 && phase < 0.58;
    const chance = this.reduced ? 0.04 : peak ? 0.3 : 0.03;
    if (Math.random() < chance) {
      const free = this.sprays.find((s) => s.t0 < 0);
      const at = free ? this.sprayPoint(st.edgeY) : null;
      if (free && at && at.x > view.x - 40 && at.x < view.right + 40 && at.y > view.y - 40 && at.y < view.bottom + 60) {
        free.t0 = time;
        free.life = 520 + Math.random() * 360;
        free.x = at.x;
        free.y = at.y;
        free.vy = 8 + Math.random() * 8;
        free.img.setPosition(at.x, at.y).setDepth(at.y + 14).setVisible(true).setFlipX(Math.random() < 0.5);
      }
    }
    for (const s of this.sprays) {
      if (s.t0 < 0) continue;
      const k = (time - s.t0) / s.life;
      if (k >= 1) {
        s.t0 = -1;
        s.img.setVisible(false);
        continue;
      }
      s.img.setY(Math.round(s.y - Math.sin(k * Math.PI * 0.8) * s.vy)).setAlpha(1 - k * k).setScale(0.8 + k * 0.5);
    }
  }

  /** 물보라가 이는 자리 하나 (없으면 null): 방파제 양옆(물에 잠긴 곳)·끝 데크 앞·물에 닿은 갯바위 */
  private sprayPoint(edgeY: number): { x: number; y: number } | null {
    const B = SEA_BREAKWATER;
    const T = SEA_BREAKWATER_TIP;
    const r = Math.random();
    if (r < 0.55) {
      const y0 = Math.max(edgeY + 4, SEA_FLAT_Y0 + 14);
      const y1 = T.y + T.h;
      if (y1 <= y0) return null;
      const right = Math.random() < 0.5;
      return { x: right ? B.x + B.w + 12 + Math.random() * 6 : B.x - 12 - Math.random() * 6, y: y0 + Math.random() * (y1 - y0) };
    }
    if (r < 0.7) return { x: T.x + Math.random() * T.w, y: T.y + T.h + 4 };
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
    this.buoys.length = 0;
    this.lampGlows.length = 0;
    this.water = this.foam = this.lace = this.shimmer = null;
    this.wet = this.boat = this.beacon = null;
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
  tex(T.shelter, Art.shelterArt);
  tex(T.busSign, Art.busSignArt);
  tex(T.timetable, Art.timetableArt);
  tex(T.bench, Art.benchArt);
  tex(T.market, Art.marketArt);
  tex(T.realty, Art.realtyArt);
  tex(T.kiosk, Art.kioskArt);
  for (const l of SEA_LOTS) tex(T.lot(l.n), () => Art.lotArt(l.n));
  tex(T.lotSign, Art.lotSignArt);
  tex(T.pier, Art.pierArt);
  tex(T.pierEnd, Art.pierEndArt);
  tex(T.post, Art.postArt);
  tex(T.breakwater, Art.breakwaterArt);
  tex(T.tip, Art.tipArt);
  tex(T.lighthouse, Art.lighthouseArt);
  tex(T.boat, Art.boatArt);
  tex(T.buoy, Art.buoyArt);
  SEA_ROCKS.forEach((_r, i) => tex(T.rock(i), () => Art.rockArt(i)));
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
