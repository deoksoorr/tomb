import * as Phaser from "phaser";
import { ambienceAt, kstHour, parseAmbienceOverride, type AmbienceOverride } from "@/lib/ambience";
import { TEX } from "../assets/manifest";
import { DEPTH, ZOOM_MIN } from "../config";
import { LevelBlender, levelsFor, TRANSITION_MS, type Levels } from "./ambienceMix";
import { isQuietHour, THUNDER_MIN_RAIN, thunderDelaySec, thunderFlash, thunderGapMs } from "./weatherMath";
import { WeatherSound } from "./WeatherSound";
import type { LightSpot } from "./WorldMap";

// 분위기 레이어: [날씨 막(일반 섞기)] → KST 시간대 톤(곱하기 틴트) → [어둠·빛 구멍은 Lighting] → 빛(가산) → 반딧불 → 날씨(비·눈·낙엽) → 안개 → 번개 → 비네트.
// 톤·날씨는 lib/ambience(공용, 시계 기반)로 1분마다 다시 계산하고 바뀌면 2.5초 동안 섞는다.
// 모든 레이어는 화면 고정 오브젝트 몇 개와 작은 풀(pool)로만 그려서 프레임당 비용이 일정하다.
// 소리: 비 세기·실내 여부를 게임 하나에 하나인 WeatherSound에 알려 주고(빗소리 루프), 센 비에는 가끔 천둥(번개 + 소리).
// 번개 번쩍임은 prefers-reduced-motion이면 끈다(소리만). QA: ?weather=rain&thunder=1 이면 몇 초마다 천둥.

export type AtmosphereOptions = {
  /** 날씨 소리를 낸다 (입장 화면 배경은 끈다). 기본 true */
  sound?: boolean;
  /** 집 안: 비·눈·낙엽·번개를 그리지 않고 소리는 벽 너머로 먹먹하게. 기본 false */
  indoor?: boolean;
  /** 바깥 색 보정(skyGrade: 7구간 색 온도·밤은 확실히 어둡게·날씨 막). 기본: 실내가 아니면 켬 */
  grade?: boolean;
};

const RECHECK_MS = 60_000;
/** TileSprite 내부 캔버스를 줄이기 위해 1/4 크기로 만들고 4배로 키운다 */
const TS_SCALE = 4;
const FIREFLY_MAX = 26;
const FIREFLY_MAX_REDUCED = 8;
const SPLASH_POOL = 28;
const LEAF_MAX = 22;
const LEAF_MAX_REDUCED = 6;
/** 낙엽 색 (주황·빨강·노랑·갈색) — [몸, 밝은 쪽, 잎자루] */
const LEAF_COLORS: readonly [string, string, string][] = [
  ["#c8642a", "#e08a3c", "#7a3c1c"],
  ["#a83c28", "#c85a3a", "#5e2016"],
  ["#d9a43a", "#ecc35a", "#7a5a1c"],
  ["#8a5a2e", "#a8743e", "#4e3018"],
];
const leafKey = (i: number) => `fx-leaf-${i}`;

type Firefly = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; phase: number; orbit: number };
type Light = { spot: LightSpot; img: Phaser.GameObjects.Image; phase: number };
type Splash = { img: Phaser.GameObjects.Image; born: number };
type Leaf = { img: Phaser.GameObjects.Image; x: number; y: number; fall: number; phase: number; flutter: number };

export class Atmosphere {
  private readonly override: AmbienceOverride;
  private readonly blender: LevelBlender;
  private nextCheck = 0;
  private readonly tint: Phaser.GameObjects.Image;
  /** 톤 아래 옅은 막 (흐림·안개의 채도·대비 낮추기, 눈의 흰빛) */
  private readonly haze: Phaser.GameObjects.Image;
  private readonly grade: boolean;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly fogNear: Phaser.GameObjects.TileSprite;
  private readonly fogFar: Phaser.GameObjects.TileSprite;
  private readonly cloud: Phaser.GameObjects.TileSprite;
  private readonly rainNear: Phaser.GameObjects.TileSprite;
  private readonly rainFar: Phaser.GameObjects.TileSprite;
  private readonly snowNear: Phaser.GameObjects.TileSprite;
  private readonly snowFar: Phaser.GameObjects.TileSprite;
  private readonly fireflies: Firefly[] = [];
  private staticLights: Light[] = [];
  private gridLights: Light[] = [];
  private readonly splashes: Splash[] = [];
  private splashAcc = 0;
  private gatherTarget: { x: number; y: number } | null = null;
  private readonly leaves: Leaf[] = [];
  private readonly flash: Phaser.GameObjects.Image;
  private readonly indoor: boolean;
  private readonly sound: WeatherSound | null;
  private readonly forceThunder: boolean;
  /** 다음 천둥 시각 (0 = 센 비가 아님) */
  private thunderAt = 0;
  private flashAt = -Infinity;
  private flashPower = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    search: string,
    opts: AtmosphereOptions = {},
  ) {
    this.override = parseAmbienceOverride(search);
    this.indoor = opts.indoor ?? false;
    this.grade = opts.grade ?? !this.indoor;
    this.forceThunder = new URLSearchParams(search).get("thunder") === "1";
    this.sound = opts.sound === false ? null : WeatherSound.of(scene);
    this.blender = new LevelBlender(this.targetLevels(), TRANSITION_MS);

    const fixed = (o: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite, depth: number) =>
      o.setScrollFactor(0).setDepth(depth).setOrigin(0.5, 0.5);

    this.tint = fixed(scene.add.image(0, 0, TEX.pixel), DEPTH.tint).setBlendMode(Phaser.BlendModes.MULTIPLY) as Phaser.GameObjects.Image;
    this.haze = fixed(scene.add.image(0, 0, TEX.pixel), DEPTH.tint - 0.5).setVisible(false) as Phaser.GameObjects.Image;
    this.vignette = fixed(scene.add.image(0, 0, TEX.vignette), DEPTH.vignette) as Phaser.GameObjects.Image;

    const tile = (key: string, depth: number) => {
      const t = scene.add.tileSprite(0, 0, 16, 16, key).setScale(TS_SCALE).setTileScale(1 / TS_SCALE).setAlpha(0);
      return fixed(t, depth) as Phaser.GameObjects.TileSprite;
    };
    this.cloud = tile(TEX.cloud, DEPTH.tint - 1);
    this.rainFar = tile(TEX.rainFar, DEPTH.weather);
    this.rainNear = tile(TEX.rainNear, DEPTH.weather + 1);
    this.snowFar = tile(TEX.snowFar, DEPTH.weather);
    this.snowNear = tile(TEX.snowNear, DEPTH.weather + 1);
    this.fogFar = tile(TEX.fog, DEPTH.fog);
    this.fogNear = tile(TEX.fog, DEPTH.fog + 1);

    const n = reduced ? FIREFLY_MAX_REDUCED : FIREFLY_MAX;
    for (let i = 0; i < n; i++) {
      const img = scene.add.image(0, 0, TEX.firefly).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fireflies).setVisible(false);
      this.fireflies.push({ img, x: NaN, y: 0, vx: 0, vy: 0, phase: Math.random() * 10, orbit: 8 + Math.random() * 12 });
    }
    for (let i = 0; i < SPLASH_POOL; i++) {
      this.splashes.push({ img: scene.add.image(0, 0, TEX.splash).setDepth(DEPTH.weather - 1).setVisible(false), born: 0 });
    }
    Atmosphere.ensureLeafTextures(scene);
    const nl = reduced ? LEAF_MAX_REDUCED : LEAF_MAX;
    for (let i = 0; i < nl; i++) {
      const img = scene.add.image(0, 0, leafKey(i % LEAF_COLORS.length)).setDepth(DEPTH.weather - 2).setVisible(false);
      this.leaves.push({ img, x: NaN, y: 0, fall: 9 + Math.random() * 8, phase: Math.random() * 10, flutter: 260 + Math.random() * 260 });
    }
    this.flash = fixed(scene.add.image(0, 0, TEX.pixel), DEPTH.vignette - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xdde6ff)
      .setVisible(false) as Phaser.GameObjects.Image;
    if (this.forceThunder && typeof window !== "undefined") {
      (window as unknown as { __tombThunder?: () => void }).__tombThunder = () => this.strike();
    }
    this.resize();
  }

  /** 6×6 픽셀 낙엽 몇 가지 (한 번만 만든다) */
  private static ensureLeafTextures(scene: Phaser.Scene): void {
    // 행마다 [시작 x, 너비, 칠할 색 인덱스: 0 몸 / 1 밝은 쪽 / 2 잎자루]
    const rows: [number, number, number][][] = [
      [[2, 2, 1]],
      [[1, 2, 1], [3, 2, 0]],
      [[0, 3, 1], [3, 3, 0]],
      [[1, 4, 0]],
      [[2, 2, 0]],
      [[1, 1, 2]],
    ];
    LEAF_COLORS.forEach((cols, i) => {
      const key = leafKey(i);
      if (scene.textures.exists(key)) return;
      const tex = scene.textures.createCanvas(key, 6, 6);
      if (!tex) return;
      const ctx = tex.getContext();
      rows.forEach((segs, y) => {
        for (const [x, w, c] of segs) {
          ctx.fillStyle = cols[c];
          ctx.fillRect(x, y, w, 1);
        }
      });
      tex.refresh();
    });
  }

  /** 화면 크기가 바뀌면 화면 고정 레이어를 다시 덮는다 */
  resize(): void {
    const cam = this.scene.cameras.main;
    const w = cam.width / ZOOM_MIN + 64;
    const h = cam.height / ZOOM_MIN + 64;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    this.tint.setPosition(cx, cy).setDisplaySize(w, h);
    this.haze.setPosition(cx, cy).setDisplaySize(w, h);
    this.flash.setPosition(cx, cy).setDisplaySize(w, h);
    for (const t of [this.cloud, this.rainFar, this.rainNear, this.snowFar, this.snowNear, this.fogFar, this.fogNear]) {
      t.setPosition(cx, cy).setSize(Math.ceil(w / TS_SCALE), Math.ceil(h / TS_SCALE));
    }
  }

  setStaticLights(spots: LightSpot[]): void {
    for (const l of this.staticLights) l.img.destroy();
    this.staticLights = spots.map((s, i) => this.makeLight(s, i));
  }

  setGridLights(spots: LightSpot[]): void {
    for (const l of this.gridLights) l.img.destroy();
    this.gridLights = spots.map((s, i) => this.makeLight(s, i + 50));
  }

  private makeLight(spot: LightSpot, i: number): Light {
    const img = this.scene.add
      .image(spot.x, spot.y, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights)
      .setScale(spot.scale)
      .setTint(spot.tint);
    return { spot, img, phase: i * 1.37 };
  }

  /** 오래 앉아 있으면 반딧불이 모여든다 (null이면 흩어짐) */
  gather(target: { x: number; y: number } | null): void {
    this.gatherTarget = target;
  }

  private targetLevels(): Levels {
    return levelsFor(ambienceAt(Date.now(), this.override), this.grade);
  }

  get levels(): Levels {
    return this.blender.current;
  }

  update(time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    if (time >= this.nextCheck) {
      this.nextCheck = time + RECHECK_MS;
      this.blender.setTarget(this.targetLevels(), time);
    }
    const L = this.blender.update(time);
    const cam = this.scene.cameras.main;
    this.sound?.report(L.rain, this.indoor);
    this.updateThunder(time, L);

    // ── 톤 ──
    this.tint.setTint(L.tint);
    this.tint.setVisible(L.tint !== 0xffffff);
    this.haze.setTint(L.hazeColor).setAlpha(L.haze).setVisible(L.haze > 0.005);
    // 어둠은 Lighting이 그린다 (빛 구멍을 뚫기 위해)
    this.vignette
      .setPosition(cam.width / 2, cam.height / 2)
      .setDisplaySize(cam.width / cam.zoom + 2, cam.height / cam.zoom + 2)
      .setAlpha(0.12 + 0.5 * L.darkness);

    // ── 빛 ── (밤에 또렷, 낮에는 거의 안 보임). 어두울수록 빛 무리가 더 크고 따뜻하게 번진다
    const dk = this.grade ? L.darkness : 0; // 실내·입장 화면은 예전 그대로
    const glow = (0.12 + 0.88 * L.glow) * (1 + 0.7 * dk);
    const spread = 1 + 0.35 * dk;
    this.updateLights(this.staticLights, time, glow, view, spread);
    this.updateLights(this.gridLights, time, glow, view, spread);

    // ── 월드에 붙은 화면 고정 타일: 타일 위치 = 카메라가 보는 월드 좌표 ──
    const ox = cam.scrollX + cam.width / 2;
    const oy = cam.scrollY + cam.height / 2;
    const anchor = Atmosphere.anchor;
    const s = time / 1000;
    const drift = this.reduced ? 0.3 : 1;

    this.fogFar.setAlpha(L.fog * 0.55).setVisible(L.fog > 0.01);
    this.fogNear.setAlpha(L.fog * 0.75).setVisible(L.fog > 0.01);
    if (L.fog > 0.01) {
      anchor(this.fogFar, ox, oy, 0.85, s * 3 * drift, s * 0.6 * drift);
      anchor(this.fogNear, ox, oy, 1, s * 7 * drift, -s * 1.2 * drift);
    }

    this.cloud.setAlpha(L.cloud * 0.4).setVisible(L.cloud > 0.01);
    if (L.cloud > 0.01) anchor(this.cloud, ox, oy, 1, -s * 9 * drift, -s * 4 * drift);

    // 집 안에는 비·눈·낙엽이 내리지 않는다
    const rain = this.indoor ? 0 : L.rain;
    const snow = this.indoor ? 0 : L.snow;
    const rainSpeed = this.reduced ? 0.35 : 1;
    this.rainFar.setAlpha(rain * (this.reduced ? 0.3 : 0.45)).setVisible(rain > 0.01);
    this.rainNear.setAlpha(this.reduced ? 0 : rain * 0.6).setVisible(!this.reduced && rain > 0.15);
    if (rain > 0.01) {
      this.rainFar.tilePositionY -= dt * 0.22 * rainSpeed;
      this.rainFar.tilePositionX += dt * 0.073 * rainSpeed;
      this.rainNear.tilePositionY -= dt * 0.34 * rainSpeed;
      this.rainNear.tilePositionX += dt * 0.113 * rainSpeed;
    }

    this.snowFar.setAlpha(snow * 0.7).setVisible(snow > 0.01);
    this.snowNear.setAlpha(this.reduced ? 0 : snow * 0.9).setVisible(!this.reduced && snow > 0.15);
    if (snow > 0.01) {
      const k = this.reduced ? 0.4 : 1;
      this.snowFar.tilePositionY -= dt * 0.012 * k;
      this.snowFar.tilePositionX = Math.sin(s * 0.7) * 4;
      this.snowNear.tilePositionY -= dt * 0.024 * k;
      this.snowNear.tilePositionX = Math.sin(s * 0.9 + 1) * 7;
    }

    this.updateSplashes(time, dt, rain, view);
    this.updateLeaves(time, dt, this.indoor ? 0 : L.leaves, view);
    this.updateFireflies(time, dt, L.fireflies, view);
  }

  // ── 천둥·번개 ──

  private quiet(): boolean {
    return isQuietHour(this.override.hour ?? kstHour(Date.now()));
  }

  /** 센 비가 오는 동안 가끔 천둥. 번개가 번쩍이는 동안은 어둠도 걷힌다 (Lighting이 levels.darkness를 읽는다) */
  private updateThunder(time: number, L: Levels): void {
    if (L.rain >= THUNDER_MIN_RAIN) {
      if (!this.thunderAt) this.thunderAt = time + thunderGapMs(L.rain, this.quiet(), Math.random(), true, this.forceThunder);
      else if (time >= this.thunderAt) {
        this.strike();
        this.thunderAt = time + thunderGapMs(L.rain, this.quiet(), Math.random(), false, this.forceThunder);
      }
    } else this.thunderAt = 0;
    // 친 뒤 처음 그리는 프레임이 가장 밝게 (프레임이 느려도 첫 번쩍임을 건너뛰지 않게)
    if (Number.isNaN(this.flashAt)) this.flashAt = time;
    const a = this.flashPower > 0 ? thunderFlash(time - this.flashAt) * this.flashPower : 0;
    this.flash.setVisible(a > 0.005);
    if (a > 0.005) {
      this.flash.setAlpha(0.42 * a);
      L.darkness *= 1 - 0.8 * a;
    }
  }

  /** 번개 한 번 (+ 거리만큼 늦게 천둥소리) */
  private strike(): void {
    const quiet = this.quiet();
    const rain = this.blender.current.rain;
    // 움직임 줄이기 설정이면 번쩍이지 않는다 (소리만), 집 안에서도 창이 없으니 번쩍이지 않는다
    this.flashPower = this.reduced || this.indoor ? 0 : (0.55 + 0.45 * Math.random()) * (quiet ? 0.55 : 1);
    this.flashAt = NaN;
    this.sound?.thunder((0.6 + 0.4 * Math.random()) * (0.6 + 0.4 * rain) * (quiet ? 0.45 : 1), thunderDelaySec(Math.random()));
  }

  // ── 낙엽 ──

  /** 가을: 화면 위쪽에서 나뭇잎이 흔들리며 떨어진다 (월드 좌표, 화면을 벗어나면 위에서 다시) */
  private updateLeaves(time: number, dt: number, density: number, view: Phaser.Geom.Rectangle): void {
    const active = density < 0.02 ? 0 : Math.max(1, Math.round(this.leaves.length * density));
    const k = dt / 1000;
    const speed = this.reduced ? 0.5 : 1;
    for (let i = 0; i < this.leaves.length; i++) {
      const f = this.leaves[i];
      if (i >= active) {
        if (f.img.visible) f.img.setVisible(false);
        f.x = NaN;
        continue;
      }
      const out = !(f.y < view.bottom + 8 && f.x > view.x - 40 && f.x < view.right + 40 && f.y > view.y - view.height);
      if (Number.isNaN(f.x)) {
        // 처음에는 화면 곳곳에서 (한꺼번에 위에서 쏟아지지 않게)
        f.x = view.x + Math.random() * view.width;
        f.y = view.y + Math.random() * view.height;
      } else if (out) {
        f.x = view.x - 20 + Math.random() * (view.width + 20);
        f.y = view.y - 8 - Math.random() * view.height * 0.3;
      }
      const sway = Math.sin(time / 900 + f.phase) * 10;
      f.x += (5 + sway) * k * speed;
      f.y += f.fall * k * speed * (0.75 + 0.25 * Math.sin(time / 500 + f.phase * 2));
      // 빙글빙글: 가로로 뒤집히며 납작해졌다 넓어졌다
      const c = this.reduced ? 1 : Math.cos(time / f.flutter + f.phase);
      f.img
        .setPosition(Math.round(f.x), Math.round(f.y))
        .setScale(Math.max(0.3, Math.abs(c)), 1)
        .setFlipX(c < 0)
        .setAlpha(0.92)
        .setVisible(true);
    }
  }

  /** 화면 고정 TileSprite의 무늬를 월드 좌표에 붙인다 (ox,oy: 카메라 중심의 월드 좌표). 매 프레임 클로저를 만들지 않게 static */
  private static anchor(t: Phaser.GameObjects.TileSprite, ox: number, oy: number, par: number, dx: number, dy: number): void {
    const hw = (t.width * TS_SCALE) / 2;
    const hh = (t.height * TS_SCALE) / 2;
    t.setTilePosition((ox - hw) * par + dx, (oy - hh) * par + dy);
  }

  private updateLights(lights: Light[], time: number, glow: number, view: Phaser.Geom.Rectangle, spread: number): void {
    for (const l of lights) {
      const { x, y } = l.spot;
      const vis = x > view.x - 40 && x < view.right + 40 && y > view.y - 40 && y < view.bottom + 40;
      l.img.setVisible(vis);
      if (!vis) continue;
      const flicker = this.reduced ? 1 : 0.86 + 0.08 * Math.sin(time / 210 + l.phase) + 0.06 * Math.sin(time / 67 + l.phase * 3);
      l.img.setAlpha(Math.min(1, l.spot.base * glow * flicker));
      // 바깥 밤: 빛 무리 크기도 살짝 일렁인다 (실내는 spread=1이라 예전 그대로)
      if (spread !== 1) l.img.setScale(l.spot.scale * spread * (0.97 + 0.03 * flicker));
    }
  }

  private updateSplashes(time: number, dt: number, rain: number, view: Phaser.Geom.Rectangle): void {
    for (const sp of this.splashes) {
      if (!sp.img.visible) continue;
      const t = (time - sp.born) / 260;
      if (t >= 1) sp.img.setVisible(false);
      else sp.img.setAlpha(0.8 * (1 - t)).setScale(0.7 + t * 0.6);
    }
    if (this.reduced || rain < 0.05) return;
    // 비 세기에 비례한 물튐. 화면에 보이는 바닥에 무작위로 떨어진다
    this.splashAcc += (dt / 1000) * rain * 40;
    while (this.splashAcc >= 1) {
      this.splashAcc -= 1;
      let sp: Splash | null = null;
      for (let i = 0; i < this.splashes.length; i++) {
        if (!this.splashes[i].img.visible) {
          sp = this.splashes[i];
          break;
        }
      }
      if (!sp) break;
      sp.born = time;
      sp.img
        .setPosition(view.x + Math.random() * view.width, view.y + Math.random() * view.height)
        .setDepth(DEPTH.decal + 2)
        .setVisible(true);
    }
  }

  private updateFireflies(time: number, dt: number, density: number, view: Phaser.Geom.Rectangle): void {
    const gather = this.gatherTarget;
    const active = Math.max(gather ? 5 : 0, Math.round(this.fireflies.length * density));
    const brightness = gather ? Math.max(density, 0.45) : density;
    const k = dt / 1000;
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];
      if (i >= active || brightness < 0.02) {
        f.img.setVisible(false);
        f.x = NaN;
        continue;
      }
      const out = !(f.x > view.x - 30 && f.x < view.right + 30 && f.y > view.y - 30 && f.y < view.bottom + 30);
      if (Number.isNaN(f.x) || (out && !gather)) {
        f.x = view.x + Math.random() * view.width;
        f.y = view.y + Math.random() * view.height;
      }
      const speed = this.reduced ? 3 : 7;
      if (gather && i < 8) {
        const a = time / (1400 + i * 120) + f.phase;
        const tx = gather.x + Math.cos(a) * f.orbit;
        const ty = gather.y - 10 + Math.sin(a) * f.orbit * 0.6;
        f.vx += (tx - f.x) * k * 1.6 - f.vx * k * 1.2;
        f.vy += (ty - f.y) * k * 1.6 - f.vy * k * 1.2;
      } else {
        f.vx += (Math.sin(time / 1700 + f.phase * 3) * speed - f.vx) * k;
        f.vy += (Math.cos(time / 2100 + f.phase * 2) * speed * 0.7 - f.vy) * k;
      }
      f.x += f.vx * k;
      f.y += f.vy * k;
      const blink = this.reduced ? 0.7 : 0.25 + 0.75 * Math.max(0, Math.sin(time / 600 + f.phase * 5));
      f.img.setPosition(f.x, f.y).setAlpha(blink * brightness).setVisible(true);
    }
  }

  destroy(): void {
    // 씬이 정리되면서 오브젝트도 함께 파괴된다
    this.staticLights = [];
    this.gridLights = [];
  }
}
