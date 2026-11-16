// 날씨 흔들림 (순수): 바람 돌풍·빗발 세기 출렁임·안개 조각 배치.
// 한 주기짜리 사인 대신 주기가 서로 맞지 않는 값 노이즈 세 겹을 섞어서 같은 무늬가 되풀이되지 않는다.
// 모든 흔들림은 평균 0(배율은 평균 1)이라 오래 보면 지금 세기 그대로다.

/** 정수 격자점 → [0,1) (결정적 해시) */
function lattice(i: number, seed: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul((seed | 0) + 0x9e3779b9, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 부드러운 1차원 값 노이즈 [0,1) — 정수마다 새 값, 그 사이는 smoothstep */
export function valueNoise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = lattice(i, seed);
  return a + (lattice(i + 1, seed) - a) * u;
}

/** 돌풍 대비: 노이즈를 이만큼 키운 뒤 [-1,1]로 자른다 (자르기가 대칭이라 평균은 0 그대로) */
const GUST_GAIN = 2.2;

/**
 * 돌풍 흔들림 [-1,1], 평균 0. t는 "격자 칸" 단위 (초를 원하는 길이로 나눠서 넣는다).
 * 주파수 1 · 2.31 · 5.17 세 겹이라 몇 칸을 지나도 같은 모양이 되풀이되지 않는다.
 */
export function gust(t: number, seed: number): number {
  const n = 0.55 * valueNoise1(t, seed) + 0.3 * valueNoise1(t * 2.31 + 17.3, seed + 101) + 0.15 * valueNoise1(t * 5.17 + 41.9, seed + 202);
  const g = (n - 0.5) * 2 * GUST_GAIN;
  return g < -1 ? -1 : g > 1 ? 1 : g;
}

/**
 * 빗발·눈발 세기 배율 (평균 1): 몇 초씩 세게 퍼붓다가 잦아든다.
 * sec: 초, amp: 흔들림 폭 (0.35 → 0.65~1.35), period: 한 번 출렁이는 대략의 길이(초)
 */
export function pulse(sec: number, seed: number, amp = 0.35, period = 9): number {
  return 1 + amp * gust(sec / period, seed);
}

/** 0..1 smoothstep */
export function smooth01(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * 안개 조각이 화면 한가운데(=내 캐릭터)를 덮을수록 옅게: d = 조각 중심~화면 중심 거리 / 조각 반지름.
 * 한가운데를 덮으면 floor배, 반지름 밖이면 1배. 사람이 안개에 묻히지 않게.
 */
export function centerFade(d: number, floor = 0.45): number {
  return floor + (1 - floor) * smooth01(0.15, 1.05, d);
}

/**
 * v를 [lo, lo+span) 안으로 감는다 (화면 밖으로 나간 조각을 반대편 화면 밖에서 다시 들여온다).
 * 카메라가 멀리 순간이동해도 상대 배치가 그대로 유지된다
 */
export function wrapInto(v: number, lo: number, span: number): number {
  if (!(span > 0)) return v;
  const r = (v - lo) % span;
  return lo + (r < 0 ? r + span : r);
}
