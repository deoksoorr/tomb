import { AVATAR_COLORS, CAMP_ARRIVE, SEA_ARRIVE, SPAWN, encodeEvent, parseConnWire, type MapCause, type MapId, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, LAST_MAP_MS, type ChannelHost, type JoinInfo, type JoinTicket, type PeerRecord } from "./channel";
import { tabRow } from "./lobbyState";

// 11/27 다시 붙어도 맵은 서버가 아는 그대로 (빈구: 탭 두 개 「여기서 다시 접속」으로 버스 없이 바닷가 → 마을 → 캠핑장).
// 맵이 바뀌는 길은 맵 옮기기 요청(버스·친구·집 문)·운영자 순간이동·허락 잃음뿐이고, 서버가 옮길 때마다 기록(mapMoved)을 남긴다.

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null; closed?: { code: number } };
type Joined = { visitorId: string; info?: JoinInfo };
type Moved = { visitorId: string; from: MapId; to: MapId; cause: MapCause };

function setup(graceMs = 20_000) {
  const joined: Joined[] = [];
  const moved: Moved[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code) => void (c.closed = { code }),
    persist: (c, rec) => void (c.att = rec),
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: (visitorId, _at, info) => void joined.push({ visitorId, info }),
    visitorLeft: () => {},
    mapMoved: (visitorId, from, to, cause) => void moved.push({ visitorId, from, to, cause }),
    verifyGrant: async () => null,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs }, host);
  /** 주소의 m·x·y = map·spawn. perm = 토큰 허락 (기본 캠핑장·바닷가 모두). known = DO가 다른 채널에서 찾은 맵 */
  const join = (id: string, o: { map?: "camp" | "sea"; spawn?: { x: number; y: number }; now?: number; c?: Conn; perm?: boolean; known?: MapId; tab?: string } = {}) => {
    const c = o.c ?? { id, out: [] };
    const perm = o.perm !== false;
    const t: JoinTicket = {
      visitorId: id,
      name: id,
      color: AVATAR_COLORS[0],
      channel: 1,
      spawn: o.spawn,
      look: [],
      body: "hood",
      ...(perm ? { camp: true as const, sea: true as const } : {}),
      ...(o.map && perm ? { map: o.map } : {}),
      ...(o.known ? { known: o.known } : {}),
      ...(o.tab ? { tab: o.tab } : {}),
    };
    core.join(c, t, o.now ?? 0);
    return c;
  };
  return { core, join, joined, moved };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const welcome = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "welcome" }> => e.t === "welcome").at(-1)!;
const send = (m: Parameters<typeof encodeEvent>[0]) => encodeEvent(m);

describe("11/27 다시 붙어도 서버가 아는 맵 그대로", () => {
  it("탭 두 개, 같은 채널: 바닷가에 있는 사람을 마을 탭의 「여기서 다시 접속」이 마을로 끌어오지 못한다 (맵·자리 그대로, welcome에 서버 맵·자리)", () => {
    const { core, join, joined, moved } = setup();
    const tabB = join("bingu", { map: "sea", spawn: { x: 600, y: 700 }, known: "sea", tab: "tabB" });
    const other = join("o", { map: "sea", spawn: { x: 640, y: 700 }, known: "sea" });
    other.out.length = 0;
    const tabA: Conn = { id: "tabA", out: [] };
    join("bingu", { spawn: { x: 1000, y: 900 }, now: 5_000, c: tabA, tab: "tabA" });
    expect(tabB.closed?.code).toBeDefined(); // 이전 탭은 끊긴다 (4002)
    expect(core.peer(1)).toMatchObject({ map: "sea", x: 600, y: 700 });
    expect(welcome(tabA)).toMatchObject({ sid: 1, resumed: true, m: "sea", pos: { x: 600, y: 700 } });
    expect(events(other)).not.toContainEqual({ t: "leave", sid: 1 });
    expect(moved).toEqual([]);
    expect(joined.at(-1)).toEqual({ visitorId: "bingu", info: { map: "sea", take: true, live: true, ptab: "tabB", ask: "village", tab: "tabA" } });
  });

  it("같은 맵이어도 다른 탭이 넘겨받으면 자리는 서버 자리 그대로 (탭 두 개로 맵 안 순간이동 막기)", () => {
    const { core, join } = setup();
    join("a", { map: "camp", spawn: { x: 400, y: 700 }, known: "camp" });
    const b: Conn = { id: "a2", out: [] };
    join("a", { map: "camp", spawn: { x: 900, y: 300 }, now: 1_000, c: b });
    expect(core.peer(1)).toMatchObject({ map: "camp", x: 400, y: 700 });
    expect(welcome(b).pos).toEqual({ x: 400, y: 700 });
  });

  it("새로고침·잠깐 끊김(유예 안, 같은 맵): 주소 자리로 이어 간다", () => {
    const { core, join, joined } = setup();
    const a = join("a", { map: "camp", spawn: { x: 400, y: 700 }, known: "camp", tab: "t1" });
    core.disconnect(a, 1001, 1_000);
    const a2: Conn = { id: "a2", out: [] };
    join("a", { map: "camp", spawn: { x: 410, y: 705 }, now: 2_000, c: a2, tab: "t1" });
    expect(core.peer(1)).toMatchObject({ map: "camp", x: 410, y: 705 });
    expect(welcome(a2)).toMatchObject({ m: "camp", resumed: true, pos: { x: 410, y: 705 } });
    expect(joined.at(-1)?.info).toEqual({ map: "camp", take: true, tab: "t1" });
  });

  it("유예 안에 다른 맵 주소로 다시 붙어도 (오래된 이어하기 기록) 맵·자리는 서버 것", () => {
    const { core, join, moved } = setup();
    const a = join("a", { map: "sea", spawn: { x: 600, y: 700 }, known: "sea" });
    core.disconnect(a, 1006, 1_000);
    const a2: Conn = { id: "a2", out: [] };
    join("a", { spawn: { x: 1000, y: 900 }, now: 3_000, c: a2 });
    expect(core.peer(1)).toMatchObject({ map: "sea", x: 600, y: 700 });
    expect(welcome(a2)).toMatchObject({ m: "sea", pos: { x: 600, y: 700 } });
    expect(moved).toEqual([]);
  });

  it("유예가 지난 뒤 1분 안: 이 채널이 기억한 마지막 맵으로, 주소 맵이 다르면 그 맵 정류장에서", () => {
    const { core, join } = setup(20_000);
    const a = join("a", { map: "sea", spawn: { x: 600, y: 700 }, known: "sea" });
    core.disconnect(a, 1006, 1_000);
    core.expire(30_000);
    expect(core.peer(1)).toBeUndefined();
    const a2: Conn = { id: "a2", out: [] };
    join("a", { spawn: { x: 1000, y: 900 }, now: 31_000, c: a2 });
    expect(welcome(a2)).toMatchObject({ m: "sea", pos: { x: SEA_ARRIVE.x, y: SEA_ARRIVE.y } });
    expect(core.visitorMap("a", 31_500)).toBe("sea");
  });

  it("나가고 1분이 지나면(서버가 모름) 새로 들어온 사람: 마을은 주소 자리, 캠핑장·바닷가는 그 맵 정류장에서 (허락 있는 맵만)", () => {
    const { core, join } = setup(0);
    const a = join("a", { map: "sea", spawn: { x: 600, y: 700 }, known: "sea" });
    core.disconnect(a, 1000, 1_000);
    const t = 1_000 + LAST_MAP_MS + 1;
    expect(core.visitorMap("a", t)).toBeNull();
    const a2: Conn = { id: "a2", out: [] };
    join("a", { spawn: { x: 1000, y: 900 }, now: t, c: a2 });
    expect(welcome(a2).m).toBeUndefined();
    expect(core.peer(2) ?? core.peer(1)).toMatchObject({ x: 1000, y: 900 });

    const { join: join2 } = setup();
    const f: Conn = { id: "f", out: [] };
    join2("fresh", { map: "camp", spawn: { x: 900, y: 300 }, c: f });
    expect(welcome(f)).toMatchObject({ m: "camp", pos: { x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y } });
    const g: Conn = { id: "g", out: [] };
    join2("noperm", { map: "camp", spawn: { x: 900, y: 300 }, c: g, perm: false });
    expect(welcome(g).m).toBeUndefined();
  });

  it("탭 두 개, 다른 채널: 다른 채널에서 찾은 맵(known)으로, 주소 맵이 다르면 그 맵 정류장에서 (주소 자리 안 받음)", () => {
    const { core, join, joined } = setup();
    const c: Conn = { id: "c", out: [] };
    join("bingu", { spawn: { x: 1000, y: 900 }, known: "sea", c, tab: "tabA" });
    expect(core.peer(1)).toMatchObject({ map: "sea", x: SEA_ARRIVE.x, y: SEA_ARRIVE.y });
    expect(welcome(c)).toMatchObject({ m: "sea", pos: { x: SEA_ARRIVE.x, y: SEA_ARRIVE.y } });
    expect(joined.at(-1)?.info).toEqual({ map: "sea", ask: "village", tab: "tabA" });
    // 채널 옮기기(같은 맵 주소): 주소 자리 그대로
    const d: Conn = { id: "d", out: [] };
    join("mover", { map: "camp", spawn: { x: 410, y: 700 }, known: "camp", c: d });
    expect(welcome(d)).toMatchObject({ m: "camp", pos: { x: 410, y: 700 } });
  });

  it("허락이 없어진 토큰으로 다시 붙으면 마을로 (그때만 서버가 맵을 바꾸고 기록)", () => {
    const { core, join, moved } = setup();
    const a = join("a", { map: "camp", spawn: { x: 400, y: 700 }, known: "camp" });
    core.disconnect(a, 1006, 1_000);
    const a2: Conn = { id: "a2", out: [] };
    join("a", { spawn: { x: 1000, y: 900 }, now: 2_000, c: a2, perm: false });
    expect(core.peer(1)?.map).toBeUndefined();
    expect(core.peer(1)).toMatchObject({ x: 1000, y: 900 });
    expect(moved).toEqual([{ visitorId: "a", from: "camp", to: "village", cause: "permLost" }]);
    const b = join("b", { map: "camp", known: "camp", perm: false });
    expect(welcome(b).m).toBeUndefined();
    expect(core.peer(2)).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
  });

  it("맵 옮기기 요청(버스)은 그대로 되고, 서버가 옮길 때마다 기록", () => {
    const { core, join, moved } = setup();
    const a = join("a", { spawn: { x: 300, y: 300 } });
    core.message(a, send({ t: "map", m: "sea", x: SEA_ARRIVE.x, y: SEA_ARRIVE.y }), 10_000);
    expect(core.peer(1)).toMatchObject({ map: "sea" });
    expect(moved).toEqual([{ visitorId: "a", from: "village", to: "sea", cause: "mapReq" }]);
  });
});

describe("11/27 다시 접속 기록 줄 (로비 tabRow)", () => {
  it("이전 연결을 끊음 · 화면이 다른 맵 · 다른 채널 탭은 남기고, 같은 탭 새로고침·채널 옮기기는 남기지 않는다", () => {
    expect(tabRow({ map: "sea", take: true, live: true, ask: "village", tab: "tabA" }, "tabB", undefined)).toEqual({ m: "sea", a: "village", tab: "tabA", pt: "tabB", live: 1 });
    expect(tabRow({ map: "sea", ask: "village", tab: "tabA" }, "tabB", 2)).toEqual({ m: "sea", a: "village", tab: "tabA", pt: "tabB", pc: 2 });
    expect(tabRow({ map: "camp", take: true, tab: "tab1" }, "tab1", undefined)).toBeNull();
    expect(tabRow({ map: "camp", tab: "tab1" }, "tab1", 2)).toBeNull();
    expect(tabRow({ map: "camp", take: true, tab: "tab2" }, "tab1", undefined)).toEqual({ m: "camp", tab: "tab2", pt: "tab1" });
    expect(tabRow({ map: "village" }, undefined, undefined)).toBeNull();
    // 로비가 다시 떠 이전 탭을 잊어도 같은 채널은 채널이 알려 준 이전 탭(ptab)으로
    expect(tabRow({ map: "sea", take: true, live: true, tab: "tabA", ptab: "tabB" }, undefined, undefined)).toEqual({ m: "sea", tab: "tabA", pt: "tabB", live: 1 });
  });

  it("웹이 받는 일곱 칸 줄 검사", () => {
    expect(parseConnWire(["W5xv", "t", 1, 1, "pc", "", { m: "sea", a: "village", tab: "tabA", pt: "tabB", live: 1 }])).not.toBeNull();
    expect(parseConnWire(["W5xv", "m", 1, 1, "pc", "", { f: "village", t: "sea", c: "mapReq" }])).not.toBeNull();
    expect(parseConnWire(["W5xv", "m", 1, 1, "pc", "", { f: "moon" }])).toBeNull();
    expect(parseConnWire(["W5xv", "t", 1, 1, "pc", "", { tab: "x" }])).toBeNull();
    expect(parseConnWire(["W5xv", "i", 1, 1, "pc", ""])).not.toBeNull();
    expect(parseConnWire(["W5xv", "i", 1, 1, "pc", "", {}])).toBeNull();
  });
});
