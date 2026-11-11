// 날씨 연출 수치 (순수): 천둥 간격·번개 밝기 곡선·조용한 시간대.

/** 천둥이 치기 시작하는 비 세기 (약한 비에는 치지 않는다) */
export const THUNDER_MIN_RAIN = 0.55;

/** 밤 늦게·새벽(KST 23~7시)은 조용한 시간: 천둥이 드물고 작다 */
export function isQuietHour(kstHour: number): boolean {
  return kstHour >= 23 || kstHour < 7;
}

/**
 * 다음 천둥까지(ms). 비가 셀수록 잦고, 조용한 시간에는 2.5배 드물다. 보통 1~3분에 한 번.
 * rand: [0,1) 난수, first: 비가 막 세졌을 때 첫 천둥은 조금 빨리, forced: QA(?thunder=1)는 몇 초마다
 */
export function thunderGapMs(rain: number, quiet: boolean, rand: number, first = false, forced = false): number {
  if (forced) return first ? 1500 : 6000 + 4000 * rand;
  const r = Math.max(0, Math.min(1, rain));
  const base = (55_000 + 95_000 * rand) * (1.3 - 0.5 * r) * (quiet ? 2.5 : 1);
  return first ? base * 0.5 : base;
}

/** 번개 밝기 0..1 (친 뒤 경과 ms): 번쩍 → 잠깐 꺼짐 → 한 번 더 → 천천히 사라짐 */
export function thunderFlash(ms: number): number {
  if (ms < 0) return 0;
  if (ms < 60) return 1;
  if (ms < 130) return 0.15;
  if (ms < 200) return 0.7;
  const v = 0.7 * Math.exp(-(ms - 200) / 180);
  return v < 0.01 ? 0 : v;
}

/** 번개 뒤 천둥소리가 닿기까지(초): 가까우면 바로, 멀면 2초 넘게 */
export function thunderDelaySec(rand: number): number {
  return 0.25 + 2.2 * rand;
}
