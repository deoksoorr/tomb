import { FRIEND_LEAVE_GRACE_MS } from "@tomb/protocol";

// 친구 들고 남 알림 판정 (순수 로직, LobbyDO가 저장소·알람·채널 전달을 잇는다). 테스트: friendPresence.test.ts
//  - 웹 /api/join이 입장 직전 hello로 "이름·친구 키·알릴 친구들"을 맡겨 둔다
//  - 채널에 자리를 잡으면(claim) 바로 "들어옴" — 이미 들어와 있다고 알린 사람이면 다시 알리지 않는다 (채널 이동·새로고침·재접속)
//  - 연결이 끊기거나 채널을 나가면 FRIEND_LEAVE_GRACE_MS 기다렸다가, 그 안에 다시 자리를 잡지 않았으면 "나감"

export type PresenceRec = { name: string; key: string; friends: string[]; on: boolean };
/** 알릴 것: to(친구 방문자 id들)에게 key·name이 들어왔다(on)·나갔다 */
export type FriendNotice = { to: string[]; key: string; name: string; on: boolean };

export interface PresenceStore {
  get(visitorId: string): PresenceRec | undefined;
  put(visitorId: string, rec: PresenceRec | null): void;
}

export class FriendPresence {
  /** 방문자 → "나감"을 알릴 시각 */
  readonly pending: Map<string, number>;
  /** pending이 바뀌었다 (저장 필요) */
  dirty = false;

  constructor(
    private readonly store: PresenceStore,
    pending: Iterable<[string, number]> = [],
    private readonly graceMs = FRIEND_LEAVE_GRACE_MS,
  ) {
    this.pending = new Map(pending);
  }

  /** 입장 직전 등록 (친구 목록·이름이 바뀌었을 수 있어 매번 덮는다. 이미 들어와 있다는 표시는 이어 간다) */
  hello(visitorId: string, name: string, key: string, friends: string[]): void {
    const prev = this.store.get(visitorId);
    this.store.put(visitorId, { name, key, friends: [...new Set(friends)].filter((f) => f !== visitorId), on: prev?.on ?? false });
  }

  /** 채널에 자리를 잡았다 (신규·복귀·교체). 처음이면 "들어옴" */
  joined(visitorId: string): FriendNotice | null {
    if (this.pending.delete(visitorId)) this.dirty = true;
    const rec = this.store.get(visitorId);
    if (!rec || rec.on) return null;
    this.store.put(visitorId, { ...rec, on: true });
    return rec.friends.length ? { to: rec.friends, key: rec.key, name: rec.name, on: true } : null;
  }

  /** 연결이 끊겼거나 채널을 나갔다 → 유예 뒤 "나감" (그 사이 joined가 오면 취소) */
  dropped(visitorId: string, now: number): void {
    if (!this.store.get(visitorId)?.on || this.pending.has(visitorId)) return;
    this.pending.set(visitorId, now + this.graceMs);
    this.dirty = true;
  }

  /** 다음 "나감" 알림 시각 (없으면 null) */
  due(): number | null {
    let at: number | null = null;
    for (const t of this.pending.values()) if (at === null || t < at) at = t;
    return at;
  }

  /** 시각이 된 "나감"들 */
  tick(now: number): FriendNotice[] {
    const out: FriendNotice[] = [];
    for (const [v, at] of [...this.pending]) {
      if (at > now) continue;
      this.pending.delete(v);
      this.dirty = true;
      const rec = this.store.get(v);
      if (!rec?.on) continue;
      // 기록은 남겨 둔다: 다시 들어올 때 입장 토큰을 재사용하면(60초 안 재접속) 웹을 거치지 않아 hello가 오지 않는다
      this.store.put(v, { ...rec, on: false });
      if (rec.friends.length) out.push({ to: rec.friends, key: rec.key, name: rec.name, on: false });
    }
    return out;
  }
}
