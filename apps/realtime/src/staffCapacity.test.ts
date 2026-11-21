import { AVATAR_COLORS, CLOSE, type Grant, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";
import { applyReport, computeLobby, emptyLobby, liveChannels } from "./lobbyState";

// 11/20 운영자는 정원 밖: 꽉 찬 채널에도 들어가고, 인원(count·welcome n·로비 보고)에서 빠지고, 일반 유저 자리를 막지 않는다

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null; closed?: { code: number } };

function setup(capacity: number, room = false) {
  const reported: number[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code) => void (c.closed = { code }),
    persist: (c, rec) => void (c.att = rec),
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: (n) => void reported.push(n),
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async (token) => JSON.parse(token) as Grant,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity, graceMs: 20_000, room }, host);
  const join = (id: string, staff?: true) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...(staff ? { staff } : {}) }, 0);
    return c;
  };
  return { core, join, reported };
}
const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const lastN = (c: Conn) =>
  events(c)
    .map((e) => (e.t === "count" ? e.n : e.t === "welcome" ? (e as { n?: number }).n : undefined))
    .filter((n) => n !== undefined)
    .at(-1);

describe("운영자 정원 밖", () => {
  it("꽉 찬 채널에도 운영자는 들어간다 (일반 유저는 4001)", () => {
    const { core, join } = setup(40);
    for (let i = 0; i < 40; i++) join(`u${i}`);
    expect(join("late").closed?.code).toBe(CLOSE.CHANNEL_FULL);
    expect(core.admits("op", true)).toBe(true);
    const op = join("op", true);
    expect(op.closed).toBeUndefined();
    expect(core.count).toBe(40);
    expect(core.size).toBe(41);
    expect(lastN(op)).toBe(40); // 운영자 welcome에도 40/40
  });

  it("인원(count 이벤트·로비 보고)에서 운영자를 뺀다", () => {
    const { core, join, reported } = setup(40);
    const u = join("u");
    join("op", true);
    expect(core.count).toBe(1);
    expect(core.staffCount).toBe(1);
    expect(lastN(u)).toBe(1);
    expect(reported.at(-1)).toBe(1);
  });

  it("운영자가 있어도 일반 유저가 40번째 자리를 잡는다 (40명 + 운영자 = 40/40)", () => {
    const { core, join } = setup(40);
    join("op", true);
    for (let i = 0; i < 39; i++) join(`u${i}`);
    expect(core.admits("u39")).toBe(true);
    const last = join("u39");
    expect(last.closed).toBeUndefined();
    expect(core.count).toBe(40);
    expect(lastN(last)).toBe(40);
    expect(join("u40").closed?.code).toBe(CLOSE.CHANNEL_FULL);
  });

  it("방(집·사냥터)은 그대로: 운영자도 정원에 든다", () => {
    const { core, join } = setup(2, true);
    join("a");
    join("b");
    expect(core.admits("op", true)).toBe(false);
    expect(join("op", true).closed?.code).toBe(CLOSE.CHANNEL_FULL);
  });
});

describe("로비: 운영자만 있는 채널", () => {
  const cfg = { capacity: 40, maxChannels: 5, threshold: 0.8, baseChannels: 2 };
  it("닫힌 채널을 열어 두지 않고 인원·합계에도 없지만, 공지 받을 채널(live)에는 든다", () => {
    const s = emptyLobby();
    applyReport(s, 4, 0, 1, 0, true, 1);
    const info = computeLobby(s, cfg, () => 0, 10 * 60_000);
    expect(info.channels.find((c) => c.id === 4)).toMatchObject({ count: 0, open: false });
    expect(info.total).toBe(0);
    expect(liveChannels(s, cfg)).toEqual([4]);
  });

  it("staff 없는 보고(admit +1)는 운영자 수를 지우지 않는다", () => {
    const s = emptyLobby();
    expect(applyReport(s, 1, 0, 1, 0, true, 1)).toBe(true);
    applyReport(s, 1, 1, 2, 0, true);
    expect(s.channels[1].staff).toBe(1);
    expect(applyReport(s, 1, 1, 3, 0, true, 0)).toBe(true);
    expect(liveChannels(s, cfg)).toEqual([1]);
    applyReport(s, 1, 0, 4, 0, true, 0);
    expect(liveChannels(s, cfg)).toEqual([]);
  });
});
