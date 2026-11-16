// 11/16 물가에 밀려오는 파도 (사용자: "파도 패턴도 랜덤으로 쳐야 해, 너무 일정해"). 순수 계산 — Phaser 없음 (seaWaves.test.ts).
// 파도 하나마다 길이(4~9초)·높이가 달라요. 가끔 큰 파도 두세 번이 몰려오고(세트), 그 뒤엔 잠잠한 파도 한두 번.
// 물가 앞줄은 한 줄로 오지 않아요: x마다 닿는 시각(조금 늦게)과 밀려오는 폭이 여러 겹 잡음으로 달라지고, 그 잡음이 옆으로 천천히 흘러요.
// 씨앗으로 정해진 차례라 한 화면 안에서는 늘 같은 흐름이에요 (다른 사람과 맞출 필요는 없어요).

export type Wave = { id: number; t0: number; dur: number; amp: number; big: boolean };

/** 결정적 난수 (mulberry32) */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1차원 값 잡음 0..1 (정수 격자 해시를 부드럽게 이어요) */
export function noise1(x: number, salt = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    let v = Math.imul(n ^ (salt * 0x27d4eb2d), 0x9e3779b1);
    v ^= v >>> 15;
    v = Math.imul(v, 0x85ebca6b);
    v ^= v >>> 13;
    return (v >>> 0) / 4294967296;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * u;
}

/** 파도 하나의 모양 0..1: 앞 35%는 빠르게 밀려오고, 나머지는 천천히 쓸려 나가요 */
export function waveShape(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.35) {
    const u = p / 0.35;
    return u * u * (3 - 2 * u);
  }
  const u = (p - 0.35) / 0.65;
  return Math.pow(1 - u, 1.6);
}
/** 파도가 가장 높이 오르는 때 (길이에 대한 비율) */
export const WAVE_PEAK = 0.35;

export class WaveTrain {
  private readonly r: () => number;
  private readonly waves: Wave[] = [];
  private nextId = 1;
  private setLeft = 0;
  private calmLeft = 0;

  constructor(seed: number, t0 = 0) {
    this.r = mulberry(seed);
    this.waves.push(this.make(t0));
  }

  private make(t0: number): Wave {
    const r = this.r;
    let dur: number;
    let amp: number;
    let big = false;
    if (this.setLeft > 0) {
      // 세트: 큰 파도가 연달아
      this.setLeft--;
      dur = 6000 + r() * 3000;
      amp = 13 + r() * 5;
      big = true;
      if (this.setLeft === 0) this.calmLeft = 1 + Math.floor(r() * 2);
    } else if (this.calmLeft > 0) {
      this.calmLeft--;
      dur = 4000 + r() * 2200;
      amp = 3 + r() * 2.5;
    } else if (r() < 0.2) {
      this.setLeft = 1 + (r() < 0.45 ? 2 : 1);
      dur = 6000 + r() * 3000;
      amp = 12.5 + r() * 5;
      big = true;
    } else {
      dur = 4000 + r() * 5000;
      amp = 6 + r() * 5.5;
    }
    // 다음 파도는 앞 파도가 다 빠지기 조금 전에 와요 (겹쳐서 이어져요)
    return { id: this.nextId++, t0, dur, amp, big };
  }

  /** time까지 파도를 만들어 둬요 (앞으로 한 파도 더) */
  private fill(time: number): void {
    let last = this.waves[this.waves.length - 1];
    while (last.t0 + last.dur * 0.85 < time + 3000) {
      last = this.make(last.t0 + last.dur * 0.85);
      this.waves.push(last);
    }
    // 오래된 파도는 버려요 (지연 계산용으로 4초쯤은 남겨요)
    while (this.waves.length > 3 && this.waves[1].t0 + this.waves[1].dur < time - 4000) this.waves.shift();
  }

  /** time에 물가가 밀려온 높이 (px, 겹친 파도는 큰 쪽) */
  surgeAt(time: number): number {
    this.fill(time);
    let v = 0;
    for (const w of this.waves) {
      const s = waveShape((time - w.t0) / w.dur) * w.amp;
      if (s > v) v = s;
    }
    return v;
  }

  /** 마지막 확인 뒤에 꼭대기를 지난 큰 파도 (물보라를 일으켜요). 지나간 파도 id를 넘겨요 */
  bigPeak(time: number, after: number): Wave | null {
    this.fill(time);
    for (const w of this.waves) if (w.big && w.id > after && time >= w.t0 + w.dur * WAVE_PEAK) return w;
    return null;
  }
}

/** x에서 파도가 늦게 닿는 시간 (ms, 0..2400) — 옆으로 천천히 흘러요 */
export function shoreDelay(x: number, time: number): number {
  return (0.55 * noise1(x / 380 + time * 0.000025, 11) + 0.45 * noise1(x / 150 - time * 0.00004, 12)) * 2400;
}

/** x에서 밀려오는 폭 배율 (0.3..1.4) — 여러 겹 잡음 */
export function shoreReach(x: number, time: number): number {
  const n = 0.5 * noise1(x / 260 + time * 0.00004, 21) + 0.3 * noise1(x / 110 - time * 0.00007, 22) + 0.2 * noise1(x / 46 + time * 0.0001, 23);
  return 0.3 + 1.1 * n;
}
