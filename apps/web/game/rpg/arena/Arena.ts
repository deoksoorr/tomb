import * as Phaser from "phaser";
import { HUNT_ZONES, MONSTERS, type MonsterId, type ZoneDef, type ZoneId } from "@/lib/rpg/catalog";
import { BOSS_RAGES } from "@/lib/rpg/plan";
import { radial } from "../../sprites/pixel";
import { RTEX } from "../sprites";
import type { Color } from "../../sprites/pixel";
import { AMBIENT, arrowCanvas, beltCanvas, doorLeafCanvas, elevatorLeafCanvas, floorCanvas, PARTICLE_COLORS, propCanvas, tunnelCanvas, vineCanvas } from "./art";
import { AH, allSolids, AW, buildLayout, collide, COLS, CELL, FlowField, freeGrid, inRegion, nearestFree, PROP_META, SIDE, standable, TOP, type ArenaLayout, type Pt, type Region, type Solid } from "./layout";

// 40번 사냥터 실행부: 지도 그리기(바닥·소품·조명·입자) + 지형 기믹 + 몬스터 길찾기·충돌 + 우두머리가 화날 때 졸개 부르기.
// HuntScene은 몇 군데에서만 부른다 — 만들 때(new Arena), 이동·충돌(collide·steer·playerVelocity·speedMul), 매 프레임(update).
// 시간은 씬의 게임 시간(멈춤 제외)을 받는다.

/** HuntScene의 Mon 중 여기서 읽고 쓰는 것만 */
export type ArenaMon = {
  id: MonsterId;
  x: number;
  y: number;
  hp: number;
  st: { maxHp: number; speed: number };
  alive: boolean;
  hidden: boolean;
  wave: number;
  boss: boolean;
  phase: number;
  sprite: Phaser.GameObjects.Sprite;
};

export type ArenaHooks = {
  /** 무적 시간·회피 무시 피해 (HuntScene.hurtPlayer) */
  hurtPlayer(dmg: number): void;
  healPlayer(amount: number): void;
  hurtMonster(m: ArenaMon, dmg: number): void;
  /** 우두머리가 부르는 졸개 (웨이브 마릿수에 들지 않는다) */
  spawnMinion(id: MonsterId, x: number, y: number, wave: number): void;
  moveMon(m: ArenaMon, dx: number, dy: number): void;
  teleport(x: number, y: number): void;
  flash(msg: string, ms: number): void;
  sfx(name: "tick" | "warn" | "slam" | "roar" | "potion", gain?: number): void;
  shake(ms: number, intensity: number): void;
  maxHp(): number;
  /** 움직임 줄이기 설정 (깜빡이는 경고를 고정 밝기로 — 어둠·바람 같은 난이도 기믹 자체는 그대로) */
  readonly reduced: boolean;
};

// ── 11/15 기믹 설정: 예전 사냥터(도서관·사막)의 숫자는 그대로, 새 지옥 사냥터는 훨씬 세게 ──

/** 정전: 처음·주기·지속(ms), 어둠 짙기, 시야 그림 (wide = 도서관, narrow = 분기 마감 — 발밑만 보인다) */
type DarkCfg = {
  first: number;
  period: [number, number];
  dur: [number, number];
  depth: number;
  vision: "wide" | "narrow";
  warnMsg: string;
  onMsg: string;
  /** 어두운 동안 우두머리가 내 자리에 하락 그래프를 내리꽂는다 */
  bossFall: boolean;
};
const DARK: Partial<Record<ZoneId, DarkCfg>> = {
  library: { first: 16_000, period: [21_000, 15_000], dur: [6000, 7000], depth: 0.95, vision: "wide", warnMsg: "불이 깜빡여요… 곧 정전!", onMsg: "정전! 내 주변만 보여요", bossFall: false },
  "quarter-close": {
    first: 12_000,
    period: [18_000, 14_000],
    dur: [7000, 8500],
    depth: 0.985,
    vision: "narrow",
    warnMsg: "형광등이 깜빡여요… 곧 자동 소등!",
    onMsg: "자동 소등! 발밑만 보여요 — 경고도 원 안에서만 보여요",
    bossFall: true,
  },
};

/**
 * 바람: [보통, 우두머리가 화난 뒤] 주기·세기(px/s). shots = 탄도 휩쓸린다, shelter = 소품 바로 뒤면 덜 밀린다,
 * gust = 세기가 출렁인다, hazeColor·haze = 화면을 덮는 색과 짙기
 */
type StormCfg = {
  first: number;
  period: [number, number];
  dur: number;
  force: [number, number];
  warnMs: number;
  hazeColor: number;
  haze: number;
  warnHaze: number;
  shots: boolean;
  shelter: boolean;
  gust: boolean;
  warnMsg: (arrow: string) => string;
};
const STORM: Partial<Record<ZoneId, StormCfg>> = {
  "homework-desert": {
    first: 18_000,
    period: [23_000, 17_000],
    dur: 6000,
    force: [55, 70],
    warnMs: 2000,
    hazeColor: 0xd8a860,
    haze: 0.52,
    warnHaze: 0.14,
    shots: false,
    shelter: false,
    gust: false,
    warnMsg: (a) => `모래 폭풍이 와요! ${a} 쪽으로 밀려요`,
  },
  "layoff-day": {
    first: 12_000,
    period: [16_000, 12_500],
    dur: 6500,
    force: [100, 122],
    warnMs: 2200,
    hazeColor: 0xf2ead3,
    haze: 0.16,
    warnHaze: 0.06,
    shots: true,
    shelter: true,
    gust: true,
    warnMsg: (a) => `서류 폭풍이 와요! ${a} 쪽으로 밀려요 — 책상·박스 바로 뒤로!`,
  },
};
/** 소품 바로 뒤(바람이 오는 쪽에 막힌 것)에 서면 이만큼만 밀린다 */
const SHELTER_MUL = 0.2;
/** 파쇄기: 이 간격마다 최대 HP의 비율만큼 (플레이어 무적 시간 450ms보다 길게) */
const SHRED_TICK_MS = 500;
const SHRED_PCT = 0.1;
const SHRED_MON_PCT = 0.08;
/** 어둠 속에서도 빛나는 몬스터 (소등되면 어둠 위에 그린다) */
const GLOW_IN_DARK = new Set<MonsterId>(["afterglow_monitor"]);

/** 바닥에 떨어지는 것 (축제장 폭죽·하락 그래프·인사 명단): 경고 타원 → 펑 */
type Shell = { x: number; y: number; at: number; fuse: number; rx: number; ry: number; pct: number; monPct: number; color: number; ring: Phaser.GameObjects.Graphics; cols: Color[] };

type Particle = { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; tw: number };

const D_FLOOR = -1000;
const D_FLAT = -800;
const D_OVERLAY = 9000;
const D_LIGHT = 9050;
const D_PARTICLE = 9100;
const D_WEATHER = 9150;
const D_DARK = 9200;

const TEX = {
  floor: (z: string, v: number) => `arena-floor-${z}-${v}`,
  prop: (k: string, v: number, f: boolean) => `arena-prop-${k}-${v}-${f ? 1 : 0}`,
  belt: "arena-belt",
  arrow: "arena-arrow",
  tunnel: "arena-tunnel",
  door: "arena-door",
  elevator: "arena-elevator",
  vine: (z: string, i: number) => `arena-vine-${z}-${i}`,
  px: "arena-px",
  vision: "arena-vision",
  visionNarrow: "arena-vision-narrow",
  soft: "arena-soft",
} as const;

function addCanvas(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  return key;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class Arena {
  readonly layout: ArenaLayout;
  readonly zone: ZoneDef;
  readonly solids: Solid[];
  private readonly flow: FlowField;
  private readonly free10: Uint8Array;
  private readonly free20: Uint8Array;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private particles: Particle[] = [];
  private prev = new WeakMap<ArenaMon, Pt>();
  private rages = new WeakMap<ArenaMon, number>();
  private auras = new Map<ArenaMon, Phaser.GameObjects.Image>();
  private lights: { img: Phaser.GameObjects.Image; base: number; flicker: boolean; emergency: boolean }[] = [];
  /** 우두머리가 화난 만큼 기믹이 세진다 (1~3) */
  private intensity = 1;
  private playerV = { x: 0, y: 0 };
  // 기믹 상태
  private belts: { r: Region; ts: Phaser.GameObjects.TileSprite; arrows: Phaser.GameObjects.Image[]; dir: number }[] = [];
  private beltFlipAt = 14_000;
  private beltWarned = false;
  private doors: { r: Region; l: Phaser.GameObjects.Image; rr: Phaser.GameObjects.Image; lamp: Phaser.GameObjects.Rectangle; x: number }[] = [];
  private doorCycle = { next: 12_000, openUntil: 0, which: -1, warned: false };
  private tunnels: Phaser.GameObjects.TileSprite[] = [];
  private pads: { r: Region; l: Phaser.GameObjects.Image; rr: Phaser.GameObjects.Image; x: number }[] = [];
  private padCool = 0;
  private padInside = -1;
  private spot: { img: Phaser.GameObjects.Image; x: number; y: number; r: number; tickAt: number } | null = null;
  private dark: { cfg: DarkCfg; hole: Phaser.GameObjects.Image; rects: Phaser.GameObjects.Rectangle[]; next: number; until: number; warned: boolean; level: number; fallAt: number } | null = null;
  private vines: { r: Region; img: Phaser.GameObjects.Image; grow: number }[] = [];
  private muds: { r: Region; glow: Phaser.GameObjects.Image; next: number; warned: boolean }[] = [];
  private storm: {
    cfg: StormCfg;
    tint: Phaser.GameObjects.Rectangle;
    next: number;
    until: number;
    wind: number;
    warned: boolean;
    level: number;
    /** 우두머리가 화난 뒤: 폭풍 도중 방향이 바뀌는 시각들 (경고했는지) */
    flips: { at: number; warned: boolean }[];
    rainAt: number;
  } | null = null;
  private shredders: { r: Region; glow: Phaser.GameObjects.Image }[] = [];
  private shredAt = 0;
  private glows = new Map<ArenaMon, Phaser.GameObjects.Image>();
  private player: Pt = { x: AW / 2, y: 150 };
  private puddles: Region[] = [];
  private disco: Phaser.GameObjects.Image[] = [];
  private shells: Shell[] = [];
  private nextShell = 4000;
  private skyBurstAt = 1500;
  private rnd: () => number;

  constructor(
    private readonly scene: Phaser.Scene,
    zoneId: ZoneId,
    seed: number,
    private readonly hooks: ArenaHooks,
  ) {
    this.zone = HUNT_ZONES[zoneId];
    this.layout = buildLayout(zoneId, seed);
    this.solids = allSolids(this.layout);
    this.flow = new FlowField(this.solids, 8);
    this.free10 = freeGrid(this.solids, 10);
    this.free20 = freeGrid(this.solids, 20);
    let s = (seed ^ 0x41524e41) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.build();
  }

  get start(): Pt {
    return this.layout.start;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  // ── 그리기 ──

  private build(): void {
    const sc = this.scene;
    const l = this.layout;
    const z = l.zone;
    sc.cameras.main.setBackgroundColor("#0b0a10");
    this.keep(sc.add.image(0, 0, addCanvas(sc, TEX.floor(z, l.variant), () => floorCanvas(l))).setOrigin(0, 0).setDepth(D_FLOOR));
    for (const p of l.props) {
      const key = addCanvas(sc, TEX.prop(p.kind, p.v ?? 0, !!p.flip), () => propCanvas(p.kind, p.v ?? 0, !!p.flip));
      const meta = PROP_META[p.kind];
      // 납작한 것(의자·벤치·카트)은 사람보다 아래, 나머지는 발밑 y로 깊이 정렬
      const flat = !meta.solid;
      this.keep(sc.add.image(Math.round(p.x), Math.round(p.y), key).setOrigin(0.5, 1).setDepth(flat ? p.y - 14 : p.y));
    }
    addCanvas(sc, TEX.px, () => {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, 2, 2);
      return c;
    });
    addCanvas(sc, TEX.soft, () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
    this.buildGimmicks();
    this.buildLighting();
    this.buildParticles();
  }

  private buildLighting(): void {
    const sc = this.scene;
    const tone = AMBIENT[this.layout.zone];
    if (tone.alpha > 0) {
      const c = Phaser.Display.Color.IntegerToColor(tone.color);
      const k = tone.alpha;
      const mixc = Phaser.Display.Color.GetColor(255 - (255 - c.red) * k, 255 - (255 - c.green) * k, 255 - (255 - c.blue) * k);
      this.keep(sc.add.rectangle(-200, -200, AW + 400, AH + 400, mixc).setOrigin(0, 0).setDepth(D_OVERLAY).setBlendMode(Phaser.BlendModes.MULTIPLY));
    }
    for (const li of this.layout.lights) {
      const base = tone.alpha > 0 ? 0.55 : 0.28;
      // 비상등은 소등(정전) 어둠 위에 그린다 — 깜깜해도 비상구 초록 불은 보인다
      const img = this.keep(
        sc.add
          .image(li.x, li.y, RTEX.glow)
          .setTint(li.color)
          .setScale(li.r / 32)
          .setAlpha(base)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(li.emergency ? D_DARK + 2 : D_LIGHT),
      );
      this.lights.push({ img, base, flicker: !!li.flicker, emergency: !!li.emergency });
    }
  }

  private buildGimmicks(): void {
    const sc = this.scene;
    const l = this.layout;
    const z = l.zone;
    for (const r of l.regions) {
      if (r.kind === "conveyor") {
        const ts = this.keep(sc.add.tileSprite(r.x, r.y, r.w, r.h, addCanvas(sc, TEX.belt, beltCanvas)).setOrigin(0, 0).setDepth(D_FLAT));
        const arrows: Phaser.GameObjects.Image[] = [];
        for (let x = r.x + 14; x < r.x + r.w - 6; x += 28) arrows.push(this.keep(sc.add.image(x, r.y + r.h / 2, addCanvas(sc, TEX.arrow, arrowCanvas)).setDepth(D_FLAT + 1).setAlpha(0.55)));
        this.belts.push({ r, ts, arrows, dir: r.dir ?? 1 });
      } else if (r.kind === "door") {
        const x = r.x + r.w / 2;
        const key = addCanvas(sc, TEX.door, doorLeafCanvas);
        const lf = this.keep(sc.add.image(x - 17, 2, key).setOrigin(0, 0).setDepth(D_FLOOR + 1));
        const rt = this.keep(sc.add.image(x, 2, key).setOrigin(0, 0).setFlipX(true).setDepth(D_FLOOR + 1));
        const lamp = this.keep(sc.add.rectangle(x - 4, 0, 8, 2, 0x3a1a1a).setOrigin(0, 0).setDepth(D_FLOOR + 2));
        this.doors.push({ r, l: lf, rr: rt, lamp, x });
      } else if (r.kind === "pad") {
        const x = r.x + r.w / 2;
        const key = addCanvas(sc, TEX.elevator, elevatorLeafCanvas);
        const lf = this.keep(sc.add.image(x - 15, 4, key).setOrigin(0, 0).setDepth(D_FLOOR + 1));
        const rt = this.keep(sc.add.image(x, 4, key).setOrigin(0, 0).setFlipX(true).setDepth(D_FLOOR + 1));
        this.pads.push({ r, l: lf, rr: rt, x });
      } else if (r.kind === "vine") {
        const img = this.keep(sc.add.image(r.x + r.w / 2, r.y + r.h / 2, addCanvas(sc, TEX.vine(z, r.id ?? 0), () => vineCanvas(r.w, r.h, (r.id ?? 0) + 7))).setDepth(D_FLAT));
        this.vines.push({ r, img, grow: 1 });
      } else if (r.kind === "mud") {
        const glow = this.keep(sc.add.image(r.x + r.w / 2, r.y + r.h / 2, TEX.soft).setDisplaySize(r.w, r.h).setTint(0xff7a2a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLAT + 2));
        this.muds.push({ r, glow, next: 7000 + (r.id ?? 0) * 2300, warned: false });
      } else if (r.kind === "puddle") this.puddles.push(r);
      else if (r.kind === "shredder") {
        // 바람이 그쪽으로 불면 붉게 달아오른다
        const glow = this.keep(sc.add.image(r.x + r.w / 2, r.y + r.h / 2, TEX.soft).setDisplaySize(r.w * 2.2, r.h * 1.1).setTint(0xff3a2a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_FLAT + 2));
        this.shredders.push({ r, glow });
      }
    }
    if (z === "subway") {
      // 창밖 터널 불빛
      const key = addCanvas(sc, TEX.tunnel, tunnelCanvas);
      for (const [x0, x1] of [[16, 90], [136, 312], [360, AW - 16]]) {
        for (let x = x0; x < x1 - 30; x += 44) this.tunnels.push(this.keep(sc.add.tileSprite(x + 2, 8, 34, 10, key).setOrigin(0, 0).setDepth(D_FLOOR + 1)));
      }
    }
    if (z === "meeting-room") {
      this.spot = { img: this.keep(sc.add.image(224, 150, TEX.soft).setTint(0xfff0b0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5).setDepth(D_FLAT + 2)), x: 224, y: 150, r: 26, tickAt: 0 };
      this.spot.img.setDisplaySize(64, 40);
    }
    const dc = DARK[z];
    if (dc) {
      // 시야 구멍 그림 (160px): wide = 도서관 그대로, narrow = 발밑 한 뼘만 (분기 마감 전날 밤)
      const key =
        dc.vision === "wide"
          ? addCanvas(sc, TEX.vision, () =>
              radial(160, [
                [0, "rgba(0,0,0,0)"],
                [0.3, "rgba(0,0,0,0)"],
                [0.62, "rgba(0,0,0,0.85)"],
                [0.71, "rgba(0,0,0,1)"],
                [1, "rgba(0,0,0,1)"],
              ]),
            )
          : addCanvas(sc, TEX.visionNarrow, () =>
              radial(160, [
                [0, "rgba(0,0,0,0)"],
                [0.22, "rgba(0,0,0,0)"],
                [0.42, "rgba(0,0,0,0.88)"],
                [0.52, "rgba(0,0,0,1)"],
                [1, "rgba(0,0,0,1)"],
              ]),
            );
      const hole = this.keep(sc.add.image(0, 0, key).setDepth(D_DARK).setAlpha(0));
      const rects = [0, 1, 2, 3].map(() => this.keep(sc.add.rectangle(0, 0, 10, 10, 0x000000).setOrigin(0, 0).setDepth(D_DARK).setAlpha(0)));
      this.dark = { cfg: dc, hole, rects, next: dc.first, until: 0, warned: false, level: 0, fallAt: 0 };
    }
    const sc0 = STORM[z];
    if (sc0) {
      const tint = this.keep(sc.add.rectangle(-200, -200, AW + 400, AH + 400, sc0.hazeColor).setOrigin(0, 0).setDepth(D_WEATHER).setAlpha(0));
      this.storm = { cfg: sc0, tint, next: sc0.first, until: 0, wind: 1, warned: false, level: 0, flips: [], rainAt: 0 };
    }
    if (z === "burnout-abyss") {
      for (const c of [0xff6ac8, 0x6ad0ff, 0xffd04a]) this.disco.push(this.keep(sc.add.image(224, 150, TEX.soft).setTint(c).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setDisplaySize(70, 46).setDepth(D_FLAT + 3)));
    }
  }

  private buildParticles(): void {
    const z = this.layout.zone;
    const n = z === "homework-desert" ? 60 : z === "layoff-day" ? 46 : z === "new-year-eve" ? 30 : 22;
    for (let i = 0; i < n; i++) this.particles.push(this.newParticle(true));
  }

  private newParticle(initial: boolean): Particle {
    const z = this.layout.zone;
    const cols = PARTICLE_COLORS[z];
    const col = cols[Math.floor(this.rnd() * cols.length)];
    const img = this.scene.add.image(0, 0, TEX.px).setTint(col).setDepth(D_PARTICLE);
    const p: Particle = { img, vx: 0, vy: 0, life: 0, max: 1, tw: this.rnd() * 6 };
    this.resetParticle(p, initial);
    return p;
  }

  private resetParticle(p: Particle, initial: boolean): void {
    const z = this.layout.zone;
    const r = this.rnd;
    let x = 12 + r() * (AW - 24);
    let y = TOP + r() * (AH - TOP - 12);
    p.max = 4000 + r() * 5000;
    p.life = initial ? r() * p.max : 0;
    p.img.setScale(0.5).setAlpha(0.4).setBlendMode(Phaser.BlendModes.NORMAL);
    switch (z) {
      case "cart-jungle":
        y = initial ? y : TOP - 4;
        p.vx = (r() - 0.5) * 12;
        p.vy = 10 + r() * 10;
        p.img.setScale(1, 0.5).setAlpha(0.85);
        break;
      case "deadline-swamp":
        p.vx = (r() - 0.5) * 8;
        p.vy = (r() - 0.5) * 8;
        p.img.setScale(0.6).setBlendMode(Phaser.BlendModes.ADD);
        break;
      case "homework-desert":
        x = initial ? x : this.storm && this.storm.wind < 0 ? AW + 4 : -4;
        p.vx = (30 + r() * 30) * (this.storm && this.storm.wind < 0 ? -1 : 1);
        p.vy = (r() - 0.5) * 4;
        p.img.setScale(1.6, 0.4).setAlpha(0.5);
        break;
      case "layoff-day":
        // 서류 조각: 평소엔 천천히 내려앉고, 폭풍이면 바람 쪽으로 날린다 (tickParticles가 속도를 키운다)
        x = initial ? x : this.storm && this.storm.wind < 0 ? AW + 4 : -4;
        p.vx = (14 + r() * 16) * (this.storm && this.storm.wind < 0 ? -1 : 1);
        p.vy = (r() - 0.3) * 6;
        p.img.setScale(1.5, 1).setAlpha(0.8);
        break;
      case "burnout-abyss":
        y = initial ? y : AH - 12;
        p.vx = (r() - 0.5) * 4;
        p.vy = -(6 + r() * 8);
        p.img.setScale(0.6).setBlendMode(Phaser.BlendModes.ADD);
        break;
      case "new-year-eve":
        y = initial ? y : TOP - 2;
        p.vx = (r() - 0.5) * 10;
        p.vy = 14 + r() * 12;
        p.img.setScale(r() < 0.5 ? 1 : 0.5, 0.5).setAlpha(0.9);
        break;
      default:
        p.vx = (r() - 0.5) * 3;
        p.vy = -(1 + r() * 3);
        p.img.setScale(0.5).setAlpha(0.35);
        break;
    }
    p.img.setPosition(x, y);
  }

  // ── 이동·충돌·길찾기 ──

  /** 장애물 밖으로 (p를 바꾼다) */
  collide(p: Pt, r: number): void {
    collide(this.solids, p, r);
  }

  /** 반지름 r로 설 수 있는 가까운 자리 (출현·순간 이동 뒤) */
  place(x: number, y: number, r: number): Pt {
    if (standable(this.solids, x, y, r)) return { x, y };
    const g = r > 10 ? this.free20 : this.free10;
    const c = nearestFree(g, x, y);
    if (c < 0) return { x, y };
    return { x: (c % COLS) * CELL + CELL / 2, y: Math.floor(c / COLS) * CELL + CELL / 2 };
  }

  /** 웨이브 출현 지점: 지도의 출현 지점 중 플레이어에게서 먼 곳 */
  edgePoint(px: number, py: number, r = 10): Pt {
    const far = this.layout.spawns.filter((s) => Math.hypot(s.x - px, s.y - py) > 90);
    const list = far.length ? far : this.layout.spawns;
    const s = list[Math.floor(Math.random() * list.length)];
    return this.place(s.x + (Math.random() - 0.5) * 10, s.y + (Math.random() - 0.5) * 8, r);
  }

  /** 쫓아가는 방향이 장애물에 막혔으면 돌아가는 방향으로 */
  steer(x: number, y: number, mx: number, my: number, tx: number, ty: number): Pt {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    if ((mx * dx + my * dy) / d < 0.3) return { x: mx, y: my };
    if (this.flow.clearLine(x, y, tx, ty)) return { x: mx, y: my };
    const f = this.flow.dirAt(x, y);
    return f ?? { x: mx, y: my };
  }

  /** 지형 감속 (늪·덩굴). 우두머리는 안 느려진다 */
  speedMul(x: number, y: number, boss = false): number {
    if (boss) return 1;
    for (const m of this.muds) if (inRegion(m.r, x, y)) return 0.6;
    for (const v of this.vines) if (inRegion(v.r, x, y, v.grow)) return 0.5;
    return 1;
  }

  /** 지형이 미는 힘 (px/s) */
  private push(x: number, y: number, now: number): Pt {
    let vx = 0;
    let vy = 0;
    for (const b of this.belts) if (inRegion(b.r, x, y)) vx += b.dir * (this.intensity > 1 ? 72 : 52);
    if (now < this.doorCycle.openUntil)
      for (const d of this.doors) {
        if ((this.doorCycle.which === -1 || d.r.id === this.doorCycle.which) && inRegion(d.r, x, y)) vy += 130;
      }
    if (this.storm && now < this.storm.until) {
      const w = this.windForce(now);
      vx += this.storm.cfg.shelter && this.sheltered(x, y, this.storm.wind) ? w * SHELTER_MUL : w;
    }
    return { x: vx, y: vy };
  }

  /** 지금 바람 (부호 = 방향, px/s). 가림막은 빼고 */
  private windForce(now: number): number {
    const s = this.storm;
    if (!s || now >= s.until) return 0;
    const base = s.cfg.force[this.intensity > 1 ? 1 : 0];
    // 돌풍: 0.85~1.15배로 출렁인다
    const gust = s.cfg.gust ? 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(now / 420)) : 1;
    return s.wind * base * gust;
  }

  /** 바람이 오는 쪽 바로 앞(10~42px)에 소품이 막고 있나 (벽은 가림막이 아니다) */
  private sheltered(x: number, y: number, dir: number): boolean {
    for (let k = 10; k <= 42; k += 8) {
      const sx = x - dir * k;
      if (sx < SIDE || sx > AW - SIDE) return false;
      for (const o of this.layout.solids) {
        if (o.t === "c" ? Math.hypot(sx - o.x, y - 3 - o.y) <= o.r : sx >= o.x && sx <= o.x + o.w && y - 3 >= o.y - 4 && y - 3 <= o.y + o.h + 4) return true;
      }
    }
    return false;
  }

  /** 탄을 휩쓰는 바람 (px/s, 가로). 서류 폭풍만 — 사막 모래 폭풍은 예전처럼 탄을 밀지 않는다 */
  shotWind(now: number): number {
    return this.storm?.cfg.shots ? this.windForce(now) : 0;
  }

  /** 소등 중이라 이 몬스터가 안 보이나 (체력 막대도 숨긴다). 어둠 속에서 빛나는 몬스터는 늘 보인다 */
  inDark(m: Pick<ArenaMon, "id" | "x" | "y">): boolean {
    const d = this.dark;
    if (!d || d.level < 0.5 || GLOW_IN_DARK.has(m.id)) return false;
    const r = d.cfg.vision === "narrow" ? 30 : 46;
    return Math.hypot(m.x - this.player.x, m.y - this.player.y) > r;
  }

  /** 플레이어 속도: 바라는 속도 + 미끄러짐 + 지형이 미는 힘 */
  playerVelocity(wx: number, wy: number, x: number, y: number, dt: number, now: number): Pt {
    const slip = this.puddles.some((r) => inRegion(r, x, y));
    if (slip) {
      const k = 1 - Math.exp(-dt * 2.2);
      this.playerV.x += (wx - this.playerV.x) * k;
      this.playerV.y += (wy - this.playerV.y) * k;
    } else {
      this.playerV.x = wx;
      this.playerV.y = wy;
    }
    const f = this.push(x, y, now);
    return { x: this.playerV.x + f.x, y: this.playerV.y + f.y };
  }

  // ── 매 프레임 ──

  update(now: number, dt: number, player: Pt, mons: readonly ArenaMon[]): void {
    this.player = { x: player.x, y: player.y };
    this.flow.update(player.x, player.y);
    this.tickMonsters(now, dt, mons);
    this.tickGimmicks(now, dt, player, mons);
    this.tickParticles(now, dt);
    if (!this.hooks.reduced) for (const l of this.lights) if (l.flicker) l.img.setAlpha(l.base * (0.85 + 0.15 * Math.sin(now / 90 + l.img.x)));
    this.tickGlows(now, mons);
  }

  /** 꺼지지 않는 모니터: 불이 켜져 있으면 흐릿하고, 소등되면 어둠 위로 또렷하게 빛난다 */
  private tickGlows(now: number, mons: readonly ArenaMon[]): void {
    const lv = this.dark?.level ?? 0;
    for (const m of mons) {
      if (!m.alive || !GLOW_IN_DARK.has(m.id)) continue;
      let img = this.glows.get(m);
      if (!img) {
        img = this.scene.add.image(m.x, m.y, TEX.soft).setTint(MONSTERS[m.id].accent).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1);
        this.glows.set(m, img);
        this.objs.push(img);
      }
      const s = MONSTERS[m.id].size;
      const lit = Math.min(1, lv / 0.8);
      img
        .setPosition(m.x, m.y - s * 0.55)
        .setDisplaySize(s * 2.6, s * 2)
        .setAlpha(m.hidden ? 0 : (0.12 + 0.5 * lit) * (this.hooks.reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 140 + m.x)));
      if (m.hidden) continue;
      m.sprite.setAlpha(0.3 + 0.7 * lit);
      if (lit > 0.3) m.sprite.setDepth(D_DARK + 1 + m.y / 1000);
    }
    for (const [m, img] of this.glows) {
      if (m.alive) continue;
      img.destroy();
      this.glows.delete(m);
    }
  }

  private tickMonsters(now: number, dt: number, mons: readonly ArenaMon[]): void {
    for (const m of mons) {
      if (!m.alive) continue;
      // 늪·덩굴: 이번 프레임에 움직인 만큼을 줄인다
      const prev = this.prev.get(m);
      const mul = this.speedMul(m.x, m.y, m.boss);
      if (prev && mul < 1 && !m.hidden) {
        m.x = prev.x + (m.x - prev.x) * mul;
        m.y = prev.y + (m.y - prev.y) * mul;
      }
      if (!m.boss && !m.hidden) {
        const f = this.push(m.x, m.y, now);
        if (f.x || f.y) {
          this.hooks.moveMon(m, f.x * dt, f.y * dt);
          collide(this.solids, m, MONSTERS[m.id].size / 2);
        }
      }
      this.prev.set(m, { x: m.x, y: m.y });
      if (m.boss) this.tickBoss(m, now);
    }
    for (const [m, img] of this.auras) {
      if (!m.alive) {
        img.destroy();
        this.auras.delete(m);
        continue;
      }
      const s = MONSTERS[m.id].size;
      img.setPosition(m.x, m.y - s * 0.35).setDisplaySize(s * 2.2, s * 1.6).setAlpha((0.25 + 0.1 * (this.rages.get(m) ?? 0)) * (0.8 + 0.2 * Math.sin(now / 160)));
    }
  }

  /** 우두머리: 붉은 기운 + 단계가 오를 때마다(최대 2번) 졸개를 부르고 기믹이 세진다 */
  private tickBoss(m: ArenaMon, now: number): void {
    if (!this.auras.has(m)) {
      const img = this.scene.add.image(m.x, m.y, TEX.soft).setTint(0xff4a3a).setBlendMode(Phaser.BlendModes.ADD).setDepth(-460);
      this.auras.set(m, img);
      this.objs.push(img);
      this.bossLook(m);
    }
    const done = this.rages.get(m) ?? 0;
    const want = Math.min(BOSS_RAGES, m.phase);
    if (want <= done) return;
    for (let k = done; k < want; k++) {
      const sm = this.zone.summon;
      for (let i = 0; i < sm.n; i++) {
        const a = (i / sm.n) * Math.PI * 2 + now / 1000;
        const p = this.place(m.x + Math.cos(a) * 26, m.y + Math.sin(a) * 18, MONSTERS[sm.id].size / 2);
        this.hooks.spawnMinion(sm.id, p.x, p.y, m.wave);
      }
    }
    this.rages.set(m, want);
    this.intensity = 1 + want;
    this.hooks.flash(`${MONSTERS[this.zone.summon.id].name} 무리가 몰려와요! 사냥터가 더 거칠어졌어요`, 1800);
  }

  /** 작은 몬스터가 우두머리로 나오면(회의실·사무실·늪) 1.6배로 키운 시트로 바꿔 우두머리답게 */
  private bossLook(m: ArenaMon): void {
    const def = MONSTERS[m.id];
    if (def.size >= 30) return;
    const src = RTEX.monster(m.id);
    const key = `${src}-boss`;
    const k = 1.6;
    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.get(src);
      const img = tex.getSourceImage() as HTMLCanvasElement;
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const x = c.getContext("2d")!;
      x.imageSmoothingEnabled = false;
      x.drawImage(img, 0, 0, c.width, c.height);
      const t = this.scene.textures.addCanvas(key, c);
      const fw = Math.round(img.height * k);
      if (t) for (let i = 0; i < Math.floor(c.width / fw); i++) t.add(i, 0, i * fw, 0, fw, fw);
    }
    m.sprite.setTexture(key, 0);
  }

  private tickGimmicks(now: number, dt: number, player: Pt, mons: readonly ArenaMon[]): void {
    const z = this.layout.zone;
    const H = this.hooks;
    const fast = this.intensity > 1;

    // 회의실: 발표 조명 안에서 HP 회복
    if (this.spot) {
      const s = this.spot;
      s.x = 224 + Math.sin(now / 6800) * 150;
      s.y = 160 + Math.sin(now / 5100 + 1) * 70;
      s.img.setPosition(s.x, s.y).setAlpha(0.42 + 0.08 * Math.sin(now / 300));
      if (Math.hypot((player.x - s.x) / 32, (player.y - s.y) / 20) <= 1 && now >= s.tickAt) {
        s.tickAt = now + 500;
        H.healPlayer(Math.max(1, Math.round(H.maxHp() * 0.012)));
      }
    }

    // 지하철: 창밖 불빛 + 문이 열리면 밀려든다
    for (const t of this.tunnels) t.tilePositionX += dt * (now < this.doorCycle.openUntil + 1500 && now > this.doorCycle.next - 6000 ? 30 : 220);
    if (this.doors.length) {
      const c = this.doorCycle;
      const period = fast ? 9000 : 13_000;
      if (!c.warned && now >= c.next - 1800) {
        c.warned = true;
        c.which = this.intensity > 1 || this.rnd() < 0.3 ? -1 : Math.floor(this.rnd() * this.doors.length);
        H.flash("이번 역은… 문이 열립니다. 문 앞을 비켜요!", 1600);
        H.sfx("warn", 0.4);
      }
      if (now >= c.next) {
        c.openUntil = now + 2600;
        c.next = now + period;
        c.warned = false;
        H.shake(120, 0.002);
      }
      const open = now < c.openUntil;
      for (const d of this.doors) {
        const mine = c.which === -1 || d.r.id === c.which;
        const warn = c.warned && mine;
        d.lamp.setFillStyle(warn ? (Math.floor(now / 150) % 2 ? 0xff3a3a : 0x5a1a1a) : open && mine ? 0x6aff8a : 0x3a1a1a);
        const k = open && mine ? Math.min(1, (2600 - (c.openUntil - now)) / 250, (c.openUntil - now) / 250) : 0;
        d.l.x = d.x - 17 - k * 14;
        d.rr.x = d.x + k * 14;
      }
    }

    // 헬스장: 러닝머신 벨트, 정해진 때마다 방향이 바뀐다 (1.5초 전 화살표가 깜빡인다)
    if (this.belts.length) {
      const period = fast ? 9000 : 14_000;
      if (!this.beltWarned && now >= this.beltFlipAt - 1500) {
        this.beltWarned = true;
        H.flash("러닝머신 방향이 바뀌어요!", 1200);
        H.sfx("tick", 0.4);
      }
      if (now >= this.beltFlipAt) {
        this.beltFlipAt = now + period;
        this.beltWarned = false;
        for (const b of this.belts) b.dir = -b.dir;
      }
      for (const b of this.belts) {
        b.ts.tilePositionX -= b.dir * dt * (fast ? 72 : 52);
        const blink = this.beltWarned && Math.floor(now / 120) % 2 === 0;
        for (const a of b.arrows) a.setFlipX(b.dir < 0).setAlpha(blink ? 1 : 0.5).setTint(blink ? 0xff5a3a : 0xffffff);
      }
    }

    // 야근 사무실: 엘리베이터 (밟으면 반대편으로)
    if (this.pads.length === 2) {
      const on = this.pads.findIndex((p) => inRegion(p.r, player.x, player.y));
      if (on < 0) this.padInside = -1;
      else if (on !== this.padInside && now >= this.padCool) {
        const to = this.pads[1 - on];
        const dest = this.place(to.x, to.r.y + to.r.h + 10, 6);
        this.padInside = 1 - on;
        this.padCool = now + 1500;
        H.teleport(dest.x, dest.y);
        H.sfx("potion", 0.5);
        H.flash("띵! 반대편 엘리베이터로", 900);
        for (const p of this.pads) {
          p.l.setData("openAt", now);
        }
      }
      for (const p of this.pads) {
        const at = (p.l.getData("openAt") as number | undefined) ?? -1e9;
        const t = now - at;
        const k = t < 0 || t > 1200 ? 0 : t < 200 ? t / 200 : t > 900 ? (1200 - t) / 300 : 1;
        p.l.x = p.x - 15 - k * 12;
        p.rr.x = p.x + k * 12;
      }
    }

    // 도서관: 정전 (깜빡임 1.5초 → 6초 어둠) · 분기 마감 전날 밤: 자동 소등 (18초마다 7초, 발밑만 보인다)
    if (this.dark) {
      const d = this.dark;
      const cfg = d.cfg;
      const period = cfg.period[fast ? 1 : 0];
      if (!d.warned && now >= d.next - 1500) {
        d.warned = true;
        H.flash(cfg.warnMsg, 1300);
        H.sfx("tick", 0.4);
      }
      if (now >= d.next) {
        d.until = now + cfg.dur[fast ? 1 : 0];
        d.next = now + period;
        d.warned = false;
        d.fallAt = now + 900;
        H.flash(cfg.onMsg, 1400);
      }
      let target = 0;
      if (now < d.until) target = cfg.depth;
      // 곧 꺼진다는 깜빡임 (움직임 줄이기면 깜빡이지 않고 반쯤 어두워진다)
      else if (d.warned) target = H.reduced ? 0.35 : Math.floor(now / 110) % 3 === 0 ? 0.6 : 0;
      d.level += (target - d.level) * Math.min(1, dt * (target > d.level ? 10 : 3));
      const hw = 80;
      const px = Math.round(player.x);
      const py = Math.round(player.y - 8);
      d.hole.setPosition(px, py).setAlpha(d.level);
      // 가운데 구멍 그림(160px) 바깥을 사각형 넷이 1px씩 겹쳐 덮는다 (틈새로 빛이 새지 않게)
      const x0 = px - hw + 1;
      const y0 = py - hw + 1;
      const hw2 = hw * 2 - 2;
      const [a, b, c2, e] = d.rects;
      a.setPosition(-200, -200).setSize(AW + 400, y0 + 200).setAlpha(d.level);
      b.setPosition(-200, y0 + hw2).setSize(AW + 400, AH + 200 - (y0 + hw2)).setAlpha(d.level);
      c2.setPosition(-200, y0 - 1).setSize(x0 + 200, hw2 + 2).setAlpha(d.level);
      e.setPosition(x0 + hw2, y0 - 1).setSize(AW + 200 - (x0 + hw2), hw2 + 2).setAlpha(d.level);
      for (const l of this.lights) if (!l.emergency) l.img.setVisible(d.level < 0.5);
      // 어둠 속 우두머리: 내 자리에 하락 그래프를 내리꽂는다 (경고 타원도 어둠에 가려 발밑 원 안에서만 보인다)
      if (cfg.bossFall && now < d.until && now >= d.fallAt && mons.some((m) => m.alive && m.boss)) {
        d.fallAt = now + (this.intensity >= 3 ? 600 : fast ? 720 : 900);
        const near = this.rnd() < 0.6;
        const a = this.rnd() * Math.PI * 2;
        const r = near ? this.rnd() * 14 : 18 + this.rnd() * 36;
        this.dropShell(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r * 0.7, now, { fuse: 1000, rx: 24, ry: 15, pct: 0.12, monPct: 0, color: 0xff4a3a, cols: [0xd03030, 0xff6a4a, 0xf2f2ee] });
      }
    }

    // 장바구니 정글: 덩굴이 숨 쉬듯 커졌다 작아진다
    for (const v of this.vines) {
      v.grow = 0.8 + 0.3 * (0.5 + 0.5 * Math.sin(now / 2600 + (v.r.id ?? 0) * 1.7)) + (fast ? 0.1 : 0);
      v.img.setScale(v.grow);
    }

    // 결재 늪: 거품이 커지다(1.6초) 끓어오른다 — 안에 있으면 다친다
    for (const m of this.muds) {
      const period = fast ? 7000 : 9500;
      const left = m.next - now;
      m.glow.setAlpha(left < 1600 ? (1 - left / 1600) * (0.55 + 0.25 * Math.sin(now / 60)) : Math.max(0, m.glow.alpha - dt * 2));
      if (left < 1600 && this.rnd() < dt * 18) this.bubble(m.r);
      else if (this.rnd() < dt * 1.5) this.bubble(m.r);
      if (left <= 0) {
        m.next = now + period;
        H.sfx("slam", 0.35);
        if (inRegion(m.r, player.x, player.y)) H.hurtPlayer(Math.max(1, Math.round(H.maxHp() * 0.08)));
        for (const mon of mons) if (mon.alive && !mon.boss && inRegion(m.r, mon.x, mon.y)) H.hurtMonster(mon, Math.max(1, Math.round(mon.st.maxHp * 0.12)));
        for (let i = 0; i < 6; i++) this.bubble(m.r, true);
      }
    }

    // 방학 숙제 사막: 모래 폭풍 · 구조조정 발표 날: 서류 폭풍 (더 세고, 탄도 휩쓸리고, 화나면 도중에 방향이 바뀐다)
    if (this.storm) {
      const s = this.storm;
      const cfg = s.cfg;
      const period = cfg.period[fast ? 1 : 0];
      if (!s.warned && now >= s.next - cfg.warnMs) {
        s.warned = true;
        s.wind = this.rnd() < 0.5 ? -1 : 1;
        H.flash(cfg.warnMsg(s.wind > 0 ? "→" : "←"), 1800);
        H.sfx("warn", 0.4);
      }
      if (now >= s.next) {
        s.until = now + cfg.dur;
        s.next = now + period;
        s.warned = false;
        s.rainAt = now + 700;
        // 서류 폭풍만: 우두머리가 한 번 화나면 한 번, 두 번 화나면 두 번 방향이 뒤집힌다 (뒤집히기 0.9초 전에 알린다)
        s.flips = cfg.shots && this.intensity >= 2 ? (this.intensity >= 3 ? [2200, 4400] : [3300]).map((t) => ({ at: now + t, warned: false })) : [];
      }
      for (const fl of s.flips) {
        if (!fl.warned && now >= fl.at - 900) {
          fl.warned = true;
          H.flash(`바람이 뒤집혀요! ${s.wind > 0 ? "←" : "→"}`, 900);
          H.sfx("tick", 0.5);
        }
        if (fl.at <= now) s.wind = -s.wind;
      }
      s.flips = s.flips.filter((fl) => fl.at > now);
      const blowing = now < s.until;
      const wob = H.reduced && cfg.shots ? 0 : 1;
      const target = blowing ? cfg.haze + 0.06 * wob * Math.sin(now / 130) * (cfg.haze / 0.52) : s.warned ? cfg.warnHaze + 0.08 * wob * Math.sin(now / 80) * (cfg.warnHaze / 0.14) : 0;
      s.level += (target - s.level) * Math.min(1, dt * 3);
      s.tint.setAlpha(s.level);
      // 우두머리: 바람 아래쪽(밀려 갈 자리)에 해고 명단을 내리꽂는다 → 바람을 거슬러 버텨야 한다
      if (cfg.shots && blowing && now >= s.rainAt && mons.some((m) => m.alive && m.boss)) {
        s.rainAt = now + (this.intensity >= 3 ? 480 : fast ? 560 : 700);
        const ahead = 34 + this.rnd() * 54;
        this.dropShell(player.x + s.wind * ahead, player.y + (this.rnd() - 0.5) * 70, now, { fuse: 900, rx: 22, ry: 14, pct: 0.11, monPct: 0, color: 0xff4a3a, cols: [0xf2ead3, 0xc83c3c, 0xffffff] });
      }
    }

    // 구조조정 발표 날: 벽의 문서 파쇄기 (밀려 들어가면 크게 다친다 — 몬스터도 갈린다)
    if (this.shredders.length) {
      const st = this.storm;
      const blowing = !!st && now < st.until;
      for (const sh of this.shredders) {
        const left = sh.r.x < AW / 2;
        const downwind = blowing && (left ? st!.wind < 0 : st!.wind > 0);
        const warnSide = !!st && st.warned && (left ? st.wind < 0 : st.wind > 0);
        const want = downwind ? 0.55 : warnSide ? (H.reduced ? 0.3 : 0.25 + 0.2 * Math.sin(now / 90)) : 0.08;
        sh.glow.setAlpha(sh.glow.alpha + (want - sh.glow.alpha) * Math.min(1, dt * 6));
      }
      if (now >= this.shredAt) {
        this.shredAt = now + SHRED_TICK_MS;
        const inShred = (x: number, y: number) => this.shredders.some((sh) => inRegion(sh.r, x, y));
        if (inShred(player.x, player.y)) {
          H.hurtPlayer(Math.max(1, Math.round(H.maxHp() * SHRED_PCT)));
          H.sfx("tick", 0.5);
          for (let i = 0; i < 3; i++) this.paperBit(player.x, player.y - 6);
        }
        for (const mon of mons) if (mon.alive && !mon.boss && !mon.hidden && inShred(mon.x, mon.y)) H.hurtMonster(mon, Math.max(1, Math.round(mon.st.maxHp * SHRED_MON_PCT)));
      }
    }

    // 회식 3차: 빙글빙글 사이키 조명
    this.disco.forEach((img, i) => {
      const a = now / 1400 + (i * Math.PI * 2) / 3;
      img.setPosition(224 + Math.cos(a) * 130, 160 + Math.sin(a * 1.3) * 70);
    });

    // 축제장: 폭죽 (경고 원 1.3초 → 펑) + 하늘의 불꽃
    if (z === "new-year-eve") {
      const gap = this.intensity >= 3 ? 1300 : this.intensity === 2 ? 1800 : 2600;
      if (now >= this.nextShell) {
        this.nextShell = now + gap * (0.8 + this.rnd() * 0.4);
        const near = this.rnd() < 0.55;
        const tx = near ? player.x + (this.rnd() - 0.5) * 70 : 30 + this.rnd() * (AW - 60);
        const ty = near ? player.y + (this.rnd() - 0.5) * 50 : TOP + 20 + this.rnd() * (AH - TOP - 40);
        this.dropShell(tx, ty, now, { fuse: 1300, rx: 24, ry: 15, pct: 0.1, monPct: 0.25, color: 0xff4a3a, cols: PARTICLE_COLORS["new-year-eve"] });
      }
      if (now >= this.skyBurstAt) {
        this.skyBurstAt = now + 700 + this.rnd() * 1200;
        this.burst(20 + this.rnd() * (AW - 40), 4 + this.rnd() * 14, 10, true);
      }
    }
    this.tickShells(now, player, mons);
  }

  /** 바닥에 떨어질 것 하나 (경고 타원이 fuse ms 동안 차오른다). 지도 밖이면 안쪽으로 */
  private dropShell(x: number, y: number, now: number, o: Omit<Shell, "x" | "y" | "at" | "ring">): void {
    const ring = this.keep(this.scene.add.graphics().setDepth(-440));
    this.shells.push({ ...o, x: Phaser.Math.Clamp(x, 20, AW - 20), y: Phaser.Math.Clamp(y, TOP + 10, AH - 16), at: now + o.fuse, ring });
  }

  private tickShells(now: number, player: Pt, mons: readonly ArenaMon[]): void {
    const H = this.hooks;
    for (const s of this.shells) {
      const left = s.at - now;
      const p = 1 - Math.max(0, left) / s.fuse;
      s.ring.clear();
      s.ring.lineStyle(1, s.color, 0.9).strokeEllipse(s.x, s.y, s.rx * 2, s.ry * 2);
      s.ring.fillStyle(s.color, 0.12 + 0.25 * smooth(p)).fillEllipse(s.x, s.y, s.rx * 2 * p, s.ry * 2 * p);
      if (left <= 0) {
        this.burst(s.x, s.y - 4, 18, false, s.cols);
        H.sfx("slam", 0.4);
        H.shake(70, 0.002);
        if (Math.hypot((player.x - s.x) / s.rx, (player.y - s.y) / s.ry) <= 1) H.hurtPlayer(Math.max(1, Math.round(H.maxHp() * s.pct)));
        if (s.monPct > 0)
          for (const mon of mons)
            if (mon.alive && Math.hypot((mon.x - s.x) / s.rx, (mon.y - s.y) / s.ry) <= 1) H.hurtMonster(mon, Math.max(1, Math.round(mon.st.maxHp * (mon.boss ? 0.03 : s.monPct))));
        s.ring.destroy();
      }
    }
    this.shells = this.shells.filter((s) => s.at > now);
  }

  /** 파쇄기에서 튀는 종이 조각 */
  private paperBit(x: number, y: number): void {
    const img = this.scene.add.image(x, y, TEX.px).setTint(0xf2ead3).setDepth(D_PARTICLE).setScale(1.5, 1);
    const a = this.rnd() * Math.PI * 2;
    this.scene.tweens.add({ targets: img, x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 8 - 6, alpha: 0, angle: 180, duration: 420, onComplete: () => img.destroy() });
  }

  private bubble(r: Region, big = false): void {
    const a = this.rnd() * Math.PI * 2;
    const rr = Math.sqrt(this.rnd()) * 0.8;
    const x = r.x + r.w / 2 + Math.cos(a) * rr * (r.w / 2);
    const y = r.y + r.h / 2 + Math.sin(a) * rr * (r.h / 2);
    const img = this.scene.add.image(x, y, TEX.px).setTint(big ? 0xffa060 : 0x8a8a5a).setDepth(D_FLAT + 3).setScale(big ? 1.5 : 1);
    this.scene.tweens.add({ targets: img, y: y - (big ? 10 : 4), scale: big ? 2.5 : 1.6, alpha: 0, duration: big ? 500 : 700, onComplete: () => img.destroy() });
  }

  private burst(x: number, y: number, n: number, sky = false, cols: readonly Color[] = PARTICLE_COLORS["new-year-eve"]): void {
    const col = cols[Math.floor(this.rnd() * cols.length)];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = (sky ? 10 : 22) + this.rnd() * 10;
      const img = this.scene.add.image(x, y, TEX.px).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(sky ? D_FLOOR + 3 : D_PARTICLE);
      this.scene.tweens.add({ targets: img, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp * (sky ? 0.7 : 0.6) + (sky ? 3 : 0), alpha: 0, duration: 520 + this.rnd() * 200, onComplete: () => img.destroy() });
    }
    if (!sky) {
      const g = this.scene.add.image(x, y, TEX.soft).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_LIGHT).setDisplaySize(60, 40);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 380, onComplete: () => g.destroy() });
    }
  }

  private tickParticles(now: number, dt: number): void {
    const z = this.layout.zone;
    const storming = !!this.storm && now < this.storm.until;
    const wdir = this.storm && this.storm.wind < 0 ? -1 : 1;
    for (const p of this.particles) {
      p.life += dt * 1000;
      const sp = storming ? 4 : 1;
      p.img.x += p.vx * dt * sp;
      p.img.y += p.vy * dt;
      if (z === "deadline-swamp") p.img.setAlpha(0.3 + 0.7 * Math.max(0, Math.sin(now / 400 + p.tw)));
      else if (z === "cart-jungle" || z === "new-year-eve") p.img.x += Math.sin(now / 500 + p.tw) * dt * 6;
      // 서류 폭풍: 조각이 바람 방향으로 세차게 (도중에 방향이 바뀌면 같이 돈다)
      if (z === "layoff-day") {
        if (storming && Math.sign(p.vx) !== wdir) p.vx = -p.vx;
        p.img.x += (storming ? 150 : 0) * wdir * dt;
        p.img.y += Math.sin(now / 300 + p.tw) * dt * (storming ? 30 : 8);
        p.img.setAngle((now / 4 + p.tw * 60) % 360);
      }
      if (p.life > p.max || p.img.x < -10 || p.img.x > AW + 10 || p.img.y < TOP - 8 || p.img.y > AH) this.resetParticle(p, false);
      // 모래 폭풍: 줄기가 바람 방향으로 길고 진해진다
      if (z === "homework-desert") p.img.setScale(storming ? 4 : 1.6, storming ? 0.5 : 0.4).setAlpha(storming ? 0.8 : 0.5).setFlipX(false);
    }
  }

  destroy(): void {
    for (const p of this.particles) p.img.destroy();
    this.particles = [];
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.auras.clear();
    this.glows.clear();
  }
}
