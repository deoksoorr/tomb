import {
  AVATAR_COLORS,
  BOAT_SEATS,
  BUMPER_GATE,
  BUMPER_SEATS,
  CAMP_ARRIVE,
  CAMP_FISHING_SPOTS,
  DIR,
  SPAWN,
  STATE,
  campSeatById,
  decodeSnapshot,
  encodeEvent,
  encodeMove,
  goblinPos,
  signGrant,
  signJoinToken,
  spotSeatId,
  type C2S,
  type Grant,
  type S2C,
  type StateId,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { admit } from "./auth";
import { ChannelCore, MAP_INTERVAL_MS, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";
import { parseMap, parseSpawn } from "./logic";

// 11/15 언젠가 캠핑장: 같은 채널(Channel DO) 안에서 사람마다 맵. 위치·말풍선·채팅·몸짓은 같은 맵끼리만, 정원·확성기는 채널 전체.

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null; closed?: { code: number } };

function setup(capacity = 10, opts: { goblin?: boolean; random?: () => number } = {}) {
  const live: { rec?: PeerRecord[] } = {};
  const nonces = new Set<string>();
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code) => void (c.closed = { code }),
    persist: (c, rec) => void (c.att = rec),
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async (token) => (token === "bad" ? null : (JSON.parse(token) as Grant)),
    claimNonce: (nonce) => {
      if (nonces.has(nonce)) return false;
      nonces.add(nonce);
      return true;
    },
    ...(opts.goblin ? { signGrant: (g: Grant) => signGrant("secret", g), random: opts.random ?? (() => 0.5) } : {}),
  };
  const core = new ChannelCore<Conn>({ capacity, graceMs: 20_000 }, host);
  const join = (id: string, o: { camp?: boolean; map?: "camp"; spawn?: { x: number; y: number }; now?: number; c?: Conn } = {}) => {
    const c = o.c ?? { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: [], body: "hood", ...(o.camp ? { camp: true as const } : {}), ...(o.map ? { map: o.map } : {}) };
    core.join(c, t, o.now ?? 0);
    return c;
  };
  return { core, join, live };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const snaps = (c: Conn) => c.out.filter((d): d is ArrayBuffer => typeof d !== "string").map((d) => decodeSnapshot(d)!);
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const mapped = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "mapped" }> => e.t === "mapped");
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (m: C2S) => encodeEvent(m);
const move = (x: number, y: number, state: StateId = STATE.walk) => encodeMove({ x, y, state, dir: DIR.down, seq: 0 });
const toCamp = (x: number = CAMP_ARRIVE.x, y: number = CAMP_ARRIVE.y) => send({ t: "map", m: "camp", x, y });
const toVillage = (x: number = SPAWN.x, y: number = SPAWN.y) => send({ t: "map", m: "village", x, y });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("map switch (bus)", () => {
  it("leave to the old map, join to the new map, mapped with only the new map's people", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true });
    const v = join("v"); // 마을에 남는 사람 (옛 클라이언트도 이 자리)
    const c = join("c", { camp: true, map: "camp", spawn: { x: 300, y: 700 } });
    expect(welcome(c)).toMatchObject({ m: "camp", peers: [] }); // 캠핑장엔 아직 아무도 없다
    expect(welcome(v).peers.map((p) => p.sid)).toEqual([1]); // 마을 사람은 캠핑장 사람을 모른다
    expect(events(a).filter((e) => e.t === "join")).toEqual([expect.objectContaining({ sid: 2 })]); // c의 join은 오지 않는다
    clear(a, v, c);

    core.message(a, toCamp(), 1_000);
    expect(events(v)).toEqual([{ t: "leave", sid: 1 }]);
    expect(events(c)).toEqual([expect.objectContaining({ t: "join", sid: 1, x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y })]);
    expect(mapped(a)).toEqual([{ t: "mapped", m: "camp", peers: [expect.objectContaining({ sid: 3, x: 300, y: 700 })], seats: {} }]);
    expect(core.peer(1)).toMatchObject({ map: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y });
    expect(core.roster().find((r) => r.sid === 1)).toMatchObject({ map: "camp" });
    expect(core.roster().find((r) => r.sid === 2)?.map).toBeUndefined();
    expect(core.count).toBe(3); // 정원·인원은 채널 전체

    // 돌아오기 (간격 안의 요청은 버린다)
    clear(a, v, c);
    core.message(a, toVillage(), 1_000 + MAP_INTERVAL_MS - 1);
    expect(mapped(a)).toEqual([]);
    core.message(a, toVillage(), 1_000 + MAP_INTERVAL_MS);
    expect(events(c)).toEqual([{ t: "leave", sid: 1 }]);
    expect(events(v)).toEqual([expect.objectContaining({ t: "join", sid: 1, x: SPAWN.x, y: SPAWN.y })]);
    expect(mapped(a)[0]).toMatchObject({ m: "village", peers: [expect.objectContaining({ sid: 2 })] });
    expect(core.peer(1)?.map).toBeUndefined();
  });

  it("without camp permission (or out of bounds) the map stays and mapped tells the current map", () => {
    const { core, join } = setup();
    const a = join("a");
    const v = join("v");
    clear(a, v);
    core.message(a, toCamp(), 0);
    expect(mapped(a)).toEqual([{ t: "mapped", m: "village", peers: [expect.objectContaining({ sid: 2 })], seats: {} }]);
    expect(events(v)).toEqual([]);
    expect(core.peer(1)?.map).toBeUndefined();

    const b = join("b", { camp: true });
    core.message(b, toCamp(5_000, 5_000), 0); // 캠핑장 밖
    expect(mapped(b)[0].m).toBe("village");
    // 허락 없이 처음부터 캠핑장으로 들어오려 해도 마을
    const c = join("c", { map: "camp", spawn: { x: 100, y: 100 } });
    expect(welcome(c).m).toBeUndefined();
  });

  it("releases the seat (to the old map only) and turns away off when switching", () => {
    const { core, join } = setup();
    const bench = campSeatById("qL1")!;
    const a = join("a", { camp: true, map: "camp", spawn: { x: bench.x, y: bench.y + 6 } });
    const c = join("c", { camp: true, map: "camp" });
    const v = join("v");
    core.message(a, send({ t: "sit", seatId: "qL1" }), 0);
    expect(events(c)).toContainEqual({ t: "seat", seatId: "qL1", sid: 1 });
    expect(events(v).some((e) => e.t === "seat")).toBe(false); // 다른 맵 좌석 소식은 가지 않는다
    clear(a, c, v);
    core.message(a, toVillage(), 2_000);
    expect(events(c)).toEqual([
      { t: "seat", seatId: "qL1", sid: null },
      { t: "leave", sid: 1 },
    ]);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle });
  });
});

describe("only the same map sees each other", () => {
  it("snapshots are split by map (an old village client never sees camp people)", () => {
    const { core, join } = setup();
    const v = join("v"); // 옛 클라이언트 = 늘 마을
    const c1 = join("c1", { camp: true, map: "camp", spawn: { x: 200, y: 700 } });
    const c2 = join("c2", { camp: true, map: "camp", spawn: { x: 260, y: 700 } });
    clear(v, c1, c2);
    core.message(c1, move(205, 700), 0);
    core.message(v, move(SPAWN.x + 3, SPAWN.y), 0);
    core.tick(100);
    expect(snaps(v).flatMap((s) => s.entries.map((e) => e.sid))).toEqual([1]);
    expect(snaps(c2).flatMap((s) => s.entries.map((e) => e.sid))).toEqual([2]);
    expect(snaps(c1).flatMap((s) => s.entries.map((e) => e.sid))).toEqual([2]); // 본인 것도 같은 맵 묶음으로 온다 (예전과 같다)
    // 한 틱에 맵마다 한 번만
    expect(snaps(v)).toHaveLength(1);
    expect(snaps(c2)).toHaveLength(1);
  });

  it("chat, say, act, emo stay in the map; chat history is per map; megaphone reaches everyone", async () => {
    const { core, join } = setup();
    const v = join("v");
    const c1 = join("c1", { camp: true, map: "camp" });
    const c2 = join("c2", { camp: true, map: "camp" });
    clear(v, c1, c2);
    core.message(c1, send({ t: "chat", text: "모닥불 따뜻해" }), 0);
    core.message(c1, send({ t: "say", id: "hi" }), 0);
    core.message(c1, send({ t: "act", kind: "wave" }), 0);
    core.message(c1, send({ t: "emo", id: "heart" }), 0);
    expect(events(v)).toEqual([]);
    expect(events(c2).map((e) => e.t)).toEqual(expect.arrayContaining(["chat", "say", "act"]));

    core.message(v, send({ t: "chat", text: "마을이에요" }), 0);
    expect(events(c2).filter((e) => e.t === "chat")).toHaveLength(1);

    // 늦게 온 캠핑장 사람은 캠핑장 채팅만, 마을 사람은 마을 채팅만
    const c3 = join("c3", { camp: true, map: "camp", now: 10 });
    const log3 = events(c3).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(log3.lines.map((l) => l.text)).toEqual(["모닥불 따뜻해"]);
    const v2 = join("v2", { now: 10 });
    const logV = events(v2).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(logV.lines.map((l) => l.text)).toEqual(["마을이에요"]);
    // 버스로 마을에 가면 마을 기록을 받는다
    clear(c3);
    core.message(c3, toVillage(), 2_000);
    const after = events(c3).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(after.lines.map((l) => l.text)).toEqual(["마을이에요"]);

    clear(v, c1);
    core.message(c1, send({ t: "megaphone", grant: JSON.stringify({ kind: "megaphone", visitorId: "c1", nonce: "m1", name: "c1", text: "다들 안녕", scope: "channel", ch: 1, exp: 9e9 }) }), 3_000);
    await flush();
    expect(events(v).filter((e) => e.t === "megaphone")).toHaveLength(1);
    expect(events(c1).filter((e) => e.t === "megaphone")).toHaveLength(1);
  });

  it("sync peers lists only the same map", () => {
    const { core, join } = setup();
    join("v");
    const c1 = join("c1", { camp: true, map: "camp" });
    join("c2", { camp: true, map: "camp" });
    clear(c1);
    core.message(c1, send({ t: "sync" }), 0);
    const p = events(c1).find((e) => e.t === "peers") as Extract<S2C, { t: "peers" }>;
    expect(p.peers.map((x) => x.sid).sort()).toEqual([3]);
  });
});

describe("seats per map", () => {
  it("camp seats (qL1) work in camp, village fixed spots (boat) are refused there", () => {
    const { core, join } = setup();
    const log = campSeatById("qL1")!;
    const a = join("a", { camp: true, map: "camp", spawn: { x: log.x, y: log.y + 4 } });
    core.message(a, send({ t: "sit", seatId: "qL1" }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: "qL1", state: STATE.sitChair });
    const boat = BOAT_SEATS[0];
    const b = join("b", { camp: true, map: "camp", spawn: { x: boat.x, y: boat.y } });
    core.message(b, send({ t: "sit", seatId: boat.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: boat.id });
    // 마을 벤치 id도 캠핑장에서는 없는 자리
    core.message(b, send({ t: "sit", seatId: "bA-0" }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: "bA-0" });
    // 캠핑장 좌석 id는 마을에서 없는 자리
    const v = join("v", { spawn: { x: log.x, y: log.y + 4 } });
    core.message(v, send({ t: "sit", seatId: "qL1" }), 0);
    expect(events(v)).toContainEqual({ t: "seatDenied", seatId: "qL1" });
  });

  it("A-6 camp fishing spots: one person per spot in camp, unknown in the village", () => {
    const { core, join } = setup();
    const f = CAMP_FISHING_SPOTS[0];
    const a = join("a", { camp: true, map: "camp", spawn: { x: f.x, y: f.y } });
    core.message(a, send({ t: "sit", seatId: f.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: f.id });
    const b = join("b", { camp: true, map: "camp", spawn: { x: f.x, y: f.y + 2 } });
    core.message(b, send({ t: "sit", seatId: f.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: f.id });
    // 마을 맵에서는 없는 자리
    const v = join("v", { spawn: { x: f.x, y: f.y } });
    core.message(v, send({ t: "sit", seatId: f.id }), 0);
    expect(events(v)).toContainEqual({ t: "seatDenied", seatId: f.id });
  });

  it("the same coordinate spot id can be held in both maps at once (wire id stays the same)", () => {
    const { core, join } = setup();
    const spot = spotSeatId("hang", 300, 500);
    const v = join("v", { spawn: { x: 300, y: 504 } });
    const c = join("c", { camp: true, map: "camp", spawn: { x: 300, y: 504 } });
    core.message(v, send({ t: "sit", seatId: spot }), 0);
    core.message(c, send({ t: "sit", seatId: spot }), 0);
    expect(core.peer(1)?.seatId).toBe(spot);
    expect(core.peer(2)?.seatId).toBe(spot);
    expect(events(c)).not.toContainEqual({ t: "seatDenied", seatId: spot });
    // 새로 온 사람의 welcome 좌석표는 자기 맵 것만, 원래 id 그대로
    const c2 = join("c2", { camp: true, map: "camp" });
    expect(welcome(c2).seats).toEqual({ [spot]: 2 });
    const v2 = join("v2");
    expect(welcome(v2).seats).toEqual({ [spot]: 1 });
  });

  it("MOVE bounds follow the map", () => {
    const { core, join } = setup();
    const c = join("c", { camp: true, map: "camp", spawn: { x: 1200, y: 700 } });
    core.message(c, move(1300, 700), 0); // 캠핑장(1280) 밖 — 마을이었다면 받았을 좌표
    core.tick(100);
    expect(core.peer(1)?.x).toBe(1200);
  });
});

describe("reconnect and records", () => {
  it("resumes in camp with m=camp; a stale village record moves to camp on takeOver", () => {
    const { core, join } = setup();
    const c = join("c", { camp: true, map: "camp", spawn: { x: 400, y: 700 } });
    expect(c.att).toMatchObject({ map: "camp", camp: true });
    core.disconnect(c, 1006, 1_000);
    const c2 = join("c", { camp: true, map: "camp", spawn: { x: 410, y: 700 }, now: 2_000, c: { id: "c2", out: [] } });
    expect(welcome(c2)).toMatchObject({ sid: 1, resumed: true, m: "camp" });
    expect(core.peer(1)).toMatchObject({ map: "camp", x: 410 });

    // 마을에 있던 사람이 캠핑장 주소로 다시 붙었다 (다른 탭에서 버스를 탐 등) → 맵을 옮긴 뒤 welcome
    const v = join("v");
    const w = join("w");
    clear(w);
    join("v", { camp: true, map: "camp", spawn: { x: 500, y: 700 }, now: 3_000, c: { id: "v2", out: [] } });
    expect(core.peer(2)).toMatchObject({ map: "camp", x: 500, y: 700 });
    expect(events(w)).toContainEqual({ t: "leave", sid: 2 });
    expect(v.closed?.code).toBeDefined();
  });

  it("hibernation restore keeps the map (attachment), old records without map are village", () => {
    const { core, join } = setup();
    const c = join("c", { camp: true, map: "camp", spawn: { x: 400, y: 700 } });
    const rec = c.att!;
    const { core: fresh } = setup();
    fresh.restore([[c, rec]], [], 0, []);
    expect(fresh.peer(1)).toMatchObject({ map: "camp", camp: true });
    const old: PeerRecord = { ...rec, sid: 2, visitorId: "old" };
    delete old.map;
    delete old.camp;
    fresh.restore([], [], 0, [old], 60_000);
    expect(fresh.peer(2)?.map).toBeUndefined();
    void core;
  });
});

describe("golden goblin is village only", () => {
  it("camp people neither hear about it nor can catch it (even standing on the same coordinates)", () => {
    // 고블린이 캠핑장 범위 안의 좌표에 있는 판을 고른다 (같은 좌표에 선 캠핑장 사람이 거리로는 닿게)
    const T = 20 + MAP_INTERVAL_MS;
    let found: { r: number; x: number; y: number } | null = null;
    for (let k = 1; k < 200 && !found; k++) {
      const r = k / 200;
      const { core } = setup(10, { goblin: true, random: () => r });
      const probe = core;
      probe.join({ id: "p", out: [] }, { visitorId: "p", name: "p", color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood" }, 0);
      const g = probe.forceGoblin(0)!;
      const at = goblinPos(g, T);
      if (at.x > 30 && at.x < 1250 && at.y > 50 && at.y < 780) found = { r, x: Math.round(at.x), y: Math.round(at.y) };
    }
    expect(found).not.toBeNull();
    const { r, x, y } = found!;
    const { core, join } = setup(10, { goblin: true, random: () => r });
    const v = join("v");
    const c = join("c", { camp: true });
    const g = core.forceGoblin(0)!;
    expect(events(v).some((e) => e.t === "goblin")).toBe(true);
    clear(v, c);
    core.message(c, send({ t: "map", m: "camp", x, y }), 20);
    expect(core.peer(2)).toMatchObject({ map: "camp", x, y });
    core.message(c, send({ t: "goblin", id: g.id }), T);
    expect(events(v).some((e) => e.t === "goblinCaught")).toBe(false);
    expect(events(c).some((e) => e.t === "goblin" || e.t === "goblinCaught")).toBe(false);
    // 같은 자리의 마을 사람은 잡는다 (대조군)
    const w = join("w", { spawn: { x, y } });
    core.message(w, send({ t: "goblin", id: g.id }), T);
    expect(events(v).some((e) => e.t === "goblinCaught")).toBe(true);
    expect(events(c).some((e) => e.t === "goblinCaught")).toBe(false);
  });
});

describe("worker side (?m=camp)", () => {
  const SECRET = "test-secret";
  const claims = { visitorId: "V1StGXR8_Z5jdHi6B-myT", name: "캠퍼", color: AVATAR_COLORS[0], channel: 3 };
  it("admit puts map only when the token allows camp", async () => {
    const yes = await admit(SECRET, await signJoinToken(SECRET, { ...claims, camp: true }), 3, { x: 100, y: 700 }, "camp");
    expect(yes).toMatchObject({ camp: true, map: "camp", spawn: { x: 100, y: 700 } });
    const no = await admit(SECRET, await signJoinToken(SECRET, claims), 3, { x: 100, y: 700 }, "camp");
    expect(no?.map).toBeUndefined();
    expect(no?.camp).toBeUndefined();
    expect(no?.spawn).toBeUndefined(); // 캠핑장 좌표로 마을에 서지 않게
    const village = await admit(SECRET, await signJoinToken(SECRET, { ...claims, camp: true }), 3, { x: 100, y: 700 });
    expect(village).toMatchObject({ camp: true });
    expect(village?.map).toBeUndefined();
  });
  it("parseMap / parseSpawn per map", () => {
    expect(parseMap("camp")).toBe("camp");
    expect(parseMap("village")).toBe("village");
    expect(parseMap(null)).toBe("village");
    expect(parseSpawn("1300", "700", false, "village")).toEqual({ x: 1300, y: 700 });
    expect(parseSpawn("1300", "700", false, "camp")).toBeUndefined();
  });
});


describe("channel total count (11/15 HUD — 맵이 달라도 채널 전체)", () => {
  it("welcome.n = 채널 전체, 들어옴·나감마다 count를 모두에게 (맵 상관없이)", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: { x: 300, y: 700 } });
    expect(welcome(a).n).toBe(1);
    const v = join("v");
    expect(welcome(v).n).toBe(2);
    expect(events(a).filter((e) => e.t === "count")).toEqual([{ t: "count", n: 2 }]); // 캠핑장 사람도 마을 입장을 센다
    expect(events(v).some((e) => e.t === "count")).toBe(false); // 방금 들어온 사람은 welcome에 이미 있다
    clear(a, v);
    core.disconnect(v, 1000, 10);
    expect(events(a).filter((e) => e.t === "count")).toEqual([{ t: "count", n: 1 }]);
  });
});

describe("camp BBQ (11/15 바베큐 — 먹으면 잠깐 커진다)", () => {
  const bbq = (visitorId: string, nonce: string, until = 90_000) => send({ t: "bbq", grant: JSON.stringify({ kind: "bbq", visitorId, item: "pork", until, nonce, exp: 999 }) });
  it("검증된 증서만, 같은 맵(보낸 사람 포함)에 알리고 늦게 온 사람도 PeerInfo로 본다. 같은 증서는 한 번만", async () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: { x: 300, y: 600 } });
    const b = join("b", { camp: true, map: "camp", spawn: { x: 320, y: 600 } });
    const v = join("v");
    clear(a, b, v);
    core.message(a, bbq("a", "n1"), 1_000);
    await flush();
    expect(events(a).filter((e) => e.t === "bbq")).toEqual([{ t: "bbq", sid: 1, i: "pork", u: 90_000 }]);
    expect(events(b).filter((e) => e.t === "bbq")).toHaveLength(1);
    expect(events(v).some((e) => e.t === "bbq")).toBe(false); // 마을 사람(옛 클라이언트 포함)은 모른다
    clear(a, b);
    core.message(a, bbq("a", "n1"), 5_000); // 같은 증서 다시
    core.message(b, bbq("a", "n2"), 5_000); // 남의 증서
    await flush();
    expect([...events(a), ...events(b)].some((e) => e.t === "bbq")).toBe(false);
    const c = join("c", { camp: true, map: "camp", spawn: { x: 340, y: 600 } });
    expect(welcome(c).peers.find((p) => p.sid === 1)?.bbq).toEqual({ i: "pork", u: 90_000 });
  });
  it("커지기·빨라지기·취기는 따로 겹친다 (취기는 단계·마신 시각을 싣는다). 맵을 옮겨도 PeerInfo로 따라간다", async () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: { x: 300, y: 600 } });
    const g = (o: object) => send({ t: "bbq", grant: JSON.stringify({ kind: "bbq", visitorId: "a", exp: 999, ...o }) });
    core.message(a, g({ item: "pork", until: 300_000, nonce: "p1" }), 1_000);
    await flush();
    core.message(a, g({ item: "coffee", until: 600_000, nonce: "c1" }), 4_000);
    await flush();
    core.message(a, g({ item: "soju", until: 7_000 + 2 * 600_000, lv: 2, at: 7_000, nonce: "s1" }), 7_000);
    await flush();
    expect(events(a).filter((e) => e.t === "bbq").at(-1)).toEqual({ t: "bbq", sid: 1, i: "soju", u: 7_000 + 2 * 600_000, lv: 2, at: 7_000 });
    const v = join("v");
    core.message(a, toVillage(), 10_000);
    const seen = events(v).filter((e): e is Extract<S2C, { t: "join" }> => e.t === "join").at(-1)!;
    expect(seen).toMatchObject({ bbq: { i: "pork", u: 300_000 }, spd: { i: "coffee", u: 600_000 }, drunk: { lv: 2, at: 7_000 } });
  });
});

describe("커진 채로는 못 탄다 (11/15 바베큐 커지기 × 타는 자리)", () => {
  const DOOR = { x: BUMPER_GATE.x, y: BUMPER_GATE.y - 8 };
  const g = (o: object) => send({ t: "bbq", grant: JSON.stringify({ kind: "bbq", visitorId: "a", exp: 999, ...o }) });
  it("커진 동안 범퍼카 자리는 거절, 효과가 끝나면 탄다. 타고 있다가 커지면 내린다", async () => {
    const { core, join } = setup();
    const a = join("a", { spawn: DOOR });
    core.message(a, g({ item: "wholepork", until: 180_000, nonce: "w1" }), 1_000);
    await flush();
    clear(a);
    core.message(a, send({ t: "sit", seatId: BUMPER_SEATS[0].id }), 2_000);
    expect(events(a)).toContainEqual({ t: "seatDenied", seatId: BUMPER_SEATS[0].id });
    expect(core.peer(1)?.seatId).toBeNull();
    // 효과가 끝난 뒤에는 탄다
    core.message(a, send({ t: "sit", seatId: BUMPER_SEATS[0].id }), 181_000);
    expect(core.peer(1)?.seatId).toBe(BUMPER_SEATS[0].id);
    // 탄 채로 또 커지면 (서버도) 차에서 내린다
    clear(a);
    core.message(a, g({ item: "tomahawk", until: 400_000, nonce: "t1" }), 182_000);
    await flush();
    expect(core.peer(1)?.seatId).toBeNull();
    expect(events(a)).toContainEqual({ t: "seat", seatId: BUMPER_SEATS[0].id, sid: null });
  });
  it("빨라지기·취기는 타기와 상관없다", async () => {
    const { core, join } = setup();
    const a = join("a", { spawn: DOOR });
    core.message(a, g({ item: "zap", until: 200_000, nonce: "z1" }), 1_000);
    await flush();
    core.message(a, send({ t: "sit", seatId: BUMPER_SEATS[1].id }), 2_000);
    expect(core.peer(1)?.seatId).toBe(BUMPER_SEATS[1].id);
  });
});

describe("컨디숑 (11/15 술 깨기)", () => {
  it("내린 단계·시각을 싣고 알린다. 0이 되면 취기가 사라진다", async () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: { x: 300, y: 600 } });
    const g = (o: object) => send({ t: "bbq", grant: JSON.stringify({ kind: "bbq", visitorId: "a", exp: 999, ...o }) });
    core.message(a, g({ item: "beer", until: 1_000 + 600_000, lv: 1, at: 1_000, nonce: "b1" }), 1_000);
    await flush();
    core.message(a, g({ item: "hangover", until: 5_000, lv: 0, at: 5_000, nonce: "h1" }), 5_000);
    await flush();
    expect(events(a).filter((e) => e.t === "bbq").at(-1)).toEqual({ t: "bbq", sid: 1, i: "hangover", u: 5_000, lv: 0, at: 5_000 });
    const c = join("c", { camp: true, map: "camp", spawn: { x: 320, y: 600 } });
    expect(welcome(c).peers.find((p) => p.sid === 1)?.drunk).toBeUndefined();
  });
});
