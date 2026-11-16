import * as Phaser from "phaser";
import { tideLineY, type SeaViewKind } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { rainTile, snowTile } from "../sprites/skyScenery";
import type { Levels } from "../world/ambienceMix";
import { mixRgb } from "../world/skyGrade";
import * as Art from "./seaArt";
import * as V from "./seaViewArt";
import { noise1, shoreDelay, shoreReach, WaveTrain } from "./seaWaves";

// 11/16 바다 보기 장면 (사용자: 앉아 있을 때 「바다 보기」로 바꾸면 화면 전체가 바다 장면). 마을 관람차 하늘 장면(SkyStage)처럼
// 바닷가 장면 위에 얹는 작은 Phaser 씬에 그려요. 도트 한 칸 = 화면 s px (정수), 장면 좌표(가상 px)는 화면 왼쪽 위가 (0,0).
//  - 굽는 것: 하늘(시간대 색이 바뀔 때만 다시)·바다 몸통(같이)·모래·돗자리 끝·파라솔 갓·선베드 발치·데크·등대·구름·갈매기
//  - 움직이는 것: 물가 거품(지도와 같은 파도 흐름 — 세트·큰 너울·곳마다 다른 때), 물결 마루, 반짝임·금빛 길·달빛, 갈매기, 먼 배, 물보라, 등대 불빛
//  - 시간대: 한국 시각으로 해·달 위치, 노을(금빛 길), 밤(별·달빛·등대 불빛). 비·눈·안개
//  - 같이 앉은 사람은 아래쪽에 뒷모습으로
//  - 덮는 동안 월드 카메라는 쉬어요 (opaque) — SeaScene이 메인 카메라를 숨겨요

export type SeaViewSitter = { key: string; frame: number; slot: number; of: number };
export { seaViewFore, seaViewLandmarks, seaViewProject, VIEW_FOCAL, type SeaViewFore, type SeaViewLandmarks } from "./seaViewGeom";
import { seaViewProject, VIEW_FOCAL, type SeaViewFore, type SeaViewLandmarks } from "./seaViewGeom";

export type SeaViewFrame = {
  now: number;
  dt: number;
  levels: Levels;
  /** 한국 시각 (소수 시) */
  hour: number;
  /** 노을 세기 0..1 (seaTone duskWeight) */
  dusk: number;
  /** 물 높이 0..1 (물때) */
  tide: number;
  /** 0 = 검은 화면 … 1 = 다 보임 */
  fade: number;
  sitters: readonly SeaViewSitter[];
  /** 벤치 앞 선베드마다 누운 사람이 있는지 (begin의 fore.loungers 차례) */
  lying?: readonly boolean[];
  /** 11/16 등대 꼭대기: 유령선이 보이는 때 (토요일 밤) · 안개로 등불이 켜진 세기 */
  ghost?: boolean;
  fogLamp?: number;
};

const P = "seav-";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const RSTEP = 4;

class ViewScene extends Phaser.Scene {
  ready = false;
  create(): void {
    this.cameras.main.setOrigin(0, 0);
    this.ready = true;
  }
}

type Pal = { top: number; mid: number; low: number };
type Gull = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; t0: number; called: boolean; on: boolean };
type Puff = { img: Phaser.GameObjects.Image; x: number; y: number; vy: number; t0: number; life: number; on: boolean };
type Glint = { img: Phaser.GameObjects.Image; t0: number; life: number; on: boolean };

let seq = 0;

/** 장면마다 수평선 높이 (화면 높이 비율) — 선베드는 누워서 하늘이 넓어요 */
/** 11/16 장면 종류: 앉은 자리 장면 + 등대 꼭대기 (오르기) */
export type ViewKind = SeaViewKind | "lighthouse";
// 11/16 r12 벤치는 눈높이를 조금 높여(내려다보듯) 수평선을 위로 — 모래밭이 잘 보이게
const HORIZON: Record<ViewKind, number> = { beach: 0.34, mat: 0.42, parasol: 0.44, lounger: 0.6, pier: 0.36, breakwater: 0.4, lighthouse: 0.24 };

export class SeaView {
  private readonly scene: ViewScene;
  private readonly key: string;
  private kind: ViewKind | null = null;
  private variant = 0;
  private mat = 0;
  private foreSpec: SeaViewFore | null = null;
  private landSpec: SeaViewLandmarks | null = null;
  /** 앉은 자리 (월드) — 물가 줄을 실제 거리로 */
  private seatAt: { x: number; y: number } | null = null;
  private foreLoungers: { img: Phaser.GameObjects.Image; head: Phaser.GameObjects.Image }[] = [];
  private built = false;
  private dirty = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private s = 1;
  private VW = 0;
  private VH = 0;
  private hz = 0;
  private black: Phaser.GameObjects.Image | null = null;
  private cover = 0;
  private palCheck = 0;
  private skyKey = "";
  private seaKey = "";
  private waves: WaveTrain | null = null;
  private lastBig = 0;
  private nextGull = 0;
  private nextBoat = 0;
  private nextSpray = 0;
  // 물체
  private sky: Phaser.GameObjects.TileSprite | null = null;
  private stars: Phaser.GameObjects.TileSprite | null = null;
  private sun: Phaser.GameObjects.Image | null = null;
  private moon: Phaser.GameObjects.Image | null = null;
  private clouds: { img: Phaser.GameObjects.Image; x0: number; y: number; speed: number }[] = [];
  private boat: Phaser.GameObjects.Image | null = null;
  private boatT0 = -1;
  private sea: Phaser.GameObjects.Image | null = null;
  private crests: Phaser.GameObjects.TileSprite[] = [];
  private glints: Glint[] = [];
  private sand: Phaser.GameObjects.Image | null = null;
  private wash: Phaser.GameObjects.Rope | null = null;
  private foam: Phaser.GameObjects.Rope | null = null;
  private fore: Phaser.GameObjects.Image[] = [];
  private moored: Phaser.GameObjects.Image | null = null;
  private buoy: Phaser.GameObjects.Image | null = null;
  private lamp: { x: number; y: number } = { x: 0, y: 0 };
  private beam: Phaser.GameObjects.Image | null = null;
  private tetras: Phaser.GameObjects.Image[] = [];
  private puffs: Puff[] = [];
  private gulls: Gull[] = [];
  private sitters: Phaser.GameObjects.Image[] = [];
  private rain: Phaser.GameObjects.TileSprite | null = null;
  private snow: Phaser.GameObjects.TileSprite | null = null;
  private fog: Phaser.GameObjects.Image | null = null;
  /** 갈매기가 화면 가운데 근처를 지나며 울 때 (소리: 크기 0..1, 좌우 -1..1) */
  onGullCall: ((vol: number, pan: number) => void) | null = null;

  constructor(
    private readonly game: Phaser.Game,
    private readonly reduced: boolean,
  ) {
    this.key = `sea-view-${++seq}`;
    this.scene = new ViewScene({ key: this.key });
    game.scene.add(this.key, this.scene, true);
    game.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize(): void {
    this.dirty = true;
  }

  /** 장면을 그리는 중(또는 검은 막이 남은 중) */
  get busy(): boolean {
    return this.kind !== null || this.cover > 0.004;
  }
  /** 장면이 화면을 다 덮었는지 (월드 카메라를 쉬게 해도 되는지) */
  get opaque(): boolean {
    return this.built && this.kind !== null;
  }
  get active(): ViewKind | null {
    return this.kind;
  }

  /** 장면 시작 (variant = 파라솔 갓 색, mat = 돗자리 색) */
  begin(kind: ViewKind, variant: number, mat: number, fore: SeaViewFore | null = null, land: SeaViewLandmarks | null = null, at: { x: number; y: number } | null = null): void {
    this.seatAt = at;
    if (this.kind === kind && this.variant === variant && this.mat === mat && this.foreSpec === fore && this.landSpec === land) return;
    this.clear();
    this.kind = kind;
    this.variant = variant;
    this.mat = mat;
    this.foreSpec = fore;
    this.landSpec = land;
    this.cover = 0;
  }

  /** 장면 끝: 물체를 지우고 월드 화면 위에 검은 막(cover)을 남겨 걷어요 */
  end(cover: number): void {
    this.clear();
    this.kind = null;
    this.cover = clamp01(cover);
    this.sync();
  }

  idle(dt: number): void {
    if (this.cover <= 0) return;
    this.cover = Math.max(0, this.cover - dt / (this.reduced ? 120 : 420));
    this.sync();
  }

  hide(): void {
    this.scene.cameras?.main?.setVisible(false);
  }

  private sync(): void {
    if (!this.scene.ready) return;
    this.ensureBlack();
    if (!this.kind) {
      this.black?.setAlpha(this.cover).setVisible(this.cover > 0.004);
      this.scene.cameras.main.setVisible(this.cover > 0.004);
    }
  }

  private ensureBlack(): void {
    this.layout();
    const px = this.tex(P + "px", () => V.whitePx());
    if (!this.black) this.black = this.scene.add.image(0, 0, px).setOrigin(0, 0).setTint(0x000000).setDepth(1e6);
    this.black.setDisplaySize(this.VW + 2, this.VH + 2);
  }

  private layout(): void {
    const W = Math.max(1, this.game.scale.width);
    const H = Math.max(1, this.game.scale.height);
    this.s = Math.max(1, Math.ceil(Math.max(W, H) / 420));
    this.VW = Math.ceil(W / this.s);
    this.VH = Math.ceil(H / this.s);
    const cam = this.scene.cameras.main;
    cam.setSize(W, H);
    cam.setOrigin(0, 0);
    cam.setZoom(this.s);
    cam.setScroll(0, 0);
    cam.setRoundPixels(true);
  }

  private tex(key: string, make: () => { toCanvas(): HTMLCanvasElement } | HTMLCanvasElement, frameW?: number, frameH?: number): string {
    if (!this.scene.textures.exists(key)) {
      const out = make();
      addCanvasTexture(this.scene, key, { canvas: out instanceof HTMLCanvasElement ? out : out.toCanvas(), frameW, frameH });
    }
    return key;
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  // ── 만들기 ──

  private build(): void {
    const sc = this.scene;
    const kind = this.kind!;
    this.layout();
    const { VW, VH } = this;
    const hz = (this.hz = Math.round(VH * HORIZON[kind]));
    this.waves = new WaveTrain(4049 + Math.floor(Math.random() * 1000), sc.time.now);
    this.lastBig = 0;
    // 하늘·별·해·달·구름·먼 배
    this.sky = this.add(sc.add.tileSprite(0, 0, VW, hz + 2, this.tex(P + "px", () => V.whitePx())).setOrigin(0, 0).setDepth(0));
    this.skyKey = "";
    this.stars = this.add(sc.add.tileSprite(0, 0, VW, hz, this.tex(P + "stars", () => V.starTile())).setOrigin(0, 0).setDepth(1).setAlpha(0));
    this.sun = this.add(sc.add.image(0, 0, this.tex(P + "sun", () => V.sunDisc(kind === "lounger" ? 10 : 8))).setDepth(2));
    this.moon = this.add(sc.add.image(0, 0, this.tex(P + "moon", () => V.moonDisc())).setDepth(2));
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const img = this.add(sc.add.image(0, 0, this.tex(`${P}cloud${i % 3}`, () => V.softCloud(i % 3))).setOrigin(0, 0.5).setDepth(3));
      this.clouds.push({ img, x0: Math.random() * (VW + 120), y: Math.round(hz * (0.12 + 0.18 * i + Math.random() * 0.1)), speed: 1.2 + Math.random() * 2.2 });
    }
    this.boat = this.add(sc.add.image(-40, hz - 3, this.tex(P + "farBoat", () => V.farBoat())).setOrigin(0.5, 1).setDepth(4).setVisible(false));
    this.boatT0 = -1;
    this.nextBoat = sc.time.now + 8000 + Math.random() * 20000;
    // 바다 몸통 (시간대 색이 바뀔 때 다시 구워요) · 물결 마루 (먼 것은 느리고 옅게, 가까운 것은 빠르고 진하게)
    this.sea = this.add(sc.add.image(0, hz, this.tex(P + "px", () => V.whitePx())).setOrigin(0, 0).setDepth(5));
    this.seaKey = "";
    const seaH = VH - hz;
    this.crests = [
      this.add(sc.add.tileSprite(0, hz + 2, VW, Math.round(seaH * 0.35), this.tex(P + "crestA", () => V.crestTile(11))).setOrigin(0, 0).setDepth(6).setAlpha(0.35)),
      this.add(sc.add.tileSprite(0, hz + Math.round(seaH * 0.35), VW, seaH, this.tex(P + "crestB", () => V.crestTile(23))).setOrigin(0, 0).setDepth(6).setAlpha(0.5).setTileScale(2, 2)),
    ];
    this.glints = [];
    for (let i = 0; i < (this.reduced ? 10 : 36); i++) this.glints.push({ img: this.add(sc.add.image(0, 0, Art.SEA_TEX.goldStreak).setOrigin(0.5, 0.5).setDepth(8).setVisible(false)), t0: 0, life: 0, on: false });

    // 앞 그림 (장면마다)
    this.sand = this.wash = this.foam = null;
    this.fore = [];
    this.moored = this.buoy = this.beam = null;
    this.tetras = [];
    this.puffs = [];
    const beachy = kind === "beach" || kind === "mat" || kind === "parasol" || kind === "lounger";
    if (beachy) {
      const sandH = Math.round(VH * 0.72);
      this.sand = this.add(sc.add.image(0, VH, this.tex(`${P}sand-${VW}-${sandH}`, () => V.sandBand(VW, sandH, 14))).setOrigin(0, 0).setDepth(10));
      const pts = Array.from({ length: Math.ceil(VW / RSTEP) + 1 }, (_, i) => ({ x: i * RSTEP, y: 0 }));
      this.wash = this.add(sc.add.rope(0, 0, this.tex(P + "px", () => V.whitePx()), undefined, pts, true).setDepth(11));
      this.foam = this.add(sc.add.rope(0, 0, Art.SEA_TEX.foam, undefined, pts.map((p) => ({ ...p })), true).setDepth(12));
      if (kind === "mat" || kind === "parasol") this.fore.push(this.add(sc.add.image(0, VH, this.tex(`${P}matEdge-${VW}-${this.mat}`, () => V.matEdge(VW, this.mat))).setOrigin(0, 1).setDepth(30)));
      if (kind === "parasol") this.fore.push(this.add(sc.add.image(0, 0, this.tex(`${P}fringe-${VW}-${this.variant}`, () => V.parasolFringe(VW, this.variant))).setOrigin(0, 0).setDepth(31)));
      if (kind === "lounger") this.fore.push(this.add(sc.add.image(Math.round(VW / 2), VH + 2, this.tex(P + "loungerFoot", () => V.loungerFoot())).setOrigin(0.5, 1).setDepth(30)));
      // 11/16 벤치: 바로 앞 선베드 줄과 파라솔이 장면 앞쪽에 (가까운 줄이 크고 아래, 그 앞 줄은 조금 작고 위)
      const fs = this.foreSpec;
      this.foreLoungers = [];
      if (fs) {
        const lbKey = this.tex(P + "loungerBack", () => V.loungerBackArt());
        const headKey = this.tex(P + "head", () => V.lyingHead());
        for (const l of fs.loungers) {
          const p = seaViewProject(l.dx, l.d, VW, VH, hz);
          if (!p) continue;
          const sc2 = Math.min(2.4, p.s);
          const img = this.add(sc.add.image(Math.round(p.x), Math.round(p.y), lbKey).setOrigin(0.5, 1).setScale(sc2).setDepth(20 - l.d / 100));
          const head = this.add(sc.add.image(Math.round(p.x), Math.round(p.y - 22 * sc2), headKey).setOrigin(0.5, 1).setScale(sc2).setDepth(20.01 - l.d / 100).setVisible(false));
          this.fore.push(img);
          this.foreLoungers.push({ img, head });
        }
        for (const q of fs.parasols) {
          const p = seaViewProject(q.dx, q.d, VW, VH, hz);
          if (!p) continue;
          // 갓이 화면 위를 다 덮지 않게 조금 작게 (선베드 줄 뒤에서 보는 크기)
          this.fore.push(this.add(sc.add.image(Math.round(p.x), Math.round(p.y + 6), Art.SEA_TEX.parasol(q.v)).setOrigin(0.5, 1).setScale(Math.min(2, p.s * 0.75)).setDepth(20.5 - q.d / 100)));
        }
      }
    }
    // 11/16 앉은 자리에서 보이는 선착장·방파제·등대·낚싯배·갯바위 (멀수록 작고 수평선 가까이)
    this.buildLandmarks();
    if (beachy) {
      // (모래 장면은 위에서 다 만들었어요)
    } else if (kind === "lighthouse") {
      // 11/16 등대 꼭대기: 난간 너머 바다가 넓게 · 가끔 먼 고래 물줄기 · 토요일 밤엔 유령선이 다가와요
      this.fore.push(this.add(sc.add.image(0, VH, this.tex(`${P}rail-${VW}`, () => V.galleryRail(VW))).setOrigin(0, 1).setDepth(30)));
      this.spout = this.add(sc.add.image(0, 0, this.tex(P + "spout", () => V.whaleSpout())).setOrigin(0.5, 1).setDepth(9).setVisible(false));
      this.spoutAt = sc.time.now + 6000 + Math.random() * 12000;
      this.ghost = this.add(sc.add.image(0, 0, Art.SEA_TEX.boat).setOrigin(0.5, 1).setDepth(9).setTint(0xb8f0d8).setAlpha(0).setVisible(false));
      this.beam = this.add(sc.add.image(Math.round(VW / 2), VH - 10, this.tex(P + "beam", () => V.beamWedge())).setOrigin(0, 0.5).setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    } else if (kind === "pier") {
      // 11/16 묶인 낚싯배는 선착장 끝 동쪽 → 바다를 보면 왼쪽, 부표는 서쪽 → 오른쪽
      // 11/16 r13 낚싯배 대신 데크 동쪽(장면 왼쪽)에 매어 둔 제트스키
      this.moored = this.add(sc.add.image(Math.round(VW * 0.14), Math.round(VH * 0.8), Art.SEA_TEX.jetski("side", 0)).setOrigin(0.5, 1).setDepth(13).setScale(3).setFlipX(true));
      this.buoy = this.add(sc.add.image(Math.round(VW * 0.82), Math.round(hz + (VH - hz) * 0.35), Art.SEA_TEX.buoy).setOrigin(0.5, 1).setDepth(13).setScale(2));
      this.fore.push(this.add(sc.add.image(0, VH, this.tex(`${P}deck-${VW}`, () => V.deckBand(VW))).setOrigin(0, 1).setDepth(20)));
    } else {
      // 방파제 끝: 11/16 r14 사용자 — 등대는 앉은 자리 뒤(북쪽)라 보이지 않아요. 탁 트인 바다 + 아래 테트라포드 줄 (물보라가 부서져요)
      // 밤엔 뒤에서 도는 등대 불빛이 하늘·바다 위를 옅게 훑어요 (등불은 화면 밖 위쪽 뒤)
      this.lamp = { x: Math.round(VW * 0.5), y: -Math.round(VH * 0.1) };
      this.beam = this.add(sc.add.image(this.lamp.x, this.lamp.y, this.tex(P + "beam", () => V.beamWedge())).setOrigin(0, 0.5).setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      for (let x = 40, i = 0; x < VW + 8; x += 26 + (i % 2) * 6, i++) {
        const img = this.add(sc.add.image(x, VH + 6 - (i % 2) * 8, Art.SEA_TEX.tetra(i % 3)).setOrigin(0, 1).setDepth(20 + (i % 2)).setScale(2.4));
        this.tetras.push(img);
      }
      for (let i = 0; i < (this.reduced ? 4 : 16); i++)
        this.puffs.push({ img: this.add(sc.add.image(0, 0, this.tex(P + "puff", () => V.splashPuff())).setOrigin(0.5, 1).setDepth(21).setVisible(false)), x: 0, y: 0, vy: 0, t0: 0, life: 0, on: false });
      this.nextSpray = sc.time.now + 500;
    }
    // 갈매기 둘
    this.gulls = [];
    for (let i = 0; i < 2; i++) this.gulls.push({ img: this.add(sc.add.image(0, 0, this.tex(P + "gull", () => V.gullSheet(), 9, 5), 0).setDepth(25).setVisible(false)), x: 0, y: 0, vx: 0, t0: 0, called: false, on: false });
    this.nextGull = sc.time.now + 2500 + Math.random() * 5000;
    // 같이 앉은 사람 (뒷모습)
    this.sitters = [];
    for (let i = 0; i < 4; i++) this.sitters.push(this.add(sc.add.image(0, 0, P + "px").setOrigin(0.5, 1).setDepth(28).setScale(2).setVisible(false)));
    // 날씨
    this.rain = this.add(sc.add.tileSprite(0, 0, VW, VH, this.tex(P + "rain", () => rainTile())).setOrigin(0, 0).setDepth(40).setVisible(false));
    this.snow = this.add(sc.add.tileSprite(0, 0, VW, VH, this.tex(P + "snow", () => snowTile())).setOrigin(0, 0).setDepth(40).setVisible(false));
    this.fog = this.add(sc.add.image(0, 0, P + "px").setOrigin(0, 0).setDisplaySize(VW, VH).setDepth(41).setAlpha(0));
    this.ensureBlack();
    this.built = true;
  }

  private spout: Phaser.GameObjects.Image | null = null;
  private spoutAt = 0;
  private spoutT0 = -1;
  private spoutX = 0;
  private ghost: Phaser.GameObjects.Image | null = null;
  private landGfx: Phaser.GameObjects.Graphics | null = null;
  private landSprites: Phaser.GameObjects.Image[] = [];
  private buildLandmarks(): void {
    const lm = this.landSpec;
    this.landSprites = [];
    this.landGfx = null;
    if (!lm) return;
    const sc = this.scene;
    const { VW, VH, hz } = this;
    const g = (this.landGfx = this.add(sc.add.graphics().setDepth(13)));
    for (const st of lm.strips) {
      const d0 = Math.max(st.d0, 26);
      if (st.d1 <= d0) continue;
      const a = seaViewProject(st.dx - st.w / 2, d0, VW, VH, hz);
      const b = seaViewProject(st.dx + st.w / 2, d0, VW, VH, hz);
      const c = seaViewProject(st.dx + st.w / 2, st.d1, VW, VH, hz);
      const e = seaViewProject(st.dx - st.w / 2, st.d1, VW, VH, hz);
      if (!a || !b || !c || !e) continue;
      if (Math.max(a.x, b.x, c.x, e.x) < -10 || Math.min(a.x, b.x, c.x, e.x) > VW + 10) continue;
      const top = st.kind === "pier" ? Art.RAMP.wood[2] : Art.RAMP.rock[1];
      const side = st.kind === "pier" ? Art.RAMP.wood[4] : Art.RAMP.rock[3];
      // 옆면 (물 위로 조금 솟은 두께)
      g.fillStyle(side, 1).fillPoints([ { x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: b.y + 3 * a.s }, { x: a.x, y: a.y + 3 * a.s } ], true);
      g.fillStyle(top, 1).fillPoints([ { x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y }, { x: e.x, y: e.y } ], true);
      g.lineStyle(1, side, 0.8).lineBetween(a.x, a.y, e.x, e.y).lineBetween(b.x, b.y, c.x, c.y);
    }
    for (const sp of lm.sprites) {
      const p = seaViewProject(sp.dx, sp.d, VW, VH, hz);
      if (!p || p.x < -60 || p.x > VW + 60) continue;
      this.landSprites.push(this.add(sc.add.image(Math.round(p.x), Math.round(p.y), sp.key).setOrigin(0.5, 1).setScale(Math.max(0.25, Math.min(2.4, p.s * sp.scale))).setDepth(13.5 - sp.d / 1000)));
    }
  }

  private clear(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.built = false;
    this.sky = this.stars = null;
    this.sun = this.moon = this.boat = this.sea = this.sand = null;
    this.wash = this.foam = null;
    this.clouds = [];
    this.crests = [];
    this.glints = [];
    this.fore = [];
    this.tetras = [];
    this.puffs = [];
    this.gulls = [];
    this.sitters = [];
    this.moored = this.buoy = this.beam = null;
    this.rain = this.snow = this.fog = null;
    this.foreLoungers = [];
    this.landGfx = null;
    this.landSprites = [];
    this.spout = this.ghost = null;
    this.spoutT0 = -1;
    this.skyKey = this.seaKey = "";
  }

  // ── 매 프레임 ──

  frame(f: SeaViewFrame): void {
    if (!this.kind || !this.scene.ready) return;
    if (this.dirty || !this.built) {
      this.dirty = false;
      const k = this.kind;
      const v = this.variant;
      const m = this.mat;
      const fs = this.foreSpec;
      const ls = this.landSpec;
      this.clear();
      this.kind = k;
      this.variant = v;
      this.mat = m;
      this.foreSpec = fs;
      this.landSpec = ls;
      this.build();
    }
    this.scene.cameras.main.setVisible(true);
    const { VW, hz } = this;
    const L = f.levels;
    const night = clamp01(L.darkness * 1.25);
    const warm = clamp01(f.dusk) * (1 - night * 0.7);
    const grey = clamp01(L.cloud * 0.45 + L.rain * 0.8 + L.fog * 0.5 + L.snow * 0.35);
    const k = this.reduced ? 0.3 : 1;
    const now = f.now;
    // 색 다시 굽기 (1.5초마다 확인)
    if (now >= this.palCheck) {
      this.palCheck = now + 1500;
      this.rebake(night, warm, grey);
    }
    // 앞 그림 색: 밤엔 푸르게 어둡게, 노을엔 따뜻하게
    const shade = mixRgb(mixRgb(0xffffff, 0xffd6b8, warm * 0.45), 0x4a5480, night * 0.72);
    // 별·해·달
    const starA = clamp01((night - 0.3) * 1.8) * (1 - grey * 0.85);
    this.stars?.setAlpha(starA * (this.reduced ? 0.8 : 0.7 + 0.3 * Math.sin(now / 1300)));
    const h = f.hour;
    const sunT = (h - 6) / 13;
    const sunOn = sunT > -0.02 && sunT < 1.02 ? (1 - night) * (1 - grey * 0.9) : 0;
    const sx = Math.round(VW * (0.12 + 0.76 * clamp01(sunT)));
    const sy = Math.round(hz - 3 - Math.sin(Math.PI * clamp01(sunT)) * hz * 0.72);
    this.sun?.setPosition(sx, sy).setAlpha(sunOn).setTint(mixRgb(0xffffff, 0xffb070, warm));
    const mh = h < 12 ? h + 24 : h;
    const moonT = (mh - 18.5) / 12;
    const moonOn = moonT > 0 && moonT < 1 ? starA : 0;
    const mx = Math.round(VW * (0.12 + 0.76 * clamp01(moonT)));
    const my = Math.round(hz - 6 - Math.sin(Math.PI * clamp01(moonT)) * hz * 0.62);
    this.moon?.setPosition(mx, my).setAlpha(moonOn);
    // 구름 (흐린 날엔 진하고 많이)
    const cloudTint = mixRgb(mixRgb(0xffffff, 0xffc4b0, warm), mixRgb(0x9aa2b0, 0x2c3350, night), Math.max(night * 0.85, grey * 0.6));
    this.clouds.forEach((c, i) => {
      const x = ((c.x0 + (now / 1000) * c.speed * k) % (VW + 140)) - 70;
      c.img.setPosition(Math.round(x), c.y).setTint(cloudTint).setAlpha((i < 2 || grey > 0.2 ? 0.85 : 0.5) * (0.4 + 0.6 * Math.max(0.3, L.cloud + grey)) * (1 - night * 0.65));
    });
    // 먼 배 (가끔 수평선을 지나가요)
    if (this.boat) {
      if (this.boatT0 < 0 && now >= this.nextBoat && !this.reduced) this.boatT0 = now;
      if (this.boatT0 >= 0) {
        const x = -20 + ((now - this.boatT0) / 1000) * 3.2;
        this.boat.setVisible(true).setPosition(Math.round(x), hz - 1 + Math.round(Math.sin(now / 900) * 0.6)).setTint(mixRgb(shade, 0x8090b0, 0.3));
        if (x > VW + 20) {
          this.boatT0 = -1;
          this.boat.setVisible(false);
          this.nextBoat = now + 40000 + Math.random() * 50000;
        }
      }
    }
    // 물결 마루 흐름
    const [ca, cb] = this.crests;
    if (ca && cb) {
      ca.tilePositionX += f.dt * 0.004 * k;
      cb.tilePositionX -= f.dt * 0.01 * k;
      cb.tilePositionY = Math.sin(now / 2400) * 2 * k;
      ca.setAlpha((0.32 - night * 0.18) * (1 - grey * 0.4));
      cb.setAlpha((0.46 - night * 0.26) * (1 - grey * 0.4));
      ca.setTint(night > 0.5 ? 0x9fb6e8 : 0xffffff);
      cb.setTint(night > 0.5 ? 0x9fb6e8 : warm > 0.3 ? 0xffe2c8 : 0xffffff);
    }
    this.updateGlints(now, f.dt, night, warm, grey, sunOn > 0.05 ? sx : null, moonOn > 0.05 ? mx : null);
    this.updateShore(f, shade, night, warm);
    this.updateFore(f, shade, night);
    this.updateGulls(now, night, L.rain, shade);
    this.updateSitters(f.sitters, night);
    this.foreLoungers.forEach((l, i) => l.head.setVisible(!!f.lying?.[i]).setTint(mixRgb(0xffffff, 0x2a3050, night * 0.5)));
    // 날씨
    if (this.rain) {
      this.rain.setVisible(L.rain > 0.02).setAlpha(clamp01(L.rain) * 0.85);
      this.rain.tilePositionY -= f.dt * 0.16 * k;
      this.rain.tilePositionX += f.dt * 0.05 * k;
    }
    if (this.snow) {
      this.snow.setVisible(L.snow > 0.02).setAlpha(clamp01(L.snow));
      this.snow.tilePositionY -= f.dt * 0.018 * k;
      this.snow.tilePositionX = Math.sin(now / 1500) * 6 * k;
    }
    this.fog?.setTint(night > 0.5 ? 0x2a3050 : 0xdfe6ea).setAlpha(clamp01(L.fog * 0.35 + L.haze * 0.15));
    this.black?.setAlpha(1 - clamp01(f.fade)).setVisible(f.fade < 0.999);
  }

  /** 하늘·바다 몸통 색이 바뀌었으면 다시 구워요 (옛 텍스처는 지워요) */
  private rebake(night: number, warm: number, grey: number): void {
    const q = (c: number) => (c >> 3) & 0x1f1f1f;
    const sp = skyPal(night, warm, grey);
    const skyKey = `${P}sky-${this.hz}-${q(sp.top)}-${q(sp.mid)}-${q(sp.low)}`;
    if (skyKey !== this.skyKey && this.sky) {
      const old = this.skyKey;
      const hz = this.hz;
      this.tex(skyKey, () => skyGrid(hz + 2, sp));
      this.sky.setTexture(skyKey).setSize(this.VW, hz + 2);
      this.skyKey = skyKey;
      if (old && this.scene.textures.exists(old)) this.scene.textures.remove(old);
    }
    const ep = seaPal(night, warm, grey);
    const seaKey = `${P}sea-${this.VW}-${this.VH - this.hz}-${q(ep.far)}-${q(ep.mid)}-${q(ep.near)}`;
    if (seaKey !== this.seaKey && this.sea) {
      const old = this.seaKey;
      const w = this.VW;
      const h = this.VH - this.hz;
      this.tex(seaKey, () => V.seaBody(w, h, ep, this.kind === "pier" ? 2 : 1));
      this.sea.setTexture(seaKey);
      this.seaKey = seaKey;
      if (old && this.scene.textures.exists(old)) this.scene.textures.remove(old);
    }
  }

  /** 반짝임: 낮엔 흰 물빛, 노을엔 해 아래 금빛 길, 밤엔 달 아래 달빛 점 */
  private updateGlints(now: number, dt: number, night: number, warm: number, grey: number, sunX: number | null, moonX: number | null): void {
    const { VW, VH, hz } = this;
    const want = this.reduced ? 0.4 : 1;
    const gold = sunX !== null && warm > 0.2;
    const moon = moonX !== null && night > 0.5;
    const rate = (1 - grey * 0.8) * want;
    for (const g of this.glints) {
      if (g.on && now - g.t0 > g.life) {
        g.on = false;
        g.img.setVisible(false);
      }
      if (!g.on) {
        if (Math.random() > dt * 0.012 * rate) continue;
        const d = Math.pow(Math.random(), 1.3);
        const y = Math.round(hz + 2 + d * (VH - hz - 6));
        // 길: 가까울수록 넓게 퍼져요
        const spread = 6 + d * VW * 0.18;
        const cx = gold ? sunX! : moon ? moonX! : Math.random() * VW;
        const x = gold || moon ? cx + (Math.random() - 0.5) * 2 * spread : cx;
        g.on = true;
        g.t0 = now;
        g.life = 500 + Math.random() * 900;
        if (gold) g.img.setTexture(Art.SEA_TEX.goldStreak).setTint(0xffffff).setScale(0.6 + d * 1.4, 1);
        else if (moon) g.img.setTexture(P + "px").setTint(0xfff0c8).setScale(1 + d * 2, 0.5);
        else g.img.setTexture(Art.SEA_TEX.sparkle).setTint(0xffffff).setScale(0.6 + d * 0.6);
        g.img.setPosition(Math.round(x), y).setVisible(true);
      }
      const u = (now - g.t0) / g.life;
      const a = Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
      g.img.setAlpha(a * (gold ? 0.9 : moon ? 0.75 : (1 - night) * 0.9));
    }
  }

  /** 물가 (모래 장면): 물때로 물가가 멀어지고, 파도는 지도와 같은 흐름으로 곳마다 다르게 밀려와요 */
  private updateShore(f: SeaViewFrame, shade: number, night: number, warm: number): void {
    if (!this.sand || !this.wash || !this.foam || !this.waves) return;
    const { VH } = this;
    const lounger = this.kind === "lounger";
    // 11/16 r12 사용자 "밀물 때 선베드가 물에 떠 있어요" → 물가 줄은 앉은 자리에서 지금 물가 선(물때)까지 실제 거리로 (원근, 지도와 같은 거리)
    const at = this.seatAt;
    const dLine = at ? Math.max(16, tideLineY(f.tide) - at.y) : 0;
    const shoreY = at
      ? Math.round(seaViewProject(0, dLine, this.VW, VH, this.hz)!.y)
      : Math.round(VH * ((lounger ? 0.8 : 0.64) + ((lounger ? 0.9 : 0.8) - (lounger ? 0.8 : 0.64)) * clamp01(f.tide)));
    const s0 = VIEW_FOCAL / Math.max(16, dLine);
    this.sand.setY(shoreY).setTint(shade);
    const ep = seaPal(night, warm, 0);
    const time = this.scene.time.now;
    const scroll = this.reduced ? 0 : time * 0.006;
    const W = this.wash;
    const F = this.foam;
    const WV = W.vertices;
    const FV = F.vertices;
    const FU = F.uv;
    const n = WV.length / 4;
    for (let i = 0; i < n; i++) {
      const x = i * RSTEP;
      // 파도가 밀려온 만큼(지도 px) 물가가 앉은 자리 쪽으로 — 원근으로 화면 줄로 (지도 동쪽 = 장면 왼쪽)
      const wx = at ? at.x - (x - this.VW / 2) / s0 : x * 3;
      const surgeW = this.reduced ? 2 : this.waves.surgeAt(time - shoreDelay(wx, time)) * shoreReach(wx, time);
      const edge = at ? Math.round(seaViewProject(0, Math.max(14, dLine - surgeW), this.VW, VH, this.hz)!.y) : Math.round(shoreY + surgeW * 0.32);
      const surge = edge - shoreY;
      const k = i * 4;
      WV[k] = x;
      WV[k + 1] = shoreY - 3;
      WV[k + 2] = x;
      WV[k + 3] = edge + 1;
      FV[k] = x;
      FV[k + 1] = edge - 26;
      FV[k + 2] = x;
      FV[k + 3] = edge + 3;
      FU[k] = FU[k + 2] = (x + scroll + surge * 2) / Art.FOAM_W;
      // 거품 머리(텍스처 맨 위 줄)가 물가(아래)로 오게 위아래를 뒤집어요
      FU[k + 1] = Art.FOAM_H / Art.FOAM_TEX_H;
      FU[k + 3] = 0;
    }
    W.dirty = F.dirty = false;
    W.colors.fill(mixRgb(ep.near, 0xffffff, 0.15));
    W.alphas.fill(0.85);
    F.colors.fill(mixRgb(0xffffff, shade, 0.6));
  }

  /** 앞 그림 색 · 배·부표 흔들림 · 방파제 물보라 · 등대 불빛 */
  private updateFore(f: SeaViewFrame, shade: number, night: number): void {
    const now = f.now;
    const k = this.reduced ? 0.3 : 1;
    if (this.kind === "lighthouse") this.updateLookout(f, night);
    for (const img of this.fore) img.setTint(shade);
    for (const img of this.landSprites) img.setTint(mixRgb(shade, 0xb8c4d8, 0.15));
    this.landGfx?.setAlpha(1 - night * 0.45);
    if (this.moored) {
      this.moored.setTint(shade).setY(Math.round(this.VH * 0.8 + Math.sin(now / 1100) * 1.6 * k)).setRotation(Math.sin(now / 1700) * 0.03 * k);
    }
    if (this.buoy) this.buoy.setTint(shade).setY(Math.round(this.hz + (this.VH - this.hz) * 0.35 + Math.sin(now / 800) * 1.4 * k)).setRotation(Math.sin(now / 650) * 0.14 * k);
    if (this.kind === "breakwater") {
      for (const t of this.tetras) t.setTint(shade);
      // 물보라: 들쭉날쭉 (느린 잡음이 기분을 바꿔요) + 큰 파도 꼭대기엔 몰아서
      const big = this.waves?.bigPeak(now, this.lastBig);
      let burst = 0;
      if (big) {
        this.lastBig = big.id;
        burst = this.reduced ? 1 : 4 + Math.floor(Math.random() * 6);
      }
      if (now >= this.nextSpray) {
        const mood = noise1(now / 7000, 51);
        this.nextSpray = now + (mood < 0.3 ? 1500 + Math.random() * 2000 : 300 + Math.random() * 1500) / (this.reduced ? 0.3 : 1);
        if (mood >= 0.3) burst += 1 + Math.floor(Math.random() * 2);
      }
      for (let b = 0; b < burst; b++) {
        const p = this.puffs.find((q) => !q.on);
        const t = this.tetras[Math.floor(Math.random() * this.tetras.length)];
        if (!p || !t) break;
        p.on = true;
        p.t0 = now + b * (40 + Math.random() * 120);
        p.life = 700 + Math.random() * 600;
        p.x = t.x + 10 + Math.random() * 30;
        p.y = t.y - 26 - Math.random() * 10;
        p.vy = 20 + Math.random() * 30;
      }
      for (const p of this.puffs) {
        if (!p.on) continue;
        const u = (now - p.t0) / p.life;
        if (u < 0) continue;
        if (u >= 1) {
          p.on = false;
          p.img.setVisible(false);
          continue;
        }
        const lift = p.vy * Math.sin(Math.PI * Math.min(1, u * 1.2));
        p.img.setVisible(true).setPosition(Math.round(p.x), Math.round(p.y - lift)).setScale(1.4 + u * 1.4).setAlpha((1 - u) * 0.95).setTint(mixRgb(0xffffff, shade, 0.4));
      }
      // 밤: 등대 불빛이 천천히 돌아요 (멀어지면 좁아지고, 다시 넓어져요)
      if (this.beam) {
        const on = clamp01((night - 0.3) * 2);
        const sweep = Math.sin(now / (this.reduced ? 6000 : 2600));
        // 뒤에서 오는 빛이라 옅게, 바다 쪽(아래)으로 기울어 좌우로 훑어요
        this.beam
          .setVisible(on > 0.01)
          .setPosition(this.lamp.x, this.lamp.y)
          .setRotation(Math.PI / 2 + sweep * 0.9)
          .setScale(1.2 + 0.6 * Math.abs(sweep), 1.4)
          .setAlpha(on * 0.28 * (0.5 + 0.5 * Math.abs(sweep)));
      }
    }
  }

  /** 11/16 등대 꼭대기: 고래 물줄기(가끔) · 유령선(토요일 밤) · 밤엔 등대 불빛이 바다를 훑어요 */
  private updateLookout(f: SeaViewFrame, night: number): void {
    const { VW, hz } = this;
    const now = f.now;
    if (this.spout) {
      if (this.spoutT0 < 0 && now >= this.spoutAt && night < 0.8) {
        this.spoutT0 = now;
        this.spoutX = VW * (0.15 + Math.random() * 0.7);
      }
      if (this.spoutT0 >= 0) {
        const u = (now - this.spoutT0) / 2600;
        if (u >= 1) {
          this.spoutT0 = -1;
          this.spout.setVisible(false);
          this.spoutAt = now + (this.reduced ? 40000 : 18000) + Math.random() * 30000;
        } else this.spout.setVisible(true).setPosition(Math.round(this.spoutX), hz + 6).setScale(0.6 + Math.sin(Math.PI * Math.min(1, u * 1.6)) * 0.8).setAlpha(Math.sin(Math.PI * u) * 0.9);
      }
    }
    if (this.ghost) {
      const on = !!f.ghost;
      this.ghost.setVisible(on);
      if (on) {
        // 수평선에서 천천히 다가와요 (4분에 한 번 처음부터)
        const u = ((now / 240000) % 1 + 1) % 1;
        this.ghost
          .setPosition(Math.round(VW * (0.2 + 0.25 * u)), Math.round(hz + 4 + u * 40))
          .setScale(0.5 + u * 1.3)
          .setAlpha((0.35 + 0.2 * Math.sin(now / 700)) * Math.min(1, u * 5));
      }
    }
    if (this.beam) {
      const on = Math.max(Math.min(1, (night - 0.3) * 2), f.fogLamp ?? 0);
      const sweep = Math.sin(now / (this.reduced ? 7000 : 3200));
      this.beam
        .setVisible(on > 0.01)
        .setRotation(-Math.PI / 2 + sweep * 1.1)
        .setScale(1.4 + Math.abs(sweep) * 0.6, 1.2)
        .setAlpha(on * 0.55);
    }
  }

  /** 갈매기 (가끔 하늘을 가로질러요, 밤엔 안 와요, 비 오면 드물게). 화면 가운데를 지날 때 울어요 */
  private updateGulls(now: number, night: number, rain: number, shade: number): void {
    const { VW, hz } = this;
    if (now >= this.nextGull) {
      const quiet = night > 0.6 ? 0.08 : rain > 0.3 ? 0.4 : 1;
      this.nextGull = now + (6000 + Math.random() * 12000) / quiet;
      const g = this.gulls.find((q) => !q.on);
      if (g && Math.random() < (night > 0.6 ? 0.3 : 1)) {
        const right = Math.random() < 0.5;
        g.on = true;
        g.called = false;
        g.t0 = now;
        g.vx = (right ? -1 : 1) * (16 + Math.random() * 14) * (this.reduced ? 0.4 : 1);
        g.x = right ? VW + 12 : -12;
        g.y = Math.round(hz * (0.25 + Math.random() * 0.5));
        g.img.setFlipX(!right).setScale(1 + Math.random() * 0.6);
      }
    }
    for (const g of this.gulls) {
      if (!g.on) continue;
      const t = (now - g.t0) / 1000;
      const x = g.x + g.vx * t;
      const y = g.y + Math.sin(t * 2.2) * 3;
      g.img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setFrame(Math.floor(now / 190) % 2).setTint(mixRgb(0xffffff, shade, 0.5));
      if (!g.called && Math.abs(x - VW / 2) < VW * 0.2) {
        g.called = true;
        if (Math.random() < 0.8) this.onGullCall?.(0.55 + Math.random() * 0.35, (x / VW) * 2 - 1);
      }
      if (x < -20 || x > VW + 20) {
        g.on = false;
        g.img.setVisible(false);
      }
    }
  }

  /** 같이 앉은 사람 뒷모습 (아래쪽, 크게) */
  private updateSitters(list: readonly SeaViewSitter[], night: number): void {
    const { VW, VH } = this;
    const tint = mixRgb(0xffffff, 0x6a7090, 0.2 + night * 0.45);
    const lounger = this.kind === "lounger";
    this.sitters.forEach((img, i) => {
      const r = list[i];
      if (!r || !this.scene.textures.exists(r.key)) {
        img.setVisible(false);
        return;
      }
      if (img.texture.key !== r.key || img.frame.name !== String(r.frame)) img.setTexture(r.key, r.frame);
      const gap = r.of > 2 ? 30 : 40;
      // 11/16 r12 바다(남쪽)를 보니 서쪽 자리(앞 번호)는 화면 오른쪽 — 지도 동쪽 = 장면 왼쪽 (장면 앞 그림과 같은 규칙)
      const x = VW / 2 - (r.slot - (r.of - 1) / 2) * gap;
      img
        .setVisible(!lounger)
        .setPosition(Math.round(x), VH + 10)
        .setTint(tint);
    });
  }

  destroy(): void {
    this.game.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.clear();
    this.black = null;
    this.kind = null;
    this.game.scene.remove(this.key);
  }
}

/** 하늘 색: 낮·노을·밤·흐림 (시안 파스텔) */
function skyPal(night: number, warm: number, grey: number): Pal {
  const DAY: Pal = { top: 0x86bde6, mid: 0xb4dbf0, low: 0xe4f3f5 };
  const SET: Pal = { top: 0x7078b6, mid: 0xe0a0b4, low: 0xffcf98 };
  const NIGHT: Pal = { top: 0x070c24, mid: 0x121c42, low: 0x26335f };
  const GREY: Pal = { top: 0x8a94a2, mid: 0xa6afb9, low: 0xc4cbd2 };
  const out = {} as Pal;
  for (const key of ["top", "mid", "low"] as const) {
    let c = mixRgb(DAY[key], SET[key], warm);
    c = mixRgb(c, GREY[key], grey * (1 - night * 0.5));
    c = mixRgb(c, NIGHT[key], night);
    out[key] = c;
  }
  return out;
}
/** 바다 색: 멀리(수평선) · 가운데 · 가까이 */
function seaPal(night: number, warm: number, grey: number): V.SeaPal {
  const DAY = { far: 0x4a86b8, mid: 0x5fb0cf, near: 0x9fdedd };
  const SET = { far: 0x6c5f9c, mid: 0xc48aa8, near: 0xf2b39a };
  const NIGHT = { far: 0x081128, mid: 0x102044, near: 0x1d3258 };
  const GREY = { far: 0x5d7280, mid: 0x7a929c, near: 0xa3b6bb };
  const out = {} as V.SeaPal;
  for (const key of ["far", "mid", "near"] as const) {
    let c = mixRgb(DAY[key], SET[key], warm);
    c = mixRgb(c, GREY[key], grey * (1 - night * 0.5));
    c = mixRgb(c, NIGHT[key], night);
    out[key] = c;
  }
  return out;
}
/** 하늘 그라데이션 (1 × h, 가로로 늘려 써요 — 디더 단계) */
function skyGrid(h: number, p: Pal): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) return c;
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const N = 12;
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    for (let i = 0; i < 4; i++) {
      const f = t * N;
      const s = Math.floor(f) + (f - Math.floor(f) > (B[((y & 3) << 2) | i] + 0.5) / 16 ? 1 : 0);
      const u = Math.min(N, s) / N;
      const col = u < 0.6 ? mixRgb(p.top, p.mid, u / 0.6) : mixRgb(p.mid, p.low, (u - 0.6) / 0.4);
      x.fillStyle = `#${col.toString(16).padStart(6, "0")}`;
      x.fillRect(i, y, 1, 1);
    }
  }
  return c;
}
