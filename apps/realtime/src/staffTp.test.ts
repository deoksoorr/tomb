import { AVATAR_COLORS, SPAWN, STAFF_TP_GAP_MS, STAFF_TP_NEAR_PX, encodeEvent, parseC2S, verifyInternal, signInternal, type C2S, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";
import { personOf } from "./people";

// 11/20 운영자 순간이동: tp는 운영자 연결만, 상대가 실내면 거절, 다른 맵이면 맵도 옮기고 mapped, 떠난·도착한 자리에 tpFx

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };

function setup() {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: () => {},
    persist: (c, rec) => void (c.att = rec),
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
  const join = (id: string, o: { staff?: boolean; map?: "camp"; spawn?: { x: number; y: number } } = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: [], body: "hood", camp: true, ...(o.staff ? { staff: true as const } : {}), ...(o.map ? { map: o.map } : {}) };
    core.join(c, t, 0);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (m: C2S) => encodeEvent(m);
const pos = (core: ChannelCore<Conn>, id: string) => core.roster().find((r) => r.visitorId === id);

describe("운영자 순간이동 (tp)", () => {
  it("운영자가 아니면 무시한다 (자리도 그대로, 아무 소식도 없다)", () => {
    const { core, join } = setup();
    const u = join("u", { spawn: { x: SPAWN.x, y: SPAWN.y } });
    const b = join("b", { spawn: { x: SPAWN.x + 200, y: SPAWN.y } });
    clear(u, b);
    core.message(u, send({ t: "tp", sid: 2, m: "village", x: SPAWN.x + 216, y: SPAWN.y }), 1_000);
    expect(pos(core, "u")).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
    expect(events(u)).toEqual([]);
    expect(events(b)).toEqual([]);
  });

  it("같은 맵: 운영자는 친구가 아니어도 쿨다운 없이 옆으로, 다른 사람에게 떠난·도착 반짝임", () => {
    const { core, join } = setup();
    const op = join("op", { staff: true, spawn: { x: SPAWN.x, y: SPAWN.y } });
    const b = join("b", { spawn: { x: SPAWN.x + 200, y: SPAWN.y } });
    const c = join("c", { spawn: { x: SPAWN.x + 100, y: SPAWN.y + 40 } });
    clear(op, b, c);
    core.message(op, send({ t: "tp", sid: 2, m: "village", x: SPAWN.x + 216, y: SPAWN.y }), 1_000);
    expect(pos(core, "op")).toMatchObject({ x: SPAWN.x + 216, y: SPAWN.y });
    const fx = events(c).filter((e) => e.t === "tpFx");
    expect(fx).toEqual([
      { t: "tpFx", sid: 1, x: SPAWN.x, y: SPAWN.y, k: "out" },
      { t: "tpFx", sid: 1, x: SPAWN.x + 216, y: SPAWN.y, k: "in" },
    ]);
    // 나는 직접 그린다 (반짝임·mapped 없음)
    expect(events(op).filter((e) => e.t === "tpFx" || e.t === "mapped")).toEqual([]);
    // 쿨다운 없이 다시 (겹친 요청 간격만 지나면)
    core.message(op, send({ t: "tp", sid: 3, m: "village", x: SPAWN.x + 116, y: SPAWN.y + 40 }), 1_000 + STAFF_TP_GAP_MS);
    expect(pos(core, "op")).toMatchObject({ x: SPAWN.x + 116, y: SPAWN.y + 40 });
  });

  it("상대가 실내면 inside, 없으면 gone, 너무 먼 자리면 far", () => {
    const { core, join } = setup();
    const op = join("op", { staff: true, spawn: { x: SPAWN.x, y: SPAWN.y } });
    const b = join("b", { spawn: { x: SPAWN.x + 200, y: SPAWN.y } });
    core.message(b, send({ t: "away", on: true, p: "house", h: "house_abcd" }), 500);
    clear(op);
    core.message(op, send({ t: "tp", sid: 2, m: "village", x: SPAWN.x + 216, y: SPAWN.y }), 1_000);
    core.message(op, send({ t: "tp", sid: 9, m: "village", x: SPAWN.x + 216, y: SPAWN.y }), 2_000);
    core.message(b, send({ t: "away", on: false }), 2_500);
    core.message(op, send({ t: "tp", sid: 2, m: "village", x: SPAWN.x + 200 + STAFF_TP_NEAR_PX + 20, y: SPAWN.y }), 3_000);
    expect(events(op).filter((e) => e.t === "tpNo")).toEqual([
      { t: "tpNo", why: "inside" },
      { t: "tpNo", why: "gone" },
      { t: "tpNo", why: "far" },
    ]);
    expect(pos(core, "op")).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
  });

  it("다른 맵: 버스 없이 그 맵으로 옮기고 mapped, 옛 맵에는 out·leave, 새 맵에는 join·in", () => {
    const { core, join } = setup();
    const op = join("op", { staff: true, spawn: { x: SPAWN.x, y: SPAWN.y } });
    const v = join("v", { spawn: { x: SPAWN.x + 40, y: SPAWN.y } });
    const b = join("b", { map: "camp", spawn: { x: 300, y: 700 } });
    clear(op, v, b);
    core.message(op, send({ t: "tp", sid: 3, m: "camp", x: 316, y: 700 }), 1_000);
    expect(pos(core, "op")).toMatchObject({ x: 316, y: 700, map: "camp" });
    expect(events(op).filter((e) => e.t === "mapped")).toEqual([expect.objectContaining({ m: "camp", peers: [expect.objectContaining({ sid: 3 })] })]);
    expect(events(v).map((e) => e.t)).toEqual(["leave", "tpFx"]);
    expect(events(v)[1]).toMatchObject({ k: "out", x: SPAWN.x, y: SPAWN.y });
    expect(events(b).map((e) => e.t)).toEqual(["join", "tpFx"]);
    expect(events(b)[1]).toMatchObject({ k: "in", x: 316, y: 700 });
  });

  it("다른 맵을 바랐는데 거절이면 지금 맵으로 mapped (화면이 되돌린다)", () => {
    const { core, join } = setup();
    const op = join("op", { staff: true, spawn: { x: SPAWN.x, y: SPAWN.y } });
    join("b", { map: "camp", spawn: { x: 300, y: 700 } });
    clear(op);
    core.message(op, send({ t: "tp", sid: 2, m: "camp", x: 300 + STAFF_TP_NEAR_PX + 50, y: 700 }), 1_000);
    expect(events(op).map((e) => e.t)).toEqual(["tpNo", "mapped"]);
    expect(events(op)[1]).toMatchObject({ m: "village" });
  });

  it("tp 메시지 모양 검사", () => {
    expect(parseC2S(JSON.stringify({ t: "tp", sid: 2, m: "sea", x: 10.4, y: 20 }))).toEqual({ t: "tp", sid: 2, m: "sea", x: 10, y: 20 });
    expect(parseC2S(JSON.stringify({ t: "tp", sid: -1, m: "sea", x: 10, y: 20 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "tp", sid: 2, m: "moon", x: 10, y: 20 }))).toBeNull();
  });
});

describe("/internal/people", () => {
  it("서명된 people 요청을 받는다", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const { body, sig } = await signInternal("s", { op: "people", exp });
    expect(await verifyInternal("s", body, sig)).toEqual({ op: "people", exp });
  });

  it("한 줄: 이름·맵·실내 (집 id는 빼고)", () => {
    expect(personOf("v1", { ch: 2, sid: 5, name: "달", x: 1, y: 2, map: "sea" })).toEqual({ visitorId: "v1", ch: 2, sid: 5, name: "달", x: 1, y: 2, map: "sea" });
    expect(personOf("v2", { ch: 1, sid: 6, name: "별", x: 1, y: 2, away: true, place: "house", house: "h_1234" })).toEqual({ visitorId: "v2", ch: 1, sid: 6, name: "별", x: 1, y: 2, inside: true, place: "house" });
  });
});
