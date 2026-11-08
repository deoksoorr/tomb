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
