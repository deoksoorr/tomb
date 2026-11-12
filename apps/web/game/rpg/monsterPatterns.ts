import { inTelegraph, PATTERNS, patternTiming, type PatternId, type PatternTiming, type TelegraphShape } from "@/lib/rpg/patterns";
import type { Difficulty } from "@/lib/rpg/catalog";
import type { Telegraph, TelegraphLayer } from "./telegraph";

// 2번 몬스터 공격 패턴 실행기: 패턴 이름(PatternId)마다 "경고 깔기 → 다 차면 판정" 동작을 한 곳에 모았다.
// 새 몬스터·보스는 catalog의 MonsterDef.patterns / phases에 이름만 적으면 이 동작을 그대로 쓴다.
// 씬(HuntScene)은 PatternHost만 채워 주면 된다 (몬스터 이동·피해·발사·효과).

/** 패턴을 쓰는 동안의 상태 */
export type Cast = {
  id: PatternId;
  tele: Telegraph[];
  /** 이 시각까지 패턴 중 (경고 + 동작) */
  until: number;
  /** 경고 동안 제자리 */
  root: boolean;
  /** 맞으면 취소되는 패턴 (물기) */
  fragile: boolean;
  /** 돌진: 방향·끝 시각·맞혔는지 */
  dash?: { ux: number; uy: number; speed: number; from: number; to: number; hit: boolean; mult: number };
};

export interface PatternMon {
  x: number;
  y: number;
  alive: boolean;
  hidden: boolean;
  cast: Cast | null;
  patReady: Partial<Record<PatternId, number>>;
  /** 다음 패턴을 시작할 수 있는 가장 이른 시각 (패턴 사이 숨 고르기) */
  nextCastAt: number;
}

export interface PatternHost<M extends PatternMon> {
  readonly now: number;
  readonly difficulty: Difficulty;
  readonly tele: TelegraphLayer;
  player(): { x: number; y: number; r: number };
  size(m: M): number;
  /** 우두머리 단계 쿨타임 배율 (1 = 그대로) */
  haste(m: M): number;
  boss(m: M): boolean;
  /** 물기: 명중·회피 굴림을 하는 평범한 공격 */
  bite(m: M, mult: number): void;
  /** 경고가 있었던 공격: 회피 굴림 없이 (자리로 피한다) */
  strikePlayer(m: M, mult: number): void;
  shoot(m: M, angle: number, speed: number, mult: number): void;
  moveMon(m: M, dx: number, dy: number): void;
  /** 자폭: 처치로 치고 터지는 효과 */
  explode(m: M): void;
  setHidden(m: M, hidden: boolean): void;
  place(m: M, x: number, y: number): void;
  /** 몸이 경고 색으로 깜빡이며 부푼다 (ms 동안) */
  windupLook(m: M, ms: number, heavy: boolean): void;
  clampPoint(x: number, y: number): { x: number; y: number };
  sfx(name: "warn" | "slam" | "shoot" | "dash", gain?: number): void;
  fx(kind: "slam" | "nova" | "breath" | "rain", x: number, y: number, r: number, angle?: number): void;
}

/** 패턴 동작 하나: 시작하면 Cast를 돌려준다 */
export type PatternRunner = <M extends PatternMon>(h: PatternHost<M>, m: M, t: PatternTiming, mult: number) => Cast;

/** 난이도별 한꺼번에 깔 수 있는 경고 수 (물기 제외) — 화면이 경고로 뒤덮이지 않게 */
export const MAX_PENDING_TELEGRAPHS: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 6, hell: 8 };
/** 패턴과 패턴 사이 최소 숨 고르기 ms */
export const CAST_GAP_MS = 350;

const angleTo = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);

function hitIf<M extends PatternMon>(h: PatternHost<M>, m: M, t: Telegraph, mult: number, viaRoll = false): boolean {
  const p = h.player();
  if (!m.alive && !viaRoll) return false;
  if (!inTelegraph(t.shape, t.x, t.y, t.angle, p.x, p.y, p.r)) return false;
  if (viaRoll) h.bite(m, mult);
  else h.strikePlayer(m, mult);
  return true;
}

function cast<M extends PatternMon>(h: PatternHost<M>, id: PatternId, tele: Telegraph[], until: number, extra: Partial<Cast> = {}): Cast {
  return { id, tele, until, root: true, fragile: false, ...extra };
}

const shapeOf = (id: PatternId): TelegraphShape => PATTERNS[id].shape;

export const PATTERN_RUNNERS: Record<PatternId, PatternRunner> = {
  bite(h, m, t, mult) {
    const p = h.player();
    const s = h.size(m);
    const ang = angleTo(m.x, m.y, p.x, p.y);
    const shape: TelegraphShape = { kind: "cone", r: s / 2 + 12, arcDeg: 100 };
    const tl = h.tele.add(shape, m.x, m.y, ang, h.now, t.windupMs, (tt) => m.alive && hitIf(h, m, tt, mult, true), 0xff6a3c);
    return cast(h, "bite", [tl], h.now + t.windupMs + 60, { fragile: !h.boss(m) });
  },

  slam(h, m, t, mult) {
    const p = h.player();
    const c = h.clampPoint(p.x, p.y);
    const s = shapeOf("slam");
    const tl = h.tele.add(s, c.x, c.y, 0, h.now, t.windupMs, (tt) => {
      if (!m.alive) return;
      h.fx("slam", tt.x, tt.y, s.kind === "circle" ? s.r : 20);
      h.sfx("slam", 0.6);
      hitIf(h, m, tt, mult);
    });
    h.windupLook(m, t.windupMs, true);
    h.sfx("warn", 0.5);
    return cast(h, "slam", [tl], h.now + t.windupMs + 200);
  },

  charge(h, m, t, mult) {
    const p = h.player();
    const s = h.size(m);
    const base = shapeOf("charge");
    const len = base.kind === "line" ? base.len : 96;
    const shape: TelegraphShape = { kind: "line", len, width: Math.max(base.kind === "line" ? base.width : 16, s + 4) };
    const ang = angleTo(m.x, m.y, p.x, p.y);
    const DASH_MS = 300;
    const c = cast(h, "charge", [], h.now + t.windupMs + DASH_MS + 160);
    c.tele.push(
      h.tele.add(shape, m.x, m.y, ang, h.now, t.windupMs, () => {
        if (!m.alive) return;
        c.dash = { ux: Math.cos(ang), uy: Math.sin(ang), speed: (len - s / 2) / (DASH_MS / 1000), from: h.now, to: h.now + DASH_MS, hit: false, mult };
        h.sfx("dash", 0.6);
      }),
    );
    h.windupLook(m, t.windupMs, false);
    h.sfx("warn", 0.4);
    return c;
  },

  aimed_shot(h, m, t, mult) {
    const p = h.player();
    const ang = angleTo(m.x, m.y, p.x, p.y);
    const tl = h.tele.add(shapeOf("aimed_shot"), m.x, m.y, ang, h.now, t.windupMs, () => {
      if (!m.alive) return;
      h.shoot(m, ang, 115, mult);
      h.sfx("shoot", 0.4);
    }, 0xff8a5a);
    return cast(h, "aimed_shot", [tl], h.now + t.windupMs + 80);
  },

  fan_volley(h, m, t, mult) {
    const p = h.player();
    const ang = angleTo(m.x, m.y, p.x, p.y);
    const s = shapeOf("fan_volley");
    const arc = s.kind === "cone" ? (s.arcDeg * Math.PI) / 180 : 0.9;
    const tl = h.tele.add(s, m.x, m.y, ang, h.now, t.windupMs, () => {
      if (!m.alive) return;
      const n = Math.max(2, t.count);
      for (let i = 0; i < n; i++) h.shoot(m, ang - arc / 2 + (arc * i) / (n - 1), 100, mult);
      h.sfx("shoot", 0.6);
    });
    h.windupLook(m, t.windupMs, false);
    h.sfx("warn", 0.5);
    return cast(h, "fan_volley", [tl], h.now + t.windupMs + 120);
  },

  self_destruct(h, m, t, mult) {
    const tl = h.tele.add(shapeOf("self_destruct"), m.x, m.y, 0, h.now, t.windupMs, (tt) => {
      if (!m.alive) return;
      hitIf(h, m, tt, mult);
      h.explode(m);
    });
    h.windupLook(m, t.windupMs, true);
    h.sfx("warn", 0.6);
    return cast(h, "self_destruct", [tl], h.now + t.windupMs + 50);
  },

  ambush(h, m, t, mult) {
    const p = h.player();
    const c = h.clampPoint(p.x, p.y);
    h.setHidden(m, true);
    const tl = h.tele.add(shapeOf("ambush"), c.x, c.y, 0, h.now, t.windupMs, (tt) => {
      if (!m.alive) return;
      h.place(m, tt.x, tt.y);
      h.setHidden(m, false);
      hitIf(h, m, tt, mult);
      h.fx("slam", tt.x, tt.y, 14);
    }, 0xc86aff);
    h.sfx("warn", 0.4);
    return cast(h, "ambush", [tl], h.now + t.windupMs + 250);
  },

  nova(h, m, t, mult) {
    const s = shapeOf("nova");
    const tl = h.tele.add(s, m.x, m.y, 0, h.now, t.windupMs, (tt) => {
      if (!m.alive) return;
      h.fx("nova", tt.x, tt.y, s.kind === "ring" ? s.r1 : 60);
      h.sfx("slam", 0.7);
      hitIf(h, m, tt, mult);
    });
    h.windupLook(m, t.windupMs, true);
    h.sfx("warn", 0.7);
    return cast(h, "nova", [tl], h.now + t.windupMs + 200);
  },

  rain(h, m, t, mult) {
    const p = h.player();
    const tele: Telegraph[] = [];
    const n = Math.max(1, t.count);
    for (let i = 0; i < n; i++) {
      // 첫 번째는 내 자리, 나머지는 둘레 (피할 빈자리는 늘 남는다)
      const a = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : 24 + Math.random() * 34;
      const c = h.clampPoint(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      tele.push(
        h.tele.add(shapeOf("rain"), c.x, c.y, 0, h.now, t.windupMs + i * 110, (tt) => {
          if (!m.alive) return;
          h.fx("rain", tt.x, tt.y, 18);
          hitIf(h, m, tt, mult);
        }),
      );
    }
    h.sfx("warn", 0.6);
    return cast(h, "rain", tele, h.now + 300, { root: false });
  },

  cross(h, m, t, mult) {
    const p = h.player();
    const s = shapeOf("cross");
    const len = s.kind === "line" ? s.len : 180;
    const a0 = Math.random() < 0.5 ? 0 : Math.PI / 4;
    const tele = [a0, a0 + Math.PI / 2].map((a) =>
      h.tele.add(s, p.x - (Math.cos(a) * len) / 2, p.y - (Math.sin(a) * len) / 2, a, h.now, t.windupMs, (tt) => {
        if (!m.alive) return;
        h.sfx("slam", 0.5);
        hitIf(h, m, tt, mult);
      }),
    );
    h.windupLook(m, t.windupMs, true);
    h.sfx("warn", 0.7);
    return cast(h, "cross", tele, h.now + t.windupMs + 200);
  },

  breath(h, m, t, mult) {
    const p = h.player();
    const ang = angleTo(m.x, m.y, p.x, p.y);
    const s = shapeOf("breath");
    const tl = h.tele.add(s, m.x, m.y, ang, h.now, t.windupMs, (tt) => {
      if (!m.alive) return;
      h.fx("breath", tt.x, tt.y, s.kind === "cone" ? s.r : 80, ang);
      hitIf(h, m, tt, mult);
    }, 0xff7a1e);
    h.windupLook(m, t.windupMs, true);
    h.sfx("warn", 0.7);
    return cast(h, "breath", [tl], h.now + t.windupMs + 250);
  },
};

/**
 * 쓸 수 있는 패턴 하나를 골라 시작한다 (없으면 null). ids: monsterPatterns()가 준 목록.
 * 물기가 아닌 패턴을 먼저 (무작위 순서), 다 쿨타임이면 붙어 있을 때 물기.
 */
export function tryStartPattern<M extends PatternMon>(h: PatternHost<M>, m: M, ids: readonly PatternId[]): Cast | null {
  const now = h.now;
  if (m.cast || m.hidden || now < m.nextCastAt) return null;
  const p = h.player();
  const dist = Math.hypot(p.x - m.x, p.y - m.y);
  const reach = h.size(m) / 2 + 9;
  const specials = ids.filter((id) => id !== "bite");
  for (let i = specials.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [specials[i], specials[j]] = [specials[j], specials[i]];
  }
  const cap = MAX_PENDING_TELEGRAPHS[h.difficulty];
  for (const id of specials) {
    if ((m.patReady[id] ?? 0) > now) continue;
    if (dist > PATTERNS[id].trigger) continue;
    if (h.tele.pending >= cap && !h.boss(m)) continue;
    return begin(h, m, id);
  }
  if (ids.includes("bite") && (m.patReady.bite ?? 0) <= now && dist <= reach) return begin(h, m, "bite");
  return null;
}

function begin<M extends PatternMon>(h: PatternHost<M>, m: M, id: PatternId): Cast {
  const t = patternTiming(id, h.difficulty, h.haste(m));
  const c = PATTERN_RUNNERS[id](h, m, t, PATTERNS[id].dmgMult * (h.boss(m) && id === "bite" ? 1.3 : 1));
  m.cast = c;
  m.patReady[id] = h.now + t.windupMs + t.cooldownMs;
  m.nextCastAt = c.until + CAST_GAP_MS;
  return c;
}

/** 매 프레임 (패턴 중일 때): 돌진 이동, 끝나면 정리. true면 이번 프레임은 몬스터가 스스로 움직이지 않는다 */
export function updateCast<M extends PatternMon>(h: PatternHost<M>, m: M, dt: number): boolean {
  const c = m.cast;
  if (!c) return false;
  const now = h.now;
  if (c.dash && now >= c.dash.from && now < c.dash.to) {
    h.moveMon(m, c.dash.ux * c.dash.speed * dt, c.dash.uy * c.dash.speed * dt);
    const p = h.player();
    if (!c.dash.hit && Math.hypot(p.x - m.x, p.y - m.y) < h.size(m) / 2 + p.r + 2) {
      c.dash.hit = true;
      h.strikePlayer(m, c.dash.mult);
    }
  }
  if (now >= c.until) {
    m.cast = null;
    return false;
  }
  return c.root || !!c.dash;
}

/** 패턴 취소 (몬스터가 죽음·물기 중 맞음·단계 바뀜) */
export function cancelCast<M extends PatternMon>(h: PatternHost<M>, m: M): void {
  const c = m.cast;
  if (!c) return;
  for (const t of c.tele) if (!t.fired) h.tele.cancel(t);
  if (m.hidden && c.id === "ambush" && m.alive) h.setHidden(m, false);
  m.cast = null;
}

/** 새로 나온 몬스터: 패턴 쿨타임을 흩어 둔다 (한꺼번에 쏟아지지 않게) */
export function seedPatternTimers(m: PatternMon, ids: readonly PatternId[], now: number, d: Difficulty): void {
  for (const id of ids) m.patReady[id] = now + 600 + Math.random() * patternTiming(id, d).cooldownMs * 0.7;
  m.nextCastAt = now + 500;
}
