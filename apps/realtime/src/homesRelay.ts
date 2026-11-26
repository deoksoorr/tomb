import { HOMES_ZONES, type HomesZone } from "@tomb/protocol";

// 11/26 집 바뀜 알림(homes) 묶기: 웹이 저장마다 /internal/homes를 보내도 채널마다·구역마다 HOMES_GAP_MS에 한 번만 방송한다.
// 그 사이에 온 알림은 버리지 않고 가장 새 v 하나로 묶어 간격이 끝나면 보낸다 (마지막 저장이 늦게라도 보이게).
// 방송 한 번마다 그 채널 모든 화면이 집 목록을 다시 받으므로, 여러 계정이 저장을 몰아 보내도 부하가 커지지 않게 한다.

export const HOMES_GAP_MS = 10_000;

export class HomesCoalescer {
  private readonly last = new Map<HomesZone, number>();
  private readonly pending = new Map<HomesZone, number>();
  /** 11/26 구역마다 받은 가장 새 v (묶여 아직 안 보낸 것 포함) — 늦게 들어온 사람에게 입장 때 보낸다 (DO 저장소에 저장) */
  private readonly latest = new Map<HomesZone, number>();

  /** 가장 새 v를 기억한다. 바뀌었으면 true (저장할 때) */
  remember(zone: HomesZone, v: number): boolean {
    if (v <= (this.latest.get(zone) ?? 0)) return false;
    this.latest.set(zone, v);
    return true;
  }

  /** 기억한 구역별 v (입장 때 homes로 보낸다) */
  known(): [HomesZone, number][] {
    return [...this.latest];
  }

  /** 저장할 모양 { camp: v, ... } */
  snapshot(): Partial<Record<HomesZone, number>> {
    return Object.fromEntries(this.latest);
  }

  /** 저장해 둔 것으로 되살린다 (DO가 잠들었다 깨어날 때). 모양이 틀린 칸은 버린다 */
  restore(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    for (const zone of HOMES_ZONES) {
      const v = (raw as Record<string, unknown>)[zone];
      if (typeof v === "number" && Number.isInteger(v) && v > 0) this.remember(zone, v);
    }
  }

  /** 알림 하나: send = 지금 보낼 v (없으면 null — 묶어 둠), flushIn = flush를 부를 때까지 남은 ms (기다리는 것이 없으면 null) */
  offer(zone: HomesZone, v: number, now: number): { send: number | null; flushIn: number | null } {
    const last = this.last.get(zone);
    if (last === undefined || now - last >= HOMES_GAP_MS) {
      this.last.set(zone, now);
      this.pending.delete(zone);
      return { send: v, flushIn: this.nextDue(now) };
    }
    this.pending.set(zone, Math.max(v, this.pending.get(zone) ?? 0));
    return { send: null, flushIn: this.nextDue(now) };
  }

  /** 간격이 끝난 묶음을 꺼낸다 (보낸 것으로 친다) + 다음 flush까지 남은 ms */
  flush(now: number): { send: [HomesZone, number][]; flushIn: number | null } {
    const send: [HomesZone, number][] = [];
    for (const [zone, v] of this.pending) {
      if (now - (this.last.get(zone) ?? -Infinity) < HOMES_GAP_MS) continue;
      send.push([zone, v]);
      this.last.set(zone, now);
      this.pending.delete(zone);
    }
    return { send, flushIn: this.nextDue(now) };
  }

  private nextDue(now: number): number | null {
    let due: number | null = null;
    for (const zone of this.pending.keys()) {
      const at = (this.last.get(zone) ?? now) + HOMES_GAP_MS;
      due = due === null ? at : Math.min(due, at);
    }
    return due === null ? null : Math.max(0, due - now);
  }
}
