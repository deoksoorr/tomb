// 실내 표시(away) 연출: 다른 사람이 상점·집·사냥터 등에 들어가면 문으로 들어가듯 흐려지며 사라지고, 나오면 문 앞에서 나타난다.
// 순수 함수라 Phaser 없이 테스트한다 (awayFade.test.ts)

/** 실내로 들어가며 사라지는·문에서 나타나는 연출 시간 */
export const AWAY_FADE_MS = 320;
/** 들어가며 문 쪽(위)으로 몇 px 걸어 들어가는지 */
const AWAY_STEP_PX = 4;

/**
 * 실내 표시 연출: 들어가는 중(on, 0→1)이면 흐려지며 문 쪽으로, 나오는 중(off)이면 문에서 나타난다.
 * 돌려주는 값: alpha(1 = 그대로), dy(위로 옮길 px), hidden(다 들어갔다)
 */
export function awayFade(on: boolean, since: number, now: number, reduced = false): { alpha: number; dy: number; hidden: boolean } {
  const u = reduced ? 1 : Math.min(1, Math.max(0, (now - since) / AWAY_FADE_MS));
  if (on) return u >= 1 ? { alpha: 0, dy: 0, hidden: true } : { alpha: 1 - u, dy: Math.round(u * AWAY_STEP_PX), hidden: false };
  return { alpha: u, dy: Math.round((1 - u) * AWAY_STEP_PX), hidden: false };
}
