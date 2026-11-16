// 11/16 r19 사용자: 카약·제트스키·튜브를 타거나 헤엄치다 다른 배·놀거리(카약·제트스키·튜브, 마을 조각배·오리배)에 부딪히면
// 그 자리에 딱 멈추지 말고 살짝 튕겨 나가요. 순수 로직 (Phaser 없이 시험 — bounce.test).
//  - 닿은 면의 바깥쪽(접촉 법선)으로 짧게 밀려나요. 세기는 들이받은 속도에 비례 (제트스키는 세게, 튜브·헤엄은 살살)
//  - 튕긴 뒤 0.3초 동안은 방향키가 덜 먹어요 (조종이 잠깐 무뎌져요)
//  - 밀려나는 길은 축마다 따로 확인해요 — 데크·난간·바위·물 밖으로는 절대 밀지 않아요 (그 축은 멈춰요)
//  - 각자 자기 몸·자기 놀거리만 고쳐요 (평소 MOVE로 남들 화면에도 보여요). 빈 놀거리는 그림만 살짝 밀렸다 돌아와요(nudge)

export type BounceKind = "jetski" | "kayak" | "tube" | "swim" | "row" | "duck";

/** 튕겨 나가는 첫 속도 (px/s) = base + k × 들이받던 속도, 위로 max */
export const BOUNCE_GAIN: Readonly<Record<BounceKind, { base: number; k: number; max: number }>> = {
  jetski: { base: 34, k: 0.85, max: 120 },
  kayak: { base: 22, k: 0.7, max: 56 },
  row: { base: 22, k: 0.7, max: 60 },
  duck: { base: 22, k: 0.7, max: 56 },
  tube: { base: 14, k: 0.5, max: 30 },
  swim: { base: 22, k: 0.5, max: 40 },
};
/** 튕긴 뒤 방향키가 덜 먹는 시간 · 그동안의 배율 */
export const BOUNCE_DAMP_MS = 300;
export const BOUNCE_CONTROL = 0.2;
/** 이보다 느리게 닿으면 튕기지 않고 겹친 만큼만 떼어 놓아요 (타자마자 옆에 매어 둔 것에 스쳐 덜컥이지 않게) */
export const BOUNCE_MIN_INTO = 10;
/** 같은 부딪힘을 프레임마다 다시 세지 않게 (떨림 방지) */
export const BOUNCE_COOLDOWN_MS = 350;
/** 밀려나는 속도가 줄어드는 시간 (ms) — 0.4초면 거의 다 서요 (밀려나는 거리 ≈ 첫 속도 × 0.15초) */
export const BOUNCE_TAU = 150;
/** 빈 놀거리가 밀렸다 돌아오는 시간 · 가장 많이 밀리는 거리 (px) */
export const NUDGE_MS = 600;
export const NUDGE_MAX = 4;

export type Box = { x: number; y: number; w: number; h: number };
/** 접촉: 나를 밀어내는 쪽(단위 벡터, 축 방향) · 겹친 깊이 */
export type Contact = { nx: number; ny: number; depth: number };

/**
 * 두 몸 상자가 겹쳤으면 나(me)를 밀어낼 방향과 깊이. 덜 겹친 축으로 (모서리를 스칠 때 옆으로 미끄러지게), 같으면 가운데 차이가 큰 쪽.
 * 축 방향만 써서 밀려나는 길을 축마다 확인할 수 있어요 (데크 안으로 비스듬히 들어가지 않게)
 */
export function hullContact(me: Box, o: Box): Contact | null {
  const ox = Math.min(me.x + me.w, o.x + o.w) - Math.max(me.x, o.x);
  const oy = Math.min(me.y + me.h, o.y + o.h) - Math.max(me.y, o.y);
  if (ox <= 0 || oy <= 0) return null;
  // 네 쪽으로 빠져나가는 거리 (나를 그쪽으로 이만큼 옮기면 안 겹쳐요) — 가장 짧은 쪽, 같으면 가운데가 치우친 쪽
  const dx = me.x + me.w / 2 - (o.x + o.w / 2);
  const dy = me.y + me.h / 2 - (o.y + o.h / 2);
  const outs: Contact[] = [
    { nx: -1, ny: 0, depth: me.x + me.w - o.x },
    { nx: 1, ny: 0, depth: o.x + o.w - me.x },
    { nx: 0, ny: -1, depth: me.y + me.h - o.y },
    { nx: 0, ny: 1, depth: o.y + o.h - me.y },
  ];
  const lean = (c: Contact) => (c.nx !== 0 ? c.nx * dx * o.h : c.ny * dy * o.w);
  outs.sort((a, b) => a.depth - b.depth || lean(b) - lean(a));
  return outs[0];
}

/**
 * 11/16 r19 움직이는 큰 배에 부딪혔을 때 (내 놀거리·헤엄 종류와 상관없이 배가 세게 밀어내요): 화물선·유조선은 세게, 오징어잡이배·고깃배는 중간
 */
export const SHIP_GAIN: Readonly<Record<"big" | "medium", { base: number; k: number; max: number }>> = {
  big: { base: 70, k: 1, max: 170 },
  medium: { base: 42, k: 0.8, max: 100 },
};
export type BounceOpts = { gain?: { base: number; k: number; max: number }; minInto?: number };

/** 튕겨 나가는 첫 속도: 법선 쪽으로 들이받던 속도에 비례 (base부터). gain을 주면 그 세기로 (움직이는 배) */
export function bounceSpeed(kind: BounceKind, vx: number, vy: number, c: Pick<Contact, "nx" | "ny">, gain = BOUNCE_GAIN[kind]): number {
  const into = Math.max(0, -(vx * c.nx + vy * c.ny));
  return Math.min(gain.max, gain.base + gain.k * into);
}

/** 한 사람(내 몸·내 놀거리)의 튕김 상태 */
export class Bounce {
  vx = 0;
  vy = 0;
  private dampUntil = -Infinity;
  private lastAt = -Infinity;

  /** 부딪혔어요: 법선 쪽으로 튕겨요. 쉬는 중(방금 튕김)이거나 거의 서서 닿았으면 0, 아니면 튕긴 속도 */
  hit(now: number, c: Pick<Contact, "nx" | "ny">, kind: BounceKind, vx: number, vy: number, opts: BounceOpts = {}): number {
    if (now - this.lastAt < BOUNCE_COOLDOWN_MS) return 0;
    if (-(vx * c.nx + vy * c.ny) < (opts.minInto ?? BOUNCE_MIN_INTO)) return 0;
    const s = bounceSpeed(kind, vx, vy, c, opts.gain);
    this.vx = c.nx * s;
    this.vy = c.ny * s;
    this.lastAt = now;
    this.dampUntil = now + BOUNCE_DAMP_MS;
    return s;
  }

  /** 방향키 배율 (튕긴 직후 잠깐 무뎌요) */
  control(now: number): number {
    return now < this.dampUntil ? BOUNCE_CONTROL : 1;
  }

  get active(): boolean {
    return this.vx !== 0 || this.vy !== 0;
  }

  /** 이번 프레임에 밀려나는 만큼 (속도는 줄어들어요) */
  take(dtMs: number): { dx: number; dy: number } {
    if (!this.active) return { dx: 0, dy: 0 };
    const dt = Math.min(100, Math.max(0, dtMs));
    const f = Math.exp(-dt / BOUNCE_TAU);
    // 이 프레임 동안 줄어드는 속도를 적분한 거리
    const k = (BOUNCE_TAU * (1 - f)) / 1000;
    const d = { dx: this.vx * k, dy: this.vy * k };
    this.vx *= f;
    this.vy *= f;
    if (Math.hypot(this.vx, this.vy) < 1) this.vx = this.vy = 0;
    return d;
  }

  /** 막힌 축은 그만 밀어요 */
  stopX(): void {
    this.vx = 0;
  }
  stopY(): void {
    this.vy = 0;
  }

  reset(): void {
    this.vx = this.vy = 0;
    this.dampUntil = -Infinity;
  }
}

/** 밀려나는 만큼 옮겨요 — 축마다 따로, 갈 수 없는 쪽(데크·바위·물 밖)이면 그 축은 그대로 두고 그만 밀어요 */
export function knockMove(p: { x: number; y: number }, d: { dx: number; dy: number }, ok: (x: number, y: number) => boolean, b?: Bounce): void {
  if (d.dx !== 0) {
    if (ok(p.x + d.dx, p.y)) p.x += d.dx;
    else b?.stopX();
  }
  if (d.dy !== 0) {
    if (ok(p.x, p.y + d.dy)) p.y += d.dy;
    else b?.stopY();
  }
}

export type HullHit = { contact: Contact; index: number; vx: number; vy: number };
/** 11/16 r19 거의 서서 겹친 것(내리자마자·태어나자마자 겹친 사람·놀거리)은 한 번에 이만큼씩만 떼어 놓아요 (덜컥 튀지 않게) */
export const GENTLE_STEP = 1.2;
/** 겹친 것의 속도 (움직이는 다른 사람·놀거리·배) — 서로 다가간 만큼으로 들이받음을 재요 */
export type HullOpts = { gentle?: (index: number) => boolean; vel?: (index: number) => { vx: number; vy: number } };

/**
 * 내 몸 상자가 다른 것들과 겹쳤으면: 겹친 만큼 밖으로 밀어내고(갈 수 있을 때만 — 데크 쪽이면 그대로), 들이받던 속도는 버려요.
 * 처음 닿은 것 (부딪히기 전 속도와 함께) — 없으면 null
 */
export function resolveHulls(
  m: { x: number; y: number; vx: number; vy: number },
  box: (x: number, y: number) => Box,
  others: readonly Box[],
  ok: (x: number, y: number) => boolean,
  opts: HullOpts = {},
): HullHit | null {
  let first: HullHit | null = null;
  const vx = m.vx;
  const vy = m.vy;
  others.forEach((o, index) => {
    const c = hullContact(box(m.x, m.y), o);
    if (!c) return;
    first ??= { contact: c, index, vx, vy };
    // 거의 서서 겹쳤으면 (서로 다가가는 속도가 작으면) 조금씩만 떼어 놓아요
    const ov = opts.vel?.(index) ?? { vx: 0, vy: 0 };
    const into = -((vx - ov.vx) * c.nx + (vy - ov.vy) * c.ny);
    const cap = opts.gentle?.(index) && into < BOUNCE_MIN_INTO ? GENTLE_STEP : Infinity;
    // 덜 겹친 쪽으로 밀어내요. 그쪽이 데크·바위·땅이면 다른 쪽(옆 → 반대)으로 — 물 쪽으로만, 갈 곳이 없으면 그대로 (가두지도 파묻지도 않아요)
    const me = box(m.x, m.y);
    const dxL = me.x + me.w - o.x;
    const dxR = o.x + o.w - me.x;
    const dyU = me.y + me.h - o.y;
    const dyD = o.y + o.h - me.y;
    const tries: [number, number][] = [
      [c.nx * (c.depth + 0.5), c.ny * (c.depth + 0.5)],
      ...([
        [-(dxL + 0.5), 0],
        [dxR + 0.5, 0],
        [0, -(dyU + 0.5)],
        [0, dyD + 0.5],
      ] as [number, number][]).sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])),
    ];
    const t = tries.find(([dx, dy]) => ok(m.x + dx, m.y + dy));
    if (t) {
      const len = Math.hypot(t[0], t[1]);
      const k = len > cap ? cap / len : 1;
      m.x += t[0] * k;
      m.y += t[1] * k;
    }
    const vn = m.vx * c.nx + m.vy * c.ny;
    if (vn < 0) {
      m.vx -= vn * c.nx;
      m.vy -= vn * c.ny;
    }
  });
  return first;
}

/** 받힌 빈 놀거리가 밀렸다 돌아오는 거리 (그림만 — since = 받힌 뒤 ms). 0 → 금방 가장 멀리 → 천천히 0 */
export function nudgeOffset(amp: number, since: number): number {
  if (since < 0 || since >= NUDGE_MS) return 0;
  const rise = Math.sin(Math.min(1, since / 90) * (Math.PI / 2));
  const fall = 1 - (since - 90 > 0 ? (since - 90) / (NUDGE_MS - 90) : 0);
  return amp * rise * fall * fall;
}

/** 받힌 빈 놀거리가 밀리는 세기 (부딪힌 속도로) */
export function nudgeAmp(speed: number): number {
  return Math.min(NUDGE_MAX, 1 + speed / 30);
}

/** 물리 충돌이 막 떼어 놓은 두 상자(맞닿음): 1.5px 넓혀 재서 나를 밀어낼 방향 (헤엄치는 사람 — 씬의 충돌 콜백) */
export function touchContact(me: Box, o: Box): Contact | null {
  const g = 1.5;
  return hullContact({ x: me.x - g, y: me.y - g, w: me.w + g * 2, h: me.h + g * 2 }, o);
}

/** 11/16 r19 둘이 부딪히면 더 센 쪽 세기로 (제트스키가 헤엄치는 사람을 받으면 제트스키만큼 세게 튕겨요) */
export function strongerGain(a: BounceKind, b?: BounceKind): { base: number; k: number; max: number } {
  if (!b) return BOUNCE_GAIN[a];
  return BOUNCE_GAIN[a].max >= BOUNCE_GAIN[b].max ? BOUNCE_GAIN[a] : BOUNCE_GAIN[b];
}

/**
 * 11/16 r19 다른 사람(헤엄·탄 것)과는 각자 자기 화면에서 먼저 닿은 쪽이 튕겨 나가, 다른 쪽 화면에선 겹치기 전에 멀어져요.
 * 그래서 겹치지 않아도 이만큼 가까이 닿으면 (서로 다가가는 중이면) 나도 튕겨요 — 둘 다 튕겨요. 밀어내지는 않아요
 */
export const TOUCH_MARGIN = 6;
export function touchHit(me: Box, others: readonly Box[], margin = TOUCH_MARGIN): { contact: Contact; index: number } | null {
  const big = { x: me.x - margin, y: me.y - margin, w: me.w + margin * 2, h: me.h + margin * 2 };
  for (let i = 0; i < others.length; i++) {
    const c = hullContact(big, others[i]);
    if (c) return { contact: c, index: i };
  }
  return null;
}
