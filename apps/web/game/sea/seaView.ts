import * as Phaser from "phaser";
import type { SeaViewKind } from "@tomb/protocol";
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
/** 11/16 벤치 앞 줄 (벤치에서 본 파라솔·선베드 — 벤치 x에서 월드 px만큼 옆, row 0 = 바로 앞 줄, 1 = 그 앞 줄) */
export type SeaViewFore = { parasols: readonly { dx: number; v: number }[]; loungers: readonly { dx: number; row: number }[] };
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
const HORIZON: Record<SeaViewKind, number> = { beach: 0.42, mat: 0.42, parasol: 0.44, lounger: 0.6, pier: 0.36, breakwater: 0.4 };

export class SeaView {
  private readonly scene: ViewScene;
  private readonly key: string;
  private kind: SeaViewKind | null = null;
  private variant = 0;
  private mat = 0;
  private foreSpec: SeaViewFore | null = null;
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
  private lighthouse: Phaser.GameObjects.Image | null = null;
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
  get active(): SeaViewKind | null {
    return this.kind;
  }

  /** 장면 시작 (variant = 파라솔 갓 색, mat = 돗자리 색) */
  begin(kind: SeaViewKind, variant: number, mat: number, fore: SeaViewFore | null = null): void {
    if (this.kind === kind && this.variant === variant && this.mat === mat && this.foreSpec === fore) return;
    this.clear();
    this.kind = kind;
    this.variant = variant;
    this.mat = mat;
    this.foreSpec = fore;
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
    this.moored = this.buoy = this.lighthouse = this.beam = null;
    this.tetras = [];
    this.puffs = [];
    const beachy = kind === "beach" || kind === "mat" || kind === "parasol" || kind === "lounger";
    if (beachy) {
      const sandH = Math.round(VH * 0.5);
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
        const K = 1.7;
        const backY = Math.round(VH * 0.93);
        const frontY = Math.round(VH * 0.83);
        const lbKey = this.tex(P + "loungerBack", () => V.loungerBackArt());
        const headKey = this.tex(P + "head", () => V.lyingHead());
        for (const l of fs.loungers) {
          const near = l.row === 0;
          const sc2 = near ? 2.2 : 1.5;
          const x = Math.round(VW / 2 + l.dx * K * (near ? 1 : 0.8));
          const y = near ? backY : frontY;
          const img = this.add(sc.add.image(x, y, lbKey).setOrigin(0.5, 1).setScale(sc2).setDepth(near ? 16 : 14));
          const head = this.add(sc.add.image(x, y - 22 * sc2, headKey).setOrigin(0.5, 1).setScale(sc2).setDepth(near ? 16.5 : 14.5).setVisible(false));
          this.fore.push(img);
          this.foreLoungers.push({ img, head });
        }
        for (const p of fs.parasols) {
          const x = Math.round(VW / 2 + p.dx * K);
          // 갓이 화면 위를 다 덮지 않게 조금 작게 (선베드 줄 뒤에서 보는 크기)
          this.fore.push(this.add(sc.add.image(x, backY - 6, Art.SEA_TEX.parasol(p.v)).setOrigin(0.5, 1).setScale(1.8).setDepth(17)));
        }
      }
    } else if (kind === "pier") {
      this.moored = this.add(sc.add.image(Math.round(VW * 0.86), Math.round(VH * 0.8), Art.SEA_TEX.boat).setOrigin(0.5, 1).setDepth(13).setScale(2));
      this.buoy = this.add(sc.add.image(Math.round(VW * 0.18), Math.round(hz + (VH - hz) * 0.35), Art.SEA_TEX.buoy).setOrigin(0.5, 1).setDepth(13).setScale(2));
      this.fore.push(this.add(sc.add.image(0, VH, this.tex(`${P}deck-${VW}`, () => V.deckBand(VW))).setOrigin(0, 1).setDepth(20)));
    } else {
      // 방파제 끝: 오른쪽에 등대 기둥, 아래 테트라포드 줄 (물보라가 부서져요)
      const colH = Math.round(VH * 0.92);
      const lx = VW - 30;
      this.lighthouse = this.add(sc.add.image(lx, VH, this.tex(`${P}lighthouse-${colH}`, () => V.lighthouseColumn(colH))).setOrigin(0.5, 1).setDepth(22));
      this.lamp = { x: lx, y: VH - colH + 12 };
      // 불빛은 등불에서 왼쪽 바다 쪽으로 (뾰족한 끝이 등불)
      this.beam = this.add(sc.add.image(this.lamp.x, this.lamp.y, this.tex(P + "beam", () => V.beamWedge())).setOrigin(1, 0.5).setDepth(23).setBlendMode(Phaser.BlendModes.ADD).setFlipX(true).setVisible(false));
      for (let x = -8, i = 0; x < VW - 40; x += 26 + (i % 2) * 6, i++) {
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
    this.moored = this.buoy = this.lighthouse = this.beam = null;
    this.rain = this.snow = this.fog = null;
    this.foreLoungers = [];
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
      this.clear();
      this.kind = k;
      this.variant = v;
      this.mat = m;
      this.foreSpec = fs;
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
    const near = lounger ? 0.9 : 0.8;
    const far = lounger ? 0.8 : 0.64;
    const shoreY = Math.round(VH * (far + (near - far) * clamp01(f.tide)));
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
      // 지도 파도 px를 장면 크기로 (가까운 물가라 지도보다 조금 크게)
      const surge = this.reduced ? 2 : this.waves.surgeAt(time - shoreDelay(x * 3, time)) * shoreReach(x * 3, time) * 0.32;
      const edge = Math.round(shoreY + surge);
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
    for (const img of this.fore) img.setTint(shade);
    if (this.moored) {
      this.moored.setTint(shade).setY(Math.round(this.VH * 0.8 + Math.sin(now / 1100) * 1.6 * k)).setRotation(Math.sin(now / 1700) * 0.03 * k);
    }
    if (this.buoy) this.buoy.setTint(shade).setY(Math.round(this.hz + (this.VH - this.hz) * 0.35 + Math.sin(now / 800) * 1.4 * k)).setRotation(Math.sin(now / 650) * 0.14 * k);
    if (this.lighthouse) {
      this.lighthouse.setTint(mixRgb(shade, 0xffffff, 0.06));
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
        this.beam.setVisible(on > 0.01).setPosition(this.lamp.x, this.lamp.y).setScale(0.3 + 1.7 * Math.abs(sweep), 1 + 0.3 * Math.abs(sweep)).setAlpha(on * (0.35 + 0.65 * Math.abs(sweep)));
      }
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
      const x = VW / 2 + (r.slot - (r.of - 1) / 2) * gap;
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
