import * as Phaser from "phaser";
import { DIR } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { CosmeticFxView, type CfxDepth } from "../entities/CosmeticFxView";
import { avatarArtTop, BODY_METRICS, bodyOf, handAnchor } from "../sprites/avatar";
import { radial } from "../sprites/pixel";
import * as art from "../sprites/skyScenery";
import { BALLOON_COLORS, CAR_COLORS, SKY_TEX } from "../sprites/skyProps";
import type { Levels } from "./ambienceMix";
import { mixRgb, mulRgb } from "./skyGrade";
import { balloonRouteS, carAngle, ferrisLift, flightLift, routeLength, routeSegments, type BalloonState } from "./skyMath";

// 놀이기구 2: 탑승 중 화면 — 옆에서 본 2D 도트 애니메이션 장면 (기울이기·원근 변형 없음).
// 월드 씬 위에 얹는 작은 Phaser 씬(StageScene)에 그린다. 카메라는 줌 s(정수)로 도트 한 칸 = 화면 s px, 장면 좌표(가상 px)는 화면 왼쪽 위가 (0,0).
//  - 층(먼 산 → 먼 언덕 → 중간 → 가까운 층)은 탈 때 한 번 그려 텍스처로 캐시하고(skyScenery) 위치만 옮긴다 (시차: 가까울수록 많이 움직인다)
//  - 관람차: 칸 높이(서버 시계 각도)만큼 층들이 아래로 내려간다. 꼭대기 근처에서는 잠시 머문다(ferrisLift). 옆으로 바퀴 살·다른 칸이 지나간다
//  - 열기구: 항로 위 거리만큼 땅 띠가 옆으로 흐르고(구역 차례 = 실제 항로), 높이(flightLift)만큼 땅이 내려간다. 이륙장 둘레는 이륙·착륙 때만 보인다
//  - 시간대·날씨: 층마다 월드 색(Atmosphere levels)을 곱하고, 하늘 그라데이션·별·달·구름·비·눈·안개, 밤 불빛 층, 폭죽
//  - 시작·끝은 검은 화면으로 덮었다 걷는다 (fade). 끝난 뒤에는 cover로 월드 화면 위 검은 막만 걷는다

/** look·body·champ = 착용 오라·전용 오라를 장면 안에서도 그리려고 (없으면 그림만) */
export type StageRider = { key: string; frame: number; index: number; look?: readonly string[]; body?: string; champ?: number };
export type StageFrame = {
  /** 씬 시간 ms (애니메이션) */
  now: number;
  dt: number;
  levels: Levels;
  /** 0 = 검은 화면 … 1 = 장면이 다 보임 */
  fade: number;
  riders: readonly StageRider[];
  /** 관람차: 서버 시계 (칸 각도) */
  t: number;
  /** 열기구 상태와 버너 불꽃 세기 0..1 */
  balloon?: { st: BalloonState; burn: number };
};

const P = "skyst-";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const gray = (k: number) => {
  const v = Math.round(clamp01(k) * 255);
  return (v << 16) | (v << 8) | v;
};

/** 띠 좌표 여백 (항로 처음·끝 바깥으로 화면 반쪽보다 넉넉히) */
const STRIP_M = 300;

class StageScene extends Phaser.Scene {
  ready = false;
  create(): void {
    this.cameras.main.setOrigin(0, 0);
    this.ready = true;
  }
}

type Meta = { w: number; h: number; fill: number; glint: boolean; fires: art.Band["fires"] };
const metas = new Map<string, Meta>();

type Fire = { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number; big: boolean };
type BandView = {
  meta: Meta;
  img: Phaser.GameObjects.TileSprite;
  lit: Phaser.GameObjects.TileSprite;
  gl: [Phaser.GameObjects.TileSprite, Phaser.GameObjects.TileSprite] | null;
  fill: Phaser.GameObjects.Image;
  haze: Phaser.GameObjects.Image;
  fires: Fire[];
  /** 거리별 기본 옅은 막 · 안개 · 흐림 세기 */
  air: [number, number, number];
};
type Cloud = { img: Phaser.GameObjects.Image; x0: number; y: number; speed: number; par: number };
type Spark = { img: Phaser.GameObjects.Image; vx: number; vy: number; born: number; life: number };
type Rocket = { x: number; y0: number; y1: number; at: number; color: number; done: boolean; trail: Phaser.GameObjects.Image };

let seq = 0;

export class SkyStage {
  private readonly scene: StageScene;
  private readonly key: string;
  private kind: "ferris" | "balloon" | null = null;
  private unit = 0;
  private built = false;
  private dirty = false;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private sizedKeys: string[] = [];
  private depth = 0;
  /** 화면 크기: 도트 배율 s, 장면 크기 VW×VH (가상 px) */
  private s = 1;
  private VW = 0;
  private VH = 0;
  private skyKey = "";
  private skyCheck = 0;
  private black: Phaser.GameObjects.Image | null = null;
  private cover = 0;
  // 장면 물체
  private sky: Phaser.GameObjects.TileSprite | null = null;
  private starA: Phaser.GameObjects.TileSprite | null = null;
  private starB: Phaser.GameObjects.TileSprite | null = null;
  private moonImg: Phaser.GameObjects.Image | null = null;
  private sunImg: Phaser.GameObjects.Image | null = null;
  private bands: Record<string, BandView> = {};
  private clouds: Cloud[] = [];
  private front: Cloud[] = [];
  private birds: Phaser.GameObjects.Image[] = [];
  private sparks: Spark[] = [];
  private freeSparks: Phaser.GameObjects.Image[] = [];
  private rockets: Rocket[] = [];
  private pendingFw = 0;
  private rain: Phaser.GameObjects.TileSprite | null = null;
  private snow: Phaser.GameObjects.TileSprite | null = null;
  private fog: Phaser.GameObjects.Image | null = null;
  private riders: Phaser.GameObjects.Image[] = [];
  /** 탄 사람마다 착용 오라·전용 오라 (그 사람 그림 depth 바로 앞뒤 — 칸·바구니 테두리 아래) */
  private riderFx: (CosmeticFxView | null)[] = [];
  private riderFxKey: string[] = [];
  private frameImg: Phaser.GameObjects.Image | null = null;
  private sill = 0;
  private wheel: Phaser.GameObjects.Graphics | null = null;
  private cars: { back: Phaser.GameObjects.Image; front: Phaser.GameObjects.Image; c: number }[] = [];
  private jet: Phaser.GameObjects.Sprite | null = null;
  private jetGlow: Phaser.GameObjects.Image | null = null;
  private burner = { x: 0, y: 0 };
  private stripK = 0.9;

  constructor(
    private readonly game: Phaser.Game,
    private readonly reduced: boolean,
  ) {
    this.key = `sky-stage-${++seq}`;
    this.scene = new StageScene({ key: this.key });
    game.scene.add(this.key, this.scene, true);
    game.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize(): void {
    this.dirty = true;
  }

  /** 장면을 그리는 중(또는 검은 막이 남아 있는 중)인지 */
  get busy(): boolean {
    return this.kind !== null || this.cover > 0.004;
  }

  /** 장면이 화면을 다 덮었는지 (월드 카메라를 쉬게 해도 되는지) */
  get opaque(): boolean {
    return this.built && this.kind !== null;
  }

  /** 탑승 장면 시작 (텍스처는 처음 한 번만 그린다) */
  begin(kind: "ferris" | "balloon", unit: number): void {
    if (this.kind === kind && this.unit === unit) return;
    this.clear();
    this.kind = kind;
    this.unit = unit;
    this.cover = 0;
  }

  /** 탑승 장면 끝: 물체를 지우고, 월드 화면 위 검은 막(cover)을 남긴다 */
  end(cover: number): void {
    this.clear();
    this.kind = null;
    this.cover = cover;
    this.sync();
  }

  /** 마을에서 폭죽이 터졌다 → 하늘에도 */
  firework(): void {
    if (this.kind) this.pendingFw = Math.min(6, this.pendingFw + 1);
  }

  /** 탑승 장면 밖: 검은 막 걷기 */
  idle(dt: number): void {
    if (this.cover <= 0) return;
    this.cover = Math.max(0, this.cover - dt / 450);
    this.sync();
  }

  /** 장면 없이(맵 위 보기) 월드 화면 위 검은 막을 직접 맞춘다 (0~1, 시점 바꾸기·내리기 전환) */
  veil(a: number): void {
    if (this.kind) return;
    this.cover = clamp01(a);
    this.sync();
  }

  hide(): void {
    this.scene.cameras?.main?.setVisible(false);
  }

  private sync(): void {
    if (!this.scene.ready) return;
    const cam = this.scene.cameras.main;
    this.ensureBlack();
    if (!this.kind) {
      this.black?.setAlpha(this.cover).setVisible(this.cover > 0.004);
      cam.setVisible(this.cover > 0.004);
    }
  }

  private ensureBlack(): void {
    const sc = this.scene;
    this.ensurePx();
    this.layout();
    if (!this.black) this.black = sc.add.image(0, 0, P + "px").setOrigin(0, 0).setTint(0x000000).setDepth(1e6);
    this.black.setDisplaySize(this.VW + 2, this.VH + 2);
  }

  /** 흰 점 텍스처 (채우기·막·불티) */
  private ensurePx(): void {
    const sc = this.scene;
    if (!sc.textures.exists(P + "px")) {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const x = c.getContext("2d");
      if (x) {
        x.fillStyle = "#fff";
        x.fillRect(0, 0, 2, 2);
      }
      addCanvasTexture(sc, P + "px", { canvas: c });
    }
  }

  /** 화면 크기 → 도트 배율·장면 크기·카메라 */
  private layout(): void {
    const W = Math.max(1, this.game.scale.width);
    const H = Math.max(1, this.game.scale.height);
    this.s = Math.max(1, Math.ceil(Math.max(W, H) / 440));
    this.VW = Math.ceil(W / this.s);
    this.VH = Math.ceil(H / this.s);
    const cam = this.scene.cameras.main;
    cam.setSize(W, H);
    cam.setOrigin(0, 0);
    cam.setZoom(this.s);
    cam.setScroll(0, 0);
    cam.setRoundPixels(true);
  }

  // ── 만들기 ──

  private tex(key: string, make: () => HTMLCanvasElement, frameW?: number, frameH?: number): string {
    if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, { canvas: make(), frameW, frameH });
    return key;
  }

  /** 화면 크기에 따라 다시 그리는 텍스처 (지난 것은 지운다) */
  private sized(key: string, canvas: HTMLCanvasElement): string {
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    addCanvasTexture(this.scene, key, { canvas });
    this.sizedKeys.push(key);
    return key;
  }

  private bandMeta(key: string, make: () => art.Band): Meta {
    let m = metas.get(key);
    if (m && this.scene.textures.exists(key)) return m;
    const b = make();
    for (const k of [key, key + ":lit", key + ":g0", key + ":g1"]) if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    addCanvasTexture(this.scene, key, { canvas: b.base });
    addCanvasTexture(this.scene, key + ":lit", { canvas: b.lights });
    if (b.glint) {
      addCanvasTexture(this.scene, key + ":g0", { canvas: b.glint[0] });
      addCanvasTexture(this.scene, key + ":g1", { canvas: b.glint[1] });
    }
    m = { w: b.w, h: b.h, fill: b.fill, glint: !!b.glint, fires: b.fires };
    metas.set(key, m);
    return m;
  }

  private add<T extends Phaser.GameObjects.GameObject & { setDepth(d: number): unknown }>(o: T): T {
    o.setDepth(this.depth++);
    this.objs.push(o);
    return o;
  }

  private pxImg(): Phaser.GameObjects.Image {
    return this.add(this.scene.add.image(0, 0, P + "px").setOrigin(0, 0));
  }

  private makeBand(key: string, make: () => art.Band, air: [number, number, number]): BandView {
    const sc = this.scene;
    const meta = this.bandMeta(key, make);
    const ts = (k: string) => this.add(sc.add.tileSprite(0, 0, this.VW, meta.h, k).setOrigin(0, 0));
    const fill = this.pxImg();
    const img = ts(key);
    const gl: BandView["gl"] = meta.glint ? [ts(key + ":g0"), ts(key + ":g1")] : null;
    const lit = ts(key + ":lit");
    const fires: Fire[] = meta.fires.map((f) => {
      const glow = this.add(sc.add.image(0, 0, P + "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040));
      const img = this.add(sc.add.image(0, 0, f.big ? P + "fire-b" : P + "fire-s", 0).setOrigin(0.5, 1));
      return { img, glow, x: f.x, y: f.y, big: f.big };
    });
    const haze = this.pxImg();
    return { meta, img, lit, gl, fill, haze, fires, air };
  }

  private build(): void {
    const sc = this.scene;
    this.layout();
    this.ensurePx();
    this.depth = 0;
    const { VW, VH } = this;
    this.tex(P + "glow", () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.4, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
    this.tex(P + "fire-s", () => art.fireSheet(false), art.FIRE_W.small, art.FIRE_H.small);
    this.tex(P + "fire-b", () => art.fireSheet(true), art.FIRE_W.big, art.FIRE_H.big);
    this.tex(P + "jet", () => art.jetSheet(), art.JET_W, art.JET_H);
    this.tex(P + "bird", () => art.birdSheet(), 7, 4);
    this.tex(P + "rain", () => art.rainTile());
    this.tex(P + "snow", () => art.snowTile());
    this.tex(P + "stars0", () => art.stars(256, 160, 7));
    this.tex(P + "stars1", () => art.stars(256, 160, 19));
    this.tex(P + "moon", () => art.moon());
    this.tex(P + "sun", () => art.sun());
    for (let v = 0; v < 4; v++) this.tex(P + "cloud" + v, () => art.cloud(v));

    // 하늘
    this.skyKey = "";
    this.sky = this.add(sc.add.tileSprite(0, 0, VW, VH, P + "px").setOrigin(0, 0));
    this.starA = this.add(sc.add.tileSprite(0, 0, VW, Math.round(VH * 0.6), P + "stars0").setOrigin(0, 0));
    this.starB = this.add(sc.add.tileSprite(0, 0, VW, Math.round(VH * 0.6), P + "stars1").setOrigin(0, 0));
    this.sunImg = this.add(sc.add.image(0, 0, P + "sun"));
    this.moonImg = this.add(sc.add.image(0, 0, P + "moon"));
    // 폭죽 (하늘, 산 앞 구름 뒤)
    this.freeSparks = [];
    for (let i = 0; i < 90; i++) this.freeSparks.push(this.add(sc.add.image(0, 0, P + "px").setBlendMode(Phaser.BlendModes.ADD).setVisible(false)));
    // 뒤 구름
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const img = this.add(sc.add.image(0, 0, P + "cloud" + (i % 4)).setOrigin(0.5, 1));
      this.clouds.push({ img, x0: (i * 0.37 + 0.1) * 997, y: 0.1 + ((i * 0.29) % 0.22), speed: 0.6 + (i % 3) * 0.35, par: 0.06 + (i % 2) * 0.04 });
    }
    // 층
    this.bands = {};
    this.bands.mtn = this.makeBand(P + "mtn", () => art.mountains(384, 64, 3), [0.42, 0.5, 0.3]);
    if (this.kind === "ferris") {
      this.bands.far = this.makeBand(P + "f-far", () => art.ferrisFar(), [0.26, 0.42, 0.22]);
      this.birdsMake();
      this.bands.mid = this.makeBand(P + "f-mid", () => art.ferrisMid(), [0.1, 0.3, 0.12]);
      this.bands.near = this.makeBand(P + "f-near", () => art.ferrisNear(), [0.02, 0.14, 0.04]);
      // 바퀴 살·다른 칸
      this.wheel = this.add(sc.add.graphics());
      this.cars = [];
      for (let c = 0; c < 6; c++) {
        if (c === this.unit) continue;
        const v = c % CAR_COLORS.length;
        const back = this.add(sc.add.image(0, 0, SKY_TEX.carBack(v)).setOrigin(0.5, 0).setScale(2));
        const front = this.add(sc.add.image(0, 0, SKY_TEX.carFront(v)).setOrigin(0.5, 0).setScale(2));
        this.cars.push({ back, front, c });
      }
    } else {
      this.bands.far = this.makeBand(P + "b-far", () => art.balloonFar(), [0.26, 0.42, 0.22]);
      this.birdsMake();
      this.bands.mid = this.makeBand(P + "b-mid", () => art.balloonMid(), [0.12, 0.3, 0.12]);
      const L = routeLength();
      this.stripK = Math.min(0.9, (4000 - STRIP_M * 2) / L) * (this.reduced ? 0.4 : 1);
      const k = this.stripK;
      this.bands.strip = this.makeBand(P + "b-strip" + (this.reduced ? "-r" : ""), () =>
        art.balloonStrip(
          Math.ceil(L * k + STRIP_M * 2),
          routeSegments().map((g) => ({ x0: STRIP_M + g.s0 * k, x1: STRIP_M + g.s1 * k, id: g.id })),
        ),
        [0.03, 0.16, 0.05],
      );
      this.bands.field = this.makeBand(P + "b-field", () => art.balloonField(), [0, 0.08, 0.02]);
      this.front = [];
      for (let i = 0; i < 2; i++) {
        const img = this.add(sc.add.image(0, 0, P + "cloud" + (i === 0 ? 3 : 1)).setOrigin(0.5, 1).setScale(2));
        this.front.push({ img, x0: i * 900, y: 0.3 + i * 0.1, speed: 1.4, par: 1.5 });
      }
    }
    // 날씨
    this.rain = this.add(sc.add.tileSprite(0, 0, VW, VH, P + "rain").setOrigin(0, 0));
    this.snow = this.add(sc.add.tileSprite(0, 0, VW, VH, P + "snow").setOrigin(0, 0));
    this.fog = this.pxImg().setDisplaySize(VW, VH);
    // 탄 사람
    this.riders = [];
    for (let i = 0; i < 4; i++) this.riders.push(this.add(sc.add.image(0, 0, P + "px").setOrigin(0.5, 1).setVisible(false)));
    // 오라 층: 탄 사람 그림 depth 바로 앞뒤에만 (장면 물체는 차례대로 정수 depth라 테두리·날씨 아래에 머문다)
    sc.data.set("cfxDepth", { ground: "body", lightOnBody: true } satisfies CfxDepth);
    // 테두리
    if (this.kind === "ferris") {
      const w = art.ferrisWindow(VW, VH, CAR_COLORS[this.unit % CAR_COLORS.length]);
      this.sill = w.sill;
      this.frameImg = this.add(sc.add.image(0, 0, this.sized(`${P}win-${VW}x${VH}-${this.unit}`, w.canvas)).setOrigin(0, 0));
    } else {
      const cols = BALLOON_COLORS[this.unit % BALLOON_COLORS.length];
      const r = art.balloonRig(VW, VH, cols);
      this.sill = r.rim;
      this.burner = r.burner;
      this.frameImg = this.add(sc.add.image(0, 0, this.sized(`${P}rig-${VW}x${VH}-${this.unit}`, r.canvas)).setOrigin(0, 0));
      this.jetGlow = this.add(sc.add.image(r.burner.x, r.burner.y, P + "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb050));
      this.jet = this.add(sc.add.sprite(r.burner.x, r.burner.y, P + "jet", 0).setOrigin(0.5, 1));
    }
    this.ensureBlack();
    this.built = true;
  }

  private birdsMake(): void {
    this.birds = [];
    for (let i = 0; i < 5; i++) this.birds.push(this.add(this.scene.add.image(0, 0, P + "bird", 0)));
  }

  private clear(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    for (const k of this.sizedKeys) if (this.scene.textures?.exists(k)) this.scene.textures.remove(k);
    this.sizedKeys = [];
    if (this.skyKey && this.scene.textures?.exists(this.skyKey)) this.scene.textures.remove(this.skyKey);
    this.skyKey = "";
    this.sky = this.starA = this.starB = this.rain = this.snow = null;
    this.moonImg = this.sunImg = this.fog = this.frameImg = this.jetGlow = null;
    this.wheel = null;
    this.jet = null;
    for (const fx of this.riderFx) fx?.destroy();
    this.riderFx = [];
    this.riderFxKey = [];
    this.bands = {};
    this.clouds = [];
    this.front = [];
    this.birds = [];
    this.sparks = [];
    this.freeSparks = [];
    this.rockets = [];
    this.riders = [];
    this.cars = [];
    this.built = false;
  }

  // ── 매 프레임 ──

  frame(f: StageFrame): void {
    if (!this.kind || !this.scene.ready) return;
    if (this.dirty || !this.built) {
      this.dirty = false;
      const kind = this.kind;
      this.clear();
      this.kind = kind;
      this.build();
    }
    const cam = this.scene.cameras.main;
    cam.setVisible(true);
    const { VW, VH } = this;
    const L = f.levels;
    // 색: 시간대·날씨
    const night = clamp01(L.darkness * 1.25);
    const tr = (L.tint >> 16) & 255;
    const tb = L.tint & 255;
    const warm = clamp01((tr - tb) / 95) * (1 - night * 0.8);
    const grey = clamp01(L.cloud * 0.45 + L.rain * 0.8 + L.fog * 0.5 + L.snow * 0.35);
    const pal = skyPalette(night, warm, grey, L.tint);
    const shade = mulRgb(L.tint, gray(1 - 0.58 * clamp01(L.darkness)));
    const lightsA = clamp01((night - 0.12) * 1.7);
    this.skyUpdate(f.now, pal);
    const starA = clamp01((night - 0.3) * 1.8) * (1 - grey * 0.85);
    const tw = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(f.now / 1400);
    this.starA?.setAlpha(starA * (0.55 + 0.45 * tw));
    this.starB?.setAlpha(starA * (1 - 0.45 * tw));
    const hz = Math.round(VH * (this.kind === "ferris" ? 0.4 : 0.36));
    this.moonImg?.setPosition(Math.round(VW * 0.8), Math.round(VH * (this.kind === "ferris" ? 0.17 : 0.26))).setAlpha(starA);
    this.sunImg?.setPosition(Math.round(VW * 0.24), hz - 4).setAlpha(warm * (1 - grey));
    const cloudTint = mixRgb(mixRgb(mixRgb(0xffffff, 0xffc8a8, warm), 0x3a4064, night), mixRgb(0xa8aeb6, 0x30343e, night), grey * 0.7);
    const air = { pal, shade, night, lightsA, fog: L.fog, haze: L.haze };

    if (this.kind === "ferris") this.ferrisFrame(f, hz, air, cloudTint);
    else this.balloonFrame(f, hz, air, cloudTint);

    // 날씨 (장면 전체, 테두리 아래)
    const k = this.reduced ? 0.35 : 1;
    if (this.rain) {
      this.rain.setAlpha(clamp01(L.rain) * 0.85).setVisible(L.rain > 0.02);
      this.rain.tilePositionY -= f.dt * 0.16 * k;
      this.rain.tilePositionX += f.dt * 0.05 * k;
    }
    if (this.snow) {
      this.snow.setAlpha(clamp01(L.snow)).setVisible(L.snow > 0.02);
      this.snow.tilePositionY -= f.dt * 0.018 * k;
      this.snow.tilePositionX = Math.sin(f.now / 1500) * 6 * k;
    }
    this.fog?.setTint(pal.low).setAlpha(clamp01(L.fog * 0.3 + L.haze * 0.12));
    this.fireworks(f.now, f.dt);
    this.ridersUpdate(f.riders, night, f.now, f.dt);
    // 테두리(칸·바구니)는 가까이 있어 덜 어둡게 (밤에는 칸 안 불빛)
    this.frameImg?.setTint(mixRgb(shade, 0xffffff, 0.45));
    this.black?.setAlpha(1 - clamp01(f.fade)).setVisible(f.fade < 0.999);
  }

  private skyUpdate(now: number, pal: Pal): void {
    if (!this.sky) return;
    if (now < this.skyCheck && this.skyKey) return;
    this.skyCheck = now + 1_500;
    const q = (c: number) => (c >> 3) & 0x1f1f1f;
    const key = `${P}sky-${this.VH}-${q(pal.top)}-${q(pal.mid)}-${q(pal.low)}`;
    if (key === this.skyKey) return;
    const hz = Math.round(this.VH * (this.kind === "ferris" ? 0.4 : 0.36));
    const old = this.skyKey;
    if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, { canvas: art.skyGradient(this.VH, hz + 6, pal.top, pal.mid, pal.low) });
    this.sky.setTexture(key).setSize(this.VW, this.VH);
    this.skyKey = key;
    if (old && old !== key && this.scene.textures.exists(old)) this.scene.textures.remove(old);
  }

  private placeBand(b: BandView | undefined, scroll: number, ground: number, groundInBand: number, a: Air, now: number): number {
    if (!b) return 0;
    const top = Math.round(ground - groundInBand);
    const { VW, VH } = this;
    const m = b.meta;
    for (const o of [b.img, b.lit, ...(b.gl ?? [])]) {
      o.setPosition(0, top);
      o.tilePositionX = scroll;
    }
    b.img.setTint(a.shade);
    b.lit.setAlpha(a.lightsA).setVisible(a.lightsA > 0.01);
    if (b.gl) {
      const ph = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 420);
      const k = 0.85 * (1 - a.night * 0.65);
      b.gl[0].setAlpha(k * ph);
      b.gl[1].setAlpha(k * (1 - ph));
    }
    const fy = top + m.h;
    b.fill.setPosition(-1, fy).setDisplaySize(VW + 2, Math.max(0, VH - fy + 2)).setTint(mulRgb(m.fill, a.shade)).setVisible(fy < VH);
    const hz = clamp01(b.air[0] * (1 - a.night * 0.4) + a.fog * b.air[1] + a.haze * b.air[2]);
    b.haze.setPosition(-1, top).setDisplaySize(VW + 2, Math.max(0, VH - top + 2)).setTint(a.pal.low).setAlpha(hz).setVisible(hz > 0.01 && top < VH);
    b.fires.forEach((fi, i) => {
      let x = (((fi.x - scroll) % m.w) + m.w) % m.w;
      if (x > VW + 30) x -= m.w;
      const y = top + fi.y;
      const vis = x > -30 && x < VW + 30 && y > -30 && y < VH + 40;
      fi.img.setVisible(vis);
      fi.glow.setVisible(vis);
      if (!vis) return;
      const fr = Math.floor(now / (this.reduced ? 260 : 110) + i * 7) % 3;
      fi.img.setFrame(fr).setPosition(Math.round(x), y + 1);
      const flick = this.reduced ? 1 : 0.9 + 0.1 * Math.sin(now / 90 + i);
      fi.glow
        .setPosition(Math.round(x), y - (fi.big ? 8 : 4))
        .setScale((fi.big ? 2.2 : 1.1) * flick)
        .setAlpha(0.2 + a.night * 0.55);
    });
    return top;
  }

  private cloudsUpdate(list: Cloud[], drift: number, now: number, tint: number, alpha: number, count: number, gap = 320): void {
    const { VW, VH } = this;
    const span = VW + gap;
    list.forEach((c, i) => {
      const x = ((((c.x0 - drift * c.par - now * 0.004 * c.speed * (this.reduced ? 0.4 : 1)) % span) + span) % span) - gap / 2;
      c.img
        .setPosition(Math.round(x), Math.round(VH * c.y))
        .setTint(tint)
        .setAlpha(alpha)
        .setVisible(i < count);
    });
  }

  private birdsUpdate(now: number, period: number): void {
    const { VW, VH } = this;
    const k = Math.floor(now / period);
    const p = (now % period) / period;
    const on = p < 0.5;
    const dir = k % 2 ? -1 : 1;
    const q = p / 0.5;
    const baseX = dir > 0 ? -30 + (VW + 60) * q : VW + 30 - (VW + 60) * q;
    const baseY = VH * (0.16 + 0.1 * ((k * 0.618) % 1)) + Math.sin(now / 700) * 2;
    const offs = [
      [0, 0],
      [-7, -3],
      [-7, 3],
      [-14, -6],
      [-14, 6],
    ];
    this.birds.forEach((b, i) => {
      b.setVisible(on);
      if (!on) return;
      b.setPosition(Math.round(baseX + offs[i][0] * dir), Math.round(baseY + offs[i][1] + Math.sin(now / 300 + i) * (this.reduced ? 0 : 1)));
      b.setFrame(Math.floor(now / (this.reduced ? 400 : 170) + i) % 2).setFlipX(dir < 0);
    });
  }

  private ferrisFrame(f: StageFrame, hz: number, a: Air, cloudTint: number): void {
    const { VW, VH } = this;
    const ang = carAngle(this.unit, f.t);
    const A = this.reduced ? 0.45 : 1;
    const r = ferrisLift(ang) * A;
    const hx = -Math.sin(ang) * VH * 0.3 * A;
    const sx = this.reduced ? 0 : Math.sin(f.now / 1700) * 1.4 + Math.sin(f.now / 730) * 0.4;
    const sy = this.reduced ? 0 : Math.sin(f.now / 1300) * 0.7;
    this.cloudsUpdate(this.clouds, hx * 2, f.now, cloudTint, 0.92, 2 + Math.round(f.levels.cloud * 4));
    const B = this.bands;
    this.placeBand(B.mtn, 120 + hx * 0.05 - sx, hz + 8 + r * VH * 0.02 + sy, 36, a, f.now);
    this.placeBand(B.far, 40 + hx * 0.15 - sx, VH * 0.4 + r * VH * 0.06 + sy, 18, a, f.now);
    this.birdsUpdate(f.now, 23_000);
    this.placeBand(B.mid, 60 + hx * 0.35 - sx, VH * 0.47 + r * VH * 0.11 + sy, 26, a, f.now);
    this.placeBand(B.near, 180 + hx * 0.9 - sx, VH * 0.62 + r * VH * 0.62 + sy, 56, a, f.now);
    // 바퀴 살·다른 칸: 내 칸이 매달린 점에서 본 바퀴 (실제 각도)
    const g = this.wheel;
    if (g) {
      const R = VH * 0.9;
      const px = VW / 2 - sx;
      const py = -VH * 0.08 + sy;
      const hubX = px + Math.sin(ang) * R;
      const hubY = py - Math.cos(ang) * R;
      const steel = mulRgb(0x7d8290, a.shade);
      const dark = mulRgb(0x50545e, a.shade);
      g.clear();
      g.lineStyle(3, dark, 0.9);
      g.strokeCircle(hubX, hubY, R);
      g.lineStyle(1, steel, 0.9);
      g.strokeCircle(hubX, hubY, R - 1);
      const a0 = carAngle(0, f.t);
      for (let i = 0; i < 12; i++) {
        const t = a0 + (i * Math.PI) / 6;
        g.lineStyle(1, i % 2 ? steel : dark, i % 2 ? 0.45 : 0.7);
        g.lineBetween(hubX, hubY, hubX - Math.sin(t) * R, hubY + Math.cos(t) * R);
      }
      g.fillStyle(dark, 1);
      g.fillCircle(hubX, hubY, 7);
      g.fillStyle(steel, 1);
      g.fillCircle(hubX, hubY, 4);
      for (const c of this.cars) {
        const t = carAngle(c.c, f.t);
        const x = Math.round(hubX - Math.sin(t) * R);
        const y = Math.round(hubY + Math.cos(t) * R);
        const vis = x > -40 && x < VW + 40 && y > -50 && y < VH;
        c.back.setVisible(vis).setPosition(x, y).setTint(a.shade);
        c.front.setVisible(vis).setPosition(x, y).setTint(a.shade);
      }
    }
  }

  private balloonFrame(f: StageFrame, hz: number, a: Air, cloudTint: number): void {
    const { VW, VH } = this;
    const b = f.balloon;
    if (!b) return;
    const st = b.st;
    const lift = st.boarding ? 0 : flightLift(st.u);
    const L = routeLength();
    const S = Math.max(0, Math.min(L, balloonRouteS(st)));
    const X = STRIP_M + S * this.stripK;
    const up = this.reduced ? 0 : b.burn * 3 + Math.sin(f.now / 1900) * 1.2 * lift;
    const B = this.bands;
    this.cloudsUpdate(this.clouds, X, f.now, cloudTint, 0.92, 2 + Math.round(f.levels.cloud * 4));
    this.placeBand(B.mtn, 40 + X * 0.05, hz + 6 + lift * VH * 0.015 + up * 0.1, 36, a, f.now);
    this.placeBand(B.far, X * 0.16, VH * 0.37 + lift * VH * 0.03 + up * 0.2, 16, a, f.now);
    this.birdsUpdate(f.now, 17_000);
    this.placeBand(B.mid, X * 0.38, VH * 0.4 + lift * VH * 0.06 + up * 0.4, 20, a, f.now);
    this.placeBand(B.strip, X - VW / 2, VH * 0.44 + lift * VH * 0.16 + up, art.STRIP_GROUND, a, f.now);
    // 이륙장 둘레: 처음(이륙)·끝(착륙) 중 가까운 쪽 출발장이 가운데
    const anchor = S < L / 2 ? STRIP_M : STRIP_M + L * this.stripK;
    const fieldScroll = art.FIELD_W / 2 - VW / 2 + (X - anchor) * 1.5;
    const fv = B.field;
    const ground = VH * 0.64 + lift * VH * 0.95 + up * 1.4;
    if (fv) {
      const vis = ground - 40 < VH;
      for (const o of [fv.img, fv.lit, fv.fill, fv.haze, ...fv.fires.flatMap((x) => [x.img, x.glow])]) o.setVisible(vis);
      if (vis) this.placeBand(fv, fieldScroll, ground, 30, a, f.now);
    }
    // 앞 구름: 가끔 바구니 앞을 스쳐 지나간다 (긴 간격)
    this.cloudsUpdate(this.front, X, f.now, cloudTint, 0.6 * clamp01(lift * 1.5), 2, 1800);
    // 버너 불꽃: 켜면 크게, 끄면 작은 불씨
    const burn = b.burn;
    if (this.jet) {
      const fr = Math.floor(f.now / (this.reduced ? 200 : 70)) % 3;
      const k = 0.28 + 0.72 * burn;
      this.jet.setFrame(fr).setScale(0.5 + 0.5 * k, k).setAlpha(0.75 + 0.25 * burn);
    }
    this.jetGlow
      ?.setPosition(this.burner.x, this.burner.y - 6)
      .setScale(0.8 + 1.6 * burn)
      .setAlpha(0.08 + 0.4 * burn);
  }

  // ── 폭죽 ──

  private fireworks(now: number, dt: number): void {
    const { VW, VH } = this;
    if (this.pendingFw > 0 && this.freeSparks.length >= 24) {
      this.pendingFw--;
      const trail = this.freeSparks.pop()!;
      const color = [0xff6a5a, 0xffd060, 0x7ac8ff, 0xb08aff, 0x8aff9a, 0xffffff][Math.floor(Math.random() * 6)];
      this.rockets.push({
        x: VW * (0.15 + Math.random() * 0.7),
        y0: VH * 0.62,
        y1: VH * (0.14 + Math.random() * 0.16),
        at: now + Math.random() * 400,
        color,
        done: false,
        trail,
      });
    }
    for (const r of this.rockets) {
      const p = (now - r.at) / 750;
      if (p < 0) continue;
      if (p < 1) {
        const e = 1 - (1 - p) * (1 - p);
        r.trail
          .setVisible(true)
          .setPosition(Math.round(r.x), Math.round(r.y0 + (r.y1 - r.y0) * e))
          .setDisplaySize(1, 2)
          .setTint(0xffe8c0)
          .setAlpha(1);
        continue;
      }
      r.done = true;
      r.trail.setVisible(false);
      this.freeSparks.push(r.trail);
      const n = Math.min(this.freeSparks.length, this.reduced ? 14 : 28);
      for (let i = 0; i < n; i++) {
        const img = this.freeSparks.pop()!;
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const sp = 0.03 + Math.random() * 0.012;
        img.setVisible(true).setTint(r.color).setPosition(r.x, r.y1).setDisplaySize(1, 1).setAlpha(1);
        this.sparks.push({ img, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, born: now, life: 1_300 + Math.random() * 400 });
      }
    }
    this.rockets = this.rockets.filter((r) => !r.done);
    this.sparks = this.sparks.filter((s) => {
      const age = now - s.born;
      if (age > s.life) {
        s.img.setVisible(false);
        this.freeSparks.push(s.img);
        return false;
      }
      s.vy += 0.00002 * dt;
      s.img.x += s.vx * dt;
      s.img.y += s.vy * dt;
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.img.setAlpha(1 - (age / s.life) ** 2);
      return true;
    });
  }

  private ridersUpdate(list: readonly StageRider[], night: number, now: number, dt: number): void {
    const { VW } = this;
    const xs = this.kind === "ferris" ? [0.26, 0.74] : [0.13, 0.3, 0.7, 0.87];
    const tint = mixRgb(0xffffff, 0x8a90b0, night * 0.6);
    this.riders.forEach((img, i) => {
      const r = list[i];
      if (!r || !this.scene.textures.exists(r.key)) {
        img.setVisible(false);
        this.riderFx[i]?.setVisible(false);
        return;
      }
      if (img.texture.key !== r.key || img.frame.name !== String(r.frame)) img.setTexture(r.key, r.frame);
      const x = xs[Math.min(xs.length - 1, r.index)] * VW;
      img
        .setVisible(true)
        .setPosition(Math.round(x), this.sill + (this.kind === "ferris" ? 3 : 7))
        .setTint(tint);
      this.riderAura(i, r, img, now, dt);
    });
  }

  /** 탄 사람의 착용 오라·전용 오라 (뒷모습, 칸·바구니 바닥에 발밑 고리) */
  private riderAura(i: number, r: StageRider, img: Phaser.GameObjects.Image, now: number, dt: number): void {
    const look = r.look ?? [];
    const body = bodyOf(r.body ?? "hood");
    const key = `${body}|${look.join(",")}|${r.champ ?? 0}`;
    if (this.riderFxKey[i] !== key) {
      this.riderFxKey[i] = key;
      if (!this.riderFx[i] && (look.length || r.champ)) this.riderFx[i] = new CosmeticFxView(this.scene);
      this.riderFx[i]?.setLook(look, body, r.champ);
    }
    const fx = this.riderFx[i];
    if (!fx) return;
    const artTop = avatarArtTop(body, look);
    fx.sync(
      {
        now,
        dt,
        x: img.x,
        y: img.y,
        headY: img.y,
        dir: DIR.up,
        moving: false,
        hidden: true,
        artTop,
        shoulder: BODY_METRICS[body].shoulder,
        hand: handAnchor(body, "up"),
        reduced: this.reduced,
        depth: img.depth,
        aura: { base: img.y, top: img.y - artTop, dim: 1 },
      },
      true,
    );
  }

  destroy(): void {
    this.game.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.clear();
    this.black = null;
    this.kind = null;
    this.game.scene.remove(this.key);
  }
}

type Pal = { top: number; mid: number; low: number };
type Air = { pal: Pal; shade: number; night: number; lightsA: number; fog: number; haze: number };

/** 하늘 색: 낮·노을·밤·흐림을 섞고 시간대 색을 조금 곱한다 */
function skyPalette(night: number, warm: number, grey: number, tint: number): Pal {
  const DAY: Pal = { top: 0x5b8fd6, mid: 0x8fbde6, low: 0xcfe6f2 };
  const SET: Pal = { top: 0x4a5a9a, mid: 0xd88c7c, low: 0xf6c088 };
  const NIGHT: Pal = { top: 0x060a1e, mid: 0x111a3a, low: 0x28335e };
  const GREY: Pal = { top: 0x7d8794, mid: 0x9aa3ad, low: 0xb8c0c8 };
  const GREY_N: Pal = { top: 0x15171e, mid: 0x20242c, low: 0x30353f };
  const out = {} as Pal;
  const t = mixRgb(0xffffff, tint, 0.35);
  for (const k of ["top", "mid", "low"] as const) {
    let c = mixRgb(DAY[k], SET[k], warm);
    c = mixRgb(c, GREY[k], grey * (1 - night * 0.5));
    c = mixRgb(c, mixRgb(NIGHT[k], GREY_N[k], grey * 0.6), night);
    out[k] = mulRgb(c, t);
  }
  return out;
}
