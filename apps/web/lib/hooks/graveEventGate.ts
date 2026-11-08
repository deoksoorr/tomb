import type { GraveEventKind } from "@tomb/protocol";

// 같은 채널의 묘비 변경 알림(net:graveEvent)은 다른 방문자가 보낸 것이라 믿을 수 없다.
// 알림마다 상세 API를 부르면 악성 클라이언트 하나가 채널 전원을 API로 몰아칠 수 있으므로 여기서 걸러 낸다.
// 넘친 알림은 버려도 된다: 30초마다 받는 목록이 결국 맞춰 준다.

export const PER_GRAVE_MS = 10_000;
export const WINDOW_MS = 10_000;
export const MAX_GRAVES_PER_WINDOW = 5;

const GRAVE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** 형식이 맞고, 새로 묻힌 묘비이거나 이미 아는 묘비에 대한 알림만 처리한다 */
export function isActionableGraveEvent(kind: GraveEventKind, graveId: string, known: boolean): boolean {
  return GRAVE_ID_RE.test(graveId) && (kind === "buried" || known);
}

/**
 * 상세 요청 한도: 묘비마다 10초에 1회, 전체로 10초에 묘비 5개까지.
 * 묘비별 창 안에 다시 온 알림은 한 번으로 모았다가 창이 끝나면 처리한다.
 * kind는 구분하지 않는다: 어느 경우든 상세 1회면 충분하다 (이장됐으면 404 → 목록에서 지운다).
 */
export class GraveEventGate {
  private lastFetch = new Map<string, number>();
  private pending = new Set<string>();
  private windowStart = -Infinity;
  private windowCount = 0;

  /** "now": 지금 상세를 받는다 · "later": 모아 뒀다가 due()에서 · "drop": 전체 한도 초과 */
  offer(graveId: string, now: number): "now" | "later" | "drop" {
    if (this.pending.has(graveId)) return "later";
    const last = this.lastFetch.get(graveId);
    if (last !== undefined && now - last < PER_GRAVE_MS) {
      this.pending.add(graveId);
      return "later";
    }
    return this.take(graveId, now) ? "now" : "drop";
  }

  /** 묘비별 창이 끝난 보류 알림 중 지금 처리할 것. 전체 한도를 넘는 것은 버린다 */
  due(now: number): string[] {
    const ready: string[] = [];
    for (const id of this.pending) {
      const last = this.lastFetch.get(id) ?? -Infinity;
      if (now - last < PER_GRAVE_MS) continue;
      this.pending.delete(id);
      if (this.take(id, now)) ready.push(id);
    }
    return ready;
  }

  /** 다음에 due()를 부를 시각 (보류가 없으면 null) */
  nextDueAt(): number | null {
    let at: number | null = null;
    for (const id of this.pending) {
      const t = (this.lastFetch.get(id) ?? 0) + PER_GRAVE_MS;
      if (at === null || t < at) at = t;
    }
    return at;
  }

  private take(graveId: string, now: number): boolean {
    if (now - this.windowStart >= WINDOW_MS) {
      this.windowStart = now;
      this.windowCount = 0;
      // 창이 바뀔 때 오래된 기록을 정리해서 맵이 계속 자라지 않게 한다
      for (const [id, t] of this.lastFetch) if (now - t >= PER_GRAVE_MS && !this.pending.has(id)) this.lastFetch.delete(id);
    }
    if (this.windowCount >= MAX_GRAVES_PER_WINDOW) return false;
    this.windowCount++;
    this.lastFetch.set(graveId, now);
    return true;
  }
}
