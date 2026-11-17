import * as Phaser from "phaser";
import { SEA_PIER_END } from "@tomb/protocol";
import { qaSearch } from "@/lib/qaUrl";
import { ghostClock, ghostPresence, type GhostCall, type GhostPhase } from "@/lib/sea/ghostShip";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import * as Art from "./seaArt";
import { SEA_DEPTH } from "./SeaMap";
import { FLAG_H, GHOST_LAMPS, GHOST_SAILS, GHOST_TEX, MERCHANT_H, PLANK_H, STALLS_G, STALLS_H } from "./ghostShipArt";
import { clampGhostDeck, G_DECK_X0, G_WATER, GHOST_ART_H, GHOST_DECK, GHOST_HULL, GHOST_LADDER, GHOST_MERCHANT, GHOST_ORIGIN, GHOST_PLANK, onGhostDeck } from "./ghostShipLayout";

// 11/17 유령선 특가 장터 (바닷가 장면 안의 배 — 그림·타기·장터 창 열기). 시간표·품목·값은 lib/sea/ghostShip (서버가 판정해요).
//  - 매주 토요일 밤 8시 50분 안개 속에서 서쪽으로부터 미끄러져 들어와 9시~11시 정박, 11시에 다시 안개 속으로 떠나요 (모든 화면이 같은 한국 시각)
//  - 운영자 시험 부르기(sea:ghost:call — 그 운영자 화면에만) · 로컬·테스트서버 주소 ?ghost=1 (실서버는 qaSearch가 막아요)
//  - 타기: 선착장 끝 데크 서쪽 가장자리의 널빤지로 걸어서 (그 자리 난간만 잠깐 열어요) · 헤엄치다 앞 뱃전 밧줄 사다리 (E)
//  - 갑판 위: 좌판 앞 띠만 걸어요 (막힌 곳 · 갑판 밖은 되돌려요). 유령 상인 앞에서 E → 장터 창 (sea:ghost:open)
//  - 배가 떠나면 갑판 위 사람은 선착장 끝으로 내려 드려요

/** 배가 보이기 시작하는 정도 (이보다 옅으면 탈 수 없어요) */
const BOARD_MIN = 0.6;
/** 안개 뭉치 수 (배 둘레 · 화면 둘레) */
const MIST_NEAR = 18;
const MIST_WIDE = 10;
/** 널빤지 위 걷는 띠 (발 자리) — 갑판 걷는 띠와 이어져요 */
const PLANK_WALK = { x: GHOST_PLANK.x0 - 2, y: GHOST_PLANK.y - 5, w: GHOST_PLANK.x1 - GHOST_PLANK.x0 + 8, h: 10 } as const;
/** 선착장 쪽 난간을 여는 자리 (널빤지가 닿는 선착장 끝 서쪽 가장자리) */
const GATE = { x: SEA_PIER_END.x - 14, y: PLANK_WALK.y - 2, w: 18, h: PLANK_WALK.h + 4 } as const;

type Mist = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; s: number; ph: number; wide: boolean };
type Rect = { x: number; y: number; w: number; h: number };
const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export type GhostHost = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  player(): Player;
  /** 바닷가 막는 상자 (널빤지 자리 난간을 잠깐 열어요) */
  colliders: Phaser.Physics.Arcade.StaticGroup;
  toast(message: string): void;
  splash(x: number, y: number): void;
  /** 순간이동 (사다리 오르기·떠날 때 내려 주기) — 서버에도 알려요 */
  warp(x: number, y: number): void;
};

export class GhostShip {
  private readonly s: Phaser.Scene;
  private readonly back: Phaser.GameObjects.Image;
  private readonly front: Phaser.GameObjects.Image;
  private readonly windows: Phaser.GameObjects.Image;
  private readonly reflect: Phaser.GameObjects.Image;
  private readonly sails: Phaser.GameObjects.Image[];
  private readonly flag: Phaser.GameObjects.Image;
  private readonly stalls: Phaser.GameObjects.Image;
  private readonly merchant: Phaser.GameObjects.Image;
  private readonly plank: Phaser.GameObjects.Image;
  private readonly lamps: Phaser.GameObjects.Image[];
  private readonly wakes: Phaser.GameObjects.Image[];
  private readonly mists: Mist[] = [];
  private readonly sign: Phaser.GameObjects.BitmapText;
  private readonly hull: Phaser.GameObjects.Zone;
  private readonly hullCollider: Phaser.Physics.Arcade.Collider;
  /** 널빤지 자리를 열려고 꺼 둔 난간 · 그 대신 세운 조각 */
  private gateOff: Phaser.Physics.Arcade.StaticBody[] = [];
  private gateParts: Phaser.GameObjects.Zone[] = [];
  private gateOpen = false;
  private call: GhostCall = null;
  private readonly qa: boolean;
  private readonly offCall: () => void;
  /** 지금 보이는 정도 0..1 · 시간표 단계 · 배가 미끄러진 만큼 (들어오고 나갈 때) */
  presence = 0;
  phase: GhostPhase = "away";
  private dx = 0;
  /** 내가 배(널빤지·갑판) 위에 있어요 */
  aboard = false;
  private last = { x: 0, y: 0 };
  /** 이름표 크기 (카메라를 당겨도 글씨는 같은 크기 — 다른 이름표와 같은 배율) */
  private labelScale = 1;

  constructor(private readonly h: GhostHost) {
    const s = (this.s = h.scene);
    const T = GHOST_TEX;
    const O = GHOST_ORIGIN;
    const backDepth = O.y + 104;
    this.reflect = s.add.image(O.x + G_DECK_X0, O.y + G_WATER + 2, T.reflect).setOrigin(0, 0).setDepth(SEA_DEPTH.shimmer + 6);
    this.wakes = [0, 1, 2].map(() => s.add.image(0, 0, Art.SEA_TEX.wake).setDepth(SEA_DEPTH.shimmer + 7));
    this.plank = s.add.image(GHOST_PLANK.x0, GHOST_PLANK.y - PLANK_H / 2 - 2, T.plank).setOrigin(0, 0).setDepth(GHOST_PLANK.y - 9);
    this.back = s.add.image(O.x, O.y, T.back).setOrigin(0, 0).setDepth(backDepth);
    this.sails = GHOST_SAILS.map((sl, i) => s.add.image(O.x + sl.gx + (sl.tri ? sl.w / 2 - 1 : 0), O.y + sl.gy, T.sail(i)).setOrigin(sl.tri ? 1 : 0.5, 0).setDepth(backDepth + 0.5));
    this.flag = s.add.image(O.x + 105, O.y + 4, T.flag, 0).setOrigin(0, 1).setDepth(backDepth + 0.6);
    this.stalls = s.add.image(O.x + STALLS_G.x, O.y + STALLS_G.y, T.stalls).setOrigin(0, 0).setDepth(O.y + STALLS_G.y + STALLS_H - 4);
    this.merchant = s.add.image(GHOST_MERCHANT.x, GHOST_MERCHANT.y, T.merchant, 0).setOrigin(0.5, 1).setDepth(GHOST_MERCHANT.y);
    this.front = s.add.image(O.x, O.y, T.front).setOrigin(0, 0).setDepth(O.y + G_WATER + 2);
    this.windows = s.add.image(O.x, O.y, T.windows).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1);
    this.lamps = GHOST_LAMPS.map(() => s.add.image(0, 0, T.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 2));
    for (let i = 0; i < MIST_NEAR + MIST_WIDE; i++) {
      const wide = i >= MIST_NEAR;
      this.mists.push({
        img: s.add.image(0, 0, T.mist).setDepth(wide ? DEPTH.lights - 2 : i % 2 ? backDepth - 1 : O.y + G_WATER + 3),
        x: O.x - 80 + ((i * 97) % 380),
        y: O.y + 70 + ((i * 53) % 160),
        vx: 4 + (i % 5) * 1.6,
        s: 1 + (i % 4) * 0.35,
        ph: (i * 2.39) % 6.28,
        wide,
      });
    }
    // 장터 이름 (상인 머리 위 — 녹빛 글씨)
    h.atlas.ensure("유령선 장터");
    this.sign = s.add.bitmapText(GHOST_MERCHANT.x, O.y + STALLS_G.y - 6, FONT_KEY, "유령선 장터", FONT_PX).setOrigin(0.5, 1).setTint(0xb8ffd8).setDepth(DEPTH.labels - 1);
    // 헤엄치는 사람이 부딪히는 배 몸 (배가 있고, 내가 배 위에 있지 않을 때만)
    this.hull = s.add.zone(GHOST_HULL.x + GHOST_HULL.w / 2, GHOST_HULL.y + GHOST_HULL.h / 2, GHOST_HULL.w, GHOST_HULL.h);
    s.physics.add.existing(this.hull, true);
    this.hullCollider = s.physics.add.collider(h.player().sprite, this.hull, undefined, () => this.presence >= BOARD_MIN && !this.aboard);
    this.qa = typeof window !== "undefined" && new URLSearchParams(qaSearch(window.location.search)).get("ghost") === "1";
    this.call = bridge.last("sea:ghost:call")?.call ?? null;
    this.offCall = bridge.on("sea:ghost:call", ({ call }) => {
      this.call = call;
    });
    this.hideAll();
  }

  /** 지금 배가 보이고 탈 수 있어요 */
  get docked(): boolean {
    return this.presence >= BOARD_MIN;
  }

  /** (x,y)가 배 위 걸을 수 있는 자리인지 (물에 젖지 않아요) */
  walkable(x: number, y: number): boolean {
    if (!this.docked) return false;
    return inRect(PLANK_WALK, x, y) || onGhostDeck(x, y);
  }

  /** 배 몸 (놀거리가 부딪혀요) — 배가 없으면 없음 */
  hullBox(): Rect | null {
    return this.docked ? { ...GHOST_HULL } : null;
  }

  // ── 매 프레임 ──

  /** 시계 · 배 위 걷기 (Player.update 다음, 난간 지킴이 전에). darkness 0 낮 ~ 1 밤 */
  update(now: number, darkness: number, view: Phaser.Geom.Rectangle, labelScale = 1): void {
    this.labelScale = labelScale;
    const wall = Date.now();
    const call: GhostCall = this.call ?? (this.qa ? "on" : null);
    const clock = ghostClock(wall);
    this.phase = call === "on" ? "docked" : call === "off" ? "away" : clock.phase;
    const p = ghostPresence(wall, call);
    this.presence = p;
    this.dx = -Math.round((1 - p) * 70);
    this.walk();
    this.syncGate();
    if (p <= 0.001) {
      this.hideAll();
      return;
    }
    this.draw(now, darkness, p, view);
  }

  /** 배 위 걷기: 널빤지·갑판 띠 밖으로 나가면 되돌려요 (선착장 끝으로 걸어 내려가는 것만 괜찮아요) */
  private walk(): void {
    const pl = this.h.player();
    const body = pl.sprite.body as Phaser.Physics.Arcade.Body;
    if (!this.docked) {
      if (this.aboard) {
        // 배가 안개 속으로 떠나요 → 선착장 끝으로 내려 드려요
        this.aboard = false;
        this.h.warp(GHOST_PLANK.to.x, GHOST_PLANK.to.y);
        this.h.toast("유령선이 안개 속으로 떠나요. 선착장에 내려 드렸어요.");
      }
      return;
    }
    if (pl.inBoat || pl.sitting || pl.anchored) {
      this.aboard = false;
      return;
    }
    const x = pl.x;
    const y = pl.y;
    const on = this.walkable(x, y);
    if (!this.aboard) {
      if (on && !pl.inWater) this.aboard = true;
      this.last = { x, y };
      return;
    }
    if (on) {
      this.last = { x, y };
      return;
    }
    // 선착장 끝 데크로 걸어 내려갔어요
    const E = SEA_PIER_END;
    if (x >= E.x && x <= E.x + E.w && y >= E.y && y <= E.y + E.h) {
      this.aboard = false;
      return;
    }
    // 널빤지 위면 널빤지 띠로, 아니면 갑판 띠로 되돌려요
    let fix: { x: number; y: number };
    if (inRect({ ...PLANK_WALK, y: PLANK_WALK.y - 8, h: PLANK_WALK.h + 16 }, x, y) && x > GHOST_DECK.x + GHOST_DECK.w) fix = { x: Math.max(PLANK_WALK.x, Math.min(PLANK_WALK.x + PLANK_WALK.w, x)), y: Math.max(PLANK_WALK.y + 1, Math.min(PLANK_WALK.y + PLANK_WALK.h - 1, y)) };
    else if (inRect(PLANK_WALK, this.last.x, this.last.y) && !onGhostDeck(x, y) && (y < GHOST_DECK.y || x > GHOST_DECK.x + GHOST_DECK.w)) fix = { x: Math.max(PLANK_WALK.x, Math.min(PLANK_WALK.x + PLANK_WALK.w, x)), y: Math.max(PLANK_WALK.y + 1, Math.min(PLANK_WALK.y + PLANK_WALK.h - 1, y)) };
    else fix = clampGhostDeck(x, y, this.last.x, this.last.y);
    if (!this.walkable(fix.x, fix.y)) fix = { ...this.last };
    body.reset(fix.x, fix.y);
    this.last = fix;
  }

  /** 배가 대 있으면 선착장 끝 서쪽 난간 중 널빤지가 닿는 자리만 열어요 (떠나면 다시 막아요) */
  private syncGate(): void {
    const open = this.docked;
    if (open && !this.gateOpen) {
      this.gateOpen = true;
      const G = GATE;
      const hit = (b: Phaser.Physics.Arcade.StaticBody) => b.x < G.x + G.w && b.x + b.width > G.x && b.y < G.y + G.h && b.y + b.height > G.y;
      for (const ch of this.h.colliders.getChildren()) {
        const b = (ch as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody | null;
        if (!b || !b.enable || !hit(b)) continue;
        b.enable = false;
        this.gateOff.push(b);
        // 열린 자리 위·아래로 남는 난간은 조각으로 다시 세워요
        const parts: Rect[] = [];
        if (b.y < G.y) parts.push({ x: b.x, y: b.y, w: b.width, h: G.y - b.y });
        if (b.y + b.height > G.y + G.h) parts.push({ x: b.x, y: G.y + G.h, w: b.width, h: b.y + b.height - G.y - G.h });
        for (const r of parts) {
          const z = this.s.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
          this.h.colliders.add(z);
          this.gateParts.push(z);
        }
      }
    } else if (!open && this.gateOpen) {
      this.gateOpen = false;
      for (const b of this.gateOff) b.enable = true;
      for (const z of this.gateParts) z.destroy();
      this.gateOff = [];
      this.gateParts = [];
    }
  }

  private hideAll(): void {
    for (const o of [this.back, this.front, this.windows, this.reflect, this.flag, this.stalls, this.merchant, this.plank, this.sign, ...this.sails, ...this.lamps, ...this.wakes]) o.setVisible(false);
    for (const m of this.mists) m.img.setVisible(false);
  }

  private draw(now: number, darkness: number, p: number, view: Phaser.Geom.Rectangle): void {
    const O = GHOST_ORIGIN;
    const calm = this.h.reduced;
    // 물결 따라 천천히 오르내려요 (1px) · 유령선답게 아주 살짝 숨 쉬듯 투명해졌다 짙어져요
    const bob = calm ? 0 : Math.round(Math.sin(now / 1700) * 1.1);
    const shimmer = calm ? 0.95 : 0.9 + 0.06 * Math.sin(now / 900);
    const a = p * shimmer;
    const x0 = O.x + this.dx;
    const y0 = O.y + bob;
    this.back.setVisible(true).setPosition(x0, y0).setAlpha(a);
    this.front.setVisible(true).setPosition(x0, y0).setAlpha(a);
    this.stalls.setVisible(true).setPosition(x0 + STALLS_G.x, y0 + STALLS_G.y).setAlpha(a);
    this.reflect
      .setVisible(true)
      .setPosition(x0 + G_DECK_X0, O.y + G_WATER + 2)
      .setScale(1, calm ? 1 : 1 + 0.12 * Math.sin(now / 650))
      .setAlpha(0.7 * p);
    // 돛: 바람에 부풀었다 가라앉아요 (돛마다 조금씩 다르게)
    this.sails.forEach((img, i) => {
      const sl = GHOST_SAILS[i];
      const k = calm ? 0 : Math.sin(now / (1300 + i * 170) + i * 1.3);
      img
        .setVisible(true)
        .setPosition(x0 + sl.gx + (sl.tri ? sl.w / 2 - 1 : 0), y0 + sl.gy)
        .setScale(1 + 0.025 * k, 1 + 0.03 * Math.max(0, k))
        .setAlpha(p * (0.86 + 0.08 * k));
    });
    this.flag
      .setVisible(true)
      .setFrame(calm ? 0 : Math.floor(now / 200) % 3)
      .setPosition(x0 + 105, y0 + 4 + FLAG_H - 9)
      .setAlpha(a);
    // 유령 상인: 둥실 떠서 등불을 흔들어요
    const mb = calm ? 0 : Math.round(Math.sin(now / 800) * 1.5);
    this.merchant
      .setVisible(true)
      .setFrame(calm ? 0 : Math.floor(now / 420) % 2)
      .setPosition(GHOST_MERCHANT.x + this.dx, GHOST_MERCHANT.y + bob - 2 + mb)
      .setAlpha(p * 0.9);
    this.sign
      .setVisible(this.docked)
      .setScale(this.labelScale)
      .setPosition(GHOST_MERCHANT.x + this.dx, y0 + STALLS_G.y - 4 - MERCHANT_H * 0.1)
      .setAlpha(p * (darkness > 0.3 ? 1 : 0.85));
    // 널빤지는 다 닿은 뒤에만 (들어오고 나가는 동안엔 걷어 둬요)
    this.plank.setVisible(this.docked).setAlpha(Math.min(1, (p - BOARD_MIN) / (1 - BOARD_MIN) + 0.2));
    // 등불·창 빛: 밤엔 환하게, 낮엔 은은하게 · 촛불처럼 떨려요
    const night = Math.max(0.35, Math.min(1, darkness * 1.4));
    this.windows.setVisible(true).setPosition(x0, y0).setAlpha(p * (0.45 + 0.55 * night) * (calm ? 1 : 0.85 + 0.15 * Math.sin(now / 130)));
    this.lamps.forEach((g, i) => {
      const [gx, gy] = GHOST_LAMPS[i];
      const fl = calm ? 1 : 0.8 + 0.2 * Math.sin(now / (90 + i * 23) + i * 2);
      g.setVisible(true)
        .setPosition(x0 + gx, y0 + gy + 2)
        .setScale((0.7 + 0.5 * night) * fl)
        .setAlpha(p * (0.5 + 0.5 * night) * fl);
    });
    // 물높이 물결 (뱃머리 · 옆구리 · 고물)
    this.wakes.forEach((w, i) => {
      const k = calm ? 0.5 : (Math.sin(now / 520 + i * 2) + 1) / 2;
      w.setVisible(true)
        .setPosition(x0 + [20, 100, 180][i], O.y + G_WATER + 1)
        .setScale([3, 9, 4][i] * (0.9 + 0.2 * k), 0.8)
        .setAlpha(p * (0.25 + 0.2 * k));
    });
    this.drawMist(now, p, view);
  }

  /** 안개: 배 둘레 뭉치들이 천천히 동쪽으로 흘러요. 안개가 끼는 때(8시 50분~)·떠날 때는 화면 둘레까지 짙게 */
  private drawMist(now: number, p: number, view: Phaser.Geom.Rectangle): void {
    const O = GHOST_ORIGIN;
    const thick = this.phase === "fog" ? 0.55 + 0.45 * (1 - Math.abs(p - 0.5) * 2) + 0.2 : this.phase === "leaving" ? 1 : 0.42;
    const t = now / 1000;
    for (const m of this.mists) {
      let x: number;
      let y: number;
      if (m.wide) {
        // 화면 둘레 안개 (안개 낄 때·떠날 때만)
        const on = this.phase === "fog" || this.phase === "leaving";
        if (!on) {
          m.img.setVisible(false);
          continue;
        }
        const span = view.width + 240;
        x = view.x - 120 + ((((m.x + t * m.vx * 2) % span) + span) % span);
        y = view.y + ((m.y * 7) % Math.max(1, view.height));
      } else {
        const span = 420;
        x = O.x - 110 + ((((m.x - O.x + 110 + t * m.vx) % span) + span) % span);
        y = m.y + Math.sin(t / 3 + m.ph) * 6;
      }
      const breathe = this.h.reduced ? 1 : 0.75 + 0.25 * Math.sin(t / 2.3 + m.ph);
      m.img
        .setVisible(true)
        .setPosition(Math.round(x), Math.round(y))
        .setScale(m.s * (m.wide ? 2.6 : 1.3), m.s * (m.wide ? 1.6 : 0.9))
        .setAlpha(Math.min(0.85, thick * breathe * (m.wide ? 0.5 : 0.62)) * Math.max(0.25, p));
    }
  }

  /** 밤 어둠에 등불·창 빛 구멍 */
  addLights(lit: { add(x: number, y: number, r: number, a: number): void }, darkness: number): void {
    if (this.presence <= 0.05 || darkness <= 0.01) return;
    const O = GHOST_ORIGIN;
    const p = this.presence;
    for (const [gx, gy] of GHOST_LAMPS) lit.add(O.x + this.dx + gx, O.y + gy, 46, 0.8 * p);
    lit.add(GHOST_MERCHANT.x + this.dx, GHOST_MERCHANT.y - 14, 60, 0.85 * p);
    lit.add(O.x + this.dx + 104, O.y + 150, 90, 0.55 * p);
    lit.add(O.x + this.dx + 166, O.y + 96, 40, 0.7 * p);
  }

  // ── E ──

  /** 안내 (상인 앞 · 사다리 앞) */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    const t = this.target();
    if (!t) return null;
    return t === "shop" ? { x: GHOST_MERCHANT.x, y: GHOST_MERCHANT.y + 4, text: `${prefix}유령 상인과 거래하기` } : { x: GHOST_LADDER.x, y: GHOST_LADDER.water + 2, text: `${prefix}밧줄 사다리 오르기` };
  }

  private target(): "shop" | "ladder" | null {
    if (!this.docked) return null;
    const pl = this.h.player();
    if (pl.inBoat || pl.airborne) return null;
    if (this.aboard && Math.hypot(pl.x - GHOST_MERCHANT.x, pl.y - GHOST_MERCHANT.y) <= GHOST_MERCHANT.r) return "shop";
    if (pl.inWater && Math.hypot(pl.x - GHOST_LADDER.x, pl.y - GHOST_LADDER.water) <= GHOST_LADDER.r) return "ladder";
    return null;
  }

  /** E: 장터 창 열기 · 사다리 오르기. 처리했으면 true */
  interact(): boolean {
    const t = this.target();
    if (!t) return false;
    const pl = this.h.player();
    if (t === "shop") {
      pl.faceTo(GHOST_MERCHANT.x, GHOST_MERCHANT.y - 10, this.s.time.now);
      bridge.emit("sea:ghost:open");
      return true;
    }
    // 밧줄 사다리: 물에서 앞 뱃전으로 올라 갑판에 서요
    if (!this.h.reduced) this.h.splash(GHOST_LADDER.x, GHOST_LADDER.water);
    this.h.warp(GHOST_LADDER.x, GHOST_LADDER.deck);
    this.aboard = true;
    this.last = { x: GHOST_LADDER.x, y: GHOST_LADDER.deck };
    return true;
  }

  destroy(): void {
    this.offCall();
    if (this.gateOpen) {
      for (const b of this.gateOff) b.enable = true;
      for (const z of this.gateParts) z.destroy();
    }
    this.hullCollider.destroy();
    this.hull.destroy();
    for (const o of [this.back, this.front, this.windows, this.reflect, this.flag, this.stalls, this.merchant, this.plank, this.sign, ...this.sails, ...this.lamps, ...this.wakes]) o.destroy();
    for (const m of this.mists) m.img.destroy();
    this.mists.length = 0;
  }
}

/** 배 그림 높이 (미니맵 등) */
export const GHOST_SHIP_H = GHOST_ART_H;
