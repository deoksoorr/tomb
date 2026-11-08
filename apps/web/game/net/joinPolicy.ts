// POST /api/join 호출 정책 (순수).
// 서버 리밋은 분당 10회. 재연결 백오프(0.5→1→2→4→8s)가 첫 1분에 이를 넘지 않도록:
//  1) 같은 채널로 다시 붙을 때는 받은 토큰을 재사용한다 (토큰은 그 채널에서만 유효, 60초 만료 → 45초까지만 쓴다)
//  2) 그래도 새로 받아야 하면 60초 창에서 최대 8회로 제한하고, 넘으면 기다린다

export const JOIN_WINDOW_MS = 60_000;
export const JOIN_MAX_PER_WINDOW = 8;
export const TOKEN_REUSE_MS = 45_000;

export class JoinLimiter {
  private readonly times: number[] = [];

  constructor(
    private readonly max = JOIN_MAX_PER_WINDOW,
    private readonly windowMs = JOIN_WINDOW_MS,
  ) {}

  /** 지금 호출하려면 몇 ms 기다려야 하는지 (0이면 바로) */
  delay(now: number): number {
    while (this.times.length && now - this.times[0] >= this.windowMs) this.times.shift();
    if (this.times.length < this.max) return 0;
    return this.times[0] + this.windowMs - now;
  }

  record(now: number): void {
    this.times.push(now);
  }
}

export type CachedToken<T> = { channel: number; at: number; res: T };

/** 같은 채널이고 아직 충분히 남은 토큰이면 재사용 */
export function reusableToken<T>(cache: CachedToken<T> | null, channel: number | "auto", now: number): T | null {
  if (!cache || channel === "auto" || cache.channel !== channel) return null;
  return now - cache.at < TOKEN_REUSE_MS ? cache.res : null;
}

/** 다시 시도해도 소용없는 /api/join 실패 (입력이 잘못됨·거부됨) → offline으로 두고 안내만 */
export function isPermanentJoinError(status: number): boolean {
  return status === 400 || status === 403 || status === 422;
}

/** 문자열의 UTF-8 바이트 수 (할당 없이) */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
