import {
  BOATS,
  RIDE_TOGGLE_MS,
  boatKind,
  boatSeatById,
  campRowboatSeatById,
  seaKayakSeatById,
  seaRideById,
  type ConnRaftExtra,
  type ConnRideExtra,
  type MapId,
  type RaftOutWhy,
  type RideGear,
  type RideOffWhy,
} from "@tomb/protocol";

// 11/28 실시간 서버 안에서만 일어나는 동작 → 접속 기록 "r" 줄 (protocol maint.ts ConnActExtra).
// 탈것(튜브·제트스키·카약·나룻배·조각배·오리배) 타고 내림, 좌대에서 내려보냄. 채널 DO가 만들어 로비에 넘기고(RPC 한 번),
// 로비가 들어옴·나감처럼 모았다가 1분마다 웹으로 (connLog.ts — 바로 타고 내린 줄은 거기서 한 줄로 접는다).
// 잦은 동작이라 한 사람이 ACT_CAP 안에서만 (넘은 줄은 세었다가 다음 줄의 s로). 좌대 「입장권 없이 올라가려 함」은 걸음마다 올 수 있어 같은 좌대·까닭은 RAFT_OUT_REPEAT_MS에 한 번만.

/** 한 사람이 1분에 적을 수 있는 "r" 줄 (웹 MOVE_CAP과 같은 수 — 로비 RPC·저장도 이만큼만) */
export const ACT_CAP = { max: 20, windowMs: 60_000 } as const;
/** 같은 좌대·같은 까닭으로 내려보낸 줄은 이 안에 한 번만 */
export const RAFT_OUT_REPEAT_MS = 10_000;
/** 기억하는 사람 수 상한 (넘으면 오래된 것부터 잊는다) */
const MEMO_MAX = 4_000;

export type Ride = { g: RideGear; n: number; k?: 0 | 1 };

/** 그 맵 좌석 id가 탈것이면 무엇·몇 번(1부터)·2인승 자리 (탈것이 아니면 null — 의자·그네·미끄럼틀·낚시 자리 등) */
export function rideOf(map: MapId, seatId: string | null | undefined): Ride | null {
  if (!seatId) return null;
  if (map === "sea") {
    const r = seaRideById(seatId);
    if (r) return { g: r.kind, n: r.n + 1 };
    const q = seaKayakSeatById(seatId);
    return q ? { g: "kayak", n: q.n + 1, k: q.k } : null;
  }
  if (map === "camp") {
    const q = campRowboatSeatById(seatId);
    return q ? { g: "rowboat", n: q.n + 1, k: q.k } : null;
  }
  const s = boatSeatById(seatId);
  const b = s && BOATS.find((x) => x.id === s.boatId);
  if (!s || !b) return null;
  const kind = boatKind(b);
  const n = BOATS.filter((x) => boatKind(x) === kind).indexOf(b) + 1;
  return { g: kind === "duck" ? "duck" : "boat", n, ...(b.seats === 2 ? { k: s.index } : {}) };
}

const sameRide = (a: Ride | null, b: Ride | null) => !!a && !!b && a.g === b.g && a.n === b.n;

/** 앉은 자리가 바뀜 → 내린 탈것·탄 탈것 (같은 탈것 안에서 자리만 옮기면 둘 다 null — 카약 앞뒤 바꾸기) */
export function rideChange(map: MapId, prevSeat: string | null | undefined, nextSeat: string | null | undefined): { off: Ride | null; on: Ride | null } {
  const off = rideOf(map, prevSeat);
  const on = rideOf(map, nextSeat);
  return sameRide(off, on) ? { off: null, on: null } : { off, on };
}

function remember<K, V>(m: Map<K, V>, k: K, v: V): void {
  m.delete(k);
  m.set(k, v);
  if (m.size > MEMO_MAX) m.delete(m.keys().next().value as K);
}

/** 채널 DO 하나의 "r" 줄 만들기 (탄 시각·상한·좌대 반복 거르기를 기억한다 — 메모리만, DO가 잠들면 탄 시간은 모름) */
export class ActLog {
  private readonly cap = new Map<string, { start: number; n: number; skipped: number }>();
  private readonly rides = new Map<string, { key: string; since: number; offAt?: number }>();
  private readonly raftLast = new Map<string, { key: string; at: number }>();

  /** 탔다. 같은 탈것에서 RIDE_TOGGLE_MS 안에 다시 탔으면 처음 탄 때부터 센다 (로비가 두 줄을 접는 것과 맞춘다) */
  board(visitorId: string, map: MapId, r: Ride, now: number): ConnRideExtra | null {
    const key = `${map}:${r.g}:${r.n}`;
    const cur = this.rides.get(visitorId);
    const since = cur && cur.key === key && cur.offAt !== undefined && now - cur.offAt <= RIDE_TOGGLE_MS ? cur.since : now;
    remember(this.rides, visitorId, { key, since });
    return this.capped(visitorId, now, { g: r.g, m: map, on: 1, n: r.n, ...(r.k !== undefined ? { k: r.k } : {}) });
  }

  /** 내렸다 (why = 서버가 내리게 한 까닭, 직접 내리면 없음) */
  leave(visitorId: string, map: MapId, r: Ride, now: number, why?: RideOffWhy): ConnRideExtra | null {
    const key = `${map}:${r.g}:${r.n}`;
    const cur = this.rides.get(visitorId);
    const riding = !!cur && cur.key === key && cur.offAt === undefined;
    const d = riding ? Math.max(0, Math.min(86_400, Math.round((now - cur.since) / 1000))) : undefined;
    if (cur && cur.key === key) cur.offAt = now;
    return this.capped(visitorId, now, { g: r.g, m: map, n: r.n, ...(d !== undefined ? { d } : {}), ...(why ? { w: why } : {}) });
  }

  /** 좌대에서 내려보냈다 (같은 좌대·까닭은 RAFT_OUT_REPEAT_MS에 한 번) */
  raftOut(visitorId: string, n: number, why: RaftOutWhy, now: number): ConnRaftExtra | null {
    const key = `${n}:${why}`;
    const last = this.raftLast.get(visitorId);
    if (last && last.key === key && now - last.at < RAFT_OUT_REPEAT_MS) return null;
    remember(this.raftLast, visitorId, { key, at: now });
    return this.capped(visitorId, now, { g: "raft", n, w: why });
  }

  /** 1분 상한 안이면 그 줄 (앞서 건너뛴 수는 s로), 넘으면 null */
  private capped<X extends ConnRideExtra | ConnRaftExtra>(visitorId: string, now: number, x: X): X | null {
    let c = this.cap.get(visitorId);
    if (!c || now - c.start >= ACT_CAP.windowMs) {
      c = { start: now, n: 0, skipped: c?.skipped ?? 0 };
      remember(this.cap, visitorId, c);
    }
    if (c.n >= ACT_CAP.max) {
      c.skipped++;
      return null;
    }
    c.n++;
    if (!c.skipped) return x;
    const s = c.skipped;
    c.skipped = 0;
    return { ...x, s };
  }
}
