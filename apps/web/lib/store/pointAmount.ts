// 차감·환불 금액 방어 검사 (저장소 안쪽 마지막 관문). 부르는 쪽이 이미 확인하지만, 음수 차감(= 적립)이나
// 소수 금액(이후 HINCRBY가 깨져 계정이 막힌다)이 어떤 경로로든 저장소까지 오면 쓰기 전에 멈춘다

export function assertPointAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`[accounts] 잘못된 포인트 금액: ${amount}`);
}
