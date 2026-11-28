import {
  AVATAR_COLORS,
  BOAT_SEATS,
  BUMPER_GATE,
  BUMPER_SEATS,
  CAMP_ARRIVE,
  CAMP_FISHING_SPOTS,
  CAMP_SLIDE,
  CAMP_SLIDE_SEAT,
  CAMP_TRAMP_AREA,
  CAMP_TRAMP_GATE,
  CAMP_TRAMP_IN,
  CAMP_TRAMPOLINE,
  campTrampSeatId,
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
  CAMP_HAMMOCKS,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { admit } from "./auth";
import { ChannelCore, GOBLIN_AFTER_TELEPORT_MS, MAP_INTERVAL_MS, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";
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
  const join = (id: string, o: { camp?: boolean; map?: "camp"; spawn?: { x: number; y: number }; now?: number; c?: Conn; look?: string[] } = {}) => {
    const c = o.c ?? { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: o.look ?? [], body: "hood", ...(o.camp ? { camp: true as const } : {}), ...(o.map ? { map: o.map, known: o.map } : {}) };
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

  it("11/20 채팅에 쓴 사람의 닉네임 꾸미기를 실어 다른 맵·늦게 온 사람도 꾸민 이름을 본다", () => {
    const { core, join } = setup();
    const v = join("v");
    const c1 = join("c1", { camp: true, map: "camp", look: ["nc_sakura", "hat_beret"] });
    clear(v, c1);
    core.message(c1, send({ t: "chat", text: "캠핑장에서 안녕" }), 0);
    core.message(v, send({ t: "chat", text: "꾸미기 없음" }), 0);
    const got = events(v).filter((e) => e.t === "chat") as Extract<S2C, { t: "chat" }>[];
    expect(got[0]).toMatchObject({ name: "c1", m: "camp", ns: ["nc_sakura"] });
    const late = join("late", { now: 10 });
    const log = events(late).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(log.lines.map((l) => l.ns)).toEqual([["nc_sakura"], undefined]);
  });

  it("say, act, emo stay in the map; 11/16 chat (and its history) reaches the whole channel with the speaker's map; megaphone reaches everyone", async () => {
    const { core, join } = setup();
    const v = join("v");
    const c1 = join("c1", { camp: true, map: "camp" });
    const c2 = join("c2", { camp: true, map: "camp" });
    clear(v, c1, c2);
    core.message(c1, send({ t: "chat", text: "모닥불 따뜻해" }), 0);
    core.message(c1, send({ t: "say", id: "hi" }), 0);
    core.message(c1, send({ t: "act", kind: "wave" }), 0);
    core.message(c1, send({ t: "emo", id: "heart" }), 0);
    // 말풍선 채팅만 마을에도 간다 (캠핑장 표시·이름과 함께). 인사·몸짓·이모티콘은 그 맵 안에서만
    expect(events(v).map((e) => e.t)).toEqual(["chat"]);
    expect(events(v)[0]).toMatchObject({ t: "chat", text: "모닥불 따뜻해", name: "c1", m: "camp" });
    expect(events(c2).map((e) => e.t)).toEqual(expect.arrayContaining(["chat", "say", "act"]));

    core.message(v, send({ t: "chat", text: "마을이에요" }), 0);
    const fromVillage = events(c2).filter((e) => e.t === "chat");
    expect(fromVillage).toHaveLength(2);
    expect(fromVillage[1]).toMatchObject({ text: "마을이에요", name: "v" });
    expect(fromVillage[1]).not.toHaveProperty("m");

    // 늦게 온 사람은 어느 맵이든 채널 기록 전체 (줄마다 맵 표시)
    const c3 = join("c3", { camp: true, map: "camp", now: 10 });
    const log3 = events(c3).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(log3.lines.map((l) => [l.text, l.m ?? "village"])).toEqual([
      ["모닥불 따뜻해", "camp"],
      ["마을이에요", "village"],
    ]);
    const v2 = join("v2", { now: 10 });
    const logV = events(v2).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(logV.lines.map((l) => l.text)).toEqual(["모닥불 따뜻해", "마을이에요"]);

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

  it("11/26 camp hammocks (qM1~4): one person lies (state hammock), the next is refused, village has none", () => {
    const { core, join } = setup();
    const h = CAMP_HAMMOCKS[0];
    const a = join("a", { camp: true, map: "camp", spawn: { x: h.x, y: h.y + 4 } });
    core.message(a, send({ t: "sit", seatId: h.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: h.id, state: STATE.hammock });
    const b = join("b", { camp: true, map: "camp", spawn: { x: h.x, y: h.y + 6 } });
    core.message(b, send({ t: "sit", seatId: h.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: h.id });
    const v = join("v", { spawn: { x: h.x, y: h.y + 4 } });
    core.message(v, send({ t: "sit", seatId: h.id }), 0);
    expect(events(v)).toContainEqual({ t: "seatDenied", seatId: h.id });
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

  it("11/26 놀이터 트램펄린: 사다리(입구) 앞에서만 타고, 매트 안을 다니며(MOVE 따라감), 매트 밖으로는 못 나가고, 내려서면 자리를 놓는다", () => {
    const { core, join } = setup();
    const id = campTrampSeatId(0);
    const G = CAMP_TRAMP_GATE;
    const A = CAMP_TRAMP_AREA;
    // 사다리 밖 E 자리에서 탄다 → 서버 위치는 탄 자리 그대로(움직이는 자리), 매트 안 첫 자리로 MOVE
    const a = join("a", { camp: true, map: "camp", spawn: { x: G.x, y: G.y } });
    core.message(a, send({ t: "sit", seatId: id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: id, state: STATE.trampoline });
    core.message(a, move(CAMP_TRAMP_IN.x, CAMP_TRAMP_IN.y, STATE.trampoline), 300);
    core.tick(400);
    // 매트 안을 다닌다 (서버가 따라간다)
    core.message(a, move(A.x - 20, A.y, STATE.trampoline), 1000);
    core.tick(1100);
    expect(core.peer(1)).toMatchObject({ seatId: id, x: A.x - 20, y: A.y, state: STATE.trampoline });
    // 매트 밖으로 보낸 위치는 매트 안으로 당긴다
    core.message(a, move(A.x - 80, A.y, STATE.trampoline), 1600);
    core.tick(2000);
    expect(core.peer(1)?.seatId).toBe(id);
    expect(core.peer(1)!.x).toBeGreaterThanOrEqual(A.x - A.rx - 0.01);
    // 매트 옆(사다리가 아닌 곳)에서는 못 탄다
    const b = join("b", { camp: true, map: "camp", spawn: { x: CAMP_TRAMPOLINE.x - CAMP_TRAMPOLINE.rx - 8, y: CAMP_TRAMPOLINE.y - 20 } });
    core.message(b, send({ t: "sit", seatId: campTrampSeatId(1) }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: campTrampSeatId(1) });
    // 같은 자리는 한 명, 다른 자리는 사다리 앞에서 탄다
    const c = join("c", { camp: true, map: "camp", spawn: { x: G.x, y: G.y } });
    core.message(c, send({ t: "sit", seatId: id }), 0);
    expect(events(c)).toContainEqual({ t: "seatDenied", seatId: id });
    core.message(c, send({ t: "sit", seatId: campTrampSeatId(2) }), 0);
    expect(core.peer(3)).toMatchObject({ seatId: campTrampSeatId(2), state: STATE.trampoline });
    // 아무 좌표 트램펄린 자리(j_x_y)는 캠핑장에 없다
    const d = join("d", { camp: true, map: "camp", spawn: { x: 300, y: 500 } });
    core.message(d, send({ t: "sit", seatId: spotSeatId("trampoline", 300, 500) }), 0);
    expect(events(d)).toContainEqual({ t: "seatDenied", seatId: spotSeatId("trampoline", 300, 500) });
    core.message(d, move(300, 500, STATE.trampoline), 50);
    core.tick(100);
    expect(core.peer(4)).toMatchObject({ seatId: null, state: STATE.idle });
    // 사다리 앞으로 내려서면 (서 있는 MOVE) 자리를 놓는다
    core.message(a, move(G.x, G.y + 2, STATE.idle), 3000);
    expect(core.peer(1)?.seatId).toBeNull();
  });

  it("11/26 워터 슬라이드(qZ): 사다리 밑에서 타고, 타는 동안 위치가 따라가며(움직이는 자리), 내리면 놓는다", () => {
    const { core, join } = setup();
    const Z = CAMP_SLIDE_SEAT;
    const a = join("a", { camp: true, map: "camp", spawn: { x: Z.x, y: Z.y + 4 } });
    core.message(a, send({ t: "sit", seatId: Z.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: Z.id, state: STATE.boat });
    // 사다리를 오른다 (위치가 서버에도 따라간다 — 앵커에 묶지 않는다)
    core.message(a, move(Z.x, Z.y - 40, STATE.boat), 700);
    core.tick(800);
    expect(core.peer(1)).toMatchObject({ seatId: Z.id, x: Z.x, y: Z.y - 40 });
    // 다른 사람은 그동안 못 탄다
    const b = join("b", { camp: true, map: "camp", spawn: { x: Z.x, y: Z.y + 4 } });
    core.message(b, send({ t: "sit", seatId: Z.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: Z.id });
    // 풀가에 내려서면 (서 있는 MOVE) 자리를 놓고, 다음 사람이 탄다
    core.message(a, move(CAMP_SLIDE.pool.x, CAMP_SLIDE.pool.y + 19, STATE.idle), 2000);
    expect(core.peer(1)?.seatId).toBeNull();
    core.message(b, send({ t: "sit", seatId: Z.id }), 2100);
    expect(core.peer(2)?.seatId).toBe(Z.id);
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
  it("resumes in camp with m=camp; a village record stays in the village on takeOver even with m=camp (11/27)", () => {
    const { core, join } = setup();
    const c = join("c", { camp: true, map: "camp", spawn: { x: 400, y: 700 } });
    expect(c.att).toMatchObject({ map: "camp", camp: true });
    core.disconnect(c, 1006, 1_000);
    const c2 = join("c", { camp: true, map: "camp", spawn: { x: 410, y: 700 }, now: 2_000, c: { id: "c2", out: [] } });
    expect(welcome(c2)).toMatchObject({ sid: 1, resumed: true, m: "camp" });
    expect(core.peer(1)).toMatchObject({ map: "camp", x: 410 });

    // 11/27 마을에 있던 사람이 캠핑장 주소로 다시 붙었다 (다른 탭 등): 맵은 서버가 아는 마을 그대로 (mapKeep.test.ts)
    const v = join("v");
    const w = join("w");
    clear(w);
    join("v", { camp: true, map: "camp", spawn: { x: 500, y: 700 }, now: 3_000, c: { id: "v2", out: [] } });
    expect(core.peer(2)?.map).toBeUndefined();
    expect(events(w)).not.toContainEqual({ t: "leave", sid: 2 });
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

describe("golden goblin on another map (11/26 맵 무작위)", () => {
  it("camp people hear a village goblin but cannot catch it (even standing on the same coordinates); hear who caught it", () => {
    // 마을 고블린이 캠핑장 범위 안의 좌표에 있는 판을 고른다 (같은 좌표에 선 캠핑장 사람이 거리로는 닿게)
    const T = 20 + MAP_INTERVAL_MS;
    let found: { r: number; x: number; y: number } | null = null;
    for (let k = 1; k < 100 && !found; k++) {
      const r = k / 200; // 0.5 아래 = 마을
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
    expect(g.m).toBeUndefined();
    expect(events(v).some((e) => e.t === "goblin")).toBe(true);
    clear(v, c);
    core.message(c, send({ t: "map", m: "camp", x, y }), 20);
    expect(core.peer(2)).toMatchObject({ map: "camp", x, y });
    core.message(c, send({ t: "goblin", id: g.id }), T);
    expect(events(v).some((e) => e.t === "goblinCaught")).toBe(false);
    expect(events(c).some((e) => e.t === "goblinCaught")).toBe(false);
    // 같은 자리의 마을 사람은 잡는다 (대조군). 11/18 입장 스폰도 순간이동이라 그 2초 뒤에 잡는다
    const w = join("w", { spawn: { x, y }, now: T - GOBLIN_AFTER_TELEPORT_MS });
    core.message(w, send({ t: "goblin", id: g.id }), T);
    expect(events(v).some((e) => e.t === "goblinCaught")).toBe(true);
    // 11/19 "누가 잡았다"는 채널 모두에게 (캠핑장 사람도 띠·채팅 알림으로 본다) — 한 번만, 서버가 아는 이름으로
    const heard = events(c).filter((e) => e.t === "goblinCaught");
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ id: g.id, name: "w" });
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

describe("11/26 촌캉스 아궁이 불 (use ag{터} — 마당 근처·1초에 한 번·늦게 온 사람도 본다)", () => {
  // 싸리울집(16번 터)은 x 172..322, y 36..196 — 마당 안(대문 근처)에서 켠다
  const YARD16 = { x: 240, y: 180 };
  const fires = (c: Conn) => events(c).filter((e) => e.t === "use");

  it("캠핑장에서 그 촌캉스 마당 근처에 있는 사람만, 같은 캠핑장 사람에게만 (값은 0·1로)", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: YARD16 });
    const b = join("b", { camp: true, map: "camp", spawn: { x: 320, y: 600 } });
    const v = join("v"); // 마을
    clear(a, b, v);
    core.message(a, send({ t: "use", u: "ag16", a: 7 }), 0);
    expect(fires(b)).toEqual([{ t: "use", sid: 1, u: "ag16", a: 1 }]);
    expect(fires(a)).toEqual([]);
    expect(fires(v)).toEqual([]);
    // 멀리(캠핑장 아래쪽)에서 보낸 것·카라반 터(ag1)·다른 촌캉스 터(15번, 마당 밖)는 버린다
    clear(b);
    core.message(b, send({ t: "use", u: "ag16", a: 0 }), 5_000);
    core.message(a, send({ t: "use", u: "ag1", a: 1 }), 5_000);
    core.message(a, send({ t: "use", u: "ag15", a: 1 }), 6_000);
    expect(fires(a)).toEqual([]);
    expect(fires(b)).toEqual([]);
  });

  it("마을에서 보낸 아궁이 알림은 버린다 (캠핑장에 없는 사람)", () => {
    const { core, join } = setup();
    const v = join("v", { spawn: YARD16 });
    const w = join("w");
    clear(v, w);
    core.message(v, send({ t: "use", u: "ag16", a: 1 }), 0);
    expect(fires(w)).toEqual([]);
  });

  it("사람마다 1초에 한 번 (깜빡이기 도배 방지)", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: YARD16 });
    const b = join("b", { camp: true, map: "camp", spawn: { x: 320, y: 600 } });
    clear(a, b);
    core.message(a, send({ t: "use", u: "ag16", a: 1 }), 0);
    core.message(a, send({ t: "use", u: "ag16", a: 0 }), 100);
    core.message(a, send({ t: "use", u: "ag16", a: 1 }), 900);
    core.message(a, send({ t: "use", u: "ag16", a: 0 }), 1_000);
    expect(fires(b).map((e) => (e as { a: number }).a)).toEqual([1, 0]);
  });

  it("늦게 온 사람: 캠핑장에 들어오면(처음 입장·버스) 기억한 불 상태를 받고, 15분이 지난 상태는 받지 않는다", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, map: "camp", spawn: YARD16 });
    core.message(a, send({ t: "use", u: "ag16", a: 0 }), 1_000);
    const late = join("late", { camp: true, map: "camp", spawn: { x: 320, y: 600 }, now: 2_000 });
    expect(fires(late)).toEqual([{ t: "use", sid: 0, u: "ag16", a: 0 }]);
    // 마을에서 버스로 넘어와도
    const bus = join("bus", { camp: true, now: 3_000 });
    clear(bus);
    core.message(bus, toCamp(), 3_000);
    expect(fires(bus)).toEqual([{ t: "use", sid: 0, u: "ag16", a: 0 }]);
    // 마을 사람은 받지 않는다
    const vil = join("vil", { now: 3_000 });
    expect(fires(vil)).toEqual([]);
    const old = join("old", { camp: true, map: "camp", spawn: { x: 320, y: 600 }, now: 1_000 + 15 * 60_000 + 1 });
    expect(fires(old)).toEqual([]);
  });
});
