// 2번 바닥 경고의 "보이는 규칙" (Phaser 없음). 게임(TelegraphLayer)과 사냥 안내서 시연이 같은 값을 쓴다.
//  - 테두리는 처음부터 다 보이고(깜빡임은 끝나기 직전), 안쪽이 바깥으로 차오른다
//  - 다 차면 FLASH_MS 동안 하얗게 번쩍이며 사라진다

/** 다 찬 뒤 번쩍임 길이 */
export const TELEGRAPH_FLASH_MS = 160;
/** 몬스터 경고 기본 색 */
export const TELEGRAPH_COLOR = 0xff3b30;
/** 번쩍임 채우기·테두리 색 */
export const TELEGRAPH_FLASH_FILL = 0xffe0d0;
export const TELEGRAPH_FLASH_LINE = 0xffffff;

/** p(0..1)만큼 찬 경고의 투명도: 바탕 채우기·테두리·차오른 안쪽 */
export function telegraphAlpha(p: number, now: number): { base: number; line: number; fill: number } {
  // 끝나기 직전엔 테두리가 깜빡인다
  const line = p > 0.75 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 45)) : 0.75;
  return { base: 0.1, line, fill: 0.22 + 0.2 * p };
}

/** 번쩍임 투명도 (a = 남은 비율 1→0) */
export const telegraphFlash = (a: number) => ({ fill: 0.55 * a, line: 0.9 * a });
