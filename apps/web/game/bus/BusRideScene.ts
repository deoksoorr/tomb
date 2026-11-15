import * as Phaser from "phaser";
import { ambienceAt, timePhase } from "@/lib/ambience";
import { ART_H, buildCaption, buildClouds, buildEndSign, buildInterior, buildLeaf, buildPanorama, buildSky, buildStars, buildStrap, buildSunbeam, LAYERS, VIEW_MAX, WIN_BOT, WIN_TOP, type LayerSpec } from "./busRideArt";
import { captionAlpha, captionAt, distanceAt, lightsOn, segmentAt, segmentsFor, shakeAt, skyColors, starsOn, strapAngle, type RideSegment } from "./busRideMath";
import { css } from "../sprites/pixel";
import { BUS_RIDE_MS, BUS_RIDE_SCENE, BUS_TEX_PREFIX, type BusRideControl, type BusRideData } from "./busTypes";

// 8초 버스 창밖 연출 (화면 전체). 버스 안 창가 자리에서 본 창밖: 여러 겹 파노라마가 시차로 흐르고(busRideArt),
// 가는 길은 마을 → 고속도로 → 단풍 국도 → 숲길 → 「언젠가 캠핑장」 표지판 앞에서 멈춘다 (돌아오는 길은 반대, 끝은 마을 정류장).
// 시간 계산은 busRideMath(순수). 하늘색·풍경 색조는 한국 시각(hour)으로 lib/ambience 팔레트를 그대로 쓴다.
// 텍스처는 시작할 때 굽고 끝날 때 모두 지운다 (BUS_TEX_PREFIX + "ride-").
// 끝나거나 skip()이면 짧게 어두워진 뒤 onDone을 한 번 부르고 스스로 멈춘다.

/** 앞 차 거리 (가까운 층이 8초 동안 달리는 그림 픽셀). reduced면 짧게 = 천천히 */
const DIST = 1100;
const DIST_REDUCED = 440;
const FADE_IN_MS = 350;
const HOLD_MS = 450;
const FADE_OUT_MS = 320;
const SKIP_FADE_MS = 200;
const LEAVES = 14;
const LEAVES_REDUCED = 4;
const LEAF_COLORS = [0xc8482a, 0xe06a34, 0xe8a83a, 0xd8b040] as const;

const D = {
  sky: 0,
  stars: 1,
  clouds: 2,
  layer: 3, // + 층 순서 × 2 (불빛은 +1)
  sign: 12,
  leaves: 13,
  beams: 14,
  fills: 19,
  interior: 20,
  straps: 21,
  caption: 22,
  fade: 30,
} as const;

type LayerView = { spec: LayerSpec; img: Phaser.GameObjects.Image; lights: Phaser.GameObjects.Image | null };
type Leaf = { img: Phaser.GameObjects.Image; x: number; y: number; vy: number; phase: number };

export class BusRideScene extends Phaser.Scene implements BusRideControl {
  private ride!: BusRideData;
  private keys: string[] = [];
  private order: readonly RideSegment[] = [];
  private dist = DIST;
  private t0 = 0;
  /** 끝내기 시작한 시각 (어두워지는 중) */
  private endAt: number | null = null;
  private endMs = FADE_OUT_MS;
  private finished = false;
  /** 마지막 update 시각 (건너뛰기가 같은 시계로 끝 시각을 잡게) */
  private lastTime = 0;
  private S = 4;
  private viewW = 320;
  private offY = 0;
  private night = false;
  private lightAlpha = 0;
  private dayLight = 1;
  private outside!: Phaser.GameObjects.Container;
  private sky!: Phaser.GameObjects.Image;
  private stars!: Phaser.GameObjects.TileSprite;
  private clouds!: Phaser.GameObjects.TileSprite;
  private layers: LayerView[] = [];
  private sign!: Phaser.GameObjects.Image;
  private signX = 0;
  private interior: Phaser.GameObjects.Image | null = null;
  private ceil!: Phaser.GameObjects.Rectangle;
  private floor!: Phaser.GameObjects.Rectangle;
  private straps: Phaser.GameObjects.Image[] = [];
  private caption: Phaser.GameObjects.Image | null = null;
  private captionText: string | null = null;
  private leaves: Leaf[] = [];
  private beams: Phaser.GameObjects.Image[] = [];
  private fade!: Phaser.GameObjects.Rectangle;
  private lastNear = 0;

  constructor() {
    super(BUS_RIDE_SCENE);
  }

  init(data: BusRideData): void {
    this.ride = data;
    this.order = segmentsFor(data.leg);
    this.dist = data.reduced ? DIST_REDUCED : DIST;
    this.endAt = null;
    this.finished = false;
    this.layers = [];
    this.straps = [];
    this.leaves = [];
    this.beams = [];
    this.caption = null;
    this.captionText = null;
    this.interior = null;
    this.keys = [];
    this.lastNear = 0;
  }

  create(): void {
    const { hour, leg, reduced } = this.ride;
    const amb = ambienceAt(Date.now(), { hour });
    const phase = timePhase(hour);
    this.night = lightsOn(hour);
    this.lightAlpha = this.night ? 0.5 + 0.45 * amb.palette.lightGlow : 0;
    this.dayLight = phase === "day" ? 1 : phase === "dawn" ? 0.8 : phase === "dusk" ? 0.45 : 0;
    this.cameras.main.setBackgroundColor(0x5a4636);
    const seed = (Math.floor(Date.now() / 60_000) % 997) + (leg === "toCamp" ? 0 : 500);

    this.outside = this.add.container(0, 0).setDepth(D.sky);
    // 흐림·비·눈·안개면 하늘을 회색 쪽으로 (날씨는 마을과 같은 시계)
    const overcast = amb.weather === "clear" ? 0 : amb.weather === "cloudy" || amb.weather === "fog" ? 0.6 : 1;
    const sky = skyColors(hour, overcast);
    this.sky = this.add.image(0, 0, this.tex("sky", buildSky(css(sky.top), css(sky.bottom)))).setOrigin(0, 0);
    this.stars = this.add.tileSprite(0, 0, 16, 16, this.tex("stars", buildStars(seed))).setOrigin(0, 0).setAlpha(starsOn(hour) ? 0.9 : 0);
    this.clouds = this.add
      .tileSprite(0, 0, 16, 16, this.tex("clouds", buildClouds(seed + 1)))
      .setOrigin(0, 0)
      .setAlpha(this.night ? 0.22 : 0.85)
      .setTint(this.night ? 0x6a7090 : 0xffffff);
    this.outside.add([this.sky, this.stars, this.clouds]);

    const tint = amb.palette.worldTint;
    LAYERS.forEach((spec, i) => {
      const p = buildPanorama(spec, this.order, this.dist, seed * 7 + i * 131);
      const img = this.add.image(0, 0, this.tex(`l-${spec.id}`, p.canvas)).setOrigin(0, 0).setTint(tint);
      const lights = p.lights && this.lightAlpha > 0 ? this.add.image(0, 0, this.tex(`l-${spec.id}-lit`, p.lights)).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.lightAlpha) : null;
      this.outside.add(img);
      if (lights) this.outside.add(lights);
      this.layers.push({ spec, img, lights });
    });

    const signCanvas = buildEndSign(leg);
    this.sign = this.add.image(0, 0, this.tex("sign", signCanvas)).setOrigin(0, 1).setTint(tint);
    this.outside.add(this.sign);

    const leafKeys = LEAF_COLORS.map((c, i) => this.tex(`leaf-${i}`, buildLeaf(c)));
    const n = reduced ? LEAVES_REDUCED : LEAVES;
    for (let i = 0; i < n; i++) {
      const img = this.add.image(0, 0, leafKeys[i % leafKeys.length]).setOrigin(0.5).setAlpha(0);
      this.outside.add(img);
      this.leaves.push({ img, x: Math.random(), y: Math.random(), vy: 0.08 + Math.random() * 0.1, phase: Math.random() * 6 });
    }
    const beamKey = this.tex("beam", buildSunbeam());
    for (let i = 0; i < 3; i++) {
      const b = this.add.image(0, 0, beamKey).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.outside.add(b);
      this.beams.push(b);
    }

    this.ceil = this.add.rectangle(0, 0, 1, 1, 0x3c3631).setOrigin(0, 0).setDepth(D.fills);
    this.floor = this.add.rectangle(0, 0, 1, 1, 0x5a4636).setOrigin(0, 0).setDepth(D.fills);
    this.fade = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(D.fade).setAlpha(1);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    // 시작 시각은 첫 update에서 잡는다 (새 장면의 this.time.now는 첫 프레임 전엔 0이라 연출이 바로 끝나 버렸다)
    this.t0 = -1;
  }

  /** E·탭으로 건너뛰기: 짧게 어두워지고 끝 */
  skip(): void {
    if (this.endAt !== null || this.finished || !this.sys.isActive()) return;
    this.endAt = this.lastTime;
    this.endMs = SKIP_FADE_MS;
  }

  update(time: number, delta: number): void {
    if (this.finished) return;
    if (this.t0 < 0) this.t0 = time;
    this.lastTime = time;
    const ms = time - this.t0;
    const f = Math.min(1, ms / BUS_RIDE_MS);
    const d = distanceAt(f);
    const S = this.S;
    const reduced = this.ride.reduced;

    // 흔들림: 창밖만 (버스 안은 눈과 함께 흔들린다)
    this.outside.y = shakeAt(ms, f, reduced);

    // 층 스크롤
    let near = 0;
    for (const l of this.layers) {
      const scroll = l.spec.factor * this.dist * d;
      if (l.spec.id === "near") near = scroll;
      const x = -Math.round(scroll * S);
      l.img.x = x;
      if (l.lights) l.lights.x = x;
    }
    const v = delta > 0 ? Math.min(600, (near - this.lastNear) / (delta / 1000)) : 0; // 가까운 층 속도 (그림 px/s)
    this.lastNear = near;
    this.clouds.tilePositionX = (this.dist * 0.05 * d + ms * 0.002) % 10_000;
    this.stars.tilePositionX = this.dist * 0.01 * d;
    this.sign.x = Math.round((this.signX - near) * S);

    // 구간 비중 (낙엽·햇살)
    const seg = segmentAt(d);
    const w: Record<RideSegment, number> = { village: 0, highway: 0, maple: 0, forest: 0 };
    w[this.order[seg.index]] += 1 - seg.blend;
    if (seg.index < 3) w[this.order[seg.index + 1]] += seg.blend;
    const leafW = Math.min(1, w.maple + w.forest);
    const winTop = this.offY + WIN_TOP * S;
    const winH = (WIN_BOT - WIN_TOP) * S;
    const W = this.scale.width;
    const dt = Math.min(delta, 50) / 1000; // 프레임이 밀려도 낙엽이 한 줄로 몰리지 않게
    for (const lf of this.leaves) {
      lf.x -= ((v * 1.25 + 18) * S * dt) / W;
      lf.y += lf.vy * dt;
      if (lf.x < -0.05) {
        lf.x = 1.02 + Math.random() * 0.3;
        lf.y = Math.random() * 0.6;
      }
      if (lf.y > 1.05) lf.y = -0.05;
      lf.img
        .setPosition(Math.round(lf.x * W), Math.round(winTop + lf.y * winH))
        .setScale(S)
        .setRotation(reduced ? 0 : Math.sin(ms * 0.006 + lf.phase) * 0.8)
        .setAlpha(leafW * (this.night ? 0.6 : 0.95));
    }
    const beamA = w.forest * this.dayLight * 0.2;
    this.beams.forEach((b, i) => b.setAlpha(beamA * (0.75 + 0.25 * Math.sin(ms * 0.0015 + i * 2))));

    // 손잡이
    const ang = strapAngle(ms, f, reduced);
    this.straps.forEach((s, i) => s.setAngle(ang + (reduced ? 0 : Math.sin(ms * 0.003 + i) * 1.5)));

    // 자막
    const text = captionAt(ms, BUS_RIDE_MS, this.ride.leg);
    if (text !== this.captionText) {
      this.captionText = text;
      this.caption?.destroy();
      this.caption = null;
      if (text) {
        const key = this.tex(`cap-${text.length}-${text.charCodeAt(0)}-${text.charCodeAt(text.length - 2)}`, buildCaption(text));
        this.caption = this.add.image(0, 0, key).setOrigin(0.5, 0.5).setDepth(D.caption);
        this.placeCaption();
      }
    }
    if (this.caption) this.caption.setAlpha(captionAlpha(ms, BUS_RIDE_MS));

    // 들어올 때·끝날 때 어둡게
    if (this.endAt === null && f >= 1 && ms >= BUS_RIDE_MS + HOLD_MS) this.endAt = time;
    if (this.endAt !== null) {
      const k = Math.min(1, (time - this.endAt) / this.endMs);
      this.fade.setAlpha(Math.max(this.fade.alpha, k));
      if (k >= 1) this.finish();
    } else this.fade.setAlpha(Math.max(0, 1 - ms / FADE_IN_MS));
  }

  // ── 안쪽 ──

  /** 장면 전용 텍스처 (같은 키가 남아 있으면 바꾼다) */
  private tex(name: string, canvas: HTMLCanvasElement): string {
    const key = `${BUS_TEX_PREFIX}ride-${name}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
    if (!this.keys.includes(key)) this.keys.push(key);
    return key;
  }

  /** 화면 크기에 맞춰 배율·자리 다시 */
  private layout(): void {
    const W = Math.max(1, this.scale.width);
    const H = Math.max(1, this.scale.height);
    const S = Math.max(1, Math.floor(H / 170), Math.ceil(W / (VIEW_MAX - 20)));
    this.S = S;
    this.viewW = W / S;
    this.offY = Math.round((H - ART_H * S) / 2);
    const y = (artY: number) => this.offY + artY * S;
    const winH = (WIN_BOT - WIN_TOP) * S;

    this.sky.setPosition(0, y(WIN_TOP)).setDisplaySize(W, winH);
    this.stars.setPosition(0, y(WIN_TOP)).setSize(Math.ceil(W / S), WIN_BOT - WIN_TOP).setScale(S);
    this.clouds.setPosition(0, y(WIN_TOP + 4)).setSize(Math.ceil(W / S), 40).setScale(S);
    for (const l of this.layers) {
      l.img.setScale(S).setY(y(l.spec.y0));
      l.lights?.setScale(S).setY(y(l.spec.y0));
    }
    // 끝 표지판: 마지막에 화면 가운데로 온다 (가까운 층과 같이 움직인다)
    this.signX = this.dist + this.viewW / 2 - this.sign.width / 2;
    this.sign.setScale(S).setY(y(124));
    this.beams.forEach((b, i) => b.setScale(S).setPosition(Math.round(W * (0.22 + i * 0.3)), y(WIN_TOP)));

    // 버스 안 (화면 폭마다 다시 굽는다)
    const key = this.tex("interior", buildInterior(this.viewW + 1, this.night));
    if (this.interior) this.interior.setTexture(key);
    else this.interior = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(D.interior);
    this.interior.setScale(S).setPosition(0, this.offY);
    if (this.night) this.interior.setTint(0xe8dcc8);
    this.ceil.setPosition(0, 0).setSize(W, Math.max(0, this.offY));
    this.floor.setPosition(0, this.offY + ART_H * S).setSize(W, Math.max(0, H - (this.offY + ART_H * S)));
    this.fade.setSize(W, H);

    // 손잡이 (봉을 따라)
    for (const s of this.straps) s.destroy();
    this.straps = [];
    const strapKey = this.keys.find((k) => k.endsWith("ride-strap")) ?? this.tex("strap", buildStrap());
    for (let ax = 34; ax < this.viewW + 20; ax += 75) {
      this.straps.push(
        this.add
          .image(Math.round(ax * S), y(12), strapKey)
          .setOrigin(0.5, 0)
          .setScale(S)
          .setDepth(D.straps),
      );
    }
    this.placeCaption();
  }

  private placeCaption(): void {
    if (!this.caption) return;
    // 좁은 화면이면 한 줄이 넘치지 않게 작게
    const cs = Math.max(1, Math.min(Math.round(this.S / 2), Math.floor((this.scale.width - 16) / this.caption.width)));
    this.caption.setScale(cs).setPosition(Math.round(this.scale.width / 2), Math.min(this.scale.height - 12 * cs, this.offY + 150 * this.S));
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const done = this.ride.onDone;
    this.scene.stop();
    done();
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    for (const k of this.keys) if (this.textures.exists(k)) this.textures.remove(k);
    this.keys = [];
  }
}
