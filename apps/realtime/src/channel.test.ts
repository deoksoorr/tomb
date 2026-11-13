import {
  AVATAR_COLORS,
  BOAT_SEATS,
  FERRY_DOCK,
  CLOSE,
  DIR,
  FISHING_SPOTS,
  FERRIS_SEATS,
  BALLOON_SEATS,
  BALLOON_BOARD_MS,
  BALLOON_CYCLE_MS,
  SPAWN,
  STATE,
  decodeSnapshot,
  encodeEvent,
  encodeMove,
  seatById,
  spotSeatId,
  type C2S,
  type Grant,
  type PeerState,
  type S2C,
  type StateId,
  type DirId,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import {
  CLOSE_STALE,
  ChannelCore,
  SERVER_WARP_COOLDOWN_MS,
  STALE_AFTER_MS,
  SYNC_INTERVAL_MS,
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

/** 증서 검증 흉내: 토큰 문자열 = JSON(Grant). "bad"는 서명이 틀린 증서 */
const grantToken = (g: Grant) => JSON.stringify(g);

function setup(capacity = 3, graceMs = 20_000, room = false) {
  const reservations = new Map<number, Reservation>();
  const counts: number[] = [];
  const nonces = new Map<string, number>();
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
    verifyGrant: async (token) => (token === "bad" ? null : (JSON.parse(token) as Grant)),
    claimNonce: (nonce, until) => {
      if (nonces.has(nonce)) return false;
      nonces.set(nonce, until);
      return true;
    },
  };
  const core = new ChannelCore<Conn>({ capacity, graceMs, room }, host);
  const conn = (id: string): Conn => ({ id, out: [] });
  /** 접속시키고 welcome을 받은 소켓을 돌려준다 */
  const join = (id: string, now = 0, spawn?: { x: number; y: number }, c = conn(id), look: string[] = []) => {
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn, look, body: "hood" }, now);
    return c;
  };
  return { core, reservations, counts, visitors, conn, join, host };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const snapshots = (c: Conn) =>
  c.out.filter((d): d is ArrayBuffer => typeof d !== "string").map((d) => decodeSnapshot(d)!);
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const move = (x: number, y: number, state: StateId = STATE.walk, dir: DirId = DIR.down) => encodeMove({ x, y, state, dir, seq: 0 });
const send = (msg: C2S) => encodeEvent(msg);

/** 벤치 A 첫 좌석 (맵 배치가 바뀌어도 좌석 기준으로 테스트한다) */
const bA0 = seatById("bA-0")!;

describe("join / capacity / duplicate", () => {
  it("welcomes the joiner and announces it to the others", () => {
    const { core, join, counts } = setup();
    const a = join("a", 0, { x: 100, y: 200 });
    const b = join("b");
    expect(welcome(a)).toMatchObject({ sid: 1, channel: 1, cap: 3, peers: [], seats: {}, resumed: false });
    expect(welcome(b).peers).toEqual([{ sid: 1, x: 100, y: 200, state: STATE.idle, dir: DIR.down, name: "a", color: AVATAR_COLORS[0], look: [], body: "hood" }]);
    expect(events(a)).toContainEqual({ t: "join", sid: 2, x: SPAWN.x, y: SPAWN.y, state: STATE.idle, dir: DIR.down, name: "b", color: AVATAR_COLORS[0], look: [], body: "hood" });
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
    const a = join("a", 0, { x: bA0.x + 12, y: bA0.y - 8 });
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
    const a = join("a", 0, { x: bA0.x + 12, y: bA0.y - 8 });
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

    const a2 = join("a", 15_000, { x: bA0.x + 13, y: bA0.y - 3 }, conn("a2"));
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { "bA-0": 1 } });
    expect(reservations.size).toBe(0);
    expect(core.peer(1)).toMatchObject({ online: true, seatId: "bA-0", state: STATE.sitChair });
    expect(counts.at(-1)).toBe(3);
  });

  it("releases the seat and broadcasts leave when grace expires", () => {
    const { core, join, reservations } = setup();
    const a = join("a", 0, { x: bA0.x + 12, y: bA0.y - 8 });
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
    const a = join("a", 0, { x: bA0.x + 12, y: bA0.y - 8 });
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

  it("친구 옆 순간이동: 멀리 있는 친구 옆으로 warp하면 서버 위치가 바로 거기, 이어 걷는 MOVE도 속도 검증을 통과한다", () => {
    const { core, join } = setup();
    const me = join("me", 0, { x: 120, y: 160 });
    join("friend", 0, { x: 900, y: 700 });
    const at = core.roster().find((r) => r.visitorId === "friend")!;
    // 클라이언트가 친구 둘레의 걸을 수 있는 칸(친구 위치 + 16px)을 골라 기존 warp로 보낸다
    core.message(me, send({ t: "warp", x: at.x + 16, y: at.y }), 1_000);
    expect(core.peer(1)).toMatchObject({ x: 916, y: 700 });
    // 바로 이어 걷는 MOVE: 옛 자리(120,160)에서 온 것으로 보지 않는다 → 조금 걸은 만큼만 움직인다
    core.message(me, move(920, 700), 1_100);
    core.tick(1_150);
    expect(core.peer(1)).toMatchObject({ x: 920, y: 700 });
    // 쿨다운 안에 또 누르면 무시 (연타로 맵을 뛰어다니지 못한다)
    core.message(me, send({ t: "warp", x: 100, y: 100 }), 1_200);
    expect(core.peer(1)).toMatchObject({ x: 920, y: 700 });
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
    const [bB0, bB1, bB2] = [seatById("bB-0")!, seatById("bB-1")!, seatById("bB-2")!];
    const a = join("a", 0, { x: bB1.x, y: bB1.y });
    const b = join("b");
    clear(b);
    core.message(a, send({ t: "sit", seatId: "bB-0" }), 0);
    core.message(a, send({ t: "sit", seatId: "bB-1" }), 0); // 옆 자리로 옮기기
    core.message(a, move(bB0.x, bB0.y, STATE.sitChair), 0); // 앉은 채 MOVE: 자리 유지
    core.message(a, send({ t: "stand" }), 0);
    core.message(a, send({ t: "sit", seatId: "bB-2" }), 0);
    core.message(a, move(bB2.x + 4, bB2.y, STATE.walk), 0);
    core.message(a, send({ t: "sit", seatId: "bB-2" }), 0);
    core.disconnect(a, 1000, 0);
    expect(events(b)).toEqual([
      { t: "seat", seatId: "bB-0", sid: 1 },
      { t: "seat", seatId: "bB-1", sid: 1 }, // 같은 벤치 옆자리로: 새 자리 점유 → 옛 자리 해제
      { t: "seat", seatId: "bB-0", sid: null },
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

describe("v2: look / firework / sync / join-loss guards", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("carries the token's look in welcome/join, and a verified look grant updates everyone (10s per connection)", async () => {
    const { core, join } = setup();
    const a = join("a", 0, undefined, undefined, ["hat_cat"]);
    const b = join("b");
    expect(welcome(b).peers[0].look).toEqual(["hat_cat"]);
    clear(a, b);
    const look = (who: string, l: string[], t: number) =>
      core.message(a, send({ t: "look", grant: grantToken({ kind: "look", visitorId: who, look: l, exp: 9e9 }) }), t);
    look("a", ["hat_straw", "neck_scarf"], 0);
    await flush();
    expect(events(b)).toEqual([{ t: "look", sid: 1, look: ["hat_straw", "neck_scarf"] }]);
    expect(events(a)).toEqual(events(b)); // 본인도 받는다
    expect(a.att?.look).toEqual(["hat_straw", "neck_scarf"]); // attachment에 저장
    look("a", ["hat_flower"], 5_000); // 10초 안 → 무시
    look("b", ["hat_flower"], 10_000); // 다른 사람 앞으로 발급된 증서 → 무시
    core.message(a, send({ t: "look", grant: "bad" }), 20_000); // 서명이 틀림 → 무시
    await flush();
    expect(events(b)).toHaveLength(1);
  });

  it("46·25번: 입장 토큰의 염색이 welcome/join에 실리고, look 증서의 dye·body가 모두에게 바뀐다", async () => {
    const { core, join, conn } = setup();
    const a = conn("a");
    core.join(a, { visitorId: "a", name: "a", color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", dye: { head: "#f4a7b9" } }, 0);
    const b = join("b");
    expect(welcome(b).peers[0].dye).toEqual({ head: "#f4a7b9" });
    expect(events(a).find((e) => e.t === "join")).not.toHaveProperty("dye"); // 염색 안 한 사람은 dye 없음 (옛 모양 그대로)
    clear(a, b);
    core.message(a, send({ t: "look", grant: grantToken({ kind: "look", visitorId: "a", look: [], exp: 9e9, dye: { body: "#112233" }, body: "cat" }) }), 0);
    await flush();
    expect(events(b)).toEqual([{ t: "look", sid: 1, look: [], dye: { body: "#112233" }, body: "cat" }]);
    expect(a.att?.dye).toEqual({ body: "#112233" });
    expect(a.att?.body).toBe("cat");
    // 다시 들어와도(새 토큰에 염색 없음 → 기본색으로) join을 다시 보낸다
    clear(a, b);
    core.join(conn("a2"), { visitorId: "a", name: "a", color: AVATAR_COLORS[0], channel: 1, look: [], body: "cat" }, 20_000);
    expect(events(b).find((e) => e.t === "join")).toMatchObject({ sid: 1, body: "cat" });
    expect(events(b).find((e) => e.t === "join")).not.toHaveProperty("dye");
  });

  it("46번 특수 색(\"#rrggbb~종류\")도 welcome·look으로 그대로 실린다 (옛 클라이언트는 그 부위를 기본 색으로 본다)", async () => {
    const { core, join, conn } = setup();
    const a = conn("a");
    core.join(a, { visitorId: "a", name: "a", color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", dye: { head: "#e8b84a~g" } }, 0);
    const b = join("b");
    expect(welcome(b).peers[0].dye).toEqual({ head: "#e8b84a~g" });
    clear(a, b);
    core.message(a, send({ t: "look", grant: grantToken({ kind: "look", visitorId: "a", look: [], exp: 9e9, dye: { head: "#e8b84a~g", accent: "#ff00aa~r" } }) }), 0);
    await flush();
    expect(events(b)).toEqual([{ t: "look", sid: 1, look: [], dye: { head: "#e8b84a~g", accent: "#ff00aa~r" } }]);
  });

  it("fires a verified firework once per nonce at the sender's server position (3s per connection)", async () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 200, y: 300 });
    const b = join("b");
    clear(a, b);
    const fw = (nonce: string, t: number) =>
      core.message(a, send({ t: "firework", grant: grantToken({ kind: "firework", visitorId: "a", item: "fw_heart", nonce, exp: 9e9 }) }), t);
    fw("n1", 0);
    fw("n2", 1_000); // 3초 안 → 무시
    fw("n1", 3_000); // 같은 nonce 재사용 → 무시
    fw("n3", 6_000);
    await flush();
    expect(events(b)).toEqual([
      { t: "firework", sid: 1, item: "fw_heart", x: 200, y: 300 },
      { t: "firework", sid: 1, item: "fw_heart", x: 200, y: 300 },
    ]);
    expect(events(a)).toEqual(events(b));
  });

  it("answers sync with the full peer list and seats, to the requester only, at most every 20s", () => {
    const { core, join } = setup();
    const chair = seatById("cA")!;
    const a = join("a", 0, { x: chair.x, y: chair.y + 4 });
    const b = join("b");
    core.message(b, send({ t: "sit", seatId: "cA" }), 0); // b는 멀어서 거절
    core.message(a, send({ t: "sit", seatId: "cA" }), 0);
    clear(a, b);
    core.message(b, send({ t: "sync" }), 0);
    core.message(b, send({ t: "sync" }), SYNC_INTERVAL_MS - 1);
    expect(events(b)).toEqual([{ t: "peers", peers: [expect.objectContaining({ sid: 1, name: "a", look: [] })], seats: { cA: 1 } }]);
    expect(events(a)).toEqual([]);
    core.message(b, send({ t: "sync" }), SYNC_INTERVAL_MS);
    expect(events(b)).toHaveLength(2);
  });

  it("clears the attachment of a socket that disconnects (no ghost after hibernation)", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.disconnect(a, 1006, 0);
    core.disconnect(b, 1000, 0);
    expect(a.att).toBeNull();
    expect(b.att).toBeNull();
  });

  it("a delayed lobby kick does not evict a connection made after the claim", () => {
    const { core, join, conn } = setup();
    join("a", 1_000);
    core.evict("a", 500); // 500에 다른 채널로 갔다는 kick이 늦게 왔지만, 여기 연결은 1000에 생겼다
    expect(core.peer(1)?.online).toBe(true);
    join("a", 2_000, undefined, conn("a2")); // 교체: joinedAt 갱신
    core.evict("a", 2_500);
    expect(core.peer(1)).toBeUndefined();
  });
});

describe("v3: body / act / bench slide", () => {
  it("re-announces join when the body changes on takeover", () => {
    const { core, join, conn } = setup();
    join("a");
    const b = join("b");
    clear(b);
    core.join(conn("a2"), { visitorId: "a", name: "a", color: AVATAR_COLORS[0], channel: 1, look: [], body: "cat" }, 10);
    expect(events(b)).toEqual([expect.objectContaining({ t: "join", sid: 1, body: "cat" })]);
  });

  it("relays act to everyone with the sender's position, at most every 2s per connection", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 300, y: 200 });
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "act", kind: "bell" }), 0);
    core.message(a, send({ t: "act", kind: "wave" }), 1_999);
    core.message(a, send({ t: "act", kind: "cheer" }), 2_000);
    expect(events(b)).toEqual([
      { t: "act", sid: 1, kind: "bell", x: 300, y: 200 },
      { t: "act", sid: 1, kind: "cheer", x: 300, y: 200 },
    ]);
    expect(events(a)).toEqual(events(b));
  });

  it("slides along the same bench while seated: occupy new + release old together", () => {
    const { core, join } = setup();
    const [s0, , s2] = ["bB-0", "bB-1", "bB-2"].map((id) => seatById(id)!);
    const a = join("a", 0, { x: s0.x, y: s0.y });
    const b = join("b");
    core.message(a, send({ t: "sit", seatId: "bB-0" }), 0);
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: "bB-2" }), 0); // 32px 떨어진 끝자리도 같은 벤치면 OK
    expect(events(b)).toEqual([
      { t: "seat", seatId: "bB-2", sid: 1 },
      { t: "seat", seatId: "bB-0", sid: null },
    ]);
    core.tick(100);
    expect(snapshots(b)[0].entries).toEqual([{ sid: 1, x: s2.x, y: s2.y, state: STATE.sitChair, dir: s2.facing }]);
  });

  it("two seated people sliding into the same free bench seat: only one gets it", () => {
    const { core, join } = setup();
    const [s0, , s2] = ["bB-0", "bB-1", "bB-2"].map((id) => seatById(id)!);
    const a = join("a", 0, { x: s0.x, y: s0.y });
    const b = join("b", 0, { x: s2.x, y: s2.y });
    core.message(a, send({ t: "sit", seatId: "bB-0" }), 0);
    core.message(b, send({ t: "sit", seatId: "bB-2" }), 0);
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: "bB-1" }), 10);
    core.message(b, send({ t: "sit", seatId: "bB-1" }), 10);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: "bB-1" });
    expect(core.peer(1)?.seatId).toBe("bB-1");
    expect(core.peer(2)?.seatId).toBe("bB-2"); // 거절된 쪽은 원래 자리 그대로
    expect(events(a).filter((e) => e.t === "seat" && e.sid !== null)).toEqual([{ t: "seat", seatId: "bB-1", sid: 1 }]);
  });

  it("does not slide across different furniture beyond the seat radius", () => {
    const { core, join } = setup();
    const s = seatById("bB-0")!;
    const a = join("a", 0, { x: s.x, y: s.y });
    core.message(a, send({ t: "sit", seatId: "bB-0" }), 0);
    clear(a);
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    expect(events(a)).toEqual([{ t: "seatDenied", seatId: "bA-0" }]);
    expect(core.peer(1)?.seatId).toBe("bB-0");
  });
});

describe("v4: say / room mode", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("relays say to everyone (sender included), at most every 3s per connection", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "say", id: "hi" }), 0);
    core.message(a, send({ t: "say", id: "hi" }), 2_999);
    core.message(a, send({ t: "say", id: "hi" }), 3_000);
    expect(events(b)).toEqual([
      { t: "say", sid: 1, id: "hi" },
      { t: "say", sid: 1, id: "hi" },
    ]);
    expect(events(a)).toEqual(events(b));
  });

  it("room: capacity applies (4001), seats/emote/graveEvent/firework are ignored, coordinates are u16-only", async () => {
    const { core, join } = setup(2, 20_000, true);
    const a = join("a", 0, { x: 5_000, y: 7_000 }); // 묘지 맵 밖이어도 방에서는 된다
    const b = join("b");
    expect(join("c").closed?.code).toBe(CLOSE.CHANNEL_FULL);
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: "cA" }), 0);
    core.message(a, send({ t: "emote", kind: "flower", graveId: "g1" }), 0);
    core.message(a, send({ t: "graveEvent", kind: "buried", graveId: "g1" }), 0);
    core.message(a, send({ t: "firework", grant: grantToken({ kind: "firework", visitorId: "a", item: "fw_small", nonce: "n", exp: 9e9 }) }), 0);
    core.message(a, send({ t: "say", id: "hi" }), 0);
    core.message(a, move(6_000, 7_000), 0);
    await flush();
    expect(events(b)).toEqual([{ t: "say", sid: 1, id: "hi" }]);
    core.tick(100);
    const [e] = snapshots(b)[0].entries;
    expect(e.x).toBeGreaterThan(5_000); // 묘지 맵(1024px) 밖 좌표를 받아들인다
    expect(e.x).toBeLessThan(6_000); // 속도 예산은 방에서도 그대로
    expect(e.state).toBe(STATE.walk);
  });
});

describe("restore after hibernation", () => {
  it("rebuilds peers, seats and reservations", () => {
    const { core, conn, join } = setup();
    const a = conn("a");
    const recA: PeerRecord = { sid: 4, visitorId: "a", name: "a", color: AVATAR_COLORS[1], x: 420, y: 336, state: STATE.sitChair, dir: DIR.right, seatId: "cA", look: ["hat_cat"], body: "cat", joinedAt: 0 };
    // v1에서 저장된 예약에는 look/joinedAt이 없다
    const recB = { sid: 1, visitorId: "b", name: "b", color: AVATAR_COLORS[0], x: 10, y: 10, state: STATE.idle, dir: DIR.up, seatId: null, until: 5_000 } as unknown as Reservation;
    core.restore([[a, recA]], [recB], 0);
    expect(core.count).toBe(2);
    expect(core.nextExpiry()).toBe(5_000);

    const c = join("c");
    expect(welcome(c)).toMatchObject({ sid: 2, seats: { cA: 4 } });
    expect(welcome(c).peers.map((p) => p.sid).sort()).toEqual([1, 4]);
    expect(welcome(c).peers.find((p) => p.sid === 4)?.look).toEqual(["hat_cat"]);
    expect(welcome(c).peers.find((p) => p.sid === 1)?.look).toEqual([]);
    expect(welcome(c).peers.find((p) => p.sid === 4)?.body).toBe("cat");
    expect(welcome(c).peers.find((p) => p.sid === 1)?.body).toBe("hood"); // 이전 버전 예약 → 기본 몸
    core.message(a, send({ t: "stand" }), 0); // 복원된 소켓이 그대로 동작
    expect(events(c)).toContainEqual({ t: "seat", seatId: "cA", sid: null });
  });
});

describe("restart (redeploy) survival / seat restore", () => {
  /** 실시간 서버 재배포 흉내: 지금 core의 접속자 스냅샷·유예 예약만 들고 새 core를 만든다 (소켓은 모두 사라짐) */
  function redeploy(old: ReturnType<typeof setup>, now: number, liveGraceMs = 60_000) {
    const live = old.core.liveRecords();
    const reserved = [...old.reservations.values()];
    const next = setup(3);
    for (const r of reserved) next.reservations.set(r.sid, r);
    const revived = next.core.restore([], reserved, now, live, liveGraceMs);
    return { next, revived };
  }

  it("liveRecords holds only connected peers (with seat), and changes are reported (urgent for seats/join/leave)", () => {
    const s = setup();
    const calls: boolean[] = [];
    // 호스트에 liveChanged를 붙인 core를 따로 만든다 (DO는 urgent면 0.5초 뒤, 아니면 드물게 저장한다)
    const host: ChannelHost<Conn> = { ...s.host, liveChanged: (u) => void calls.push(u) };
    const core = new ChannelCore<Conn>({ capacity: 3, graceMs: 20_000 }, host);
    const a = s.conn("a");
    core.join(a, { visitorId: "a", name: "a", color: AVATAR_COLORS[0], channel: 1, spawn: { x: bA0.x + 4, y: bA0.y + 4 }, look: [], body: "hood" }, 0);
    expect(calls).toEqual([true]);
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    expect(calls.at(-1)).toBe(true);
    expect(core.liveRecords()).toMatchObject([{ sid: 1, visitorId: "a", seatId: "bA-0", state: STATE.sitChair }]);
    calls.length = 0;
    core.message(a, move(bA0.x, bA0.y, STATE.sitChair, DIR.left), 0); // 방향만 바뀜 → 급하지 않음
    expect(calls).toEqual([false]);
    core.disconnect(a, 1006, 100);
    expect(core.liveRecords()).toEqual([]); // 유예 중인 사람은 예약으로 따로 저장된다
  });

  it("after a restart everyone is a reservation; reconnecting resumes the same sid and seat (others see no leave/join)", () => {
    const old = setup();
    const a = old.join("a", 0, { x: bA0.x + 6, y: bA0.y + 6 });
    old.join("b", 0, { x: 300, y: 300 });
    old.core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);

    const { next, revived } = redeploy(old, 10_000);
    expect(revived).toBe(2);
    expect(next.core.peer(1)).toMatchObject({ online: false, seatId: "bA-0", state: STATE.sitChair });
    expect(next.reservations.get(1)).toMatchObject({ seatId: "bA-0", until: 70_000 });
    expect(next.core.nextExpiry()).toBe(70_000);

    // B가 먼저 돌아온다 → A는 그 자리에 앉은 채(유예)로 보인다
    const b2 = next.join("b", 11_000, { x: 300, y: 300 });
    expect(welcome(b2)).toMatchObject({ sid: 2, resumed: true, seats: { "bA-0": 1 } });
    expect(welcome(b2).peers).toMatchObject([{ sid: 1, x: bA0.x, y: bA0.y, state: STATE.sitChair }]);
    // A가 좌석 좌표로 돌아온다 → 같은 sid·좌석, B에게는 아무 이벤트도 없다(입구 순간이동·중복 아바타 없음)
    const a2 = next.join("a", 12_000, { x: bA0.x, y: bA0.y });
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { "bA-0": 1 } });
    expect(events(b2).filter((e) => e.t !== "welcome")).toEqual([]);
    next.core.tick(12_100);
    expect(snapshots(b2)).toEqual([]);
    expect(next.core.count).toBe(2);
  });

  it("hibernation wake: a snapshot entry with a live socket is not duplicated", () => {
    const old = setup();
    const a = old.join("a");
    const live = old.core.liveRecords();
    const fresh = setup();
    const revived = fresh.core.restore([[a, a.att!]], [], 0, live, 60_000);
    expect(revived).toBe(0);
    expect(fresh.core.count).toBe(1);
    expect(fresh.core.peer(1)?.online).toBe(true);
    expect(fresh.reservations.size).toBe(0);
  });

  it("restored reservations expire with seat release + leave (no ghost)", () => {
    const old = setup();
    const a = old.join("a", 0, { x: bA0.x, y: bA0.y });
    old.core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    const { next } = redeploy(old, 0, 30_000);
    const b = next.join("b", 1_000);
    clear(b);
    next.core.expire(30_000);
    expect(events(b)).toEqual([
      { t: "seat", seatId: "bA-0", sid: null },
      { t: "leave", sid: 1 },
    ]);
  });
});

describe("one seat, one person (restore after a long absence)", () => {
  it("a new joiner on someone else's seat is placed in front of it, never on it", () => {
    const { core, join } = setup();
    const c = join("c", 0, { x: bA0.x + 4, y: bA0.y });
    core.message(c, send({ t: "sit", seatId: "bA-0" }), 0);
    // A는 유예가 끝난 뒤 저장해 둔 좌석 좌표로 새로 들어온다
    const a = join("a", 30_000, { x: bA0.x, y: bA0.y });
    expect(welcome(a)).toMatchObject({ sid: 2, resumed: false, seats: { "bA-0": 1 } });
    expect(core.peer(2)).toMatchObject({ x: bA0.x, y: bA0.y + 9, seatId: null });
    // 그 좌석을 달라고 해도 거절 → 같은 좌석 2명은 없다
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 30_000);
    expect(events(a)).toContainEqual({ t: "seatDenied", seatId: "bA-0" });
    expect(core.peer(1)?.seatId).toBe("bA-0");
    // 옆 빈자리는 받을 수 있다
    core.message(a, send({ t: "sit", seatId: "bA-1" }), 30_000);
    expect(core.peer(2)?.seatId).toBe("bA-1");
  });

  it("a resumed peer whose seat was taken during grace is moved off it", () => {
    const { core, join, conn } = setup();
    const a = join("a", 0, { x: bA0.x, y: bA0.y });
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    core.disconnect(a, 1001, 0);
    core.expire(20_000); // 유예 만료 → 좌석·sid 반납
    const c = join("c", 21_000, { x: bA0.x + 2, y: bA0.y });
    core.message(c, send({ t: "sit", seatId: "bA-0" }), 21_000);
    const a2 = join("a", 25_000, { x: bA0.x, y: bA0.y }, conn("a2"));
    expect(welcome(a2).resumed).toBe(false);
    // 옛 A는 이미 leave 처리됨 → 남들 화면에도, 새 A의 목록에도 유령이 없다 (C만 있다)
    expect(welcome(a2).peers.map((p) => p.name)).toEqual(["c"]);
    expect(core.count).toBe(2);
    expect(core.peer(welcome(a2).sid)).toMatchObject({ y: bA0.y + 9, seatId: null });
  });

  it("takeOver within grace keeps the seat when the client comes back on it", () => {
    const { core, join, conn } = setup();
    const a = join("a", 0, { x: bA0.x, y: bA0.y });
    const b = join("b");
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    core.tick(50);
    core.disconnect(a, 1001, 100);
    core.tick(150);
    clear(b);
    const a2 = join("a", 3_000, { x: bA0.x, y: bA0.y }, conn("a2"));
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { "bA-0": 1 } });
    core.tick(3_100);
    expect(events(b)).toEqual([]);
    expect(snapshots(b)).toEqual([]);
  });
});

describe("one spot, one person: tree hang / swing (39)", () => {
  // 나무 (60,84)의 매달리는 자리 = 줄기 앞 (60,90), 그네 (140,100)의 좌석 = (140,96). 서버는 좌표 id로만 판정한다
  const TREE = { x: 60, y: 90 };
  const SWING = { x: 140, y: 96 };
  const H = spotSeatId("hang", TREE.x, TREE.y);
  const S = spotSeatId("swing", SWING.x, SWING.y);

  it("welcome advertises spot judging (channels and rooms — 3번 집 안 가구 자리)", () => {
    expect(welcome(setup().join("a"))).toMatchObject({ spots: true });
    expect(welcome(setup(3, 20_000, true).join("a"))).toMatchObject({ spots: true });
  });

  it("two players try the same tree at once → only the first hangs, the other gets seatDenied", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: TREE.x + 8, y: TREE.y + 6 });
    const b = join("b", 0, { x: TREE.x - 8, y: TREE.y + 6 });
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: H }), 0);
    core.message(b, send({ t: "sit", seatId: H }), 0);
    expect(events(a)).toEqual([{ t: "seat", seatId: H, sid: 1 }]);
    expect(events(b)).toEqual([
      { t: "seat", seatId: H, sid: 1 },
      { t: "seatDenied", seatId: H },
    ]);
    // 거절된 B가 늦게 보낸 hang MOVE도 자리를 빼앗지 못한다 → B는 그 옆에 서 있는 것으로 보인다
    core.message(b, move(TREE.x, TREE.y, STATE.hang), 10);
    core.message(a, move(TREE.x, TREE.y, STATE.hang), 10);
    core.tick(50);
    const entries = snapshots(a)[0].entries;
    expect(entries).toContainEqual({ sid: 1, x: TREE.x, y: TREE.y, state: STATE.hang, dir: DIR.down });
    expect(entries.find((e) => e.sid === 2)?.state).toBe(STATE.idle);
    expect(core.peer(1)?.seatId).toBe(H);
    expect(core.peer(2)?.seatId).toBeNull();
  });

  it("same for the swing; letting go (non-swing MOVE) frees it for the next player", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: SWING.x, y: SWING.y + 5 });
    const b = join("b", 0, { x: SWING.x + 6, y: SWING.y + 5 });
    core.message(a, send({ t: "sit", seatId: S }), 0);
    core.message(b, send({ t: "sit", seatId: S }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: S });
    expect(core.peer(1)).toMatchObject({ seatId: S, state: STATE.swing, x: SWING.x, y: SWING.y });
    clear(a, b);
    core.message(a, move(SWING.x, SWING.y + 2, STATE.walk), 100);
    expect(events(b)).toEqual([{ t: "seat", seatId: S, sid: null }]);
    core.message(b, send({ t: "sit", seatId: S }), 100);
    expect(core.peer(2)).toMatchObject({ seatId: S, state: STATE.swing });
  });

  it("explicit stand and warp release a spot too; far / malformed spot ids are denied", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: TREE.x, y: TREE.y + 4 });
    core.message(a, send({ t: "sit", seatId: H }), 0);
    core.message(a, send({ t: "stand" }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle });
    core.message(a, send({ t: "sit", seatId: H }), 0);
    core.message(a, send({ t: "warp", x: 500, y: 500 }), 1_000);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle });
    clear(a);
    core.message(a, send({ t: "sit", seatId: H }), 2_000); // 440px 떨어져 있다
    core.message(a, send({ t: "sit", seatId: "h_060_90" }), 2_000);
    expect(events(a)).toEqual([
      { t: "seatDenied", seatId: H },
      { t: "seatDenied", seatId: "h_060_90" },
    ]);
  });

  it("legacy clients (no sit for spots) are claimed from their hang MOVE — still one per tree", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: TREE.x + 4, y: TREE.y + 8 });
    const b = join("b", 0, { x: TREE.x - 4, y: TREE.y + 8 });
    clear(a, b);
    core.message(a, move(TREE.x, TREE.y, STATE.hang), 0);
    expect(events(b)).toEqual([{ t: "seat", seatId: H, sid: 1 }]);
    core.message(b, move(TREE.x, TREE.y, STATE.hang), 0);
    expect(core.peer(2)).toMatchObject({ seatId: null, state: STATE.idle });
    // 앉아 있던 의자에서 바로 나무로 옮겨도 한 사람 한 자리
    const c = join("c", 0, { x: bA0.x, y: bA0.y + 4 });
    core.message(c, send({ t: "sit", seatId: "bA-0" }), 0);
    core.message(a, move(TREE.x + 2, TREE.y + 9, STATE.walk), 100); // A가 내려옴
    core.message(c, move(TREE.x, TREE.y, STATE.hang), 5_000); // 순간이동은 아니지만 판정은 보고 위치 기준
    expect(core.peer(3)?.seatId).toBe(null); // 의자에서 280px 떨어진 나무: 직전 보고 위치(의자)와 멀어 거절
    expect(core.peer(3)?.state).toBe(STATE.idle);
  });

  it("rooms ignore spots (no claim, state passes through)", () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a", 0, { x: TREE.x, y: TREE.y });
    core.message(a, move(TREE.x, TREE.y, STATE.hang), 0);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.hang });
  });

  it("reload / redeploy keep the spot (resume on the anchor), and a newcomer is never placed on an occupied spot", () => {
    const old = setup();
    const a = old.join("a", 0, { x: TREE.x, y: TREE.y + 6 });
    old.core.message(a, send({ t: "sit", seatId: H }), 0);
    // 새로고침: 1001로 끊기고 같은 좌표(앵커)로 돌아온다 → 자리 유지
    old.core.disconnect(a, 1001, 100);
    const a2 = old.join("a", 2_000, { ...TREE }, old.conn("a2"));
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { [H]: 1 } });
    // 재배포: 스냅샷으로 되살아나 같은 자리
    const live = old.core.liveRecords();
    const next = setup();
    next.core.restore([], [], 10_000, live, 60_000);
    expect(next.core.peer(1)).toMatchObject({ seatId: H, state: STATE.hang });
    // 그 사이 새로 온 사람이 앵커 좌표로 들어와도 그 위가 아니라 앞에 선다
    const c = next.join("c", 11_000, { ...TREE });
    expect(welcome(c).seats).toEqual({ [H]: 1 });
    expect(next.core.peer(welcome(c).sid)).toMatchObject({ x: TREE.x, y: TREE.y + 9, seatId: null });
  });
});

describe("rowboat: a moving one-person seat (50)", () => {
  const A = BOAT_SEATS.find((b) => b.boatId === "boatA")!;
  const C0 = BOAT_SEATS.find((b) => b.boatId === "boatC" && b.index === 0)!;
  const C1 = BOAT_SEATS.find((b) => b.boatId === "boatC" && b.index === 1)!;
  const DOCK = { x: FERRY_DOCK.x, y: FERRY_DOCK.y }; // 맵 개편으로 나루터가 옮겨져도 (위치는 protocol에서)

  it("board from the dock (wider radius), one per boat seat; the server follows the rowing boat instead of pinning it", () => {
    const { core, join } = setup();
    const a = join("a", 0, DOCK);
    const b = join("b", 0, { x: DOCK.x, y: DOCK.y - 4 });
    core.message(a, send({ t: "sit", seatId: A.id }), 0);
    core.message(b, send({ t: "sit", seatId: A.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: A.id });
    expect(core.peer(1)).toMatchObject({ seatId: A.id, state: STATE.boat, x: A.x, y: A.y });
    clear(a, b);
    // 노를 저어 동쪽으로 (속도 예산 안에서 서버 위치가 따라간다), 자리는 그대로
    core.message(a, move(A.x + 20, A.y + 4, STATE.boat, DIR.right), 1_000);
    core.tick(1_050);
    expect(core.peer(1)).toMatchObject({ seatId: A.id, state: STATE.boat, x: A.x + 20, y: A.y + 4 });
    expect(snapshots(b)[0].entries).toContainEqual({ sid: 1, x: A.x + 20, y: A.y + 4, state: STATE.boat, dir: DIR.right });
    // 내리면(물가에서 걷기) 자리가 풀린다
    core.message(a, move(A.x + 20, A.y - 30, STATE.idle), 1_600);
    expect(events(b)).toContainEqual({ t: "seat", seatId: A.id, sid: null });
  });

  it("only the fixed boat seats exist (no boats at arbitrary coordinates); far from the dock is denied", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: 600, y: 860 });
    core.message(a, send({ t: "sit", seatId: "b_600_860" }), 0);
    core.message(a, send({ t: "sit", seatId: A.id }), 0);
    expect(events(a).filter((e) => e.t === "seatDenied")).toEqual([
      { t: "seatDenied", seatId: "b_600_860" },
      { t: "seatDenied", seatId: A.id },
    ]);
  });

  it("two-seat boat: a passenger takes the back seat; when the rower leaves, the passenger slides forward without being teleported", () => {
    const { core, join } = setup();
    const r = join("r", 0, DOCK);
    const p = join("p", 0, DOCK);
    core.message(r, send({ t: "sit", seatId: C0.id }), 0);
    core.message(p, send({ t: "sit", seatId: C1.id }), 0);
    expect(core.peer(2)).toMatchObject({ seatId: C1.id, state: STATE.boat });
    // 둘이 같이 저어 나간다
    core.message(r, move(C0.x - 30, C0.y + 6, STATE.boat, DIR.left), 2_000);
    core.message(p, move(C1.x - 30, C1.y + 6, STATE.boat, DIR.left), 2_000);
    core.tick(2_050);
    // 노 젓던 사람이 둑으로 내린다 → 뒷자리 사람이 앞자리로 (거리와 상관없이 같은 배 안)
    core.message(r, move(C0.x - 30, C0.y - 30, STATE.idle), 3_000);
    core.message(p, send({ t: "sit", seatId: C0.id }), 3_000);
    expect(core.peer(2)).toMatchObject({ seatId: C0.id, state: STATE.boat, x: C1.x - 30, y: C1.y + 6 });
  });

  it("two-seat boat away from the dock (F13): someone on the shore beside the rower boards the free back seat; strangers far away or beside another boat cannot", () => {
    const { core, join } = setup();
    const r = join("r", 0, DOCK);
    core.message(r, send({ t: "sit", seatId: C0.id }), 0);
    // 노 젓는 사람이 나루터에서 멀리 (앵커 반경 72px 밖) 저어 간다
    for (let i = 1; i <= 4; i++) {
      core.message(r, move(C0.x - 50 * i, C0.y + 4, STATE.boat, DIR.left), i * 1_000);
      core.tick(i * 1_000 + 50);
    }
    const boatAt = { x: C0.x - 200, y: C0.y + 4 };
    expect(core.peer(1)).toMatchObject({ seatId: C0.id, x: boatAt.x, y: boatAt.y });
    // 물가에서 배 곁에 선 사람 → 뒷자리 (위치는 순간이동하지 않는다 — 다음 MOVE로 배 위로)
    const shore = { x: boatAt.x + 10, y: boatAt.y - 24 };
    const p = join("p", 5_000, shore);
    core.message(p, send({ t: "sit", seatId: C1.id }), 5_000);
    expect(core.peer(2)).toMatchObject({ seatId: C1.id, state: STATE.boat, x: shore.x, y: shore.y });
    expect(events(r)).toContainEqual({ t: "seat", seatId: C1.id, sid: 2 });
    // 자리는 한 명씩: 뒷자리가 찼으니 다른 사람은 안 된다, 앞자리(노 젓는 자리)도 안 된다
    const q = join("q", 5_100, shore);
    core.message(q, send({ t: "sit", seatId: C1.id }), 5_100);
    core.message(q, send({ t: "sit", seatId: C0.id }), 5_100);
    expect(events(q).filter((e) => e.t === "seatDenied")).toHaveLength(2);
    // 다른 배(1인승) 곁이라고 2인승 자리를 잡을 수는 없다: 1인승 사공 곁에서 C1 요청 → 거절
    const { core: core2, join: join2 } = setup();
    const a = join2("a", 0, DOCK);
    core2.message(a, send({ t: "sit", seatId: A.id }), 0);
    for (let i = 1; i <= 4; i++) {
      core2.message(a, move(A.x - 50 * i, A.y + 8, STATE.boat, DIR.left), i * 1_000);
      core2.tick(i * 1_000 + 50);
    }
    const s2 = join2("s", 5_000, { x: A.x - 200, y: A.y - 16 });
    core2.message(s2, send({ t: "sit", seatId: C1.id }), 5_000);
    expect(events(s2)).toContainEqual({ t: "seatDenied", seatId: C1.id });
    // 아무 배 곁도 아니고 나루터에서도 멀면 → 거절
    const f2 = join2("f", 5_000, { x: A.x - 420, y: A.y - 16 });
    core2.message(f2, send({ t: "sit", seatId: C1.id }), 5_000);
    expect(events(f2)).toContainEqual({ t: "seatDenied", seatId: C1.id });
  });

  it("reload (grace) and redeploy keep the boat seat where the boat is, and nobody is nudged off a moving seat's anchor", () => {
    const old = setup();
    const a = old.join("a", 0, DOCK);
    old.core.message(a, send({ t: "sit", seatId: A.id }), 0);
    old.core.message(a, move(A.x + 60, A.y + 10, STATE.boat, DIR.right), 2_000);
    old.core.tick(2_050);
    old.core.disconnect(a, 1001, 2_100);
    const far = { x: A.x + 64, y: A.y + 11 };
    const a2 = old.join("a", 4_000, far, old.conn("a2"));
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true, seats: { [A.id]: 1 } });
    expect(old.core.peer(1)).toMatchObject({ seatId: A.id, x: far.x, y: far.y });
    const next = setup();
    next.core.restore([], [], 10_000, old.core.liveRecords(), 60_000);
    expect(next.core.peer(1)).toMatchObject({ seatId: A.id, state: STATE.boat, x: far.x, y: far.y });
    // 배의 앵커(나루터) 위로 새로 들어온 사람은 옮겨지지 않는다 (배는 나가 있다)
    const c = next.join("c", 11_000, { x: A.x, y: A.y });
    expect(next.core.peer(welcome(c).sid)).toMatchObject({ x: A.x, y: A.y });
  });
});

describe("plaza rides: seesaw / trampoline / carousel are one-person spots (50)", () => {
  it("each end, the trampoline and each horse is a spot judged like a swing", () => {
    const { core, join } = setup();
    const e = spotSeatId("seesaw", 950, 640);
    const t = spotSeatId("trampoline", 1080, 630);
    const r = spotSeatId("carousel", 880, 652);
    const a = join("a", 0, { x: 950, y: 646 });
    const b = join("b", 0, { x: 950, y: 648 });
    core.message(a, send({ t: "sit", seatId: e }), 0);
    core.message(b, send({ t: "sit", seatId: e }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: e, state: STATE.seesaw, x: 950, y: 640 });
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: e });
    const c = join("c", 0, { x: 1080, y: 640 });
    core.message(c, send({ t: "sit", seatId: t }), 0);
    expect(core.peer(3)).toMatchObject({ seatId: t, state: STATE.trampoline });
    core.message(b, move(880, 676, STATE.walk), 3_000);
    core.message(b, send({ t: "sit", seatId: r }), 3_000);
    expect(core.peer(2)).toMatchObject({ seatId: r, state: STATE.carousel, x: 880, y: 652 });
  });
});

describe("ferris wheel and hot-air balloon seats (놀이기구 2)", () => {
  it("ferris car seats are fixed one-person spots; the position stays at the boarding anchor", () => {
    const { core, join } = setup();
    const w = FERRIS_SEATS[0];
    const a = join("a", 0, { x: w.x, y: w.y + 4 });
    const b = join("b", 0, { x: w.x + 2, y: w.y + 4 });
    core.message(a, send({ t: "sit", seatId: w.id }), 0);
    core.message(b, send({ t: "sit", seatId: w.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: w.id, state: STATE.ferris, x: w.x, y: w.y });
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: w.id });
    // 같은 칸 옆자리는 다른 사람이 탄다
    core.message(b, send({ t: "sit", seatId: FERRIS_SEATS[1].id }), 0);
    expect(core.peer(2)).toMatchObject({ seatId: FERRIS_SEATS[1].id, state: STATE.ferris });
    // 타고 있는 동안 MOVE(ferris)는 자리를 지키고, 내려서 걸으면 놓는다
    core.message(a, move(w.x, w.y, STATE.ferris), 1_000);
    expect(core.peer(1)).toMatchObject({ seatId: w.id, x: w.x, y: w.y });
    core.message(a, move(w.x, w.y + 3, STATE.walk), 40_000);
    expect(core.peer(1)!.seatId).toBeNull();
  });

  it("balloon seats are taken only while that balloon waits at the pad (timetable = server clock)", () => {
    const { core, join } = setup();
    const s0 = BALLOON_SEATS.find((s) => s.balloon === 0)!;
    const a = join("a", 0, { x: s0.x, y: s0.y + 2 });
    core.message(a, send({ t: "sit", seatId: s0.id }), 10_000);
    expect(core.peer(1)).toMatchObject({ seatId: s0.id, state: STATE.balloon });
    // 기구 0이 떠난 뒤: 그 기구의 다른 자리는 거절
    const s1 = BALLOON_SEATS.find((s) => s.balloon === 0 && s.index === 1)!;
    const b = join("b", 0, { x: s1.x, y: s1.y + 2 });
    core.message(b, send({ t: "sit", seatId: s1.id }), BALLOON_BOARD_MS + 5_000);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: s1.id });
    expect(core.peer(2)!.seatId).toBeNull();
    // MOVE(balloon 상태)로도 떠난 기구의 자리는 잡지 못한다
    core.message(b, move(s1.x, s1.y, STATE.balloon), BALLOON_BOARD_MS + 6_000);
    expect(core.peer(2)).toMatchObject({ seatId: null, state: STATE.idle });
    // 기구 1이 내려와 있을 때(반 주기 뒤)는 탄다
    const t1 = BALLOON_CYCLE_MS / 2 + 5_000;
    const s2 = BALLOON_SEATS.find((s) => s.balloon === 1)!;
    core.message(b, send({ t: "sit", seatId: s2.id }), t1);
    expect(core.peer(2)).toMatchObject({ seatId: s2.id, state: STATE.balloon });
  });
});

describe("fishing spots are fixed one-person spots (4)", () => {
  it("only listed spots, one angler each; sitting on the ground never claims one; moving off releases it", () => {
    const { core, join } = setup();
    const spot = FISHING_SPOTS[0];
    const a = join("a", 0, { x: spot.x - 4, y: spot.y });
    const b = join("b", 0, { x: spot.x - 6, y: spot.y });
    core.message(a, send({ t: "sit", seatId: spot.id }), 0);
    core.message(b, send({ t: "sit", seatId: spot.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: spot.id, state: STATE.sitGround, dir: spot.facing, x: spot.x, y: spot.y });
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: spot.id });
    // 목록에 없는 좌표는 형식이 맞아도 거절
    core.message(b, send({ t: "sit", seatId: `f_${spot.x - 6}_${spot.y}` }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: `f_${spot.x - 6}_${spot.y}` });
    // 바닥 앉기 MOVE는 낚시 자리를 잡지 않는다 (shared)
    core.message(b, move(spot.x - 6, spot.y, STATE.sitGround), 500);
    expect(core.peer(2)).toMatchObject({ seatId: null, state: STATE.sitGround });
    // 낚시 중에는 sitGround MOVE로 자리를 유지하고, 걸으면 놓는다
    core.message(a, move(spot.x, spot.y, STATE.sitGround, DIR.right), 600);
    expect(core.peer(1)).toMatchObject({ seatId: spot.id });
    core.message(a, move(spot.x - 3, spot.y, STATE.walk), 900);
    expect(core.peer(1)!.seatId).toBeNull();
  });
});

describe("23번 확성기", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const mega = (nonce: string, scope: "channel" | "all" = "channel", ch = 1, visitorId = "a") =>
    send({ t: "megaphone", grant: grantToken({ kind: "megaphone", visitorId, nonce, name: "새벽코더", text: "다들 안녕!", scope, ch, exp: 9e9 }) });

  it("서명된 문장을 채널 모두(보낸 사람 포함)에게 한 번만, 연결당 3초 간격으로 방송한다", async () => {
    const { core, join, host } = setup();
    host.channelNo = () => 1;
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, mega("m1"), 0);
    core.message(a, mega("m2"), 1_000); // 3초 안 → 무시
    core.message(a, mega("m1"), 3_000); // 같은 nonce → 무시
    core.message(a, mega("m3", "channel", 2), 6_000); // 다른 채널용 증서 → 무시
    core.message(b, mega("m4", "channel", 1, "a"), 9_000); // 남의 증서 → 무시
    await flush();
    const got = events(b).filter((e) => e.t === "megaphone");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ t: "megaphone", id: "m1", name: "새벽코더", text: "다들 안녕!", scope: "channel", ch: 1 });
    expect(events(a).filter((e) => e.t === "megaphone")).toHaveLength(1);
  });

  it("모든 채널 확성기는 호스트에 전달을 맡기고, 전해 받은 쪽도 nonce로 한 번만 방송한다", async () => {
    const { core, join, host } = setup();
    const relayed: string[] = [];
    host.channelNo = () => 3;
    host.relayMegaphone = (nonce) => void relayed.push(nonce);
    const a = join("a");
    clear(a);
    core.message(a, mega("all1", "all", 1), 0); // 다른 채널에서 산 전체 확성기여도 받는다
    await flush();
    expect(relayed).toEqual(["all1"]);
    const other = setup();
    const c = other.join("c");
    clear(c);
    const data = events(a).find((e) => e.t === "megaphone")!;
    expect(other.core.relayedMegaphone("all1", 9e12, JSON.stringify(data))).toBe(true);
    expect(other.core.relayedMegaphone("all1", 9e12, JSON.stringify(data))).toBe(false);
    expect(events(c).filter((e) => e.t === "megaphone")).toHaveLength(1);
  });

  it("방(room)은 확성기를 받지 않는다", async () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a");
    clear(a);
    core.message(a, mega("r1"), 0);
    await flush();
    expect(events(a).some((e) => e.t === "megaphone")).toBe(false);
    expect(core.relayedMegaphone("r1", 9e12, "{}")).toBe(false);
  });
});

describe("3번 집 안 가구: 방(집)의 1인 자리와 use 중계", () => {
  // 집 씬 좌표의 침대 자리·의자 자리 (앵커 = 발 위치). 서버는 형식과 거리만 본다
  const BED = spotSeatId("bed", 200, 120);
  const CHAIR = spotSeatId("chair", 120, 90);

  it("한 침대에는 한 명: 먼저 온 사람만 눕고 다른 사람은 seatDenied", () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a", 0, { x: 205, y: 128 });
    const b = join("b", 0, { x: 195, y: 128 });
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: BED }), 0);
    core.message(b, send({ t: "sit", seatId: BED }), 0);
    expect(events(a)).toEqual([{ t: "seat", seatId: BED, sid: 1 }]);
    expect(events(b)).toEqual([
      { t: "seat", seatId: BED, sid: 1 },
      { t: "seatDenied", seatId: BED },
    ]);
    core.message(a, move(200, 120, STATE.lie), 10);
    core.message(b, move(200, 120, STATE.lie), 10); // 거절된 사람이 늦게 보낸 눕기 MOVE도 자리를 빼앗지 못한다
    core.tick(50);
    expect(core.peer(1)).toMatchObject({ seatId: BED, state: STATE.lie });
    expect(core.peer(2)?.state).toBe(STATE.idle);
    // 일어나면(걷기 MOVE) 자리가 풀리고 다른 사람이 누울 수 있다
    core.message(a, move(205, 130, STATE.walk), 200);
    core.message(b, send({ t: "sit", seatId: BED }), 300);
    expect(core.peer(2)?.seatId).toBe(BED);
  });

  it("의자 자리(shared sitChair)는 sit 요청으로만 잡힌다", () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a", 0, { x: 120, y: 96 });
    core.message(a, send({ t: "sit", seatId: CHAIR }), 0);
    core.message(a, move(120, 90, STATE.sitChair), 10);
    expect(core.peer(1)).toMatchObject({ seatId: CHAIR, state: STATE.sitChair });
  });

  it("집 안 자리는 월드 채널에서, 월드 자리는 방에서 받지 않는다", () => {
    const world = setup();
    const a = world.join("a", 0, { x: 200, y: 120 });
    world.core.message(a, send({ t: "sit", seatId: BED }), 0);
    expect(events(a)).toContainEqual({ t: "seatDenied", seatId: BED });
    world.core.message(a, move(200, 120, STATE.lie), 10);
    expect(world.core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle });

    const room = setup(3, 20_000, true);
    const b = room.join("b", 0, { x: 60, y: 90 });
    room.core.message(b, send({ t: "sit", seatId: spotSeatId("hang", 60, 90) }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: spotSeatId("hang", 60, 90) });
  });

  it("use: 방에서만 다른 사람에게 중계하고 USE_INTERVAL_MS 안의 연타는 버린다", () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "use", u: "ab12cd", a: 3 }), 0);
    core.message(a, send({ t: "use", u: "ab12cd", a: 4 }), 40);
    core.message(a, send({ t: "use", u: "ab12cd", a: 5 }), 100);
    expect(events(b)).toEqual([
      { t: "use", sid: 1, u: "ab12cd", a: 3 },
      { t: "use", sid: 1, u: "ab12cd", a: 5 },
    ]);
    expect(events(a)).toEqual([]);
    const w = setup();
    const c = w.join("c");
    const d = w.join("d");
    clear(c, d);
    w.core.message(c, send({ t: "use", u: "ab12cd", a: 3 }), 0);
    expect(events(d)).toEqual([]);
  });
});

describe("5번 이모티콘 / 24번 벤치 상태", () => {
  it("emo: 보낸 사람 빼고 중계, 연결당 1초에 한 번 (도배 제한)", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "emo", id: "heart" }), 0);
    core.message(a, send({ t: "emo", id: "laugh" }), 999);
    core.message(a, send({ t: "emo", id: "laugh" }), 1_000);
    core.message(a, '{"t":"emo","id":"bomb"}', 5_000);
    expect(events(b)).toEqual([
      { t: "emo", sid: 1, id: "heart" },
      { t: "emo", sid: 1, id: "laugh" },
    ]);
    expect(events(a)).toEqual([]);
  });

  it("emo는 방(마을·집)에서도 중계한다", () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "emo", id: "zzz" }), 0);
    expect(events(b)).toEqual([{ t: "emo", sid: 1, id: "zzz" }]);
  });

  it("mood: 의자·벤치에 앉아 있을 때만 받고, 늦게 온 사람은 입장 정보로, 일어나면 풀린다", () => {
    const { core, join } = setup(5);
    const a = join("a", 0, { x: bA0.x + 4, y: bA0.y + 4 });
    const b = join("b");
    // 서 있으면 무시
    core.message(a, send({ t: "mood", m: "study" }), 0);
    expect(events(b).filter((e) => e.t === "mood")).toEqual([]);
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 100);
    clear(a, b);
    core.message(a, send({ t: "mood", m: "study" }), 1_000);
    expect(events(b)).toEqual([{ t: "mood", sid: 1, m: "study" }]);
    expect(events(a)).toEqual([{ t: "mood", sid: 1, m: "study" }]);
    // 간격 안의 연타는 버린다
    core.message(a, send({ t: "mood", m: "work" }), 1_100);
    expect(core.peer(1)?.mood).toBe("study");
    // 늦게 온 사람
    const c = join("c", 1_200);
    expect(welcome(c).peers.find((p) => p.sid === 1)?.mood).toBe("study");
    clear(a, b, c);
    // 일어나면 자리 해제와 함께 풀린다
    core.message(a, send({ t: "stand" }), 3_000);
    expect(events(b)).toContainEqual({ t: "mood", sid: 1, m: "" });
    expect(core.peer(1)?.mood).toBeUndefined();
    const d = join("d", 3_100);
    expect(welcome(d).peers.find((p) => p.sid === 1)?.mood).toBeUndefined();
  });

  it("mood: 걸어서 일어나도(sitChair가 아닌 MOVE) 풀리고, 직접 빈 문자열로 풀 수 있다", () => {
    const { core, join } = setup();
    const a = join("a", 0, { x: bA0.x + 4, y: bA0.y + 4 });
    const b = join("b");
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 0);
    core.message(a, send({ t: "mood", m: "music" }), 1_000);
    core.message(a, send({ t: "mood", m: "" }), 2_000);
    expect(core.peer(1)?.mood).toBeUndefined();
    core.message(a, send({ t: "mood", m: "call" }), 3_000);
    expect(core.peer(1)?.mood).toBe("call");
    clear(b);
    core.message(a, move(bA0.x + 8, bA0.y + 9, STATE.walk), 4_000);
    expect(events(b)).toContainEqual({ t: "mood", sid: 1, m: "" });
    expect(core.peer(1)?.mood).toBeUndefined();
  });
});

describe("말풍선 채팅", () => {
  it("가린 글을 보낸 사람 빼고 같은 채널에만 중계한다 (다른 채널은 받지 않는다)", () => {
    const { core, join } = setup();
    const other = setup();
    const a = join("a");
    const b = join("b");
    const c = other.join("c");
    clear(a, b, c);
    core.message(a, send({ t: "chat", text: "  안녕 씨발  " }), 0);
    expect(events(b)).toMatchObject([{ t: "chat", sid: 1, text: "안녕 ***", at: 0 }]);
    expect((events(b)[0] as { id?: unknown }).id).toEqual(expect.any(String));
    expect(events(a)).toEqual([]);
    expect(events(c)).toEqual([]);
  });

  it("토큰 버킷: 3번까지 몰아 보내고 그 뒤로는 1초에 1번, 넘치면 조용히 버린다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    for (const [i, t] of [0, 100, 200, 300, 999, 1_000, 1_500, 2_000].entries()) core.message(a, send({ t: "chat", text: `ㅋ${i}` }), t);
    expect(events(b).map((e) => (e as { text: string }).text)).toEqual(["ㅋ0", "ㅋ1", "ㅋ2", "ㅋ5", "ㅋ7"]);
    expect(a.closed).toBeUndefined();
  });

  it("60자 넘는 글·공백만은 버린다, 방(마을·집)에서도 중계한다", () => {
    const { core, join } = setup(3, 20_000, true);
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, JSON.stringify({ t: "chat", text: "가".repeat(61) }), 0);
    core.message(a, '{"t":"chat","text":"   "}', 0);
    core.message(a, send({ t: "chat", text: "가".repeat(60) }), 0);
    expect(events(b)).toMatchObject([{ t: "chat", sid: 1, text: "가".repeat(60) }]);
  });

  const chatLogs = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "chatLog" }> => e.t === "chatLog");

  it("늦게 들어온 사람은 welcome 뒤에 이 방의 최근 5분 채팅(chatLog)을 받는다. 5분 지난 줄은 빠지고, 줄이 없으면 보내지 않는다", () => {
    const { core, join } = setup();
    const a = join("a");
    expect(chatLogs(a)).toEqual([]);
    core.message(a, send({ t: "chat", text: "첫 줄" }), 1_000);
    core.message(a, send({ t: "chat", text: "둘째 씨발" }), 30_000);
    const b = join("b", 40_000);
    const types = events(b).map((e) => e.t);
    expect(types.indexOf("chatLog")).toBeGreaterThan(types.indexOf("welcome"));
    expect(chatLogs(b)).toMatchObject([{ now: 40_000, lines: [{ at: 1_000, name: "a", text: "첫 줄" }, { at: 30_000, name: "a", text: "둘째 ***" }] }]);
    expect(chatLogs(b)[0].lines.every((l) => l.mine === undefined)).toBe(true);
    // 5분 지난 첫 줄은 빠진다
    const c = join("c", 301_000);
    expect(chatLogs(c)[0].lines.map((l) => l.text)).toEqual(["둘째 ***"]);
    // 모두 지나면 보내지 않는다
    const d = join("d", 330_001);
    expect(chatLogs(d)).toEqual([]);
  });

  it("chatLog 줄 id는 실시간 chat 방송의 id와 같다 (클라이언트 중복 제거)", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "chat", text: "안녕" }), 100);
    const live = events(b).find((e) => e.t === "chat") as Extract<S2C, { t: "chat" }>;
    const c = join("c", 200);
    expect(chatLogs(c)[0].lines).toEqual([{ id: live.id, at: 100, name: "a", text: "안녕" }]);
  });

  it("재접속하면 내 줄은 mine으로 받는다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "chat", text: "나야" }), 0);
    core.message(b, send({ t: "chat", text: "너야" }), 10);
    core.disconnect(a, 1006, 1_000);
    const a2 = join("a", 2_000);
    expect(chatLogs(a2)[0].lines).toMatchObject([{ text: "나야", mine: true }, { text: "너야" }]);
    expect(chatLogs(a2)[0].lines[1].mine).toBeUndefined();
  });

  it("실내에서 마을로 돌아오면(away off) 그동안의 마을 채팅을 chatLog로 다시 받는다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "away", on: true }), 0);
    core.message(b, send({ t: "chat", text: "집에 간 사이" }), 5_000);
    clear(a);
    core.message(a, send({ t: "away", on: false }), 10_000);
    expect(chatLogs(a)).toMatchObject([{ now: 10_000, lines: [{ name: "b", text: "집에 간 사이" }] }]);
    // 들어갈 때는 보내지 않는다
    clear(a);
    core.message(a, send({ t: "away", on: true }), 20_000);
    expect(chatLogs(a)).toEqual([]);
  });

  it("방(집)마다 따로 들고 있다: 다른 방·다른 채널 채팅은 섞이지 않는다", () => {
    const house1 = setup(3, 20_000, true);
    const house2 = setup(3, 20_000, true);
    const village = setup();
    house1.core.message(house1.join("a"), send({ t: "chat", text: "집1" }), 0);
    house2.core.message(house2.join("b"), send({ t: "chat", text: "집2" }), 0);
    village.core.message(village.join("c"), send({ t: "chat", text: "마을" }), 0);
    expect(chatLogs(house1.join("x", 100))[0].lines.map((l) => l.text)).toEqual(["집1"]);
    expect(chatLogs(house2.join("x", 100))[0].lines.map((l) => l.text)).toEqual(["집2"]);
    expect(chatLogs(village.join("x", 100))[0].lines.map((l) => l.text)).toEqual(["마을"]);
  });
});
