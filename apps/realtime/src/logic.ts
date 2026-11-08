import { MAX_VALID_SPEED, RATE_LIMIT_KICK_SEC, RATE_LIMIT_PER_SEC, inServerBounds } from "@tomb/protocol";

// Workers 런타임 API에 의존하지 않는 작은 순수 로직. vitest로 단위 테스트한다(logic.test.ts).

export type Point = { x: number; y: number };

// ── 레이트리밋 ──
// 연결당 1초 창(window)마다 메시지를 센다. 상한을 넘은 메시지는 그 초가 끝날 때까지 버리고,
// 상한을 넘긴 초가 RATE_LIMIT_KICK_SEC번 연속되면 끊는다(4008).

export type RateVerdict = "ok" | "drop" | "kick";

export class RateLimiter {
  private win = Number.NaN;
  private count = 0;
  private streak = 0;
  private lastOverWin = Number.NaN;

  constructor(
    private readonly limit = RATE_LIMIT_PER_SEC,
    private readonly kickAfter = RATE_LIMIT_KICK_SEC,
  ) {}

  hit(nowMs: number): RateVerdict {
    const w = Math.floor(nowMs / 1000);
    if (w !== this.win) {
      this.win = w;
      this.count = 0;
    }
    this.count++;
    if (this.count <= this.limit) return "ok";
    if (this.count === this.limit + 1) {
      // 이 초가 처음으로 상한을 넘은 순간. 바로 앞 초도 넘었으면 연속 기록을 잇는다.
      this.streak = this.lastOverWin === w - 1 ? this.streak + 1 : 1;
      this.lastOverWin = w;
      if (this.streak >= this.kickAfter) return "kick";
    }
    return "drop";
  }
}

// ── 이동 속도 검증 ──
// "달리기 최대 속도 × 1.5(MAX_VALID_SPEED)를 넘는 이동은 무시한다"를 거리 예산(토큰 버킷)으로 구현한다.
// - 예산은 초당 MAX_VALID_SPEED px씩 차고, 최대 MOVE_BURST_SEC초 분량까지 모인다.
//   네트워크가 잠깐 막혔다가 MOVE 여러 개가 한꺼번에 도착해도(번칭) 정상 플레이어는 거절되지 않는다.
// - 예산을 넘는 거리는 무시한다. 다만 보고된 위치를 버리지 않고 "목표"로 남겨 두고,
//   다음 틱부터 차오르는 예산만큼 목표 쪽으로 전진한다(ChannelCore.chase).
//   예산 충전 속도(151px/s)가 정상 플레이어의 최대 속도(약 101px/s)보다 빠르므로
//   한 번 거절됐다고 서버 위치가 영원히 멈춰 있는 일은 없다.
// - 조작된 클라이언트가 보낸 순간이동은 "최대 속도로의 이동"으로 바뀔 뿐이다.
//   의도된 순간이동은 warp(범위만 검증 + 쿨다운)로 따로 처리한다.

export const MOVE_BURST_SEC = 1;

export class MoveBudget {
  private tokens: number;
  private at: number;

  constructor(
    now: number,
    private readonly rate = MAX_VALID_SPEED,
    private readonly cap = MAX_VALID_SPEED * MOVE_BURST_SEC,
  ) {
    this.tokens = cap;
    this.at = now;
  }

  /** 최대 want px을 꺼내고, 실제로 꺼낸 거리를 돌려준다 */
  take(want: number, now: number): number {
    if (now > this.at) {
      this.tokens = Math.min(this.cap, this.tokens + ((now - this.at) / 1000) * this.rate);
      this.at = now;
    }
    const got = Math.min(want, this.tokens);
    this.tokens -= got;
    return got;
  }
}

/** from에서 to 방향으로 최대 maxDist만큼 전진한 정수 좌표 */
export function stepToward(from: Point, to: Point, maxDist: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDist) return { x: to.x, y: to.y };
  const k = maxDist / d;
  return { x: Math.round(from.x + dx * k), y: Math.round(from.y + dy * k) };
}

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** 비어 있는 가장 작은 sid (1부터, u16). 0은 "없음"으로 남겨 둔다. */
export function allocSid(used: { has(sid: number): boolean }): number | null {
  for (let sid = 1; sid <= 0xffff; sid++) if (!used.has(sid)) return sid;
  return null;
}

// ── URL 파라미터 ──

/** /ch/:n 의 n. 1..maxChannels 정수가 아니면 null */
export function parseChannel(raw: string, maxChannels: number): number | null {
  if (!/^[1-9]\d{0,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= maxChannels ? n : null;
}

/** ?x=&y= 스폰 위치. 둘 다 정수이고 맵 범위 안일 때만 쓴다 */
export function parseSpawn(xs: string | null, ys: string | null): Point | undefined {
  if (xs === null || ys === null || !/^\d{1,5}$/.test(xs) || !/^\d{1,5}$/.test(ys)) return undefined;
  const x = Number(xs);
  const y = Number(ys);
  return inServerBounds(x, y) ? { x, y } : undefined;
}
