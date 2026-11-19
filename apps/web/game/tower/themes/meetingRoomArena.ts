import * as Phaser from "phaser";
import { foldMultiply } from "./overlay";
import { MONSTERS } from "@/lib/rpg/catalog";
import { seeded } from "@/lib/rpg/formulas";
import { towerBlock } from "@/lib/rpg/tower";
import { clockText, meetingClock, meetingTime, mtNextSide, mtShrink, mtShrinkEvery, mtShrinkStep, type MtRoom, type MtSide, type MtTime } from "@/lib/rpg/towerThemes/meetingRoom";
import { RTEX } from "../../rpg/sprites";
import type { ArenaHooks, ArenaMon } from "../../rpg/arena/Arena";
import type { ArenaLayout, Pt } from "../../rpg/arena/layout";
import { bankTileCanvas, hazardCanvas, mtBackgroundCanvas, mtBoards, mtClockAt, mtFurnCanvas, mtWindows, pillarCanvas, puddleCanvas, stripesCanvas, type MtView } from "./meetingRoomArt";
import { MT_ROOM_NAMES, MT_ROOM_TYPES, mtRoomPlan, type MtRoomPlan } from "./meetingRoomMap";
// 11/17 겨울판·크리스마스판: 창밖 눈(지붕 눈·서리·창턱 눈, 비 대신 눈) · 가구 손질(담요·책상 트리·전구)
import type { MapConcept } from "@/lib/mapConcept";
import { dressProp, PROP_PAD, windowWinter, type Rect } from "../../rpg/arena/conceptArt";
import { bulbGlow } from "../../rpg/arena/conceptStage";
import { conceptSuffix } from "../../sprites/winterScenery";

// 11/15 끝없는 회의실 지도 실행부 (arena/Arena가 이 테마 층마다 하나 만든다):
//  - 층마다 다른 바닥 그림 한 장 (방 종류·카펫·뒷벽·창밖 때와 비·층 번호판) + 가구 + 때마다 다른 빛 (노을 줄무늬·야근 형광등·새벽 푸른빛)
//  - 움직이는 벽: 벽시계 바늘(층마다 25분씩), 저절로 그려지는 화이트보드 그래프, 교육장 슬라이드, 주재자 대형 화면, 창의 빗줄기
//  - 기믹 「회의 연장」: 바닥 노란 줄 경고 → 가장자리 테이블 줄이 밀려와 방이 좁아진다 (움직이는 테이블에 닿으면 밀리고 다친다)
//  - 몬스터 행동(meetingRoomRuntime)이 쓰는 지형: 마커 선 벽(나만 막는다)·커피 웅덩이(느려진다)·하울링 밀침

const D_BG = -999;
const D_BOARD = -990;
const D_HAZARD = -795;
const D_SIDE_BANK = 420;
const D_OVERLAY = 9000;
const D_LIGHT = 9050;

/** 때마다 화면을 곱하기로 덮는 색 · 빛줄기 색과 세기 */
const TONE: Record<MtTime, { mul: number; stripe: number; stripeA: number }> = {
  sunset: { mul: 0xf4d8c4, stripe: 0xff9a40, stripeA: 0.24 },
  night: { mul: 0x6a78b0, stripe: 0x000000, stripeA: 0 },
  dawn: { mul: 0x90a4d4, stripe: 0x7aa0ff, stripeA: 0.1 },
  sunrise: { mul: 0xf4dce0, stripe: 0xffb0a0, stripeA: 0.2 },
  day: { mul: 0xffffff, stripe: 0xfff4d8, stripeA: 0.1 },
};

const SLIDE_MS = 700;
const WARN_MS = 2000;
/** 움직이는 테이블에 치이면 (한 번 밀려올 때 한 번) */
const TABLE_HIT_PCT = 0.07;
const TABLE_MON_PCT = 0.06;

type Wall = { x0: number; y0: number; x1: number; y1: number; until: number };
type Puddle = { x: number; y: number; until: number; img: Phaser.GameObjects.Image };

/** 같은 씬의 회의실 지도 (meetingRoomRuntime이 찾아 쓴다) */
export const MT_ARENAS = new WeakMap<Phaser.Scene, MeetingArena>();

export class MeetingArena {
  readonly plan: MtRoomPlan;
  readonly view: MtView;
  readonly loop: number;
  readonly clock0: number;
  /** 처음 방 (밀려오기 기준) · 지금 방 (밀려오는 중이면 움직이는 중간값) */
  readonly full: MtRoom;
  room: MtRoom;
  private settled: MtRoom;
  private slide: { from: MtRoom; to: MtRoom; at: number; side: MtSide; hitP: boolean; hitM: Set<ArenaMon> } | null = null;
  private warn: { at: number; side: MtSide; to: MtRoom; forced: boolean } | null = null;
  private nextAt = -1;
  private t0 = -1;
  private shrinks = 0;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly banks: Record<MtSide, Phaser.GameObjects.TileSprite>;
  private readonly bankEdge: Phaser.GameObjects.Graphics;
  private readonly hazard: Phaser.GameObjects.TileSprite;
  private readonly hands: Phaser.GameObjects.Graphics;
  private readonly board: Phaser.GameObjects.Graphics;
  private readonly rain: Phaser.GameObjects.Graphics | null;
  private readonly walls: Wall[] = [];
  private readonly wallG: Phaser.GameObjects.Graphics;
  private readonly puddles: Puddle[] = [];
  private stripes: Phaser.GameObjects.Image | null = null;
  private boardAt = 0;
  private kickV = { x: 0, y: 0 };
  /** 의견 없음처럼 지금 안 보이는 몬스터 (체력 막대도 숨긴다) */
  readonly veiled = new WeakSet<object>();
  private rnd: () => number;
  private player: Pt = { x: 224, y: 200 };

  constructor(
    private readonly scene: Phaser.Scene,
    layout: ArenaLayout,
    readonly seed: number,
    readonly floor: number,
    readonly runSeed: number,
    private readonly hooks: ArenaHooks,
    /** 11/15 판 시작 층 (테마 순서가 판마다 다르다 — 회의실에 몇 번째로 왔는지) */
    readonly start = 1,
    /** 11/17 맵 컨셉 */
    private readonly concept: MapConcept = "default",
  ) {
    MT_ARENAS.set(scene, this);
    this.plan = mtRoomPlan(MT_ROOM_TYPES[layout.variant % MT_ROOM_TYPES.length], seed);
    this.rnd = seeded((seed ^ 0x53485249) >>> 0);
    const at = towerBlock(runSeed, start, floor);
    this.clock0 = meetingClock(at.pos, at.visit);
    this.loop = at.visit;
    // 비는 바깥이 보이는 방에서만 (거울 유리·교육장 스크린 벽은 창이 없다)
    this.view = { time: meetingTime(this.clock0), rain: this.rnd() < 0.3 && mtWindows(this.plan.wall).length > 0, snow: concept !== "default" };
    this.full = { ...this.plan.room0 };
    this.room = { ...this.full };
    this.settled = { ...this.full };
    const sc = scene;
    const key = `mt-bg-${floor}-${seed}${conceptSuffix(concept)}`;
    if (!sc.textures.exists(key)) {
      const bg = mtBackgroundCanvas(this.plan, floor, this.view, seed & 0xffff);
      // 11/17 겨울: 창마다 서리·창턱 눈·종이 눈송이
      if (this.view.snow) for (const [i, w] of mtWindows(this.plan.wall).entries()) windowWinter(bg.getContext("2d", { willReadFrequently: true })!, w, { night: this.view.time === "night", salt: 500 + i * 7 + (seed & 31), paper: true });
      sc.textures.addCanvas(key, bg);
    }
    this.keep(sc.add.image(0, 0, key).setOrigin(0, 0).setDepth(D_BG));
    this.buildFurniture();
    this.buildLight();
    // 밀려오는 테이블 줄 (처음엔 0)
    const tex = (k: string, make: () => HTMLCanvasElement) => {
      if (!sc.textures.exists(k)) sc.textures.addCanvas(k, make());
      return k;
    };
    const hk = tex("mt-bank-h", () => bankTileCanvas(true));
    const vk = tex("mt-bank-v", () => bankTileCanvas(false));
    this.banks = {
      left: this.keep(sc.add.tileSprite(this.full.x0, this.full.y0, 1, 1, vk).setOrigin(0, 0).setDepth(D_SIDE_BANK).setVisible(false)),
      right: this.keep(sc.add.tileSprite(this.full.x1, this.full.y0, 1, 1, vk).setOrigin(0, 0).setDepth(D_SIDE_BANK).setVisible(false)),
      top: this.keep(sc.add.tileSprite(this.full.x0, this.full.y0, 1, 1, hk).setOrigin(0, 0).setDepth(this.full.y0).setVisible(false)),
      bottom: this.keep(sc.add.tileSprite(this.full.x0, this.full.y1, 1, 1, hk).setOrigin(0, 0).setDepth(D_SIDE_BANK).setFlipY(true).setVisible(false)),
    };
    this.bankEdge = this.keep(sc.add.graphics().setDepth(D_SIDE_BANK + 1));
    this.hazard = this.keep(sc.add.tileSprite(0, 0, 1, 1, tex("mt-hazard", hazardCanvas)).setOrigin(0, 0).setDepth(D_HAZARD).setVisible(false));
    this.hands = this.keep(sc.add.graphics().setDepth(D_BOARD));
    this.board = this.keep(sc.add.graphics().setDepth(D_BOARD));
    // 11/17 겨울·크리스마스판은 창이 있으면 늘 눈이 내린다
    this.rain = (this.view.rain || this.view.snow) && mtWindows(this.plan.wall).length ? this.keep(sc.add.graphics().setDepth(D_BOARD + 1)) : null;
    this.wallG = this.keep(sc.add.graphics().setDepth(-470));
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  /** 층 이름 (입장 안내): "17:25 · 노을 회의 · 교육장" */
  get title(): string {
    return `${clockText(this.clock0)} · ${MT_ROOM_NAMES[this.plan.type]}${this.view.rain ? (this.view.snow ? " · 눈" : " · 비") : ""}`;
  }

  // ── 그리기 ──

  private buildFurniture(): void {
    const sc = this.scene;
    for (const f of this.plan.furn) {
      if (f.kind === "pillar") {
        const k = `mt-pillar-${f.w}`;
        if (!sc.textures.exists(k)) sc.textures.addCanvas(k, pillarCanvas(f.w / 2));
        this.keep(sc.add.image(f.x, f.y + 3, k).setOrigin(0.5, 1).setDepth(f.y));
        continue;
      }
      const k = `mt-furn-${f.kind}-${f.w}-${f.h}-${f.v ?? 0}-${f.flip ? 1 : 0}${conceptSuffix(this.concept)}`;
      let ox = 0;
      let oy = 0;
      if (!sc.textures.exists(k)) {
        const c = mtFurnCanvas(f);
        // 11/17 겨울·크리스마스판 가구 손질 (위로 PROP_PAD만큼 큰 그림 — 원점을 그만큼 내린다)
        const d = this.concept === "default" ? null : dressProp(c.canvas, `mt_${f.kind}`, f.v ?? 0, !!f.flip, "mt_meeting", this.concept);
        sc.textures.addCanvas(k, d ? d.canvas : c.canvas);
        sc.textures.get(k).customData = { ox: c.ox, oy: c.oy + (d ? PROP_PAD : 0), bulbs: d?.bulbs ?? [] };
      }
      const cd = sc.textures.get(k).customData as { ox: number; oy: number; bulbs?: { x: number; y: number; c: number }[] };
      ox = cd.ox;
      oy = cd.oy;
      const img = sc.add.image(Math.round(f.x - ox), Math.round(f.y - (f.circle ? 0 : 0) - oy), k).setOrigin(0, 0);
      if (cd.bulbs?.length) {
        const src = sc.textures.get(k).getSourceImage() as HTMLCanvasElement;
        const g = bulbGlow(sc, k, src.width, src.height, cd.bulbs, [], img.x, img.y, 0, 0, { reduced: this.hooks.reduced, alpha: 0.7 });
        if (g) this.keep(g);
      }
      // 의자·러그처럼 납작한 것은 사람 아래, 나머지는 바닥 앞 끝 y로 깊이 정렬
      img.setDepth(f.kind === "chair" ? f.y - 12 : f.circle ? f.y + f.w * 0.3 : f.y);
      this.keep(img);
    }
  }

  private buildLight(): void {
    const sc = this.scene;
    const tone = TONE[this.view.time];
    const mul = this.view.rain ? Phaser.Display.Color.GetColor(...rgbMix(tone.mul, 0x9aa0b0, 0.35)) : tone.mul;
    // 11/15 성능: 지도 분위기 층이 있으면 그 색에 곱해 넣는다 (화면 전체 층 하나 덜 — game/tower/themes/overlay)
    if (mul !== 0xffffff) {
      const own = foldMultiply(sc, mul, D_OVERLAY, () => sc.add.rectangle(-200, -200, 848, 688, mul).setOrigin(0, 0).setDepth(D_OVERLAY).setBlendMode(Phaser.BlendModes.MULTIPLY));
      if (own) this.keep(own);
    }
    if (tone.stripeA > 0 && !this.view.rain) {
      const k = `mt-stripes-${this.seed & 7}`;
      if (!sc.textures.exists(k)) sc.textures.addCanvas(k, stripesCanvas(this.seed & 7));
      this.stripes = this.keep(sc.add.image(0, 0, k).setOrigin(0, 0).setTint(tone.stripe).setAlpha(tone.stripeA).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_LIGHT - 2));
    }
    // 밤·새벽: 형광등 아래 빛 웅덩이를 더 밝게, 창 쪽은 도시 불빛이 번진다
    if (this.view.time === "night" || this.view.time === "dawn") {
      for (const y of [100, 206])
        for (const x of [94, 224, 354])
          this.keep(sc.add.image(x, y, RTEX.glow).setTint(0xd8ecff).setScale(1.6, 1.1).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_LIGHT - 1));
    }
    for (const w of mtWindows(this.plan.wall))
      this.keep(sc.add.image(w.x + w.w / 2, w.y + w.h + 6, RTEX.glow).setTint(TONE[this.view.time].stripe || 0x6a8aff).setDisplaySize(w.w, 34).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_LIGHT - 1));
  }

  // ── 몬스터 행동이 쓰는 지형 ──

  /** 마커 선 (ms 동안 나를 막는 벽) */
  addWall(x0: number, y0: number, x1: number, y1: number, until: number): void {
    if (Math.hypot(x1 - x0, y1 - y0) < 0.5) return;
    this.walls.push({ x0, y0, x1, y1, until });
    if (this.walls.length > 160) this.walls.shift();
  }

  /** 커피 웅덩이 */
  addPuddle(x: number, y: number, until: number): void {
    const k = `mt-puddle-${this.puddles.length % 3}`;
    if (!this.scene.textures.exists(k)) this.scene.textures.addCanvas(k, puddleCanvas(this.puddles.length % 3));
    const p = this.clampPt(x, y, 4);
    const img = this.keep(this.scene.add.image(p.x, p.y, k).setDepth(-780).setAlpha(0).setScale(0.4));
    this.scene.tweens.add({ targets: img, alpha: 0.95, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.puddles.push({ x: p.x, y: p.y, until, img });
    if (this.puddles.length > 10) this.puddles.shift()!.img.destroy();
  }

  /** 하울링 밀침 (px/s, 점점 줄어든다) */
  kick(vx: number, vy: number): void {
    this.kickV.x += vx;
    this.kickV.y += vy;
  }

  /** 우두머리 「한 가지만 더」: 지금 바로 경고 → 밀려온다 */
  forceShrink(now: number): void {
    if (this.warn || this.slide) return;
    this.startWarn(now, true);
  }

  get shrinkCount(): number {
    return this.shrinks;
  }

  clampPt(x: number, y: number, r: number): Pt {
    const m = this.room;
    return { x: Phaser.Math.Clamp(x, m.x0 + r + 1, m.x1 - r - 1), y: Phaser.Math.Clamp(y, m.y0 + r + 4, m.y1 - 3) };
  }

  // ── arena가 부르는 것 ──

  /** 방 경계 + (나만) 마커 선 */
  collide(p: Pt, r: number): void {
    const m = this.room;
    const mon = "id" in p;
    const bx = p.x;
    const by = p.y;
    p.x = Phaser.Math.Clamp(p.x, m.x0 + r, m.x1 - r);
    p.y = Phaser.Math.Clamp(p.y, m.y0 + Math.max(4, r * 0.6), m.y1 - 2);
    if (this.slide && (p.x !== bx || p.y !== by)) this.tableHit(p, mon);
    if (mon) return;
    for (const w of this.walls) {
      const vx = w.x1 - w.x0;
      const vy = w.y1 - w.y0;
      const l2 = vx * vx + vy * vy;
      const u = Phaser.Math.Clamp(((p.x - w.x0) * vx + (p.y - w.y0) * vy) / l2, 0, 1);
      const cx = w.x0 + vx * u;
      const cy = w.y0 + vy * u;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy);
      const min = r + 2;
      if (d >= min) continue;
      if (d < 0.01) {
        const n = Math.hypot(vx, vy) || 1;
        p.x = cx - (vy / n) * min;
        p.y = cy + (vx / n) * min;
      } else {
        p.x = cx + (dx / d) * min;
        p.y = cy + (dy / d) * min;
      }
    }
  }

  private tableHit(p: Pt, mon: boolean): void {
    const s = this.slide!;
    if (!mon) {
      if (s.hitP) return;
      s.hitP = true;
      this.hooks.hurtPlayer(Math.max(1, Math.round(this.hooks.maxHp() * TABLE_HIT_PCT)));
      this.hooks.shake(120, 0.004);
      this.hooks.sfx("slam", 0.5);
      return;
    }
    const m = p as unknown as ArenaMon;
    if (s.hitM.has(m) || m.boss) return;
    s.hitM.add(m);
    this.hooks.hurtMonster(m, Math.max(1, Math.round(m.st.maxHp * TABLE_MON_PCT)));
  }

  speedMul(x: number, y: number): number {
    for (const p of this.puddles) if (((x - p.x) / 17) ** 2 + ((y - p.y) / 9) ** 2 <= 1) return 0.55;
    return 1;
  }

  kickVel(dt: number): Pt {
    const k = { x: this.kickV.x, y: this.kickV.y };
    const decay = Math.exp(-dt * 7);
    this.kickV.x = Math.abs(this.kickV.x * decay) < 2 ? 0 : this.kickV.x * decay;
    this.kickV.y = Math.abs(this.kickV.y * decay) < 2 ? 0 : this.kickV.y * decay;
    return k;
  }

  hides(m: object): boolean {
    return this.veiled.has(m);
  }

  // ── 매 프레임 ──

  update(now: number, dt: number, player: Pt, mons: readonly ArenaMon[]): void {
    this.player = player;
    if (this.t0 < 0) {
      this.t0 = now;
      this.nextAt = now + (this.bossFloor ? 9000 : 11_000);
    }
    this.tickShrink(now, mons);
    this.tickWalls(now);
    for (const p of this.puddles) {
      const left = p.until - now;
      if (left < 600) p.img.setAlpha(Math.max(0, left / 600) * 0.95);
    }
    while (this.puddles.length && this.puddles[0].until <= now) this.puddles.shift()!.img.destroy();
    if (this.stripes && !this.hooks.reduced) this.stripes.setAlpha(TONE[this.view.time].stripeA * (0.85 + 0.15 * Math.sin(now / 1700))).setX(Math.sin(now / 2300) * 3);
    this.drawClock(now);
    if (now >= this.boardAt) {
      this.boardAt = now + 90;
      this.drawBoards(now);
    }
    if (this.rain) this.drawRain(now);
  }

  private get bossFloor(): boolean {
    return this.plan.type === "boss";
  }

  private startWarn(now: number, forced: boolean): void {
    const side = mtNextSide(this.settled, this.full, this.rnd());
    if (!side) {
      this.nextAt = now + 999_999;
      return;
    }
    const to = mtShrink(this.settled, side, mtShrinkStep(this.loop) + (forced ? 8 : 0));
    this.warn = { at: now + (forced ? 1400 : WARN_MS), side, to, forced };
    const arrow = { left: "→", right: "←", top: "↓", bottom: "↑" }[side];
    this.hooks.flash(forced ? `"한 가지만 더…" 회의 연장! 테이블이 밀려와요 ${arrow}` : `회의 연장! 테이블이 밀려와요. 노란 줄 밖으로 ${arrow}`, 1600);
    this.hooks.sfx("warn", 0.45);
  }

  private tickShrink(now: number, mons: readonly ArenaMon[]): void {
    if (!this.warn && !this.slide && now >= this.nextAt) this.startWarn(now, false);
    const w = this.warn;
    if (w) {
      const s = this.settled;
      const t = w.to;
      const r =
        w.side === "left"
          ? { x: s.x0, y: s.y0, w: t.x0 - s.x0, h: s.y1 - s.y0 }
          : w.side === "right"
            ? { x: t.x1, y: s.y0, w: s.x1 - t.x1, h: s.y1 - s.y0 }
            : w.side === "top"
              ? { x: s.x0, y: s.y0, w: s.x1 - s.x0, h: t.y0 - s.y0 }
              : { x: s.x0, y: t.y1, w: s.x1 - s.x0, h: s.y1 - t.y1 };
      const blink = this.hooks.reduced ? 0.6 : 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(now / 90));
      this.hazard.setPosition(r.x, r.y).setSize(Math.max(1, r.w), Math.max(1, r.h)).setVisible(r.w > 0 && r.h > 0).setAlpha(blink);
      this.hazard.tilePositionX = -now / 40;
      if (now >= w.at) {
        this.slide = { from: { ...this.settled }, to: w.to, at: now, side: w.side, hitP: false, hitM: new Set() };
        this.warn = null;
        this.hazard.setVisible(false);
        this.hooks.sfx("slam", 0.55);
        this.hooks.shake(260, 0.003);
      }
    }
    const sl = this.slide;
    if (sl) {
      const k = Math.min(1, (now - sl.at) / SLIDE_MS);
      const e = 1 - (1 - k) ** 3;
      this.room = {
        x0: sl.from.x0 + (sl.to.x0 - sl.from.x0) * e,
        y0: sl.from.y0 + (sl.to.y0 - sl.from.y0) * e,
        x1: sl.from.x1 + (sl.to.x1 - sl.from.x1) * e,
        y1: sl.from.y1 + (sl.to.y1 - sl.from.y1) * e,
      };
      // 가만히 서 있어도 테이블이 민다 (나 + 몬스터)
      const p = { x: this.player.x, y: this.player.y };
      this.collide(p, 5);
      if (p.x !== this.player.x || p.y !== this.player.y) this.hooks.teleport(p.x, p.y);
      for (const m of mons) {
        if (!m.alive || m.hidden) continue;
        const q = { x: m.x, y: m.y };
        const r = MONSTERS[m.id].size / 2;
        const c = this.clampPt(q.x, q.y, Math.min(r, 12));
        if (c.x !== m.x || c.y !== m.y) {
          this.hooks.moveMon(m, c.x - m.x, c.y - m.y);
          this.tableHit(m as unknown as Pt, true);
        }
      }
      if (k >= 1) {
        this.settled = { ...sl.to };
        this.room = { ...sl.to };
        this.slide = null;
        this.shrinks++;
        this.nextAt = now + mtShrinkEvery(this.bossFloor, this.loop);
      }
    } else if (!this.warn) {
      // 보통 때도 방 밖에 있는 몬스터는 안으로 (밀려온 테이블 위에 나오지 않게)
      for (const m of mons) {
        if (!m.alive || m.hidden) continue;
        const c = this.clampPt(m.x, m.y, Math.min(MONSTERS[m.id].size / 2, 12));
        if (c.x !== m.x || c.y !== m.y) this.hooks.moveMon(m, c.x - m.x, c.y - m.y);
      }
    }
    this.drawBanks();
  }

  private drawBanks(): void {
    const f = this.full;
    const m = this.room;
    const set = (ts: Phaser.GameObjects.TileSprite, x: number, y: number, w: number, h: number, tw: number, th: number, alignR: boolean, alignB: boolean) => {
      const vis = w >= 1 && h >= 1;
      ts.setVisible(vis);
      if (!vis) return;
      ts.setPosition(x, y).setSize(w, h);
      // 무늬를 안쪽 끝(밀려오는 앞)에 맞춘다 → 테이블이 미끄러져 들어오는 것처럼
      ts.tilePositionX = alignR ? tw - (w % tw) : 0;
      ts.tilePositionY = alignB ? th - (h % th) : 0;
    };
    set(this.banks.left, f.x0, f.y0, m.x0 - f.x0, f.y1 - f.y0, 24, 40, true, false);
    set(this.banks.right, m.x1, f.y0, f.x1 - m.x1, f.y1 - f.y0, 24, 40, false, false);
    set(this.banks.top, m.x0, f.y0, m.x1 - m.x0, m.y0 - f.y0, 40, 24, false, true);
    set(this.banks.bottom, m.x0, m.y1, m.x1 - m.x0, f.y1 - m.y1, 40, 24, false, false);
    this.banks.top.setDepth(m.y0 - 1);
    const g = this.bankEdge.clear();
    g.fillStyle(0x000000, 0.35);
    if (m.x0 > f.x0) g.fillRect(m.x0, m.y0, 3, m.y1 - m.y0);
    if (m.x1 < f.x1) g.fillRect(m.x1 - 3, m.y0, 3, m.y1 - m.y0);
    if (m.y1 < f.y1) g.fillRect(m.x0, m.y1 - 2, m.x1 - m.x0, 2);
    g.fillStyle(0xe8e4dc, 0.9);
    if (m.x0 > f.x0) g.fillRect(m.x0 - 1, f.y0, 1, f.y1 - f.y0);
    if (m.x1 < f.x1) g.fillRect(m.x1, f.y0, 1, f.y1 - f.y0);
    if (m.y1 < f.y1) g.fillRect(m.x0, m.y1, m.x1 - m.x0, 1);
  }

  private tickWalls(now: number): void {
    let i = 0;
    while (i < this.walls.length && this.walls[i].until <= now) i++;
    if (i) this.walls.splice(0, i);
    const g = this.wallG.clear();
    for (const w of this.walls) {
      const left = w.until - now;
      const a = left < 500 ? left / 500 : 1;
      g.lineStyle(4, 0x0a2a14, 0.55 * a).lineBetween(w.x0, w.y0 + 1, w.x1, w.y1 + 1);
      g.lineStyle(2, 0x2ad06a, 0.95 * a).lineBetween(w.x0, w.y0, w.x1, w.y1);
    }
  }

  private drawClock(now: number): void {
    const c = mtClockAt(this.plan.wall);
    // 층마다 25분 앞서고, 층 안에서도 3초에 1분씩 흐른다
    const min = this.clock0 + Math.max(0, now - this.t0) / 3000;
    const am = (min / 60) * Math.PI * 2 - Math.PI / 2;
    const ah = (min / 720) * Math.PI * 2 - Math.PI / 2;
    const g = this.hands.clear();
    g.lineStyle(1, 0x1a1a24, 1).lineBetween(c.x, c.y, c.x + Math.cos(ah) * 4, c.y + Math.sin(ah) * 4);
    g.lineStyle(1, 0x2a2a34, 1).lineBetween(c.x, c.y, c.x + Math.cos(am) * 6.5, c.y + Math.sin(am) * 6.5);
    const sa = (now / 1000) * ((Math.PI * 2) / 60) * 20 - Math.PI / 2;
    g.lineStyle(1, 0xd03a3a, 1).lineBetween(c.x, c.y, c.x + Math.cos(sa) * 7, c.y + Math.sin(sa) * 7);
  }

  /** 화이트보드 그래프가 저절로 그려진다 (7초마다 새로) · 교육장 슬라이드 · 주재자 화면 */
  private drawBoards(now: number): void {
    const g = this.board.clear();
    const t = now - Math.max(0, this.t0);
    const down = this.view.time === "night" || this.view.time === "dawn";
    for (const [bi, b] of mtBoards(this.plan.wall).entries()) {
      if (b.kind === "board") {
        const cyc = Math.floor(t / 7000) + bi * 3;
        const k = (t % 7000) / 4000;
        const r = seeded((this.seed + cyc * 977 + bi) >>> 0);
        const bars = 4;
        const bx = b.x + 6;
        const by = b.y + b.h - 6;
        // 막대 (차오른다)
        for (let i = 0; i < bars; i++) {
          const hgt = (6 + r() * 18) * Phaser.Math.Clamp(k * bars - i, 0, 1);
          g.fillStyle([0x2a5ac8, 0xd03a3a, 0x2a9a5a][i % 3], 0.9).fillRect(bx + i * 9, by - hgt, 6, hgt);
        }
        g.lineStyle(1, 0x3a3a44, 0.8).lineBetween(bx - 2, by, bx + bars * 9, by).lineBetween(bx - 2, by, bx - 2, b.y + 4);
        // 꺾은선 (펜 끝이 따라간다)
        const lx = b.x + 48;
        const lw = b.w - 54;
        const pts: [number, number][] = [];
        let v = 0.5;
        for (let i = 0; i <= 8; i++) {
          v = Phaser.Math.Clamp(v + (r() - (down ? 0.62 : 0.4)) * 0.35, 0.05, 0.95);
          pts.push([lx + (lw * i) / 8, b.y + 4 + (1 - v) * (b.h - 10)]);
        }
        const upto = Phaser.Math.Clamp(k * 1.4 - 0.2, 0, 1) * 8;
        g.lineStyle(1, down ? 0xd03a3a : 0x2a9a5a, 1);
        for (let i = 0; i < Math.floor(upto); i++) g.lineBetween(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        const fi = Math.floor(upto);
        if (fi < 8) {
          const fr = upto - fi;
          const px = pts[fi][0] + (pts[fi + 1][0] - pts[fi][0]) * fr;
          const py = pts[fi][1] + (pts[fi + 1][1] - pts[fi][1]) * fr;
          g.lineBetween(pts[fi][0], pts[fi][1], px, py);
          if (k < 1.3) g.fillStyle(0x2a2a30, 1).fillRect(px, py - 4, 1, 4).fillStyle(0xf2f2ee, 1).fillRect(px - 1, py - 7, 3, 3);
        }
        // 지우개로 지운다 (끝 1초)
        const wipe = (t % 7000) - 6000;
        if (wipe > 0) g.fillStyle(0xf4f6f8, 0.95).fillRect(b.x, b.y, (b.w * wipe) / 1000, b.h);
      } else if (b.kind === "screen") {
        // 교육장 슬라이드: 5초마다 넘어간다 (제목 줄 → 글머리 하나씩)
        const page = Math.floor(t / 5000);
        const k = (t % 5000) / 5000;
        const r = seeded((this.seed + page * 131) >>> 0);
        g.fillStyle(0x2a5ac8, 1).fillRect(b.x + 8, b.y + 4, b.w - 16, 6);
        g.fillStyle(0xffffff, 1).fillRect(b.x + 12, b.y + 6, 40 + r() * 60, 2);
        const rows = Math.min(4, Math.floor(k * 6));
        for (let i = 0; i < rows; i++) {
          g.fillStyle(0x2a2a34, 1).fillRect(b.x + 12, b.y + 15 + i * 7, 2, 2);
          g.fillStyle(0x6a6a74, 1).fillRect(b.x + 17, b.y + 15 + i * 7, 30 + r() * 90, 2);
        }
        if (r() < 0.5) g.fillStyle(0xd03a3a, 0.9).fillRect(b.x + b.w - 40, b.y + 18, 26, 18 * k);
        pixDigits(g, b.x + b.w - 14, b.y + b.h - 8, `${(page % 87) + 1}`, 0x8a8a94);
        if (t % 5000 < 120) g.fillStyle(0xffffff, 0.8).fillRect(b.x, b.y, b.w, b.h);
      } else {
        // 주재자 화면: "안건 n/37" 목록이 하나씩 체크되고, 밀려올 때마다 안건이 늘어난다
        const total = 37 + this.shrinks * 3;
        const done = Math.min(total - 1, 1 + Math.floor(t / 9000));
        g.fillStyle(0x1a3a5a, 1).fillRect(b.x + 4, b.y + 3, b.w - 8, 7);
        pixDigits(g, b.x + 8, b.y + 4, `${done}/${total}`, 0xe8c050);
        for (let i = 0; i < 4; i++) {
          const y = b.y + 14 + i * 7;
          g.fillStyle(i < 1 ? 0x3a8a4a : 0x3a4a5a, 1).fillRect(b.x + 8, y, 4, 4);
          g.fillStyle(0x8aa0c0, 0.9).fillRect(b.x + 16, y + 1, 50 + ((i * 37 + done * 11) % 90), 2);
        }
        if (this.warn?.forced && Math.floor(now / 160) % 2) {
          g.fillStyle(0xd03a3a, 1).fillRect(b.x + b.w - 34, b.y + 12, 26, 26);
          g.fillStyle(0xffffff, 1).fillRect(b.x + b.w - 27, b.y + 24, 12, 2).fillRect(b.x + b.w - 22, b.y + 19, 2, 12);
        }
      }
    }
  }

  private drawRain(now: number): void {
    const g = this.rain!.clear();
    // 11/17 겨울: 비 대신 눈송이가 천천히 흔들리며 내린다
    if (this.view.snow) {
      g.fillStyle(0xffffff, 0.85);
      for (const w of mtWindows(this.plan.wall)) {
        const n = Math.round(w.w / 5);
        for (let i = 0; i < n; i++) {
          const x = w.x + ((i * 37.3 + now * 0.004 * (1 + (i % 3) * 0.3) + Math.sin(now / 700 + i) * 3 + w.w * 4) % w.w);
          const y = w.y + ((i * 13.7 + now * 0.018 * (1 + (i % 2) * 0.4)) % w.h);
          g.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
        }
      }
      return;
    }
    g.lineStyle(1, 0xc8d8f0, 0.45);
    for (const w of mtWindows(this.plan.wall)) {
      const n = Math.round(w.w / 7);
      for (let i = 0; i < n; i++) {
        const x = w.x + ((i * 37.3 + now * 0.02 * (1 + (i % 3) * 0.3)) % w.w);
        const y = w.y + ((i * 13.7 + now * 0.09 * (1 + (i % 2) * 0.4)) % w.h);
        g.lineBetween(x, y, x - 1, Math.min(w.y + w.h, y + 4));
      }
    }
  }

  /** 11/17 가구 자리 (겨울·크리스마스 바닥 장식이 피한다) */
  furnitureBoxes(): Rect[] {
    return this.plan.furn.map((f) => (f.circle ? { x: f.x - f.w / 2 - 4, y: f.y - f.w / 2 - 12, w: f.w + 8, h: f.w + 16 } : { x: f.x - f.w / 2 - 4, y: f.y - f.h - 16, w: f.w + 8, h: f.h + 20 }));
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.walls.length = 0;
    this.puddles.length = 0;
    if (MT_ARENAS.get(this.scene) === this) MT_ARENAS.delete(this.scene);
  }
}

function rgbMix(a: number, b: number, t: number): [number, number, number] {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return [c(16), c(8), c(0)];
}

/** 3×5 숫자·빗금 (Graphics) */
const DIG = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function pixDigits(g: Phaser.GameObjects.Graphics, x: number, y: number, s: string, col: number): void {
  g.fillStyle(col, 1);
  let cx = x;
  for (const ch of s) {
    if (ch === "/") for (let i = 0; i < 5; i++) g.fillRect(cx + 2 - Math.floor(i / 2), y + i, 1, 1);
    else {
      const bits = DIG[Number(ch)] ?? "";
      for (let i = 0; i < 15; i++) if (bits[i] === "1") g.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    }
    cx += 4;
  }
}
