import {
  AVATAR_COLORS,
  CAMP_ARRIVE,
  DIR,
  SNOWBALL_HIT_WINDOW_MS,
  SNOWBALL_INTERVAL_MS,
  SNOWBALL_KEEP,
  SNOWBALL_PER_MINUTE,
  SNOWBALL_SERVER_INTERVAL_MS,
  SPAWN,
  STATE,
  encodeEvent,
  encodeMove,
  type C2S,
  type Grant,
  type S2C,
  type StateId,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";

// 11/18 마을·캠핑장 눈싸움: 던지기는 같은 맵 다른 사람에게 중계, 맞음은 맞은 사람이 신고하면 서버가 최근 던지기·위치만 보고 모두에게

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };
type Where = { camp?: boolean; sea?: boolean; map?: "camp" | "sea"; spawn?: { x: number; y: number } };

function setup(room = false) {
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
    verifyGrant: async (token) => JSON.parse(token) as Grant,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity: 40, graceMs: 20_000, ...(room ? { room: true } : {}) }, host);
  const join = (id: string, o: Where = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = {
      visitorId: id,
      name: id,
      color: AVATAR_COLORS[0],
      channel: room ? 0 : 1,
      spawn: o.spawn,
      look: [],
      body: "hood",
      ...(room ? { room: "village" } : {}),
      ...(o.camp ? { camp: true as const } : {}),
      ...(o.sea ? { sea: true as const } : {}),
      ...(o.map ? { map: o.map } : {}),
    };
    core.join(c, t, 0);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const of = <T extends S2C["t"]>(c: Conn, t: T) => events(c).filter((e): e is Extract<S2C, { t: T }> => e.t === t);
const send = (m: C2S) => encodeEvent(m);
const move = (x: number, y: number, state: StateId = STATE.idle) => encodeMove({ x, y, state, dir: DIR.right, seq: 0 });
const A = { x: SPAWN.x - 60, y: SPAWN.y + 40 };
const B = { x: SPAWN.x + 20, y: SPAWN.y + 40 };
const throwAtB = (x = A.x, y = A.y) => send({ t: "snowball", x, y, tx: x + 140, ty: y });
/** 던지기 간격 한 칸 */
const T = SNOWBALL_INTERVAL_MS;

describe("snowfight", () => {
  it("던지기는 번호를 붙여 같은 맵 다른 사람에게, 던진 사람·다른 맵에는 안 간다", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    const c = join("c", { camp: true, map: "camp", spawn: CAMP_ARRIVE });
    core.message(a, throwAtB(), 1000);
    expect(of(b, "snowball")).toEqual([{ t: "snowball", sid: 1, n: 1, x: A.x, y: A.y, tx: A.x + 140, ty: A.y }]);
    expect(of(a, "snowball")).toEqual([]);
    expect(of(c, "snowball")).toEqual([]);
  });

  it("간격·출발점·거리·자세를 본다", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    core.message(a, throwAtB(), 1000);
    core.message(a, throwAtB(), 1000 + SNOWBALL_SERVER_INTERVAL_MS - 1);
    expect(of(b, "snowball")).toHaveLength(1);
    // 서버 위치에서 먼 출발점, 너무 먼 떨어질 곳
    core.message(a, send({ t: "snowball", x: A.x + 200, y: A.y, tx: A.x + 300, ty: A.y }), 1000 + T);
    core.message(a, send({ t: "snowball", x: A.x, y: A.y, tx: A.x + 400, ty: A.y }), 1000 + 2 * T);
    expect(of(b, "snowball")).toHaveLength(1);
    // 앉아 있으면 못 던진다
    core.message(a, move(A.x, A.y, STATE.sitGround), 1000 + 3 * T - 500);
    core.message(a, throwAtB(), 1000 + 3 * T);
    expect(of(b, "snowball")).toHaveLength(1);
    core.message(a, move(A.x, A.y, STATE.walk), 1000 + 4 * T - 500);
    core.message(a, throwAtB(), 1000 + 4 * T);
    expect(of(b, "snowball").map((e) => e.n)).toEqual([1, 2]);
  });

  it("바닷가·실내·방에서는 던지지 않는다", () => {
    const { core, join } = setup();
    const s1 = join("s1", { sea: true, map: "sea", spawn: { x: 600, y: 700 } });
    const s2 = join("s2", { sea: true, map: "sea", spawn: { x: 640, y: 700 } });
    core.message(s1, send({ t: "snowball", x: 600, y: 700, tx: 740, ty: 700 }), 1000);
    expect(of(s2, "snowball")).toEqual([]);
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    core.message(a, send({ t: "away", on: true }), 500);
    core.message(a, throwAtB(), 1000);
    expect(of(b, "snowball")).toEqual([]);
    const r = setup(true);
    const ra = r.join("ra", { spawn: A });
    const rb = r.join("rb", { spawn: B });
    r.core.message(ra, throwAtB(), 1000);
    expect(of(rb, "snowball")).toEqual([]);
  });

  it("맞음: 길 근처면 같은 맵 모두에게 한 번만, 늦거나 멀거나 모르는 번호는 버린다", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    const c = join("c", { spawn: { x: A.x, y: A.y + 200 } });
    core.message(a, throwAtB(), 1000);
    core.message(b, send({ t: "snowHit", by: 1, n: 9 }), 1300);
    expect(of(a, "snowHit")).toEqual([]);
    core.message(b, send({ t: "snowHit", by: 1, n: 1 }), 1500);
    const hit = { t: "snowHit", sid: 2, by: 1, n: 1 };
    expect(of(a, "snowHit")).toEqual([hit]);
    expect(of(b, "snowHit")).toEqual([hit]);
    expect(of(c, "snowHit")).toEqual([hit]);
    // 같은 눈은 한 사람만 (다시 신고해도, 다른 사람이 신고해도)
    core.message(b, send({ t: "snowHit", by: 1, n: 1 }), 2000);
    core.message(c, send({ t: "snowHit", by: 1, n: 1 }), 2000);
    expect(of(a, "snowHit")).toHaveLength(1);
    // 길에서 먼 사람(c)의 신고, 너무 늦은 신고
    const t2 = 1000 + T;
    core.message(a, throwAtB(), t2);
    expect(of(b, "snowball").map((e) => e.n)).toEqual([1, 2]);
    core.message(c, send({ t: "snowHit", by: 1, n: 2 }), t2 + 300);
    core.message(b, send({ t: "snowHit", by: 1, n: 2 }), t2 + SNOWBALL_HIT_WINDOW_MS + 1);
    expect(of(a, "snowHit")).toHaveLength(1);
    // 나에게 던진 눈을 내가 신고할 수 없다
    const t3 = 1000 + 3 * T;
    core.message(a, throwAtB(), t3);
    core.message(a, send({ t: "snowHit", by: 1, n: 3 }), t3 + 200);
    expect(of(a, "snowHit")).toHaveLength(1);
  });

  it(`최근 ${SNOWBALL_KEEP}개까지만 기억한다, 다른 맵 사람은 신고할 수 없다`, () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    for (let i = 0; i <= SNOWBALL_KEEP; i++) core.message(a, throwAtB(), 1000 + i * T);
    expect(of(b, "snowball")).toHaveLength(SNOWBALL_KEEP + 1);
    core.message(b, send({ t: "snowHit", by: 1, n: 1 }), 1000 + SNOWBALL_KEEP * T + 100);
    expect(of(b, "snowHit")).toEqual([]);
    core.message(b, send({ t: "snowHit", by: 1, n: SNOWBALL_KEEP + 1 }), 1000 + SNOWBALL_KEEP * T + 300);
    expect(of(b, "snowHit")).toHaveLength(1);
    const { core: k, join: j } = setup();
    const ka = j("ka", { camp: true, spawn: A });
    const kb = j("kb", { camp: true, map: "camp", spawn: CAMP_ARRIVE });
    k.message(ka, throwAtB(), 1000);
    k.message(kb, send({ t: "snowHit", by: 1, n: 1 }), 1200);
    expect(of(ka, "snowHit")).toEqual([]);
  });

  it("앉은 사람도 맞는다 (실내에 들어간 사람만 아니다)", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    core.message(b, move(B.x, B.y, STATE.sitGround), 500);
    core.message(a, throwAtB(), 1000);
    core.message(b, send({ t: "snowHit", by: 1, n: 1, h: 8 }), 1400);
    expect(of(a, "snowHit")).toHaveLength(1);
    core.message(b, send({ t: "away", on: true }), 1500);
    core.message(a, throwAtB(), 1000 + T);
    core.message(b, send({ t: "snowHit", by: 1, n: 2 }), 1000 + T + 400);
    expect(of(a, "snowHit")).toHaveLength(1);
  });

  it("맞은 높이(h)를 그대로 모두에게", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    core.message(a, throwAtB(), 1000);
    core.message(b, send({ t: "snowHit", by: 1, n: 1, h: 14 }), 1400);
    expect(of(a, "snowHit")).toEqual([{ t: "snowHit", sid: 2, by: 1, n: 1, h: 14 }]);
  });

  it("3초 간격(서버 2.8초), 1분에 SNOWBALL_PER_MINUTE개 넘게 보내면 버린다", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: A });
    const b = join("b", { spawn: B });
    core.message(a, throwAtB(), 1000);
    core.message(a, throwAtB(), 1000 + 2000);
    core.message(a, throwAtB(), 1000 + SNOWBALL_SERVER_INTERVAL_MS);
    expect(of(b, "snowball").map((e) => e.n)).toEqual([1, 2]);
    // 1분 안에 메시지를 마구 보내면 (간격 때문에 버린 것도 센다) 상한을 넘은 뒤로는 간격이 지나도 버린다
    const { core: k, join: j } = setup();
    const ka = j("ka", { spawn: A });
    const kb = j("kb", { spawn: B });
    for (let i = 0; i < SNOWBALL_PER_MINUTE; i++) k.message(ka, throwAtB(), 1000 + i * 100);
    k.message(ka, throwAtB(), 1000 + SNOWBALL_INTERVAL_MS * 4);
    expect(of(kb, "snowball")).toHaveLength(1);
    k.message(ka, throwAtB(), 61_000 + SNOWBALL_PER_MINUTE * 100);
    expect(of(kb, "snowball")).toHaveLength(2);
  });

  it("캠핑장끼리도 된다", () => {
    const { core, join } = setup();
    const p = { x: CAMP_ARRIVE.x + 40, y: CAMP_ARRIVE.y };
    const a = join("a", { camp: true, map: "camp", spawn: p });
    const b = join("b", { camp: true, map: "camp", spawn: { x: p.x + 60, y: p.y } });
    core.message(a, send({ t: "snowball", x: p.x, y: p.y, tx: p.x + 140, ty: p.y }), 1000);
    expect(of(b, "snowball")).toHaveLength(1);
    core.message(b, send({ t: "snowHit", by: 1, n: 1 }), 1400);
    expect(of(a, "snowHit")).toEqual([{ t: "snowHit", sid: 2, by: 1, n: 1 }]);
  });
});
