import * as Phaser from "phaser";
import type { MonsterId } from "@/lib/rpg/catalog";
import {
  BOSS_DEAL_HP_COST,
  CARDS,
  cardOffer,
  RARITIES,
  RARITY_COLOR,
  cardStats,
  cardStyleKind,
  FOCUS_ASPD,
  rerollsAllowed,
  runLevel,
  runXpOf,
  startPicks,
  type CardChoice,
  type CardCounts,
  type CardId,
  type CardKindStyle,
  type CardPick,
  type CardStats,
  type OfferKind,
} from "@/lib/rpg/cards";
import type { AttackArea, Derived } from "@/lib/rpg/formulas";
import type { RpgHud } from "@/lib/rpg/types";
import type { WeaponStyle } from "@/lib/rpg/weapons";
import { bridge } from "../../bridge";
import { FXT } from "../combatFx";
import type { Layer } from "../skillSound";
import { CARD_SND, CDT, ensureCardTextures } from "./cardFx";

// 11/15 야근 빌딩 능력 카드 — 판 안 실행부. HuntScene은 몇 군데에서만 부른다:
//  만들 때(new CardRun) · 공격(fire 대신·afterAttack) · 명중(onBasicHit·oneshot) · 처치(onKill) · 매 프레임(tick·update) · 쓰러질 때(revive) · HUD·결과.
// 카드 고르기는 화면(CardPick)이 한다: 제안을 rpg:cards로 보내고 게임을 멈춘 채 rpg:cardPick을 기다린다.
// 투사체·결재판·불꽃은 미리 만들어 둔 것을 돌려 쓴다 (많이 쌓여도 60fps). 수가 넘치면 덧붙는 것부터 건너뛴다.

/** HuntScene의 몬스터 중 여기서 읽고 쓰는 것만 */
export type CardMon = {
  id: MonsterId;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  hidden: boolean;
  boss: boolean;
  elite?: boolean;
  st: { maxHp: number; def: number };
  sprite: Phaser.GameObjects.Sprite;
  slowUntil: number;
  stunUntil: number;
  kbx: number;
  kby: number;
};

export type CardHitOpts = { kb?: number; sure?: boolean; basic?: boolean; heavy?: boolean };

export interface CardHost<M extends CardMon> {
  readonly scene: Phaser.Scene;
  readonly reduced: boolean;
  now(): number;
  player(): { x: number; y: number };
  face(): { x: number; y: number };
  mons(): readonly M[];
  size(m: M): number;
  style(): WeaponStyle;
  area(): AttackArea;
  /** 명중·치명타 판정 + 피해 (basic이면 무기 공격 — 속성·연쇄가 터진다) */
  strike(m: M, mult: number, nth: number, o: CardHitOpts): void;
  /** 지속 피해 (밀거나 멈추지 않는다) */
  dot(m: M, mult: number): void;
  /** 근접 부채꼴 한 번 더 (다른 방향으로) */
  meleeArc(ang: number, area: AttackArea, mult: number, fin: boolean, alpha: number): void;
  /** 범위 마법 한 번 더 (delay 뒤 그 자리에서 터진다) */
  ink(x: number, y: number, r: number, mult: number, delay: number): void;
  clampPoint(x: number, y: number): { x: number; y: number };
  /** 벽 안이면 밀어낼 방향 (단위 벡터), 아니면 null */
  solid(x: number, y: number): { x: number; y: number } | null;
  bounds(): { x0: number; y0: number; x1: number; y1: number };
  /** 몬스터 투사체 (서류 방패가 막는다 — until = 0이면 사라진다) */
  enemyShots(): { x: number; y: number; until: number }[];
  hp(): number;
  maxHp(): number;
  /** 받는 회복 배율 (30층 저주) */
  healMul(): number;
  heal(n: number, show: boolean): void;
  /** 판 시간으로 미루기 */
  later(ms: number, fn: () => void): void;
  /** 고르는 동안 멈춤 (on=false면 다시 흐른다) */
  hold(on: boolean): void;
  /** 지금 카드를 고르게 해도 되나 (쓰러짐·판 끝·드롭 줍는 중이면 안 된다) */
  canPick(): boolean;
  floorsCleared(): number;
  /** 카드가 바뀌어 능력치를 다시 계산하라 */
  refresh(): void;
  /** 11/15 SP 더하기 (믹스커피) · 무적 ms (연차 몰아 쓰기) */
  addSp(n: number): void;
  invuln(ms: number): void;
  flash(msg: string, ms: number): void;
  float(x: number, y: number, text: string, color: string, px?: number): void;
  synth(key: string, layers: Layer[]): void;
  shake(ms: number, k: number): void;
  ring(x: number, y: number, color: number, r: number): void;
}

type Shot<M> = {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  left: number;
  pierce: number;
  mult: number;
  /** 관통할 때마다 줄어드는 배율 */
  fall: number;
  hit: Set<M>;
  sprite: Phaser.GameObjects.Image;
  spin: number;
  bounce: number;
  toss: number;
  home: M | null;
  basic: boolean;
  kb: number;
};

type MonSt = {
  burnUntil: number;
  burnNext: number;
  psn: number;
  psnUntil: number;
  psnNext: number;
  frzUntil: number;
  boardAt: number;
  paperAt: number;
  bonkAt: number;
  fxAt: number;
};

/** f = 제안 등급을 정하는 층 (레벨 업은 오른 층, 시작 카드는 시작 층) */
type Pending = { k: OfferKind; i: number; at: number; f: number };
type Open = { k: OfferKind; i: number; r: number; cards: CardId[]; f: number };
/** 법인카드 혜택 */
const PERKS = [
  { key: "atk", label: "공격력", v: 0.4 },
  { key: "aspd", label: "공격 속도", v: 0.4 },
  { key: "move", label: "이동 속도", v: 0.3 },
] as const;

const SHOT_CAP = 220;
const FX_CAP = 90;
const DEPTH = 1e5;
const BOARD_R = 24;
const PAPER_R = 13;
const TAU = Math.PI * 2;

export class CardRun<M extends CardMon> {
  readonly kind: CardKindStyle;
  private owned: CardCounts = {};
  private log: CardPick[] = [];
  private s: CardStats = cardStats({});
  private xp = 0;
  private earned = 0;
  private nStart = 0;
  private rerollsUsed = 0;
  private dealsTaken = 0;
  private reviveUsed = false;
  private queue: Pending[] = [];
  private cur: Open | null = null;
  private seq = 0;
  private shots: Shot<M>[] = [];
  /** 쉬는 투사체 (다시 꺼내 쓴다) */
  private free: Shot<M>[] = [];
  private fxPool: Phaser.GameObjects.Image[] = [];
  private fxLive: { img: Phaser.GameObjects.Image; until: number; vy: number; fade: number }[] = [];
  private st = new WeakMap<M, MonSt>();
  private boards: Phaser.GameObjects.Image[] = [];
  private papers: Phaser.GameObjects.Image[] = [];
  private interns: { sprite: Phaser.GameObjects.Sprite; next: number; side: number }[] = [];
  private iceOn = new Map<M, Phaser.GameObjects.Image>();
  private orbitA = 0;
  private bolts: { pts: number[]; until: number }[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private boltsDrawn = false;
  /** 11/15 법인카드 혜택 · 연차 몰아 쓰기(이 시각까지 공격 속도) · 반차가 남았나 · 층마다 한 번 · 지난번에 본 깬 층 수 · SP 쌓기 */
  private temp: { key: string; v: number; until: number } = { key: "", v: 0, until: 0 };
  private leaveUntil = 0;
  private leaveUsed = false;
  private halfReady = true;
  private seenCleared = 0;
  private spAt = 0;
  /** 11/17 능력치에 얹혀 있는 잠깐 혜택 (1 = 법인카드, 2 = 연차 몰아 쓰기) — 하나라도 켜지거나 꺼지면 능력치를 다시 (예전엔 둘 다 끝나야 다시 계산해서 먼저 끝난 쪽이 최대 5초 더 남았다) */
  private buffMask = 0;
  private skillChainAt = 0;
  /** 이번 공격에서 연쇄 번개·토스를 아직 안 썼다 */
  private chainReady = false;
  private tossReady = false;
  private healShown = 0;
  private healAt = 0;
  private off: () => void;

  constructor(
    private readonly h: CardHost<M>,
    private readonly seed: number,
    private readonly start: number,
  ) {
    ensureCardTextures(h.scene);
    this.kind = cardStyleKind(h.style().id);
    this.gfx = h.scene.add.graphics().setDepth(DEPTH + 5);
    this.off = bridge.on("rpg:cardPick", (c) => this.choose(c));
    // 체크포인트 시작: 건너뛴 10층마다 세 장 (첫 층 전에)
    for (let i = 0; i < startPicks(start); i++) this.queue.push({ k: "s", i, at: 0, f: start });
  }

  // ── 고르기 ──

  get picking(): boolean {
    return this.cur !== null;
  }
  get rerollsLeft(): number {
    return Math.max(0, rerollsAllowed(this.h.floorsCleared()) - this.rerollsUsed);
  }

  /** 처치: 판 경험치 → 판 레벨 업이면 고르기를 줄 세운다. 칼퇴 의지 회복 */
  onKill(m: M): void {
    this.xp += runXpOf(m.id) * this.s.xpMul;
    const lv = runLevel(this.xp).level;
    while (this.earned < lv) {
      this.queue.push({ k: "l", i: this.earned, at: this.h.now() + 420, f: this.start + this.h.floorsCleared() });
      this.earned++;
      this.levelFx();
    }
    if (this.s.killHeal > 0 && this.h.hp() < this.h.maxHp()) {
      const n = this.h.maxHp() * this.s.killHeal * this.h.healMul();
      this.h.heal(n, false);
      this.healShown += n;
    }
    // 11/15 회식 2차: 펑 · 법인카드: 가끔 5초 혜택
    if (this.s.explode > 0) this.explode(m);
    if (this.s.corpcard > 0 && Math.random() < this.s.corpcard) this.perk();
    const sx = this.st.get(m);
    if (sx) sx.frzUntil = 0;
    const ice = this.iceOn.get(m);
    if (ice) {
      ice.destroy();
      this.iceOn.delete(m);
    }
  }

  /** 10층마다 우두머리를 잡으면 상사의 제안 */
  bossDeal(floor: number): void {
    this.queue.push({ k: "b", i: floor, at: this.h.now() + 900, f: floor });
  }

  /** 매 프레임 맨 앞 (멈춤과 상관없이): 차례가 된 제안을 연다 */
  tick(): void {
    if (this.cur || !this.queue.length) return;
    const q = this.queue[0];
    if (this.h.now() < q.at || !this.h.canPick()) return;
    this.queue.shift();
    this.cur = { k: q.k, i: q.i, r: 0, f: q.f, cards: cardOffer(this.seed, q.k, q.i, 0, this.owned, q.f) };
    this.h.hold(true);
    this.emit();
  }

  private emit(): void {
    const c = this.cur;
    if (!c) {
      bridge.emit("rpg:cards", null);
      return;
    }
    this.seq++;
    const total = startPicks(this.start);
    bridge.emit("rpg:cards", {
      kind: c.k,
      seq: this.seq,
      cards: [...c.cards],
      owned: { ...this.owned },
      style: this.kind,
      rerolls: c.k === "b" ? 0 : this.rerollsLeft,
      ...(c.k === "l" ? { lv: c.i + 1 } : {}),
      ...(c.k === "s" ? { step: [c.i + 1, total] as [number, number] } : {}),
      ...(c.k === "l" && this.queue.some((q) => q.k === "l") ? { more: this.queue.filter((q) => q.k === "l").length } : {}),
      ...(c.k === "b" ? { floor: c.i } : {}),
    });
    this.h.synth("card-flip", CARD_SND.flip);
    // 11/15 유니크·전설이 섞이면 뒤집히는 순간 따로 울린다
    const top = Math.max(...c.cards.map((id) => RARITIES.indexOf(CARDS[id].rarity)));
    if (top >= 4) this.h.synth("card-legend-in", CARD_SND.revealLegend);
    else if (top >= 3) this.h.synth("card-unique-in", CARD_SND.revealUnique);
  }

  private choose(ch: CardChoice): void {
    const c = this.cur;
    if (!c) return;
    if ("reroll" in ch) {
      if (c.k === "b" || this.rerollsLeft <= 0) return;
      this.rerollsUsed++;
      c.r++;
      c.cards = cardOffer(this.seed, c.k, c.i, c.r, this.owned, c.f);
      this.emit();
      return;
    }
    let id: CardId | null = null;
    if ("accept" in ch) {
      if (c.k !== "b") return;
      if (ch.accept) id = c.cards[0] ?? null;
      else {
        // 거절: 체력을 가득
        const n = this.h.maxHp() - this.h.hp();
        if (n > 0) this.h.heal(n, true);
        const p = this.h.player();
        this.h.ring(p.x, p.y, 0x7ae0a0, 34);
        this.h.flash("정중히 거절했어요. 체력이 가득 찼어요", 1800);
      }
    } else {
      if (c.k === "b") return;
      id = c.cards[ch.slot] ?? null;
      if (!id) return;
    }
    this.cur = null;
    if (id) {
      this.log.push({ k: c.k, i: c.i, r: c.r, c: id, ...(c.k === "l" ? { f: c.f } : {}) });
      if (c.k === "b") {
        this.dealsTaken++;
        this.h.synth("card-deal", CARD_SND.deal);
      }
      this.apply(id);
    }
    // 다음 제안이 바로 줄 서 있으면 (시작 카드·연달아 오른 레벨) 멈춘 채 이어서
    const next = this.queue[0];
    if (next && this.h.canPick()) {
      this.queue.shift();
      this.cur = { k: next.k, i: next.i, r: 0, f: next.f, cards: cardOffer(this.seed, next.k, next.i, 0, this.owned, next.f) };
      this.emit();
      return;
    }
    bridge.emit("rpg:cards", null);
    this.h.hold(false);
  }

  /** 카드 하나를 갖는다: 능력치 다시 계산, 바로 듣는 카드(커피·체력), 도는 것들 다시 만들기 */
  private apply(id: CardId): void {
    const before = this.h.maxHp();
    this.owned[id] = (this.owned[id] ?? 0) + 1;
    this.s = cardStats(this.owned);
    this.h.refresh();
    const after = this.h.maxHp();
    if (id === "health" && after > before) this.h.heal(after - before, true);
    if (id === "coffee") this.h.heal(after * this.s.coffeeHeal * this.h.healMul(), true);
    this.rebuildOrbit();
    const def = CARDS[id];
    const p = this.h.player();
    const legend = def.rarity === "legend";
    const big = legend || def.rarity === "unique";
    const color = RARITY_COLOR[def.rarity];
    this.h.ring(p.x, p.y, color, legend ? 52 : 34);
    this.h.float(p.x, p.y - 26, def.name, `#${color.toString(16).padStart(6, "0")}`, 12);
    this.burst(p.x, p.y - 8, color, legend ? 26 : big ? 18 : 12);
    this.h.synth(legend ? "card-legend" : "card-pick", legend ? CARD_SND.legend : CARD_SND.pick);
    if (big) this.h.shake(legend ? 220 : 120, legend ? 0.006 : 0.003);
  }

  /** 능력치에 카드를 얹는다 (HuntScene이 기본 능력치로 부른다) */
  derive(base: Derived): Derived {
    const s = this.s;
    const now = this.h.now();
    const t = (key: string) => (this.temp.key === key && now < this.temp.until ? this.temp.v : 0) + (key === "aspd" && now < this.leaveUntil ? s.leaveAspd : 0);
    return {
      ...base,
      atk: base.atk * s.atkMul * (1 + t("atk")),
      aspd: base.aspd * s.aspdMul * (1 + t("aspd")),
      crit: base.crit + s.crit,
      maxHp: Math.max(1, Math.round(base.maxHp * s.hpMul * (1 - BOSS_DEAL_HP_COST) ** this.dealsTaken)),
      move: base.move * s.moveMul * (1 + t("move")),
    };
  }
  /** 근접 닿는 거리 (직보) */
  area(base: AttackArea): AttackArea {
    return this.s.pierce && this.kind === "melee" ? { range: Math.round(base.range * (1 + this.s.reach)), arcDeg: base.arcDeg } : base;
  }
  get blastMul(): number {
    return this.s.pierce && this.kind === "magic" ? 1 + this.s.reach : 1;
  }
  /** 11/15 이 적에게 주는 피해 배율: 퇴사 각(내 체력이 적을수록) · 성과급(우두머리·정예) */
  dmgMul(m: M): number {
    const s = this.s;
    let k = 1;
    if (s.resign > 0) k *= 1 + s.resign * Math.max(0, 1 - this.h.hp() / Math.max(1, this.h.maxHp()));
    if (s.bossDmg > 0 && (m.boss || m.elite)) k *= 1 + s.bossDmg;
    return k;
  }

  /** 11/15 받는 피해: 반차(층마다 첫 공격 0) · 사원증 목걸이 · 재택근무(서 있으면). 0이면 안 맞은 것 */
  incoming(dmg: number, moving: boolean): number {
    const s = this.s;
    if (s.halfday && this.halfReady) {
      this.halfReady = false;
      const p = this.h.player();
      this.h.float(p.x, p.y - 26, "반차 썼어요", "#f0d070", 10);
      this.h.ring(p.x, p.y, 0xf0d070, 26);
      this.h.synth("card-block", CARD_SND.block);
      return 0;
    }
    const k = (1 - s.taken) * (moving ? 1 : 1 - s.stillTaken);
    return k < 1 ? Math.max(1, Math.round(dmg * k)) : dmg;
  }

  /** 11/15 스킬 피해 배율 (가진 카드 등급만큼) */
  get skillMul(): number {
    return 1 + this.s.skillDmg;
  }

  /** 11/15 스킬이 맞았다: 불·얼음·독·사내 정치도 붙고, 번개는 0.5초에 한 번 */
  onSkillHit(m: M): void {
    const s = this.s;
    const now = this.h.now();
    if (s.burn || s.chill || s.poison) {
      const x = this.mst(m);
      if (s.burn) {
        if (x.burnUntil < now) x.burnNext = now + 450;
        x.burnUntil = now + 2600;
      }
      if (s.poison) {
        if (x.psnUntil < now) {
          x.psn = 0;
          x.psnNext = now + 500;
        }
        x.psn = Math.min(5, x.psn + 1);
        x.psnUntil = now + 4000;
      }
      if (s.chill && m.alive) {
        m.slowUntil = Math.max(m.slowUntil, now + 1500);
        if (Math.random() < 0.12 && x.frzUntil < now) this.freeze(m, x, m.boss ? 400 : 1100);
      }
    }
    if (s.chain && now >= this.skillChainAt) {
      this.skillChainAt = now + 500;
      this.chain(m);
    }
    if (s.politics > 0 && m.alive && Math.random() < s.politics) this.quarrel(m);
  }

  /** 참조 추가만큼 한 번 피해 */
  get hitMul(): number {
    return this.s.hitMul;
  }
  /** 치명타 피해 배율 (기본 ×1.5에 더한 만큼) */
  get critMul(): number {
    return (1.5 + this.s.critDmg) / 1.5;
  }
  /** 멈추면 집중: 서 있으면 공격 속도 +40% */
  focusMul(moving: boolean): number {
    return moving ? 1 : 1 + FOCUS_ASPD;
  }

  // ── 공격 ──

  /** 원거리 무기의 공격 전부 (기본 한 발 + 갈래·방향·참조 추가). mult = 무기 배율(마무리 포함) */
  fire(fin: boolean, mult: number): void {
    const st = this.h.style();
    const pj = st.projectile!;
    const s = this.s;
    const base = Math.atan2(this.h.face().y, this.h.face().x);
    const fan = fin ? (st.finisher.spread ?? 1) : 1;
    const dirs = [0, ...s.dirs];
    const front = 1 + s.front;
    const pierce = s.pierce ? 99 : pj.pierce;
    const m0 = mult * (s.pierce && pj.pierce > 0 ? 1 + s.pierceDmg : 1);
    const range = this.h.area().range;
    const card = st.id === "card";
    this.chainReady = true;
    const volley = () => {
      const p = this.h.player();
      for (const d of dirs)
        for (let i = 0; i < fan; i++) {
          const ang = base + d + (i - (fan - 1) / 2) * 0.24;
          for (let k = 0; k < front; k++) {
            const off = (k - (front - 1) / 2) * 5;
            const x = p.x + Math.cos(ang) * 6 - Math.sin(ang) * off;
            const y = p.y - 7 + Math.sin(ang) * 4 + Math.cos(ang) * off;
            this.spawnShot(x, y, ang, pj.speed, range, {
              tex: card ? FXT.card : FXT.band,
              spin: card ? 1 : 0,
              pierce,
              mult: m0,
              fall: s.pierce && pj.pierce === 0 ? 0.85 : 1,
              bounce: s.wall ? 2 : 0,
              toss: s.toss,
              basic: true,
              kb: st.kb,
              main: d === 0 && k === 0 && i === (fan - 1) >> 1,
            });
          }
        }
    };
    volley();
    for (let j = 1; j <= s.extra; j++)
      this.h.later(j * 95, () => {
        this.chainReady = true;
        volley();
      });
  }

  /** 근접·마법: 무기 공격 뒤에 덧붙는 것 (방향·앞 갈래·참조 추가). target = 겨냥한 적 (마법) */
  afterAttack(fin: boolean, target: M | null): void {
    this.chainReady = true;
    this.tossReady = true;
    if (this.kind === "ranged") return;
    const st = this.h.style();
    const s = this.s;
    const base = Math.atan2(this.h.face().y, this.h.face().x);
    const mult = st.mult * (fin ? st.finisher.mult : 1);
    if (this.kind === "melee") {
      const a0 = this.h.area();
      const area = fin && (st.finisher.range || st.finisher.arcDeg) ? this.area({ range: st.finisher.range ?? a0.range, arcDeg: st.finisher.arcDeg ?? a0.arcDeg }) : a0;
      const round = (alpha: number) => {
        for (const d of s.dirs) this.h.meleeArc(base + d, area, mult * 0.85, fin, alpha);
      };
      if (s.dirs.length) this.h.later(st.windupMs, () => round(0.8));
      // 병렬 처리: 앞으로 서류 바람 (뚫고 간다)
      if (s.front)
        this.h.later(st.windupMs, () => {
          const p = this.h.player();
          for (let k = 0; k < s.front; k++) {
            const off = (k - (s.front - 1) / 2) * 7;
            this.spawnShot(p.x + Math.cos(base) * 8 - Math.sin(base) * off, p.y - 6 + Math.sin(base) * 6 + Math.cos(base) * off, base, 210, area.range * 2.2 + 30, {
              tex: CDT.wave,
              spin: 0,
              pierce: 99,
              mult: mult * 0.6,
              fall: 1,
              bounce: s.wall ? 1 : 0,
              toss: 0,
              basic: true,
              kb: st.kb * 0.6,
              main: false,
            });
          }
        });
      // 참조 추가: 한 번 더 휘두른다 (방향 카드도 같이)
      for (let j = 1; j <= s.extra; j++)
        this.h.later(st.windupMs + 130 * j, () => {
          this.chainReady = true;
          this.tossReady = true;
          this.h.meleeArc(base, area, mult, fin, 0.95);
          round(0.65);
        });
      return;
    }
    // 마법: 처음 터진 자리 (castInk와 같은 계산)
    const a = this.h.area();
    const p = this.h.player();
    const r = ((fin ? st.finisher.blast : undefined) ?? st.blast ?? 20) * this.blastMul;
    const reach = Math.min(a.range, target ? Math.hypot(target.x - p.x, target.y - p.y) : a.range * 0.55);
    const pt0 = this.h.clampPoint(p.x + Math.cos(base) * reach, p.y + Math.sin(base) * reach);
    const extraPts = (): { x: number; y: number }[] => {
      const out: { x: number; y: number }[] = [];
      const used = new Set<M>(target ? [target] : []);
      // 그쪽에 적이 없으면 터뜨리지 않는다 (빈 바닥에 잉크만 번지지 않게)
      for (const d of s.dirs) {
        const t = this.coneTarget(base + d, a.range, 0.6, used);
        if (!t) continue;
        used.add(t);
        out.push({ x: t.x, y: t.y });
      }
      for (let k = 0; k < s.front; k++) {
        const t = this.coneTarget(base, a.range, 0.9, used);
        if (!t) break;
        used.add(t);
        out.push({ x: t.x, y: t.y });
      }
      return out;
    };
    const pts = extraPts();
    for (const q of pts) this.h.ink(q.x, q.y, r * 0.85, mult * 0.85, st.windupMs + 40);
    for (let j = 1; j <= s.extra; j++) {
      this.h.later(110 * j, () => {
        this.chainReady = true;
        this.tossReady = true;
      });
      this.h.ink(pt0.x, pt0.y, r, mult, st.windupMs + 140 * j);
      for (const q of pts) this.h.ink(q.x, q.y, r * 0.85, mult * 0.85, st.windupMs + 140 * j + 40);
    }
  }

  /** dir 방향 ±half 안에서 가장 가까운 적 (used 빼고) */
  private coneTarget(dir: number, range: number, half: number, used: Set<M>): M | null {
    const p = this.h.player();
    let best: M | null = null;
    let bd = Infinity;
    for (const m of this.h.mons()) {
      if (!m.alive || m.hidden || used.has(m)) continue;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range + this.h.size(m) / 2 || d >= bd) continue;
      const da = Math.atan2(Math.sin(Math.atan2(dy, dx) - dir), Math.cos(Math.atan2(dy, dx) - dir));
      if (Math.abs(da) > half) continue;
      bd = d;
      best = m;
    }
    return best;
  }

  /** 원샷 결재: 일반 몬스터(우두머리·정예 빼고) 5% */
  oneshot(m: M): boolean {
    if (!this.s.oneshot || m.boss || m.elite || Math.random() >= this.s.oneshotP) return false;
    const sz = this.h.size(m);
    this.h.float(m.x, m.y - sz - 6, "원샷 결재!", "#ffd84a", 11);
    this.burst(m.x, m.y - sz / 2, 0xffd84a, 8);
    this.h.synth("card-oneshot", CARD_SND.oneshot);
    return true;
  }

  /** 무기 공격이 맞았다: 불·얼음·독, 공격마다 한 번 연쇄 번개·업무 토스 */
  onBasicHit(m: M): void {
    const s = this.s;
    const now = this.h.now();
    if (s.burn || s.chill || s.poison) {
      const x = this.mst(m);
      if (s.burn) {
        if (x.burnUntil < now) x.burnNext = now + 450;
        x.burnUntil = now + 2600;
      }
      if (s.poison) {
        if (x.psnUntil < now) {
          x.psn = 0;
          x.psnNext = now + 500;
        }
        x.psn = Math.min(5, x.psn + 1);
        x.psnUntil = now + 4000;
      }
      if (s.chill && m.alive) {
        m.slowUntil = Math.max(m.slowUntil, now + 1500);
        if (now >= x.frzUntil) m.sprite.setTint(0x9fdcff);
        if (Math.random() < 0.12 && x.frzUntil < now) this.freeze(m, x, m.boss ? 400 : 1100);
      }
    }
    if (s.chain && this.chainReady) {
      this.chainReady = false;
      this.chain(m);
    }
    // 11/15 사내 정치: 맞은 적이 옆 적을 친다
    if (s.politics > 0 && m.alive && Math.random() < s.politics) this.quarrel(m);
    if (s.toss && this.tossReady && this.kind !== "ranged") {
      this.tossReady = false;
      this.toss(m, s.toss);
    }
  }

  private mst(m: M): MonSt {
    let x = this.st.get(m);
    if (!x) this.st.set(m, (x = { burnUntil: 0, burnNext: 0, psn: 0, psnUntil: 0, psnNext: 0, frzUntil: 0, boardAt: 0, paperAt: 0, bonkAt: 0, fxAt: 0 }));
    return x;
  }

  private freeze(m: M, x: MonSt, ms: number): void {
    const now = this.h.now();
    x.frzUntil = now + ms;
    m.stunUntil = Math.max(m.stunUntil, x.frzUntil);
    const sz = this.h.size(m);
    let ice = this.iceOn.get(m);
    if (!ice) {
      ice = this.h.scene.add.image(m.x, m.y - sz / 2, CDT.ice).setDepth(m.y + 1).setAlpha(0.85);
      this.iceOn.set(m, ice);
    }
    ice.setScale((sz + 6) / 14);
    this.h.float(m.x, m.y - sz - 4, "꽁꽁", "#bfeaff", 9);
  }

  /** 급한 호출: 맞은 적에서 가까운 적 셋을 타고 넘어간다 */
  private chain(from: M): void {
    const seen = new Set<M>([from]);
    const pts = [from.x, from.y - this.h.size(from) / 2];
    let cur: M = from;
    const victims: M[] = [];
    const jumps = this.s.chainJumps;
    const reach = jumps > 3 ? 95 : 78;
    for (let n = 0; n < jumps; n++) {
      let best: M | null = null;
      let bd = reach;
      for (const m of this.h.mons()) {
        if (!m.alive || m.hidden || seen.has(m)) continue;
        const d = Math.hypot(m.x - cur.x, m.y - cur.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (!best) break;
      seen.add(best);
      victims.push(best);
      pts.push(best.x, best.y - this.h.size(best) / 2);
      cur = best;
    }
    if (!victims.length) return;
    this.bolts.push({ pts, until: this.h.now() + 140 });
    this.h.synth("card-zap", CARD_SND.zap);
    victims.forEach((m, i) => this.h.later(25 * (i + 1), () => m.alive && this.h.strike(m, this.s.chainMult, i + 1, { sure: true, kb: 0.3 })));
  }

  /** 업무 토스 (근접·마법): 맞은 적에서 근처 적에게 서류가 날아간다 */
  private toss(from: M, bounces: number): void {
    const t = this.nearestFrom(from.x, from.y, 90, new Set([from]));
    if (!t) return;
    const ang = Math.atan2(t.y - from.y, t.x - from.x);
    const s = this.spawnShot(from.x, from.y - this.h.size(from) / 2, ang, 200, 140, {
      tex: CDT.plane,
      spin: 0,
      pierce: 0,
      mult: 0.55 * this.s.effMul,
      fall: 1,
      bounce: 0,
      toss: bounces - 1,
      basic: false,
      kb: 0.4,
      main: false,
    });
    if (s) {
      s.home = t;
      s.hit.add(from);
    }
  }

  private nearestFrom(x: number, y: number, range: number, skip: Set<M>): M | null {
    let best: M | null = null;
    let bd = range;
    for (const m of this.h.mons()) {
      if (!m.alive || m.hidden || skip.has(m)) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  // ── 투사체 (돌려 쓴다) ──

  private spawnShot(
    x: number,
    y: number,
    ang: number,
    speed: number,
    range: number,
    o: { tex: string; spin: number; pierce: number; mult: number; fall: number; bounce: number; toss: number; basic: boolean; kb: number; main: boolean },
  ): Shot<M> | null {
    let s = this.free.pop();
    if (!s) {
      if (this.shots.length >= SHOT_CAP) {
        if (!o.main) return null;
        s = this.shots[0];
        s.sprite.setVisible(false);
      } else {
        s = {
          on: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          left: 0,
          pierce: 0,
          mult: 0,
          fall: 1,
          hit: new Set(),
          sprite: this.h.scene.add.image(0, 0, o.tex).setDepth(DEPTH),
          spin: 0,
          bounce: 0,
          toss: 0,
          home: null,
          basic: true,
          kb: 1,
        };
        this.shots.push(s);
      }
    }
    s.on = true;
    s.x = x;
    s.y = y;
    s.vx = Math.cos(ang) * speed;
    s.vy = Math.sin(ang) * speed;
    s.left = range;
    s.pierce = o.pierce;
    s.mult = o.mult;
    s.fall = o.fall;
    s.hit.clear();
    s.spin = o.spin;
    s.bounce = o.bounce;
    s.toss = o.toss;
    s.home = null;
    s.basic = o.basic;
    s.kb = o.kb;
    s.sprite.setTexture(o.tex, o.spin ? 0 : undefined).setPosition(x, y).setRotation(ang).setVisible(true).setAlpha(1).setScale(1);
    return s;
  }

  private kill(s: Shot<M>): void {
    if (!s.on) return;
    s.on = false;
    this.free.push(s);
    s.home = null;
    s.hit.clear();
    s.sprite.setVisible(false);
    this.puff(s.x, s.y, 0xffffff, 0.7);
  }

  private updateShots(dt: number, now: number): void {
    const b = this.h.bounds();
    for (const s of this.shots) {
      if (!s.on) continue;
      if (s.home) {
        if (!s.home.alive) s.home = null;
        else {
          const sp = Math.hypot(s.vx, s.vy);
          const want = Math.atan2(s.home.y - this.h.size(s.home) * 0.45 - s.y, s.home.x - s.x);
          const curA = Math.atan2(s.vy, s.vx);
          const turn = Math.atan2(Math.sin(want - curA), Math.cos(want - curA));
          const a = curA + Phaser.Math.Clamp(turn, -10 * dt, 10 * dt);
          s.vx = Math.cos(a) * sp;
          s.vy = Math.sin(a) * sp;
        }
      }
      const step = Math.hypot(s.vx, s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.left -= step;
      // 벽: 반려 후 재상신이면 튕긴다
      let wall = s.x < b.x0 || s.x > b.x1 || s.y < b.y0 || s.y > b.y1;
      if (wall && s.bounce > 0) {
        s.bounce--;
        if (s.x < b.x0 || s.x > b.x1) s.vx = -s.vx;
        if (s.y < b.y0 || s.y > b.y1) s.vy = -s.vy;
        s.x = Phaser.Math.Clamp(s.x, b.x0, b.x1);
        s.y = Phaser.Math.Clamp(s.y, b.y0, b.y1);
        s.left = Math.max(s.left, 40);
        s.hit.clear();
        this.puff(s.x, s.y, 0xffe08a, 0.8);
        wall = false;
      } else if (!wall && s.bounce > 0) {
        const n = this.h.solid(s.x, s.y);
        if (n) {
          s.bounce--;
          const dot = s.vx * n.x + s.vy * n.y;
          if (dot < 0) {
            s.vx -= 2 * dot * n.x;
            s.vy -= 2 * dot * n.y;
          }
          s.left = Math.max(s.left, 40);
          s.hit.clear();
          this.puff(s.x, s.y, 0xffe08a, 0.8);
        }
      }
      s.sprite.setPosition(s.x, s.y);
      if (s.spin) s.sprite.setFrame(Math.floor(now / 60) % 2);
      else s.sprite.setRotation(Math.atan2(s.vy, s.vx));
      if (wall || s.left <= 0) {
        this.kill(s);
        continue;
      }
      for (const m of this.h.mons()) {
        if (!m.alive || m.hidden || s.hit.has(m)) continue;
        const size = this.h.size(m);
        if (Math.abs(m.x - s.x) > size + 4 || Math.abs(m.y - s.y) > size + 4) continue;
        if (Math.hypot(m.x - s.x, m.y - size * 0.45 - s.y) > size / 2 + 3) continue;
        s.hit.add(m);
        this.h.strike(m, s.mult, s.hit.size - 1, { kb: s.kb, basic: s.basic, sure: !s.basic });
        s.mult *= s.fall;
        // 업무 토스 (원거리·서류): 근처 다른 적에게 튕겨 간다
        if (s.toss > 0) {
          const t = this.nearestFrom(s.x, s.y, 85, s.hit);
          if (t) {
            s.toss--;
            const sp = Math.hypot(s.vx, s.vy);
            const a = Math.atan2(t.y - this.h.size(t) * 0.45 - s.y, t.x - s.x);
            s.vx = Math.cos(a) * sp;
            s.vy = Math.sin(a) * sp;
            s.left = Math.max(s.left, 110);
            s.home = t;
            this.puff(s.x, s.y, 0xf0a040, 0.7);
            break;
          }
        }
        if (s.hit.size > s.pierce) {
          this.kill(s);
          break;
        }
      }
    }
  }

  // ── 도는 것들 (결재판·서류 방패·인턴) ──

  private rebuildOrbit(): void {
    const sc = this.h.scene;
    while (this.boards.length < this.s.boards) this.boards.push(sc.add.image(0, 0, CDT.board).setDepth(DEPTH - 2));
    while (this.papers.length < this.s.papers) this.papers.push(sc.add.image(0, 0, CDT.paper).setDepth(DEPTH - 1));
    while (this.interns.length < this.s.interns) {
      const p = this.h.player();
      const side = this.interns.length % 2 ? 1 : -1;
      this.interns.push({ sprite: sc.add.sprite(p.x + side * 14, p.y, CDT.intern, 0).setOrigin(0.5, 1), next: this.h.now() + 400, side });
      this.burst(p.x + side * 14, p.y - 6, 0x6ab0e8, 8);
    }
  }

  private updateOrbit(dt: number, now: number): void {
    const p = this.h.player();
    this.orbitA = (this.orbitA + dt * 3.4) % TAU;
    const nb = this.boards.length;
    this.boards.forEach((b, i) => {
      const a = this.orbitA + (i / nb) * TAU;
      const x = p.x + Math.cos(a) * BOARD_R;
      const y = p.y - 6 + Math.sin(a) * BOARD_R * 0.75;
      b.setPosition(x, y).setRotation(a * 2).setDepth(y + 2);
      for (const m of this.h.mons()) {
        if (!m.alive || m.hidden) continue;
        const sz = this.h.size(m);
        if (Math.hypot(m.x - x, m.y - sz * 0.45 - y) > sz / 2 + 5) continue;
        const st = this.mst(m);
        if (now < st.boardAt) continue;
        st.boardAt = now + 420;
        this.h.strike(m, 0.5 * this.s.effMul, 1, { sure: true, kb: 0.7 });
        this.h.synth("card-board", CARD_SND.board);
      }
    });
    const np = this.papers.length;
    const shots = np ? this.h.enemyShots() : [];
    this.papers.forEach((q, i) => {
      const a = -this.orbitA * 1.35 + (i / np) * TAU;
      const x = p.x + Math.cos(a) * PAPER_R;
      const y = p.y - 7 + Math.sin(a) * PAPER_R * 0.8;
      q.setPosition(x, y).setRotation(-a).setDepth(y + 3);
      for (const s of shots) {
        if (s.until <= 0 || Math.hypot(s.x - x, s.y - y) > 7) continue;
        s.until = 0;
        this.puff(s.x, s.y, 0x9ad0ff, 1);
        this.h.synth("card-block", CARD_SND.block);
      }
      for (const m of this.h.mons()) {
        if (!m.alive || m.hidden) continue;
        const sz = this.h.size(m);
        if (Math.hypot(m.x - x, m.y - sz * 0.45 - y) > sz / 2 + 3) continue;
        const st = this.mst(m);
        if (now < st.paperAt) continue;
        st.paperAt = now + 500;
        this.h.strike(m, 0.2 * this.s.effMul, 1, { sure: true, kb: 1.2 });
      }
    });
    for (const it of this.interns) {
      const tx = p.x + it.side * 15;
      const ty = p.y + 3;
      const k = 1 - Math.exp(-dt * 6);
      it.sprite.setPosition(it.sprite.x + (tx - it.sprite.x) * k, it.sprite.y + (ty - it.sprite.y) * k);
      it.sprite.setFrame(Math.floor(now / 260) % 2).setDepth(it.sprite.y);
      if (now < it.next) continue;
      const t = this.nearestFrom(it.sprite.x, it.sprite.y, 120, new Set());
      if (!t) continue;
      it.next = now + 950;
      it.sprite.setFlipX(t.x < it.sprite.x);
      const ang = Math.atan2(t.y - this.h.size(t) * 0.45 - (it.sprite.y - 8), t.x - it.sprite.x);
      const s = this.spawnShot(it.sprite.x, it.sprite.y - 8, ang, 230, 140, { tex: CDT.paper, spin: 0, pierce: 0, mult: 0.55 * this.s.effMul, fall: 1, bounce: 0, toss: 0, basic: false, kb: 0.4, main: false });
      if (s) s.home = t;
    }
  }

  // ── 상태 (불·독·얼음)·반려 벽꿍 ──

  private updateStatus(now: number): void {
    const s = this.s;
    const b = this.h.bounds();
    for (const m of this.h.mons()) {
      if (!m.alive) continue;
      const x = this.st.get(m);
      // 반려 후 재상신 (근접·마법): 세게 밀려 벽에 부딪히면 한 번 더
      if (s.wall && this.kind !== "ranged") {
        const sp = Math.hypot(m.kbx, m.kby);
        if (sp > 60) {
          const nx = m.x + m.kbx * 0.06;
          const ny = m.y + m.kby * 0.06;
          const out = nx < b.x0 + 4 || nx > b.x1 - 4 || ny < b.y0 + 6 || ny > b.y1 - 2 || !!this.h.solid(nx, ny);
          const st = x ?? this.mst(m);
          if (out && now >= st.bonkAt) {
            st.bonkAt = now + 500;
            this.puff(nx, ny - 4, 0xe84a4a, 1.2);
            this.h.float(m.x, m.y - this.h.size(m) - 4, "반려!", "#ff8a7a", 9);
            this.h.strike(m, 0.5 * this.s.effMul, 1, { sure: true, kb: 0 });
            m.kbx = m.kby = 0;
          }
        }
      }
      if (!x) continue;
      if (x.frzUntil > now) m.stunUntil = Math.max(m.stunUntil, x.frzUntil);
      else if (x.frzUntil) {
        x.frzUntil = 0;
        const ice = this.iceOn.get(m);
        if (ice) {
          ice.destroy();
          this.iceOn.delete(m);
        }
      }
      const ice = this.iceOn.get(m);
      if (ice) ice.setPosition(m.x, m.y - this.h.size(m) / 2).setDepth(m.y + 1);
      if (x.burnUntil > now && now >= x.burnNext) {
        x.burnNext = now + 450;
        this.h.dot(m, 0.16 * this.s.effMul);
      }
      if (x.psn > 0 && x.psnUntil > now && now >= x.psnNext) {
        x.psnNext = now + 500;
        this.h.dot(m, 0.05 * x.psn * this.s.effMul);
      } else if (x.psnUntil <= now) x.psn = 0;
      // 연기·거품 (조금씩)
      if (now >= x.fxAt && m.alive && (x.burnUntil > now || x.psn > 0)) {
        x.fxAt = now + 160;
        const sz = this.h.size(m);
        if (x.burnUntil > now) this.particle(m.x + (Math.random() - 0.5) * sz * 0.7, m.y - sz * (0.3 + Math.random() * 0.5), CDT.flame, -18, 360);
        if (x.psn > 0) this.particle(m.x + (Math.random() - 0.5) * sz * 0.7, m.y - sz * 0.3, CDT.bubble, -10, 420);
      }
    }
  }

  // ── 연출 ──

  private takeFx(tex: string): Phaser.GameObjects.Image | null {
    const img = this.fxPool.pop();
    if (img) return img.setTexture(tex).setVisible(true).setAlpha(1).setScale(1);
    if (this.fxLive.length >= FX_CAP) return null;
    return this.h.scene.add.image(0, 0, tex).setDepth(DEPTH + 1);
  }

  private particle(x: number, y: number, tex: string, vy: number, ms: number): void {
    if (this.h.reduced) return;
    const img = this.takeFx(tex);
    if (!img) return;
    img.setPosition(x, y).setDepth(y + 50);
    if (tex === CDT.flame) img.setFrame(Math.floor(Math.random() * 3));
    this.fxLive.push({ img, until: this.h.now() + ms, vy, fade: ms });
  }

  private puff(x: number, y: number, color: number, k: number): void {
    const img = this.takeFx(CDT.spark);
    if (!img) return;
    img.setPosition(x, y).setTint(color).setScale(k).setDepth(DEPTH + 2);
    this.fxLive.push({ img, until: this.h.now() + 140, vy: 0, fade: 140 });
  }

  private burst(x: number, y: number, color: number, n: number): void {
    if (this.h.reduced) n = Math.min(n, 4);
    const sc = this.h.scene;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4;
      const d = 10 + Math.random() * 14;
      const img = sc.add.image(x, y, CDT.spark).setTint(color).setDepth(DEPTH + 6).setScale(0.6 + Math.random() * 0.5);
      sc.tweens.add({ targets: img, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8 - 4, alpha: 0, scale: 0.2, duration: 420 + Math.random() * 200, ease: "Quad.easeOut", onComplete: () => img.destroy() });
    }
  }

  private levelFx(): void {
    const p = this.h.player();
    this.h.ring(p.x, p.y, 0xffd84a, 40);
    this.burst(p.x, p.y - 10, 0xffe08a, 14);
    this.h.float(p.x, p.y - 30, "판 레벨 업!", "#ffe08a", 12);
    this.h.synth("card-level", CARD_SND.level);
  }

  private updateFx(dt: number, now: number): void {
    if (!this.fxLive.length) return;
    let w = 0;
    for (const f of this.fxLive) {
      if (now >= f.until) {
        f.img.setVisible(false).clearTint();
        this.fxPool.push(f.img);
        continue;
      }
      f.img.y += f.vy * dt;
      f.img.setAlpha(Math.min(1, (f.until - now) / f.fade + 0.2));
      this.fxLive[w++] = f;
    }
    this.fxLive.length = w;
  }

  private drawBolts(now: number): void {
    const g = this.gfx;
    g.clear();
    this.bolts = this.bolts.filter((b) => b.until > now);
    for (const b of this.bolts) {
      const t = (b.until - now) / 140;
      for (const [w, c, a] of [
        [3, 0x7a7aff, 0.5 * t],
        [1, 0xfff6a0, t],
      ] as const) {
        g.lineStyle(w, c, a);
        g.beginPath();
        g.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) {
          const x0 = b.pts[i - 2];
          const y0 = b.pts[i - 1];
          const x1 = b.pts[i];
          const y1 = b.pts[i + 1];
          // 지그재그 두 마디
          for (const k of [0.33, 0.66]) g.lineTo(x0 + (x1 - x0) * k + (Math.random() - 0.5) * 6, y0 + (y1 - y0) * k + (Math.random() - 0.5) * 6);
          g.lineTo(x1, y1);
        }
        g.strokePath();
      }
    }
  }

  /** 매 프레임 (멈춤·히트스톱이 아닐 때) */
  update(dt: number): void {
    const now = this.h.now();
    this.perFloor(now);
    this.updateShots(dt, now);
    if (this.boards.length || this.papers.length || this.interns.length) this.updateOrbit(dt, now);
    this.updateStatus(now);
    this.updateFx(dt, now);
    if (this.bolts.length || this.boltsDrawn) {
      this.drawBolts(now);
      this.boltsDrawn = this.bolts.length > 0;
    }
    if (this.healShown >= 1 && now >= this.healAt) {
      this.healAt = now + 700;
      const p = this.h.player();
      this.h.float(p.x + 10, p.y - 22, `+${Math.round(this.healShown)}`, "#7ae0a0", 9);
      this.healShown = 0;
    }
  }

  /** 11/17 무한 야근으로 일어날 때 체력 비율 (팀장 승진이면 더) */
  get reviveHp(): number {
    return this.s.reviveHp;
  }

  /** 무한 야근: 쓰러지는 순간 한 번 (true면 일어났다 — 체력(reviveHp)·무적은 부르는 쪽이) */
  revive(): boolean {
    if (!this.s.revive || this.reviveUsed) return false;
    this.reviveUsed = true;
    const p = this.h.player();
    this.h.ring(p.x, p.y, 0xffd84a, 60);
    this.burst(p.x, p.y - 10, 0xffd84a, 24);
    this.h.flash("무한 야근! 다시 일어났어요", 2200);
    this.h.synth("card-revive", CARD_SND.revive);
    this.h.shake(260, 0.006);
    return true;
  }

  // ── 11/15 등급 개편 카드 (회식 2차·사내 정치·법인카드·탕비실 간식·반차·믹스커피·연차 몰아 쓰기) ──

  /** 층을 깰 때마다(반차·연차 다시, 탕비실 간식), 1초마다 SP, 체력이 바닥이면 연차, 혜택이 끝나면 능력치 다시 */
  private perFloor(now: number): void {
    const s = this.s;
    const cleared = this.h.floorsCleared();
    if (cleared > this.seenCleared) {
      this.seenCleared = cleared;
      this.halfReady = true;
      this.leaveUsed = false;
      if (s.floorHeal > 0 && this.h.hp() < this.h.maxHp()) this.h.heal(this.h.maxHp() * s.floorHeal * this.h.healMul(), true);
    }
    if (s.spRegen > 0 && now >= this.spAt) {
      this.spAt = now + 1000;
      this.h.addSp(s.spRegen);
    }
    if (s.leave && !this.leaveUsed && this.h.hp() > 0 && this.h.hp() < this.h.maxHp() * 0.3) {
      this.leaveUsed = true;
      this.leaveUntil = now + 5000;
      this.buffMask |= 2;
      this.h.invuln(3000);
      this.h.refresh();
      const p = this.h.player();
      this.h.ring(p.x, p.y, 0x7ad0f0, 46);
      this.burst(p.x, p.y - 10, 0x7ad0f0, 18);
      this.h.flash("연차 몰아 쓰기! 3초 동안 무적이에요", 1800);
      this.h.synth("card-revive", CARD_SND.revive);
    }
    const mask = (now < this.temp.until ? 1 : 0) | (now < this.leaveUntil ? 2 : 0);
    if (mask !== this.buffMask) {
      this.buffMask = mask;
      this.h.refresh();
    }
  }

  /** 회식 2차: 잡은 자리에서 펑 (둘레 적, 터져 죽은 적도 또 터진다) */
  private explode(m: M): void {
    const x = m.x;
    const y = m.y;
    const r = 28;
    this.h.later(60, () => {
      this.burst(x, y - 6, 0xff8a3a, 10);
      this.h.ring(x, y, 0xff8a3a, r);
      this.h.synth("card-pop", CARD_SND.pop);
      let k = 0;
      for (const o of [...this.h.mons()])
        if (o.alive && !o.hidden && o !== m && Math.hypot(o.x - x, o.y - y) < r + this.h.size(o) / 2) this.h.strike(o, this.s.explode, ++k, { sure: true, kb: 1.2 });
    });
  }

  /** 법인카드: 5초 혜택 하나 (공격력·공격 속도·이동 속도) */
  private perk(): void {
    const now = this.h.now();
    const pk = PERKS[Math.floor(Math.random() * PERKS.length)];
    const v = pk.v * this.s.effMul;
    this.temp = { key: pk.key, v, until: now + 5000 };
    this.buffMask |= 1;
    this.h.refresh();
    const p = this.h.player();
    this.h.float(p.x, p.y - 30, `법인카드! ${pk.label} +${Math.round(v * 100)}%`, "#e8c86a", 10);
    this.h.synth("card-pick", CARD_SND.pick);
  }

  /** 사내 정치: 맞은 적이 옆 적에게 화풀이 */
  private quarrel(m: M): void {
    const t = this.nearestFrom(m.x, m.y, 60, new Set([m]));
    if (!t) return;
    this.h.float(m.x, m.y - this.h.size(m) - 6, "!?", "#d8a0ff", 10);
    this.h.later(120, () => {
      if (!t.alive) return;
      this.puff(t.x, t.y - this.h.size(t) / 2, 0xb86ad8, 1.3);
      this.h.strike(t, 0.6 * this.s.effMul, 1, { sure: true, kb: 1 });
    });
  }

  /** 지금 카드 수치 (HUD 능력치 판) · 남은 반차·부활·연차 */
  get stats(): CardStats {
    return this.s;
  }
  get spare(): { revive: boolean; halfday: boolean; leave: boolean } {
    return { revive: this.s.revive && !this.reviveUsed, halfday: this.s.halfday && this.halfReady, leave: this.s.leave && !this.leaveUsed };
  }

  // ── 화면·결과 ──

  hud(focus: boolean): NonNullable<RpgHud["run"]> {
    const L = runLevel(this.xp);
    return {
      lv: L.level,
      xp: L.into,
      need: L.need,
      cards: (Object.entries(this.owned) as [CardId, number][]).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n })),
      rerolls: this.rerollsLeft,
      focus,
      kind: this.kind,
    };
  }

  picks(): CardPick[] {
    return this.log.map((p) => ({ ...p }));
  }

  /** 가진 카드 (디버그·테스트) */
  get counts(): CardCounts {
    return { ...this.owned };
  }

  destroy(): void {
    this.off();
    if (this.cur) {
      this.cur = null;
      bridge.emit("rpg:cards", null);
    }
    this.queue = [];
    for (const s of this.shots) s.sprite.destroy();
    this.shots = [];
    this.free = [];
    for (const f of this.fxLive) f.img.destroy();
    for (const f of this.fxPool) f.destroy();
    this.fxLive = [];
    this.fxPool = [];
    for (const b of this.boards) b.destroy();
    for (const p of this.papers) p.destroy();
    for (const it of this.interns) it.sprite.destroy();
    for (const ice of this.iceOn.values()) ice.destroy();
    this.iceOn.clear();
    this.boards = [];
    this.papers = [];
    this.interns = [];
    this.gfx.destroy();
  }
}
