import * as Phaser from "phaser";
import { ambienceAt, parseAmbienceOverride, timePhase } from "@/lib/ambience";
import { ART_H, buildCaption, buildInterior, buildSky, HORIZON, LAYERS, VIEW_MAX, WIN_BOT, WIN_TOP, type LayerSpec } from "./busRideArt";
import { GULL_FRAMES, LEAF_COLORS, rideBake, type RideBake } from "./busRideBake";
import { captionAlpha, captionAt, distanceAt, lightsOn, rideReversed, segmentAt, segmentsFor, shakeAt, skyColors, starsOn, strapAngle, type RideSegment } from "./busRideMath";
import { css } from "../sprites/pixel";
import { BUS_RIDE_MS, BUS_RIDE_SCENE, BUS_TEX_PREFIX, type BusRideControl, type BusRideData, type BusRoute } from "./busTypes";
// 11/17 창밖 날씨: 세기는 busWeather(순수), 흔들림은 마을 날씨와 같은 노이즈
import { dropHoldMs, dropVelocity, fallVelocity, glassDropCount, NO_RIDE_WEATHER, rideWeather, type RideWeather } from "./busWeather";
import { gust, pulse } from "../world/weatherNoise";

// 8초 버스 창밖 연출 (화면 전체). 버스 안 창가 자리에서 본 창밖: 여러 겹 파노라마가 시차로 흐르고(busRideArt),
// 가는 길은 마을 → 고속도로 → 단풍 국도 → 숲길 → 「언젠가 캠핑장」 표지판 앞에서 멈춘다 (돌아오는 길은 반대, 끝은 마을 정류장).
// 시간 계산은 busRideMath(순수). 하늘색·풍경 색조는 한국 시각(hour)으로 lib/ambience 팔레트를 그대로 쓴다.
// 11/15 창밖 그림(파노라마·표지판·자막)은 busRideBake가 미리 조금씩 굽고 지우지 않아요.
// 덜 구워졌으면 검은 화면에서 프레임마다 조금씩 마저 굽고 시작해요. 하늘·버스 안만 장면이 굽고 끝날 때 지워요.
// 끝나거나 skip()이면 짧게 어두워진 뒤 onDone을 한 번 부르고 스스로 멈춘다.
// 11/16 바닷가 노선(route "sea"): 마을 → 고속도로 → 해송 숲 길 → 바닷길(방파제·등대) → 「달물결 포구」 팻말. 낙엽 대신 갈매기가 나란히 날아요.
// 11/17 마을 날씨도 창밖에 (같은 ambienceAt — QA ?weather 포함): 비는 빗줄기 + 창에 맺혀 흘러내리는 물방울, 눈은 날리는 눈발,
// 안개는 먼 산·중간 층이 흐려져요. 그림은 busRideBake가 미리 굽고, 날씨가 없으면 아무것도 만들지 않아요.

const FADE_IN_MS = 350;
const HOLD_MS = 450;
const FADE_OUT_MS = 320;
const SKIP_FADE_MS = 200;
const LEAVES = 14;
const LEAVES_REDUCED = 4;
/** 11/16 바닷가 노선 창밖 갈매기 수 */
const GULLS = 6;
const GULLS_REDUCED = 2;
/** 덜 구운 그림을 마저 굽는 한 프레임 예산 (ms) */
const BAKE_MS = 6;

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
/** 11/17 창에 맺힌 물방울 (x·y는 창 안쪽 그림 픽셀). 맺혀 있다가 holdUntil이 지나면 흘러내리며 자국을 남긴다 */
type GlassDrop = { img: Phaser.GameObjects.Image; trail: Phaser.GameObjects.Image; x: number; y: number; sx: number; sy: number; holdUntil: number; running: boolean; born: number; seed: number };

/** 물방울 자국 최대 길이 (그림 px) */
const TRAIL_MAX = 26;

export class BusRideScene extends Phaser.Scene implements BusRideControl {
  private ride!: BusRideData;
  /** 11/16 노선 (없으면 캠핑장) */
  private route: BusRoute = "camp";
  private keys: string[] = [];
  private order: readonly RideSegment[] = [];
  private dist = 0;
  private bake!: RideBake;
  /** 그림을 마저 굽는 중 (검은 화면) */
  private pending = false;
  private skipped = false;
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
  /**
   * 11/15 돌아가는 길(toVillage): 버스가 반대로 달린다 → 창밖이 왼쪽에서 오른쪽으로 흐른다.
   * 그림은 가는 길과 같은 순서(마을 → 숲)로 굽고, 숲 쪽 끝에서 마을 쪽 처음으로 거꾸로 훑는다
   */
  private rev = false;
  private interior: Phaser.GameObjects.Image | null = null;
  private ceil!: Phaser.GameObjects.Rectangle;
  private floor!: Phaser.GameObjects.Rectangle;
  private straps: Phaser.GameObjects.Image[] = [];
  private caption: Phaser.GameObjects.Image | null = null;
  private captionText: string | null = null;
  private leaves: Leaf[] = [];
  private beams: Phaser.GameObjects.Image[] = [];
  private fade!: Phaser.GameObjects.Rectangle;
  /**
   * 11/15 바탕 (카메라 배경색 대신 맨 아래 사각형). 카메라 배경색을 처음 그리는 프레임이
   * 소프트웨어 그래픽(내장 그래픽 없는 PC)에서 100ms 가까이 멈췄어요
   */
  private back!: Phaser.GameObjects.Rectangle;
  private lastNear = 0;
  /** 11/17 창밖 날씨 세기 · 겹 (없는 날씨는 null) · 노이즈 시각 기준(초) */
  private wx: RideWeather = NO_RIDE_WEATHER;
  private rainFar: Phaser.GameObjects.TileSprite | null = null;
  private rainNear: Phaser.GameObjects.TileSprite | null = null;
  private snowFar: Phaser.GameObjects.TileSprite | null = null;
  private snowNear: Phaser.GameObjects.TileSprite | null = null;
  private fogBank: Phaser.GameObjects.TileSprite | null = null;
  private fogFar: Phaser.GameObjects.Image | null = null;
  private fogNear: Phaser.GameObjects.Image | null = null;
  private drops: GlassDrop[] = [];
  private wt0 = 0;

  constructor() {
    super(BUS_RIDE_SCENE);
  }

  init(data: BusRideData): void {
    this.ride = data;
    this.route = data.route ?? "camp";
    this.order = segmentsFor(data.leg, this.route);
    // 11/16 바닷가 노선은 캠핑장과 반대로 흘러요 (busRideMath rideReversed)
    this.rev = rideReversed(data.leg, this.route);
    this.endAt = null;
    this.pending = false;
    this.skipped = false;
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
    this.wx = NO_RIDE_WEATHER;
    this.rainFar = this.rainNear = this.snowFar = this.snowNear = this.fogBank = null;
    this.fogFar = this.fogNear = null;
    this.drops = [];
  }

  create(): void {
    this.bake = rideBake(this.textures, this.ride.reduced, this.route);
    this.dist = this.bake.dist;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    // 시작 시각은 첫 update에서 잡는다 (새 장면의 this.time.now는 첫 프레임 전엔 0이라 연출이 바로 끝나 버렸다)
    this.t0 = -1;
    if (this.bake.done) {
      this.build();
      return;
    }
    // 덜 구웠어요: 검은 화면에서 마저 굽고 시작해요
    this.pending = true;
    this.addBack(0x000000);
  }

  private addBack(color: number): void {
    if (!this.back?.active) this.back = this.add.rectangle(0, 0, 1, 1, color).setOrigin(0, 0).setDepth(-1);
    this.back.setFillStyle(color).setSize(Math.max(1, this.scale.width), Math.max(1, this.scale.height));
  }

  private build(): void {
    const { hour, leg, reduced } = this.ride;
    const bake = this.bake;
    // 11/17 날씨는 마을과 같은 시계·같은 QA 덮어쓰기 (?weather) — 시각은 버스를 부른 쪽이 정한 hour
    const amb = ambienceAt(Date.now(), { ...parseAmbienceOverride(typeof window === "undefined" ? "" : window.location.search), hour });
    this.wx = rideWeather(amb.weather, amb.intensity);
    this.wt0 = (Date.now() / 1000) % 100_000;
    if (this.wx.rain || this.wx.snow || this.wx.fog) bake.ensureWeather();
    const phase = timePhase(hour);
    this.night = lightsOn(hour);
    this.lightAlpha = this.night ? 0.5 + 0.45 * amb.palette.lightGlow : 0;
    this.dayLight = phase === "day" ? 1 : phase === "dawn" ? 0.8 : phase === "dusk" ? 0.45 : 0;
    this.addBack(0x5a4636);

    this.outside = this.add.container(0, 0).setDepth(D.sky);
    // 흐림·비·눈·안개면 하늘을 회색 쪽으로 (날씨는 마을과 같은 시계)
    const overcast = amb.weather === "clear" ? 0 : amb.weather === "cloudy" || amb.weather === "fog" ? 0.6 : 1;
    const sky = skyColors(hour, overcast);
    this.sky = this.add.image(0, 0, this.tex("sky", buildSky(css(sky.top), css(sky.bottom)))).setOrigin(0, 0);
    this.stars = this.add.tileSprite(0, 0, 16, 16, bake.key("stars")).setOrigin(0, 0).setAlpha(starsOn(hour) ? 0.9 : 0);
    this.clouds = this.add
      .tileSprite(0, 0, 16, 16, bake.key("clouds"))
      .setOrigin(0, 0)
      .setAlpha(this.night ? 0.22 : 0.85)
      .setTint(this.night ? 0x6a7090 : 0xffffff);
    this.outside.add([this.sky, this.stars, this.clouds]);

    const tint = amb.palette.worldTint;
    for (const spec of LAYERS) {
      // 돌아가는 길도 그림은 가는 길 순서로 (거꾸로 훑어 풍경이 반대로 흐른다 — busRideBake가 RIDE_ORDER로 구워요)
      const img = this.add.image(0, 0, bake.key(`l-${spec.id}`)).setOrigin(0, 0).setTint(tint);
      const litKey = bake.key(`l-${spec.id}-lit`);
      const lights = this.lightAlpha > 0 && this.textures.exists(litKey) ? this.add.image(0, 0, litKey).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.lightAlpha) : null;
      this.outside.add(img);
      if (lights) this.outside.add(lights);
      this.layers.push({ spec, img, lights });
      // 11/17 날씨 겹: 먼 산 뒤로 안개 둑, 중간 층 위로 안개 막·먼 빗줄기·먼 눈발, 가까운 층 위로 옅은 안개
      if (spec.id === "far") this.addFar(tint);
      else if (spec.id === "mid") this.addMid(tint);
      else if (spec.id === "near" && this.wx.fog > 0) this.fogNear = this.addTo(this.add.image(0, 0, bake.key("fog")).setOrigin(0, 0).setTint(this.fogTint(tint)));
    }

    this.sign = this.add.image(0, 0, bake.key(`sign-${leg}`)).setOrigin(0, 1).setTint(tint);
    this.outside.add(this.sign);

    // 11/16 바닷가 노선은 낙엽 대신 갈매기 (같은 풀을 써요 — 날갯짓은 update에서 그림을 바꿔요)
    const sea = this.route === "sea";
    const leafKeys = sea ? [bake.key("gull-0")] : LEAF_COLORS.map((_, i) => bake.key(`leaf-${i}`));
    const n = sea ? (reduced ? GULLS_REDUCED : GULLS) : reduced ? LEAVES_REDUCED : LEAVES;
    for (let i = 0; i < n; i++) {
      const img = this.add.image(0, 0, leafKeys[i % leafKeys.length]).setOrigin(0.5).setAlpha(0);
      this.outside.add(img);
      this.leaves.push({ img, x: Math.random(), y: Math.random(), vy: 0.08 + Math.random() * 0.1, phase: Math.random() * 6 });
    }
    // 11/17 가까운 빗줄기·눈발 (낙엽·갈매기 앞), 창에 맺히는 물방울 (버스 안 그림 바로 아래 — 창틀·기둥이 가린다)
    if (this.wx.rain > 0.3 && !reduced) this.rainNear = this.addTo(this.tile(`rain-near-${this.rev ? "r" : "l"}`).setTint(this.rainTint()));
    if (this.wx.snow > 0.15 && !reduced) this.snowNear = this.addTo(this.tile("snow-near").setTint(this.snowTint()));
    const nd = glassDropCount(this.wx.rain, reduced);
    for (let i = 0; i < nd; i++) {
      const trail = this.add.image(0, 0, bake.key("trail")).setOrigin(0.5, 1).setDepth(D.fills + 0.4).setVisible(false);
      const img = this.add.image(0, 0, bake.key(`drop-${i % 3}`)).setOrigin(0.5, 0.5).setDepth(D.fills + 0.5).setAlpha(0);
      const d: GlassDrop = { img, trail, x: 0, y: 0, sx: 0, sy: 0, holdUntil: 0, running: false, born: 0, seed: 300 + i * 7 };
      this.drops.push(d);
    }
    const beamKey = bake.key("beam");
    for (let i = 0; i < 3; i++) {
      const b = this.add.image(0, 0, beamKey).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.outside.add(b);
      this.beams.push(b);
    }

    this.ceil = this.add.rectangle(0, 0, 1, 1, 0x3c3631).setOrigin(0, 0).setDepth(D.fills);
    this.floor = this.add.rectangle(0, 0, 1, 1, 0x5a4636).setOrigin(0, 0).setDepth(D.fills);
    this.fade = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(D.fade).setAlpha(1);

    this.layout();
    // 물방울은 창 폭을 안 다음 흩뿌린다 (처음엔 맺혀 있는 시간을 엇갈리게)
    for (const d of this.drops) this.respawnDrop(d, -Math.random() * 2500);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  // ── 11/17 창밖 날씨 ──

  private addTo<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.outside.add(o);
    return o;
  }

  /** 미리 구운 날씨 타일 한 겹 (창 크기·배율은 layout) */
  private tile(name: string): Phaser.GameObjects.TileSprite {
    return this.add
      .tileSprite(0, 0, 16, 16, this.bake.key(name))
      .setOrigin(0, 0)
      .setTilePosition(Math.random() * 64, Math.random() * 64);
  }

  /** 먼 산 바로 뒤에 깔리는 안개 둑 (구름 그림을 옅게 — 천천히 흐른다) */
  private addFar(tint: number): void {
    if (this.wx.fog <= 0) return;
    this.fogBank = this.addTo(this.tile("clouds").setTint(this.fogTint(tint)));
  }

  /** 중간 층 위: 안개 막 (먼 산·중간 집이 흐려진다), 먼 빗줄기·눈발 */
  private addMid(tint: number): void {
    if (this.wx.fog > 0) this.fogFar = this.addTo(this.add.image(0, 0, this.bake.key("fog")).setOrigin(0, 0).setTint(this.fogTint(tint)));
    if (this.wx.rain > 0) this.rainFar = this.addTo(this.tile(`rain-far-${this.rev ? "r" : "l"}`).setTint(this.rainTint()));
    if (this.wx.snow > 0) this.snowFar = this.addTo(this.tile("snow-far").setTint(this.snowTint()));
  }

  /** 안개 색: 밝은 회색에 시간대 색조를 곱한다 (노을이면 붉게, 밤이면 어둡게) */
  private fogTint(tint: number): number {
    const ch = (sh: number) => Math.round((((0xd6dce2 >> sh) & 255) * ((tint >> sh) & 255)) / 255) << sh;
    return (ch(16) | ch(8) | ch(0)) >>> 0;
  }

  private rainTint(): number {
    return this.night ? 0x7d879c : 0xd4def0;
  }

  private snowTint(): number {
    return this.night ? 0xb8c0d8 : 0xffffff;
  }

  /** 물방울을 창 위쪽 아무 데나 새로 맺히게 (now: 장면 ms) */
  private respawnDrop(d: GlassDrop, now: number): void {
    const winH = WIN_BOT - WIN_TOP;
    d.x = 4 + Math.random() * Math.max(1, this.viewW - 8);
    d.y = 3 + Math.random() * winH * 0.7;
    d.sx = d.x;
    d.sy = d.y;
    d.running = false;
    d.born = now;
    d.holdUntil = now + dropHoldMs(this.wx.rain, Math.random());
    d.seed += 13;
    d.trail.setVisible(false);
  }

  /**
   * 날씨 겹 움직이기 (매 프레임). s: 노이즈 시각(초), v: 가까운 층 빠르기(그림 px/s), way: 풍경이 흐르는 쪽.
   * 세기는 마을처럼 몇 초씩 세졌다 잦아들고(pulse), 바람(gust)이 기울기·흩날림을 흔든다
   */
  private updateWeather(ms: number, dt: number, v: number, way: 1 | -1): void {
    const wx = this.wx;
    if (!wx.rain && !wx.snow && !wx.fog) return;
    const reduced = this.ride.reduced;
    const g = reduced ? 0.4 : 1;
    const s = this.wt0 + ms / 1000;
    const wind = gust(s / 7, 11) * g;
    const k = reduced ? 0.35 : 1;
    const scroll = (t: Phaser.GameObjects.TileSprite | null, vel: { x: number; y: number }, a: number) => {
      if (!t) return;
      t.tilePositionX = (t.tilePositionX + vel.x * k * dt) % 64;
      t.tilePositionY = (t.tilePositionY - vel.y * k * dt) % 64;
      t.setAlpha(a);
    };
    if (wx.rain) {
      const ra = wx.rain * pulse(s, 23, 0.35 * g, 9);
      scroll(this.rainFar, fallVelocity("rain", false, v, way, wind), ra * (this.night ? 0.4 : 0.5));
      scroll(this.rainNear, fallVelocity("rain", true, v, way, wind), ra * (this.night ? 0.45 : 0.6));
    }
    if (wx.snow) {
      const sa = wx.snow * pulse(s, 37, 0.25 * g, 11);
      scroll(this.snowFar, fallVelocity("snow", false, v, way, wind), sa * 0.8);
      scroll(this.snowNear, fallVelocity("snow", true, v, way, wind), sa * 0.95);
    }
    if (wx.fog) {
      // 짙기가 천천히 출렁이고, 안개 둑은 먼 산보다 조금 빨리 흐른다
      const fa = wx.fog * (1 + 0.15 * g * gust(s / 6, 61));
      this.fogFar?.setAlpha(Math.min(0.85, fa * 0.72));
      this.fogNear?.setAlpha(fa * 0.2);
      if (this.fogBank) {
        this.fogBank.tilePositionX += way * (v * 0.25 + 3 + 2 * wind) * dt;
        this.fogBank.setAlpha(Math.min(0.9, fa * 0.75));
      }
    }
    // 창 물방울: 맺혀 있다가 흘러내린다 (버스가 빠를수록 뒤로 비스듬히). 창 아래나 옆으로 나가면 다른 자리에 새로 맺힌다
    if (!this.drops.length) return;
    const S = this.S;
    const a0 = Math.min(1, wx.rain * 1.2) * (this.night ? 0.6 : 0.9);
    const winH = WIN_BOT - WIN_TOP;
    for (const d of this.drops) {
      if (ms < d.born) continue;
      if (!d.running && ms >= d.holdUntil) d.running = true;
      if (d.running) {
        const vel = dropVelocity(v, way, gust(ms / 700, d.seed));
        d.x += vel.x * dt;
        d.y += vel.y * dt;
        if (d.y > winH - 3 || d.x < -2 || d.x > this.viewW + 2) {
          this.respawnDrop(d, ms);
          continue;
        }
        const dx = d.sx - d.x;
        const dy = d.sy - d.y;
        const len = Math.min(TRAIL_MAX, Math.hypot(dx, dy));
        if (len > 1) {
          d.trail
            .setVisible(true)
            .setPosition(Math.round(d.x * S), Math.round(this.offY + (WIN_TOP + d.y) * S))
            .setRotation(Math.atan2(dx, -dy))
            .setDisplaySize(S, len * S)
            .setAlpha(a0 * 0.8);
        }
      }
      const fadeIn = Math.min(1, (ms - d.born) / 300);
      d.img.setScale(S).setPosition(Math.round(d.x * S), Math.round(this.offY + (WIN_TOP + d.y) * S)).setAlpha(a0 * fadeIn);
    }
  }

  /** E·탭으로 건너뛰기: 짧게 어두워지고 끝 */
  skip(): void {
    if (this.pending) {
      this.skipped = true;
      return;
    }
    if (this.endAt !== null || this.finished || !this.sys.isActive()) return;
    this.endAt = this.lastTime;
    this.endMs = SKIP_FADE_MS;
  }

  update(time: number, delta: number): void {
    if (this.finished) return;
    if (this.pending) {
      // 건너뛰면 굽지 않고 바로 끝내요 (남은 그림은 다음 여행 전에 마저 구워요)
      if (this.skipped) return this.finish();
      if (!this.bake.step(BAKE_MS)) return;
      this.pending = false;
      this.build();
      return;
    }
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
      const scroll = l.spec.factor * this.dist * (this.rev ? 1 - d : d);
      if (l.spec.id === "near") near = scroll;
      const x = -Math.round(scroll * S);
      l.img.x = x;
      if (l.lights) l.lights.x = x;
    }
    const v = delta > 0 ? Math.min(600, Math.abs(near - this.lastNear) / (delta / 1000)) : 0; // 가까운 층 속도 (그림 px/s)
    const way = this.rev ? -1 : 1; // 풍경이 흐르는 쪽 (1 = 왼쪽으로)
    this.lastNear = near;
    this.clouds.tilePositionX = way * ((this.dist * 0.05 * d + ms * 0.002) % 10_000);
    this.stars.tilePositionX = way * this.dist * 0.01 * d;
    this.sign.x = Math.round((this.signX - near) * S);

    // 구간 비중 (낙엽·햇살)
    const seg = segmentAt(d);
    const w: Record<RideSegment, number> = { village: 0, highway: 0, maple: 0, forest: 0, coast: 0, sea: 0 };
    w[this.order[seg.index]] += 1 - seg.blend;
    if (seg.index < 3) w[this.order[seg.index + 1]] += seg.blend;
    const leafW = Math.min(1, w.maple + w.forest);
    const winTop = this.offY + WIN_TOP * S;
    const winH = (WIN_BOT - WIN_TOP) * S;
    const W = this.scale.width;
    const dt = Math.min(delta, 50) / 1000; // 프레임이 밀려도 낙엽이 한 줄로 몰리지 않게
    if (this.route === "sea") this.updateGulls(ms, dt, v, way, Math.min(1, w.sea + w.coast * 0.4), winTop, winH, W);
    // 캠핑장 노선: 단풍 국도·숲길에서 낙엽이 창밖을 스쳐요
    for (const lf of this.route === "sea" ? [] : this.leaves) {
      lf.x -= (way * (v * 1.25 + 18) * S * dt) / W;
      lf.y += lf.vy * dt;
      if (way > 0 ? lf.x < -0.05 : lf.x > 1.05) {
        lf.x = way > 0 ? 1.02 + Math.random() * 0.3 : -0.02 - Math.random() * 0.3;
        lf.y = Math.random() * 0.6;
      }
      if (lf.y > 1.05) lf.y = -0.05;
      lf.img
        .setPosition(Math.round(lf.x * W), Math.round(winTop + lf.y * winH))
        .setScale(S)
        .setRotation(reduced ? 0 : Math.sin(ms * 0.006 + lf.phase) * 0.8)
        .setAlpha(leafW * (this.night ? 0.6 : 0.95));
    }
    this.updateWeather(ms, dt, v, way as 1 | -1);
    const beamA = w.forest * this.dayLight * 0.2;
    this.beams.forEach((b, i) => b.setAlpha(beamA * (0.75 + 0.25 * Math.sin(ms * 0.0015 + i * 2))));

    // 손잡이
    const ang = strapAngle(ms, f, reduced);
    this.straps.forEach((s, i) => s.setAngle(ang + (reduced ? 0 : Math.sin(ms * 0.003 + i) * 1.5)));

    // 자막
    const text = captionAt(ms, BUS_RIDE_MS, this.ride.leg, this.route);
    if (text !== this.captionText) {
      this.captionText = text;
      this.caption?.destroy();
      this.caption = null;
      if (text) {
        const key = this.bake.captionKey(text) ?? this.tex(`cap-${text.length}-${text.charCodeAt(0)}-${text.charCodeAt(text.length - 2)}`, buildCaption(text));
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

  /**
   * 11/16 바닷가 노선 갈매기: 버스와 나란히 날아 창밖에서 천천히 앞뒤로 오가요 (풍경보다 훨씬 느리게).
   * 날갯짓은 그림 두 장을 번갈아 (reduced면 날개를 편 채로)
   */
  private updateGulls(ms: number, dt: number, v: number, way: number, weight: number, winTop: number, winH: number, W: number): void {
    const S = this.S;
    const reduced = this.ride.reduced;
    const frames = Array.from({ length: GULL_FRAMES }, (_, i) => this.bake.key(`gull-${i}`));
    for (const g of this.leaves) {
      // 버스보다 조금 느려서 아주 천천히 뒤로 밀려나요
      g.x -= (way * (v * 0.08 + 6) * S * dt) / W;
      g.y = Math.min(0.42, Math.max(0.04, g.y + Math.sin(ms * 0.0011 + g.phase) * 0.02 * dt));
      if (way > 0 ? g.x < -0.05 : g.x > 1.05) {
        g.x = way > 0 ? 1.03 + Math.random() * 0.2 : -0.03 - Math.random() * 0.2;
        g.y = 0.06 + Math.random() * 0.3;
      }
      const f = reduced ? 0 : Math.floor((ms + g.phase * 400) / 180) % GULL_FRAMES;
      g.img
        .setTexture(frames[f])
        .setFlipX(way < 0)
        .setPosition(Math.round(g.x * W), Math.round(winTop + g.y * winH + (reduced ? 0 : Math.sin(ms * 0.004 + g.phase) * S)))
        .setScale(S)
        .setRotation(0)
        .setAlpha(weight * (this.night ? 0.55 : 0.95));
    }
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
    // 돌아가는 길은 그림의 처음(마을 쪽)이 마지막에 온다
    this.signX = (this.rev ? 0 : this.dist) + this.viewW / 2 - this.sign.width / 2;
    this.sign.setScale(S).setY(y(124));
    this.beams.forEach((b, i) => b.setScale(S).setPosition(Math.round(W * (0.22 + i * 0.3)), y(WIN_TOP)));
    // 11/17 날씨 겹: 창 전체 (그림 픽셀 단위로 그려 S배 — 창밖 그림과 같은 굵기)
    for (const t of [this.rainFar, this.rainNear, this.snowFar, this.snowNear]) t?.setPosition(0, y(WIN_TOP)).setSize(Math.ceil(W / S), WIN_BOT - WIN_TOP).setScale(S);
    this.fogBank?.setPosition(0, y(HORIZON - 34)).setSize(Math.ceil(W / S), 40).setScale(S);
    for (const f of [this.fogFar, this.fogNear]) f?.setPosition(0, y(WIN_TOP)).setDisplaySize(W, winH);

    // 버스 안 (화면 폭마다 다시 굽는다)
    const key = this.tex("interior", buildInterior(this.viewW + 1, this.night));
    if (this.interior) this.interior.setTexture(key);
    else this.interior = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(D.interior);
    this.interior.setScale(S).setPosition(0, this.offY);
    if (this.night) this.interior.setTint(0xe8dcc8);
    this.ceil.setPosition(0, 0).setSize(W, Math.max(0, this.offY));
    this.floor.setPosition(0, this.offY + ART_H * S).setSize(W, Math.max(0, H - (this.offY + ART_H * S)));
    this.fade.setSize(W, H);
    this.back.setSize(W, H);

    // 손잡이 (봉을 따라)
    for (const s of this.straps) s.destroy();
    this.straps = [];
    const strapKey = this.bake.key("strap");
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
