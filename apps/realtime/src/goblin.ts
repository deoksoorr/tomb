import {
  GOBLIN_CLAIM_RADIUS,
  GOBLIN_FIRST_MAX_MS,
  GOBLIN_FIRST_MIN_MS,
  GOBLIN_GAP_MAX_MS,
  GOBLIN_GAP_MIN_MS,
  GOBLIN_LATE_MAX_MS,
  GOBLIN_LATE_MIN_MS,
  GOBLIN_LIFE_MS,
  GOBLIN_POINTS_MAX,
  GOBLIN_POINTS_MIN,
  goblinPos,
  type GoblinInfo,
} from "@tomb/protocol";

// 22번 황금 고블린(보너스 요정)의 등장·주인 판정. 순수 상태 머신이라 Node에서 테스트한다(goblin.test.ts).
// ChannelCore가 들고 있으면서 알림(브로드캐스트)·증서 서명을 잇고, ChannelDO가 상태 저장·알람을 잇는다.
//
// - 일정: 다음 등장 시각(next)만 저장한다. 사람이 있는 동안 DO 알람이 그 시각에 깨워 등장시킨다.
//   예정 시각에 아무도 없었으면, 사람이 다시 생겼을 때 몇 분 뒤로 다시 잡는다(들어오자마자 나오지 않게).
// - 판정: 같은 고블린은 한 번만 잡힌다(caughtBy). 이 상태도 저장되므로 hibernate·재시작 뒤에도 두 번 잡히지 않고,
//   웹 API도 고블린 id(= 증서 nonce)를 한 번만 받는다 (이중 안전장치).

export type GoblinCur = GoblinInfo & {
  points: number;
  /** 잡은 사람 visitorId */
  caughtBy?: string;
  /** 잡은 사람에게 준 증서 (다시 접속하면 한 번 더 보내 준다) */
  grant?: string;
};
export type GoblinState = { next: number | null; cur: GoblinCur | null };

const between = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

function newId(r: () => number): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let s = "g";
  for (let i = 0; i < 11; i++) s += abc[Math.floor(r() * abc.length)];
  return s;
}

export class GoblinCore {
  state: GoblinState = { next: null, cur: null };

  constructor(private readonly random: () => number = Math.random) {}

  /** 저장해 둔 상태로 되살린다 (형식이 이상하면 버린다) */
  restore(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const s = raw as Partial<GoblinState>;
    const next = typeof s.next === "number" && Number.isFinite(s.next) ? s.next : null;
    const c = s.cur;
    const cur =
      c && typeof c === "object" && typeof c.id === "string" && typeof c.seed === "number" && typeof c.at === "number" && typeof c.until === "number" && typeof c.points === "number"
        ? { ...c }
        : null;
    this.state = { next, cur };
  }

  /** 지금 보이는(아직 아무도 못 잡은) 고블린 */
  visible(now: number): GoblinInfo | undefined {
    const c = this.state.cur;
    if (!c || c.caughtBy || now < c.at || now >= c.until) return undefined;
    return { id: c.id, seed: c.seed, at: c.at, until: c.until };
  }

  /** DO가 이 시각에 깨어나야 한다 (사라질 때 · 사람이 있으면 다음 등장). 없으면 null */
  due(online: number): number | null {
    const c = this.state.cur;
    if (c) return c.until;
    return online > 0 ? this.state.next : null;
  }

  /**
   * 시간이 흘렀다. 사라짐(gone: 아무도 못 잡았을 때 id)·등장(spawned)을 돌려준다. changed = 저장할 것이 생겼다.
   */
  check(now: number, online: number): { gone?: string; spawned?: GoblinInfo; changed: boolean } {
    const s = this.state;
    const out: { gone?: string; spawned?: GoblinInfo; changed: boolean } = { changed: false };
    if (s.cur && now >= s.cur.until) {
      if (!s.cur.caughtBy) out.gone = s.cur.id;
      s.cur = null;
      out.changed = true;
    }
    if (s.cur) return out;
    if (s.next === null) {
      s.next = now + between(this.random, GOBLIN_FIRST_MIN_MS, GOBLIN_FIRST_MAX_MS);
      out.changed = true;
    } else if (now >= s.next && online > 0) {
      if (now - s.next > GOBLIN_LIFE_MS) s.next = now + between(this.random, GOBLIN_LATE_MIN_MS, GOBLIN_LATE_MAX_MS);
      else out.spawned = this.spawn(now);
      out.changed = true;
    }
    return out;
  }

  /** 지금 나오게 한다 (일정·개발용 훅). 다음 등장 일정도 새로 잡는다 */
  spawn(now: number): GoblinInfo {
    const r = this.random;
    const cur: GoblinCur = {
      id: newId(r),
      seed: Math.floor(r() * 0x7fffffff),
      at: now,
      until: now + GOBLIN_LIFE_MS,
      points: between(r, GOBLIN_POINTS_MIN, GOBLIN_POINTS_MAX),
    };
    this.state.cur = cur;
    this.state.next = now + between(r, GOBLIN_GAP_MIN_MS, GOBLIN_GAP_MAX_MS);
    return { id: cur.id, seed: cur.seed, at: cur.at, until: cur.until };
  }

  /**
   * 잡기 요청: 이 고블린이 아직 있고, 아무도 못 잡았고, 그 순간 고블린 위치와 플레이어 위치(가까운 쪽)가 반경 안이면
   * 이 사람을 주인으로 정하고 보상 포인트를 돌려준다. 아니면 null (가장 먼저 온 요청 하나만 통과한다)
   */
  claim(id: string, visitorId: string, positions: readonly { x: number; y: number }[], now: number): number | null {
    const c = this.state.cur;
    if (!c || c.id !== id || c.caughtBy || now < c.at || now >= c.until) return null;
    const g = goblinPos(c, now);
    const near = positions.some((p) => Math.hypot(p.x - g.x, p.y - g.y) <= GOBLIN_CLAIM_RADIUS);
    if (!near) return null;
    c.caughtBy = visitorId;
    return c.points;
  }

  /** 잡은 사람에게 준 증서를 기억한다 (같은 고블린일 때만) */
  setGrant(id: string, grant: string): void {
    const c = this.state.cur;
    if (c && c.id === id) c.grant = grant;
  }

  /** 이 방문자가 잡았는데 아직 증서를 못 받았을 수 있다 (다시 접속) → 다시 보낼 증서 */
  grantFor(visitorId: string, now: number): { id: string; grant: string; points: number } | null {
    const c = this.state.cur;
    if (!c || c.caughtBy !== visitorId || !c.grant || now >= c.until) return null;
    return { id: c.id, grant: c.grant, points: c.points };
  }
}
