import * as Phaser from "phaser";
import { MONSTERS } from "@/lib/rpg/catalog";
import { isBossFloor } from "@/lib/rpg/tower";
import {
  PK_ALARM,
  PK_BOSS_HOOK,
  PK_BOSS_RAMPAGE,
  PK_BOSS_TOW,
  PK_ROOM_NAMES,
  PK_RUSH,
  PK_RUSH_HIT,
  PK_RUSH_MON,
  PK_TICKET,
  pkLoop,
  pkPillarCode,
  pkTicketSlow,
  type PkLoop,
} from "@/lib/rpg/towerThemes/parking";
import { pkTowAdds } from "@/lib/rpg/towerThemes/parkingPlan";
import type { Layer } from "../../rpg/skillSound";
import { css, makeCanvas, radial } from "../../sprites/pixel";
import { FxPool, MonGrid, themeVisit } from "./fxPool";
import { foldMultiply } from "./overlay";
import { pkCarLights, pkExitSigns, pkLanes, PK_PROPS, PK_TUBE_ROWS, pkText, type PkLane } from "./parkingMap";
import type { ThemeHost, ThemeMon, TowerThemeRuntime } from "./runtime";

// 11/15 지하 주차장 실행부 (층마다 하나): 움직이는 배경(깜빡이는 형광등·주차된 차 비상등·비상구 등·웅덩이 기름 무지개와 물방울·층 번호),
// 기믹 「헤드라이트 돌진」(통로 한 줄에 빛 → 차가 쏜살같이 지나간다)과 「출차 경보」(몇 초 동안 몬스터가 빨라진다), 몬스터 열두 종의 행동, 견인차 세 단계.
// 서버 검증과 상관있는 것: 견인차가 깨우는 경보 차는 층 계획 adds 몫(pkTowAdds)까지만. 딱지가 붙으면 그 딱지는 처치로 센다 (자폭과 같다).

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;

const D_GROUND = -786;
const D_STENCIL = -796;
const D_POOL = -700;
const D_FX = -440;
const D_TUBE = 9030;
const D_GLOW = 9056;
const D_TOPFX = 9100;
const D_VIG = 9600;

const T = {
  soft: "pk-soft",
  beam: "pk-beam",
  tube: "pk-tube",
  spark: "pk-spark",
  puff: "pk-puff",
  cone: "pk-cone",
  arrow: "pk-arrow",
  slip: "pk-slip",
  edgeV: "pk-edge-v",
  edgeH: "pk-edge-h",
  carH: (v: number) => `pk-rush-h-${v}`,
  carV: (v: number) => `pk-rush-v-${v}`,
  wreck: (v: number) => `pk-wreck-${v}`,
  code: (s: string) => `pk-code-${s}`,
  sign: (f: number) => `pk-sign-${f}`,
  stencil: (f: number) => `pk-stencil-${f}`,
} as const;

// ── 합성음 (음원 없이) ──

const osc = (wave: Layer["wave"], at: number, dur: number, f0: number, f1: number, gain: number, x: Partial<Layer> = {}): Layer => ({ src: "osc", wave, at, dur, f0, f1, gain, atk: 0.004, env: "perc", ...x });
const nz = (at: number, dur: number, gain: number, type: "lowpass" | "highpass" | "bandpass", f0: number, f1 = f0, q = 1.2, x: Partial<Layer> = {}): Layer => ({ src: "noise", at, dur, gain, atk: 0.004, env: "perc", flt: { type, f0, f1, q }, ...x });
type PkSound = "horn" | "engine" | "skid" | "honk" | "whistle" | "cone" | "hook" | "chain" | "crash" | "alarm" | "rec" | "blip" | "cough";
function pkSound(ev: PkSound): Layer[] {
  switch (ev) {
    // 경적 두 음 (빵—)
    case "horn":
      return [osc("square", 0, 0.42, 330, 330, 0.09, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 1800, f1: 1600, q: 1 } }), osc("square", 0, 0.42, 415, 415, 0.07, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 1800, f1: 1600, q: 1 } })];
    // 엔진이 확 다가와 지나간다
    case "engine":
      return [osc("sawtooth", 0, 0.7, 70, 160, 0.14, { env: "swell", atk: 0.2, flt: { type: "lowpass", f0: 400, f1: 900, q: 3 } }), nz(0, 0.75, 0.16, "bandpass", 300, 1400, 1.5, { env: "swell", atk: 0.3 })];
    case "skid":
      return [nz(0, 0.35, 0.12, "bandpass", 2600, 1800, 6)];
    // 경보 차: 높낮이가 오르내리는 삐뽀
    case "honk":
      return [0, 0.16, 0.32].flatMap((t, i) => [osc("square", t, 0.14, i % 2 ? 620 : 820, i % 2 ? 620 : 820, 0.05, { env: "hold", flt: { type: "lowpass", f0: 2400, f1: 2400, q: 1 } })]);
    case "whistle":
      return [osc("sine", 0, 0.28, 2600, 2900, 0.06, { lfo: { hz: 28, cents: 140, on: "pitch" }, env: "hold" })];
    case "cone":
      return [nz(0, 0.06, 0.1, "bandpass", 900, 600, 3), osc("triangle", 0, 0.08, 260, 160, 0.06)];
    case "hook":
      return [nz(0, 0.12, 0.14, "highpass", 3000, 2200), osc("triangle", 0, 0.18, 520, 380, 0.08, { verb: 0.3 })];
    case "chain":
      return [0, 0.05, 0.1, 0.16, 0.22].map((t) => nz(t, 0.04, 0.07, "bandpass", 4200, 3800, 4));
    case "crash":
      return [nz(0, 0.45, 0.22, "lowpass", 2400, 400, 1), osc("triangle", 0, 0.2, 120, 50, 0.16), nz(0.05, 0.3, 0.08, "highpass", 5000, 3000)];
    // 출차 경보: 길게 오르내리는 사이렌
    case "alarm":
      return [osc("sawtooth", 0, 1.1, 520, 880, 0.06, { env: "hold", atk: 0.05, lfo: { hz: 2.2, cents: 500, on: "pitch" }, flt: { type: "lowpass", f0: 2200, f1: 2200, q: 1 } })];
    case "rec":
      return [osc("sine", 0, 0.08, 1320, 1320, 0.05), osc("sine", 0.1, 0.08, 1320, 1320, 0.05)];
    case "blip":
      return [osc("square", 0, 0.08, 880, 1760, 0.04), osc("square", 0.09, 0.08, 1760, 880, 0.03)];
    case "cough":
      return [nz(0, 0.12, 0.08, "bandpass", 700, 500, 2), nz(0.16, 0.1, 0.06, "bandpass", 650, 480, 2)];
  }
}

// ── 그림 ──

function ensureTextures(sc: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!sc.textures.exists(key)) sc.textures.addCanvas(key, make());
  };
  add(T.soft, () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  add(T.puff, () => radial(32, [[0, "rgba(255,255,255,0.75)"], [0.6, "rgba(255,255,255,0.3)"], [1, "rgba(255,255,255,0)"]]));
  // 헤드라이트 빛줄기: 왼쪽 끝이 밝고 오른쪽으로 퍼지며 사라진다
  add(T.beam, () => {
    const { canvas, ctx } = makeCanvas(128, 48);
    for (let x = 0; x < 128; x++) {
      const t = x / 128;
      const half = 3 + t * 21;
      const g = ctx.createLinearGradient(0, 24 - half, 0, 24 + half);
      const a = (1 - t) ** 1.4;
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 24 - half, 1, half * 2);
    }
    return canvas;
  });
  add(T.tube, () => {
    const { canvas, ctx } = makeCanvas(38, 6);
    ctx.fillStyle = "#2a2c30";
    ctx.fillRect(0, 0, 38, 6);
    ctx.fillStyle = "#9aa0a8";
    ctx.fillRect(1, 1, 36, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(2, 2, 34, 2);
    return canvas;
  });
  add(T.spark, () => {
    const { canvas, ctx } = makeCanvas(5, 5);
    ctx.fillStyle = "#fff";
    ctx.fillRect(2, 0, 1, 5);
    ctx.fillRect(0, 2, 5, 1);
    return canvas;
  });
  add(T.slip, () => {
    const { canvas, ctx } = makeCanvas(6, 5);
    ctx.fillStyle = "#141218";
    ctx.fillRect(0, 0, 6, 5);
    ctx.fillStyle = "#f4dc4a";
    ctx.fillRect(1, 1, 4, 3);
    ctx.fillStyle = "#d03030";
    ctx.fillRect(1, 1, 4, 1);
    return canvas;
  });
  // 라바콘 (그림자 포함)
  add(T.cone, () => {
    const { canvas, ctx } = makeCanvas(9, 11);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 9, 9, 2);
    ctx.fillStyle = "#2a2c30";
    ctx.fillRect(0, 8, 9, 2);
    for (let j = 0; j < 8; j++) {
      const w = 1 + Math.floor(j / 2) * 2;
      ctx.fillStyle = j === 3 || j === 4 ? "#f2f2ee" : "#ff6a1a";
      ctx.fillRect(4 - Math.floor(j / 2), j, w, 1);
    }
    return canvas;
  });
  // 초록 화살표 탄 (비상구 표시등)
  add(T.arrow, () => {
    const { canvas, ctx } = makeCanvas(9, 7);
    ctx.fillStyle = "#0a3a1a";
    ctx.fillRect(0, 2, 6, 3);
    ctx.fillRect(4, 0, 2, 7);
    ctx.fillRect(6, 1, 2, 5);
    ctx.fillRect(8, 2, 1, 3);
    ctx.fillStyle = "#6aff9a";
    ctx.fillRect(1, 3, 6, 1);
    ctx.fillRect(5, 1, 1, 5);
    ctx.fillRect(6, 2, 1, 3);
    ctx.fillRect(7, 3, 1, 1);
    return canvas;
  });
  for (const [k, dirV] of [
    [T.edgeV, true],
    [T.edgeH, false],
  ] as const)
    add(k, () => {
      const { canvas, ctx } = makeCanvas(dirV ? 4 : 64, dirV ? 64 : 4);
      const g = dirV ? ctx.createLinearGradient(0, 0, 0, 64) : ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, dirV ? 4 : 64, dirV ? 64 : 4);
      return canvas;
    });
  // 돌진하는 차 (옆모습 가로줄용·앞모습 세로줄용) — 소품 그림을 그대로 쓴다
  for (let v = 0; v < 8; v++) {
    add(T.carH(v), () => {
      const { canvas, ctx } = makeCanvas(54, 28);
      PK_PROPS.pk_car_side(ctx, 54, 28, v * 2);
      return canvas;
    });
    add(T.carV(v), () => {
      const { canvas, ctx } = makeCanvas(30, 46);
      PK_PROPS.pk_car(ctx, 30, 46, v * 2 + 1);
      return canvas;
    });
  }
  for (let v = 0; v < 4; v++)
    add(T.wreck(v), () => {
      const { canvas, ctx } = makeCanvas(46, 34);
      PK_PROPS.pk_wreck(ctx, 46, 34, v);
      return canvas;
    });
}

// ── 상태 ──

type St = {
  ph: number;
  base: number;
  // 딱지
  ready?: number;
  // 타이어
  roll?: { vx: number; vy: number; until: number };
  restUntil?: number;
  hitAt?: number;
  // 경보 차·비상구·차단기·블랙박스·요원의 다음 동작
  next?: number;
  emitAt?: number;
  // 카트
  vx?: number;
  vy?: number;
  // 그림자
  lurk?: { x: number; y: number } | null;
  pounce?: { at: number; from: { x: number; y: number }; to: { x: number; y: number }; land: number };
  chaseUntil?: number;
  // 비상구
  hop?: { out: number; in: number; to: { x: number; y: number }; fire: number };
  glow?: Phaser.GameObjects.Image;
  // 배기가스
  last?: { x: number; y: number };
  // 차단기
  arm?: number;
  sweep?: { at: number; dur: number; c: number; hit: boolean };
  // 블랙박스
  rec?: { until: number; list: { x: number; y: number; a: number }[]; lastAt: number };
  // 우두머리
  hook?: { at: number; ang: number; len: number; tip: number; grab: number; done: boolean };
  hookAt?: number;
  towAt?: number;
  tows?: number;
};

type Rush = { lane: PkLane; dir: number; warnAt: number; goAt: number; pos: number; img: Phaser.GameObjects.Image; beams: Phaser.GameObjects.Image[]; hitP: boolean; hitM: Set<ThemeMon>; len: number; told: boolean };
type Ring = { x: number; y: number; r: number; hit: boolean; m: ThemeMon };
type Cloud = { x: number; y: number; r: number; until: number; img: Phaser.GameObjects.Image };
type Cone = { x: number; y: number; until: number; img: Phaser.GameObjects.Image; born: number };
type Block = { x: number; y: number; w: number; h: number; img: Phaser.GameObjects.Image; until: number };
type Tube = { img: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; pool: Phaser.GameObjects.Image; bad: boolean; next: number; on: boolean; dead: boolean };
type Puddle = { x: number; y: number; w: number; h: number; drip: number; ripple: number; rx: number };

export class ParkingStage implements TowerThemeRuntime {
  private readonly sc: Phaser.Scene;
  private readonly floor: number;
  private readonly visit: number;
  private readonly loop: PkLoop;
  private readonly room: number;
  private readonly boss: boolean;
  private readonly lanes: readonly PkLane[];
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly st = new Map<ThemeMon, St>();
  private readonly grid = new MonGrid(28);
  private rnd: () => number;
  private t0: number;
  // 배경
  private tubes: Tube[] = [];
  private hazard: { x: number; y: number; ph: number; period: number }[] = [];
  private exits: { img: Phaser.GameObjects.Image; ph: number }[] = [];
  private puddles: Puddle[] = [];
  private lightG!: Phaser.GameObjects.Graphics;
  private groundG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private topG!: Phaser.GameObjects.Graphics;
  private lightAt = 0;
  private sparks!: FxPool;
  private mist!: FxPool;
  private drips: { x: number; y: number; vy: number; until: number }[] = [];
  private edges: Phaser.GameObjects.Image[] = [];
  private beacon: Phaser.GameObjects.Image | null = null;
  // 기믹
  private rush: Rush | null = null;
  private nextRush: number;
  private rushTold = false;
  private alarm = { next: 0, warn: false, until: 0 };
  private lastHurtAt = 0;
  // 몬스터 연출
  private rings: Ring[] = [];
  private clouds: Cloud[] = [];
  private cloudTick = 0;
  private cones: Cone[] = [];
  private blocks: Block[] = [];
  private tickets: { until: number; img: Phaser.GameObjects.Image }[] = [];
  private kickV = { x: 0, y: 0 };
  private pv = { x: 0, y: 0 };
  private trail: { x: number; y: number; t: number }[] = [];
  private noteAt = new Map<string, number>();
  private laters: { at: number; fn: () => void }[] = [];
  private towed = 0;
  private towCap = 0;

  constructor(
    private readonly host: ThemeHost,
    seed: number,
  ) {
    this.sc = host.scene;
    this.floor = host.floor();
    this.visit = themeVisit(host);
    this.loop = pkLoop(this.visit);
    this.room = host.layout().variant;
    this.boss = isBossFloor(this.floor);
    this.lanes = pkLanes(this.room);
    this.towCap = pkTowAdds(this.visit);
    let s = (seed ^ 0x504b5354) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.t0 = host.now();
    this.nextRush = this.t0 + PK_RUSH.first;
    this.alarm.next = this.t0 + PK_ALARM.first * this.loop.alarm;
    ensureTextures(this.sc);
    this.build();
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private snd(ev: PkSound): void {
    this.host.synth(`pk-${ev}`, pkSound(ev));
  }

  /** 같은 말은 ms에 한 번만 (몬스터가 많을 때 글자가 쏟아지지 않게) */
  private note(key: string, ms: number, x: number, y: number, text: string, color: string): void {
    const now = this.host.now();
    if ((this.noteAt.get(key) ?? 0) > now) return;
    this.noteAt.set(key, now + ms);
    this.host.float(x, y, text, color);
  }

  title(): string {
    const name = PK_ROOM_NAMES[this.room] ?? "";
    return this.visit === 0 ? name : `${name} · ${this.loop.name}`;
  }

  // ── 배경 ──

  private build(): void {
    const sc = this.sc;
    const l = this.host.layout();
    const dark = this.loop.dark;
    // 층 번호: 바닥 페인트(시작점 아래) + 벽에 걸린 층 표지
    const fk = T.stencil(this.floor);
    if (!sc.textures.exists(fk))
      sc.textures.addCanvas(
        fk,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(text.length * 16 + 4, 24);
          pkText(ctx, text, 2, 2, 0xf0d040, 4, 0.6);
          ctx.globalCompositeOperation = "destination-out";
          for (let k = 0; k < 110; k++) ctx.fillRect(Math.floor(Math.random() * canvas.width), Math.floor(Math.random() * 24), 1 + (k % 2), 1);
          return canvas;
        })(),
      );
    this.keep(sc.add.image(l.start.x, l.start.y + 22, fk).setDepth(D_STENCIL).setAlpha(0.75));
    const sk = T.sign(this.floor);
    if (!sc.textures.exists(sk))
      sc.textures.addCanvas(
        sk,
        (() => {
          const text = `${this.floor}F`;
          const { canvas, ctx } = makeCanvas(40, 16);
          ctx.fillStyle = "#14161a";
          ctx.fillRect(0, 0, 40, 16);
          ctx.fillStyle = css(0xf0c030);
          ctx.fillRect(0, 0, 40, 2);
          ctx.fillRect(0, 14, 40, 2);
          const w = pkText(ctx, text, 0, 0, 0, 2, 0);
          pkText(ctx, text, Math.round((40 - w) / 2), 3, 0xffd04a, 2);
          return canvas;
        })(),
      );
    const signX = this.room === 1 ? 140 : this.room === 5 ? 140 : this.room === 7 ? 300 : 224;
    this.keep(sc.add.image(signX, 11, sk).setDepth(-900));
    // 기둥 칠: 구역 글자 + 층 (B2 띠 아래 노란 판)
    const code = pkPillarCode(this.floor);
    const ck = T.code(code);
    if (!sc.textures.exists(ck))
      sc.textures.addCanvas(
        ck,
        (() => {
          const { canvas, ctx } = makeCanvas(16, 9);
          ctx.fillStyle = "#e8c030";
          ctx.fillRect(0, 0, 16, 9);
          const w = pkText(ctx, code, 0, 0, 0, 1, 0);
          pkText(ctx, code, Math.round((16 - w) / 2), 2, 0x1a1a1e, 1);
          return canvas;
        })(),
      );
    for (const p of l.props) {
      if (p.kind === "pk_pillar") this.keep(sc.add.image(p.x, p.y - 46 + 30, ck).setDepth(p.y + 0.5));
      // 비상등이 켜진 차 (정전 판엔 더 많이)
      if ((p.kind === "pk_car" || p.kind === "pk_car_side") && this.rnd() < (dark > 0.5 ? 0.6 : 0.35)) {
        const period = 700 + this.rnd() * 500;
        const ph = this.rnd() * 1000;
        for (const q of pkCarLights(p.kind, (p as { v?: number }).v ?? 0, !!(p as { flip?: boolean }).flip)) this.hazard.push({ x: p.x + q.x, y: p.y + q.y, ph, period });
      }
    }
    // 천장 형광등 (몇 개는 고장 나 깜빡인다, 정전 판은 거의 꺼져 있다)
    for (const y of PK_TUBE_ROWS)
      for (const x of [80, 224, 368]) {
        const bad = this.rnd() < 0.22;
        const dead = dark > 0.5 && this.rnd() < 0.75;
        const img = this.keep(sc.add.image(x, y - 34, T.tube).setDepth(D_TUBE).setAlpha(0.92));
        const halo = this.keep(sc.add.image(x, y - 33, T.soft).setDisplaySize(64, 16).setTint(0xd8ecff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_TUBE + 1).setAlpha(0.5));
        const pool = this.keep(sc.add.image(x, y + 8, T.soft).setDisplaySize(150, 92).setTint(0xe8f4ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_POOL).setAlpha(0.3));
        this.tubes.push({ img, halo, pool, bad, next: this.t0 + this.rnd() * 3000, on: !dead, dead });
      }
    // 비상구 표시등 빛
    for (const e of pkExitSigns(this.room)) this.exits.push({ img: this.keep(sc.add.image(e.x, e.y + 6, T.soft).setDisplaySize(46, 30).setTint(0x3aff7a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW)), ph: this.rnd() * 6 });
    // 웅덩이 (바닥 그림의 것 + 비 오는 판엔 더)
    for (const d of l.decals) if (d.kind === "pk_puddle") this.puddles.push({ x: d.x + d.w / 2, y: d.y + d.h / 2, w: d.w, h: d.h, drip: this.t0 + this.rnd() * 2000, ripple: -1, rx: 0 });
    this.groundG = this.keep(sc.add.graphics().setDepth(D_GROUND));
    if (this.loop.wet)
      for (let k = 0; k < 6; k++) {
        const x = 40 + this.rnd() * (AW - 80);
        const y = TOP + 30 + this.rnd() * (AH - TOP - 50);
        const w = 22 + this.rnd() * 22;
        this.puddles.push({ x, y, w, h: w * 0.34, drip: this.t0 + this.rnd() * 2000, ripple: -1, rx: 0 });
      }
    // 어두운 판: 지도 분위기 층에 곱해 넣는다 (화면 전체 층을 하나 더 두지 않는다)
    if (dark > 0) {
      const c = Phaser.Display.Color.IntegerToColor(0x161c2c);
      const mixc = Phaser.Display.Color.GetColor(255 - (255 - c.red) * dark, 255 - (255 - c.green) * dark, 255 - (255 - c.blue) * dark);
      const own = foldMultiply(sc, mixc, 9000, () => sc.add.rectangle(-200, -200, AW + 400, AH + 400, mixc).setOrigin(0, 0).setDepth(9002).setBlendMode(Phaser.BlendModes.MULTIPLY));
      if (own) this.keep(own);
    }
    this.lightG = this.keep(sc.add.graphics().setDepth(D_GLOW).setBlendMode(Phaser.BlendModes.ADD));
    this.fxG = this.keep(sc.add.graphics().setDepth(D_FX));
    this.topG = this.keep(sc.add.graphics().setDepth(D_TOPFX));
    this.sparks = new FxPool(sc, T.spark, 48, D_GLOW + 2);
    this.mist = new FxPool(sc, T.puff, 28, D_FX + 1, false);
    this.edges = [
      this.keep(sc.add.image(0, 0, T.edgeV).setOrigin(0.5, 0).setDepth(D_VIG).setVisible(false)),
      this.keep(sc.add.image(0, 0, T.edgeV).setOrigin(0.5, 1).setFlipY(true).setDepth(D_VIG).setVisible(false)),
      this.keep(sc.add.image(0, 0, T.edgeH).setOrigin(0, 0.5).setDepth(D_VIG).setVisible(false)),
      this.keep(sc.add.image(0, 0, T.edgeH).setOrigin(1, 0.5).setFlipX(true).setDepth(D_VIG).setVisible(false)),
    ];
    this.beacon = this.keep(sc.add.image(AW / 2, AH / 2, T.soft).setDisplaySize(220, 130).setTint(0xffa020).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0));
  }

  // ── 몬스터 ──

  private s(m: ThemeMon): St {
    let x = this.st.get(m);
    if (!x) {
      x = { ph: this.rnd() * 1000, base: m.st.speed };
      this.st.set(m, x);
    }
    return x;
  }

  spawned(m: ThemeMon): void {
    if (this.loop.speed !== 1) m.st.speed *= this.loop.speed;
    const s = this.s(m);
    s.base = m.st.speed;
    const now = this.host.now();
    switch (m.id) {
      case "pk_ticket":
        s.ready = now + 600;
        break;
      case "pk_tire":
        s.restUntil = now + 700 + this.rnd() * 600;
        break;
      case "pk_alarm_car":
        s.next = now + 1500 + this.rnd() * 1500;
        break;
      case "pk_shadow":
        this.hide(m, s);
        break;
      case "pk_exit_sign":
        s.next = now + 1800 + this.rnd() * 1500;
        s.glow = this.keep(this.sc.add.image(m.x, m.y, T.soft).setDisplaySize(40, 30).setTint(0x3aff7a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0.5));
        break;
      case "pk_attendant":
        s.next = now + 2500 + this.rnd() * 1500;
        break;
      case "pk_barrier":
        s.next = now + 1800 + this.rnd() * 1200;
        s.arm = 0;
        break;
      case "pk_dashcam":
        s.rec = { until: now + 4500, list: [], lastAt: 0 };
        break;
      case "pk_tow_truck":
        s.hookAt = now + 2600;
        s.towAt = now + 3000;
        s.tows = 0;
        break;
    }
  }

  /** 그림자: 가까운 기둥(없으면 차) 뒤로 숨는다 */
  private hide(m: ThemeMon, s: St): void {
    const l = this.host.layout();
    const cover = l.props.filter((p) => p.kind === "pk_pillar" || p.kind === "pk_car" || p.kind === "pk_wreck" || p.kind === "pk_pallet");
    const p = this.host.player();
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const c of cover) {
      const d = Math.hypot(c.x - m.x, c.y - m.y) + (Math.hypot(c.x - p.x, c.y - p.y) < 70 ? 400 : 0) + this.rnd() * 40;
      if (d < bd) {
        bd = d;
        best = { x: c.x + (this.rnd() < 0.5 ? -12 : 12), y: c.y - 4 };
      }
    }
    const at = best ? this.host.place(best.x, best.y, 6) : { x: m.x, y: m.y };
    s.lurk = at;
    s.pounce = undefined;
    s.chaseUntil = undefined;
  }

  move(m: ThemeMon, dt: number): boolean {
    const s = this.s(m);
    const H = this.host;
    const p = H.player();
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const now = H.now();
    const sp = m.st.speed;
    switch (m.id) {
      case "pk_ticket": {
        // 팔랑팔랑: 좌우로 크게 흔들리며 다가온다
        const a = Math.atan2(dy, dx) + Math.sin(now / 140 + s.ph) * 0.9;
        H.moveMon(m, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
        return true;
      }
      case "pk_tire":
        this.moveTire(m, s, now, dt, dx, dy, d);
        return true;
      case "pk_alarm_car":
      case "pk_barrier":
      case "pk_exit_sign":
        return true;
      case "pk_cart": {
        // 줄지어 몰려다닌다: 나를 향하되 가까운 카트와 방향을 맞추고 너무 붙으면 벌린다
        let ax = 0;
        let ay = 0;
        let sx = 0;
        let sy = 0;
        let n = 0;
        this.grid.near(m.x, m.y, 30, (o) => {
          if (o === m || o.id !== "pk_cart") return;
          const os = this.st.get(o);
          ax += os?.vx ?? 0;
          ay += os?.vy ?? 0;
          const ox = m.x - o.x;
          const oy = m.y - o.y;
          const od = Math.hypot(ox, oy) || 1;
          if (od < 13) {
            sx += (ox / od) * (13 - od);
            sy += (oy / od) * (13 - od);
          }
          n++;
        });
        let wx = (dx / d) * sp;
        let wy = (dy / d) * sp;
        if (n) {
          wx = wx * 0.65 + (ax / n) * 0.35;
          wy = wy * 0.65 + (ay / n) * 0.35;
        }
        wx += sx * 9;
        wy += sy * 9;
        const k = 1 - Math.exp(-dt * 4);
        s.vx = (s.vx ?? wx) + (wx - (s.vx ?? wx)) * k;
        s.vy = (s.vy ?? wy) + (wy - (s.vy ?? wy)) * k;
        const v = Math.hypot(s.vx, s.vy) || 1;
        const cap = sp * 1.15;
        if (v > cap) {
          s.vx = (s.vx / v) * cap;
          s.vy = (s.vy / v) * cap;
        }
        H.moveMon(m, s.vx * dt, s.vy * dt);
        return true;
      }
      case "pk_shadow":
        return this.moveShadow(m, s, now, dt, d);
      case "pk_attendant": {
        // 거리를 두고 옆으로 돈다 (콘을 놓을 자리를 본다)
        const want = d < 56 ? -1 : d > 110 ? 1 : 0;
        const side = Math.sin(now / 900 + s.ph) > 0 ? 1 : -1;
        const vx = (dx / d) * want + (-dy / d) * side * 0.7;
        const vy = (dy / d) * want + (dx / d) * side * 0.7;
        const vl = Math.hypot(vx, vy) || 1;
        H.moveMon(m, (vx / vl) * sp * dt, (vy / vl) * sp * dt);
        return true;
      }
      case "pk_tow_truck":
        // 고리로 끌어당기는 동안은 버티고 선다
        return !!s.hook && !s.hook.done;
    }
    return false;
  }

  private moveTire(m: ThemeMon, s: St, now: number, dt: number, dx: number, dy: number, d: number): void {
    const H = this.host;
    if ((s.restUntil ?? 0) > now) {
      // 숨 고르기: 제자리에서 휘청
      m.sprite.setRotation(Math.sin(now / 90 + s.ph) * 0.12);
      return;
    }
    if (!s.roll) {
      const a = Math.atan2(dy, dx) + (this.rnd() - 0.5) * 0.3;
      const v = 150 * (m.st.speed / Math.max(1, s.base));
      s.roll = { vx: Math.cos(a) * v, vy: Math.sin(a) * v, until: now + 2300 };
      this.snd("skid");
    }
    const r = s.roll;
    const bx = m.x;
    const by = m.y;
    H.moveMon(m, r.vx * dt, r.vy * dt);
    // 벽·소품에 막힌 쪽은 튕긴다
    const mx = Math.abs(m.x - bx);
    const my = Math.abs(m.y - by);
    if (Math.abs(r.vx * dt) > 0.3 && mx < Math.abs(r.vx * dt) * 0.4) {
      r.vx = -r.vx;
      this.sparks.emit(m.x + Math.sign(-r.vx) * 8, m.y - 6, { vx: -r.vx * 0.2, vy: -30, ms: 260, tint: 0xffd080, s0: 0.7, s1: 0.2 });
    }
    if (Math.abs(r.vy * dt) > 0.3 && my < Math.abs(r.vy * dt) * 0.4) r.vy = -r.vy;
    m.sprite.setRotation(m.sprite.rotation + ((Math.sign(r.vx) || 1) * Math.hypot(r.vx, r.vy) * dt) / 8);
    if (now >= r.until) {
      s.roll = undefined;
      s.restUntil = now + 900;
      m.sprite.setRotation(0);
    }
    void d;
  }

  private moveShadow(m: ThemeMon, s: St, now: number, dt: number, d: number): boolean {
    const H = this.host;
    const p = H.player();
    if (s.pounce) {
      const k = Phaser.Math.Clamp((now - s.pounce.at) / 180, 0, 1);
      if (now < s.pounce.at) return true;
      const tx = s.pounce.from.x + (s.pounce.to.x - s.pounce.from.x) * k;
      const ty = s.pounce.from.y + (s.pounce.to.y - s.pounce.from.y) * k;
      H.moveMon(m, tx - m.x, ty - m.y);
      if (k >= 1) {
        if (Math.hypot(p.x - m.x, p.y - m.y) < 18) {
          H.strike(m, 1.2);
          this.note("pounce", 1500, p.x, p.y - 30, "덮쳤다!", "#f0e070");
        }
        s.pounce = undefined;
        s.chaseUntil = now + 3200;
        m.sprite.setAlpha(1);
      }
      return true;
    }
    if (s.chaseUntil !== undefined) {
      if (now < s.chaseUntil) return false;
      // 다시 숨는다
      this.hide(m, s);
    }
    if (s.lurk) {
      const lx = s.lurk.x - m.x;
      const ly = s.lurk.y - m.y;
      const ld = Math.hypot(lx, ly);
      if (ld > 2) {
        const sp = m.st.speed * 1.6;
        H.moveMon(m, (lx / ld) * Math.min(ld, sp * dt), (ly / ld) * Math.min(ld, sp * dt));
        m.sprite.setAlpha(Math.max(0.14, m.sprite.alpha - dt * 2));
      } else m.sprite.setAlpha(0.14);
      // 가까이 오면 덮친다
      if (d < 64 && ld < 8) {
        const to = H.place(p.x, p.y, 6);
        s.pounce = { at: now + 460, from: { x: m.x, y: m.y }, to, land: now + 640 };
        s.lurk = null;
        m.windUntil = now + 460;
        H.tele.add({ kind: "circle", r: 15 }, to.x, to.y, 0, now, 460, undefined, 0xf0e070);
        m.sprite.setAlpha(0.8);
      }
      return true;
    }
    return false;
  }

  damageMul(m: ThemeMon): number {
    // 블랙박스 녹화: 가까운 몬스터를 친 내 공격을 그 자리·방향 그대로 적어 둔다
    const p = this.host.player();
    const now = this.host.now();
    for (const [o, s] of this.st) {
      if (o.id !== "pk_dashcam" || !o.alive || !s.rec || now >= s.rec.until) continue;
      if (Math.hypot(o.x - m.x, o.y - m.y) > 150 || s.rec.list.length >= 4 || now - s.rec.lastAt < 320) continue;
      s.rec.list.push({ x: p.x, y: p.y, a: Math.atan2(m.y - p.y, m.x - p.x) });
      s.rec.lastAt = now;
      if (s.rec.list.length === 1) this.note(`rec-${s.ph}`, 2000, o.x, o.y - 18, "● 녹화 중", "#ff5a5a");
    }
    // 숨어 있는 그림자는 잘 안 맞는다
    const s = this.st.get(m);
    if (m.id === "pk_shadow" && s?.lurk) return 0.5;
    return 1;
  }

  killed(m: ThemeMon): void {
    const s = this.st.get(m);
    s?.glow?.destroy();
    this.st.delete(m);
    if (m.id === "pk_tire") m.sprite.setRotation(0);
    // 이중 주차: 비상등이 터지며 주변을 밀어낸다
    if (m.id === "pk_double_park") {
      const p = this.host.player();
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      this.snd("crash");
      this.host.shake(160, 0.004);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        this.sparks.emit(m.x, m.y - 8, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, ms: 420, tint: k % 2 ? 0xffb030 : 0xfff0a0, s0: 0.9, s1: 0.2 });
      }
      this.rings.push({ x: m.x, y: m.y - 6, r: 8, hit: true, m });
      if (d < 56) {
        this.host.hurtPct(0.06);
        this.kick((p.x - m.x) / (d || 1), (p.y - m.y) / (d || 1), 220);
      }
    }
  }

  playerVelocity(v: { x: number; y: number }, dt: number): { x: number; y: number } {
    const p = this.host.player();
    let vx = v.x;
    let vy = v.y;
    // 붙은 딱지만큼 느려진다
    const n = this.tickets.length;
    if (n) {
      const k = pkTicketSlow(n);
      vx *= k;
      vy *= k;
    }
    // 비 오는 판: 웅덩이가 미끄럽다
    if (this.loop.wet && this.puddles.some((q) => ((p.x - q.x) / (q.w / 2)) ** 2 + ((p.y - q.y) / (q.h / 2 + 2)) ** 2 <= 1)) {
      const k = 1 - Math.exp(-dt * 2.4);
      this.pv.x += (vx - this.pv.x) * k;
      this.pv.y += (vy - this.pv.y) * k;
      vx = this.pv.x;
      vy = this.pv.y;
      this.note("slip", 8000, p.x, p.y - 30, "미끄러워요!", "#9ac8ff");
    } else {
      this.pv.x = vx;
      this.pv.y = vy;
    }
    // 밀침 (경보 고리·이중 주차·돌진)
    vx += this.kickV.x;
    vy += this.kickV.y;
    const decay = Math.exp(-dt * 6);
    this.kickV.x = Math.abs(this.kickV.x * decay) < 2 ? 0 : this.kickV.x * decay;
    this.kickV.y = Math.abs(this.kickV.y * decay) < 2 ? 0 : this.kickV.y * decay;
    // 라바콘·견인해 온 차: 그쪽으로는 못 간다
    const nx = p.x + vx * dt;
    const ny = p.y + vy * dt;
    for (const c of this.cones) {
      const ox = nx - c.x;
      const oy = ny - (c.y - 2);
      const od = Math.hypot(ox, oy);
      if (od < 9) {
        const ux = ox / (od || 1);
        const uy = oy / (od || 1);
        const into = vx * ux + vy * uy;
        if (into < 0) {
          vx -= into * ux;
          vy -= into * uy;
        }
      }
    }
    for (const b of this.blocks) {
      const x0 = b.x - b.w / 2 - 5;
      const x1 = b.x + b.w / 2 + 5;
      const y0 = b.y - b.h - 4;
      const y1 = b.y + 2;
      if (nx > x0 && nx < x1 && ny > y0 && ny < y1) {
        if (p.x <= x0 || p.x >= x1) vx = 0;
        if (p.y <= y0 || p.y >= y1) vy = 0;
      }
    }
    return { x: vx, y: vy };
  }

  private kick(ux: number, uy: number, f: number): void {
    this.kickV.x += ux * f;
    this.kickV.y += uy * f;
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
    const p = this.host.player();
    this.trail.push({ x: p.x, y: p.y, t: now });
    while (this.trail.length && this.trail[0].t < now - 2000) this.trail.shift();
    this.grid.fill(this.host.mons());
    this.fxG.clear();
    this.topG.clear();
    this.tickBackground(now, dt);
    this.tickRush(now, dt);
    this.tickAlarm(now);
    this.tickMonsters(now, dt);
    this.sparks.update(dt);
    this.mist.update(dt);
    this.tickScreen(now);
  }

  private tickBackground(now: number, dt: number): void {
    const reduced = this.host.reduced;
    // 형광등: 고장 난 것은 가끔 지직거리며 꺼졌다 켜진다
    for (const t of this.tubes) {
      if (t.dead) {
        t.img.setAlpha(0.35).setTint(0x6a7080);
        t.pool.setAlpha(0);
        t.halo.setAlpha(0);
        continue;
      }
      if (t.bad && now >= t.next) {
        t.on = !t.on;
        t.next = now + (t.on ? 300 + this.rnd() * 2600 : 40 + this.rnd() * 160);
      }
      const on = reduced ? true : t.on;
      const lit = 0.3 + this.loop.dark * 0.25;
      t.img.setAlpha(on ? 0.95 : 0.45).setTint(on ? 0xffffff : 0x7a8090);
      t.halo.setAlpha(on ? 0.55 : 0.05);
      t.pool.setAlpha(on ? lit : 0.04);
    }
    for (const e of this.exits) e.img.setAlpha(0.45 + (reduced ? 0 : 0.2 * Math.sin(now / 600 + e.ph)) + this.loop.dark * 0.3);
    // 비상등·웅덩이 무지개는 0.08초마다 다시 그린다
    if (now >= this.lightAt) {
      this.lightAt = now + 80;
      const g = this.lightG.clear();
      for (const h of this.hazard) {
        const on = reduced || ((now + h.ph) % h.period) / h.period < 0.5;
        if (!on) continue;
        g.fillStyle(0xffa020, 0.22).fillCircle(h.x, h.y, 5);
        g.fillStyle(0xffc040, 1).fillRect(h.x - 1, h.y - 1, 3, 2);
      }
      const gg = this.groundG.clear();
      for (const q of this.puddles) {
        // 비 오는 판에 생긴 웅덩이는 바닥 그림이 없어서 여기서 칠한다
        if (this.loop.wet) gg.fillStyle(0x1c2430, 0.55).fillEllipse(q.x, q.y, q.w, q.h);
        // 기름 무지개 (천천히 흐른다)
        const t = now / 1400;
        const cols = [0xc04ad8, 0x3ad0d8, 0xd8d040, 0x4a8ad8];
        for (let i = 0; i < 4; i++) {
          const ox = Math.sin(t + i * 1.6 + q.x) * q.w * 0.22;
          gg.fillStyle(cols[i], 0.22).fillEllipse(q.x + ox, q.y - q.h * 0.1 + i * 0.8 - 1, q.w * 0.32, Math.max(1.5, q.h * 0.18));
        }
        if (q.ripple >= 0) gg.lineStyle(1, 0xa8c8e8, Math.max(0, 0.6 - q.ripple / 18)).strokeEllipse(q.rx, q.y, q.ripple * 1.6, q.ripple * 0.6);
      }
    }
    // 천장 물방울 → 웅덩이에 물결
    for (const q of this.puddles) {
      if (q.ripple >= 0) {
        q.ripple += dt * 26;
        if (q.ripple > 18) q.ripple = -1;
      }
      if (now >= q.drip) {
        q.drip = now + (this.loop.wet ? 700 : 1800) + this.rnd() * 1800;
        const x = q.x + (this.rnd() - 0.5) * q.w * 0.6;
        this.drips.push({ x, y: q.y - 60, vy: 40, until: now + 1200 });
        if (this.drips.length > 14) this.drips.shift();
      }
    }
    const g = this.fxG;
    for (const d of this.drips) {
      d.vy += 420 * dt;
      d.y += d.vy * dt;
      const q = this.puddles.find((pp) => Math.abs(pp.x - d.x) < pp.w / 2 && Math.abs(pp.y - d.y) < 4);
      if (q) {
        q.ripple = 0;
        q.rx = d.x;
        d.until = 0;
        continue;
      }
      g.fillStyle(0xa8c8e8, 0.7).fillRect(d.x, d.y, 1, 3);
    }
    this.drips = this.drips.filter((d) => d.until > now);
    void dt;
  }

  // ── 헤드라이트 돌진 ──

  private laneEnds(l: PkLane, dir: number): { x0: number; y0: number; ang: number; len: number } {
    if (l.hor) return { x0: dir > 0 ? SIDE : AW - SIDE, y0: l.at, ang: dir > 0 ? 0 : Math.PI, len: AW - SIDE * 2 };
    return { x0: l.at, y0: dir > 0 ? TOP : AH - SIDE, ang: dir > 0 ? Math.PI / 2 : -Math.PI / 2, len: AH - TOP - SIDE };
  }

  private tickRush(now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    if (H.calm()) {
      if (!this.rush) this.nextRush = Math.max(this.nextRush, now + 2500);
      return;
    }
    const bossM = this.boss ? H.mons().find((m) => m.alive && m.id === "pk_tow_truck") : undefined;
    const rampage = !!bossM && bossM.hp / bossM.st.maxHp <= PK_BOSS_RAMPAGE;
    if (!this.rush && now >= this.nextRush && this.lanes.length) {
      // 내가 서 있는 줄을 더 자주 고른다
      const mine = this.lanes.filter((l) => Math.abs((l.hor ? p.y : p.x) - l.at) < 40);
      const lane = mine.length && this.rnd() < 0.65 ? mine[Math.floor(this.rnd() * mine.length)] : this.lanes[Math.floor(this.rnd() * this.lanes.length)];
      const dir = this.rnd() < 0.5 ? 1 : -1;
      const e = this.laneEnds(lane, dir);
      const warn = rampage ? 1200 : PK_RUSH.warn;
      const v = Math.floor(this.rnd() * 8);
      const img = this.keep(this.sc.add.image(-200, -200, lane.hor ? T.carH(v) : T.carV(v)).setOrigin(0.5, 1).setFlipX(lane.hor && dir < 0).setFlipY(!lane.hor && dir < 0));
      const beams = [0, 1].map(() => this.keep(this.sc.add.image(e.x0, e.y0, T.beam).setOrigin(0, 0.5).setTint(0xfff4c8).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW).setAlpha(0)));
      this.rush = { lane, dir, warnAt: now, goAt: now + warn, pos: -60, img, beams, hitP: false, hitM: new Set(), len: e.len, told: false };
      H.tele.add({ kind: "line", len: e.len, width: PK_RUSH.width }, e.x0, e.y0, e.ang, now, warn, undefined, 0xffd060);
      this.snd("horn");
      if (!this.rushTold) {
        this.rushTold = true;
        H.flash("헤드라이트! 차가 지나가요 — 빛줄기 밖으로 비켜요", 1800);
      }
      const every = PK_RUSH.every[this.boss ? 1 : 0] * this.loop.rush * (rampage ? 0.55 : 1);
      this.nextRush = now + warn + every;
    }
    const r = this.rush;
    if (!r) return;
    const e = this.laneEnds(r.lane, r.dir);
    const ux = Math.cos(e.ang);
    const uy = Math.sin(e.ang);
    const px = -uy;
    const py = ux;
    if (now < r.goAt) {
      // 경고: 통로 끝에서 헤드라이트 두 줄이 점점 밝아진다 (깜빡이며)
      const k = (now - r.warnAt) / (r.goAt - r.warnAt);
      const flick = this.host.reduced ? 1 : 0.75 + 0.25 * Math.sin(now / 45);
      r.beams.forEach((b, i) => {
        const off = (i ? 1 : -1) * 6;
        b.setPosition(e.x0 + px * off, e.y0 + py * off - (r.lane.hor ? 6 : 0))
          .setRotation(e.ang)
          .setDisplaySize(60 + k * 160, 18 + k * 18)
          .setAlpha((0.25 + k * 0.55) * flick * (1 + this.loop.dark * 0.6));
      });
      if (!r.told && k > 0.6) {
        r.told = true;
        this.snd("horn");
      }
      return;
    }
    // 달린다
    if (r.pos < -50) {
      r.pos = -40;
      this.snd("engine");
      H.shake(120, 0.002);
    }
    r.pos += PK_RUSH.speed * dt;
    const cx = e.x0 + ux * r.pos;
    const cy = e.y0 + uy * r.pos;
    r.img.setPosition(cx, cy + (r.lane.hor ? 10 : r.dir > 0 ? 23 : 23)).setDepth(cy + 10);
    r.beams.forEach((b, i) => {
      const off = (i ? 1 : -1) * 6;
      b.setPosition(cx + ux * 22 + px * off, cy + uy * 22 + py * off - (r.lane.hor ? 6 : 0))
        .setRotation(e.ang)
        .setDisplaySize(150, 34)
        .setAlpha(0.8 * (1 + this.loop.dark * 0.5));
    });
    // 지나간 자리에 바람 자국·불꽃
    if (this.rnd() < dt * 40) this.sparks.emit(cx - ux * 26 + (this.rnd() - 0.5) * px * 18, cy - uy * 26 + (this.rnd() - 0.5) * py * 18, { vx: -ux * 80, vy: -uy * 80 - 10, ms: 260, tint: 0xc8d0e0, s0: 0.6, s1: 0.1 });
    const half = PK_RUSH.width / 2;
    const carHalf = r.lane.hor ? 26 : 22;
    const hits = (x: number, y: number) => {
      const along = (x - e.x0) * ux + (y - e.y0) * uy;
      const perp = (x - e.x0) * px + (y - e.y0) * py;
      return Math.abs(perp) <= half + 3 && Math.abs(along - r.pos) <= carHalf;
    };
    if (!r.hitP && hits(p.x, p.y)) {
      r.hitP = true;
      H.hurtPct(PK_RUSH_HIT);
      this.snd("crash");
      H.shake(220, 0.007);
      // 줄 밖으로 튕겨 나간다 (가까운 쪽으로)
      const perp = (p.x - e.x0) * px + (p.y - e.y0) * py;
      const side = perp >= 0 ? 1 : -1;
      const need = half + 10 - Math.abs(perp);
      H.movePlayer(px * side * need, py * side * need);
      this.kick(px * side + ux * 0.6, py * side + uy * 0.6, 200);
      this.note("hitcar", 800, p.x, p.y - 34, "쾅!", "#ffd060");
      this.lastHurtAt = now;
    }
    this.grid.near(cx, cy, carHalf + half + 6, (m) => {
      if (r.hitM.has(m) || m.boss || !hits(m.x, m.y)) return;
      r.hitM.add(m);
      this.hurtMon(m, PK_RUSH_MON);
      const perp = (m.x - e.x0) * px + (m.y - e.y0) * py;
      const side = perp >= 0 ? 1 : -1;
      if (m.alive) H.moveMon(m, px * side * (half + 8 - Math.abs(perp)), py * side * (half + 8 - Math.abs(perp)));
    });
    if (r.pos > r.len + 80) {
      r.img.destroy();
      for (const b of r.beams) b.destroy();
      this.rush = null;
    }
  }

  /** 지형 피해 (몬스터): 최대 체력 비율. 쓰러지면 처치로 센다 */
  private hurtMon(m: ThemeMon, pct: number): void {
    if (!m.alive) return;
    const dmg = Math.max(1, Math.round(m.st.maxHp * pct));
    m.hp -= dmg;
    m.sprite.setTint(0xffffff);
    this.later(this.host.now() + 90, () => m.alive && m.sprite.clearTint());
    this.host.float(m.x, m.y - MONSTERS[m.id].size - 4, `${dmg}`, "#ffd060");
    if (m.hp <= 0) this.host.kill(m);
  }

  // ── 출차 경보 ──

  private tickAlarm(now: number): void {
    const H = this.host;
    const a = this.alarm;
    if (H.calm() && !a.warn) a.next = Math.max(a.next, now + PK_ALARM.warn + 1500);
    if (!a.warn && now >= a.next - PK_ALARM.warn && now < a.next) {
      a.warn = true;
      H.flash("출차 경보! 곧 몬스터가 빨라져요", 1500);
      this.snd("alarm");
    }
    if (now >= a.next) {
      a.until = now + PK_ALARM.dur;
      a.next = now + PK_ALARM.every * this.loop.alarm;
      a.warn = false;
      this.snd("alarm");
    }
    const bossM = this.boss ? H.mons().find((m) => m.alive && m.id === "pk_tow_truck") : undefined;
    const rampage = !!bossM && bossM.hp / bossM.st.maxHp <= PK_BOSS_RAMPAGE;
    const on = now < a.until || rampage;
    const mul = on ? PK_ALARM.speed : 1;
    for (const m of H.mons()) {
      if (!m.alive || m.boss) continue;
      const s = this.st.get(m);
      if (!s) continue;
      const want = s.base * mul;
      if (Math.abs(m.st.speed - want) > 0.01) m.st.speed = want;
    }
    // 경광등 빛이 방을 훑는다
    if (this.beacon) {
      const vis = on || a.warn;
      const t = now / 420;
      this.beacon.setPosition(AW / 2 + Math.cos(t) * 160, AH / 2 + 14 + Math.sin(t) * 96).setAlpha(vis ? (this.host.reduced ? 0.12 : 0.22) : 0);
    }
  }

  // ── 몬스터 행동 ──

  private tickMonsters(now: number, dt: number): void {
    const H = this.host;
    const p = H.player();
    const g = this.fxG;
    const top = this.topG;
    for (const m of H.mons()) {
      if (!m.alive) continue;
      const s = this.s(m);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      switch (m.id) {
        case "pk_ticket":
          // 몸에 닿으면 붙는다 (그 딱지는 사라지고 발이 무거워진다)
          if (d < 11 && now >= (s.ready ?? 0)) {
            H.strike(m, 0.5);
            this.stick(now);
            H.kill(m);
          }
          break;
        case "pk_tire":
          if (s.roll && d < 13 && now >= (s.hitAt ?? 0)) {
            s.hitAt = now + 700;
            H.strike(m, 1);
            this.kick((p.x - m.x) / (d || 1), (p.y - m.y) / (d || 1), 150);
          }
          break;
        case "pk_alarm_car":
          // 비상등 (앞·뒤가 번갈아)
          for (const sx of [-9, 9]) {
            const on = Math.floor((now + s.ph) / ((s.emitAt ?? 0) > now ? 90 : 380)) % 2 === (sx > 0 ? 0 : 1);
            if (on) this.lightG.fillStyle(0xffa020, 0.35).fillCircle(m.x + sx, m.y - 7, 4);
          }
          if (s.emitAt !== undefined && now >= s.emitAt) {
            s.emitAt = undefined;
            this.rings.push({ x: m.x, y: m.y - 6, r: 10, hit: false, m });
            if (this.rings.length > 12) this.rings.shift();
          } else if (s.emitAt === undefined && now >= (s.next ?? 0) && d < 210) {
            s.emitAt = now + 650;
            s.next = now + 4200 + this.rnd() * 800;
            m.windUntil = now + 650;
            this.snd("honk");
            this.note("honk", 3000, m.x, m.y - 24, "삐뽀삐뽀", "#ffb03a");
          }
          break;
        case "pk_shadow":
          // 숨어 있는 동안 노란 눈만 깜빡
          if (s.lurk && Math.floor((now + s.ph) / 1700) % 4 !== 3) {
            top.fillStyle(0xf0e070, 0.9).fillRect(m.x - 3, m.y - 10, 2, 1).fillRect(m.x + 1, m.y - 10, 2, 1);
            this.lightG.fillStyle(0xf0e070, 0.12).fillCircle(m.x, m.y - 10, 5);
          }
          break;
        case "pk_exit_sign":
          this.tickExit(m, s, now);
          break;
        case "pk_exhaust": {
          const last = s.last;
          if (!last || Math.hypot(m.x - last.x, m.y - last.y) > 20) {
            s.last = { x: m.x, y: m.y };
            const img = this.keep(this.sc.add.image(m.x, m.y - 4, T.puff).setTint(0x6a6a74).setAlpha(0).setDepth(m.y + 2));
            this.clouds.push({ x: m.x, y: m.y - 2, r: 13, until: now + 5200, img });
            if (this.clouds.length > 18) this.clouds.shift()!.img.destroy();
          }
          if (this.rnd() < dt * 6) this.mist.emit(m.x + (this.rnd() - 0.5) * 10, m.y - 14, { vx: (this.rnd() - 0.5) * 8, vy: -14, ms: 900, tint: 0x8a8a94, s0: 0.25, s1: 0.6, a: 0.5, depth: m.y + 3 });
          break;
        }
        case "pk_attendant":
          if (now >= (s.next ?? 0) && d < 170) {
            s.next = now + 5600 + this.rnd() * 1200;
            m.windUntil = now + 400;
            this.placeCones(m, now);
          }
          break;
        case "pk_barrier":
          this.tickBarrier(m, s, now, d);
          break;
        case "pk_dashcam":
          this.tickDashcam(m, s, now);
          break;
        case "pk_double_park":
          // 돌진 준비: 헤드라이트가 나를 비춘다
          if (m.windUntil > now || m.cast?.id === "charge") {
            const a = Math.atan2(p.y - m.y, p.x - m.x);
            this.lightG.fillStyle(0xfff0a0, 0.14);
            this.lightG.slice(m.x, m.y - 10, 110, a - 0.22, a + 0.22).fillPath();
            this.lightG.fillStyle(0xfff4c8, 0.9).fillRect(m.x + Math.cos(a) * 12 - 1, m.y - 10 + Math.sin(a) * 6 - 1, 3, 3);
          }
          break;
        case "pk_tow_truck":
          this.tickBoss(m, s, now, dt, d);
          break;
      }
    }
    // 경보 고리: 커지며 밀어낸다
    for (const r of this.rings) {
      r.r += 120 * dt;
      const a0 = Phaser.Math.Clamp(1 - (r.r - 80) / 60, 0, 1);
      g.lineStyle(4, 0xffa020, 0.35 * a0).strokeCircle(r.x, r.y, r.r);
      g.lineStyle(1, 0xfff0c0, 0.85 * a0).strokeCircle(r.x, r.y, r.r);
      g.lineStyle(1, 0xffa020, 0.5 * a0).strokeCircle(r.x, r.y, r.r - 5);
      if (!r.hit) {
        const pd = Math.hypot(p.x - r.x, p.y - 4 - r.y);
        if (Math.abs(pd - r.r) < 5) {
          r.hit = true;
          if (r.m.alive) H.strike(r.m, 0.7);
          else H.hurtPct(0.05);
          this.kick((p.x - r.x) / (pd || 1), (p.y - r.y) / (pd || 1), 190);
        }
      }
    }
    this.rings = this.rings.filter((r) => r.r < 140);
    // 매연: 안에 있으면 콜록 (조금씩 다친다)
    let inGas = false;
    for (const c of this.clouds) {
      const left = c.until - now;
      const age = 5200 - left;
      c.img.setAlpha(Math.min(0.55, age / 400) * Math.min(1, left / 800)).setDisplaySize(c.r * 2.6 + age / 200, c.r * 1.8 + age / 300);
      if (Math.hypot((p.x - c.x) / 1.2, p.y - c.y) < c.r) inGas = true;
    }
    while (this.clouds.length && this.clouds[0].until <= now) this.clouds.shift()!.img.destroy();
    if (inGas && now >= this.cloudTick && !H.calm()) {
      this.cloudTick = now + 650;
      H.hurtPct(0.02);
      this.snd("cough");
      this.note("cough", 2200, p.x, p.y - 30, "콜록", "#a8a8b0");
    }
    // 라바콘
    for (const c of this.cones) {
      const age = now - c.born;
      const left = c.until - now;
      const drop = Math.max(0, 1 - age / 160);
      c.img.setPosition(c.x, c.y - drop * 14).setAlpha(Math.min(1, left / 300));
    }
    while (this.cones.length && this.cones[0].until <= now) this.cones.shift()!.img.destroy();
    // 붙은 딱지 (내 몸 둘레)
    this.tickets = this.tickets.filter((t) => {
      if (t.until > now) return true;
      t.img.destroy();
      return false;
    });
    this.tickets.forEach((t, i) => {
      const a = now / 500 + (i * Math.PI * 2) / Math.max(1, this.tickets.length);
      t.img.setPosition(p.x + Math.cos(a) * 6, p.y - 8 + Math.sin(a) * 4).setDepth(p.y + 1);
    });
    // 견인해 온 차: 몬스터도 못 들어간다
    for (const b of this.blocks)
      this.grid.near(b.x, b.y - b.h / 2, b.w, (m) => {
        if (m.boss) return;
        const x0 = b.x - b.w / 2 - 4;
        const x1 = b.x + b.w / 2 + 4;
        const y0 = b.y - b.h - 2;
        const y1 = b.y + 2;
        if (m.x <= x0 || m.x >= x1 || m.y <= y0 || m.y >= y1) return;
        const opts = [
          [x0 - m.x, 0],
          [x1 - m.x, 0],
          [0, y0 - m.y],
          [0, y1 - m.y],
        ];
        const [ox, oy] = opts.reduce((a, c) => (Math.abs(a[0]) + Math.abs(a[1]) <= Math.abs(c[0]) + Math.abs(c[1]) ? a : c));
        this.host.moveMon(m, ox, oy);
      });
  }

  private stick(now: number): void {
    const p = this.host.player();
    if (this.tickets.length >= PK_TICKET.max) {
      const old = this.tickets.shift()!;
      old.img.destroy();
    }
    this.tickets.push({ until: now + PK_TICKET.ms, img: this.keep(this.sc.add.image(p.x, p.y - 8, T.slip)) });
    this.snd("cone");
    this.note("ticket", 1200, p.x, p.y - 30, `딱지 ${this.tickets.length}장! 발이 무거워요`, "#f4dc4a");
  }

  /** 방향이 있는 탄: 씬이 방금 만든 탄 그림을 날아가는 쪽으로 돌린다 */
  private shootRot(m: ThemeMon, a: number, sp: number, mult: number, tex: string): void {
    this.host.shoot(m, a, sp, mult, tex);
    const list = this.sc.children.list;
    const last = list[list.length - 1];
    if (last instanceof Phaser.GameObjects.Image && last.texture.key === tex) last.setRotation(a);
  }

  private tickExit(m: ThemeMon, s: St, now: number): void {
    const H = this.host;
    const p = H.player();
    s.glow?.setPosition(m.x, m.y - 8).setAlpha((s.hop && now < s.hop.in ? 0.2 : 0.55) + (this.host.reduced ? 0 : 0.1 * Math.sin(now / 200)));
    if (s.hop) {
      const h = s.hop;
      if (now < h.out) m.sprite.setAlpha(Math.max(0, (h.out - now) / 240));
      else if (now < h.in) {
        if (Math.hypot(m.x - h.to.x, m.y - h.to.y) > 1) H.moveMon(m, h.to.x - m.x, h.to.y - m.y);
        m.sprite.setAlpha(Math.min(1, 1 - (h.in - now) / 240));
      } else m.sprite.setAlpha(1);
      if (now >= h.fire) {
        const a = Math.atan2(p.y - (m.y - 8), p.x - m.x);
        for (let k = -1; k <= 1; k++) this.shootRot(m, a + k * 0.24, 118, 0.55, T.arrow);
        this.snd("blip");
        s.hop = undefined;
      }
      return;
    }
    if (now >= (s.next ?? 0)) {
      s.next = now + 4600 + this.rnd() * 900;
      // 벽을 따라 다른 표시등 자리로 (나에게서 멀리)
      let to = { x: m.x, y: m.y };
      for (let k = 0; k < 10; k++) {
        const side = Math.floor(this.rnd() * 3);
        const c = side === 0 ? { x: 30 + this.rnd() * (AW - 60), y: TOP + 14 } : { x: side === 1 ? SIDE + 14 : AW - SIDE - 14, y: TOP + 30 + this.rnd() * (AH - TOP - 60) };
        const q = H.place(c.x, c.y, 7);
        if (Math.hypot(q.x - p.x, q.y - p.y) > 80) {
          to = q;
          break;
        }
      }
      s.hop = { out: now + 240, in: now + 480, to, fire: now + 980 };
      this.snd("blip");
      for (let k = 0; k < 6; k++) this.sparks.emit(m.x, m.y - 8, { vx: (this.rnd() - 0.5) * 60, vy: -20 - this.rnd() * 30, ms: 300, tint: 0x6aff9a, s0: 0.6, s1: 0.1 });
    }
  }

  /** 주차 요원: 내가 가는 쪽 앞에 라바콘 넷을 가로로 세운다 */
  private placeCones(m: ThemeMon, now: number): void {
    const H = this.host;
    const p = H.player();
    let ux = this.pv.x;
    let uy = this.pv.y;
    let ul = Math.hypot(ux, uy);
    if (ul < 5) {
      ux = p.x - m.x;
      uy = p.y - m.y;
      ul = Math.hypot(ux, uy) || 1;
    }
    ux /= ul;
    uy /= ul;
    const cx = p.x + ux * 34;
    const cy = p.y + uy * 34;
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) * 11;
      const q = H.place(Phaser.Math.Clamp(cx - uy * off, SIDE + 6, AW - SIDE - 6), Phaser.Math.Clamp(cy + ux * off, TOP + 8, AH - SIDE - 2), 4);
      if (Math.hypot(q.x - p.x, q.y - p.y) < 10) continue;
      const img = this.keep(this.sc.add.image(q.x, q.y - 14, T.cone).setOrigin(0.5, 1).setDepth(q.y));
      this.cones.push({ x: q.x, y: q.y, until: now + 4200, img, born: now + k * 70 });
      if (this.cones.length > 16) this.cones.shift()!.img.destroy();
    }
    this.snd("whistle");
    this.later(now + 160, () => this.snd("cone"));
    this.note("cones", 4000, m.x, m.y - 26, "이쪽 막혔어요!", "#ff9a3a");
  }

  /** 차단기: 봉을 들어 올렸다가 부채꼴로 크게 휘두른다 */
  private tickBarrier(m: ThemeMon, s: St, now: number, d: number): void {
    const H = this.host;
    const p = H.player();
    const face = p.x >= m.x ? 0 : Math.PI;
    let ang = s.arm ?? face;
    if (s.sweep) {
      const sw = s.sweep;
      const k = Phaser.Math.Clamp((now - sw.at) / sw.dur, 0, 1);
      if (now < sw.at) ang = sw.c - Math.PI / 2 - 0.4 * ((sw.at - now) < 300 ? 1 : (now - (sw.at - 900)) / 600);
      else {
        ang = sw.c - 1.3 + 2.6 * k;
        if (!sw.hit) {
          const pa = Math.atan2(p.y - (m.y - 10), p.x - m.x);
          const reached = Phaser.Math.Angle.Wrap(pa - (sw.c - 1.3)) <= 2.6 * k + 0.1 && Phaser.Math.Angle.Wrap(pa - (sw.c - 1.3)) >= -0.1;
          if (reached && Math.abs(Phaser.Math.Angle.Wrap(pa - sw.c)) <= 1.35 && d <= 68) {
            sw.hit = true;
            H.strike(m, 1.1);
            this.kick(Math.cos(pa), Math.sin(pa), 170);
          }
        }
        if (k >= 1) s.sweep = undefined;
      }
    } else if (now >= (s.next ?? 0) && d < 96) {
      s.next = now + 4800 + this.rnd() * 900;
      const c = Math.atan2(p.y - (m.y - 10), p.x - m.x);
      s.sweep = { at: now + 900, dur: 240, c, hit: false };
      m.windUntil = now + 900;
      H.tele.add({ kind: "cone", r: 66, arcDeg: 150 }, m.x, m.y - 10, c, now, 900, () => this.snd("crash"), 0xd8302a);
    } else ang += (face - ang) * 0.1;
    s.arm = ang;
    // 봉 (빨강·하양 줄무늬)
    const g = this.topG;
    const ox = m.x + 2;
    const oy = m.y - 11;
    for (let k = 0; k < 46; k += 3) {
      g.fillStyle(Math.floor(k / 6) % 2 ? 0xd8302a : 0xf2f2ee, 1).fillRect(ox + Math.cos(ang) * k - 1, oy + Math.sin(ang) * k - 1, 3, 3);
    }
    g.fillStyle(0x2a2c30, 1).fillCircle(ox, oy, 2);
  }

  /** 블랙박스: 녹화(빨간 불) → 녹화한 공격을 그 자리에 차례로 재생 */
  private tickDashcam(m: ThemeMon, s: St, now: number): void {
    const H = this.host;
    const rec = s.rec;
    if (!rec) return;
    if (now < rec.until) {
      if (Math.floor(now / 300) % 2) this.lightG.fillStyle(0xff2a2a, 0.5).fillCircle(m.x - 3, m.y - 9, 3);
      return;
    }
    // 재생
    const list = rec.list.length ? rec.list : (() => {
      const past = this.trail[0];
      return past ? [{ x: past.x, y: past.y, a: Number.NaN }] : [];
    })();
    s.rec = undefined;
    m.windUntil = now + 500;
    this.note(`play-${s.ph}`, 1500, m.x, m.y - 18, "▶ 재생", "#ff8a8a");
    this.snd("rec");
    list.forEach((r, i) => {
      this.later(now + i * 340, () => {
        if (!m.alive) return;
        const shape = Number.isNaN(r.a) ? ({ kind: "circle", r: 18 } as const) : ({ kind: "cone", r: 40, arcDeg: 110 } as const);
        H.tele.add(shape, r.x, r.y, Number.isNaN(r.a) ? 0 : r.a, H.now(), 700, () => {
          const p = H.player();
          const dd = Math.hypot(p.x - r.x, p.y - r.y);
          const ang = Math.atan2(p.y - r.y, p.x - r.x);
          const inside = Number.isNaN(r.a) ? dd <= 20 : dd <= 42 && Math.abs(Phaser.Math.Angle.Wrap(ang - r.a)) <= 1;
          if (inside && m.alive) H.strike(m, 0.9);
          // 재생된 내 공격 (빨간 잔상)
          for (let k = 0; k < 6; k++) {
            const a = (Number.isNaN(r.a) ? this.rnd() * Math.PI * 2 : r.a + (k / 5 - 0.5) * 1.8);
            this.sparks.emit(r.x + Math.cos(a) * 20, r.y - 6 + Math.sin(a) * 14, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 30, ms: 260, tint: 0xff5a5a, s0: 0.8, s1: 0.2 });
          }
        }, 0xff4a4a);
      });
    });
    this.later(now + 340 * list.length + 2600, () => {
      if (m.alive && this.st.has(m)) this.s(m).rec = { until: H.now() + 4500, list: [], lastAt: 0 };
    });
  }

  // ── 견인차 ──

  private tickBoss(m: ThemeMon, s: St, now: number, dt: number, d: number): void {
    const H = this.host;
    const p = H.player();
    const ratio = m.hp / m.st.maxHp;
    const stage = ratio <= PK_BOSS_RAMPAGE ? 3 : ratio <= PK_BOSS_TOW ? 2 : ratio <= PK_BOSS_HOOK ? 1 : 0;
    // 지붕 경광등 (폭주 때는 빠르게 돈다)
    const spin = now / (stage >= 3 ? 120 : 340);
    const bx = m.x + (m.sprite.flipX ? -12 : 12);
    const by = m.y - 32;
    this.lightG.fillStyle(0xffa020, 0.3).fillCircle(bx, by, 6 + Math.max(0, Math.sin(spin)) * 4);
    this.lightG.fillStyle(0xffa020, 0.07).slice(bx, by, 60, spin, spin + 0.45).fillPath();
    this.lightG.fillStyle(0xffa020, 0.07).slice(bx, by, 60, spin + Math.PI, spin + Math.PI + 0.45).fillPath();
    // 견인 고리: 줄 경고 → 날아가 감기면 끌어당겨 들이받는다
    const hk = s.hook;
    if (!hk && now >= (s.hookAt ?? 0) && d < 210 && !m.cast) {
      const ang = Math.atan2(p.y - (m.y - 14), p.x - m.x);
      const len = Math.min(220, d + 26);
      s.hook = { at: now + 760, ang, len, tip: 0, grab: 0, done: false };
      s.hookAt = now + [5200, 4600, 4200, 3600][stage];
      m.windUntil = now + 760;
      H.tele.add({ kind: "line", len, width: 12 }, m.x, m.y - 14, ang, now, 760, undefined, 0xffa020);
      this.snd("chain");
    }
    if (hk) {
      const ox = m.x;
      const oy = m.y - 14;
      if (now >= hk.at && !hk.done) {
        if (!hk.grab) {
          hk.tip = Math.min(hk.len, hk.tip + 620 * dt);
          const tx = ox + Math.cos(hk.ang) * hk.tip;
          const ty = oy + Math.sin(hk.ang) * hk.tip;
          if (Math.hypot(p.x - tx, p.y - 6 - ty) < 11) {
            hk.grab = now + 760;
            this.snd("hook");
            this.note("hook", 1500, p.x, p.y - 32, "걸렸다! 끌려가요", "#ffb03a");
          } else if (hk.tip >= hk.len) hk.done = true;
          this.chain(ox, oy, tx, ty);
        } else if (now < hk.grab) {
          const ddx = ox - p.x;
          const ddy = oy - p.y;
          const dd = Math.hypot(ddx, ddy) || 1;
          if (dd > 22) H.movePlayer((ddx / dd) * 175 * dt, (ddy / dd) * 175 * dt);
          this.chain(ox, oy, p.x, p.y - 6);
        } else {
          hk.done = true;
          if (Math.hypot(p.x - m.x, p.y - m.y) < 46) {
            H.strike(m, 1.15);
            H.shake(160, 0.005);
            this.snd("crash");
          }
        }
      } else if (hk.done) {
        hk.tip = Math.max(0, hk.tip - 900 * dt);
        if (hk.tip > 0) this.chain(ox, oy, ox + Math.cos(hk.ang) * hk.tip, oy + Math.sin(hk.ang) * hk.tip);
        else s.hook = undefined;
      }
    }
    // 2단계부터: 주차된 차를 끌고 와 장애물로 세운다 (둘에 한 번은 경보 차가 깨어난다 — 층 계획 몫까지만)
    if (stage >= 2 && now >= (s.towAt ?? 0)) {
      s.towAt = now + (stage >= 3 ? 6500 : 8500);
      s.tows = (s.tows ?? 0) + 1;
      this.tow(m, now, (s.tows ?? 0) % 2 === 0);
    }
  }

  /** 견인: 가장자리에서 차를 끌고 와 내려놓는다 */
  private tow(m: ThemeMon, now: number, alarm: boolean): void {
    const H = this.host;
    const p = H.player();
    let at: { x: number; y: number } | null = null;
    for (let k = 0; k < 16 && !at; k++) {
      const x = 60 + this.rnd() * (AW - 120);
      const y = TOP + 40 + this.rnd() * (AH - TOP - 70);
      if (this.lanes.some((l) => Math.abs((l.hor ? y - 6 : x) - l.at) < PK_RUSH.width / 2 + 16)) continue;
      if (Math.hypot(x - p.x, y - p.y) < 60 || Math.hypot(x - m.x, y - m.y) < 56) continue;
      if (this.blocks.some((b) => Math.hypot(b.x - x, b.y - y) < 50)) continue;
      at = H.place(x, y, 12);
    }
    if (!at) return;
    const spot = at;
    const fromX = spot.x < AW / 2 ? SIDE - 30 : AW - SIDE + 30;
    const v = Math.floor(this.rnd() * 4);
    const wake = alarm && this.towed < this.towCap;
    const img = this.keep(this.sc.add.image(fromX, spot.y + 2, wake ? T.carH(0) : T.wreck(v)).setOrigin(0.5, 1).setDepth(spot.y));
    H.tele.add({ kind: "circle", r: 24 }, spot.x, spot.y - 6, 0, now, 1100, undefined, 0xffa020);
    this.snd("chain");
    const t0 = now;
    const drag = () => {
      const k = Phaser.Math.Clamp((H.now() - t0) / 1100, 0, 1);
      const e = 1 - (1 - k) ** 2;
      img.setPosition(fromX + (spot.x - fromX) * e, spot.y + 2).setRotation(Math.sin(k * 12) * 0.03);
      if (m.alive) this.chain(m.x, m.y - 14, img.x + (fromX < spot.x ? 20 : -20), spot.y - 8);
      if (k < 1) this.later(H.now() + 16, drag);
      else land();
    };
    const land = () => {
      this.snd("crash");
      H.shake(140, 0.004);
      for (let k = 0; k < 10; k++) this.mist.emit(spot.x + (this.rnd() - 0.5) * 40, spot.y - 2, { vx: (this.rnd() - 0.5) * 40, vy: -10, ms: 600, tint: 0x8a8c90, s0: 0.3, s1: 0.8, a: 0.5, depth: spot.y + 1 });
      const pp = H.player();
      if (wake) {
        // 경보 차가 깨어난다 (몬스터로)
        img.destroy();
        this.towed++;
        const n = H.spawn("pk_alarm_car", spot.x, spot.y, m.wave, true);
        if (n) this.note("wake", 1200, spot.x, spot.y - 26, "삐뽀! 차가 깨어났다", "#ffb03a");
        return;
      }
      const b: Block = { x: spot.x, y: spot.y, w: 40, h: 14, img, until: Infinity };
      if (Math.abs(pp.x - b.x) < b.w / 2 + 5 && pp.y > b.y - b.h - 4 && pp.y < b.y + 3) {
        H.hurtPct(0.08);
        H.movePlayer(0, b.y + 6 - pp.y);
      }
      this.blocks.push(b);
      if (this.blocks.length > 4) {
        const old = this.blocks.shift()!;
        this.sc.tweens.add({ targets: old.img, alpha: 0, duration: 400, onComplete: () => old.img.destroy() });
      }
    };
    drag();
  }

  /** 쇠사슬 (그림 한 장에 점선으로) */
  private chain(x0: number, y0: number, x1: number, y1: number): void {
    const g = this.topG;
    const n = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 4));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      g.fillStyle(k % 2 ? 0x8a8e96 : 0xc8ccd4, 1).fillRect(x0 + (x1 - x0) * t - 1, y0 + (y1 - y0) * t - 1, 2, 2);
    }
    g.fillStyle(0xffa020, 1).fillRect(x1 - 2, y1 - 1, 4, 3);
  }

  /** 화면 테두리: 출차 경보는 주황, 내가 돌진 줄 안에 서 있으면 흰빛, 차에 치이면 붉게 */
  private tickScreen(now: number): void {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const cx = v.x + v.width / 2;
    const cy = v.y + v.height / 2;
    const p = this.host.player();
    const r = this.rush;
    const inLane = !!r && now < r.goAt && Math.abs((r.lane.hor ? p.y : p.x) - r.lane.at) <= PK_RUSH.width / 2 + 3;
    const alarm = now < this.alarm.until || this.alarm.warn;
    const hit = now - this.lastHurtAt < 350;
    let a = 0;
    let col = 0xffa020;
    if (hit) {
      a = 0.5 * (1 - (now - this.lastHurtAt) / 350);
      col = 0xff3a2a;
    } else if (inLane) {
      a = 0.3 + 0.2 * Math.sin(now / 60);
      col = 0xfff0b0;
    } else if (alarm) a = this.alarm.warn ? 0.22 + 0.18 * Math.sin(now / 90) : 0.18 + 0.1 * Math.sin(now / 180);
    if (this.host.reduced) a = Math.min(a, 0.3);
    const bw = v.width * 0.16;
    const bh = v.height * 0.2;
    const [t, b, l, rr] = this.edges;
    for (const e of this.edges) e.setTint(col).setAlpha(a).setVisible(a > 0.01);
    if (a > 0.01) {
      t.setPosition(cx, v.y).setDisplaySize(v.width, bh);
      b.setPosition(cx, v.y + v.height).setDisplaySize(v.width, bh);
      l.setPosition(v.x, cy).setDisplaySize(bw, v.height);
      rr.setPosition(v.x + v.width, cy).setDisplaySize(bw, v.height);
    }
  }

  destroy(): void {
    for (const s of this.st.values()) s.glow?.destroy();
    this.st.clear();
    this.sparks?.destroy();
    this.mist?.destroy();
    for (const c of this.clouds) c.img.destroy();
    for (const c of this.cones) c.img.destroy();
    for (const t of this.tickets) t.img.destroy();
    this.clouds = [];
    this.cones = [];
    this.tickets = [];
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.blocks = [];
    this.laters = [];
    this.rush = null;
  }
}

/** 지하 주차장 실행부 만들기 (game/tower/themes 표에 한 줄로) */
export const makeParking = (host: ThemeHost, _zone: string, seed: number): TowerThemeRuntime => new ParkingStage(host, seed);

