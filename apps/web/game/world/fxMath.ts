// 폭죽·조명의 순수 계산 (Phaser 없이 테스트한다)

/** 하트 곡선 위의 점 (단위: 대략 반지름 1, y는 아래로 갈수록 크다) */
export function heartPoint(t: number): { x: number; y: number } {
  const s = Math.sin(t);
  return {
    x: (16 * s * s * s) / 17,
    y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
  };
}

/** 내 캐릭터 둘레 빛 반지름 (월드 px). 밤(glow=1)일수록 넓고, 손등불이면 1.5배 */
export function playerLightRadius(glow: number, lantern: boolean): number {
  const g = Math.max(0, Math.min(1, glow));
  return (52 + 40 * g) * (lantern ? 1.5 : 1);
}

// ── 폭죽 세기 (power 1~5: 가격이 비쌀수록 크고 오래, 넓게) ──

/** 폭죽 한 번의 연출 크기. 반경·수명은 "작은 폭죽(power 1)" 대비 배율 */
export type FireworkPlan = {
  power: number;
  /** 터지는 발 수 */
  shots: number;
  /** 첫 발 ~ 마지막 발 사이 (ms) */
  spanMs: number;
  /** 불꽃 반경 배율 */
  radius: number;
  /** 입자 수명 배율 (잔상) */
  life: number;
  /** 터진 자리의 빛 반지름 (월드 px) */
  light: number;
  /** 그 빛이 남는 시간 (ms) */
  lightMs: number;
  /** 화면 전체 어둠 걷힘 세기 (0..1) */
  lift: number;
  /** 화면 흔들림 (화면 px, 0이면 없음) */
  shake: number;
  /** 언제나 카메라 고정 하늘 레이어에 (맵 어디에 있든 모두가 본다) */
  sky: boolean;
  /** 효과음 크기 배율 */
  volume: number;
};

/** 작은 폭죽 불꽃의 반경 (월드 px) */
export const FW_BASE_RADIUS = 36;

const PLANS: readonly Omit<FireworkPlan, "power">[] = [
  { shots: 1, spanMs: 0, radius: 1, life: 1, light: 80, lightMs: 700, lift: 0, shake: 0, sky: false, volume: 0.7 },
  { shots: 1, spanMs: 0, radius: 1.15, life: 1.15, light: 100, lightMs: 850, lift: 0, shake: 0, sky: false, volume: 0.8 },
  { shots: 3, spanMs: 560, radius: 1.2, life: 1.1, light: 110, lightMs: 850, lift: 0.08, shake: 0, sky: false, volume: 0.85 },
  { shots: 1, spanMs: 0, radius: 2.8, life: 2.1, light: 240, lightMs: 1800, lift: 0.4, shake: 2, sky: false, volume: 1 },
  { shots: 20, spanMs: 4800, radius: 4.5, life: 1.6, light: 0, lightMs: 0, lift: 0.7, shake: 2.5, sky: true, volume: 1 },
];

/** 아이템 power(1~5) → 연출. reduced-motion이면 발 수·흔들림·번쩍임을 줄인다 */
export function fireworkPlan(power: number | undefined, reduced = false): FireworkPlan {
  const p = Math.max(1, Math.min(5, Math.round(Number.isFinite(power) ? (power as number) : 1)));
  const b = PLANS[p - 1];
  if (!reduced) return { power: p, ...b };
  return {
    power: p,
    ...b,
    shots: p === 5 ? 8 : b.shots,
    spanMs: p === 5 ? 4200 : b.spanMs,
    lift: b.lift * 0.6,
    shake: 0,
  };
}

/**
 * 피날레 발사 시각 (ms, 오름차순). 처음엔 또박또박, 마지막 20%는 끝자락에 몰아서 한꺼번에(클라이맥스).
 * rand: 0..1 (테스트에서 고정)
 */
export function finaleTimes(shots: number, spanMs: number, rand: () => number = Math.random): number[] {
  const n = Math.max(1, Math.floor(shots));
  if (n === 1) return [0];
  const climax = Math.max(1, Math.round(n * 0.2));
  const main = n - climax;
  const out: number[] = [];
  const mainSpan = spanMs * 0.78;
  for (let i = 0; i < main; i++) {
    const t = main > 1 ? (i / (main - 1)) * mainSpan : 0;
    const jitter = i === 0 ? 0 : (rand() - 0.5) * Math.min(160, mainSpan / main);
    out.push(Math.max(0, Math.min(spanMs, t + jitter)));
  }
  for (let j = 0; j < climax; j++) {
    const t = spanMs * 0.86 + (climax > 1 ? (j / (climax - 1)) * spanMs * 0.14 : spanMs * 0.14);
    out.push(Math.min(spanMs, t));
  }
  return out.sort((a, b) => a - b);
}

/** 반경 R(px)까지 퍼지도록 하는 처음 속도: 공기 저항 drag(1/s)에서 t초 동안 움직인 거리 = v/drag·(1−e^(−drag·t)) */
export function burstSpeed(radius: number, drag: number, seconds: number): number {
  const d = Math.max(0.01, drag);
  return (radius * d) / Math.max(0.05, 1 - Math.exp(-d * Math.max(0.05, seconds)));
}
