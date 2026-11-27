import { RAFT_EJECT_GRACE_MS, isRaftNum, type RaftBoardEntry } from "@tomb/protocol";

// 11/27 좌대 입장권 주인 표 (채널 DO마다 하나 — 좌대 1~6). 웹이 서명한 증서(grants "raft")·입장 토큰(raft)으로만 채운다.
// 판정(마루 막기·내려보내기)은 channel.ts가 하고, 여기는 표만 (저장 모양 · 끝난 것 거르기 · 다음에 깰 시각).
// 끝난 뒤 RAFT_EJECT_GRACE_MS까지는 주인으로 본다 (끝나기 직전 연장 증서가 오가는 사이 내려보내지 않게).

export type RaftHolder = { v: string; name: string; u: number };

export class RaftBoard {
  private readonly m = new Map<number, RaftHolder>();

  /** 저장해 둔 표 (DO가 잠들었다 깨면) */
  restore(raw: unknown): void {
    if (!Array.isArray(raw)) return;
    for (const row of raw) {
      if (!Array.isArray(row) || !isRaftNum(row[0])) continue;
      const h = row[1] as RaftHolder | undefined;
      if (h && typeof h.v === "string" && typeof h.name === "string" && typeof h.u === "number" && Number.isFinite(h.u)) this.m.set(row[0], { v: h.v, name: h.name, u: h.u });
    }
  }

  snapshot(): [number, RaftHolder][] {
    return [...this.m].map(([n, h]) => [n, { ...h }]);
  }

  get size(): number {
    return this.m.size;
  }

  /** visitorId가 지금 n번 좌대 주인인지 */
  holds(visitorId: string, n: number, now: number): boolean {
    const h = this.m.get(n);
    return !!h && h.v === visitorId && now < h.u + RAFT_EJECT_GRACE_MS;
  }

  /** 그 사람이 가진 좌대 번호 (없으면 null) */
  ofVisitor(visitorId: string, now: number): number | null {
    for (const [n, h] of this.m) if (h.v === visitorId && now < h.u + RAFT_EJECT_GRACE_MS) return n;
    return null;
  }

  /** n번을 그 사람 것으로 (한 사람 한 장 — 그 사람의 다른 번호는 지운다). 바뀌었으면 true */
  set(visitorId: string, name: string, n: number, u: number): boolean {
    let changed = false;
    for (const [k, h] of this.m)
      if (k !== n && h.v === visitorId) {
        this.m.delete(k);
        changed = true;
      }
    const cur = this.m.get(n);
    if (cur && cur.v === visitorId && cur.u === u && cur.name === name) return changed;
    this.m.set(n, { v: visitorId, name, u });
    return true;
  }

  /** 이름이 바뀌었다 (닉네임 변경 뒤 다시 붙음) */
  rename(visitorId: string, name: string): boolean {
    let changed = false;
    for (const h of this.m.values())
      if (h.v === visitorId && h.name !== name) {
        h.name = name;
        changed = true;
      }
    return changed;
  }

  /** 끝난 것을 지우고 돌려준다 */
  expire(now: number): { n: number; v: string }[] {
    const out: { n: number; v: string }[] = [];
    for (const [n, h] of this.m)
      if (now >= h.u + RAFT_EJECT_GRACE_MS) {
        this.m.delete(n);
        out.push({ n, v: h.v });
      }
    return out;
  }

  /** 다음에 깰 시각 (가장 이른 끝 + 여유). 없으면 null */
  due(): number | null {
    let t: number | null = null;
    for (const h of this.m.values()) {
      const at = h.u + RAFT_EJECT_GRACE_MS;
      if (t === null || at < t) t = at;
    }
    return t;
  }

  /** 화면에 보낼 표 (이름·끝나는 시각만 — 방문자 id는 안 보낸다) */
  list(now: number): RaftBoardEntry[] {
    return [...this.m]
      .filter(([, h]) => now < h.u + RAFT_EJECT_GRACE_MS)
      .sort((a, b) => a[0] - b[0])
      .map(([n, h]) => ({ n, name: h.name, u: h.u }));
  }
}
