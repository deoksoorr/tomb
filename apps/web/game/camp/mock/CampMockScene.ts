import * as Phaser from "phaser";
import { DIR, type DirId } from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import { addCanvasTexture, avatarFrame, ensureAvatarTexture, installProcedural, preloadFiles, TEX } from "../../assets/manifest";
import { DEPTH } from "../../config";
import { makeCanvas, mix } from "../../sprites/pixel";
import { seasonKey } from "../../sprites/npcSeasonArt";
import { bulbGlowSheet, christmasTree, giftPile, lightString, lightStringOrigin, snowCap, snowman, snowRoof, woodpile, XTREE_H, XTREE_W } from "../../sprites/winterArt";
import { FONT_KEY, FONT_PX, GlyphAtlas } from "../../text/GlyphAtlas";
import { Atmosphere } from "../../world/Atmosphere";
import { addTwinkle } from "../../world/conceptLights";
import { Lighting } from "../../world/Lighting";
import { addWorldTintBounds, worldTintOf } from "../../world/worldTint";
import * as Art from "../campArt";
import { forEachCampTexture } from "../CampMap";
import { campSkin } from "../CampConceptDecor";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import * as A from "./mockArt";
import * as A3 from "./mockArt3";
import * as A4 from "./mockArt4";
import * as A5 from "./mockArt5";
import * as A6 from "./mockArt6";
import { BOAT_TINTS, boatGeom, boatGrid } from "../../sprites/rideProps";
import { mockGroundColor, mockGroundPixels } from "./mockGround";
import * as L from "./mockLayout";

// 11/21 시안 전용 장면 (app/dev/camp-mock): 폭포 계곡 + 카라반 분양 배치안을 실제 게임 그림(캠핑장 크리스마스판)·
// 하늘빛(Atmosphere)·밤 어둠(Lighting)·이름표(GlyphAtlas) 그대로 그린다. 충돌·서버·좌석은 없다 (보기 전용).
// 움직임(물줄기·거품·물보라·물안개·물결·반짝임)은 모두 3초 주기 시계 하나로 돌려 캡처가 이음매 없이 돈다.

const FLAT = DEPTH.decal;
const OVERHEAD = 90_000;
const LOOP = 3000;
const P = "cmock-";

export type MockOpts = { cx: number; cy: number; zoom: number; labels: boolean; annotate: boolean; changes?: boolean; people: boolean; fish: boolean; concept: MapConcept; levels?: "" | "pension" | "rural" };
type Glint = { img: Phaser.GameObjects.Image; x: number; y: number; ph: number };
type Drop = { img: Phaser.GameObjects.Image; x0: number; y0: number; vx: number; vy: number; s: number; life: number };
type Puff = { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; rise: number; a: number; sc: number };
type Ripple = { img: Phaser.GameObjects.Image; x: number; y: number; ph: number };
type Fleck = { img: Phaser.GameObjects.Image; y0: number; off: number; k: number; range: number };

const hashR = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class CampMockScene extends Phaser.Scene {
  private opts!: MockOpts;
  private concept: MapConcept = "christmas";
  private snowy = true;
  private xmas = true;
  private rare: Phaser.GameObjects.Image[] = [];
  private atlas!: GlyphAtlas;
  private atmos!: Atmosphere;
  private lighting!: Lighting;
  private spots: L.MockLight[] = [];
  private labels: Phaser.GameObjects.GameObject[] = [];
  private falls!: Phaser.GameObjects.Image;
  private fallsGlow!: Phaser.GameObjects.Image;
  private foams: { img: Phaser.GameObjects.Image; fps: number; off: number }[] = [];
  private drops: Drop[] = [];
  private puffs: Puff[] = [];
  private ripples: Ripple[] = [];
  private glints: Glint[] = [];
  private flecks: Fleck[] = [];
  private rainbow!: Phaser.GameObjects.Image;
  private moonGlow!: Phaser.GameObjects.Image;
  private flames: Phaser.GameObjects.Sprite[] = [];
  private night = 0;
  private hour = 12;
  /** 시계 덮어쓰기 (캡처: 정해진 시각으로) */
  clock: number | null = null;
  ready = false;
  /** 앞마당 등급 비교판 (levels=pension|rural) */
  private stage = false;

  constructor() {
    super("campMock");
  }

  init(data: MockOpts): void {
    this.opts = data;
    this.concept = data.concept;
    this.snowy = isSnowy(data.concept);
    this.xmas = data.concept === "christmas";
  }

  preload(): void {
    preloadFiles(this);
  }

  create(): void {
    installProcedural(this);
    this.atlas = new GlyphAtlas(this);
    this.hour = ambienceAt(Date.now(), parseAmbienceOverride(window.location.search)).kstHour;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.MW, L.MH);
    cam.setZoom(this.opts.zoom);
    cam.centerOn(this.opts.cx, this.opts.cy);
    cam.setRoundPixels(true);

    this.makeTextures();
    if (this.opts.levels) {
      this.stage = true;
      this.addLevelStage(this.opts.levels);
      this.finishCreate();
      return;
    }
    this.addGround();
    this.addCliffAndFalls();
    this.addPoolFx();
    this.addTrees();
    this.addPlaza();
    this.addFacilities();
    for (const s of L.SITES) this.addSite(s);
    this.addBridges();
    this.addSmallFire();
    this.addVillage();
    this.addPlayground();
    this.addFishing();
    this.addCampfireZone();
    this.addLamps();
    this.addNpcs();
    if (this.opts.people) this.addPeople();
    if (this.opts.labels) this.addLabels();
    if (this.opts.annotate) this.addAnnotations();
    if (this.opts.changes) this.addChangeNotes();
    if (this.opts.fish) this.addFishMarks();
    this.finishCreate();
  }

  private finishCreate(): void {
    const tint = worldTintOf(this.game);
    if (tint) addWorldTintBounds(this, tint);
    this.atmos = new Atmosphere(this, false, window.location.search, { shaderTint: tint, sound: false });
    this.atmos.setStaticLights(this.spots.map((l) => ({ ...l })));
    this.atmos.setSnowy(this.snowy);
    // 시안 전체 보기(줌 1 등)는 게임 최소 줌보다 멀리 본다: 화면 고정 하늘빛·눈 층이 화면을 다 덮도록 늘린다
    {
      const cam = this.cameras.main;
      const a = this.atmos as unknown as Record<string, Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite | undefined>;
      const need = cam.width / cam.zoom + 64;
      const tint = a.tint as Phaser.GameObjects.Image | undefined;
      const k = tint && tint.displayWidth > 0 ? need / tint.displayWidth : 1;
      if (k > 1)
        for (const name of ["tint", "haze", "flash", "rainFar", "rainMid", "rainNear", "snowFar", "snowMid", "snowNear"]) {
          const o = a[name];
          if (!o) continue;
          if (o instanceof Phaser.GameObjects.TileSprite) o.setSize(Math.ceil(o.width * k), Math.ceil(o.height * k));
          else o.setDisplaySize(o.displayWidth * k, o.displayHeight * k);
        }
    }
    this.lighting = new Lighting(this);
    this.ready = true;
  }

  // ── 텍스처 ──

  private makeTextures(): void {
    forEachCampTexture((key, build, linear) => {
      if (this.textures.exists(key)) return;
      const out = build();
      const a: Art.ArtOut = "grid" in out ? out : { grid: out };
      addCanvasTexture(this, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
    });
    const add = (key: string, canvas: HTMLCanvasElement, frameW?: number, frameH?: number, linear = false) => {
      if (!this.textures.exists(key)) addCanvasTexture(this, key, { canvas, frameW, frameH, linear });
    };
    add(`${P}cliff`, A.cliffArt(this.snowy).toCanvas());
    const fs = A.fallsSheet(this.snowy);
    add(`${P}falls`, fs.grid.toCanvas(), fs.frameW, fs.frameH);
    const plunge = A.foamSheet(136, 36, 3, 1.25);
    add(`${P}foamPlunge`, plunge.grid.toCanvas(), plunge.frameW, plunge.frameH);
    const ledge = A.foamSheet(64, 14, 7, 1.3);
    add(`${P}foamLedge`, ledge.grid.toCanvas(), ledge.frameW, ledge.frameH);
    const small = A.foamSheet(18, 8, 11, 1);
    add(`${P}foamSmall`, small.grid.toCanvas(), small.frameW, small.frameH);
    add(`${P}drop`, A.dropArt().toCanvas());
    add(`${P}ripple`, A.rippleArt().toCanvas());
    add(`${P}rainbow`, A.rainbowArt().toCanvas(), undefined, undefined, true);
    add(`${P}vbridge`, (this.snowy ? A.snowDust(A.viewBridgeArt(), 0.36, 5) : A.viewBridgeArt()).toCanvas());
    add(`${P}hookup`, this.sc(A.hookupArt().toCanvas(), 12));
    for (let v = 0; v < 2; v++) add(`${P}shrub${v}`, A.ledgeShrubArt(v, this.snowy).toCanvas());
    add(`${P}saleStand`, this.sc(A.saleStandArt().toCanvas(), 20));
    for (const n of [12, 18]) add(`${P}edgeLog${n}`, this.sc(A.edgeLogArt(n).toCanvas(), 5));
    add(`${P}fish`, A.fishMarkArt().toCanvas());
    add(`${P}lamp`, this.sc(A.lampPostArt().toCanvas(), 20));
    add(`${P}woodpile`, woodpile());
    for (let v = 0; v < 3; v++) add(`${P}snowman${v}`, snowman(v));
    for (let v = 0; v < 2; v++) add(`${P}gifts${v}`, giftPile(v));
    const xt = christmasTree();
    add(`${P}xtree`, xt.canvas);
    add(`${P}xtreeGlow`, bulbGlowSheet(XTREE_W, XTREE_H, xt.bulbs, xt.star), XTREE_W, XTREE_H);
    this.xstar = xt.star;
  }
  private xstar = { x: 0, y: 0 };

  /** 겨울·크리스마스 판이면 윗면에 눈 (일반 판은 그대로) */
  private sc(c: HTMLCanvasElement, maxY: number): HTMLCanvasElement {
    return this.snowy ? snowCap(c, { depth: 1, maxY }) : c;
  }

  /** 카라반 텍스처 (지붕 눈 + 고드름 — 캠핑카와 같은 snowRoof) */
  private caravanKey(kind: L.CaravanKind, color: number): { key: string; art: A.CaravanArt } {
    const art = kind === "teardrop" ? A.teardropArt(color) : kind === "airstream" ? A.airstreamArt(color) : A.busCamperArt(color);
    const key = `${P}cv-${kind}${color}`;
    if (!this.textures.exists(key)) {
      const c = this.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 149 + color }) : art.grid.toCanvas();
      addCanvasTexture(this, key, { canvas: c });
    }
    return { key, art };
  }

  private skin(base: string): string {
    return campSkin(this, base, this.concept);
  }

  private prop(key: string, x: number, y: number, depth = y, lift = 2): Phaser.GameObjects.Image {
    return this.add.image(x, y + lift, key).setOrigin(0.5, 1).setDepth(depth);
  }

  // ── 바닥 ──

  private addGround(): void {
    const CH = 512;
    for (let cy = 0; cy < Math.ceil(L.MH / CH); cy++)
      for (let cx = 0; cx < Math.ceil(L.MW / CH); cx++) {
        const key = `${P}ground-${cx}-${cy}`;
        if (!this.textures.exists(key)) {
          const { canvas, ctx } = makeCanvas(CH, CH);
          ctx.putImageData(new ImageData(mockGroundPixels(cx, cy, CH, this.snowy) as unknown as Uint8ClampedArray<ArrayBuffer>, CH, CH), 0, 0);
          addCanvasTexture(this, key, { canvas });
        }
        this.add.image(cx * CH, cy * CH, key).setOrigin(0, 0).setDepth(DEPTH.ground);
      }
  }

  // ── 폭포 ──

  private addCliffAndFalls(): void {
    const B = A.CLIFF_BOX;
    this.add.image(B.x, B.y, `${P}cliff`).setOrigin(0, 0).setDepth(FLAT + 4000);
    // 덩이 윗면에 선 눈 덮인 침엽수·덤불 (회색 벽을 끊고 층이 보이게)
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
      const m = L.MASSES.find((q) => q.id === id)!;
      const y = L.massCap(m, x) + m.thick - 2;
      const key = v === 2 ? `${P}shrub${x % 2}` : this.skin(v ? T.fir(x % 2) : T.spruce(x % 2));
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
    }
    // 6차: 절벽 양 끝 밑동 돌무더기 (가는 꼬리 대신 땅에 내려앉게)
    for (const r of L.SCREE) {
      const k = this.tex3(`${P}scree${r.seed}`, () => A6.screeArt(r.seed, this.snowy, !this.snowy).toCanvas());
      this.add.image(r.x, r.y + 2, k).setOrigin(0.5, 1).setDepth(r.y).setFlipX(r.flip);
    }
    const F = A.FALLS_BOX;
    this.falls = this.add.image(F.x, F.y, `${P}falls`, 0).setOrigin(0, 0).setDepth(FLAT + 4100);
    // 밤: 달빛에 물줄기가 은은히 빛난다 (같은 그림을 더하기로 한 겹 더)
    this.fallsGlow = this.add.image(F.x, F.y, `${P}falls`, 0).setOrigin(0, 0).setDepth(DEPTH.lights + 2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.moonGlow = this.add.image(L.FALL_X, 170, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9cc8ff).setDepth(DEPTH.lights + 1).setScale(1.6, 2.2).setAlpha(0);
    // 거품: 선반 위 · 웅덩이에 떨어지는 자리 (두 갈래 따로) · 가는 줄기 끝
    const foam = (key: string, x: number, y: number, fps: number, off: number, depth = FLAT + 4200) => {
      const img = this.add.image(x, y, key, 0).setOrigin(0.5, 0.5).setDepth(depth);
      this.foams.push({ img, fps, off });
      return img;
    };
    foam(`${P}foamLedge`, 640, L.KNOB.y - L.KNOB.ry + 1, 8, 0);
    foam(`${P}foamPlunge`, L.PLUNGE.x, L.PLUNGE.y - 2, 8, 2);
    foam(`${P}foamSmall`, 523, 214, 8, 3);
    foam(`${P}foamSmall`, 668, 207, 8, 1);
    if (!this.snowy) foam(`${P}foamSmall`, 781, 212, 8, 4);
  }

  private addPoolFx(): void {
    // 물결 고리 (폭포 앞으로 퍼진다)
    for (let i = 0; i < 4; i++) {
      const img = this.add.image(0, 0, `${P}ripple`).setDepth(FLAT + 3500).setAlpha(0);
      this.ripples.push({ img, x: L.PLUNGE.x + (i % 2 ? -1 : 1) * (14 + hashR(i, 1) * 30), y: L.PLUNGE.y + 20 + hashR(i, 2) * 8, ph: i / 4 });
    }
    // 물보라 (폭포가 떨어지는 자리 + 선반)
    for (let i = 0; i < 46; i++) {
      const ledge = i >= 38;
      const img = this.add.image(0, 0, `${P}drop`).setDepth(OVERHEAD - 6).setVisible(false);
      const x0 = ledge ? 640 + (hashR(i, 3) - 0.5) * 50 : L.PLUNGE.x + (hashR(i, 3) - 0.5) * 86;
      this.drops.push({
        img,
        x0,
        y0: ledge ? L.KNOB.y - 8 : L.PLUNGE.y - 6 + hashR(i, 4) * 8,
        vx: (x0 - (ledge ? 640 : L.PLUNGE.x)) * 0.9 + (hashR(i, 5) - 0.5) * 24,
        vy: -(ledge ? 22 : 44) - hashR(i, 6) * (ledge ? 20 : 46),
        s: hashR(i, 7),
        life: 520 + hashR(i, 8) * 520,
      });
    }
    // 물안개 (떨어지는 자리에서 천천히 피어오른다)
    for (let i = 0; i < 9; i++) {
      const img = this.add.image(0, 0, Art.CAMP_TEX.mist).setDepth(OVERHEAD - 8).setAlpha(0);
      this.puffs.push({ img, x: L.PLUNGE.x + (hashR(i, 9) - 0.5) * 110, y: L.PLUNGE.y + 6 + hashR(i, 10) * 10, ph: i / 9, rise: 16 + hashR(i, 11) * 22, a: 0.42 + hashR(i, 12) * 0.25, sc: 0.75 + hashR(i, 13) * 0.6 });
    }
    // 무지개 (낮, 물안개 오른쪽 앞)
    this.rainbow = this.add.image(L.PLUNGE.x + 62, L.PLUNGE.y + 30, `${P}rainbow`).setOrigin(0.5, 1).setScale(0.5, 0.56).setDepth(OVERHEAD - 9).setAlpha(0);
    // 물 반짝임 (웅덩이·계곡)
    for (let i = 0; i < 34; i++) {
      let x = 0;
      let y = 0;
      if (i < 16) {
        const a = hashR(i, 14) * Math.PI * 2;
        const d = 0.25 + hashR(i, 15) * 0.6;
        x = L.POOL.x + Math.cos(a) * L.POOL.rx * d;
        y = L.POOL.y + 8 + Math.sin(a) * L.POOL.ry * d * 0.8;
      } else {
        y = 350 + hashR(i, 16) * 440;
        x = L.streamX(y) + (hashR(i, 17) - 0.5) * 18;
      }
      const img = this.add.image(Math.round(x), Math.round(y), Art.CAMP_TEX.sparkle).setDepth(FLAT + 3600).setAlpha(0);
      this.glints.push({ img, x, y, ph: hashR(i, 18) });
    }
    // 웅덩이 희귀 물고기 자리: 가끔 한 군데서 반짝반짝 (UI 없음 — 눈썰미 좋은 사람만)
    for (let i = 0; i < 3; i++) this.rare.push(this.add.image(L.RARE_GLINT.x + [-5, 4, 0][i], L.RARE_GLINT.y + [0, 2, -3][i], Art.CAMP_TEX.sparkle).setDepth(FLAT + 3610).setAlpha(0));
    // 계곡 물살 거품 조각 (물을 따라 흘러내린다)
    for (let i = 0; i < 22; i++) {
      const img = this.add.image(0, 0, `${P}drop`).setDepth(FLAT + 3600).setScale(1, 0.5).setAlpha(0.85);
      this.flecks.push({ img, y0: hashR(i, 19), off: (hashR(i, 20) - 0.5) * 22, k: 1 + Math.floor(hashR(i, 21) * 2), range: 470 });
    }
  }

  // ── 나무·바위 ──

  private addTrees(): void {
    const T = Art.CAMP_TEX;
    for (const t of L.TREES) {
      const v = t.v % 2;
      const key = t.kind === "spruce" ? T.spruce(v) : t.kind === "pine" ? T.pine(v) : t.kind === "fir" ? T.fir(v) : t.kind === "maple" ? T.maple(v) : t.kind === "mapleO" ? T.mapleO(v) : t.kind === "yellow" ? T.yellow(v) : T.bush(v);
      this.prop(this.skin(key), t.x, t.y);
    }
    for (const d of L.DECOR) {
      const key = d.kind === "leafPile" ? T.leafPile(d.v) : d.kind === "mushroom" ? T.mushroom(d.v) : d.kind === "fern" ? T.fern(d.v) : T.pebbles(d.v);
      this.prop(this.skin(key), d.x, d.y, FLAT + d.y, 1);
    }
    for (const r of L.ROCKS) {
      if (Math.abs(r.x - L.FALL_X) < 74 && r.y < L.POOL.y) continue;
      this.prop(this.skin(T.boulder(r.v)), r.x, r.y).setScale(r.s, r.s * (0.8 + (r.x % 5) * 0.06)).setFlipX(r.x % 3 === 0);
    }
  }

  // ── 큰 모닥불 광장 (왼쪽 가운데) ──

  private addPlaza(): void {
    const T = Art.CAMP_TEX;
    const F = L.FIRE;
    this.prop(T.fireRing, F.x, F.y, F.y, 13);
    if (!this.anims.exists(`${P}flames`)) this.anims.create({ key: `${P}flames`, frames: Array.from({ length: Art.FLAME_FRAMES }, (_, i) => ({ key: T.flames, frame: i })), frameRate: 9, repeat: -1 });
    this.flames.push(this.add.sprite(F.x, F.y + 3, T.flames, 0).setOrigin(0.5, 1).setDepth(F.y + 1).play(`${P}flames`));
    for (const s of L.LOG_SEATS) this.prop(T.logChair, s.x, s.y);
    // 트리 (광장 위쪽) + 전구 빛 + 별
    const X = L.XTREE_AT;
    if (this.xmas) {
      this.add.image(X.x, X.y + 1, `${P}xtree`).setOrigin(0.5, 1).setDepth(X.y);
      addTwinkle(this, `${P}xtreeGlow`, X.x, X.y + 1, 0.5, 1, { reduced: false });
      const halo = this.add.image(X.x - XTREE_W / 2 + this.xstar.x, X.y + 1 - XTREE_H + this.xstar.y + 1, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe08a).setScale(0.55).setAlpha(0.6).setDepth(DEPTH.lights + 3);
      this.tweens.add({ targets: halo, alpha: { from: 0.35, to: 0.85 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    // 조명 기둥 + 기둥을 잇는 전구 줄
    const tops = L.LIGHT_POLES.map((p) => {
      this.prop(this.skin(T.pole), p.x, p.y);
      return [p.x, p.y - 34, p.y] as const;
    });
    tops.forEach((a, i) => (this.xmas ? this.addString(a, tops[(i + 1) % tops.length], i) : this.addWarmString(a, tops[(i + 1) % tops.length], i)));
    this.spots.push({ x: F.x, y: F.y - 16, scale: 3.6 * 1.18, tint: mix(0xffa048, 0xffb060, 0.25), base: 1 });
    if (this.xmas) this.spots.push({ x: X.x, y: X.y - 34, scale: 1.3, tint: 0xffd890, base: 0.8 });
    for (const p of L.LIGHT_POLES) this.spots.push({ x: p.x, y: p.y - 34, scale: 0.7, tint: 0xffcf78, base: 0.5 });
    // 장작더미·눈사람·선물 (광장 둘레)
    if (this.snowy) this.prop(`${P}woodpile`, F.x - 112, F.y - 44);
    if (this.xmas) {
      this.prop(`${P}snowman0`, F.x + 128, F.y + 74);
      this.prop(`${P}gifts0`, X.x + 22, X.y + 4);
    }
  }

  /** 일반·겨울 판 줄 조명 (CampMap.addStrings처럼 전선 + 따뜻한 전구, 밤에 번진다) */
  private addWarmString(a: readonly [number, number, number], b: readonly [number, number, number], i: number): void {
    const g = this.add.graphics().setDepth(Math.max(a[2], b[2]) + 2);
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
      this.add.image(p.x, p.y + 1, Art.CAMP_TEX.bulb).setOrigin(0.5, 0).setDepth(Math.max(a[2], b[2]) + 3).setTint(this.isNight() ? 0xfff4c8 : 0x8a7a60);
      if (this.isNight()) this.add.image(p.x, p.y + 3, Art.CAMP_TEX.bulbGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1).setAlpha(0.75 + 0.1 * Math.sin(i + k));
    }
  }

  /** 폭포 다리 앞 작은 모닥불 (통나무 넷, 폭포를 마주 본다) */
  private addSmallFire(): void {
    const T = Art.CAMP_TEX;
    const F = L.SMALL_FIRE;
    this.prop(T.fireRing, F.x, F.y, F.y, 8).setScale(0.62);
    this.flames.push(this.add.sprite(F.x, F.y + 2, T.flames, 1).setOrigin(0.5, 1).setScale(0.62).setDepth(F.y + 1).play(`${P}flames`));
    for (const p of L.SMALL_SEATS) this.prop(T.logChair, p.x, p.y);
    this.spots.push({ x: F.x, y: F.y - 10, scale: 1.9, tint: 0xffa048, base: 1 });
  }

  /** 두 기둥 머리를 잇는 전구 줄 (CampConceptDecor.addString과 같다) */
  private addString(a: readonly [number, number, number], b: readonly [number, number, number], i: number): void {
    const dx = Math.round(b[0] - a[0]);
    const dy = Math.round(b[1] - a[1]);
    const sag = Math.max(5, Math.round(Math.hypot(dx, dy) * 0.09));
    const key = `${P}string-${dx}-${dy}-${sag}`;
    if (!this.textures.exists(key)) {
      const s = lightString(dx, dy, sag);
      addCanvasTexture(this, key, { canvas: s.canvas });
      addCanvasTexture(this, `${key}~glow`, { canvas: bulbGlowSheet(s.canvas.width, s.canvas.height, s.bulbs), frameW: s.canvas.width, frameH: s.canvas.height });
    }
    const o = lightStringOrigin(dx, dy);
    const x = a[0] - o.ox;
    const y = a[1] - o.oy;
    const depth = Math.max(a[2], b[2]) + 2;
    this.add.image(x, y, key).setOrigin(0, 0).setDepth(depth);
    addTwinkle(this, `${key}~glow`, x, y, 0, 0, { reduced: false, phase: i % 2, alpha: 0.9 });
  }

  // ── 정류장·관리소·바베큐·타프·전망대 ──

  private addFacilities(): void {
    const T = Art.CAMP_TEX;
    // 관리소·매점 (그대로) + 굴뚝 연기
    this.prop(this.skin(T.office), L.OFFICE.x, L.OFFICE.y, L.OFFICE.y, 3);
    this.prop(this.skin(T.board), L.BOARD_SPOT.x, L.BOARD_SPOT.y);
    // 정류장 (그대로)
    this.prop(this.skin(T.shelter), L.BUS_STOP.x, L.BUS_STOP.y, L.BUS_STOP.y - 9);
    this.prop(this.skin(T.busSign), 200, 628);
    this.prop(this.skin(T.timetable), 102, 626);
    this.prop(this.skin(T.bench), 300, 708);
    // 관리소 문 앞 「카라반 분양」 입간판 (분양은 관리소 사장 언젠가 씨가 받는다)
    this.prop(`${P}saleStand`, L.SALE_BOARD.x, L.SALE_BOARD.y);
    if (this.xmas) this.prop(`${P}gifts1`, 250, 604);
    // 바베큐장 (오른쪽 가운데)
    const B = L.BBQ;
    this.prop(T.bbqGrill, B.grill.x, B.grill.y);
    this.prop(this.skin(T.bbqTable), B.table.x, B.table.y);
    // 6차: 자판기는 모두 달그늘 소 오른쪽 둑으로 (빨강 = 음료 · 파랑 = 따뜻한 커피 · 초록 = 간식) — 동쪽 길을 보고 나란히
    const vcol: [number, number, number, number][] = [
      [0xc8343a, 0xe0565a, 0x9a2228, 0xe86a6a],
      [0x3a6ab0, 0x5a8ad0, 0x284c88, 0x7aa0e0],
      [0x3a8a5a, 0x5aaa78, 0x286a40, 0x78c090],
    ];
    const red = vcol[0];
    for (const [i, v] of L.VENDING_ROW.entries()) {
      const key = this.tex3(`${P}vend6-${i}`, () => {
        const base = this.textures.get(T.vending).getSourceImage() as HTMLCanvasElement;
        const c = A3.recolorCanvas(base, (r, g, b) => {
          const k = red.indexOf((r << 16) | (g << 8) | b);
          if (k < 0) return null;
          const n = vcol[i][k];
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        });
        return this.sc(c, 30);
      });
      this.prop(key, v.x, v.y);
      this.add.image(v.x, v.y + 2, T.vendingLit).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(v.y + 0.1).setAlpha(this.isNight() ? 0.85 : 0.15);
      this.spots.push({ x: v.x, y: v.y - 16, scale: 0.6, tint: 0xc8ecff, base: 0.85 });
    }
    if (this.snowy) this.prop(`${P}woodpile`, B.area.x + 14, B.area.y + 12);
    // 밤 빛 (지금 캠핑장 크리스마스판과 같은 세기)
    const warm = (l: L.MockLight): L.MockLight => (this.xmas ? { ...l, scale: l.scale * 1.18, tint: mix(l.tint, 0xffb060, 0.25), base: Math.min(1, l.base + 0.08) } : l);
    const O = L.OFFICE;
    this.spots.push(
      ...[
        { x: O.x - 56, y: O.y - 22, scale: 0.6, tint: 0xffd890, base: 0.75 },
        { x: O.x - 20, y: O.y - 30, scale: 0.45, tint: 0xffc070, base: 0.8 },
        { x: O.x + 44, y: O.y - 22, scale: 0.8, tint: 0xffe0a0, base: 0.85 },
        { x: L.BUS_STOP.x, y: L.BUS_STOP.y - 40, scale: 0.85, tint: 0xfff0c8, base: 0.85 },
        { x: 102, y: 608, scale: 0.4, tint: 0xd8f0ff, base: 0.6 },
        { x: B.grill.x, y: B.grill.y - 12, scale: 1.1, tint: 0xff8a40, base: 0.9 },
      ].map(warm),
    );
    // 폭포 달빛 (차가운 빛 — 밤에도 물줄기가 보이게)
    this.spots.push({ x: L.FALL_X, y: 120, scale: 1.8, tint: 0xa8ccff, base: 0.3 }, { x: L.PLUNGE.x, y: L.PLUNGE.y, scale: 2.0, tint: 0xb8d8ff, base: 0.28 });
  }

  // ── 카라반 자리 ──

  private addSite(s: L.Site): void {
    const T = Art.CAMP_TEX;
    const top = s.y - L.SITE_H / 2;
    const flip = s.side === 1; // 오른쪽 둑은 문이 왼쪽(계곡 쪽)으로
    const toward = -s.side; // 계곡 쪽 x 방향
    const front = s.row === "front";
    // 번호 말뚝: 자리 앞, 길 쪽 모서리 (물가 앞줄 = 물빛 번호판, 숲 뒷줄 = 나무색)
    const postX = s.x + toward * (L.SITE_W / 2 - 8);
    const postY = s.y + L.SITE_H / 2 - 4;
    this.prop(`${P}hookup`, s.x - toward * (L.SITE_W / 2 - 9), top + 18);
    // 테두리 대신 군데군데 놓인 경계: 뒤쪽 통나무 하나 + 모서리 자갈
    this.prop(`${P}edgeLog${s.n % 2 ? 18 : 12}`, s.x + toward * 14, top + 6, FLAT + top);
    this.prop(this.skin(T.pebbles(s.n % 3)), s.x - toward * (L.SITE_W / 2 - 6), s.y + L.SITE_H / 2 - 8, FLAT + s.y, 1);
    this.prop(this.skin(T.pebbles((s.n + 1) % 3)), s.x + toward * (L.SITE_W / 2 - 4), top + 22, FLAT + s.y, 1);
    if (!s.kind) {
      const k = `${P}post-sale-${s.n}`;
      if (!this.textures.exists(k)) addCanvasTexture(this, k, { canvas: this.sc(A.sitePostArt(s.n, true, front).toCanvas(), 26) });
      this.prop(k, s.x, s.y + 6);
      const rk = `${P}plotRope`;
      if (!this.textures.exists(rk)) addCanvasTexture(this, rk, { canvas: A.plotRopeArt(L.SITE_W - 12, L.SITE_H - 12).toCanvas() });
      this.add.image(s.x, s.y + L.SITE_H / 2 - 4, rk).setOrigin(0.5, 1).setDepth(s.y + L.SITE_H / 2 - 6);
      if (this.opts.labels) this.label(s.x, s.y - 22, front ? "분양 중 · 물가 자리" : "분양 중 · 숲 자리", front ? 0xbfe6ff : 0xffe6a0, 0.95);
      return;
    }
    const k = `${P}post-${s.n}`;
    if (!this.textures.exists(k)) addCanvasTexture(this, k, { canvas: this.sc(A.sitePostArt(s.n, false, front).toCanvas(), 18) });
    this.prop(k, postX, postY);
    const { key, art } = this.caravanKey(s.kind, s.color);
    const cy = s.y - 4;
    const cx = s.x - toward * 4;
    this.prop(key, cx, cy, cy, 0).setFlipX(flip);
    const doorX = cx + (flip ? -1 : 1) * (art.door.x - art.grid.w / 2);
    const aw = `${P}awning${s.n % 4}`;
    if (!this.textures.exists(aw)) addCanvasTexture(this, aw, { canvas: this.sc(A.awningArt(s.n % 4).toCanvas(), 14) });
    const awX = Math.round(Math.max(s.x - L.SITE_W / 2 + 24, Math.min(s.x + L.SITE_W / 2 - 24, doorX)));
    if (s.kind !== "teardrop") this.prop(aw, awX, cy + 22, cy + 22, 0);
    const ci = s.n % 3;
    const yardY = cy + 22;
    const tx = s.x + toward * 6;
    this.prop(this.skin(T.foldTable), tx, yardY);
    this.prop(T.lantern, tx + 6, yardY - 8, yardY + 1, 0);
    this.prop(this.skin(T.campChairSide(ci)), tx - 16, yardY + 1, yardY - 1);
    this.prop(this.skin(T.campChairSide(ci)), tx + 16, yardY + 1, yardY - 1).setFlipX(true);
    if (s.n % 2 === 1) {
      const bx = s.x - toward * 26;
      this.prop(T.brazier, bx, yardY + 6);
      if (!this.anims.exists(`${P}brazier`)) this.anims.create({ key: `${P}brazier`, frames: Array.from({ length: 3 }, (_, i) => ({ key: T.brazierFire, frame: i })), frameRate: 7, repeat: -1 });
      this.flames.push(this.add.sprite(bx, yardY + 1, T.brazierFire, 0).setOrigin(0.5, 1).setDepth(yardY + 6.5).play({ key: `${P}brazier`, startFrame: s.n % 3 }));
      this.spots.push({ x: bx, y: yardY - 4, scale: 1.0 * 1.18, tint: 0xff9a48, base: 0.95 });
    } else {
      this.prop(this.skin(T.icebox), s.x - toward * 26, yardY + 4);
    }
    if (this.xmas && s.n % 4 === 0) this.prop(`${P}snowman${s.n % 3}`, s.x - toward * 30, top + 14);
    for (const w of art.windows) {
      const wx = cx + (flip ? -1 : 1) * (w.x - art.grid.w / 2);
      const wy = cy - (art.grid.h - w.y);
      this.spots.push({ x: wx, y: wy, scale: 0.5, tint: 0xffb060, base: 0.7 });
    }
    this.spots.push({ x: tx + 6, y: yardY - 14, scale: 0.55 * 1.18, tint: 0xffd890, base: 0.88 });
    const owners: Record<number, string> = { 1: "콩이네", 4: "별바라기네", 7: "언젠가 씨네", 10: "강태공네", 2: "달빛캠퍼", 9: "눈사람클럽", 6: "새벽물소리", 11: "모닥불러" };
    if (this.opts.labels && owners[s.n]) this.label(cx, cy - art.grid.h - 2, owners[s.n], 0xffe8b0, 0.9);
  }

  // ── 다리·징검다리 ──

  // ── 5차: 소슬 펜션 마을 (펜션 2 + 촌캉스 2, 둘레 울타리 없음, 집마다 앞마당 등급) ──

  private tex3(key: string, make: () => HTMLCanvasElement): string {
    if (!this.textures.exists(key)) addCanvasTexture(this, key, { canvas: make() });
    return key;
  }

  private smoke(x: number, y: number, depth: number, o: { freq?: number; alpha?: number; scale?: number; tint?: number } = {}): void {
    this.add
      .particles(x, y, Art.CAMP_TEX.bbqSmoke, {
        lifespan: { min: 2600, max: 3600 },
        speedX: { min: 1, max: 6 },
        speedY: { min: -12, max: -7 },
        scale: { start: 0.4 * (o.scale ?? 1), end: 1.5 * (o.scale ?? 1) },
        alpha: { start: o.alpha ?? 0.42, end: 0 },
        frequency: o.freq ?? 760,
        tint: o.tint ?? 0xffffff,
      })
      .setDepth(depth);
  }

  private addVillage(): void {
    for (const h of L.HOMES) this.drawHome(h, h.x0, h.y0, h.lv, !!h.owner, true);
    // 입구 아치 (울타리 없이 길 위에 홀로 선 마을 표지)
    const G = L.PENSION_GATE;
    this.prop(this.tex3(`${P}arch`, () => this.sc(A3.archArt(this.xmas).toCanvas(), 12)), G.x, G.y + 2);
    this.atlas.ensure("소슬 펜션 마을");
    this.add.bitmapText(G.x, G.y - 30, FONT_KEY, "소슬 펜션 마을", FONT_PX).setOrigin(0.5, 0.5).setTint(0x5a3018).setScale(0.42).setDepth(G.y + 3);
    this.spots.push({ x: G.x - 22, y: G.y - 24, scale: 0.5, tint: 0xffd890, base: 0.7 }, { x: G.x + 22, y: G.y - 24, scale: 0.5, tint: 0xffd890, base: 0.7 });
    // 펜션 사장님 「소슬댁」 + 「펜션 분양」 안내판
    const H = L.PENSION_HOST;
    const hk = this.tex3(`${P}host`, () => {
      const a = Art.npcArt("granny", this.concept);
      return A3.recolorCanvas(a.grid.toCanvas(), (r, g, b) => {
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        if (mx - mn < 40) return null;
        if (r > g && r > b && g < 120 && r > 140) return [Math.round(r * 0.55), Math.round(g * 0.9 + 40), Math.round(b * 0.6 + 60)];
        if (b > r && b > g) return [Math.round(b * 0.95), Math.round(g * 0.7), Math.round(r * 0.6 + 40)];
        return null;
      });
    });
    const htex = this.textures.get(hk);
    if (!htex.has("0")) htex.add(0, 0, 0, 0, Art.NPC_W, Art.NPC_H);
    this.add.image(H.x, H.y + 1, hk, 0).setOrigin(0.5, 1).setDepth(H.y);
    if (this.opts.labels) this.label(H.x, H.y - Art.NPC_H + 2, "소슬댁 · 펜션 사장님", 0xffe8b0, 1, 1, DEPTH.labels - 1);
    // 7차: 촌캉스 분양 「순이 할머니」 (감나무집 대문 옆)
    {
      const r1 = L.HOMES.find((h) => h.id === "r1")!;
      const gx = r1.x0 + (L.RURAL_PLAN.wide.gate.a + L.RURAL_PLAN.wide.gate.b) / 2 + 24;
      const gy = r1.y0 + L.fpOf(r1).h + 10;
      const sk = this.tex3(`${P}sooni${this.snowy ? 1 : 0}`, () => A6.sooniArt(this.snowy).toCanvas());
      this.add.image(gx, gy + 1, sk).setOrigin(0.5, 1).setDepth(gy);
      if (this.opts.labels) this.label(gx, gy - 30, "순이 할머니 · 촌캉스 분양", 0xffe8b0, 1, 1, DEPTH.labels - 1);
    }
    this.prop(this.tex3(`${P}penStand`, () => this.sc(A3.pensionStandArt().toCanvas(), 20)), L.PENSION_SALE_SIGN.x, L.PENSION_SALE_SIGN.y);
    if (this.opts.labels) this.label(L.PENSION_SALE_SIGN.x, L.PENSION_SALE_SIGN.y - 26, "펜션 분양", 0xffe6a0, 0.95);
  }

  private drawHome(h: L.Home, x0: number, y0: number, lv: L.YardLv, lit: boolean, labels: boolean): void {
    if (h.kind === "pension") this.drawPension(h, x0, y0, lv, lit, labels);
    else this.drawRural(h, x0, y0, lv, lit, labels);
  }

  /** 펜션: 집채 + 높인 테라스 · Lv1 4인 식탁 / Lv2 + 파라솔·그릴 / Lv3 + 온수 스파·줄조명 */
  private drawPension(h: L.Home, x0: number, y0: number, lv: L.YardLv, lit: boolean, labels: boolean): void {
    const T = Art.CAMP_TEX;
    const PL = L.PENSION_PLAN[h.size];
    const px = x0 + PL.px;
    const py = y0 + PL.deckFront;
    const furn = (key: string, make: () => HTMLCanvasElement, x: number, y: number, depth = y) => this.prop(this.tex3(key, () => this.sc(make(), 999)), x, y, depth);
    const td = A4.TERRACE[h.size];
    const deckTop = py - td.d;
    const art = A4.houseArt(h.size, h.roof, lit, this.xmas, h.v);
    const hk = this.tex3(`${P}house-${h.size}-${h.roof}-${h.v}-${lit ? 1 : 0}`, () => (this.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 171 + h.roof }) : art.grid.toCanvas()));
    this.add.image(px, deckTop + 6, hk).setOrigin(0.5, 1).setDepth(deckTop + 2);
    const ox = px - art.grid.w / 2;
    const oy = deckTop + 6 - art.grid.h;
    this.atlas.ensure(h.name);
    const t = this.add.bitmapText(ox + art.board.x, oy + art.board.y, FONT_KEY, h.name, FONT_PX).setOrigin(0.5, 0.5).setTint(0xfff0c8).setDepth(deckTop + 3);
    t.setScale(Math.min(0.5, 16 / Math.max(1, t.width)));
    const tk = this.tex3(`${P}terrace-${h.size}`, () => (this.snowy ? A.snowDust(A4.terraceArt(h.size), 0.3, 7) : A4.terraceArt(h.size)).toCanvas());
    this.add.image(px, deckTop - 2, tk).setOrigin(0.5, 0).setDepth(deckTop + 4);
    const half = td.w / 2;
    // 7차: 2단 데크 (Lv2부터) · 넓은 집(스파·테라스형)은 통유리 난간 (계단 자리 비움)
    const spaStyle = h.size === "wide";
    if (lv >= 2) {
      const lw = td.w + 6;
      const lk = this.tex3(`${P}lowDeck-${lw}`, () => (this.snowy ? A.snowDust(A6.lowerDeckArt(lw, 12), 0.3, 11) : A6.lowerDeckArt(lw, 12)).toCanvas());
      this.add.image(px, py - 1, lk).setOrigin(0.5, 0).setDepth(FLAT + 14);
      if (spaStyle) {
        const rl = Math.round(half - 12);
        const rk = this.tex3(`${P}glassRail-${rl}`, () => A6.glassRailArt(rl).toCanvas());
        this.add.image(px - half + 2, py - 10, rk).setOrigin(0, 0).setDepth(py + 1);
        this.add.image(px + 10, py - 10, rk).setOrigin(0, 0).setDepth(py + 1);
      }
      furn(`${P}pot${(h.n + 2) % 3}`, () => A4.potArt(h.n + 2).toCanvas(), px - half - 1, py + 10);
      furn(`${P}pot${h.n % 3}`, () => A4.potArt(h.n).toCanvas(), px + half + 1, py + 10);
    }
    // Lv1: 4인 식탁 (데크 왼쪽)
    furn(`${P}dine-${h.roof % 4}`, () => A5.diningSetArt(h.roof).toCanvas(), px + PL.dine, deckTop + 28);
    furn(`${P}pot${h.n % 3}`, () => A4.potArt(h.n).toCanvas(), px - half + 6, deckTop + 9);
    // Lv2: 파라솔 탁자 (2자리) + 옆마당 바비큐 그릴 (연기)
    if (lv >= 2) {
      furn(`${P}tset-${h.roof % 3}`, () => A4.tableSetArt(h.roof, true).toCanvas(), px + PL.parasol, deckTop + 29);
      const gx = x0 + PL.grill.x;
      const gy = y0 + PL.grill.y;
      if (spaStyle) furn(`${P}swing`, () => A4.swingBenchArt().toCanvas(), gx, gy + 4);
      else furn(`${P}bbqStation`, () => A6.bbqStationArt().toCanvas(), gx - 6, gy + 2);
      if (lit && !spaStyle) {
        this.smoke(gx + 4, gy - 16, gy + 2, { freq: 480, alpha: 0.5, scale: 0.8 });
        this.spots.push({ x: gx, y: gy - 10, scale: 0.6, tint: 0xff8a40, base: 0.8 });
      }
    } else furn(`${P}pot${(h.n + 1) % 3}`, () => A4.potArt(h.n + 1).toCanvas(), px + 14, py - 6);
    // 데크 앞 모서리 등 기둥 둘
    const lpL = px - half + 3;
    const lpR = px + half - 3;
    for (const lx of [lpL, lpR]) {
      this.prop(`${P}lamp`, lx, py - 2);
      this.spots.push({ x: lx, y: py - 22, scale: 0.6, tint: 0xffd28a, base: 0.85 });
    }
    // Lv3: 온수 스파 (김) + 줄조명 (데크 앞 + 스파 위 장대)
    if (lv >= 3 && !spaStyle) {
      // 바비큐형 Lv3: 화로대 불멍(통나무 의자 2) + 해먹 + 데크 앞 줄조명
      const fx = x0 + 96;
      const fy = y0 + 88;
      furn(`${P}firepit-1`, () => A5.firePitArt(true).toCanvas(), fx, fy, fy - 1);
      this.flames.push(this.add.sprite(fx, fy - 4, T.flames, 1).setOrigin(0.5, 1).setScale(0.4).setDepth(fy).play(`${P}flames`));
      this.spots.push({ x: fx, y: fy - 8, scale: 1.2, tint: 0xffa048, base: 1 });
      this.prop(this.skin(T.logChair), fx - 15, fy + 1);
      this.prop(this.skin(T.logChair), fx + 15, fy + 1);
      this.prop(this.tex3(`${P}hammock1`, () => this.sc(A3.hammockArt(1).toCanvas(), 22)), x0 + 98, y0 + 118);
      const a = [lpL, py - 24, py] as const;
      const b = [lpR, py - 24, py] as const;
      if (this.xmas) this.addString(a, b, h.n);
      else this.addWarmString(a, b, h.n);
    }
    if (lv >= 3 && spaStyle) {
      // 스파·테라스형 Lv3: 선베드 둘 (아래 단 데크)
      furn(`${P}lounger0`, () => A6.loungerArt(0x5a9ad0).toCanvas(), px - 32, py + 12);
      furn(`${P}lounger1`, () => A6.loungerArt(0xe8a03a).toCanvas(), px + 32, py + 12);
      const sx = x0 + PL.spa.x;
      const sy = y0 + PL.spa.y;
      furn(`${P}spa-${lit ? 1 : 0}`, () => A5.spaArt(lit && this.isNight()).toCanvas(), sx, sy);
      const wy = sy - A5.SPA.h + A5.SPA.water.y + 2;
      this.add
        .particles(sx, wy, T.mist, { lifespan: { min: 1800, max: 2600 }, speedX: { min: -3, max: 3 }, speedY: { min: -9, max: -5 }, scale: { start: 0.18, end: 0.5 }, alpha: { start: 0.55, end: 0 }, frequency: 260, x: { min: -8, max: 8 } })
        .setDepth(sy + 4);
      this.spots.push({ x: sx, y: wy, scale: 0.55, tint: 0x8ae8f0, base: 0.7 });
      const pole = { x: x0 + PL.pole.x, y: y0 + PL.pole.y };
      this.prop(this.skin(T.pole), pole.x, pole.y);
      const a = [lpL, py - 24, py] as const;
      const b = [lpR, py - 24, py] as const;
      const c = [pole.x, pole.y - 32, pole.y] as const;
      if (this.xmas) {
        this.addString(a, b, h.n);
        this.addString(b, c, h.n + 1);
      } else {
        this.addWarmString(a, b, h.n);
        this.addWarmString(b, c, h.n + 1);
      }
    }
    furn(`${P}mailbox`, () => A4.mailboxArt().toCanvas(), px - 16, py + 14);
    if (lit) {
      this.smoke(ox + art.chimney.x, oy + art.chimney.y, deckTop + 3);
      for (const w of art.windows) this.spots.push({ x: ox + w.x, y: oy + w.y, scale: 0.55, tint: 0xffb060, base: 0.8 });
    }
    if (!labels || !this.opts.labels) return;
    if (h.owner) this.label(px, oy - 4, h.owner, 0xffe8b0, 0.9);
    else {
      const k = `${P}post-psale-${h.n}`;
      if (!this.textures.exists(k)) addCanvasTexture(this, k, { canvas: this.sc(A.sitePostArt(h.n, true, false).toCanvas(), 26) });
      this.prop(k, px + 18, py + 16);
      this.label(px, oy - 4, `분양 중 · ${h.size === "small" ? "작은 터" : "넓은 터"}`, 0xffe6a0, 0.95);
    }
  }

  /** 촌캉스 시골집: 돌담 + 흙마당 + 집채 · 감나무 · Lv1 평상·아궁이 / Lv2 + 밥상·장독대·연기 / Lv3 정자·화톳불·감나무 줄조명 */
  private drawRural(h: L.Home, x0: number, y0: number, lv: L.YardLv, lit: boolean, labels: boolean): void {
    const T = Art.CAMP_TEX;
    const R = L.RURAL_PLAN[h.size];
    const fp = L.fpOf(h);
    const wide = h.size === "wide";
    const S = this.snowy ? 1 : 0;
    const furn = (key: string, make: () => HTMLCanvasElement, x: number, y: number, depth = y, maxY = 999) => this.prop(this.tex3(key, () => this.sc(make(), maxY)), x, y, depth);
    const at = (p: { x: number; y: number }) => ({ x: x0 + p.x, y: y0 + p.y });
    // 흙마당 (담 안 전체, 겨울엔 눈 마당 + 쓸어 둔 길)
    const yx = 6;
    const yy = R.house.y - 14;
    const yw = fp.w - 12;
    const yh = fp.h - yy - 4;
    const gateMid = R.gate.side === "front" ? { x: (R.gate.a + R.gate.b) / 2, y: fp.h - 2 } : { x: 4, y: (R.gate.a + R.gate.b) / 2 };
    const swept = [
      { x: R.house.x - yx, y: R.house.y - yy + 3, rx: 14, ry: 6 },
      { x: (R.house.x * 2 + gateMid.x) / 3 - yx, y: (R.house.y * 2 + gateMid.y) / 3 - yy, rx: 9, ry: 9 },
      { x: (R.house.x + gateMid.x * 2) / 3 - yx, y: (R.house.y + gateMid.y * 2) / 3 - yy, rx: 9, ry: 9 },
      { x: gateMid.x - yx, y: gateMid.y - yy, rx: 9, ry: 8 },
      { x: R.agungi.x - yx, y: R.agungi.y - yy + 3, rx: 20, ry: 7 },
    ];
    const melt = lit ? { x: R.agungi.x - yx, y: R.agungi.y - yy + 3 } : null;
    const yk = this.tex3(`${P}yard-${h.size}-${S}-${lit ? 1 : 0}`, () => {
      const c = A5.yardArt(yw, yh, this.snowy, wide ? 1 : 2, swept, melt).toCanvas();
      if (wide) return c;
      // 싸리울집: 울타리 모양대로 마당을 자른다 (네모가 아니게)
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      L.BRUSH_FENCE.forEach((p, i) => (i ? ctx.lineTo(p.x - yx, p.y - yy) : ctx.moveTo(p.x - yx, p.y - yy)));
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      return c;
    });
    this.add.image(x0 + yx, y0 + yy, yk).setOrigin(0, 0).setDepth(FLAT + 10);
    // 돌담 (뒤 · 양옆 · 앞, 대문 자리 비움) + 돌기둥 대문 + 싸리문
    const mossy = !this.snowy;
    const backY = y0 + 10;
    const frontY = y0 + fp.h;
    const lx = x0 + 4;
    const rx = x0 + fp.w - 4;
    const hWall = (xa: number, xb: number, y: number, seed: number) => {
      const len = Math.round(xb - xa);
      if (len < 4) return;
      const k = this.tex3(`${P}dolH-${len}-${seed}-${S}`, () => this.sc(A5.stoneWallHArt(len, seed, mossy).toCanvas(), 10));
      this.add.image(xa, y + 1, k).setOrigin(0, 1).setDepth(y);
    };
    const vWall = (x: number, ya: number, yb: number, seed: number) => {
      const len = Math.round(yb - ya);
      if (len < 4) return;
      const k = this.tex3(`${P}dolV-${len}-${seed}-${S}`, () => this.sc(A5.stoneWallVArt(len, seed, mossy).toCanvas(), len + 4));
      this.add.image(x, ya, k).setOrigin(0.5, 0).setDepth(yb);
    };
    const gA = R.gate.a;
    const post = (x: number, y: number) => this.prop(this.tex3(`${P}gpost-${S}`, () => this.sc(A5.gatePostArt().toCanvas(), 16)), x, y);
    if (!wide) {
      // 싸리 울타리 (불규칙한 테두리) + 싸리문
      const F = L.BRUSH_FENCE;
      for (let i = 1; i < F.length; i++) {
        const a = F[i - 1];
        const b = F[i];
        const k = `${P}brushF-${i}-${S}`;
        let ox = 0;
        let oy = 0;
        if (!this.textures.exists(k)) {
          const seg = A6.brushFenceSeg(x0 + a.x, y0 + a.y, x0 + b.x, y0 + b.y, i, this.snowy);
          addCanvasTexture(this, k, { canvas: seg.grid.toCanvas() });
          ox = seg.ox;
          oy = seg.oy;
        } else {
          const seg = A6.brushFenceSeg(x0 + a.x, y0 + a.y, x0 + b.x, y0 + b.y, i, this.snowy);
          ox = seg.ox;
          oy = seg.oy;
        }
        this.add.image(ox, oy, k).setOrigin(0, 0).setDepth(y0 + Math.max(a.y, b.y) + 1);
      }
      this.prop(this.tex3(`${P}brushGate-${S}`, () => this.sc(A5.brushGateArt().toCanvas(), 14)), lx + 10, y0 + gA + 6, y0 + gA - 2);
    }
    if (wide) hWall(lx - 4, rx + 5, backY, 1);
    const gB = R.gate.b;
    if (!wide) {
      // (울타리는 위에서 그렸다)
    } else if (R.gate.side === "front") {
      hWall(lx - 4, x0 + gA, frontY, 2);
      hWall(x0 + gB, rx + 5, frontY, 3);
      vWall(lx, backY - 2, frontY - 8, 4);
      vWall(rx, backY - 2, frontY - 8, 5);
      post(x0 + gA, frontY + 2);
      post(x0 + gB, frontY + 2);
      this.prop(this.tex3(`${P}brushGate-${S}`, () => this.sc(A5.brushGateArt().toCanvas(), 14)), x0 + gB - 9, frontY - 6, frontY - 7).setFlipX(true);
    } else {
      hWall(lx - 4, rx + 5, frontY, 2);
      vWall(lx, backY - 2, y0 + gA - 6, 4);
      vWall(lx, y0 + gB + 2, frontY - 8, 6);
      vWall(rx, backY - 2, frontY - 8, 5);
      post(lx, y0 + gA);
      post(lx, y0 + gB + 8);
      this.prop(this.tex3(`${P}brushGate-${S}`, () => this.sc(A5.brushGateArt().toCanvas(), 14)), lx + 10, y0 + gA + 6, y0 + gA - 2);
    }
    // 집채
    const art = wide ? A5.giwaHouseArt(lit, this.xmas) : A5.slateHouseArt(lit, this.xmas);
    const hk = this.tex3(`${P}rh-${h.size}-${lit ? 1 : 0}`, () => (this.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 191 + h.n }) : art.grid.toCanvas()));
    const hp = at(R.house);
    this.add.image(hp.x, hp.y, hk).setOrigin(0.5, 1).setDepth(hp.y);
    const ox = hp.x - art.grid.w / 2;
    const oy = hp.y - art.grid.h;
    if (wide) {
      this.atlas.ensure(h.name);
      const t = this.add.bitmapText(ox + art.board.x, oy + art.board.y, FONT_KEY, h.name, FONT_PX).setOrigin(0.5, 0.5).setTint(0xf2dca0).setDepth(hp.y + 1);
      t.setScale(Math.min(0.42, 15 / Math.max(1, t.width)));
    }
    if (this.xmas) this.addString([ox + art.eaveL.x, oy + art.eaveL.y, hp.y], [ox + art.eaveR.x, oy + art.eaveR.y, hp.y], h.n + 3);
    if (lit) {
      this.smoke(ox + art.chimney.x, oy + art.chimney.y, hp.y + 1, { freq: 640 });
      for (const w of art.windows) this.spots.push({ x: ox + w.x, y: oy + w.y, scale: 0.5, tint: 0xffb060, base: 0.8 });
      this.spots.push({ x: ox + art.chimney.x, y: oy + art.chimney.y + 2, scale: 0.22, tint: 0xff9a50, base: 0.5 });
    }
    // 감나무 (가을: 감 주렁주렁 · 겨울: 까치밥 + 까치)
    const tp = at(R.tree);
    const tart = A5.persimmonTreeArt(this.snowy, wide, wide ? 3 : 5);
    this.prop(this.tex3(`${P}pers-${h.size}-${S}`, () => (this.snowy ? snowCap(tart.toCanvas(), { depth: 1, maxY: tart.h - 6 }) : tart.toCanvas())), tp.x, tp.y, tp.y, 0);
    // 빨랫줄 · 텃밭 (기본 살림)
    if (R.line) furn(`${P}cline-${this.xmas ? 1 : 0}`, () => A5.clotheslineArt(34, this.xmas).toCanvas(), x0 + R.line.x, y0 + R.line.y, y0 + R.line.y, 6);
    if (R.garden && (wide || lv >= 2)) this.prop(this.tex3(`${P}garden-${S}`, () => A5.gardenArt(26, 18, this.snowy).toCanvas()), x0 + R.garden.x, y0 + R.garden.y, y0 + R.garden.y - 10, 0);
    // 아궁이 + 가마솥 (불빛 · 솥 김 · Lv2부터 굴뚝 연기)
    const ap = at(R.agungi);
    const ag = A5.AGUNGI;
    furn(`${P}agungi-${lit ? 1 : 0}-${this.xmas ? 1 : 0}`, () => A5.agungiArt(lit, this.xmas).toCanvas(), ap.x, ap.y, ap.y, ag.h - 8);
    const aox = ap.x - ag.w / 2;
    const aoy = ap.y + 2 - ag.h;
    if (lit) {
      if (!this.anims.exists(`${P}brazier`)) this.anims.create({ key: `${P}brazier`, frames: Array.from({ length: 3 }, (_, i) => ({ key: T.brazierFire, frame: i })), frameRate: 7, repeat: -1 });
      this.flames.push(this.add.sprite(aox + ag.mouth.x, aoy + ag.mouth.y + 1, T.brazierFire, 0).setOrigin(0.5, 1).setScale(0.8, 0.7).setDepth(ap.y + 1).play({ key: `${P}brazier`, startFrame: h.n % 3 }));
      this.spots.push({ x: aox + ag.mouth.x, y: aoy + ag.mouth.y - 4, scale: 1.55, tint: 0xff9a48, base: 1 });
      this.add
        .particles(aox + ag.pot.x, aoy + ag.pot.y - 4, T.mist, { lifespan: { min: 1600, max: 2400 }, speedX: { min: -2, max: 3 }, speedY: { min: -8, max: -4 }, scale: { start: 0.14, end: 0.42 }, alpha: { start: 0.5, end: 0 }, frequency: 320, x: { min: -4, max: 4 } })
        .setDepth(ap.y + 2);
      if (lv >= 2) this.smoke(aox + ag.chimney.x, aoy + ag.chimney.y, ap.y + 2, { freq: 560, alpha: 0.5 });
    }
    // Lv1 평상 (방석 4) → Lv3 정자 (방석 4) 같은 자리
    const pp = at(R.pyeong);
    if (!wide && lv >= 3) {
      // 싸리울집 Lv3: 평상 → 원두막
      furn(`${P}wondumak-${this.xmas ? 1 : 0}`, () => A6.wondumakArt(this.snowy, this.xmas).toCanvas(), pp.x, pp.y + 4, pp.y + 4, 999);
    } else if (lv >= 3) {
      furn(`${P}pavilion-${this.xmas ? 1 : 0}-${lit ? 1 : 0}`, () => A5.pavilionArt(lit && this.isNight(), this.xmas).toCanvas(), pp.x, pp.y, pp.y, A5.PAVILION.h - 6);
      if (lit) this.spots.push({ x: pp.x - A5.PAVILION.w / 2 + A5.PAVILION.lantern.x, y: pp.y + 2 - A5.PAVILION.h + A5.PAVILION.lantern.y, scale: 0.6, tint: 0xffb0a0, base: 0.9 });
    } else furn(`${P}pyeongMeal`, () => A5.pyeongsangMealArt().toCanvas(), pp.x, pp.y, pp.y, 22);
    // 싸리울집: 장독대는 처음부터 (왼쪽) · Lv2 텃밭 + 닭장 · Lv3 우물
    if (!wide) {
      const jp = at(R.jangdok);
      furn(`${P}jangdok-${R.jangdok.big}-${R.jangdok.small}`, () => A5.jangdokArt(R.jangdok.big, R.jangdok.small).toCanvas(), jp.x, jp.y, jp.y, 26);
      if (lv >= 2) {
        const cp = at(R.table);
        furn(`${P}coop`, () => A6.chickenCoopArt(this.snowy).toCanvas(), cp.x, cp.y, cp.y, 12);
      }
      if (lv >= 3) furn(`${P}well`, () => A6.wellArt(this.snowy).toCanvas(), x0 + 62, y0 + 106, y0 + 106, 8);
    }
    // 감나무집 Lv2: 밥상 (작은 나무 의자 2) + 장독대
    if (wide && lv >= 2) {
      const tb = at(R.table);
      furn(`${P}lowTable2`, () => A5.lowTableArt(2).toCanvas(), tb.x, tb.y, tb.y, 20);
      const jp = at(R.jangdok);
      furn(`${P}jangdok-${R.jangdok.big}-${R.jangdok.small}`, () => A5.jangdokArt(R.jangdok.big, R.jangdok.small).toCanvas(), jp.x, jp.y, jp.y, 26);
    }
    // Lv3: 화톳불 (감나무집만 · 통나무 의자 2) + 감나무 줄조명
    if (lv >= 3) {
      const fpp = at(R.fire);
      if (wide) {
      furn(`${P}firepit-${lit ? 1 : 0}`, () => A5.firePitArt(lit).toCanvas(), fpp.x, fpp.y, fpp.y - 1, 10);
      this.prop(this.skin(T.logChair), fpp.x - 19, fpp.y + 1);
      this.prop(this.skin(T.logChair), fpp.x + 19, fpp.y + 1);
      if (lit) {
        this.flames.push(this.add.sprite(fpp.x, fpp.y - 4, T.flames, 2).setOrigin(0.5, 1).setScale(0.4).setDepth(fpp.y).play(`${P}flames`));
        this.spots.push({ x: fpp.x, y: fpp.y - 8, scale: 1.3, tint: 0xffa048, base: 1 });
      }
      }
      const w = wide ? 18 : 14;
      const a = [tp.x - w, tp.y - (wide ? 44 : 36), tp.y] as const;
      const b = [tp.x + w - 2, tp.y - (wide ? 38 : 30), tp.y] as const;
      const c = [tp.x - w + 4, tp.y - (wide ? 26 : 22), tp.y] as const;
      const d = [tp.x + w, tp.y - (wide ? 22 : 18), tp.y] as const;
      if (this.xmas) {
        this.addString(a, b, h.n);
        this.addString(c, d, h.n + 1);
      } else {
        this.addWarmString(a, b, h.n);
        this.addWarmString(c, d, h.n + 1);
      }
    }
    // 우체통 · 분양 팻말 (대문 밖)
    const mb = R.gate.side === "front" ? { x: x0 + gA - 8, y: frontY + 12 } : { x: lx - 8, y: y0 + gA - 4 };
    furn(`${P}mailbox`, () => A4.mailboxArt().toCanvas(), mb.x, mb.y);
    if (!labels || !this.opts.labels) return;
    if (h.owner) this.label(hp.x, oy - 2, h.owner, 0xffe8b0, 0.9);
    else {
      const k = `${P}post-rsale-${h.n}`;
      if (!this.textures.exists(k)) addCanvasTexture(this, k, { canvas: this.sc(A.sitePostArt(h.n, true, false).toCanvas(), 26) });
      if (R.gate.side === "front") this.prop(k, x0 + gB + 14, frontY + 16);
      else this.prop(k, lx - 6, y0 + gB + 24);
      this.label(hp.x, oy - 2, `분양 중 · ${wide ? "넓은 터" : "작은 터"}`, 0xffe6a0, 0.95);
    }
  }

  /** 앞마당 등급 비교판: 위 줄 넓은 터 · 아래 줄 작은 터, 왼쪽부터 Lv1 · Lv2 · Lv3 (발자국 점선 = 처음부터 비워 두는 자리) */
  private addLevelStage(kind: "pension" | "rural"): void {
    const FP = L.HOME_FP[kind];
    const colW = Math.max(FP.wide.w, FP.small.w) + 44;
    const head = 46;
    const rowGap = 64;
    const W0 = colW * 3 + 96;
    const rows = [
      { size: "wide" as const, y0: head + 34 },
      { size: "small" as const, y0: head + 34 + FP.wide.h + rowGap },
    ];
    const H0 = rows[1].y0 + FP.small.h + 50;
    const zoom = Math.min(this.scale.width / W0, this.scale.height / H0);
    const W = Math.ceil(this.scale.width / zoom);
    const H = Math.ceil(this.scale.height / zoom);
    const dx = Math.round((W - W0) / 2);
    const dy = Math.round((H - H0) / 2);
    for (const r of rows) r.y0 += dy;
    // 바닥 (맵과 같은 풀밭·눈밭) + 집 앞 흙길
    const key = `${P}stage-${kind}-${this.snowy ? 1 : 0}`;
    if (!this.textures.exists(key)) {
      const { canvas, ctx } = makeCanvas(W, H);
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const roadY = rows.map((r) => r.y0 + FP[r.size].h + 14);
          const onRoad = roadY.some((ry) => Math.abs(y - ry) < 9 + Math.sin(x / 23) * 1.5);
          const c = mockGroundColor(x + 3000, y + 3000, onRoad ? "path" : "grass", false, onRoad ? -4 : -9, this.snowy);
          const j = (y * W + x) * 4;
          img.data[j] = (c >> 16) & 255;
          img.data[j + 1] = (c >> 8) & 255;
          img.data[j + 2] = c & 255;
          img.data[j + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      addCanvasTexture(this, key, { canvas });
    }
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.ground);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setZoom(zoom);
    cam.centerOn(W / 2, H / 2);
    const names = kind === "pension" ? ["솔바람채", "달빛채"] : ["감나무집", "싸리울집"];
    const cell: Record<string, string[]> = {
      "pension-wide": ["데크 + 4인 식탁", "+ 2단 데크 · 통유리 난간 · 파라솔 · 그네 의자", "+ 온수 스파(김) · 선베드 2 · 줄조명"],
      "pension-small": ["데크 + 4인 식탁", "+ 2단 데크 · 파라솔 · 바비큐 스테이션", "+ 화로대 불멍 · 해먹 · 줄조명"],
      "rural-wide": ["평상 + 아궁이 (돌담·대문)", "+ 밥상 · 장독대 · 아궁이 연기", "평상→정자 · 화톳불 · 감나무 조명"],
      "rural-small": ["평상 + 아궁이 + 작은 장독대 (싸리 울타리)", "+ 텃밭 · 닭장", "평상→원두막 · 우물 · 감나무 조명"],
    };
    const what =
      kind === "pension"
        ? ["데크 + 4인 식탁", "+ 파라솔 2 · 바비큐 그릴(연기)", "+ 온수 스파 2(김) · 줄조명"]
        : ["평상(방석 4) + 아궁이·가마솥", "+ 밥상(의자 2) · 장독대 · 아궁이 연기", "평상→정자(4) · 화톳불(통나무 2) · 감나무 조명"];
    for (let lv = 1 as L.YardLv; lv <= 3; lv++) {
      const cx = dx + 48 + colW * (lv - 1) + colW / 2;
      this.tagAt(cx, dy + 22, `Lv${lv} · ${L.SEATS[kind][lv]}자리`, lv === 1 ? 0xf2ead8 : lv === 2 ? 0xffe1a8 : 0xffc98a, zoom);
      for (const r of rows) {
        const f = FP[r.size];
        const x0 = Math.round(cx - f.w / 2);
        const y0 = r.y0;
        const h: L.Home = { id: `s${lv}`, kind, n: lv + (r.size === "wide" ? 0 : 3), size: r.size, x0, y0, lv, owner: "손님네", name: names[r.size === "wide" ? 0 : 1], roof: r.size === "wide" ? 0 : 2, v: r.size === "wide" ? 0 : 1 };
        this.drawHome(h, x0, y0, lv, true, false);
        this.tagAt(cx, y0 + f.h + 26, `${h.name} · ${cell[`${kind}-${r.size}`][lv - 1]}`, r.size === "wide" ? 0xffd9c2 : 0xd6f0c8, zoom);
        const g = this.add.graphics().setDepth(DEPTH.labels + 4);
        g.lineStyle(1 / zoom * 1.5, 0xffffff, 0.9);
        for (let x = x0; x < x0 + f.w; x += 6) {
          g.lineBetween(x, y0, Math.min(x + 3, x0 + f.w), y0);
          g.lineBetween(x, y0 + f.h, Math.min(x + 3, x0 + f.w), y0 + f.h);
        }
        for (let y = y0; y < y0 + f.h; y += 6) {
          g.lineBetween(x0, y, x0, Math.min(y + 3, y0 + f.h));
          g.lineBetween(x0 + f.w, y, x0 + f.w, Math.min(y + 3, y0 + f.h));
        }
      }
    }
    for (const r of rows) {
      const f = FP[r.size];
      this.tagAt(dx + 26, r.y0 + f.h / 2, `${r.size === "wide" ? "넓은 터" : "작은 터"}\n발자국\n${f.w}×${f.h}`, 0xf2ead8, zoom);
    }
  }

  /** 설명 글씨표 (annotate와 같은 꼴, 줌 지정) */
  private tagAt(x: number, y: number, text: string, bg: number, z: number): void {
    const t = this.add
      .text(0, 0, text, { fontFamily: "Pretendard, Galmuri11, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#1b1a17", align: "center", lineSpacing: -2 })
      .setOrigin(0.5, 0.5)
      .setResolution(z * 2);
    const w = t.width + 14;
    const h = t.height + 6;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 1.5, -h / 2 + 2, w, h, 7);
    g.fillStyle(bg, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 7);
    g.lineStyle(1.5, 0x1b1a17, 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 7);
    this.add.container(x, y, [g, t]).setScale(1 / z).setDepth(DEPTH.labels + 10);
  }

  /** 펜션 단지 놀이터: 대형 트램펄린(8인) · 워터 슬라이드(겨울·크리스마스는 눈썰매장) · 바베큐 마당 */
  private addPlayground(): void {
    const T = Art.CAMP_TEX;
    const S = L.SLIDE;
    const sk = this.tex3(`${P}slide`, () => (this.snowy ? A3.sledHillArt(this.xmas).toCanvas() : A3.waterSlideArt().toCanvas()));
    this.add.image(S.x - A3.SLIDE_ART.w / 2 - 6, S.y - 60, sk).setOrigin(0, 0).setDepth(S.y + 40);
    // 트램펄린: 뒤 반(매트·뒤 기둥) → 사람 → 앞 반(앞 기둥·망·사다리)
    const Tr = L.TRAMPOLINE;
    const tr = A4.bigTrampolineArt();
    const bk = this.tex3(`${P}trampB`, () => tr.back.toCanvas());
    const fk = this.tex3(`${P}trampF`, () => this.sc(tr.front.toCanvas(), 999));
    const by = Tr.y + Tr.ry + 10;
    this.add.image(Tr.x, by, bk).setOrigin(0.5, 1).setDepth(Tr.y - Tr.ry);
    this.add.image(Tr.x, by, fk).setOrigin(0.5, 1).setDepth(Tr.y + Tr.ry + 4);
    if (this.opts.people) {
      const jumpers: [number, number, number, string][] = [
        [-26, -6, 14, "#f2b8c6"],
        [-4, 8, 4, "#9fc5e8"],
        [18, -10, 22, "#ffd966"],
        [30, 10, 8, "#b6d7a8"],
        [-30, 12, 0, "#e8a0d8"],
      ];
      for (const [dx, dy, h, col] of jumpers) {
        const x = Tr.x + dx;
        const y = Tr.y + dy;
        const g = this.add.graphics().setDepth(Tr.y - Tr.ry + 1);
        g.fillStyle(0x000000, 0.35 - h * 0.008).fillEllipse(x, y, 12 - h * 0.15, 4);
        const key = ensureAvatarTexture(this, col, [], "hood");
        this.add.image(x, y - h + 1, key, avatarFrame(h > 0 ? "jump" : "idle", DIR.down)).setOrigin(0.5, 1).setDepth(Tr.y - Tr.ry + 2 + dy * 0.01 + 30);
      }
    }
    this.addPensionGarden();
    this.addFootBath();
  }

  /** 6차: 펜션 정원 (울타리 없는 잔디 마당 — 공용 바비큐·피크닉 · 파라솔 둘 · 그네 의자 · 흔들 의자 · 화단 · 줄조명) */
  private addPensionGarden(): void {
    const T = Art.CAMP_TEX;
    const G = L.PGARDEN;
    if (!this.snowy) {
      const k = this.tex3(`${P}lawn`, () => A6.lawnArt(G.x1 - G.x0, G.y1 - G.y0).toCanvas());
      this.add.image(G.x0, G.y0, k).setOrigin(0, 0).setDepth(FLAT + 8);
    }
    const furn = (key: string, make: () => HTMLCanvasElement, x: number, y: number, depth = y) => this.prop(this.tex3(key, () => this.sc(make(), 999)), x, y, depth);
    // 연못 + 아치 다리 · 벤치
    this.prop(this.tex3(`${P}pondBr${this.snowy ? 1 : 0}`, () => this.sc(A6.pondBridgeArt(this.snowy).toCanvas(), 999)), L.PG_POND.x, L.PG_POND.y, L.PG_POND.y - 20);
    this.prop(this.skin(T.plankBench2), L.PG_BENCH.x, L.PG_BENCH.y);
    // 화로대 불멍 (불멍 의자 넷 · 장작더미)
    const F = L.PG_FIRE;
    this.prop(T.fireRing, F.x, F.y, F.y, 8).setScale(0.62);
    this.flames.push(this.add.sprite(F.x, F.y + 2, T.flames, 2).setOrigin(0.5, 1).setScale(0.62).setDepth(F.y + 1).play(`${P}flames`));
    this.spots.push({ x: F.x, y: F.y - 10, scale: 1.6, tint: 0xffa048, base: 1 });
    for (const p of L.PG_FIRE_SEATS) this.prop(T.logChair, p.x, p.y);
    furn(`${P}firewood`, () => A3.firewoodArt().toCanvas(), L.PG_WOOD.x, L.PG_WOOD.y);
    // 그네 의자 · 해먹 · 화단
    furn(`${P}swing`, () => A4.swingBenchArt().toCanvas(), L.PG_SWING.x, L.PG_SWING.y);
    this.prop(this.tex3(`${P}hammock0`, () => this.sc(A3.hammockArt(0).toCanvas(), 22)), L.PG_HAMMOCK.x, L.PG_HAMMOCK.y);
    for (const p of L.PG_PLANTERS) furn(`${P}planter${p.len}`, () => A4.planterArt(p.len).toCanvas(), p.x, p.y);
    // 「소슬 펜션」 간판 · 꼬마전구 아치 · 정원등 · 관목 · 디딤돌
    const sg = L.PG_SIGN;
    furn(`${P}penSign`, () => A6.penSignArt().toCanvas(), sg.x, sg.y);
    this.atlas.ensure("소슬 펜션");
    this.add.bitmapText(sg.x, sg.y - 16, FONT_KEY, "소슬 펜션", FONT_PX).setOrigin(0.5, 0.5).setTint(0xffe6a0).setScale(0.5).setDepth(sg.y + 1);
    this.spots.push({ x: sg.x, y: sg.y - 24, scale: 0.5, tint: 0xffd890, base: 0.8 });
    const ar = A6.lightArchArt(34, this.xmas);
    const ak = this.tex3(`${P}lightArch${this.xmas ? 1 : 0}`, () => this.sc(ar.grid.toCanvas(), 16));
    const ax0 = L.PG_ARCH.x - 17;
    const ay0 = L.PG_ARCH.y - 34;
    this.add.image(L.PG_ARCH.x, L.PG_ARCH.y, ak).setOrigin(0.5, 1).setDepth(L.PG_ARCH.y);
    for (const b of ar.bulbs) this.spots.push({ x: ax0 + b.x, y: ay0 + b.y, scale: 0.18, tint: 0xffe6a0, base: 0.9 });
    for (const p of L.PG_LAMPS) {
      furn(`${P}gLamp`, () => A6.gardenLampArt().toCanvas(), p.x, p.y);
      this.spots.push({ x: p.x, y: p.y - 12, scale: 0.4, tint: 0xffe0a0, base: 0.85 });
    }
    for (const p of L.PG_SHRUBS) this.prop(this.skin(T.bush(p.v)), p.x, p.y);
    for (const [i, p] of L.PG_STEPS.entries()) this.add.image(p.x, p.y, this.tex3(`${P}step${i % 2}`, () => A6.stepStoneArt(i).toCanvas())).setDepth(FLAT + 20);
    // 크리스마스: 펜션 트리 (아닐 땐 관목)
    if (this.xmas) {
      this.add.image(L.PG_TREE.x, L.PG_TREE.y, `${P}xtree`).setOrigin(0.5, 1).setScale(0.55).setDepth(L.PG_TREE.y);
      this.prop(`${P}gifts0`, L.PG_TREE.x + 14, L.PG_TREE.y + 4);
    } else this.prop(this.skin(T.bush(0)), L.PG_TREE.x, L.PG_TREE.y);
    // 자전거 · 주차된 작은 차
    furn(`${P}bike`, () => A6.bikeArt().toCanvas(), L.PG_BIKE.x, L.PG_BIKE.y);
    furn(`${P}car`, () => A6.carArt(0x5a8ac0).toCanvas(), L.PG_CAR.x, L.PG_CAR.y);
    if (this.opts.people) {
      for (const [i, col] of ["#ffd966", "#9fd8c8"].entries()) {
        const p = L.PG_FIRE_SEATS[i];
        const k = ensureAvatarTexture(this, col, [], "hood");
        this.add.image(p.x, p.y - 2, k, avatarFrame("sitChair", i ? DIR.left : DIR.right)).setOrigin(0.5, 1).setDepth(p.y + 1);
      }
    }
  }

  /** 6차: 계곡 족욕탕 (예전 펜션 바베큐 마당 자리) — 김 나는 돌 테 탕 + 나무 데크·벤치·등롱 + 아래 쉼 벤치 */
  private addFootBath(): void {
    const T = Art.CAMP_TEX;
    const F = L.FOOTBATH_AT;
    const fb = A6.footBathArt(this.xmas);
    const key = this.tex3(`${P}footbath`, () => {
      const c = fb.grid.toCanvas();
      return this.snowy ? snowCap(c, { depth: 1, maxY: A6.FOOTBATH.h - 6 }) : c;
    });
    const x0 = F.x - A6.FOOTBATH.w / 2;
    const y0 = F.y - A6.FOOTBATH.h;
    this.add.image(F.x, F.y, key).setOrigin(0.5, 1).setDepth(y0 + 30);
    for (const l of fb.lanterns) this.spots.push({ x: x0 + l.x, y: y0 + l.y, scale: 0.5, tint: 0xffd28a, base: 0.9 });
    for (const st of fb.steam) this.smoke(x0 + st.x, y0 + st.y, y0 + 200, { freq: 380, alpha: this.snowy ? 0.6 : 0.3, scale: 1.25, tint: 0xffffff });
    // 김 기둥 셋 (탕에서 데크·대나무 울 위로 피어오른다)
    for (const [i, [sx, sy]] of ([
      [28, 70],
      [52, 62],
      [40, 52],
    ] as const).entries()) {
      const k = `${P}steamCol${i}`;
      if (!this.textures.exists(k)) addCanvasTexture(this, k, { canvas: A6.steamColumnCanvas(i * 1.7), linear: true });
      const img = this.add.image(x0 + sx, y0 + sy, k).setOrigin(0.5, 1).setDepth(y0 + 210).setScale(1.25, 1.45);
      this.tweens.add({ targets: img, alpha: { from: this.snowy ? 1 : 0.45, to: this.snowy ? 0.8 : 0.32 }, scaleX: { from: 1.2, to: 1.32 }, duration: 1800 + i * 400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    for (const b of L.FOOT_BENCHES) this.prop(this.skin(T.plankBench2), b.x, b.y);
    if (this.snowy) this.prop(`${P}snowman1`, 364, 246);
    if (this.opts.people) {
      const who: [number, string][] = [
        [0, "#f2b8c6"],
        [3, "#9fc5e8"],
        [5, "#ffd966"],
      ];
      for (const [si, col] of who) {
        const st = fb.seats[si];
        const k = ensureAvatarTexture(this, col, [], "hood");
        const dir = st.dir === "right" ? DIR.right : st.dir === "left" ? DIR.left : DIR.up;
        this.add.image(x0 + st.x, y0 + st.y + 1, k, avatarFrame("sitChair", dir)).setOrigin(0.5, 1).setDepth(y0 + 31 + st.y * 0.01);
      }
    }
    if (this.opts.labels) this.label(F.x, y0 + 2, "계곡 족욕탕", 0xffe6a0, 0.95);
  }

  // ── 4차: 윤슬 낚시터 (직사각 저수지) ──

  private addFishing(): void {
    const T = Art.CAMP_TEX;
    const Pi = L.PIER;
    const pk = this.tex3(`${P}wpier`, () => (this.snowy ? A.snowDust(A4.widePierArt(Pi.x1 - Pi.x0), 0.28, 9) : A4.widePierArt(Pi.x1 - Pi.x0)).toCanvas());
    this.add.image(Pi.x0, Pi.y - 18, pk).setOrigin(0, 0).setDepth(FLAT + 2700);
    for (const r of L.RAFTS) {
      const art = A6.raft4Art(r.roof, this.xmas, r.link ? "left" : "front");
      const k = this.tex3(`${P}raft4-${r.n}`, () => (this.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 181 + r.n }) : art.grid.toCanvas()));
      this.add.image(r.x, r.y, k).setOrigin(0.5, 1).setDepth(r.y);
      this.spots.push({ x: r.x - 6, y: r.y - 32, scale: this.xmas ? 0.9 : 0.65, tint: this.xmas ? 0xffd890 : 0xffc070, base: 0.85 });
    }
    this.addRowDock();
    {
      const B = L.BUOY_LINE;
      const k = this.tex3(`${P}buoys`, () => A6.buoyLineArt(B.x1 - B.x0).toCanvas());
      this.add.image(B.x0, B.y - 4, k).setOrigin(0, 0).setDepth(FLAT + 2700);
    }
    this.addPoolRocks();
    // 관리 부스 · 이름 팻말 · 수영 안내
    const bt = A3.boothArt(this.xmas);
    this.prop(this.tex3(`${P}booth`, () => (this.snowy ? snowRoof(bt.grid.toCanvas(), (x, y) => bt.roof[y * bt.grid.w + x] === 1, { seed: 191 }) : bt.grid.toCanvas())), L.BOOTH.x, L.BOOTH.y);
    this.spots.push({ x: L.BOOTH.x - 3, y: L.BOOTH.y - 20, scale: 0.8, tint: 0xffd890, base: 0.85 });
    this.prop(this.skin(T.board), L.POND_SIGN.x, L.POND_SIGN.y);
    const sw = { x: L.RES.x0 - 34, y: L.PIER.y - 26 };
    this.prop(this.tex3(`${P}swimSign`, () => this.sc(A4.swimSignArt().toCanvas(), 14)), sw.x, sw.y);
    if (this.opts.labels) {
      this.label(L.BOOTH.x, L.BOOTH.y - 46, "미끼·대여", 0xffe6a0, 0.9);
      this.label(L.POND_SIGN.x + 12, L.POND_SIGN.y - 34, "윤슬 낚시터 · 좌대 4~6은 헤엄쳐서 가요", 0xbfe6ff, 0.95);
    }
    if (this.snowy) for (const h of L.ICE_HOLES) this.add.image(h.x, h.y, this.tex3(`${P}iceHole`, () => A3.iceHoleArt().toCanvas())).setDepth(FLAT + 2800);
    // 둑 낚시 자리 (작은 접이 의자 + 낚싯대 받침)
    for (const f of L.POND_SPOTS) {
      const img = this.prop(this.tex3(`${P}bankSeat`, () => this.sc(A4.bankSeatArt().toCanvas(), 999)), f.x, f.y + 4, f.y);
      if (f.dir === "left") img.setFlipX(true);
    }
    // 헤엄치는 사람 · 좌대 2에 앉은 둘
    if (this.opts.people) {
      const sk = ensureAvatarTexture(this, "#9fc5e8", [], "hood");
      this.add.image(1100, 214, sk, avatarFrame("swim", DIR.up)).setOrigin(0.5, 1).setDepth(214);
      const r2 = L.RAFTS[1];
      for (const [dx, col] of [
        [-24, "#f2b8c6"],
        [-10, "#ffd966"],
        [9, "#b6d7a8"],
      ] as const) {
        const k = ensureAvatarTexture(this, col, [], "hood");
        this.add.image(r2.x + dx, r2.y - 12, k, avatarFrame("sitChair", DIR.down)).setOrigin(0.5, 1).setDepth(r2.y + 1);
      }
    }
  }

  /** 6차: 나룻배 선착장 (서쪽 둑) + 2인 나룻배 셋 (둘은 매어 두고 하나는 물 위에서 낚시) */
  private addRowDock(): void {
    const D = L.ROW_DOCK;
    const dk = this.tex3(`${P}rowdock`, () => (this.snowy ? A.snowDust(A6.rowDockArt(D.len), 0.3, 13) : A6.rowDockArt(D.len)).toCanvas());
    this.add.image(D.x0, D.y - 19, dk).setOrigin(0, 0).setDepth(FLAT + 2700);
    this.spots.push({ x: D.x0 + 4, y: D.y - 17, scale: 0.55, tint: 0xffd28a, base: 0.9 });
    this.prop(this.tex3(`${P}boatSign`, () => this.sc(A6.boatSignArt().toCanvas(), 14)), L.BOAT_SIGN.x, L.BOAT_SIGN.y);
    if (this.opts.labels) this.label(L.BOAT_SIGN.x, L.BOAT_SIGN.y - 26, "나룻배 (2인)", 0xbfe6ff, 0.9);
    const geo = boatGeom(2, DIR.right);
    for (const [i, b] of L.ROWBOATS.entries()) {
      const tint = BOAT_TINTS[b.tint % BOAT_TINTS.length];
      const bk = this.tex3(`${P}boatB${i}`, () => boatGrid(2, "back", DIR.right, b.moored ? 0 : 1, tint).toCanvas());
      const fk = this.tex3(`${P}boatF${i}`, () => boatGrid(2, "front", DIR.right, b.moored ? 0 : 1, tint).toCanvas());
      this.add.image(b.x, b.y + 6, `${P}ripple`).setDepth(FLAT + 2650).setAlpha(0.5);
      this.add.image(b.x, b.y, bk).setOrigin(geo.ax / geo.w, geo.ay / geo.h).setDepth(b.y - 1);
      if (!b.moored && this.opts.people) {
        for (const [dx, col] of [
          [0, "#e8a0d8"],
          [-11, "#9fd8c8"],
        ] as const) {
          const k = ensureAvatarTexture(this, col, [], "hood");
          this.add.image(b.x + dx, b.y + 1, k, avatarFrame("sitChair", DIR.right)).setOrigin(0.5, 1).setDepth(b.y);
        }
        const g = this.add.graphics().setDepth(b.y + 2);
        g.fillStyle(0x4a321e, 1);
        for (let i2 = 0; i2 < 14; i2++) g.fillRect(b.x - 4 - i2 * 0.9, b.y - 10 - i2 * 0.6, 1, 1);
        g.fillStyle(0xe84a3a, 1).fillRect(b.x - 22, b.y + 2, 2, 2);
      }
      this.add.image(b.x, b.y, fk).setOrigin(geo.ax / geo.w, geo.ay / geo.h).setDepth(b.y + 1.5);
    }
  }

  /** 6차: 달그늘 소 양옆 낚시 바위 여섯 (의자 + 낚싯대 받침) */
  private addPoolRocks(): void {
    const k = this.tex3(`${P}fishRock`, () => this.sc(A6.fishRockArt(0).toCanvas(), 18));
    for (const r of L.POOL_ROCKS) this.prop(k, r.x, r.y, r.y - 4).setFlipX(r.side > 0);
    if (this.opts.people) {
      for (const [ri, col] of [
        [1, "#e8d9b0"],
        [3, "#c9b6e8"],
      ] as const) {
        const r = L.POOL_ROCKS[ri];
        const sk = ensureAvatarTexture(this, col, [], "hood");
        this.add.image(r.x + r.side * 4, r.y - 7, sk, avatarFrame("sitChair", r.side < 0 ? DIR.right : DIR.left)).setOrigin(0.5, 1).setDepth(r.y - 3);
      }
    }
  }

  // ── 3차: 캠프파이어 존 (예전 큰 타프 자리) ──

  private addCampfireZone(): void {
    const T = Art.CAMP_TEX;
    for (const [i, p] of L.PITS.entries()) {
      this.prop(T.fireRing, p.x, p.y, p.y, 8).setScale(0.62);
      this.flames.push(this.add.sprite(p.x, p.y + 2, T.flames, i).setOrigin(0.5, 1).setScale(0.62).setDepth(p.y + 1).play(`${P}flames`));
      this.spots.push({ x: p.x, y: p.y - 10, scale: 1.8, tint: 0xffa048, base: 1 });
      if (p.kind === "bench") {
        this.prop(this.skin(T.plankBench2), p.x - 30, p.y + 2);
        this.prop(this.skin(T.plankBench2), p.x + 30, p.y + 2);
        this.prop(this.skin(T.plankBench2), p.x, p.y + 26);
      } else {
        this.prop(this.tex3(`${P}hammock0`, () => this.sc(A3.hammockArt(0).toCanvas(), 22)), p.x - 40, p.y + 6);
        this.prop(this.tex3(`${P}hammock1`, () => this.sc(A3.hammockArt(1).toCanvas(), 22)), p.x + 44, p.y + 14);
        this.prop(T.logChair, p.x, p.y + 22);
      }
    }
    this.prop(this.tex3(`${P}snack`, () => this.sc(A3.snackCartArt().toCanvas(), 14)), L.SNACK.x, L.SNACK.y);
    this.spots.push({ x: L.SNACK.x, y: L.SNACK.y - 24, scale: 0.8, tint: 0xffd890, base: 0.85 });
    for (const w of L.WOOD_STACKS) this.prop(this.tex3(`${P}firewood`, () => this.sc(A3.firewoodArt().toCanvas(), 14)), w.x, w.y);
  }

  private addLamps(): void {
    for (const p of L.LAMPS) {
      this.prop(`${P}lamp`, p.x, p.y);
      this.spots.push({ x: p.x, y: p.y - 20, scale: 0.6, tint: 0xffd28a, base: 0.85 });
    }
  }

  private addBridges(): void {
    const T = Art.CAMP_TEX;
    const vy = L.VIEW_BRIDGE.y;
    const vx = Math.round(L.streamX(vy));
    this.add.image(vx - A.VBRIDGE_W / 2, vy - A.VBRIDGE_H / 2 - 2, `${P}vbridge`).setOrigin(0, 0).setDepth(FLAT + 2600);
    for (const lp of A.VBRIDGE_LAMPS) this.spots.push({ x: vx - A.VBRIDGE_W / 2 + lp.x, y: vy - A.VBRIDGE_H / 2 - 2 + lp.y, scale: 0.55, tint: 0xffd28a, base: 0.85 });
    const by = L.LOG_BRIDGE_Y;
    const bx = Math.round(L.streamX(by));
    this.add.image(bx - Art.BRIDGE_W / 2, by - Art.BRIDGE_H / 2, this.skin(T.bridge)).setOrigin(0, 0).setDepth(FLAT + 2600);
  }

  // ── NPC·사람 ──

  private addNpcs(): void {
    const T = Art.CAMP_TEX;
    const night = this.isNight();
    const list: { id: "keeper" | "clerk" | "granny" | "guitarist"; name: string; x: number; y: number; flip?: boolean; on: boolean }[] = [
      { id: "keeper", name: "언젠가 씨 · 관리소 사장", x: 356, y: 698, on: true },
      { id: "clerk", name: "매점 알바", x: 452, y: 694, on: true },
      { id: "granny", name: "계곡 할머니", x: Math.round(L.streamX(500) - 40), y: 500, flip: false, on: true },
      { id: "guitarist", name: "기타 캠퍼", x: L.FIRE.x + 46, y: L.FIRE.y + 70, flip: true, on: night },
    ];
    for (const n of list) {
      if (!n.on) continue;
      this.add.image(n.x, n.y + 1, seasonKey(T.npc(n.id), this.concept), 0).setOrigin(0.5, 1).setDepth(n.y).setFlipX(!!n.flip);
      if (this.opts.labels) this.label(n.x, n.y - Art.NPC_H + 2, n.name, 0xffe8b0, 1, 1, DEPTH.labels - 1);
    }
  }

  /** 구경하는 손님 몇 (크기 비교·분위기용): 폭포 다리에서 폭포를 보는 둘, 웅덩이 낚시, 모닥불, 카라반 마당 */
  private addPeople(): void {
    const ppl: { color: string; x: number; y: number; state: "idle" | "sitChair"; dir: DirId; name: string; rod?: boolean }[] = [
      { color: "#f2b8c6", x: 628, y: L.VIEW_BRIDGE.y - 4, state: "idle", dir: DIR.up, name: "솜사탕" },
      { color: "#9fc5e8", x: 646, y: L.VIEW_BRIDGE.y - 4, state: "idle", dir: DIR.up, name: "구름이" },
      { color: "#b6d7a8", x: L.SMALL_SEATS[2].x, y: L.SMALL_SEATS[2].y, state: "sitChair", dir: DIR.up, name: "불멍러" },
      { color: "#ffd966", x: L.LOG_SEATS[8].x, y: L.LOG_SEATS[8].y, state: "sitChair", dir: DIR.down, name: "마시멜로" },
    ];
    // 촌캉스 감나무집 평상 (방석 자리) · 솔바람채 데크 식탁
    const r1 = L.HOMES.find((h) => h.id === "r1")!;
    const pg = { x: r1.x0 + L.RURAL_PLAN.wide.pyeong.x - A5.PYEONG.w / 2, y: r1.y0 + L.RURAL_PLAN.wide.pyeong.y + 2 - A5.PYEONG.h };
    const s0 = A5.PYEONG.seats[0];
    const s2 = A5.PYEONG.seats[3];
    ppl.push({ color: "#e8a0d8", x: pg.x + s0.x, y: pg.y + s0.y + 1, state: "sitChair", dir: DIR.right, name: "마시멜로네" });
    ppl.push({ color: "#9fd8c8", x: pg.x + s2.x, y: pg.y + s2.y + 1, state: "sitChair", dir: DIR.down, name: "콩이" });
    for (const p of ppl) {
      const key = ensureAvatarTexture(this, p.color, [], "hood");
      this.add.image(p.x, p.y + 1, key, avatarFrame(p.state, p.dir)).setOrigin(0.5, 1).setDepth(p.name === "콩이" || p.name === "마시멜로네" ? pg.y + A5.PYEONG.h + 1 : p.y + 0.5);
      if (this.opts.labels && p.name !== "콩이" && p.name !== "마시멜로네") this.label(p.x, p.y - 30, p.name, 0xffffff, 0.95, 1, DEPTH.labels - 2);
      if (p.rod) {
        const g = this.add.graphics().setDepth(p.y + 1);
        g.fillStyle(0x4a321e, 1);
        for (let i = 0; i < 16; i++) g.fillRect(p.x + 4 + i * 0.3, p.y - 14 - i, 1, 1);
        g.fillStyle(0xdcecf2, 0.8);
        for (let i = 0; i < 14; i++) g.fillRect(p.x + 9, p.y - 30 + i * 1.2 - 14 + 14, 0.5, 0.5);
        g.fillStyle(0xe84a3a, 1).fillRect(p.x + 8.5, p.y - 22, 2, 2);
      }
      this.spots.push({ x: p.x, y: p.y - 8, scale: 0.3, tint: 0xfff0d0, base: 0.4 });
    }
  }

  // ── 이름표 ──

  private label(x: number, y: number, text: string, tint: number, alpha = 0.66, originY = 1, depth = DEPTH.labels - 1): void {
    this.atlas.ensure(text);
    const t = this.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(alpha).setDepth(depth);
    t.setScale(1 / this.opts.zoom);
    this.labels.push(t);
  }

  private addLabels(): void {
    const zone = (x: number, y: number, t: string, c = 0xf0dcb0) => this.label(x, y, t, c, 0.66);
    zone(L.FALL_X, 14, "아스라 폭포", 0xc8e4ec);
    zone(L.POOL.x - 40, L.POOL.y + 58, "달그늘 소", 0xc8e4ec);
    zone(Math.round(L.streamX(660)) + 2, 650, "옛길 계곡", 0xc8e4ec);
    zone(L.FIRE.x + 6, L.FIRE.y + 106, "캠프파이어 존");
    zone(L.POND.x, L.RES.y1 - 16, "윤슬 낚시터", 0xc8e4ec);
    zone(170, 22, "소슬 펜션 마을");
    this.label(L.BUS_STOP.x + 20, L.BUS_STOP.y - 56, "언젠가 캠핑장행 · Someday Camp", 0xfff0c0, 0.95);
    this.label(102, 594, "다음 버스: 언젠가", 0xd8ecff, 0.85);
    this.label(L.OFFICE.x - 50, L.OFFICE.y - 37, "관리소", 0x5a3a22, 1, 0.5);
    this.label(L.OFFICE.x + 44, L.OFFICE.y - 40, "매점", 0x5a3a22, 1, 0.5);
    this.label(L.BOARD_SPOT.x, L.BOARD_SPOT.y - 36, "의뢰판", 0xf0dcb0, 0.8);
    this.label(L.SALE_BOARD.x, L.SALE_BOARD.y - 26, "카라반 분양", 0xffe6a0, 0.95);
  }

  /** 설명판 (annotate=1): 굵은 글씨표 + 점선 테 (게임 그림 위 덧칠 — 시안 설명 전용) */
  private addAnnotations(): void {
    const z = this.opts.zoom;
    const tag = (x: number, y: number, text: string, bg: number, fg = "#1b1a17") => {
      const t = this.add
        .text(0, 0, text, { fontFamily: "Pretendard, Galmuri11, sans-serif", fontSize: "15px", fontStyle: "bold", color: fg, align: "center", lineSpacing: -2 })
        .setOrigin(0.5, 0.5)
        .setResolution(z * 2);
      const w = t.width + 14;
      const h = t.height + 6;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 1.5, -h / 2 + 2, w, h, 7);
      g.fillStyle(bg, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 7);
      g.lineStyle(1.5, 0x1b1a17, 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 7);
      this.add.container(x, y, [g, t]).setScale(1 / z).setDepth(DEPTH.labels + 10);
    };
    tag(L.FALL_X, 64, "아스라 폭포 (맨 위는 맵 밖에서 쏟아진다)", 0xbfe6f5);
    tag(L.POOL.x - 70, L.POOL.y + 26, "달그늘 소 (희귀 물고기 ✦)", 0xbfe6f5);
    tag(Math.round(L.streamX(500)) + 0, 492, "옛길 계곡", 0xbfe6f5);
    tag(Math.round(L.streamX(L.VIEW_BRIDGE.y)) + 6, L.VIEW_BRIDGE.y + 30, "폭포 다리", 0xffe1a8);
    tag(L.SMALL_FIRE.x - 60, L.SMALL_FIRE.y - 30, "작은 모닥불 (4자리)", 0xffc98a);
    tag(Math.round(L.streamX(L.STONES_Y)), L.STONES_Y + 18, "징검다리", 0xffe1a8);
    tag(Math.round(L.streamX(L.LOG_BRIDGE_Y)), L.LOG_BRIDGE_Y + 26, "통나무 다리", 0xffe1a8);
    for (const s of L.SITES) tag(s.x, s.y - 26, `카라반 ${s.n} ${s.row === "front" ? "물가" : "뒷줄"}${s.kind ? "" : " · 분양 전"}`, s.row === "front" ? 0xbfe6ff : 0xd6f0c8);
    // 펜션 마을 (둘레 울타리 없음 · 집마다 Lv3 발자국을 비워 둔다)
    tag(170, 13, "소슬 펜션 마을 (위 촌캉스 2 · 아래 펜션 2 + 정원)", 0xffd9c2);
    for (const h of L.HOMES) {
      const f = L.fpOf(h);
      const g = this.add.graphics().setDepth(DEPTH.labels + 4);
      g.lineStyle(1, h.kind === "pension" ? 0xffb08a : 0x9ad08a, 0.95);
      for (let x = h.x0; x < h.x0 + f.w; x += 6) {
        g.lineBetween(x, h.y0, Math.min(x + 3, h.x0 + f.w), h.y0);
        g.lineBetween(x, h.y0 + f.h, Math.min(x + 3, h.x0 + f.w), h.y0 + f.h);
      }
      for (let y = h.y0; y < h.y0 + f.h; y += 6) {
        g.lineBetween(h.x0, y, h.x0, Math.min(y + 3, h.y0 + f.h));
        g.lineBetween(h.x0 + f.w, y, h.x0 + f.w, Math.min(y + 3, h.y0 + f.h));
      }
      const kind = h.kind === "pension" ? "펜션" : "촌캉스";
      const size = h.size === "wide" ? "넓은 터" : "작은 터";
      const seats = L.SEATS[h.kind][h.lv];
      const ty = h.y0 - 12;
      tag(h.x0 + f.w / 2, ty, `${kind} ${h.n} ${size}${h.owner ? "" : " · 분양 중"}\n앞마당 Lv${h.lv} · ${seats}자리`, h.kind === "pension" ? (h.owner ? 0xffd9c2 : 0xffffff) : h.owner ? 0xd6f0c8 : 0xffffff);
    }
    tag(L.PENSION_HOST.x + 10, L.PENSION_HOST.y + 22, "소슬댁 = 펜션 분양", 0xffe1a8);
    tag(L.SLIDE.x + 20, L.SLIDE.y - 14, this.snowy ? "눈썰매장 (여름엔 워터 슬라이드)" : "워터 슬라이드 (겨울엔 눈썰매장)", 0xbfe6f5);
    tag(L.TRAMPOLINE.x, L.TRAMPOLINE.y + 52, "대형 트램펄린 (8명)", 0xbfe6f5);
    tag(L.FOOTBATH_AT.x, 60, "계곡 족욕탕", 0xffc98a);
    // 캠프파이어 존
    tag(L.FIRE.x, L.FIRE.y - 6, "캠프파이어 존 · 큰 모닥불 (12자리)", 0xffc98a);
    tag(L.PITS[0].x, L.PITS[0].y + 26, "불멍 벤치", 0xffc98a);
    tag(L.PITS[1].x + 6, L.PITS[1].y - 34, "해먹 쉼터", 0xffc98a);
    tag(L.SNACK.x - 20, L.SNACK.y - 44, "마시멜로·핫도그", 0xffc98a);
    tag(L.BBQ.area.x + 50, L.BBQ.area.y - 8, "바베큐", 0xffc98a);
    // 낚시터
    tag(L.POND.x, L.RES.y1 - 40, "윤슬 낚시터 (저수지 · 둘레 둑길)", 0xbfe6f5);
    for (const r of L.RAFTS) tag(r.x, r.y - 54, `좌대 ${r.n}\n4인${r.link ? " · 걸어서" : " · 헤엄"}`, 0xffe1a8);
    tag(L.PIER.x0 + 70, L.PIER.y, "넓은 잔교 (2칸)", 0xffe1a8);
    tag(L.BOOTH.x - 4, L.BOOTH.y - 52, "관리 부스 (미끼·대여)", 0xffe1a8);
    tag(L.BUS_STOP.x, L.BUS_STOP.y - 76, "버스 정류장 (그대로)", 0xd9e8ff);
    tag(L.OFFICE.x - 40, L.OFFICE.y - 100, "관리소·매점 (그대로)", 0xd9e8ff);
    tag(L.SALE_BOARD.x + 20, L.SALE_BOARD.y + 34, "언젠가 씨 = 카라반 분양", 0xffe1a8);
    tag(640, 772, `물고기 = 낚시 자리 ${L.FISH_SPOTS.length + L.POND_SPOTS.length + L.RAFTS.length * 4}곳 (계곡·소 ${L.FISH_SPOTS.length} · 저수지 둑 ${L.POND_SPOTS.length} · 좌대 6×4 = 24)`, 0xfff2a8);
  }

  /** 6차 바뀐 곳 표시 (changes=1): 번호 글씨표 + 점선 테 */
  private addChangeNotes(): void {
    const z = this.opts.zoom;
    const box = (x0: number, y0: number, x1: number, y1: number, c: number) => {
      const g = this.add.graphics().setDepth(DEPTH.labels + 4);
      g.lineStyle(1.5, c, 1);
      const dash = (ax: number, ay: number, bx: number, by: number) => {
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 6));
        for (let i = 0; i < n; i += 2) g.lineBetween(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, ax + ((bx - ax) * Math.min(n, i + 1)) / n, ay + ((by - ay) * Math.min(n, i + 1)) / n);
      };
      dash(x0, y0, x1, y0);
      dash(x1, y0, x1, y1);
      dash(x1, y1, x0, y1);
      dash(x0, y1, x0, y0);
    };
    const C = 0xffe14a;
    box(466, 222, 514, 318, C);
    box(768, 222, 818, 318, C);
    this.tagAt(640, 326, "① 낚시 바위 6곳 (소 양옆 3+3)", 0xfff2a8, z);
    box(824, 222, 906, 272, C);
    this.tagAt(866, 212, "② 자판기 3대 (전부 여기로)", 0xfff2a8, z);
    box(988, 120, 1212, 330, C);
    this.tagAt(1100, 218, "③ 좌대 6개 → 4인용으로 넓힘", 0xfff2a8, z);
    box(912, 380, 1172, 460, C);
    this.tagAt(1060, 474, "④ 나룻배 선착장 · 2인 배 3척", 0xfff2a8, z);
    box(348, 66, 436, 200, C);
    this.tagAt(392, 54, "⑤ 계곡 족욕탕 (옛 바베큐 마당)", 0xfff2a8, z);
    this.tagAt(640, 150, "⑥ 절벽 바위 질감 (층리·틈·턱·눈/이끼)", 0xfff2a8, z);
    box(426, 140, 496, 212, C);
    box(806, 140, 872, 214, C);
    this.tagAt(462, 222, "⑦ 절벽 끝 돌무더기", 0xfff2a8, z);
    this.tagAt(838, 128, "⑦ 절벽 끝 돌무더기", 0xfff2a8, z);
    box(2, 24, 320, 200, C);
    this.tagAt(160, 106, "⑧ 촌캉스 2채 → 위로", 0xfff2a8, z);
    box(2, 228, 322, 556, C);
    this.tagAt(160, 368, "⑨ 펜션 2채 → 아래 · 고급 펜션 구역 (2단 데크·통유리·바비큐·스파·연못·화로대·해먹)", 0xfff2a8, z);
    this.tagAt(206, 186, "⑩ ← 순이 할머니 = 촌캉스 분양", 0xfff2a8, z);
  }

  private addFishMarks(): void {
    for (const f of [...L.FISH_SPOTS, ...L.POND_SPOTS, ...L.RAFTS.flatMap((r) => [-24, -10, 9, 23].map((dx) => ({ x: r.x + dx, y: r.y + 4 }))), ...L.ROWBOATS.map((b) => ({ x: b.x, y: b.y }))]) {
      const g = this.add.graphics().setDepth(DEPTH.labels + 5);
      g.lineStyle(1, 0xfff2a8, 1).strokeCircle(f.x, f.y - 3, 7);
      g.fillStyle(0xfff2a8, 0.35).fillCircle(f.x, f.y - 3, 7);
      this.add.image(f.x, f.y - 3, `${P}fish`).setDepth(DEPTH.labels + 6).setScale(0.9);
    }
  }

  // ── 매 프레임 ──

  private isNight(): boolean {
    return this.hour >= 19.5 || this.hour < 5;
  }

  update(time: number): void {
    if (!this.ready) return;
    const t = this.clock ?? time;
    const lt = ((t % LOOP) + LOOP) % LOOP;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const Lv = this.atmos.levels;
    const night = Math.max(Lv.darkness, this.isNight() ? 0.6 : 0);
    this.night = night;
    if (this.stage) {
      this.atmos.update(time, 16, view);
      this.lighting.begin(view, Lv.darkness * 0.82, Lv.shade);
      if (Lv.darkness > 0.004) for (const sp of this.spots) this.lighting.add(sp.x, sp.y + 6, (40 + 24 * Lv.glow) * sp.scale * 1.4, 0.88);
      this.lighting.end();
      void lt;
      return;
    }
    // 물줄기·거품 프레임
    this.falls.setFrame(Math.floor(t / (1000 / 16)) % A.FALL_FRAMES);
    this.fallsGlow.setFrame(this.falls.frame.name).setAlpha(night > 0.3 ? 0.08 : 0);
    this.moonGlow.setAlpha(night > 0.3 ? 0.13 + 0.03 * Math.sin((lt / LOOP) * Math.PI * 2) : 0);
    for (const f of this.foams) f.img.setFrame((Math.floor(t / (1000 / f.fps)) + f.off) % A.FOAM_FRAMES);
    // 물보라: 주기 안에서 정해진 시각에 튀어 오른다
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      const age = (((lt - d.s * LOOP) % LOOP) + LOOP) % LOOP;
      const a = age / 1000;
      if (age > d.life) {
        d.img.setVisible(false);
        continue;
      }
      const x = d.x0 + d.vx * a;
      const y = d.y0 + d.vy * a + 0.5 * 170 * a * a;
      d.img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setAlpha(0.95 * (1 - age / d.life));
    }
    // 물안개: 피어올라 흩어진다 (주기 3초)
    for (const p of this.puffs) {
      const k = (lt / LOOP + p.ph) % 1;
      const env = Math.sin(k * Math.PI);
      p.img
        .setPosition(p.x + Math.sin((k + p.ph) * Math.PI * 2) * 5, p.y - k * p.rise)
        .setScale(p.sc * (0.8 + k * 0.5), p.sc * (0.7 + k * 0.3))
        .setAlpha(p.a * env * (night > 0.3 ? 0.55 : 1));
    }
    // 물결 고리
    for (const r of this.ripples) {
      const k = (lt / LOOP + r.ph) % 1;
      const kk = (k * 2) % 1; // 주기 1.5초
      r.img.setPosition(r.x, r.y + kk * 10).setScale(0.5 + kk * 1.5, 0.5 + kk * 1.1).setAlpha(0.3 * (1 - kk) * Math.min(1, kk * 5));
    }
    // 무지개 (낮에만, 물안개에 비친다)
    this.rainbow.setAlpha(night > 0.2 ? 0 : 0.17 + 0.05 * Math.sin((lt / LOOP) * Math.PI * 2));
    // 반짝임 (낮 햇빛 · 밤 달빛)
    for (const gl of this.glints) {
      const k = (lt / LOOP + gl.ph) % 1;
      const on = k < 0.18 ? Math.sin((k / 0.18) * Math.PI) : 0;
      gl.img.setAlpha(on * (night > 0.3 ? 0.8 : 0.95)).setBlendMode(night > 0.3 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
    // 희귀 물고기 반짝임 (주기 끝무렵 세 번)
    this.rare.forEach((img, i) => {
      const k = (lt / LOOP + 0.62 + i * 0.05) % 1;
      img.setAlpha(k < 0.08 ? Math.sin((k / 0.08) * Math.PI) * 0.9 : 0).setBlendMode(night > 0.3 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    });
    // 계곡 거품 조각 (흘러내린다)
    for (const f of this.flecks) {
      const k = (lt / LOOP) * f.k + f.y0;
      const y = 350 + (k % 1) * f.range;
      f.img.setPosition(Math.round(L.streamX(y) + f.off * 0.6), Math.round(y));
    }
    this.atmos.update(time, 16, view);
    // 어둠 + 빛 구멍 (캠핑장과 같은 세기)
    const lit = this.lighting;
    lit.begin(view, Lv.darkness * 0.82, Lv.shade);
    if (Lv.darkness > 0.004) {
      const lr = 40 + 24 * Lv.glow;
      for (const sp of this.spots) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.4, 0.88);
    }
    lit.end();
  }

  /** 캡처: 카메라를 옮긴다 */
  view(cx: number, cy: number, zoom: number): void {
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    cam.centerOn(cx, cy);
    for (const l of this.labels) (l as Phaser.GameObjects.BitmapText).setScale(1 / zoom);
  }
}
