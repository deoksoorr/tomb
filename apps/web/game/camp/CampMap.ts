import * as Phaser from "phaser";
import {
  CAMP_BOARD_SPOT,
  CAMP_BOUNDS,
  CAMP_BUS_SIGN,
  CAMP_BUS_STOP,
  CAMP_BUS_TIMETABLE,
  CAMP_DECKS,
  CAMP_FIRE,
  CAMP_FURNITURE,
  CAMP_HEIGHT,
  CAMP_LOOKOUT,
  CAMP_NPCS,
  CAMP_OFFICE,
  CAMP_STREAM_HALF_W,
  CAMP_TABLE,
  CAMP_TARP,
  CAMP_VANS,
  CAMP_VAN_GEAR,
  BBQ_MENU,
  CAMP_WIDTH,
  CAMP_ZONES,
  campStreamX,
  type CampNpcId,
} from "@tomb/protocol";
import { kstHour } from "@/lib/ambience";
import { imageBox, type SnowNpc } from "../world/snowNpc";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { seasonKey } from "../sprites/npcSeasonArt";
import { makeCanvas, mix } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import * as Art from "./campArt";
import * as Lay from "./campLayout";
import { CAMP_XTREE, CampConceptDecor, campSkin, type CampActor } from "./CampConceptDecor";
import { CAMP_TEX_PREFIX, type CampInteractable, type CampLight, type CampMapApi, type CampTime } from "./campTypes";

// 11/15 언젠가 캠핑장 맵 (CampMapApi 구현): 바닥(덩어리 텍스처, 화면 근처만), 나무·소품(칸 컬링, y 정렬), 이름표,
// 충돌, 시간대 풍경(새벽 물안개·일출빛 / 낮 다람쥐·물 반짝임 / 노을 단풍 / 밤 줄 조명·은하수·반딧불 / 비 오는 날 타프 빗방울),
// NPC(별지기 밤만, 기타 캠퍼 밤 9~11시), 캠핑카 문(문간 자리에 누가 앉으면 열린다).
// 그림은 정류장 근처·버스 여행 동안 campPrebake가 조금씩 구워요. 한 번 구운 "camp-" 텍스처는 지우지 않아요 (다시 갈 때 멈추지 않게).
// 매 프레임 일은 작은 풀(불티 8·반짝임 16·반딧불 10·다람쥐 3)과 컬링 칸 경계가 바뀔 때만이라 마을보다 가볍다.
// 11/17 맵 컨셉(겨울·크리스마스, lib/mapConcept): 그림 키를 campSkin으로 바꿔 끼우고(배치·충돌은 그대로), 장식은 CampConceptDecor.

/** 소품 컬링 칸 */
const CELL = 256;
const CELL_COLS = Math.ceil(CAMP_WIDTH / CELL);
const CULL_PAD = 96;
const CHUNK = Art.CAMP_CHUNK;
const CHUNK_COLS = Math.ceil(CAMP_WIDTH / CHUNK);
const CHUNK_ROWS = Math.ceil(CAMP_HEIGHT / CHUNK);
/** 바닥에 붙은 그림 (아바타가 늘 위로) */
const FLAT = DEPTH.decal;
/** 머리 위 (줄 조명·타프 천·물안개) — 어둠 막(DEPTH.dark)보다는 아래 */
const OVERHEAD = 90_000;
/** 11/17 크리스마스판 줄 조명 전구 색 (빨강·금·초록·파랑·흰) */
const XMAS_BULBS: readonly number[] = [0xff6a5a, 0xffd25a, 0x7ae08a, 0x7ac8ff, 0xfff2d8];

type Culled = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.BitmapText;
type Npc = { id: CampNpcId; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; x: number; y: number; on: boolean; phase: number; frame: number };
type Hopper = { img: Phaser.GameObjects.Image; from: { x: number; y: number }; to: { x: number; y: number }; t0: number; dur: number; rest: number };
type Mote = { img: Phaser.GameObjects.Image; x: number; y: number; t0: number; life: number; vx: number; vy: number };

const SQUIRREL_HOURS = [7, 17] as const;

export class CampMap implements CampMapApi {
  readonly width = CAMP_WIDTH;
  readonly height = CAMP_HEIGHT;
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  readonly interactables: readonly CampInteractable[] = Lay.CAMP_INTERACTABLES;
  /** 11/17 판마다 다른 밤 빛 (크리스마스판은 트리 빛 + 랜턴·화롯대가 더 따뜻하고 넓게) */
  private lights: readonly CampLight[] = Lay.CAMP_LIGHTS;
  get staticLights(): readonly CampLight[] {
    return this.lights;
  }

  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly chunks = new Map<number, Phaser.GameObjects.Image>();
  private readonly cells = new Map<number, Culled[]>();
  private readonly shownCells = new Set<number>();
  private lastCull = "";
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private labelScale = 0;
  private readonly vans = new Map<string, { img: Phaser.GameObjects.Image; i: number; open: boolean }>();
  private readonly npcs = new Map<CampNpcId, Npc>();
  /** 노을에 붉게 물드는 잎 나무 */
  private readonly foliage: Phaser.GameObjects.Image[] = [];
  private sunsetK = -1;
  private readonly bulbs: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; phase: number }[] = [];
  /** 음료 자판기 앞판 불빛 (ADD, 어두울수록 밝다) */
  private vendingLit: Phaser.GameObjects.Image | null = null;
  private lit = -1;
  private readonly embers: Mote[] = [];
  private fireBoost = false;
  /** 11/15 바베큐 그릴 연기 (작은 풀) */
  private readonly smoke: { img: Phaser.GameObjects.Image; t0: number; life: number; x: number; y: number; vx: number }[] = [];
  private readonly sparkles: Mote[] = [];
  private readonly fireflies: Mote[] = [];
  private readonly drips: Mote[] = [];
  private readonly squirrels: Hopper[] = [];
  private readonly mists: { img: Phaser.GameObjects.Image; x: number; y: number; phase: number }[] = [];
  private sunGlow!: Phaser.GameObjects.Image;
  private milky!: Phaser.GameObjects.Image;
  private tarp!: Phaser.GameObjects.Image;
  private tarpAlpha = 0.96;
  private hour: number;
  private destroyed = false;
  /** 11/15 나눠 만들기를 시작했어요 (parts는 한 번만) */
  private started = false;
  /** 11/17 맵 컨셉: 지금 판과 판마다 그림을 바꿔 끼울 것 (기본 그림 키) */
  private concept: MapConcept;
  private readonly skinned: { o: Phaser.GameObjects.Image; base: string }[] = [];
  private decor: CampConceptDecor | null = null;
  private actors: () => Iterable<CampActor> = () => [];

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
    this.lights = lightsFor(concept);
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
    const scene = this.scene;
    this.makeTextures();
    yield;

    let n = 0;
    for (const r of Lay.campStaticColliders()) {
      this.addCollider(this.colliders, r);
      if (++n % 40 === 0) yield;
    }
    for (const r of Lay.campFurnitureColliders()) {
      this.addCollider(this.furnitureColliders, r);
      if (++n % 40 === 0) yield;
    }
    yield;

    this.addGroundDecor();
    yield;
    this.addTrees();
    yield;
    this.addStructures();
    yield;
    this.addFurniture();
    yield;
    this.addFire();
    yield;
    this.addStrings();
    yield;
    this.addNpcs();
    yield;
    this.addLabels();
    yield;

    // 타프 천 (머리 위, 아래에 서면 옅어진다)
    this.tarp = this.keep(this.track(scene.add.image(CAMP_TARP.x + CAMP_TARP.w / 2, CAMP_TARP.y + CAMP_TARP.h / 2 - 22, this.skin(Art.CAMP_TEX.tarp)), Art.CAMP_TEX.tarp).setDepth(OVERHEAD - 5).setAlpha(this.tarpAlpha));
    // 일출빛 (전망대 너머) · 은하수 (밤 하늘, 화면을 따라온다)
    this.sunGlow = this.keep(scene.add.image(Art.CAMP_SUNRISE.x, Art.CAMP_SUNRISE.y, Art.CAMP_TEX.sunGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 3).setScale(3.2).setVisible(false));
    this.milky = this.keep(scene.add.image(0, 0, Art.CAMP_TEX.milkyWay).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fireflies - 1).setVisible(false));
    this.addPools();
    yield;
    // 11/17 겨울·크리스마스 장식 (기본 판이면 아무것도 세우지 않는다)
    this.decor = new CampConceptDecor(scene, this.reduced, (x, y, o) => this.cullExtra(x, y, o), () => this.actors());
    this.decor.apply(this.concept);
  }

  // ── 11/17 맵 컨셉 ──

  /** 이 판의 그림 키 (처음 쓰면 굽는다) */
  private skin(base: string): string {
    return campSkin(this.scene, base, this.concept);
  }

  /** 판마다 그림을 바꿔 끼울 이미지로 적어 둔다 */
  private track<T extends Phaser.GameObjects.Image>(o: T, base: string): T {
    this.skinned.push({ o, base });
    return o;
  }

  /** 입김을 낼 사람들 (CampScene이 한 번 넣는다) */
  setActors(fn: () => Iterable<CampActor>): void {
    this.actors = fn;
  }

  /** 판을 바꾼다: 그림 키를 다시 고르고(바닥 덩어리 포함), 장식을 다시 세우고, 줄 조명 색·밤 빛을 고친다 */
  setConcept(c: MapConcept): void {
    if (c === this.concept || this.destroyed) return;
    this.concept = c;
    this.lights = lightsFor(c);
    for (const { o, base } of this.skinned) if (o.active) o.setTexture(this.skin(base), o.frame.name);
    for (const [k, img] of this.chunks) {
      const cx = k % CHUNK_COLS;
      const cy = Math.floor(k / CHUNK_COLS);
      img.setTexture(this.chunkKey(cx, cy));
    }
    // 11/17 NPC도 이 판 옷으로 (지금 프레임 그대로)
    for (const n of this.npcs.values()) n.img.setTexture(seasonKey(Art.CAMP_TEX.npc(n.id), c), n.frame);
    this.lit = -1;
    this.sunsetK = -1;
    this.decor?.apply(c);
  }

  /** 장식 그림을 컬링 칸에 넣는다 (장식이 지워지면 칸에서도 빠진다) */
  private cullExtra(x: number, y: number, o: Phaser.GameObjects.Image): void {
    const k = Math.floor(Math.max(0, y) / CELL) * CELL_COLS + Math.floor(Math.max(0, Math.min(CAMP_WIDTH - 1, x)) / CELL);
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

  private tex(key: string, build: () => Art.ArtOut | ReturnType<typeof Art.deckArt>, linear = false): void {
    if (this.scene.textures.exists(key)) return;
    const out = build();
    const a: Art.ArtOut = "grid" in out ? out : { grid: out };
    addCanvasTexture(this.scene, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
  }

  private makeTextures(): void {
    forEachCampTexture((key, build, linear) => this.tex(key, build, linear));
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
    const k = Math.floor(Math.max(0, y) / CELL) * CELL_COLS + Math.floor(Math.max(0, Math.min(CAMP_WIDTH - 1, x)) / CELL);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(o);
    o.setVisible(this.shownCells.has(k));
    return o;
  }

  /** 받침 가운데(바닥) 원점 그림 — 그림 맨 아래 lift줄이 그림자라 그만큼 내린다 */
  private prop(key: string, x: number, y: number, depth = y, lift = 2): Phaser.GameObjects.Image {
    return this.cull(x, y, this.track(this.scene.add.image(x, y + lift, this.skin(key)).setOrigin(0.5, 1).setDepth(depth), key));
  }

  private addGroundDecor(): void {
    const T = Art.CAMP_TEX;
    for (const d of Lay.CAMP_DECOR) {
      const key = d.kind === "leafPile" ? T.leafPile(d.v) : d.kind === "mushroom" ? T.mushroom(d.v) : d.kind === "fern" ? T.fern(d.v) : T.pebbles(d.v);
      this.prop(key, d.x, d.y, FLAT + d.y, 1);
    }
    // 데크 24 (바닥 높이 — 위를 걸어 다닌다)
    const flat = (x: number, y: number, key: string) => this.track(this.scene.add.image(x, y, this.skin(key)).setOrigin(0, 0), key);
    for (const d of CAMP_DECKS) this.cull(d.x, d.y, flat(d.x - 19, d.y - 17, T.deck(d.n)).setDepth(FLAT + 2000 + d.y));
    // 통나무 다리
    const bp = Art.bridgePlacement();
    this.cull(bp.x + Art.BRIDGE_W / 2, bp.y + Art.BRIDGE_H / 2, flat(bp.x, bp.y, T.bridge).setDepth(FLAT + 2600));
    // 전망대 바닥(뒤·옆 난간 포함)과 앞 난간·계단
    const L = CAMP_LOOKOUT;
    this.cull(L.x + L.w / 2, L.y + L.h / 2, flat(L.x, L.y, T.lookoutFloor).setDepth(FLAT + 3000));
    this.cull(L.x + L.w / 2, L.y + L.h, flat(L.x, L.y + L.h - 12, T.lookoutFront).setDepth(L.y + L.h));
  }

  private addTrees(): void {
    const T = Art.CAMP_TEX;
    for (const t of Lay.CAMP_TREES) {
      const v = t.v % 2;
      const key = t.kind === "spruce" ? T.spruce(v) : t.kind === "pine" ? T.pine(v) : t.kind === "fir" ? T.fir(v) : t.kind === "maple" ? T.maple(v) : t.kind === "mapleO" ? T.mapleO(v) : t.kind === "yellow" ? T.yellow(v) : T.bush(v);
      const img = this.prop(key, t.x, t.y);
      if (t.kind === "maple" || t.kind === "mapleO" || t.kind === "yellow") this.foliage.push(img);
    }
    for (const b of Lay.CAMP_BOULDERS) this.prop(T.boulder(b.v), b.x, b.y);
  }

  private addStructures(): void {
    const T = Art.CAMP_TEX;
    const s0 = this.scene;
    // 관리소·매점
    this.prop(T.office, CAMP_OFFICE.x, CAMP_OFFICE.y, CAMP_OFFICE.y, 3);
    this.prop(T.board, CAMP_BOARD_SPOT.x, CAMP_BOARD_SPOT.y);
    // 버스 정류장
    // 11/16 뒷벽은 벤치(qB, 정류장 − 8) 바로 뒤, 지붕·앞 기둥만 정류장 depth로 한 번 더 (앉은 사람 머리가 뒷벽에 가리지 않게)
    this.prop(T.shelter, CAMP_BUS_STOP.x, CAMP_BUS_STOP.y, CAMP_BUS_STOP.y - 9);
    for (const [cx, cy, cw, ch] of Art.SHELTER_FRONT) this.prop(T.shelter, CAMP_BUS_STOP.x, CAMP_BUS_STOP.y).setCrop(cx, cy, cw, ch);
    this.prop(T.busSign, CAMP_BUS_SIGN.x, CAMP_BUS_SIGN.y);
    this.prop(T.timetable, CAMP_BUS_TIMETABLE.x, CAMP_BUS_TIMETABLE.y);
    // 캠핑카 3대
    CAMP_VANS.forEach((v, i) => {
      const img = this.prop(T.van(i, false), v.x, v.y, v.y, 6);
      this.vans.set(v.id, { img, i, open: false });
    });
    // 11/15 야외 바베큐장: 숯불 그릴 + 나무 탁자, 고기 굽는 연기
    const B = Lay.CAMP_BBQ;
    this.prop(T.bbqGrill, B.grill.x, B.grill.y);
    this.prop(T.bbqTable, B.table.x, B.table.y);
    // 음료 자판기 + 밤에 빛나는 앞판 (updateLights)
    this.prop(T.vending, B.vending.x, B.vending.y);
    this.vendingLit = this.cull(B.vending.x, B.vending.y, s0.add.image(B.vending.x, B.vending.y + 2, T.vendingLit).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(B.vending.y + 0.1).setAlpha(0));
    for (let i = 0; i < (this.reduced ? 3 : 7); i++)
      this.smoke.push({ img: this.keep(s0.add.image(B.grill.x, B.grill.y, T.bbqSmoke).setDepth(B.grill.y + 30).setVisible(false)), t0: -1, life: 0, x: 0, y: 0, vx: 0 });
    // 캠핑카 앞 캠핑 도구 (탁자·탁자 위 랜턴·화롯대·아이스박스)
    for (const g of CAMP_VAN_GEAR) {
      this.prop(T.foldTable, g.table.x, g.table.y);
      this.prop(T.lantern, g.lantern.x + 6, g.lantern.y - 8, g.table.y + 1, 0);
      this.prop(T.brazier, g.brazier.x, g.brazier.y);
      this.prop(T.icebox, g.icebox.x, g.icebox.y);
      if (!s0.anims.exists(`${CAMP_TEX_PREFIX}brazier`)) {
        s0.anims.create({ key: `${CAMP_TEX_PREFIX}brazier`, frames: Array.from({ length: 3 }, (_, i) => ({ key: T.brazierFire, frame: i })), frameRate: this.reduced ? 3 : 7, repeat: -1 });
      }
      const fire = s0.add.sprite(g.brazier.x, g.brazier.y - 5, T.brazierFire, 0).setOrigin(0.5, 1).setDepth(g.brazier.y + 0.5);
      fire.play({ key: `${CAMP_TEX_PREFIX}brazier`, startFrame: g.van.charCodeAt(1) % 3 });
      this.cull(g.brazier.x, g.brazier.y, fire);
    }
    // 「언젠가 씨네」 문패 팻말 (캠핑카 왼쪽에 세운다 — 문간에 앉은 사람 이름표와 겹치지 않게)
    for (const v of CAMP_VANS) {
      if (!v.plate) continue;
      const px = v.x - 64;
      const py = v.y + 2;
      this.prop(T.plateSign, px, py);
      this.atlas.ensure(v.plate);
      const t = this.cull(px, py, this.keep(s0.add.bitmapText(px, py - Art.PLATE_SIGN_H + 16, FONT_KEY, v.plate, FONT_PX).setOrigin(0.5, 0.5).setTint(0x5a3018).setDepth(py + 0.5)));
      // 판 안에 꽉 차게 (월드 크기 그대로 — 이름표처럼 줌에 따라 줄지 않는다)
      t.setScale(Math.min(1, (Art.PLATE_SIGN_W - 14) / Math.max(1, t.width)));
    }
    // 타프 기둥·피크닉 탁자
    for (const p of Lay.CAMP_TARP_POLES) this.prop(T.tarpPole, p.x, p.y);
    this.prop(T.table, CAMP_TABLE.x, CAMP_TABLE.y + 8, CAMP_TABLE.y + 8, 2);
    // 광장 둘레 조명 기둥
    for (const p of Lay.CAMP_LIGHT_POLES) this.prop(T.pole, p.x, p.y);
  }

  private addFurniture(): void {
    const T = Art.CAMP_TEX;
    for (const f of CAMP_FURNITURE) {
      if (f.id.startsWith("qV")) continue; // 캠핑카 문간 (차 그림에 있다)
      if (f.id.startsWith("qC")) {
        // 캠핑카 앞 캠핑 의자: 아래를 보면 앞모습, 옆을 보면 옆모습(왼쪽은 뒤집기). 천 색은 캠핑카마다
        const vi = Number(f.id[2]) - 1;
        const front = f.facing === 0;
        const img = this.prop(front ? T.campChairFront(vi) : T.campChairSide(vi), f.x, f.y + 1, f.y - 1);
        if (f.facing === 1) img.setFlipX(true);
        continue;
      }
      const key = f.id.startsWith("qL") ? T.logChair : f.id.startsWith("qR") ? T.rockSeat : f.id === "qB" ? T.rustyBench : f.id === "qF" ? T.bench : f.id.startsWith("qT") ? T.plankBench3 : T.plankBench2;
      this.prop(key, f.x, f.y, f.y);
    }
  }

  private addFire(): void {
    const s = this.scene;
    const T = Art.CAMP_TEX;
    this.prop(T.fireRing, CAMP_FIRE.x, CAMP_FIRE.y, CAMP_FIRE.y, 13);
    if (!s.anims.exists(`${CAMP_TEX_PREFIX}flames`)) {
      s.anims.create({ key: `${CAMP_TEX_PREFIX}flames`, frames: Array.from({ length: Art.FLAME_FRAMES }, (_, i) => ({ key: T.flames, frame: i })), frameRate: this.reduced ? 4 : 9, repeat: -1 });
    }
    const flame = s.add.sprite(CAMP_FIRE.x, CAMP_FIRE.y + 3, T.flames, 0).setOrigin(0.5, 1).setDepth(CAMP_FIRE.y + 1);
    flame.play(`${CAMP_TEX_PREFIX}flames`);
    this.cull(CAMP_FIRE.x, CAMP_FIRE.y, flame);
  }

  /** 줄 조명: 전선(그래픽 하나)과 전구, 밤에 켜지는 빛 번짐 */
  private addStrings(): void {
    const s = this.scene;
    const T = Art.CAMP_TEX;
    const wires = this.keep(s.add.graphics().setDepth(OVERHEAD));
    wires.lineStyle(1, 0x2a2018, 0.9);
    for (const str of Lay.CAMP_STRINGS) {
      wires.beginPath();
      for (let i = 0; i <= 16; i++) {
        const p = Lay.stringPoint(str, i / 16);
        if (i === 0) wires.moveTo(p.x, p.y);
        else wires.lineTo(p.x, p.y);
      }
      wires.strokePath();
    }
    for (const b of Lay.stringBulbs()) {
      const img = this.cull(b.x, b.depthY, s.add.image(b.x, b.y + 1, T.bulb).setOrigin(0.5, 0).setDepth(OVERHEAD + 1));
      const glow = this.cull(b.x, b.depthY, s.add.image(b.x, b.y + 3, T.bulbGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1).setAlpha(0));
      this.bulbs.push({ img, glow, phase: b.i * 1.7 });
    }
  }

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
    for (const z of CAMP_ZONES) {
      if (z.id === "busStop" || z.id === "office") continue; // 정류장은 노선 팻말 글씨, 관리소·매점은 현판 글씨로
      const at = Lay.CAMP_ZONE_LABEL_AT[z.name] ?? { x: z.x + z.w / 2, y: z.y + 10 };
      this.addLabel(at.x, at.y, z.name, z.id === "stream" ? 0xc8e4ec : 0xf0dcb0, 0.66);
    }
    // 정류장 노선 팻말 · 시간표
    this.addLabel(CAMP_BUS_STOP.x + 20, CAMP_BUS_STOP.y - Lay.CAMP_SHELTER_H - 4, "언젠가 캠핑장행 · Someday Camp", 0xfff0c0, 0.95);
    this.addLabel(CAMP_BUS_TIMETABLE.x, CAMP_BUS_TIMETABLE.y - 32, "다음 버스: 언젠가", 0xd8ecff, 0.85);
    // 관리소·매점 현판 (오두막 그림의 빈 판 위)
    this.addLabel(CAMP_OFFICE.x - 50, CAMP_OFFICE.y - 37, "관리소", 0x5a3a22, 1, 0.5);
    this.addLabel(CAMP_OFFICE.x + 44, CAMP_OFFICE.y - 40, "매점", 0x5a3a22, 1, 0.5);
    this.addLabel(CAMP_BOARD_SPOT.x, CAMP_BOARD_SPOT.y - 36, "의뢰판", 0xf0dcb0, 0.8);
  }

  /** 반짝임·불티·반딧불·빗방울·다람쥐·물안개 (작은 풀) */
  private addPools(): void {
    const s = this.scene;
    const T = Art.CAMP_TEX;
    const n = (full: number, low: number) => (this.reduced ? low : full);
    for (let i = 0; i < n(16, 5); i++) this.embers.push({ img: this.keep(s.add.image(0, 0, T.ember).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 2).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
    for (let i = 0; i < n(16, 6); i++) this.sparkles.push({ img: this.keep(s.add.image(0, 0, T.sparkle).setDepth(FLAT + 2500).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
    for (let i = 0; i < n(10, 4); i++) this.fireflies.push({ img: this.keep(s.add.image(0, 0, T.firefly).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fireflies).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
    for (let i = 0; i < n(14, 5); i++) this.drips.push({ img: this.keep(s.add.image(0, 0, T.drip).setDepth(OVERHEAD - 4).setVisible(false)), x: 0, y: 0, t0: -1, life: 0, vx: 0, vy: 0 });
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

  setSeatTaken(seatId: string, taken: boolean): void {
    const m = /^qV(\d)$/.exec(seatId);
    if (!m) return;
    const v = this.vans.get(`v${m[1]}`);
    if (!v || v.open === taken) return;
    v.open = taken;
    const base = Art.CAMP_TEX.van(v.i, taken);
    const sk = this.skinned.find((s) => s.o === v.img);
    if (sk) sk.base = base;
    v.img.setTexture(this.skin(base));
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

  underTarp(x: number, y: number): boolean {
    return Lay.inRect(CAMP_TARP, x, y);
  }

  update(time: number, delta: number, view: Phaser.Geom.Rectangle, t: CampTime): void {
    if (this.destroyed) return;
    this.hour = t.hour;
    this.updateCulling(view);
    this.updateLabels();
    this.updateNpcs(time);
    const night = t.hour >= 19.5 || t.hour < 5 ? 1 : 0;
    this.updateLights(time, Math.max(t.darkness, night * 0.6));
    this.updateSunset(t.hour);
    this.updateTarp(view, delta);
    this.updateEmbers(time, delta, t.darkness);
    this.updateSmoke(time, delta, view);
    this.updateSparkles(time, t);
    this.updateFireflies(time, t);
    this.updateDrips(time, t.rain);
    this.updateSquirrels(time, t);
    this.updateMist(time, t);
    this.updateSky(time, view, t);
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

  /** 줄 조명: 어두워지면 켜진다 (전구 색 + 빛 번짐, 살짝 깜빡) */
  private updateLights(time: number, dark: number): void {
    const on = Math.max(0, Math.min(1, (dark - 0.18) / 0.4));
    const changed = Math.abs(on - this.lit) > 0.02;
    if (changed) {
      this.lit = on;
      // 11/17 크리스마스판은 전구마다 색을 돌린다 (꺼져 있을 때도 색 전구가 보이게)
      const xmas = this.concept === "christmas";
      const tint = mix(0x8a7a60, 0xfff4c8, on);
      this.bulbs.forEach((b, i) => {
        const c = XMAS_BULBS[i % XMAS_BULBS.length];
        b.img.setTint(xmas ? mix(mix(c, 0x6a6058, 0.45), c, on) : tint);
        if (xmas) b.glow.setTint(c);
        else b.glow.clearTint();
      });
      this.vendingLit?.setAlpha(0.15 + 0.7 * on);
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
    // 11/17 겨울 판은 잎이 진 나무라 물들 잎이 없다
    const k = !isSnowy(this.concept) && hour >= 16.6 && hour <= 19.4 ? Math.sin(((hour - 16.6) / 2.8) * Math.PI) : 0;
    if (Math.abs(k - this.sunsetK) < 0.04) return;
    this.sunsetK = k;
    const tint = mix(0xffffff, 0xff9a78, k * 0.7);
    for (const f of this.foliage) {
      if (k <= 0.001) f.clearTint();
      else f.setTint(tint);
    }
  }

  /** 타프 아래(화면 가운데 = 내 캐릭터)면 천을 옅게 */
  private updateTarp(view: Phaser.Geom.Rectangle, delta: number): void {
    const inside = Lay.inRect(CAMP_TARP, view.centerX, view.centerY + 6, 6);
    const goal = inside ? 0.42 : 0.96;
    const k = Math.min(1, delta / 180);
    this.tarpAlpha += (goal - this.tarpAlpha) * k;
    if (Math.abs(this.tarp.alpha - this.tarpAlpha) > 0.005) this.tarp.setAlpha(this.tarpAlpha);
  }

  /** 바베큐 그릴 위로 피어오르는 연기 (화면 근처일 때만) */
  private updateSmoke(time: number, delta: number, view: Phaser.Geom.Rectangle): void {
    const g = Lay.CAMP_BBQ.grill;
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

  /** 계곡 물 반짝임 (낮에 더 많이) */
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
        s.y = Math.random() * CAMP_HEIGHT;
        s.x = campStreamX(s.y) + (Math.random() - 0.5) * CAMP_STREAM_HALF_W * 1.4;
        s.img.setPosition(Math.round(s.x), Math.round(s.y)).setVisible(true);
      }
      const k = (time - s.t0) / s.life;
      s.img.setAlpha(Math.sin(k * Math.PI) * (0.5 + 0.5 * (1 - t.darkness)));
      s.img.y = Math.round(s.y + k * 6); // 물살 따라 아래로
    }
  }

  /** 반딧불 (밤, 비 안 오는 날): 계곡 물가와 광장 둘레 */
  private updateFireflies(time: number, t: CampTime): void {
    const night = t.hour >= 19.5 || t.hour < 4.5;
    // 11/17 겨울 판엔 반딧불이 없다
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
          f.x = CAMP_FIRE.x + Math.cos(a) * 150;
          f.y = CAMP_FIRE.y + Math.sin(a) * 110;
        } else {
          f.y = 80 + Math.random() * (CAMP_HEIGHT - 160);
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

  /** 비 오는 날 타프 끝에서 떨어지는 빗방울 */
  private updateDrips(time: number, rain: number): void {
    const edges = [CAMP_TARP.y - 2, CAMP_TARP.y + CAMP_TARP.h - 44];
    for (const d of this.drips) {
      if (d.t0 < 0 || time - d.t0 > d.life) {
        if (rain < 0.08 || Math.random() > rain * 0.25) {
          if (d.t0 >= 0) d.img.setVisible(false);
          d.t0 = -1;
          continue;
        }
        d.t0 = time;
        d.life = 260 + Math.random() * 120;
        d.x = CAMP_TARP.x + 10 + Math.random() * (CAMP_TARP.w - 20);
        d.y = edges[Math.random() < 0.6 ? 1 : 0] + 18;
        d.img.setVisible(true);
      }
      const k = (time - d.t0) / d.life;
      d.img.setPosition(d.x, d.y + k * k * 18).setAlpha(1 - k * 0.6);
    }
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
        // 가까운 다른 나무로
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

  /** 일출빛(5~8시, 전망대 너머)과 은하수(맑은 밤) */
  private updateSky(time: number, view: Phaser.Geom.Rectangle, t: CampTime): void {
    const sunrise = t.hour >= 5 && t.hour <= 8 ? Math.sin(((t.hour - 5) / 3) * Math.PI) : 0;
    const sr = sunrise * (1 - t.rain) * (1 - t.fog * 0.5);
    if (sr > 0.02) this.sunGlow.setVisible(true).setAlpha(sr * (0.75 + 0.05 * Math.sin(time / 1500)));
    else if (this.sunGlow.visible) this.sunGlow.setVisible(false);

    const night = t.hour >= 20 || t.hour < 4.5 ? 1 : t.hour >= 19 ? t.hour - 19 : t.hour < 5 ? (5 - t.hour) * 2 : 0;
    const clear = Math.max(0, 1 - t.rain * 3 - t.fog);
    const a = Math.min(1, night) * clear * Math.max(0.5, t.darkness) * 0.6;
    if (a < 0.02) {
      if (this.milky.visible) this.milky.setVisible(false);
      return;
    }
    // 화면 위쪽에 띠 (조금만 따라 움직여 하늘처럼)
    const scale = (view.width / 320) * 1.15;
    this.milky
      .setVisible(true)
      .setScale(scale)
      .setPosition(view.centerX - (view.centerX - CAMP_WIDTH / 2) * 0.06, view.y + view.height * 0.32 - (view.centerY - CAMP_HEIGHT / 2) * 0.04)
      .setAlpha(a);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.decor?.destroy();
    this.decor = null;
    this.skinned.length = 0;
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.cells.clear();
    this.chunks.clear();
    this.labels.length = 0;
    // 장면을 닫을 때(SHUTDOWN)는 물리 세계가 그룹을 먼저 비운다 → 남아 있을 때만 (예전엔 여기서 멈춰 텍스처가 남았다)
    for (const g of [this.colliders, this.furnitureColliders]) if (g.children) g.clear(true, true);
    const s = this.scene;
    if (s.anims.exists(`${CAMP_TEX_PREFIX}flames`)) s.anims.remove(`${CAMP_TEX_PREFIX}flames`);
    // 11/15 그림(camp- 텍스처)은 지우지 않아요. 다시 올 때 굽지 않게 남겨 둬요 (지우면 다음 여행에서 다시 굽느라 멈췄어요)
  }
}

/** 바닥 덩어리는 이어 붙이는 그림이라 반복할 일이 없다 → CLAMP_TO_EDGE (배율이 소수일 때 가장자리 1px 줄 방지, WorldMap과 같다) */
export function clampEdges(scene: Phaser.Scene, key: string): void {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  const src = scene.textures.get(key).source[0];
  if (src?.glTexture && src.image instanceof HTMLCanvasElement) r.canvasToTexture(src.image, src.glTexture, true, src.flipY);
}

/** 캠핑장 그림 굽는 목록 (CampMap이 장면을 만들 때, 또는 버스 창밖 연출 동안 campPrebake가 조금씩) */
export type CampTexBuild = () => Art.ArtOut | ReturnType<typeof Art.deckArt>;
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
  tex(T.rockSeat, Art.rockSeatArt);
  tex(T.logChair, Art.logChairArt);
  tex(T.bench, Art.benchArt);
  tex(T.rustyBench, Art.rustyBenchArt);
  tex(T.plankBench2, () => Art.plankBenchArt(2));
  tex(T.plankBench3, () => Art.plankBenchArt(3));
  tex(T.table, Art.tableArt);
  for (const d of CAMP_DECKS) tex(T.deck(d.n), () => Art.deckArt(d.n));
  tex(T.office, Art.officeArt);
  tex(T.board, Art.boardArt);
  tex(T.fireRing, Art.fireRingArt);
  tex(T.flames, Art.flamesArt);
  tex(T.bridge, Art.bridgeArt);
  // 문패는 차에 붙은 작은 판 대신 옆에 세운 큰 팻말로 (plateSign)
  CAMP_VANS.forEach((_v, i) => {
    tex(T.van(i, false), () => Art.vanArt(i, false, false));
    tex(T.van(i, true), () => Art.vanArt(i, true, false));
  });
  // 11/15 캠핑카 앞 캠핑 도구·문패 팻말
  tex(T.foldTable, Art.foldTableArt);
  for (let i = 0; i < 3; i++) {
    tex(T.campChairFront(i), () => Art.campChairFrontArt(i));
    tex(T.campChairSide(i), () => Art.campChairSideArt(i));
  }
  tex(T.brazier, Art.brazierArt);
  tex(T.brazierFire, Art.brazierFireArt);
  tex(T.lantern, Art.lanternArt);
  tex(T.icebox, Art.iceboxArt);
  tex(T.plateSign, Art.plateSignArt);
  // 11/15 야외 바베큐장
  tex(T.bbqGrill, Art.bbqGrillArt);
  tex(T.bbqTable, Art.bbqTableArt);
  tex(T.vending, Art.vendingArt);
  tex(T.vendingLit, Art.vendingLitArt);
  tex(T.bbqSmoke, Art.bbqSmokeArt);
  for (const m of BBQ_MENU) tex(T.bbqPlate(m.id), () => Art.bbqPlateArt(m.id));
  tex(T.tarp, Art.tarpArt);
  tex(T.tarpPole, Art.tarpPoleArt);
  tex(T.lookoutFloor, Art.lookoutFloorArt);
  tex(T.lookoutFront, Art.lookoutFrontArt);
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
  tex(T.milkyWay, Art.milkyWayArt, true);
  tex(T.mist, Art.mistArt, true);
  tex(T.sunGlow, () => Art.glowArt(64, 0xffb070, 1.4), true);
  tex(T.sparkle, Art.sparkleArt);
  tex(T.ember, Art.emberArt);
  tex(T.firefly, Art.fireflyArt);
  tex(T.drip, Art.dripArt);
}

/** 11/17 판마다 밤 빛: 크리스마스판은 광장 트리 빛을 더하고, 랜턴·화롯대·창 불빛을 더 따뜻하고 넓게 */
function lightsFor(c: MapConcept): readonly CampLight[] {
  if (c !== "christmas") return Lay.CAMP_LIGHTS;
  return [
    ...Lay.CAMP_LIGHTS.map((l) => ({ ...l, scale: l.scale * 1.18, tint: mix(l.tint, 0xffb060, 0.25), base: Math.min(1, l.base + 0.08) })),
    { x: CAMP_XTREE.x, y: CAMP_XTREE.y - 34, scale: 1.3, tint: 0xffd890, base: 0.8 },
  ];
}
