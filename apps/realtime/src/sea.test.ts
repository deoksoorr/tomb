import { AVATAR_COLORS, CAMP_ARRIVE, DIR, SEA_ARRIVE, SEA_KAYAKS, SEA_KAYAK_SPEED, SEA_JETSKIS, SEA_JETSKI_SPEED, SEA_TUBE_SPEED, SPAWN, STATE, decodeSnapshot, encodeEvent, encodeMove, seaSeatById, SEA_FISHING_SPOTS, SEA_REST_SEATS, signJoinToken, type C2S, type S2C, type StateId } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { admit } from "./auth";
import { ChannelCore, MAP_INTERVAL_MS, type ChannelHost, type JoinTicket } from "./channel";
import { parseMap, parseSpawn } from "./logic";

// 11/16 달물결 포구: 캠핑장처럼 같은 채널 안의 세 번째 맵. 허락(토큰 sea)이 있어야 가고, 위치·몸짓은 같은 맵끼리, 채팅은 채널 전체에 [바닷가] 표시와 함께.

type Conn = { id: string; out: (string | ArrayBuffer)[] };

function setup() {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: () => {},
    persist: () => {},
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async () => null,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000 }, host);
  const join = (id: string, o: { camp?: boolean; sea?: boolean; map?: "camp" | "sea"; spawn?: { x: number; y: number }; now?: number } = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: [], body: "hood", ...(o.camp ? { camp: true as const } : {}), ...(o.sea ? { sea: true as const } : {}), ...(o.map ? { map: o.map } : {}) };
    core.join(c, t, o.now ?? 0);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const snaps = (c: Conn) => c.out.filter((d): d is ArrayBuffer => typeof d !== "string").map((d) => decodeSnapshot(d)!);
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const mapped = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "mapped" }> => e.t === "mapped");
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (m: C2S) => encodeEvent(m);
const move = (x: number, y: number, state: StateId = STATE.walk) => encodeMove({ x, y, state, dir: DIR.down, seq: 0 });
const toSea = (x: number = SEA_ARRIVE.x, y: number = SEA_ARRIVE.y) => send({ t: "map", m: "sea", x, y });

describe("sea map (11/16 달물결 포구)", () => {
  it("bus to the sea: leave to the village, join to the sea, mapped with the sea's people", () => {
    const { core, join } = setup();
    const a = join("a", { sea: true });
    const v = join("v");
    const s = join("s", { sea: true, map: "sea", spawn: { x: 600, y: 700 } });
    expect(welcome(s)).toMatchObject({ m: "sea", peers: [] });
    expect(welcome(v).peers.map((p) => p.sid)).toEqual([1]);
    clear(a, v, s);
    core.message(a, toSea(), 1_000);
    expect(events(v)).toEqual([{ t: "leave", sid: 1 }]);
    expect(events(s)).toEqual([expect.objectContaining({ t: "join", sid: 1, x: SEA_ARRIVE.x, y: SEA_ARRIVE.y })]);
    expect(mapped(a)).toEqual([{ t: "mapped", m: "sea", peers: [expect.objectContaining({ sid: 3, x: 600, y: 700 })], seats: {} }]);
    expect(core.roster().find((r) => r.sid === 1)).toMatchObject({ map: "sea" });
    expect(core.count).toBe(3);
    clear(a, v, s);
    core.message(a, send({ t: "map", m: "village", x: SPAWN.x, y: SPAWN.y }), 1_000 + MAP_INTERVAL_MS);
    expect(events(s)).toEqual([{ t: "leave", sid: 1 }]);
    expect(mapped(a)[0]).toMatchObject({ m: "village" });
    expect(core.peer(1)?.map).toBeUndefined();
  });

  it("needs the sea permission (camp permission alone is not enough)", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true });
    core.message(a, toSea(), 0);
    expect(mapped(a)[0].m).toBe("village");
    const b = join("b", { camp: true, map: "sea", spawn: { x: 100, y: 200 } });
    expect(welcome(b).m).toBeUndefined();
    // 바닷가 허락만 있으면 캠핑장은 못 간다
    const c = join("c", { sea: true });
    core.message(c, send({ t: "map", m: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y }), 0);
    expect(mapped(c)[0].m).toBe("village");
  });

  it("three maps get their own snapshots", () => {
    const { core, join } = setup();
    const v = join("v");
    const c = join("c", { camp: true, map: "camp", spawn: { x: 200, y: 700 } });
    const s1 = join("s1", { sea: true, map: "sea", spawn: { x: 400, y: 600 } });
    const s2 = join("s2", { sea: true, map: "sea", spawn: { x: 440, y: 600 } });
    clear(v, c, s1, s2);
    core.message(s1, move(405, 600), 0);
    core.message(c, move(205, 700), 0);
    core.message(v, move(SPAWN.x + 3, SPAWN.y), 0);
    core.tick(100);
    expect(snaps(v).flatMap((x) => x.entries.map((e) => e.sid))).toEqual([1]);
    expect(snaps(c).flatMap((x) => x.entries.map((e) => e.sid))).toEqual([2]);
    expect(snaps(s2).flatMap((x) => x.entries.map((e) => e.sid))).toEqual([3]);
  });

  it("chat reaches the whole channel tagged with the sea; acts stay on the sea", () => {
    const { core, join } = setup();
    const v = join("v");
    const c = join("c", { camp: true, map: "camp" });
    const s1 = join("s1", { sea: true, map: "sea" });
    const s2 = join("s2", { sea: true, map: "sea" });
    clear(v, c, s1, s2);
    core.message(s1, send({ t: "chat", text: "파도 소리 좋아요" }), 0);
    core.message(s1, send({ t: "act", kind: "wave" }), 0);
    expect(events(v)).toEqual([expect.objectContaining({ t: "chat", text: "파도 소리 좋아요", name: "s1", m: "sea" })]);
    expect(events(c).map((e) => e.t)).toEqual(["chat"]);
    expect(events(s2).map((e) => e.t)).toEqual(expect.arrayContaining(["chat", "act"]));
    const late = join("late", { now: 10 });
    const log = events(late).find((e) => e.t === "chatLog") as Extract<S2C, { t: "chatLog" }>;
    expect(log.lines[0]).toMatchObject({ text: "파도 소리 좋아요", m: "sea" });
  });

  it("sea seats are their own (the bus stop bench) and only the sea hears about them", () => {
    const { core, join } = setup();
    const bench = seaSeatById("pB-0")!;
    const a = join("a", { sea: true, map: "sea", spawn: { x: bench.x, y: bench.y + 6 } });
    const b = join("b", { sea: true, map: "sea" });
    const v = join("v");
    core.message(a, send({ t: "sit", seatId: "pB-0" }), 0);
    expect(events(b)).toContainEqual({ t: "seat", seatId: "pB-0", sid: 1 });
    expect(events(v).some((e) => e.t === "seat")).toBe(false);
    // 마을 사람은 바닷가 좌석 id를 마을 자리로 앉을 수 없다
    clear(v);
    core.message(v, send({ t: "sit", seatId: "pB-0" }), 0);
    expect(events(v)).toContainEqual({ t: "seatDenied", seatId: "pB-0" });
  });

  it("11/16 rock fishing spots: one person per spot at the sea, unknown in the village", () => {
    const { core, join } = setup();
    const f = SEA_FISHING_SPOTS[0];
    const a = join("a", { sea: true, map: "sea", spawn: { x: f.x, y: f.y } });
    core.message(a, send({ t: "sit", seatId: f.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: f.id });
    const b = join("b", { sea: true, map: "sea", spawn: { x: f.x, y: f.y + 2 } });
    core.message(b, send({ t: "sit", seatId: f.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: f.id });
    const v = join("v", { spawn: { x: f.x, y: f.y } });
    core.message(v, send({ t: "sit", seatId: f.id }), 0);
    expect(events(v)).toContainEqual({ t: "seatDenied", seatId: f.id });
  });

  it("11/16 rest seats: lounger keeps the lying state, mats keep sitting on the ground, moving releases", () => {
    const { core, join } = setup();
    const l = SEA_REST_SEATS.find((r) => r.kind === "lounger")!;
    const a = join("a", { sea: true, map: "sea", spawn: { x: l.x, y: l.y + 4 } });
    core.message(a, send({ t: "sit", seatId: l.id }), 0);
    expect(core.peer(1)).toMatchObject({ seatId: l.id, state: STATE.lie });
    core.message(a, move(l.x, l.y, STATE.lie), 50);
    expect(core.peer(1)).toMatchObject({ seatId: l.id, state: STATE.lie });
    core.message(a, move(l.x, l.y + 12, STATE.walk), 300);
    expect(core.peer(1)?.seatId ?? null).toBeNull();
    // 11/16 돗자리를 뺐어요 → 두 번째 사람은 다른 선베드에
    const m = SEA_REST_SEATS.filter((r) => r.kind === "lounger")[1];
    const b = join("b", { sea: true, map: "sea", spawn: { x: m.x, y: m.y + 4 } });
    core.message(b, send({ t: "sit", seatId: m.id }), 0);
    expect(core.peer(2)).toMatchObject({ seatId: m.id, state: STATE.lie });
    core.message(b, move(m.x, m.y, STATE.lie), 50);
    expect(core.peer(2)?.seatId).toBe(m.id);
    // 마을 사람은 바닷가 쉴거리 자리에 앉을 수 없어요
    const v = join("v", { spawn: { x: m.x, y: m.y } });
    core.message(v, send({ t: "sit", seatId: m.id }), 0);
    expect(events(v)).toContainEqual({ t: "seatDenied", seatId: m.id });
  });

  it("11/16 a fresh player who rode the bus can sit on every new seaside seat kind, and the others at the sea see it", () => {
    const { core, join } = setup();
    // 바닷가에 먼저 와 있는 사람 (보는 사람)
    const w = join("w", { sea: true, map: "sea" });
    // 마을에서 버스로 온 사람
    const a = join("a", { sea: true });
    core.message(a, toSea(), 0);
    const kinds = [
      { id: "pS1-0", state: STATE.sitChair },
      // r12 끝 걸터앉기는 끝마다 셋 · 피크닉 탁자 · 모닥불 통나무 · 정원 벤치
      { id: "pE1-2", state: STATE.sitChair },
      { id: "pE2-0", state: STATE.sitChair },
      { id: "pT1s-0", state: STATE.sitChair },
      { id: "pF3", state: STATE.sitChair },
      { id: "pG2-1", state: STATE.sitChair },
      ...SEA_REST_SEATS.filter((r, i, all) => all.findIndex((q) => q.kind === r.kind) === i).map((r) => ({ id: r.id, state: r.state })),
    ];
    let t = 1000;
    for (const k of kinds) {
      const slot = seaSeatById(k.id) ?? SEA_REST_SEATS.find((r) => r.id === k.id)!;
      clear(a, w);
      // 걸어서 자리 앞으로 (서버 속도 예산 안에서 — 순간이동 대신 위치를 알려요)
      core.message(a, send({ t: "warp", x: slot.x, y: slot.y + 8 }), t);
      core.message(a, move(slot.x, slot.y + 8, STATE.idle), t + 50);
      core.message(a, send({ t: "sit", seatId: k.id }), t + 100);
      expect(events(a), k.id).not.toContainEqual({ t: "seatDenied", seatId: k.id });
      expect(core.peer(2), k.id).toMatchObject({ seatId: k.id, state: k.state });
      expect(events(w), k.id).toContainEqual({ t: "seat", seatId: k.id, sid: 2 });
      // 일어나기 (다음 자리로)
      core.message(a, move(slot.x, slot.y + 10, STATE.idle), t + 400);
      expect(core.peer(2)?.seatId ?? null, k.id).toBeNull();
      t += 2000;
    }
  });

  // 11/16 r13 튜브·제트스키: 조각배처럼 앉은 채 움직이는 자리 (상태 boat). 튜브는 바다 어디서든 올라타고 서버 자리를 앵커로 끌어가지 않아요
  it("11/16 r13 a swimmer boards a drifting tube far from its anchor, paddles, and the others follow; one rider per tube", () => {
    const { core, join } = setup();
    const w = join("w", { sea: true, map: "sea", spawn: { x: 900, y: 860 } });
    const a = join("a", { sea: true, map: "sea", spawn: { x: 900, y: 860 } });
    const b = join("b", { sea: true, map: "sea", spawn: { x: 905, y: 860 } });
    clear(w, a, b);
    // 튜브 pU2 앵커는 (840, 704) — 150px 넘게 떨어진 곳에서 타요
    core.message(a, send({ t: "sit", seatId: "pU2" }), 1000);
    expect(events(a)).not.toContainEqual({ t: "seatDenied", seatId: "pU2" });
    expect(core.peer(2)).toMatchObject({ seatId: "pU2", state: STATE.boat, x: 900, y: 860 });
    expect(events(w)).toContainEqual({ t: "seat", seatId: "pU2", sid: 2 });
    // 다른 사람은 같은 튜브에 못 타요
    core.message(b, send({ t: "sit", seatId: "pU2" }), 1100);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: "pU2" });
    // 노 젓기 (튜브 속도로 1초) → 서버가 따라가고 자리는 그대로
    core.message(a, move(900 + SEA_TUBE_SPEED, 860, STATE.boat), 2100);
    expect(core.peer(2)).toMatchObject({ seatId: "pU2", x: 900 + SEA_TUBE_SPEED });
    // 내리면 (헤엄 MOVE) 자리를 놓아요
    core.message(a, move(924, 860, STATE.swim), 2400);
    expect(core.peer(2)?.seatId ?? null).toBeNull();
  });

  it("11/16 r13 a jet ski is boarded only at its mooring and its speed (2x rowboat) passes the server speed check", () => {
    const { core, join } = setup();
    const j = SEA_JETSKIS[0];
    const far = join("f", { sea: true, map: "sea", spawn: { x: 300, y: 860 } });
    core.message(far, send({ t: "sit", seatId: "pJ1" }), 1000);
    expect(events(far)).toContainEqual({ t: "seatDenied", seatId: "pJ1" });
    const a = join("a", { sea: true, map: "sea", spawn: { x: j.x, y: j.y - 24 } });
    core.message(a, send({ t: "sit", seatId: "pJ1" }), 1000);
    expect(core.peer(2)).toMatchObject({ seatId: "pJ1", state: STATE.boat, x: j.x, y: j.y });
    // 2초 동안 오른쪽 아래로 전속력 (100ms마다 보고)
    let x = j.x;
    let y = j.y;
    for (let t = 1100; t <= 3000; t += 100) {
      x += SEA_JETSKI_SPEED * 0.07;
      y += SEA_JETSKI_SPEED * 0.07;
      core.message(a, move(Math.round(x), Math.round(y), STATE.boat), t);
    }
    expect(core.peer(2)).toMatchObject({ seatId: "pJ1", x: Math.round(x), y: Math.round(y) });
  });

  // 11/16 r18 2인승 카약: 노 젓는 사람(뒤 자리) + 같이 탄 사람(앞 자리). 같이 타기는 노 젓는 사람 곁이면 바다 위에서도
  it("11/16 r18 two riders share a kayak: driver at the dock, a passenger joins beside the driver out at sea, both move at kayak speed", () => {
    const { core, join } = setup();
    const k = SEA_KAYAKS[0];
    const w = join("w", { sea: true, map: "sea", spawn: { x: k.x, y: k.y - 30 } });
    const a = join("a", { sea: true, map: "sea", spawn: { x: k.x, y: k.y - 26 } });
    core.message(a, send({ t: "sit", seatId: "pK1-0" }), 1000);
    expect(core.peer(2)).toMatchObject({ seatId: "pK1-0", state: STATE.boat });
    // 노 저어 바다로 2초 (카약 속도)
    let x = k.x;
    let y = k.y;
    for (let t = 1100; t <= 3000; t += 100) {
      y += SEA_KAYAK_SPEED * 0.1;
      core.message(a, move(Math.round(x), Math.round(y), STATE.boat), t);
    }
    expect(core.peer(2)).toMatchObject({ seatId: "pK1-0", y: Math.round(y) });
    // 헤엄쳐 온 사람이 곁에서 앞 자리에 같이 타요 (매어 둔 자리에서 멀어도)
    const b = join("b", { sea: true, map: "sea", spawn: { x: Math.round(x), y: Math.round(y) + 10 } });
    core.message(b, send({ t: "sit", seatId: "pK1-1" }), 3100);
    expect(events(b)).not.toContainEqual({ t: "seatDenied", seatId: "pK1-1" });
    expect(core.peer(3)).toMatchObject({ seatId: "pK1-1", state: STATE.boat });
    expect(events(w)).toContainEqual({ t: "seat", seatId: "pK1-1", sid: 3 });
    // 같은 카약 두 자리는 한 사람씩
    const c = join("c", { sea: true, map: "sea", spawn: { x: Math.round(x), y: Math.round(y) + 12 } });
    core.message(c, send({ t: "sit", seatId: "pK1-1" }), 3200);
    expect(events(c)).toContainEqual({ t: "seatDenied", seatId: "pK1-1" });
  });

  it("?m=sea goes to the sea only with the sea claim", async () => {
    expect(parseMap("sea")).toBe("sea");
    expect(parseMap("ocean")).toBe("village");
    // 11/16 r12 바닷가 맵 높이 960 (걷는 범위 y 60 ~ 946 — 맨 아래는 먼바다)
    expect(parseSpawn("1200", "930", false, "sea")).toEqual({ x: 1200, y: 930 });
    expect(parseSpawn("1200", "990", false, "sea")).toBeUndefined();
    const exp = Math.floor(Date.now() / 1000) + 60;
    const base = { visitorId: "v_1234567890abcdef", name: "바다", color: AVATAR_COLORS[0], channel: 1, exp, look: [], body: "hood" };
    const withSea = await signJoinToken("secret", { ...base, sea: true });
    const without = await signJoinToken("secret", { ...base, camp: true });
    expect(await admit("secret", withSea, 1, { x: 300, y: 600 }, "sea")).toMatchObject({ map: "sea", sea: true, spawn: { x: 300, y: 600 } });
    const t = await admit("secret", without, 1, { x: 300, y: 600 }, "sea");
    expect(t?.map).toBeUndefined();
    expect(t?.spawn).toBeUndefined();
  });

  // 11/16 r18 카약 「같이 타요」: 앞자리에 앉아 뒷자리가 빈 사람만 채널에 외쳐요. 뒷자리가 차면 끝, 아니면 환불 증서
  it("11/16 r18 kayak shout: broadcast only from a kayak front seat with an empty back seat, ends when the back seat fills, refund otherwise", async () => {
    const host: ChannelHost<Conn> = {
      send: (c, d) => void c.out.push(d),
      close: () => {},
      persist: () => {},
      saveReservation: () => {},
      dropReservation: () => {},
      requestTick: () => {},
      countChanged: () => {},
      lastPing: () => 0,
      visitorJoined: () => {},
      visitorLeft: () => {},
      verifyGrant: async (g) => JSON.parse(g),
      signGrant: async (g) => JSON.stringify(g),
      claimNonce: (() => {
        const seen = new Set<string>();
        return (k: string) => (seen.has(k) ? false : (seen.add(k), true));
      })(),
    };
    const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000 }, host);
    const join = (id: string, o: { sea?: boolean; map?: "sea"; spawn?: { x: number; y: number } } = {}) => {
      const c: Conn = { id, out: [] };
      core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: [], body: "hood", ...(o.sea ? { sea: true as const } : {}), ...(o.map ? { map: o.map } : {}) }, 0);
      return c;
    };
    const k = SEA_KAYAKS[0];
    const village = join("v");
    const a = join("a", { sea: true, map: "sea", spawn: { x: k.x, y: k.y - 26 } });
    const shout = (nonce: string, visitorId = "a") => send({ t: "kayakShout", grant: JSON.stringify({ kind: "kayakShout", visitorId, nonce, name: "가람", kayak: "pK1", ch: 1, exp: 9e12 }) });
    const tick = () => new Promise((r) => setTimeout(r, 0));
    // 앉지 않고 외치면 → 환불 증서
    core.message(a, shout("n1"), 1000);
    await tick();
    await tick();
    const denied = events(a).find((e) => e.t === "kayakShoutDenied") as Extract<S2C, { t: "kayakShoutDenied" }> | undefined;
    expect(denied?.id).toBe("n1");
    expect(JSON.parse(denied!.refund)).toMatchObject({ kind: "kayakRefund", visitorId: "a", nonce: "n1" });
    // 앞자리에 앉아 외치면 → 마을에 있는 사람까지 채널 모두가 받아요
    core.message(a, send({ t: "sit", seatId: "pK1-0" }), 5000);
    clear(a, village);
    core.message(a, shout("n2"), 9000);
    await tick();
    await tick();
    expect(events(village)).toContainEqual(expect.objectContaining({ t: "kayakShout", id: "n2", kayak: "pK1", name: "가람" }));
    // 뒷자리가 차면 → 끝 (자리 찼어요)
    const b = join("b", { sea: true, map: "sea", spawn: { x: k.x, y: k.y - 20 } });
    clear(village);
    core.message(b, send({ t: "sit", seatId: "pK1-1" }), 9500);
    expect(events(village)).toContainEqual({ t: "kayakShoutEnd", id: "n2", why: "full" });
  });
});
