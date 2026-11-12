import * as Phaser from "phaser";
import { HUNT_ZONES, MONSTERS, type MonsterId, type ZoneDef, type ZoneId } from "@/lib/rpg/catalog";
import { BOSS_RAGES } from "@/lib/rpg/plan";
import { radial } from "../../sprites/pixel";
import { RTEX } from "../sprites";
import { AMBIENT, arrowCanvas, beltCanvas, doorLeafCanvas, elevatorLeafCanvas, floorCanvas, PARTICLE_COLORS, propCanvas, tunnelCanvas, vineCanvas } from "./art";
import { AH, allSolids, AW, buildLayout, collide, COLS, CELL, FlowField, freeGrid, inRegion, nearestFree, PROP_META, standable, TOP, type ArenaLayout, type Pt, type Region, type Solid } from "./layout";

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
};

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
  private lights: { img: Phaser.GameObjects.Image; base: number; flicker: boolean }[] = [];
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
  private dark: { hole: Phaser.GameObjects.Image; rects: Phaser.GameObjects.Rectangle[]; next: number; until: number; warned: boolean; level: number } | null = null;
  private vines: { r: Region; img: Phaser.GameObjects.Image; grow: number }[] = [];
  private muds: { r: Region; glow: Phaser.GameObjects.Image; next: number; warned: boolean }[] = [];
  private storm: { tint: Phaser.GameObjects.Rectangle; next: number; until: number; wind: number; warned: boolean; level: number } | null = null;
  private puddles: Region[] = [];
  private disco: Phaser.GameObjects.Image[] = [];
  private shells: { x: number; y: number; at: number; ring: Phaser.GameObjects.Graphics }[] = [];
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
      const img = this.keep(sc.add.image(li.x, li.y, RTEX.glow).setTint(li.color).setScale(li.r / 32).setAlpha(base).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_LIGHT));
      this.lights.push({ img, base, flicker: !!li.flicker });
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
    if (z === "library") {
      const key = addCanvas(sc, TEX.vision, () =>
        radial(160, [
          [0, "rgba(0,0,0,0)"],
          [0.3, "rgba(0,0,0,0)"],
          [0.62, "rgba(0,0,0,0.85)"],
          [0.71, "rgba(0,0,0,1)"],
          [1, "rgba(0,0,0,1)"],
        ]),
      );
      const hole = this.keep(sc.add.image(0, 0, key).setDepth(D_DARK).setAlpha(0));
      const rects = [0, 1, 2, 3].map(() => this.keep(sc.add.rectangle(0, 0, 10, 10, 0x000000).setOrigin(0, 0).setDepth(D_DARK).setAlpha(0)));
      this.dark = { hole, rects, next: 16_000, until: 0, warned: false, level: 0 };
    }
    if (z === "homework-desert") {
      const tint = this.keep(sc.add.rectangle(-200, -200, AW + 400, AH + 400, 0xd8a860).setOrigin(0, 0).setDepth(D_WEATHER).setAlpha(0));
      this.storm = { tint, next: 18_000, until: 0, wind: 1, warned: false, level: 0 };
    }
    if (z === "burnout-abyss") {
      for (const c of [0xff6ac8, 0x6ad0ff, 0xffd04a]) this.disco.push(this.keep(sc.add.image(224, 150, TEX.soft).setTint(c).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setDisplaySize(70, 46).setDepth(D_FLAT + 3)));
    }
  }

  private buildParticles(): void {
    const n = this.layout.zone === "homework-desert" ? 60 : this.layout.zone === "new-year-eve" ? 30 : 22;
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
    if (this.storm && now < this.storm.until) vx += this.storm.wind * (this.intensity > 1 ? 70 : 55);
    return { x: vx, y: vy };
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
    this.flow.update(player.x, player.y);
    this.tickMonsters(now, dt, mons);
    this.tickGimmicks(now, dt, player, mons);
    this.tickParticles(now, dt);
    for (const l of this.lights) if (l.flicker) l.img.setAlpha(l.base * (0.85 + 0.15 * Math.sin(now / 90 + l.img.x)));
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

    // 도서관: 정전 (깜빡임 1.5초 → 6초 어둠)
    if (this.dark) {
      const d = this.dark;
      const period = fast ? 15_000 : 21_000;
      if (!d.warned && now >= d.next - 1500) {
        d.warned = true;
        H.flash("불이 깜빡여요… 곧 정전!", 1300);
        H.sfx("tick", 0.4);
      }
      if (now >= d.next) {
        d.until = now + (fast ? 7000 : 6000);
        d.next = now + period;
        d.warned = false;
        H.flash("정전! 내 주변만 보여요", 1400);
      }
      let target = 0;
      if (now < d.until) target = 0.95;
      else if (d.warned) target = Math.floor(now / 110) % 3 === 0 ? 0.6 : 0;
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
      for (const l of this.lights) l.img.setVisible(d.level < 0.5);
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

    // 방학 숙제 사막: 모래 폭풍
    if (this.storm) {
      const s = this.storm;
      const period = fast ? 17_000 : 23_000;
      if (!s.warned && now >= s.next - 2000) {
        s.warned = true;
        s.wind = this.rnd() < 0.5 ? -1 : 1;
        H.flash(`모래 폭풍이 와요! ${s.wind > 0 ? "→" : "←"} 쪽으로 밀려요`, 1800);
        H.sfx("warn", 0.4);
      }
      if (now >= s.next) {
        s.until = now + 6000;
        s.next = now + period;
        s.warned = false;
      }
      const target = now < s.until ? 0.52 + 0.06 * Math.sin(now / 130) : s.warned ? 0.14 + 0.08 * Math.sin(now / 80) : 0;
      s.level += (target - s.level) * Math.min(1, dt * 3);
      s.tint.setAlpha(s.level);
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
        const ring = this.keep(this.scene.add.graphics().setDepth(-440));
        this.shells.push({ x: Phaser.Math.Clamp(tx, 20, AW - 20), y: Phaser.Math.Clamp(ty, TOP + 10, AH - 16), at: now + 1300, ring });
      }
      for (const s of this.shells) {
        const left = s.at - now;
        const p = 1 - Math.max(0, left) / 1300;
        s.ring.clear();
        s.ring.lineStyle(1, 0xff4a3a, 0.9).strokeEllipse(s.x, s.y, 48, 30);
        s.ring.fillStyle(0xff4a3a, 0.12 + 0.25 * smooth(p)).fillEllipse(s.x, s.y, 48 * p, 30 * p);
        if (left <= 0) {
          this.burst(s.x, s.y - 4, 18);
          H.sfx("slam", 0.4);
          H.shake(70, 0.002);
          if (Math.hypot((player.x - s.x) / 24, (player.y - s.y) / 15) <= 1) H.hurtPlayer(Math.max(1, Math.round(H.maxHp() * 0.1)));
          for (const mon of mons)
            if (mon.alive && Math.hypot((mon.x - s.x) / 24, (mon.y - s.y) / 15) <= 1) H.hurtMonster(mon, Math.max(1, Math.round(mon.st.maxHp * (mon.boss ? 0.03 : 0.25))));
          s.ring.destroy();
        }
      }
      this.shells = this.shells.filter((s) => s.at > now);
      if (now >= this.skyBurstAt) {
        this.skyBurstAt = now + 700 + this.rnd() * 1200;
        this.burst(20 + this.rnd() * (AW - 40), 4 + this.rnd() * 14, 10, true);
      }
    }
  }

  private bubble(r: Region, big = false): void {
    const a = this.rnd() * Math.PI * 2;
    const rr = Math.sqrt(this.rnd()) * 0.8;
    const x = r.x + r.w / 2 + Math.cos(a) * rr * (r.w / 2);
    const y = r.y + r.h / 2 + Math.sin(a) * rr * (r.h / 2);
    const img = this.scene.add.image(x, y, TEX.px).setTint(big ? 0xffa060 : 0x8a8a5a).setDepth(D_FLAT + 3).setScale(big ? 1.5 : 1);
    this.scene.tweens.add({ targets: img, y: y - (big ? 10 : 4), scale: big ? 2.5 : 1.6, alpha: 0, duration: big ? 500 : 700, onComplete: () => img.destroy() });
  }

  private burst(x: number, y: number, n: number, sky = false): void {
    const cols = PARTICLE_COLORS["new-year-eve"];
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
    for (const p of this.particles) {
      p.life += dt * 1000;
      const sp = storming ? 4 : 1;
      p.img.x += p.vx * dt * sp;
      p.img.y += p.vy * dt;
      if (z === "deadline-swamp") p.img.setAlpha(0.3 + 0.7 * Math.max(0, Math.sin(now / 400 + p.tw)));
      else if (z === "cart-jungle" || z === "new-year-eve") p.img.x += Math.sin(now / 500 + p.tw) * dt * 6;
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
  }
}
