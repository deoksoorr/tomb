// 꾸미기(look) 증서 보내기 간격 맞추기.
// 실시간 서버는 연결당 LOOK_INTERVAL_MS(10초) 안에 다시 온 look을 조용히 버린다 (apps/realtime channel.ts).
// 그래서 입장 직후(입장 때 한 번 보냄)나 꾸미기를 연달아 입으면(예: 그림자 유령 친구 → 발자국 꽃) 마지막 착용이
// 다른 사람에게 영영 안 보였다. 여기서는 간격 안에 온 증서를 버리지 않고 "가장 최근 것"만 간격이 지나자마자 보낸다.
// 새 연결(welcome)이면 서버 쪽 간격도 처음부터라 reset() 후 바로 보낼 수 있다.

/** 서버 간격(10초) + 시계 오차 여유 */
export const LOOK_PACE_MS = 10_500;

export class LookPacer {
  private sentAt = -Infinity;
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    /** 실제로 보냈으면 true (연결 전이면 false → 다음 기회에) */
    private readonly send: (grant: string) => boolean,
    private readonly intervalMs = LOOK_PACE_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** 새 증서 (이전에 못 보낸 것은 버린다: 증서는 착용 전체 목록이라 최신 하나면 충분) */
  push(grant: string): void {
    this.pending = grant;
    this.flush();
  }

  /** 새 연결: 서버 간격이 처음부터 → 기다리던 것이 있으면 바로 보낸다 */
  reset(): void {
    this.sentAt = -Infinity;
    this.clearTimer();
    this.flush();
  }

  /** 기다리는 증서가 있는지 (테스트용) */
  get waiting(): boolean {
    return this.pending !== null;
  }

  destroy(): void {
    this.clearTimer();
    this.pending = null;
  }

  private flush(): void {
    if (this.pending === null) return;
    const wait = this.sentAt + this.intervalMs - this.now();
    if (wait <= 0) {
      if (this.send(this.pending)) {
        this.sentAt = this.now();
        this.pending = null;
      }
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
