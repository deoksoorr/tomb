import * as Phaser from "phaser";
import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { inTelegraph } from "@/lib/rpg/patterns";
import { RF_VANE_GUST, RF_VISITS, rfWeather, type RfWeather } from "@/lib/rpg/towerThemes/rooftop";
import { RF_SPARK_CAP, rfVaneAdds } from "@/lib/rpg/towerThemes/rooftopPlan";
import { css, makeCanvas, mix, radial } from "../../sprites/pixel";
import type { Layer } from "../../rpg/skillSound";
import type { Telegraph } from "../../rpg/telegraph";
import { towerSound } from "../towerSound";
import { FxPool, MonGrid } from "./fxPool";
import { foldMultiply } from "./overlay";
import { RF_MATS, RF_ROOM_NAMES, rfSkyline, rfSolidAt, type RfWindow } from "./rooftopMap";
import type { ThemeHost, ThemeMon, TowerThemeRuntime } from "./runtime";
import { digits } from "./serverRoomMap";

// 11/15 옥상 정원 폭풍 실행부 (층마다 하나): 움직이는 배경(비·웅덩이에 비친 네온·흔들리는 화분·도시 창문·바람 자루·층 번호),
// 기믹 「돌풍」(바람 화살표 → 나·몬스터·탄이 옆으로 밀린다, 소품 뒤면 덜) · 「낙뢰」(노란 원 → 벼락, 웅덩이에 떨어지면 웅덩이 전체가 찌릿),
// 번개가 치면 화면 전체가 환해진다 — 화면을 덮는 층을 새로 두지 않고 지도의 곱하기 분위기 층 색을 잠깐 밝힌다 (overlay.ts 방식).
// 몬스터 열네 종 행동·정예 풍향계 수탉·우두머리 피뢰침 세 단계. 다시 올 때마다 날씨가 거칠어진다 (rfWeather).
// 서버 상한과 상관있는 것: 수탉이 불러오는 서류 뭉치는 rfVaneAdds(층 계획 adds와 같다), 우두머리가 따로 흩뿌리는 불꽃은 RF_SPARK_CAP(층 계획 adds와 같다 — Arena가 체력 단계마다 부르는 summon 두 번 몫과 따로).

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;

const D_STENCIL = -796;
const D_FLOOR = -790;
const D_SKY = -900;
const D_GLOW = 9056;
const D_REFLECT = 9010;
const D_ARROW = 9070;
const D_FX = 9140;

const T = {
  soft: "rf-soft",
  smoke: "rf-smoke",
  px: "rf-px",
  splash: "rf-splash",
  ripple: "rf-ripple",
  arrow: "rf-arrow",
  paper: "rf-paper",
  sign: (f: number) => `rf-sign-${f}`,
  stencil: (f: number) => `rf-stencil-${f}`,
} as const;

const NEON = [0xff4ab0, 0x4ad8ff, 0xffd04a, 0x8a5aff] as const;
const BOLT = 0xfff6c0;
const STRIKE_PCT = 0.08;
const ZAP_PCT = 0.06;
/** 우두머리 불꽃 상한 (한 층 합계 — 서버 층 계획 adds와 같은 값, lib/rpg/towerThemes/rooftopPlan). 체력 단계마다 Arena가 부르는 summon 몫과 따로 */
const SPARK_CAP = RF_SPARK_CAP;

const o = (wave: Layer["wave"], at: number, dur: number, f0: number, f1: number, gain: number, x: Partial<Layer> = {}): Layer => ({ src: "osc", wave, at, dur, f0, f1, gain, atk: 0.004, env: "perc", ...x });
const n = (at: number, dur: number, gain: number, type: "lowpass" | "highpass" | "bandpass", f0: number, f1 = f0, q = 0.8, x: Partial<Layer> = {}): Layer => ({ src: "noise", at, dur, gain, atk: 0.004, env: "perc", flt: { type, f0, f1, q }, ...x });
const SND: Record<string, Layer[]> = {
  thunder: [
    { src: "crackle", at: 0, dur: 0.28, gain: 0.4, atk: 0.002, env: "perc", flt: { type: "highpass", f0: 2400, f1: 900, q: 0 } },
    n(0.02, 1.6, 0.55, "lowpass", 700, 90, 0),
    o("sine", 0.05, 1.3, 70, 34, 0.32),
  ],
  rumble: [n(0, 2.2, 0.28, "lowpass", 260, 70, 0, { atk: 0.3, env: "hold" })],
  gust: [n(0, 1.8, 0.24, "bandpass", 260, 900, 0.9, { atk: 0.5, env: "swell" }), n(0.3, 1.6, 0.12, "bandpass", 1200, 500, 1.4, { atk: 0.4, env: "hold" })],
  coo: [o("sine", 0, 0.22, 420, 330, 0.09, { lfo: { hz: 18, cents: 80, on: "pitch" } }), o("sine", 0.24, 0.3, 400, 300, 0.08, { lfo: { hz: 16, cents: 80, on: "pitch" } })],
  flutter: [n(0, 0.5, 0.18, "bandpass", 1800, 900, 1.2, { lfo: { hz: 22, cents: 600, on: "filter" } })],
  meow: [o("triangle", 0, 0.45, 620, 980, 0.12, { glide: 0.2 }), o("triangle", 0.2, 0.25, 980, 560, 0.08)],
  hiss: [n(0, 1.2, 0.2, "highpass", 1600, 2600, 0, { atk: 0.15, env: "hold" })],
  crash: [n(0, 0.35, 0.32, "lowpass", 900, 200, 0), o("square", 0, 0.12, 180, 60, 0.12)],
};

/** 처음 한 번만 알려 주는 말 (판 안에서 층이 바뀌어도 다시 안 한다) */
const TOLD = new WeakMap<Phaser.Scene, { keys: Set<string>; t: number }>();

type Cloud = { img: Phaser.GameObjects.Image; x: number; y: number; born: number; on: boolean };
type Puddle = { x: number; y: number; rx: number; ry: number; until: number; zap: number; warn: number; hurt: boolean; deco: boolean };
type Bolt = { pts: number[]; until: number; w: number };
type Scorch = { x: number; y: number; until: number };

type St = {
  mode: number;
  at: number;
  until: number;
  t0: number;
  vx: number;
  vy: number;
  hitAt: number;
  ang: number;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  px: number;
  py: number;
  ph: number;
  tele?: Telegraph;
  links?: ThemeMon[];
  linkAt?: number;
  buff?: { id: string; left: number; v: number } | null;
  buffAt?: number;
  adds?: number;
  phase?: number;
  sumAt?: number;
  chainAt?: number;
  finalAt?: number;
  finalWarn?: number;
};

function ensureTextures(scene: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  };
  add(T.soft, () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  add(T.smoke, () => radial(32, [[0, "rgba(255,255,255,0.75)"], [0.55, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  add(T.px, () => {
    const { canvas, ctx } = makeCanvas(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 2, 2);
    return canvas;
  });
  add(T.splash, () => {
    const { canvas, ctx } = makeCanvas(7, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 3, 1, 1);
    ctx.fillRect(1, 2, 1, 1);
    ctx.fillRect(3, 0, 1, 2);
    ctx.fillRect(5, 2, 1, 1);
    ctx.fillRect(6, 3, 1, 1);
    return canvas;
  });
  add(T.ripple, () => {
    const { canvas, ctx } = makeCanvas(11, 5);
    ctx.fillStyle = "#fff";
    ctx.fillRect(3, 0, 5, 1);
    ctx.fillRect(3, 4, 5, 1);
    ctx.fillRect(1, 1, 2, 1);
    ctx.fillRect(8, 1, 2, 1);
    ctx.fillRect(1, 3, 2, 1);
    ctx.fillRect(8, 3, 2, 1);
    ctx.fillRect(0, 2, 1, 1);
    ctx.fillRect(10, 2, 1, 1);
    return canvas;
  });
  // 바람 화살표 (오른쪽, 꼬리가 흐리다)
  add(T.arrow, () => {
    const { canvas, ctx } = makeCanvas(22, 9);
    for (let x = 0; x < 15; x++) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (x / 15) * 0.85})`;
      ctx.fillRect(x, 4, 1, 1);
      if (x > 4) ctx.fillRect(x, 3, 1, 1);
    }
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 5; i++) ctx.fillRect(15 + i, 4 - (4 - i), 1, (4 - i) * 2 + 1);
    return canvas;
  });
  add(T.paper, () => {
    const { canvas, ctx } = makeCanvas(4, 3);
    ctx.fillStyle = "#f2f0e6";
    ctx.fillRect(0, 0, 4, 3);
    ctx.fillStyle = "#5a7aa8";
    ctx.fillRect(1, 1, 2, 1);
    return canvas;
  });
}

export class RooftopStage implements TowerThemeRuntime {
  private readonly sc: Phaser.Scene;
  private readonly floor: number;
  private readonly visit: number;
  private readonly w: RfWeather;
  private readonly room: number;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly st = new Map<ThemeMon, St>();
  private readonly t0: number;
  private readonly rnd: () => number;
  private readonly props: readonly { kind: string; x: number; y: number }[];
  // 그림 층 (매 프레임: 바닥 fx·더하기 fx, 하늘은 띄엄띄엄)
  private floorG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private skyG!: Phaser.GameObjects.Graphics;
  private sockG: Phaser.GameObjects.Graphics | null = null;
  private skyAt = 0;
  private pool!: FxPool;
  private splashes!: FxPool;
  private grid = new MonGrid(32);
  // 날씨
  private rain: { x: Float32Array; y: Float32Array; len: Float32Array; v: Float32Array } = { x: new Float32Array(0), y: new Float32Array(0), len: new Float32Array(0), v: new Float32Array(0) };
  private windows: RfWindow[] = [];
  private skyNeon: { img: Phaser.GameObjects.Image; ph: number }[] = [];
  private reflections: { img: Phaser.GameObjects.Image; p: Puddle; base: number; ph: number; streak: boolean; x0: number }[] = [];
  private sway: { img: Phaser.GameObjects.Image; ph: number; k: number; x0: number; bench: boolean }[] = [];
  private poles: { x: number; y: number }[] = [];
  private amb: Phaser.GameObjects.Rectangle | null = null;
  private ambBase = 0xffffff;
  private flashK = 0;
  private puddles: Puddle[] = [];
  private scorches: Scorch[] = [];
  private bolts: Bolt[] = [];
  /** 벼락이 떨어지기 전 하늘에서 그 자리로 모이는 전기 (경고 동안) */
  private charging: { x: number; y: number; start: number; end: number }[] = [];
  private clouds: Cloud[] = [];
  private arrows: Phaser.GameObjects.Image[] = [];
  private gust = { next: 0, warn: false, until: 0, start: 0, dx: 1, dy: 0, ang: 0 };
  private wind = { x: 0, y: 0 };
  private shotW = { x: 0, y: 0 };
  private strikeAt = 0;
  private skyBoltAt = 0;
  private swoop = { at: 0, warnUntil: 0, until: 0 };
  private sparks = 0;
  private mats: { x: number; y: number; w: number; h: number }[] = [];
  private coughAt = 0;
  private cloudHurtAt = 0;
  private tetherHurtAt = 0;
  private shelterAt = 0;
  private laters: { at: number; fn: () => void }[] = [];

  constructor(
    private readonly host: ThemeHost,
    seed: number,
  ) {
    this.sc = host.scene;
    this.floor = host.floor();
    this.visit = host.visit();
    this.w = rfWeather(this.visit);
    const l = host.layout();
    this.room = l.variant;
    this.props = l.props;
    this.t0 = host.now();
    let s = (seed ^ 0x52465354) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.gust.next = this.t0 + 6500;
    this.strikeAt = this.t0 + 4200;
    this.skyBoltAt = this.t0 + 1500;
    this.swoop.at = this.t0 + 5000;
    ensureTextures(this.sc);
    this.build();
  }

  /** 묶음 입자 (그림을 안 주면 부드러운 빛 — 묶음이 그림을 기억하므로 늘 넘긴다) */
  private fx(x: number, y: number, o: Parameters<FxPool["emit"]>[2]): void {
    this.pool.emit(x, y, { ...o, tex: o.tex ?? T.soft });
  }

  private splash(x: number, y: number, o: Parameters<FxPool["emit"]>[2]): void {
    this.splashes.emit(x, y, { ...o, tex: o.tex ?? T.splash });
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private snd(key: keyof typeof SND | "zap"): void {
    this.host.synth(`rf-${key}`, key === "zap" ? towerSound("zap") : SND[key]);
  }

  private tell(key: string, msg: string, ms = 2000): void {
    let told = TOLD.get(this.sc);
    // 씬 시간이 거꾸로 갔으면 새 판
    if (!told || told.t > this.t0) TOLD.set(this.sc, (told = { keys: new Set(), t: this.t0 }));
    told.t = this.t0;
    if (told.keys.has(key)) return;
    told.keys.add(key);
    this.host.flash(msg, ms);
  }

  title(): string {
    const name = RF_ROOM_NAMES[this.room] ?? "";
    return `${name} · ${RF_VISITS[Math.min(RF_VISITS.length - 1, this.visit)].name}`;
  }

  // ── 배경 ──

  private build(): void {
    const sc = this.sc;
    const l = this.host.layout();
    // 층 번호: 바닥 페인트(시작점 아래) + 난간 표지
    const fkey = T.stencil(this.floor);
    if (!sc.textures.exists(fkey))
      sc.textures.addCanvas(
        fkey,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(text.length * 16, 22);
          digits(ctx, text, 1, 1, 0xf2f2ee, 4, 0.5);
          ctx.globalCompositeOperation = "destination-out";
          for (let k = 0; k < 110; k++) ctx.fillRect(Math.floor(Math.random() * canvas.width), Math.floor(Math.random() * 22), 1 + (k % 2), 1);
          return canvas;
        })(),
      );
    this.keep(sc.add.image(l.start.x, l.start.y + 26, fkey).setDepth(D_STENCIL).setAlpha(0.7));
    const skey = T.sign(this.floor);
    if (!sc.textures.exists(skey))
      sc.textures.addCanvas(
        skey,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(36, 14);
          ctx.fillStyle = "#14101c";
          ctx.fillRect(0, 0, 36, 14);
          ctx.fillStyle = css(0xff4ab0);
          ctx.fillRect(0, 0, 36, 1);
          ctx.fillRect(0, 13, 36, 1);
          ctx.fillRect(0, 0, 1, 14);
          ctx.fillRect(35, 0, 1, 14);
          const w = digits(ctx, text, 0, 0, 0, 2, 0);
          digits(ctx, text, Math.round((36 - w) / 2), 2, 0xffd0ea, 2);
          return canvas;
        })(),
      );
    this.keep(sc.add.image(64, 18, skey).setDepth(-899));
    this.keep(sc.add.image(64, 18, T.soft).setDisplaySize(64, 30).setTint(0xff4ab0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0.35));

    // 도시 창문 · 먼 네온
    const sky = rfSkyline(this.room);
    this.windows = sky.windows;
    if (!this.w.blackout)
      for (const nn of sky.neon)
        this.skyNeon.push({ img: this.keep(sc.add.image(nn.x + nn.w / 2, nn.y + 1, T.soft).setDisplaySize(nn.w + 10, 9).setTint(nn.col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0.6)), ph: this.rnd() * 6 });
    this.skyG = this.keep(sc.add.graphics().setDepth(D_SKY));
    // 난간 너머 도시 불빛이 옥상 앞쪽까지 번진다
    if (!this.w.blackout)
      for (let i = 0; i < 4; i++)
        this.keep(sc.add.image(56 + i * 112, TOP + 4, T.soft).setDisplaySize(170, 46).setTint(NEON[(i + this.room) % NEON.length]).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_REFLECT).setAlpha(0.13));

    // 웅덩이 (바닥 무늬) + 비친 네온
    let k = 0;
    for (const d of l.decals) {
      if (d.kind === "rf_puddle") {
        const p: Puddle = { x: d.x + d.w / 2, y: d.y + d.h / 2, rx: d.w / 2, ry: d.h / 2, until: Infinity, zap: 0, warn: 0, hurt: false, deco: true };
        this.puddles.push(p);
        // 11/15 비친 빛은 어둠(곱하기 층) 위에 더한다 — 젖은 바닥에 네온이 번져 보이게
        const col = this.room === 6 ? NEON[k % 2] : NEON[(k + Math.floor(this.rnd() * 4)) % NEON.length];
        const dim = this.w.blackout ? 0.4 : 1;
        const img = this.keep(sc.add.image(p.x, p.y, T.soft).setDisplaySize(d.w * 0.9, Math.max(5, d.h * 0.9)).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_REFLECT));
        this.reflections.push({ img, p, base: 0.26 * dim, ph: this.rnd() * 6, streak: false, x0: p.x });
        // 세로로 늘어진 반사 줄 (간판 불빛이 물에 비친 것)
        const nStreak = Math.max(1, Math.min(4, Math.floor(d.w / 14)));
        for (let i = 0; i < nStreak; i++) {
          const x = p.x - p.rx * 0.6 + (p.rx * 1.2 * (i + 0.5)) / nStreak + (this.rnd() - 0.5) * 4;
          const c2 = i % 2 ? col : NEON[(k + i + 1) % NEON.length];
          const st = this.keep(sc.add.image(x, p.y, T.px).setDisplaySize(1 + (i % 2), Math.max(4, d.h * 0.8)).setTint(c2).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_REFLECT));
          this.reflections.push({ img: st, p, base: 0.7 * dim, ph: this.rnd() * 6, streak: true, x0: x });
        }
        k++;
      }
    }
    this.heli = l.decals.filter((d) => d.kind === "rf_helilight").map((d, i) => ({ x: d.x + d.w / 2, y: d.y + d.h / 2, i }));
    // 우두머리 층 고무 매트 (번개 폭포 때 안전한 자리) — 다른 방이면 즉석 매트 셋
    const mats = l.decals.filter((d) => d.kind === "rf_mat");
    this.mats = mats.length ? mats.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h })) : RF_MATS.slice(0, 3).map(([x, y, w, h]) => ({ x, y, w, h }));

    // 흔들리는 소품 (지도가 만든 그림을 찾아서)
    for (const ch of sc.children.list) {
      if (!(ch instanceof Phaser.GameObjects.Image)) continue;
      const key = ch.texture.key;
      if (!key.startsWith("arena-prop-rf_")) continue;
      if (key.startsWith("arena-prop-rf_shrub")) this.sway.push({ img: ch, ph: this.rnd() * 6, k: 1, x0: ch.x, bench: false });
      else if (key.startsWith("arena-prop-rf_pot") || key.startsWith("arena-prop-rf_scarecrow")) this.sway.push({ img: ch, ph: this.rnd() * 6, k: 0.6, x0: ch.x, bench: false });
      else if (key.startsWith("arena-prop-rf_bench")) this.sway.push({ img: ch, ph: this.rnd() * 6, k: 0, x0: ch.x, bench: true });
    }
    for (const p of this.props) if (p.kind === "rf_pole") this.poles.push({ x: p.x, y: p.y - 44 });
    if (this.poles.length) this.sockG = this.keep(sc.add.graphics().setDepth(this.poles[0].y + 45));

    // 비 줄기
    const N = Math.round(60 + 60 * this.w.rain);
    this.rain = { x: new Float32Array(N), y: new Float32Array(N), len: new Float32Array(N), v: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      this.rain.x[i] = this.rnd() * (AW + 80) - 40;
      this.rain.y[i] = this.rnd() * AH;
      this.rain.len[i] = 7 + this.rnd() * 9;
      this.rain.v[i] = 300 + this.rnd() * 140;
    }
    this.floorG = this.keep(sc.add.graphics().setDepth(D_FLOOR));
    this.fxG = this.keep(sc.add.graphics().setDepth(D_FX).setBlendMode(Phaser.BlendModes.ADD));
    this.pool = new FxPool(sc, T.soft, 56, 9065);
    this.splashes = new FxPool(sc, T.splash, 40, D_FLOOR + 2, false);
    for (let i = 0; i < 16; i++) this.clouds.push({ img: this.keep(sc.add.image(-99, -99, T.smoke).setTint(0x9aa0a8).setVisible(false)), x: 0, y: 0, born: 0, on: false });
    for (let i = 0; i < 10; i++) this.arrows.push(this.keep(sc.add.image(-99, -99, T.arrow).setDepth(D_ARROW).setVisible(false).setBlendMode(Phaser.BlendModes.ADD)));

    // 어두운 판(정전된 도시부터): 지도의 곱하기 분위기 층에 더 곱해 넣는다
    if (this.w.blackout) {
      const own = foldMultiply(sc, 0x8a90b8, 9000, () => sc.add.rectangle(-200, -200, AW + 400, AH + 400, 0x8a90b8).setOrigin(0, 0).setDepth(9000).setBlendMode(Phaser.BlendModes.MULTIPLY));
      if (own) this.keep(own);
    }
    this.amb = (sc.children.list.find((ch) => ch instanceof Phaser.GameObjects.Rectangle && ch.blendMode === Phaser.BlendModes.MULTIPLY && ch.depth === 9000 && ch.visible) as Phaser.GameObjects.Rectangle | undefined) ?? null;
    if (this.amb) this.ambBase = this.amb.fillColor;
  }

  private heli: { x: number; y: number; i: number }[] = [];

  // ── 몬스터 ──

  private s(m: ThemeMon): St {
    let x = this.st.get(m);
    if (!x) {
      const now = this.host.now();
      x = { mode: 0, at: now + 1200 + this.rnd() * 1500, until: 0, t0: 0, vx: 0, vy: 0, hitAt: 0, ang: 0, ox: m.x, oy: m.y, tx: 0, ty: 0, px: m.x, py: m.y, ph: this.rnd() * 6 };
      this.st.set(m, x);
    }
    return x;
  }

  spawned(m: ThemeMon): void {
    const s = this.s(m);
    const now = this.host.now();
    switch (m.id) {
      case "rf_vane":
        s.at = now + 2500;
        s.adds = 0;
        this.host.flash("정예 「풍향계 수탉」 등장! 살아 있으면 돌풍이 잦고 서류가 날아들어요!", 2400);
        if (this.gust.next > now + 3000 && !this.gust.warn && this.gust.until < now) this.gust.next = now + 3000;
        break;
      case "rf_lightning_rod":
        s.at = now + 2600;
        s.sumAt = now + 7000;
        s.phase = 0;
        break;
      case "rf_parcel":
        s.at = now + 900 + this.rnd() * 900;
        break;
      case "rf_cat":
        s.buff = null;
        break;
    }
  }

  move(m: ThemeMon, dt: number): boolean {
    const H = this.host;
    const s = this.s(m);
    const now = H.now();
    const P = H.player();
    const dx = P.x - m.x;
    const dy = P.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const blowing = this.wind.x !== 0 || this.wind.y !== 0;
    switch (m.id) {
      case "rf_umbrella": {
        if (!blowing) return false;
        // 돌풍을 타고 빙글빙글 (바람 쪽으로 크게, 나 쪽으로 조금)
        H.moveMon(m, (this.wind.x * 1.6 + (dx / d) * m.st.speed * 0.6) * dt, (this.wind.y * 1.6 + (dy / d) * m.st.speed * 0.6) * dt);
        s.ang += dt * 760 * (this.wind.x >= 0 ? 1 : -1);
        m.sprite.setAngle(s.ang);
        return true;
      }
      case "rf_planter":
        if (s.mode === 1) return true;
        if (now >= s.at && d < 170 && d > 30 && !m.hidden) {
          this.planterLaunch(m, s, now, P);
          return true;
        }
        return false;
      case "rf_ac_unit":
      case "rf_rod_broken": {
        // 거의 제자리 (붙으면 천천히 물러나고, 피뢰침은 멀면 아주 천천히 다가온다)
        if (d < 46) H.moveMon(m, (-dx / d) * m.st.speed * dt, (-dy / d) * m.st.speed * dt);
        else if (m.id === "rf_rod_broken" && d > 130) H.moveMon(m, (dx / d) * m.st.speed * 0.6 * dt, (dy / d) * m.st.speed * 0.6 * dt);
        return true;
      }
      case "rf_pigeon":
        this.pigeonMove(m, s, now, dt, P);
        return true;
      case "rf_papers": {
        // 바람 부는 쪽으로 휙휙 + 나 쪽으로 + 펄럭임
        const wob = Math.sin(now / 140 + s.ph * 3) * 46;
        const nx = -dy / d;
        const ny = dx / d;
        H.moveMon(m, (this.wind.x * 1.4 + (dx / d) * m.st.speed + nx * wob) * dt, (this.wind.y * 1.4 + (dy / d) * m.st.speed + ny * wob) * dt);
        m.sprite.setAngle(Math.sin(now / 90 + s.ph) * 18);
        return true;
      }
      case "rf_parcel":
        this.parcelMove(m, s, now, dt, P);
        return true;
      case "rf_cat":
        return this.catMove(m, s, now, dt, P, d);
    }
    return false;
  }

  /** 화분: 붕 떠올라 내 머리 위 그림자 자리로 (1.1초) */
  private planterLaunch(m: ThemeMon, s: St, now: number, P: { x: number; y: number }): void {
    const H = this.host;
    const t = H.place(P.x + (this.rnd() - 0.5) * 16, P.y + (this.rnd() - 0.5) * 10, 7);
    s.mode = 1;
    s.t0 = now;
    s.ox = m.x;
    s.oy = m.y;
    s.tx = t.x;
    s.ty = t.y;
    m.hidden = true;
    H.sfx("swish", 0.35);
    s.tele = H.tele.add({ kind: "circle", r: 18 }, t.x, t.y, 0, now, 1100, () => this.planterLand(m, s));
  }

  private planterLand(m: ThemeMon, s: St): void {
    const H = this.host;
    s.tele = undefined;
    s.mode = 0;
    s.at = H.now() + 2800 + this.rnd() * 1600;
    if (!m.alive) return;
    m.x = s.tx;
    m.y = s.ty;
    m.hidden = false;
    m.sprite.setAngle(0).setAlpha(1);
    const P = H.player();
    if (Math.hypot(P.x - s.tx, P.y - s.ty) < 22) H.strike(m, 1.3);
    H.shake(90, 0.003);
    this.snd("crash");
    for (let i = 0; i < 8; i++) this.fx(s.tx, s.ty - 2, { vx: (this.rnd() - 0.5) * 90, vy: -this.rnd() * 50, g: 160, ms: 420, tint: i % 2 ? 0x6a4a2c : 0xc0623a, s0: 0.12, s1: 0.06, a: 0.9 });
  }

  /** 비둘기 떼: 서로 뭉치고 비키며 다가온다, 가끔 다 같이 푸드덕 날아올라 덮친다 */
  private pigeonMove(m: ThemeMon, s: St, now: number, dt: number, P: { x: number; y: number }): void {
    const H = this.host;
    if (now < this.swoop.warnUntil) return;
    const dx = P.x - m.x;
    const dy = P.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    if (now < this.swoop.until) {
      const sp = m.st.speed * 2.3;
      H.moveMon(m, (dx / d) * sp * dt, (dy / d) * sp * dt);
      return;
    }
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let c = 0;
    this.grid.near(m.x, m.y, 44, (o) => {
      if (o === m || o.id !== "rf_pigeon") return;
      cx += o.x;
      cy += o.y;
      c++;
      const ox = m.x - o.x;
      const oy = m.y - o.y;
      const od = Math.hypot(ox, oy) || 1;
      if (od < 11) {
        sx += (ox / od) * (11 - od);
        sy += (oy / od) * (11 - od);
      }
    });
    let vx = dx / d;
    let vy = dy / d;
    if (c) {
      vx += ((cx / c - m.x) / 44) * 0.8;
      vy += ((cy / c - m.y) / 44) * 0.8;
    }
    vx += sx * 0.15 + Math.sin(now / 200 + s.ph * 5) * 0.6;
    vy += sy * 0.15 + Math.cos(now / 230 + s.ph * 5) * 0.4;
    const vl = Math.hypot(vx, vy) || 1;
    const sp = m.st.speed * (d < 20 ? 0.4 : 0.85);
    H.moveMon(m, (vx / vl) * sp * dt, (vy / vl) * sp * dt);
  }

  /** 택배 상자: 겨누고 → 젖은 바닥을 썰매처럼, 벽에 튕기고 멈출 때까지 미끄러진다 */
  private parcelMove(m: ThemeMon, s: St, now: number, dt: number, P: { x: number; y: number }): void {
    const H = this.host;
    if (s.mode === 0) {
      if (now >= s.at) {
        s.mode = 1;
        s.until = now + 550;
        m.windUntil = s.until;
      }
      return;
    }
    if (s.mode === 1) {
      m.sprite.setAngle(Math.sin(now / 22) * 5);
      if (now >= s.until) {
        const a = Math.atan2(P.y - m.y, P.x - m.x);
        s.vx = Math.cos(a) * 200;
        s.vy = Math.sin(a) * 200;
        s.mode = 2;
        H.sfx("swish", 0.3);
      }
      return;
    }
    s.vx += this.wind.x * 1.2 * dt;
    s.vy += this.wind.y * 1.2 * dt;
    const k = Math.exp(-dt * 0.75);
    s.vx *= k;
    s.vy *= k;
    const bx = m.x + s.vx * dt;
    const by = m.y + s.vy * dt;
    H.moveMon(m, s.vx * dt, s.vy * dt);
    if (Math.abs(m.x - bx) > 0.6) {
      s.vx = -s.vx * 0.8;
      H.sfx("thud", 0.25);
    }
    if (Math.abs(m.y - by) > 0.6) {
      s.vy = -s.vy * 0.8;
      H.sfx("thud", 0.25);
    }
    const sp = Math.hypot(s.vx, s.vy);
    m.sprite.setAngle(Math.sin(now / 60) * Math.min(8, sp / 25));
    if (this.rnd() < dt * 18) this.splash(m.x - (s.vx / (sp || 1)) * 8, m.y, { ms: 260, tint: 0xb0d8ff, s0: 1, a: 0.8 });
    if (sp > 60 && Math.hypot(P.x - m.x, P.y - m.y) < MONSTERS[m.id].size / 2 + 7 && now >= s.hitAt) {
      s.hitAt = now + 650;
      H.strike(m, 1.1);
      H.movePlayer((s.vx / sp) * 10, (s.vy / sp) * 10);
    }
    if (sp < 24) {
      s.mode = 0;
      s.at = now + 700 + this.rnd() * 700;
      m.sprite.setAngle(0);
    }
  }

  /** 고양이: 살금살금 → 할퀴고 버프를 물고 달아난다 (6초 안에 잡으면 돌려받는다) */
  private catMove(m: ThemeMon, s: St, now: number, dt: number, P: { x: number; y: number }, d: number): boolean {
    const H = this.host;
    const dx = P.x - m.x;
    const dy = P.y - m.y;
    if (s.mode === 0) {
      if (d < 14 && now >= s.hitAt) {
        s.hitAt = now + 1100;
        H.strike(m, 0.9);
        this.snd("meow");
        const b = H.takeBuff();
        if (b) {
          s.buff = b;
          s.buffAt = now;
          s.mode = 1;
          s.until = now + 6000;
          H.float(m.x, m.y - 18, "버프를 물고 달아났다!", "#f0d040");
          this.tell("cat", "옥상 고양이가 버프를 물고 갔어요. 6초 안에 잡으면 돌려받아요!", 2200);
        } else {
          s.mode = 2;
          s.until = now + 900;
        }
        return true;
      }
      return false;
    }
    if (now >= s.until) {
      if (s.mode === 1 && s.buff) {
        H.float(m.x, m.y - 18, "냠… 버프를 먹어 버렸다", "#c8c0a8");
        s.buff = null;
      }
      s.mode = 0;
      return false;
    }
    // 달아난다 (벽에 붙으면 옆으로 돈다)
    let ax = -dx;
    let ay = -dy;
    if (m.x < SIDE + 30 || m.x > AW - SIDE - 30) ax *= 0.2;
    if (m.y < TOP + 30 || m.y > AH - SIDE - 30) ay *= 0.2;
    ax += -dy * 0.5;
    ay += dx * 0.5;
    const al = Math.hypot(ax, ay) || 1;
    const sp = m.st.speed * (s.mode === 1 ? 1.2 : 1.4);
    H.moveMon(m, (ax / al) * sp * dt, (ay / al) * sp * dt);
    return true;
  }

  killed(m: ThemeMon): void {
    const s = this.st.get(m);
    const H = this.host;
    if (s?.tele) H.tele.cancel(s.tele);
    if (m.id === "rf_cat" && s?.buff && s.mode === 1) {
      const left = s.buff.left - (H.now() - (s.buffAt ?? 0));
      if (left > 300) {
        H.giveBuff({ ...s.buff, left });
        H.float(m.x, m.y - 18, "버프를 돌려받았다!", "#7aff9a");
      }
    }
    if (m.id === "rf_spark" || m.id === "rf_rod_broken" || m.id === "rf_lightning_rod") for (let i = 0; i < 6; i++) this.fx(m.x, m.y - 6, { vx: (this.rnd() - 0.5) * 120, vy: (this.rnd() - 0.5) * 120, ms: 300, tint: 0xfff06a, s0: 0.12, s1: 0.03 });
    this.st.delete(m);
  }

  shotWind(): { x: number; y: number } {
    return this.shotW;
  }

  // ── 매 프레임 ──

  private later(at: number, fn: () => void): void {
    this.laters.push({ at, fn });
  }

  update(now: number, dt: number): void {
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.at <= now);
      this.laters = this.laters.filter((l) => l.at > now);
      for (const l of due) l.fn();
    }
    const mons = this.host.mons();
    this.grid.fill(mons);
    this.floorG.clear();
    this.fxG.clear();
    this.tickGust(now, dt, mons);
    this.tickStrikes(now);
    this.tickFlash(now, dt);
    this.tickRain(now, dt);
    this.tickBackground(now, dt);
    this.tickMonsters(now, dt, mons);
    this.tickClouds(now, dt);
    this.drawPuddles(now);
    this.drawBolts(now);
    this.pool.update(dt);
    this.splashes.update(dt);
  }

  // ── 돌풍 ──

  private vaneAlive(mons: readonly ThemeMon[]): boolean {
    return mons.some((m) => m.alive && m.id === "rf_vane");
  }

  private bossPhase(mons: readonly ThemeMon[]): number {
    const b = mons.find((m) => m.alive && m.id === "rf_lightning_rod");
    return b ? b.phase : -1;
  }

  private tickGust(now: number, dt: number, mons: readonly ThemeMon[]): void {
    const H = this.host;
    const g = this.gust;
    const calm = H.calm();
    if (calm && g.until <= now) {
      this.wind.x = this.wind.y = 0;
      this.shotW.x = this.shotW.y = 0;
      for (const a of this.arrows) a.setVisible(false);
      if (g.next < now + 2000) g.next = now + 2000;
      g.warn = false;
      return;
    }
    // 미리 알림: 바람 화살표가 깜빡이며 흐른다
    if (!g.warn && g.until <= now && now >= g.next - this.w.gustWarn) {
      g.warn = true;
      const side = this.rnd() < 0.5 ? -1 : 1;
      const tilt = this.rnd() < 0.35 ? (this.rnd() - 0.5) * 0.8 : 0;
      const l = Math.hypot(1, tilt);
      g.dx = side / l;
      g.dy = tilt / l;
      g.ang = Math.atan2(g.dy, g.dx);
      this.snd("gust");
      this.tell("gust", "돌풍이 불어요! 화단이나 실외기 뒤에 붙으면 덜 밀려요", 2200);
    }
    if (g.warn && now >= g.next) {
      g.warn = false;
      g.start = now;
      g.until = now + this.w.gustMs;
      const vane = this.vaneAlive(mons);
      const bp = this.bossPhase(mons);
      g.next = now + this.w.gustMs + this.w.gustEvery * (vane ? RF_VANE_GUST : 1) * (bp >= 1 ? 0.6 : 1) * (0.85 + this.rnd() * 0.3);
      H.shake(160, 0.0015);
    }
    const blowing = now < g.until;
    // 태풍의 눈: 부는 동안 바람이 돈다
    if (blowing && this.w.swirl) {
      g.ang += dt * 1.1;
      g.dx = Math.cos(g.ang);
      g.dy = Math.sin(g.ang) * 0.6;
    }
    const env = blowing ? Math.min(1, (now - g.start) / 300, (g.until - now) / 400) : 0;
    const push = this.w.gustPush * env * (this.vaneAlive(mons) ? 1.25 : 1);
    this.wind.x = g.dx * push;
    this.wind.y = g.dy * push;
    this.shotW.x = this.wind.x * 0.9;
    this.shotW.y = this.wind.y * 0.9;
    // 화살표 (알림 중 깜빡, 부는 중 흐른다)
    const show = g.warn || blowing;
    this.arrows.forEach((a, i) => {
      if (!show) {
        a.setVisible(false);
        return;
      }
      const row = (i % 5) + 0.5;
      const lane = Math.floor(i / 5);
      const speed = blowing ? 260 : 120;
      const span = AW + 60;
      const t = ((now * speed) / 1000 + lane * 230 + i * 37) % span;
      const base = g.dx >= 0 ? -30 + t : AW + 30 - t;
      const y = TOP + 12 + (row / 5) * (AH - TOP - 20) + lane * 18;
      const blink = g.warn ? (H.reduced ? 0.7 : Math.floor(now / 140) % 2 ? 0.9 : 0.3) : 0.45;
      a.setVisible(true)
        .setPosition(base, y)
        .setRotation(Math.atan2(g.dy, g.dx))
        .setTint(g.warn ? 0xffe08a : 0xd8f0ff)
        .setAlpha(blink);
    });
    if (!blowing) return;
    // 나: 소품 바로 뒤(바람 그늘)면 덜 밀린다
    const P = H.player();
    const shelter =
      rfSolidAt(this.props, P.x - g.dx * 12, P.y - g.dy * 12, 3) || rfSolidAt(this.props, P.x - g.dx * 24, P.y - g.dy * 24, 3) ? 0.22 : 1;
    if (shelter < 1 && now >= this.shelterAt) {
      this.shelterAt = now + 2500;
      H.float(P.x, P.y - 28, "바람 그늘", "#9ad8ff");
    }
    H.movePlayer(this.wind.x * shelter * dt, this.wind.y * shelter * dt);
    // 몬스터 (가볍게 날리는 것·무거운 것)
    for (const m of mons) {
      if (!m.alive || m.hidden) continue;
      const k = WIND_K[m.id] ?? 0.6;
      if (k) this.host.moveMon(m, this.wind.x * k * dt, this.wind.y * k * dt);
    }
    // 바람 줄기 (긴 흰 줄이 휙휙)
    if (!H.reduced) {
      const fx = this.fxG;
      fx.lineStyle(1, 0xe8f4ff, 0.22 * env);
      fx.beginPath();
      for (let i = 0; i < 14; i++) {
        const span = AW + 200;
        const t = ((now * (0.42 + (i % 4) * 0.08)) + i * 97) % span;
        const x = g.dx >= 0 ? t - 100 : AW + 100 - t;
        const y = TOP + 10 + ((i * 53) % (AH - TOP - 20)) + Math.sin(now / 300 + i) * 4;
        const len = 30 + (i % 3) * 18;
        fx.moveTo(x, y);
        fx.lineTo(x - g.dx * len, y - g.dy * len);
      }
      fx.strokePath();
    }
    // 바람에 날리는 잎·종이
    if (this.rnd() < dt * 22) {
      const x = g.dx >= 0 ? -6 : AW + 6;
      const y = TOP + this.rnd() * (AH - TOP - 10);
      this.fx(x, y, { vx: this.wind.x * 3.2, vy: this.wind.y * 3 + (this.rnd() - 0.5) * 40, ms: 1600, tint: this.rnd() < 0.5 ? 0x5aa04a : 0xf2f0e6, s0: 0.08, s1: 0.08, a: 0.9, tex: this.rnd() < 0.4 ? T.paper : T.px });
    }
    // 벤치가 덜컹
    for (const sw of this.sway) if (sw.bench) sw.img.x = sw.x0 + Math.round(Math.sin(now / 40 + sw.ph) * env);
  }

  // ── 낙뢰 ──

  private tickStrikes(now: number): void {
    const H = this.host;
    if (H.calm()) {
      if (this.strikeAt < now + 1500) this.strikeAt = now + 1500;
      return;
    }
    // 먼 하늘 번개 (분위기 — 판정 없음)
    if (now >= this.skyBoltAt) {
      this.skyBoltAt = now + (this.w.blackout ? 2600 : 4200) + this.rnd() * 4000;
      const x = 30 + this.rnd() * (AW - 60);
      this.bolt(x, -4, x + (this.rnd() - 0.5) * 30, 14 + this.rnd() * 6, 1, 160);
      this.flash(this.w.blackout ? 0.55 : 0.35);
      this.later(now + 300 + this.rnd() * 500, () => this.snd("rumble"));
    }
    if (now < this.strikeAt) return;
    const mons = H.mons();
    const bp = this.bossPhase(mons);
    this.strikeAt = now + this.w.strikeEvery * (bp >= 1 ? 0.7 : 1) * (0.85 + this.rnd() * 0.3);
    const P = H.player();
    for (let i = 0; i < this.w.strikes; i++) {
      let x: number;
      let y: number;
      if (i === 0) {
        const a = this.rnd() * Math.PI * 2;
        const r = this.rnd() * 18;
        x = P.x + Math.cos(a) * r;
        y = P.y + Math.sin(a) * r * 0.7;
      } else if (this.rnd() < 0.4 && this.puddles.length) {
        const p = this.puddles[Math.floor(this.rnd() * this.puddles.length)];
        x = p.x + (this.rnd() - 0.5) * p.rx;
        y = p.y;
      } else {
        x = SIDE + 30 + this.rnd() * (AW - SIDE * 2 - 60);
        y = TOP + 26 + this.rnd() * (AH - TOP - 50);
      }
      this.strike(Phaser.Math.Clamp(x, SIDE + 16, AW - SIDE - 16), Phaser.Math.Clamp(y, TOP + 18, AH - SIDE - 8), this.w.strikeWarn + i * 160, this.w.strikeR);
    }
    this.tell("strike", "노란 원에 벼락이 떨어져요. 웅덩이에 맞으면 웅덩이 전체가 찌릿해요", 2200);
  }

  /** 노란 원 → 벼락 (웅덩이에 떨어지면 그 웅덩이 전체가 감전) */
  private strike(x: number, y: number, warn: number, r: number, pct = STRIKE_PCT): void {
    const H = this.host;
    this.charging.push({ x, y, start: H.now(), end: H.now() + warn });
    H.tele.add({ kind: "circle", r }, x, y, 0, H.now(), warn, (t) => {
      const now = H.now();
      this.bolt(x + (this.rnd() - 0.5) * 40, -8, x, y - 2, 2, 200);
      this.flash(H.reduced ? 0.4 : 0.85);
      this.snd("thunder");
      H.shake(110, H.reduced ? 0.001 : 0.004);
      this.scorches.push({ x, y, until: now + 6000 });
      if (this.scorches.length > 12) this.scorches.shift();
      for (let i = 0; i < 8; i++) this.fx(x, y - 3, { vx: (this.rnd() - 0.5) * 140, vy: -this.rnd() * 110, g: 260, ms: 380, tint: i % 2 ? BOLT : 0x8ad8ff, s0: 0.12, s1: 0.04 });
      const P = H.player();
      if (inTelegraph(t.shape, t.x, t.y, t.angle, P.x, P.y, 4)) {
        H.hurtPct(pct);
        H.float(P.x, P.y - 30, "찌릿!", "#fff06a");
      }
      for (const p of this.puddles) if (inPuddle(p, x, y, 4)) this.zap(p, now);
    }, 0xffe040);
  }

  /** 웅덩이 감전: 0.7초 동안 그 위에 있으면 다친다 */
  private zap(p: Puddle, now: number): void {
    p.zap = now + 700;
    p.hurt = false;
    this.snd("zap");
  }

  private flash(k: number): void {
    this.flashK = Math.max(this.flashK, k);
  }

  private tickFlash(_now: number, dt: number): void {
    if (this.amb) {
      const c = this.flashK > 0.01 ? mix(this.ambBase, 0xffffff, Math.min(1, this.flashK) * 0.92) : this.ambBase;
      if (this.amb.fillColor !== c) this.amb.setFillStyle(c);
    }
    this.flashK = Math.max(0, this.flashK - dt * 3.2);
  }

  private bolt(x0: number, y0: number, x1: number, y1: number, w: number, ms: number): void {
    const pts: number[] = [x0, y0];
    const steps = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push(x0 + (x1 - x0) * t + (this.rnd() - 0.5) * 16, y0 + (y1 - y0) * t + (this.rnd() - 0.5) * 6);
    }
    pts.push(x1, y1);
    this.bolts.push({ pts, until: this.host.now() + ms, w });
    if (this.bolts.length > 14) this.bolts.shift();
  }

  private drawBolts(now: number): void {
    const g = this.fxG;
    this.charging = this.charging.filter((c) => c.end > now);
    for (const c of this.charging) {
      const k = (now - c.start) / Math.max(1, c.end - c.start);
      if (k < 0.35) continue;
      const a = (k - 0.35) * (this.host.reduced ? 0.5 : Math.floor(now / 60) % 2 ? 0.9 : 0.45);
      g.lineStyle(1, 0xfff6c0, a * 0.6);
      g.beginPath();
      g.moveTo(c.x, -4);
      for (let y = 8; y < c.y; y += 14) g.lineTo(c.x + (this.rnd() - 0.5) * 6 * k, y);
      g.lineTo(c.x, c.y - 4);
      g.strokePath();
      g.fillStyle(0xfff6c0, a * 0.5).fillCircle(c.x, c.y - 2, 2 + k * 3);
    }
    this.bolts = this.bolts.filter((b) => b.until > now);
    for (const b of this.bolts) {
      for (const [w, a, c] of [
        [b.w + 4, 0.18, 0x8ab8ff],
        [b.w + 1, 0.55, BOLT],
        [1, 1, 0xffffff],
      ] as const) {
        g.lineStyle(w, c, a);
        g.beginPath();
        g.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) g.lineTo(b.pts[i], b.pts[i + 1]);
        g.strokePath();
      }
    }
  }

  // ── 비·배경 ──

  private tickRain(now: number, dt: number): void {
    const g = this.fxG;
    const R = this.rain;
    // 11/17 겨울·크리스마스판: 비 대신 눈보라 (돌풍을 더 세게 타고 비스듬히, 송이마다 살랑살랑) — 판정 없는 그림
    if (this.host.concept !== "default") {
      const sx = 22 + this.wind.x * 3.4;
      g.fillStyle(0xe4eef8, this.w.blackout ? 0.5 : 0.75);
      for (let i = 0; i < R.x.length; i++) {
        const vy = R.v[i] * 0.2 + this.wind.y * 2;
        R.x[i] += (sx + (this.host.reduced ? 0 : Math.sin(now / 520 + i * 1.7) * 16)) * dt;
        R.y[i] += vy * dt;
        if (R.y[i] > AH + 4 || R.x[i] < -30 || R.x[i] > AW + 30) {
          R.y[i] = -4 - this.rnd() * 12;
          R.x[i] = this.rnd() * (AW + 60) - 30 - sx * 0.6;
        }
        const big = R.len[i] > 12.5;
        g.fillRect(R.x[i], R.y[i], big ? 2 : 1, big ? 2 : 1);
      }
      // 웅덩이에 떨어져 녹는 눈 (가끔 작은 물결)
      if (this.puddles.length && this.rnd() < dt * 4) {
        const p = this.puddles[Math.floor(this.rnd() * this.puddles.length)];
        this.splash(p.x + (this.rnd() - 0.5) * p.rx * 1.4, p.y + (this.rnd() - 0.5) * p.ry, { ms: 620, tint: 0xb8d8ff, s0: 0.5, s1: 1.2, a: 0.5, tex: T.ripple });
      }
      return;
    }
    const slant = 30 + this.wind.x * 2.4;
    const vy0 = this.wind.y * 2;
    g.lineStyle(1, 0x9ac0f0, this.w.blackout ? 0.3 : 0.4);
    g.beginPath();
    for (let i = 0; i < R.x.length; i++) {
      const vy = R.v[i] + vy0;
      R.x[i] += slant * dt;
      R.y[i] += vy * dt;
      if (R.y[i] > AH + 10 || R.x[i] < -50 || R.x[i] > AW + 50) {
        R.y[i] = -10 - this.rnd() * 20;
        R.x[i] = this.rnd() * (AW + 100) - 50 - slant * 0.3;
      }
      const k = R.len[i] / vy;
      g.moveTo(R.x[i], R.y[i]);
      g.lineTo(R.x[i] - slant * k, R.y[i] - vy * k);
    }
    g.strokePath();
    // 바닥에 튀는 빗방울 · 웅덩이 물결
    const n = dt * 26 * (0.5 + this.w.rain);
    for (let i = 0; i < n + (this.rnd() < n % 1 ? 1 : 0); i++) this.splash(SIDE + this.rnd() * (AW - SIDE * 2), TOP + 4 + this.rnd() * (AH - TOP - 14), { ms: 240, tint: 0xa8c8f0, s0: 1, a: 0.55 });
    if (this.puddles.length && this.rnd() < dt * 10) {
      const p = this.puddles[Math.floor(this.rnd() * this.puddles.length)];
      this.splash(p.x + (this.rnd() - 0.5) * p.rx * 1.4, p.y + (this.rnd() - 0.5) * p.ry, { ms: 620, tint: 0xb8d8ff, s0: 0.5, s1: 1.4, a: 0.7, tex: T.ripple });
    }
    void now;
  }

  private tickBackground(now: number, dt: number): void {
    const H = this.host;
    const reduced = H.reduced;
    const flash = this.flashK;
    // 웅덩이에 비친 네온 (빗물에 일렁이고, 번개 치면 하얗게)
    for (const r of this.reflections) {
      r.img.setAlpha(Math.min(0.95, r.base * (reduced ? 1 : 0.65 + 0.35 * Math.sin(now / 260 + r.ph)) + flash * 0.5));
      if (r.streak && !reduced) r.img.x = r.x0 + Math.round(Math.sin(now / 170 + r.ph * 3));
    }
    for (const nn of this.skyNeon) nn.img.setAlpha(0.45 + (reduced ? 0 : 0.2 * Math.sin(now / 500 + nn.ph)));
    // 흔들리는 덤불·화분 (바람이 불면 바람 쪽으로 눕는다)
    const lean = (this.wind.x / Math.max(1, this.w.gustPush)) * 0.16;
    for (const sw of this.sway) {
      if (sw.bench) continue;
      sw.img.setRotation(sw.k * ((reduced ? 0 : Math.sin(now / 520 + sw.ph) * 0.035) + lean));
    }
    // 바람 자루 (바람 쪽으로 펴진다)
    if (this.sockG) {
      const g = this.sockG.clear();
      const w = Math.min(1, Math.hypot(this.wind.x, this.wind.y) / Math.max(1, this.w.gustPush));
      for (const p of this.poles) {
        const dir = this.wind.x !== 0 ? Math.sign(this.wind.x) : 1;
        const droop = 1 - w;
        for (let i = 0; i < 6; i++) {
          const x = p.x + dir * (2 + i * (2.4 + w * 1.2)) * (0.35 + 0.65 * Math.max(w, 0.3));
          const y = p.y + 2 + i * droop * 2.2 + Math.sin(now / 80 + i) * (0.4 + w);
          g.fillStyle(i % 2 ? 0xf2f2f2 : 0xff6a2a, 1).fillRect(Math.round(x), Math.round(y), 3, 3 - Math.floor(i / 3));
        }
      }
    }
    // 하늘: 도시 창문 불빛 (띄엄띄엄 다시 그린다 — 번개 칠 땐 매 프레임)
    if (now >= this.skyAt || flash > 0.02) {
      this.skyAt = now + 260;
      const g = this.skyG.clear();
      if (!this.w.blackout) {
        for (const w of this.windows) {
          const on = (w.k * 9 + Math.floor((now / 3000) * (0.2 + w.k))) % 1 > 0.32;
          if (on) g.fillStyle(w.col, 0.75).fillRect(w.x, w.y, 1, 1);
        }
      } else {
        // 정전된 도시: 옥상 항공 장애등만 빨갛게
        for (let i = 0; i < this.windows.length; i += 23) if (Math.floor(now / 900 + i) % 2) g.fillStyle(0xff3a2a, 0.9).fillRect(this.windows[i].x, Math.max(2, this.windows[i].y - 4), 1, 1);
      }
      // 헬리포트 유도등 (차례로 깜빡)
      for (const h of this.heli) {
        const on = reduced || (Math.floor(now / 140) - h.i + 1200) % 12 < 3;
        g.fillStyle(on ? 0xaaff9a : 0x3a8a4a, 1).fillRect(h.x - 2, h.y - 2, 4, 4);
      }
      if (flash > 0.02) g.fillStyle(0xe8f0ff, Math.min(0.85, flash * 0.9)).fillRect(0, 0, AW, 20);
    }
    void dt;
  }

  // ── 몬스터 매 프레임 ──

  private tickMonsters(now: number, dt: number, mons: readonly ThemeMon[]): void {
    const H = this.host;
    const P = H.player();
    const g = this.fxG;
    let pigeons = 0;
    let px = 0;
    let py = 0;
    for (const m of mons) {
      if (!m.alive) continue;
      const s = this.s(m);
      const moved = Math.hypot(m.x - s.px, m.y - s.py);
      switch (m.id) {
        case "rf_umbrella":
          if (this.wind.x === 0 && this.wind.y === 0 && s.ang !== 0) {
            s.ang = Math.abs(s.ang % 360) < 12 ? 0 : s.ang * 0.9;
            m.sprite.setAngle(s.ang);
          }
          break;
        case "rf_planter":
          if (s.mode === 1) {
            const t = Math.min(1, (now - s.t0) / 1100);
            const x = s.ox + (s.tx - s.ox) * t;
            const y = s.oy + (s.ty - s.oy) * t - Math.sin(t * Math.PI) * 70;
            m.sprite.setPosition(x, y).setDepth(1e4).setAngle(t * 360);
            // 그림자: 내려올수록 진해진다
            this.floorG.fillStyle(0x000000, 0.15 + t * 0.4).fillEllipse(s.tx, s.ty, 8 + t * 16, 4 + t * 7);
          }
          break;
        case "rf_smoker":
          if (moved > 0.1 && now >= s.at && !m.hidden) {
            s.at = now + 650;
            this.addCloud(m.x + 4, m.y - 12, now);
          }
          break;
        case "rf_ac_unit":
          this.acTick(m, s, now, dt, P);
          break;
        case "rf_pigeon":
          pigeons++;
          px += m.x;
          py += m.y;
          if (now < this.swoop.until) m.sprite.y -= 7;
          else if (moved > 0.1) m.sprite.y -= Math.abs(Math.sin(now / 70 + s.ph)) * 2;
          break;
        case "rf_leak":
          if (moved > 0.1 && now >= s.at) {
            s.at = now + 800;
            this.addPuddle(m.x, m.y + 1, 8 + this.rnd() * 5, 3.5 + this.rnd() * 1.5, now + 9000);
          }
          break;
        case "rf_droplet":
          m.sprite.y -= Math.abs(Math.sin(now / 95 + s.ph)) * 4;
          break;
        case "rf_papers":
          if (this.rnd() < dt * 4) this.fx(m.x, m.y - 6, { vx: (this.rnd() - 0.5) * 30 + this.wind.x, vy: -10, g: 30, ms: 700, tint: 0xf2f0e6, s0: 1, a: 0.9, tex: T.paper });
          break;
        case "rf_rod_broken":
          this.rodTick(m, s, now, g, P);
          break;
        case "rf_cat":
          if (s.mode === 1 && s.buff) {
            const yy = m.y - 20 + Math.sin(now / 120) * 1.5;
            g.fillStyle(0xffd04a, 0.35).fillCircle(m.x, yy, 5);
            g.fillStyle(0xfff6c0, 0.9).fillTriangle(m.x, yy - 3, m.x + 3, yy, m.x - 3, yy).fillTriangle(m.x, yy + 3, m.x + 3, yy, m.x - 3, yy);
          }
          break;
        case "rf_spark":
          if (!m.hidden && now >= m.stunUntil) H.moveMon(m, (this.rnd() - 0.5) * 70 * dt, (this.rnd() - 0.5) * 70 * dt);
          if (this.rnd() < dt * 10) this.fx(m.x + (this.rnd() - 0.5) * 8, m.y - 5, { vx: (this.rnd() - 0.5) * 60, vy: (this.rnd() - 0.5) * 60, ms: 200, tint: this.rnd() < 0.5 ? 0xfff06a : 0x6ad0ff, s0: 0.08, s1: 0.02 });
          break;
        case "rf_vane":
          this.vaneTick(m, s, now);
          if (this.wind.x !== 0) m.sprite.setFlipX(this.wind.x < 0);
          break;
        case "rf_lightning_rod":
          this.bossTick(m, s, now, g);
          break;
      }
      s.px = m.x;
      s.py = m.y;
    }
    // 비둘기 떼: 가끔 다 같이 푸드덕 날아올라 덮친다
    if (pigeons >= 3 && now >= this.swoop.at && !H.calm()) {
      this.swoop.at = now + 5200 + this.rnd() * 2500;
      this.swoop.warnUntil = now + 550;
      this.swoop.until = now + 550 + 750;
      H.float(px / pigeons, py / pigeons - 16, "푸드덕!", "#d8dce4");
      this.snd("flutter");
      for (let i = 0; i < 6; i++) this.fx(px / pigeons + (this.rnd() - 0.5) * 30, py / pigeons - 8, { vx: (this.rnd() - 0.5) * 60, vy: -20 - this.rnd() * 30, g: 40, ms: 700, tint: 0xd8dce4, s0: 1, a: 0.9, tex: T.px });
    } else if (pigeons && this.rnd() < dt * 0.4) this.snd("coo");
  }

  /** 연기 구름: 흡연자가 지나간 자리에 남고 바람에 밀려 간다 (속에 있으면 콜록) */
  private addCloud(x: number, y: number, now: number): void {
    const c = this.clouds.find((q) => !q.on) ?? this.clouds.reduce((a, b) => (a.born < b.born ? a : b));
    c.on = true;
    c.x = x;
    c.y = y;
    c.born = now;
    c.img.setVisible(true).setPosition(x, y).setDepth(y + 20);
  }

  private tickClouds(now: number, dt: number): void {
    const H = this.host;
    const P = H.player();
    let inside = false;
    for (const c of this.clouds) {
      if (!c.on) continue;
      const t = (now - c.born) / 6000;
      if (t >= 1) {
        c.on = false;
        c.img.setVisible(false);
        continue;
      }
      c.x += (this.wind.x * 0.7 + 4) * dt;
      c.y += (this.wind.y * 0.7 - 2) * dt;
      const r = 10 + t * 10;
      c.img.setPosition(c.x, c.y).setDisplaySize(r * 2.6, r * 1.9).setAlpha(0.5 * (1 - t) + 0.08);
      if (Math.hypot(P.x - c.x, (P.y - 10 - c.y) * 1.3) < r) inside = true;
    }
    if (inside && now >= this.cloudHurtAt && !H.calm()) {
      this.cloudHurtAt = now + 500;
      H.hurtPct(0.012);
      if (now >= this.coughAt) {
        this.coughAt = now + 1300;
        H.float(P.x + 6, P.y - 30, "콜록", "#c8ccd0");
        this.tell("smoke", "담배 연기 속에선 콜록거리며 다쳐요. 바람이 연기를 밀어내요", 2000);
      }
    }
  }

  private addPuddle(x: number, y: number, rx: number, ry: number, until: number): void {
    const dyn = this.puddles.filter((p) => !p.deco);
    if (dyn.length >= 26) this.puddles.splice(this.puddles.indexOf(dyn[0]), 1);
    this.puddles.push({ x, y, rx, ry, until, zap: 0, warn: 0, hurt: false, deco: false });
  }

  /** 웅덩이(물탱크 누수 자국)·그을음·감전 */
  private drawPuddles(now: number): void {
    const g = this.floorG;
    const fx = this.fxG;
    const H = this.host;
    const P = H.player();
    this.puddles = this.puddles.filter((p) => p.until > now);
    for (const sc of this.scorches) {
      const a = Math.max(0, (sc.until - now) / 6000);
      g.fillStyle(0x0a0a0c, 0.55 * a).fillEllipse(sc.x, sc.y, 22, 9);
      g.fillStyle(0xffa040, 0.25 * a * a).fillEllipse(sc.x, sc.y, 8, 3);
    }
    for (const p of this.puddles) {
      if (!p.deco) {
        const fade = Math.min(1, (p.until - now) / 1500);
        g.fillStyle(0x0e1a28, 0.75 * fade).fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);
        g.fillStyle(0x4a7ab0, 0.35 * fade).fillEllipse(p.x - p.rx * 0.2, p.y - p.ry * 0.3, p.rx * 0.9, p.ry * 0.6);
      }
      if (p.warn > now) {
        const blink = H.reduced ? 0.7 : Math.floor(now / 110) % 2 ? 0.95 : 0.35;
        g.lineStyle(1, 0xffe040, blink).strokeEllipse(p.x, p.y, p.rx * 2 + 4, p.ry * 2 + 4);
        g.fillStyle(0xffe040, 0.12).fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);
      }
      if (p.zap > now) {
        const k = (p.zap - now) / 700;
        fx.fillStyle(0x8ae8ff, 0.35 * k + (Math.floor(now / 50) % 2 ? 0.15 : 0)).fillEllipse(p.x, p.y, p.rx * 2 + 2, p.ry * 2 + 2);
        fx.lineStyle(1, 0xffffff, 0.9 * k);
        for (let i = 0; i < 3; i++) {
          let x = p.x - p.rx + this.rnd() * 4;
          let y = p.y + (this.rnd() - 0.5) * p.ry;
          fx.beginPath();
          fx.moveTo(x, y);
          while (x < p.x + p.rx - 3) {
            x += 3 + this.rnd() * 5;
            y = p.y + (this.rnd() - 0.5) * p.ry * 1.6;
            fx.lineTo(x, y);
          }
          fx.strokePath();
        }
        if (!p.hurt && inPuddle(p, P.x, P.y, 2) && !H.calm()) {
          p.hurt = true;
          H.hurtPct(ZAP_PCT);
          H.float(P.x, P.y - 30, "감전!", "#8ae8ff");
        }
      }
    }
  }

  /** 실외기: 팬이 달아오르면(줄 경고) 앞으로 뜨거운 바람 기둥 1.3초 — 닿으면 밀리고 데인다 */
  private acTick(m: ThemeMon, s: St, now: number, dt: number, P: { x: number; y: number }): void {
    const H = this.host;
    const L = 150;
    if (s.mode === 0) {
      if (now >= s.at && !m.hidden && now >= m.stunUntil && Math.hypot(P.x - m.x, P.y - m.y) < 190 && !H.calm()) {
        s.mode = 1;
        s.ang = Math.atan2(P.y - (m.y - 6), P.x - m.x);
        s.until = now + 900;
        m.windUntil = s.until;
        m.sprite.setTint(0xffa080);
        s.tele = H.tele.add({ kind: "line", len: L, width: 22 }, m.x, m.y - 6, s.ang, now, 900, () => {
          s.tele = undefined;
          s.mode = 2;
          s.until = H.now() + 1300;
          s.hitAt = 0;
          m.sprite.clearTint();
          this.snd("hiss");
        }, 0xff7a2a);
      }
      return;
    }
    if (s.mode !== 2) return;
    if (now >= s.until || m.hidden) {
      s.mode = 0;
      s.at = now + 2600 + this.rnd() * 1400;
      return;
    }
    const ux = Math.cos(s.ang);
    const uy = Math.sin(s.ang);
    // 뜨거운 바람 (일렁이는 줄 + 열기)
    const g = this.fxG;
    for (let k = 0; k < 3; k++) {
      g.lineStyle(3 - k, k ? 0xffb060 : 0xff6a2a, 0.35 - k * 0.08);
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * L;
        const wob = Math.sin(now / 50 + i * 1.3 + k * 2) * (3 + i * 0.6);
        const x = m.x + ux * t - uy * wob;
        const y = m.y - 6 + uy * t + ux * wob;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
    if (this.rnd() < 0.5) {
      const t = this.rnd() * L;
      this.fx(m.x + ux * t, m.y - 6 + uy * t, { vx: ux * 160, vy: uy * 160, ms: 300, tint: 0xff9a4a, s0: 0.25, s1: 0.5, a: 0.4 });
    }
    const rx = P.x - m.x;
    const ry = P.y - 6 - (m.y - 6);
    const along = rx * ux + ry * uy;
    const perp = Math.abs(-rx * uy + ry * ux);
    if (along > 0 && along < L && perp < 12) {
      H.movePlayer(ux * 170 * dt, uy * 170 * dt);
      if (now >= s.hitAt) {
        s.hitAt = now + 420;
        H.strike(m, 0.45);
      }
    }
  }

  /** 고장난 피뢰침: 가까운 몬스터 둘과 전기 줄 (닿으면 감전) */
  private rodTick(m: ThemeMon, s: St, now: number, g: Phaser.GameObjects.Graphics, P: { x: number; y: number }): void {
    const H = this.host;
    if (now >= (s.linkAt ?? 0)) {
      s.linkAt = now + 500;
      const near: ThemeMon[] = [];
      this.grid.near(m.x, m.y, 110, (o) => {
        if (o !== m && !o.boss && !o.hidden && o.id !== "rf_rod_broken") near.push(o);
      });
      near.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y));
      s.links = near.slice(0, 2);
    }
    const x0 = m.x + 5;
    const y0 = m.y - 15;
    for (const o of s.links ?? []) {
      if (!o.alive) continue;
      const x1 = o.x;
      const y1 = o.y - 8;
      const flick = Math.floor(now / 60) % 3;
      g.lineStyle(3, 0x6ad0ff, 0.18).lineBetween(x0, y0, x1, y1);
      g.lineStyle(1, flick ? 0xfff06a : 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(x0, y0);
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        g.lineTo(x0 + (x1 - x0) * t + (this.rnd() - 0.5) * 5, y0 + (y1 - y0) * t + (this.rnd() - 0.5) * 5);
      }
      g.lineTo(x1, y1);
      g.strokePath();
      if (segDist(P.x, P.y - 8, x0, y0, x1, y1) < 6 && now >= this.tetherHurtAt && !H.calm()) {
        this.tetherHurtAt = now + 450;
        H.strike(m, 0.35);
        H.float(P.x, P.y - 30, "찌릿", "#fff06a");
        this.snd("zap");
        this.tell("tether", "피뢰침과 몬스터 사이 전기 줄에 닿으면 감전돼요. 피뢰침부터 쓰러뜨리면 줄이 끊겨요", 2400);
      }
    }
  }

  /** 정예 풍향계 수탉: 바람에 실려 서류 뭉치가 날아든다 (층 계획 adds 상한까지) */
  private vaneTick(m: ThemeMon, s: St, now: number): void {
    const H = this.host;
    if (now < s.at || m.hidden || H.calm()) return;
    s.at = now + 3800;
    const cap = rfVaneAdds(this.visit);
    if ((s.adds ?? 0) >= cap) return;
    s.adds = (s.adds ?? 0) + 1;
    const from = this.gust.dx >= 0 ? -1 : 1;
    const x = from < 0 ? SIDE + 16 : AW - SIDE - 16;
    const p = H.place(x, TOP + 30 + this.rnd() * (AH - TOP - 60), 6);
    H.spawn("rf_papers", p.x, p.y, m.wave, true);
    H.float(p.x, p.y - 16, "서류가 날아든다", "#f2f0e6");
    for (let i = 0; i < 5; i++) this.fx(p.x, p.y - 6, { vx: -from * (40 + this.rnd() * 60), vy: (this.rnd() - 0.5) * 40, ms: 600, tint: 0xf2f0e6, s0: 1, a: 1, tex: T.paper });
  }

  /** 우두머리 피뢰침: 줄 번개 · 불꽃 · (50%) 웅덩이 사슬 번개·거센 돌풍 · (25%) 하늘 전체 번개 (고무 매트만 안전) */
  private bossTick(m: ThemeMon, s: St, now: number, g: Phaser.GameObjects.Graphics): void {
    const H = this.host;
    // 왕관 끝에서 하늘로 치솟는 번개 줄기
    if (Math.floor(now / 110) % 3 !== 0) {
      const x = m.x;
      const y = m.y - 40;
      g.lineStyle(1, BOLT, 0.7);
      g.beginPath();
      g.moveTo(x, y);
      let yy = y;
      let xx = x;
      while (yy > -4) {
        yy -= 8 + this.rnd() * 8;
        xx += (this.rnd() - 0.5) * 10;
        g.lineTo(xx, yy);
      }
      g.strokePath();
      g.fillStyle(0xfff06a, 0.25).fillCircle(x, y, 6);
    }
    if (m.phase > (s.phase ?? 0)) {
      s.phase = m.phase;
      if (m.phase === 1) {
        s.chainAt = now + 2000;
        this.gust.next = Math.min(this.gust.next, now + 1600);
        this.flash(1);
        this.snd("thunder");
        this.later(now + 1900, () => this.host.flash("폭풍이 거세져요! 웅덩이마다 번개가 이어져요", 2000));
      } else if (m.phase >= 2) {
        s.finalAt = now + 3600;
        this.flash(1);
        this.later(now + 1500, () => this.host.flash("번개 폭포가 와요! 초록 테두리 고무 매트 위로 가요", 2200));
      }
    }
    if (H.calm() || m.hidden) return;
    const ph = m.phase;
    // 줄 번개: 우두머리에서 나 쪽으로 다섯 줄 차례로
    if (now >= s.at) {
      s.at = now + 3400 * [1, 0.8, 0.7][Math.min(2, ph)];
      const P = H.player();
      const a = Math.atan2(P.y - m.y, P.x - m.x);
      const lines = ph >= 1 ? [-0.35, 0.35] : [0];
      for (const off of lines)
        for (let i = 1; i <= 5; i++) {
          const x = Phaser.Math.Clamp(m.x + Math.cos(a + off) * i * 34, SIDE + 14, AW - SIDE - 14);
          const y = Phaser.Math.Clamp(m.y + Math.sin(a + off) * i * 30, TOP + 14, AH - SIDE - 6);
          this.strike(x, y, 850 + i * 120, 16, 0.07);
        }
    }
    // 불꽃 (졸개) — 두 번 부를 몫까지
    if (now >= (s.sumAt ?? 0) && this.sparks < SPARK_CAP) {
      s.sumAt = now + 9500;
      for (let i = 0; i < 2 && this.sparks < SPARK_CAP; i++) {
        const p = H.place(m.x + (i ? 24 : -24), m.y + 8, 5);
        if (H.spawn("rf_spark", p.x, p.y, m.wave, true)) this.sparks++;
        this.bolt(m.x, m.y - 40, p.x, p.y - 4, 1, 160);
      }
      this.snd("zap");
    }
    // 웅덩이 사슬 번개 (50%부터)
    if (ph >= 1 && now >= (s.chainAt ?? Infinity)) {
      s.chainAt = now + 6500;
      const P = H.player();
      const list = [...this.puddles].sort((p, q) => Math.hypot(p.x - P.x, p.y - P.y) - Math.hypot(q.x - P.x, q.y - P.y)).slice(0, 4);
      for (const p of list) p.warn = now + 1300;
      this.later(now + 1300, () => {
        const t = H.now();
        let x0 = m.x;
        let y0 = m.y - 30;
        for (const p of list) {
          this.bolt(x0, y0, p.x, p.y, 1, 260);
          this.zap(p, t);
          x0 = p.x;
          y0 = p.y;
        }
        this.flash(0.6);
      });
    }
    // 번개 폭포 (25%부터): 1.8초 경고 → 매트 밖은 모두 맞는다
    if (ph >= 2 && s.finalAt !== undefined && now >= s.finalAt - 1800 && now < s.finalAt) this.drawFinalWarn(now, s.finalAt);
    if (ph >= 2 && s.finalAt !== undefined && now >= s.finalAt) {
      s.finalAt = now + 7800;
      const P = H.player();
      const safe = this.mats.some((q) => P.x >= q.x - 2 && P.x <= q.x + q.w + 2 && P.y >= q.y - 2 && P.y <= q.y + q.h + 4);
      for (let i = 0; i < 7; i++) {
        const x = SIDE + 20 + this.rnd() * (AW - SIDE * 2 - 40);
        this.bolt(x + (this.rnd() - 0.5) * 30, -8, x, TOP + 20 + this.rnd() * (AH - TOP - 40), 2, 260);
      }
      this.bolt(m.x, m.y - 40, P.x, P.y - 6, 2, 260);
      this.flash(1);
      this.snd("thunder");
      H.shake(240, H.reduced ? 0.002 : 0.008);
      if (!safe) {
        H.hurtPct(0.16);
        H.float(P.x, P.y - 32, "번개 폭포!", "#fff06a");
      } else H.float(P.x, P.y - 32, "고무 매트 덕분에 무사!", "#7aff9a");
    }
  }

  /** 번개 폭포 경고: 바닥 전체가 노랗게 깜빡이고 고무 매트만 초록으로 */
  private drawFinalWarn(now: number, at: number): void {
    const g = this.floorG;
    const k = 1 - (at - now) / 1800;
    const blink = this.host.reduced ? 0.5 : Math.floor(now / 120) % 2 ? 0.75 : 0.4;
    g.fillStyle(0xffe040, (0.14 + 0.2 * k) * blink).fillRect(SIDE, TOP, AW - SIDE * 2, AH - TOP - SIDE);
    for (let x = SIDE - ((now / 20) % 24) - 40; x < AW; x += 24) g.lineStyle(3, 0xffe040, 0.22 * blink).lineBetween(x, TOP, x + 40, AH - SIDE);
    for (const q of this.mats) {
      g.fillStyle(0x1a2a1e, 1).fillRect(q.x, q.y, q.w, q.h);
      g.fillStyle(0x3aff7a, 0.3 + 0.25 * blink).fillRect(q.x, q.y, q.w, q.h);
      g.lineStyle(2, 0x9affb0, 1).strokeRect(q.x - 1, q.y - 1, q.w + 2, q.h + 2);
      // 매트 위로 초록 빛 기둥 (어둠 위에 더한다)
      this.fxG.fillStyle(0x3aff7a, 0.1 + 0.12 * blink).fillRect(q.x + 2, q.y - 30, q.w - 4, q.h + 30);
    }
    // 하늘이 하얗게 차오른다
    this.fxG.fillStyle(0xfff6c0, 0.06 + 0.18 * k * k).fillRect(0, 0, AW, TOP + 10);
  }

  destroy(): void {
    for (const s of this.st.values()) if (s.tele) this.host.tele.cancel(s.tele);
    if (this.amb && this.amb.active) this.amb.setFillStyle(this.ambBase);
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.pool.destroy();
    this.splashes.destroy();
    this.st.clear();
    this.laters = [];
  }
}

/** 돌풍에 밀리는 정도 (우산·서류·택배는 자기 걸음에서 따로) */
const WIND_K: Partial<Record<MonsterId, number>> = {
  rf_umbrella: 0,
  rf_papers: 0,
  rf_parcel: 0,
  rf_pigeon: 1.1,
  rf_droplet: 1,
  rf_spark: 0.9,
  rf_cat: 0.5,
  rf_ac_unit: 0.1,
  rf_rod_broken: 0.1,
  rf_vane: 0.4,
  rf_lightning_rod: 0.12,
};

function inPuddle(p: { x: number; y: number; rx: number; ry: number }, x: number, y: number, pad: number): boolean {
  const dx = (x - p.x) / (p.rx + pad);
  const dy = (y - p.y) / (p.ry + pad * 0.6);
  return dx * dx + dy * dy <= 1;
}

function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / l2));
  return Math.hypot(px - x0 - vx * t, py - y0 - vy * t);
}

/** 야근 빌딩 테마 실행부 목록에 끼우는 만들기 함수 */
export const makeRooftop = (host: ThemeHost, _zone: string, seed: number): TowerThemeRuntime => new RooftopStage(host, seed);
