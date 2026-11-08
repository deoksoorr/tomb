import {
  AVATAR_COLORS,
  CLOSE,
  DIR,
  SPAWN,
  STATE,
  decodeSnapshot,
  encodeEvent,
  encodeMove,
  seatById,
  type C2S,
  type PeerState,
  type S2C,
  type StateId,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import {
  CLOSE_STALE,
  ChannelCore,
  SERVER_WARP_COOLDOWN_MS,
  STALE_AFTER_MS,
  type ChannelHost,
  type PeerRecord,
  type Reservation,
} from "./channel";

type Conn = {
  id: string;
  out: (string | ArrayBuffer)[];
  closed?: { code: number; reason: string };
  att?: PeerRecord | null;
  /** 런타임이 마지막으로 pong을 자동 응답한 시각 */
  pingAt?: number;
};

function setup(capacity = 3, graceMs = 20_000) {
  const reservations = new Map<number, Reservation>();
  const counts: number[] = [];
  /** 로비 레지스트리로 가는 호출: "+v" = 자리 잡음, "-v" = 최종 퇴장 */
  const visitors: string[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code, reason) => void (c.closed = { code, reason }),
    persist: (c, rec) => void (c.att = rec),
    saveReservation: (r) => void reservations.set(r.sid, r),
    dropReservation: (sid) => void reservations.delete(sid),
    requestTick: () => {},
    countChanged: (n) => void counts.push(n),
    lastPing: (c) => c.pingAt ?? 0,
    visitorJoined: (v) => void visitors.push(`+${v}`),
    visitorLeft: (v) => void visitors.push(`-${v}`),
  };
  const core = new ChannelCore<Conn>({ capacity, graceMs }, host);
  const conn = (id: string): Conn => ({ id, out: [] });
  /** 접속시키고 welcome을 받은 소켓을 돌려준다 */
  const join = (id: string, now = 0, spawn?: { x: number; y: number }, c = conn(id)) => {
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn }, now);
    return c;
  };
  return { core, reservations, counts, visitors, conn, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const snapshots = (c: Conn) =>
  c.out.filter((d): d is ArrayBuffer => typeof d !== "string").map((d) => decodeSnapshot(d)!);
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const move = (x: number, y: number, state: StateId = STATE.walk, dir = DIR.down) => encodeMove({ x, y, state, dir, seq: 0 });
const send = (msg: C2S) => encodeEvent(msg);

describe("join / capacity / duplicate", () => {
  it("welcomes the joiner and announces it to the others", () => {
    const { core, join, counts } = setup();
    const a = join("a", 0, { x: 100, y: 200 });
    const b = join("b");
    expect(welcome(a)).toMatchObject({ sid: 1, channel: 1, cap: 3, peers: [], seats: {}, resumed: false });
    expect(welcome(b).peers).toEqual([{ sid: 1, x: 100, y: 200, state: STATE.idle, dir: DIR.down, name: "a", color: AVATAR_COLORS[0] }]);
    expect(events(a)).toContainEqual({ t: "join", sid: 2, x: SPAWN.x, y: SPAWN.y, state: STATE.idle, dir: DIR.down, name: "b", color: AVATAR_COLORS[0] });
    expect(events(b).filter((e) => e.t === "join")).toHaveLength(0);
    expect(a.att?.sid).toBe(1); // 입장 때 attachment 기록
    expect(counts).toEqual([1, 2]);
    expect(core.count).toBe(2);
  });

  it("rejects with 4001 when full (and admits() says so up front)", () => {
    const { core, join } = setup(2);
    join("a");
    join("b");
    expect(core.admits("c")).toBe(false);
    expect(core.admits("a")).toBe(true); // 이미 자리가 있는 방문자는 언제나 받는다
    const c = join("c");
    expect(c.closed?.code).toBe(CLOSE.CHANNEL_FULL);
    expect(c.out).toHaveLength(0);
  });

  it("replaces the old socket of the same visitor with 4002 and keeps sid/seat (even when full)", () => {
    const { core, join, conn } = setup(2);
    const a = join("a", 0, { x: 120, y: 240 });
    join("b");
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    const sentBefore = a.out.length;
    const a2 = join("a", 10, undefined, conn("a2"));
    expect(a.closed?.code).toBe(CLOSE.REPLACED);
    expect(a.out).toHaveLength(sentBefore); // 교체된 소켓에는 더 보내지 않는다
    expect(events(a2)[0].t).toBe("welcome");
    expect(a.att).toBeNull();
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { "bA-0": 1 } });
    // 교체된 소켓의 뒤늦은 close는 무시된다
    core.disconnect(a, CLOSE.REPLACED, 20);
    expect(core.peer(1)?.online).toBe(true);
    expect(core.count).toBe(2);
  });
});

describe("reconnect grace", () => {
  it("keeps the slot, blocks outsiders, and resumes with the same sid and seat", () => {
    const { core, join, conn, reservations, counts } = setup(3);
    const a = join("a", 0, { x: 120, y: 240 });
    const b = join("b");
    join("c");
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    clear(b);

    core.disconnect(a, 1006, 1_000);
    expect(reservations.get(1)).toMatchObject({ sid: 1, seatId: "bA-0", until: 21_000 });
    expect(events(b)).toEqual([]); // 다른 사람에게는 멈춘 아바타로 남는다
    expect(core.count).toBe(3);
    expect(core.nextExpiry()).toBe(21_000);

    const outsider = join("d", 2_000);
    expect(outsider.closed?.code).toBe(CLOSE.CHANNEL_FULL);

    const a2 = join("a", 15_000, { x: 121, y: 245 }, conn("a2"));
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { "bA-0": 1 } });
    expect(reservations.size).toBe(0);
    expect(core.peer(1)).toMatchObject({ online: true, seatId: "bA-0", state: STATE.sitChair });
    expect(counts.at(-1)).toBe(3);
  });

  it("releases the seat and broadcasts leave when grace expires", () => {
    const { core, join, reservations } = setup();
    const a = join("a", 0, { x: 120, y: 240 });
    const b = join("b");
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    core.disconnect(a, 1001, 1_000);
    clear(b);
    core.expire(20_999);
    expect(events(b)).toEqual([]);
    core.expire(21_000);
    expect(events(b)).toEqual([
      { t: "seat", seatId: "bA-0", sid: null },
      { t: "leave", sid: 1 },
    ]);
    expect(reservations.size).toBe(0);
    expect(core.count).toBe(1);
  });

  it("freezes a walking avatar as idle", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, move(SPAWN.x + 5, SPAWN.y), 0);
    core.tick(100);
    clear(b);
    core.disconnect(a, 1006, 200);
    core.tick(300);
    expect(snapshots(b)[0].entries).toEqual([{ sid: 1, x: SPAWN.x + 5, y: SPAWN.y, state: STATE.idle, dir: DIR.down }]);
  });

  it("leaves immediately on a normal close (1000)", () => {
    const { core, join, reservations } = setup();
    const a = join("a");
    const b = join("b");
    core.disconnect(a, 1000, 0);
    expect(events(b)).toContainEqual({ t: "leave", sid: 1 });
    expect(reservations.size).toBe(0);
    expect(core.count).toBe(1);
  });

  it("releases a held seat on resume when the client comes back far away", () => {
    const { core, join, conn } = setup();
    const a = join("a", 0, { x: 120, y: 240 });
    const b = join("b");
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    core.disconnect(a, 1006, 0);
    clear(b);
    const a2 = join("a", 1_000, { x: 400, y: 600 }, conn("a2"));
    expect(events(b)).toEqual([{ t: "seat", seatId: "bA-0", sid: null }]);
    // 복귀한 본인은 welcome을 가장 먼저 받고, 거기에는 이미 해제된 좌석이 빠져 있다
    expect(events(a2)).toEqual([welcome(a2)]);
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: {} });
    core.tick(1_100);
    expect(snapshots(b)[0].entries).toEqual([{ sid: 1, x: 400, y: 600, state: STATE.idle, dir: DIR.down }]);
  });
});

describe("tick (delta snapshot)", () => {
  it("does not relay MOVE immediately; one snapshot per tick with only changed peers; stops when idle", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    join("c");
    clear(a, b);
    core.message(a, move(SPAWN.x + 5, SPAWN.y + 5), 0);
    core.message(a, move(SPAWN.x + 10, SPAWN.y + 10), 50);
    expect(b.out).toHaveLength(0);

    expect(core.tick(100)).toBe(true);
    const snaps = snapshots(b);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].entries).toEqual([{ sid: 1, x: SPAWN.x + 10, y: SPAWN.y + 10, state: STATE.walk, dir: DIR.down }]);
    expect(snapshots(a)).toHaveLength(1); // 자기 자신도 받는다(클라이언트는 자기 sid를 무시)

    expect(core.tick(200)).toBe(false); // 바뀐 사람 없음 → 루프 정지
    expect(a.att).toMatchObject({ x: SPAWN.x + 10, y: SPAWN.y + 10, state: STATE.walk }); // 멈출 때 attachment 갱신
  });

  it("drops out-of-bounds, oversized and malformed messages without throwing", () => {
    const { core, join } = setup();
    const a = join("a");
    core.message(a, move(5000, 10), 0);
    core.message(a, new ArrayBuffer(600), 0);
    core.message(a, new Uint8Array([1, 2, 3]).buffer, 0);
    core.message(a, "x".repeat(600), 0);
    core.message(a, "{not json", 0);
    core.message(a, send({ t: "sit", seatId: "../../" } as C2S), 0);
    expect(core.tick(100)).toBe(false);
  });
});

describe("speed validation", () => {
  const entriesOf = (c: Conn): PeerState[] => snapshots(c).flatMap((s) => s.entries);

  it("accepts bunched packets of a legit runner", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 100, y: 500 });
    const b = join("b");
    // 0.6초 동안 막혔다가 달리기 MOVE 6개(각 10px)가 한꺼번에 도착
    for (let i = 1; i <= 6; i++) core.message(a, move(100, 500 + i * 10, STATE.run), 600);
    core.tick(650);
    expect(entriesOf(b).at(-1)).toMatchObject({ x: 100, y: 560 });
  });

  it("clamps a teleport to the max speed but always catches up (never stuck)", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 100, y: 100 });
    const b = join("b");
    core.message(a, move(100, 900, STATE.idle), 0); // 800px 순간이동 후 정지(더 이상 MOVE 없음)
    let t = 0;
    while (core.tick((t += 100)) && t < 20_000);
    const ys = entriesOf(b).map((e) => e.y);
    expect(ys[0]).toBeLessThan(300); // 첫 틱에 다 가지 못한다
    expect(ys.at(-1)).toBe(900); // 결국 도착
    expect(t).toBeLessThan(6_000);
  });

  it("warp skips the speed check but has a cooldown", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "warp", x: 400, y: 900 }), 0);
    core.message(a, send({ t: "warp", x: 100, y: 100 }), SERVER_WARP_COOLDOWN_MS - 1);
    core.tick(100);
    expect(entriesOf(b)).toEqual([{ sid: 1, x: 400, y: 900, state: STATE.idle, dir: DIR.down }]);
    core.message(a, send({ t: "warp", x: 9999, y: 100 }), SERVER_WARP_COOLDOWN_MS + 10); // 범위 밖
    core.message(a, send({ t: "warp", x: 100, y: 100 }), SERVER_WARP_COOLDOWN_MS + 20);
    core.tick(SERVER_WARP_COOLDOWN_MS + 100);
    expect(entriesOf(b).at(-1)).toMatchObject({ x: 100, y: 100 });
  });
});

describe("seats (server authority)", () => {
  const seat = seatById("cA")!;

  it("grants a free nearby seat to one player and denies the rest", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: seat.x + 10, y: seat.y + 10 });
    const b = join("b", 0, { x: seat.x - 10, y: seat.y });
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: "cA" }), 0);
    core.message(b, send({ t: "sit", seatId: "cA" }), 0);
    expect(events(a)).toEqual([{ t: "seat", seatId: "cA", sid: 1 }]);
    expect(events(b)).toEqual([
      { t: "seat", seatId: "cA", sid: 1 },
      { t: "seatDenied", seatId: "cA" },
    ]);
    core.tick(100);
    expect(snapshots(b)[0].entries).toEqual([{ sid: 1, x: seat.x, y: seat.y, state: STATE.sitChair, dir: seat.facing }]);
  });

  it("denies far, unknown seats", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: seat.x + 41, y: seat.y });
    clear(a);
    core.message(a, send({ t: "sit", seatId: "cA" }), 0);
    core.message(a, send({ t: "sit", seatId: "nope" }), 0);
    expect(events(a)).toEqual([
      { t: "seatDenied", seatId: "cA" },
      { t: "seatDenied", seatId: "nope" },
    ]);
  });

  it("one seat per player; releases on stand, on non-sitChair MOVE and on leave", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 520, y: 296 });
    const b = join("b");
    clear(b);
    core.message(a, send({ t: "sit", seatId: "bB-0" }), 0);
    core.message(a, send({ t: "sit", seatId: "bB-1" }), 0); // 옆 자리로 옮기기
    core.message(a, move(504, 296, STATE.sitChair), 0); // 앉은 채 MOVE: 자리 유지
    core.message(a, send({ t: "stand" }), 0);
    core.message(a, send({ t: "sit", seatId: "bB-2" }), 0);
    core.message(a, move(540, 296, STATE.walk), 0);
    core.message(a, send({ t: "sit", seatId: "bB-2" }), 0);
    core.disconnect(a, 1000, 0);
    expect(events(b)).toEqual([
      { t: "seat", seatId: "bB-0", sid: 1 },
      { t: "seat", seatId: "bB-0", sid: null },
      { t: "seat", seatId: "bB-1", sid: 1 },
      { t: "seat", seatId: "bB-1", sid: null },
      { t: "seat", seatId: "bB-2", sid: 1 },
      { t: "seat", seatId: "bB-2", sid: null },
      { t: "seat", seatId: "bB-2", sid: 1 },
      { t: "seat", seatId: "bB-2", sid: null },
      { t: "leave", sid: 1 },
    ]);
  });

  it("treats sitChair without a granted seat as sitGround", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 300, y: 600 });
    const b = join("b");
    core.message(a, move(300, 600, STATE.sitChair), 0);
    core.tick(100);
    expect(snapshots(b)[0].entries[0].state).toBe(STATE.sitGround);
  });
});

describe("events and limits", () => {
  it("relays emote to the others with the sender sid; 250ms per connection, same (sid, grave) once per second", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    const emote = (graveId: string, t: number) => core.message(a, send({ t: "emote", kind: "flower", graveId }), t);
    emote("g1", 0);
    emote("g2", 100); // 연결당 250ms 안 → 버림
    emote("g1", 300); // 같은 (sid, g1)이 1초 안 → 버림
    emote("g2", 600); // 다른 묘비 → 중계
    emote("g1", 1_000); // 1초 지남 → 중계
    expect(events(a)).toEqual([]);
    expect(events(b).map((e) => e.t === "emote" && e.graveId)).toEqual(["g1", "g2", "g1"]);
    expect(events(b)[0]).toEqual({ t: "emote", sid: 1, kind: "flower", graveId: "g1" });
  });

  it("graveEvent: once per 5s per connection, and the same graveId once per 5s per channel", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    const c = join("c");
    clear(a, b, c);
    const ev = (from: Conn, graveId: string, t: number) => core.message(from, send({ t: "graveEvent", kind: "buried", graveId }), t);
    ev(a, "g1", 0);
    ev(a, "g2", 1_000); // a의 연결 예산(5초) → 버림
    ev(b, "g1", 2_000); // 같은 g1이 채널에서 5초 안 → 버림 (b가 보냈어도)
    ev(b, "g3", 2_100); // 다른 묘비 → 중계
    ev(a, "g1", 5_000); // 5초 지남 → 중계
    expect(events(c)).toEqual([
      { t: "graveEvent", sid: 1, kind: "buried", graveId: "g1" },
      { t: "graveEvent", sid: 2, kind: "buried", graveId: "g3" },
      { t: "graveEvent", sid: 1, kind: "buried", graveId: "g1" },
    ]);
  });

  it("closes with 4008 after 10 consecutive seconds over 20 msg/s", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    for (let s = 0; s < 10; s++) for (let i = 0; i < 25; i++) core.message(a, move(SPAWN.x, SPAWN.y, STATE.idle), s * 1000 + i);
    expect(a.closed?.code).toBe(CLOSE.RATE_LIMITED);
    expect(a.att).toBeNull();
    expect(events(b)).toContainEqual({ t: "leave", sid: 1 });
    expect(core.count).toBe(1);
  });
});

describe("lobby registry hooks / evict / stale connections", () => {
  it("reports join/resume/takeover and only the final leave to the lobby registry", () => {
    const { core, join, conn, visitors } = setup();
    const a = join("a");
    core.disconnect(a, 1006, 0); // 유예 → 최종 퇴장 아님
    const a2 = join("a", 1_000, undefined, conn("a2")); // 복귀
    join("a", 2_000, undefined, conn("a3")); // 다른 탭 교체
    expect(visitors).toEqual(["+a", "+a", "+a"]);
    core.disconnect(a2, 1000, 3_000); // 교체된 소켓 → 무시
    expect(visitors).toHaveLength(3);
    core.expire(Number.MAX_SAFE_INTEGER); // 유예 예약 없음 → 그대로
    expect(core.count).toBe(1);
  });

  it("evict (same visitor joined another channel) closes 4002 or drops the reservation, without grace", () => {
    const { core, join, reservations, visitors } = setup();
    const a = join("a");
    const b = join("b");
    const c = join("c");
    core.evict("a");
    expect(a.closed?.code).toBe(CLOSE.REPLACED);
    expect(events(c)).toContainEqual({ t: "leave", sid: 1 });
    core.disconnect(b, 1006, 0);
    expect(reservations.has(2)).toBe(true);
    core.evict("b");
    expect(reservations.size).toBe(0);
    expect(events(c)).toContainEqual({ t: "leave", sid: 2 });
    expect(visitors).toEqual(["+a", "+b", "+c", "-a", "-b"]);
    expect(core.count).toBe(1);
    core.evict("nobody"); // 없는 방문자는 무시
  });

  it("reaps sockets with no ping and no message for 60s (4000 → grace)", () => {
    const { core, join, reservations } = setup();
    const a = join("a", 0);
    const b = join("b", 0);
    const c = join("c", 0);
    a.pingAt = 50_000; // ping 중
    core.message(b, move(SPAWN.x, SPAWN.y, STATE.idle), 30_000); // 메시지 중
    core.reap(STALE_AFTER_MS + 1);
    expect(c.closed?.code).toBe(CLOSE_STALE);
    expect(c.att).toBeNull();
    expect(reservations.has(3)).toBe(true); // 유예로 넘어감
    expect(a.closed).toBeUndefined();
    expect(b.closed).toBeUndefined();
    expect(core.online).toBe(2);
  });
});

describe("restore after hibernation", () => {
  it("rebuilds peers, seats and reservations", () => {
    const { core, conn, join } = setup();
    const a = conn("a");
    const recA: PeerRecord = { sid: 4, visitorId: "a", name: "a", color: AVATAR_COLORS[1], x: 420, y: 336, state: STATE.sitChair, dir: DIR.right, seatId: "cA" };
    const recB: Reservation = { sid: 1, visitorId: "b", name: "b", color: AVATAR_COLORS[0], x: 10, y: 10, state: STATE.idle, dir: DIR.up, seatId: null, until: 5_000 };
    core.restore([[a, recA]], [recB], 0);
    expect(core.count).toBe(2);
    expect(core.nextExpiry()).toBe(5_000);

    const c = join("c");
    expect(welcome(c)).toMatchObject({ sid: 2, seats: { cA: 4 } });
    expect(welcome(c).peers.map((p) => p.sid).sort()).toEqual([1, 4]);
    core.message(a, send({ t: "stand" }), 0); // 복원된 소켓이 그대로 동작
    expect(events(c)).toContainEqual({ t: "seat", seatId: "cA", sid: null });
  });
});
