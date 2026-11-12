import { AVATAR_COLORS, CLOSE, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord, type Reservation } from "./channel";

// 47번 운영자 내보내기·이용 제한(expel)과 유저 신고용 sid 조회(peerAt)

type Conn = { id: string; out: (string | ArrayBuffer)[]; closed?: { code: number; reason: string }; att?: PeerRecord | null };

function setup() {
  const reservations = new Map<number, Reservation>();
  const visitors: string[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code, reason) => void (c.closed = { code, reason }),
    persist: (c, rec) => void (c.att = rec),
    saveReservation: (r) => void reservations.set(r.sid, r),
    dropReservation: (sid) => void reservations.delete(sid),
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: (v) => void visitors.push(`+${v}`),
    visitorLeft: (v) => void visitors.push(`-${v}`),
    verifyGrant: async () => null,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, room: false }, host);
  const join = (id: string, name = id) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood" }, 0);
    return c;
  };
  return { core, reservations, visitors, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);

describe("expel / peerAt", () => {
  it("접속 중이면 받은 코드로 닫고 다른 사람에게 퇴장을 알린다 (유예 없음)", () => {
    const { core, join, reservations, visitors } = setup();
    const a = join("a");
    const b = join("b");
    expect(core.expel("a", CLOSE.BANNED, "banned")).toBe(true);
    expect(a.closed).toEqual({ code: CLOSE.BANNED, reason: "banned" });
    expect(a.att).toBeNull(); // hibernate 뒤 되살아나지 않게
    expect(events(b)).toContainEqual({ t: "leave", sid: 1 });
    expect(reservations.size).toBe(0);
    expect(visitors).toContain("-a");
    expect(core.count).toBe(1);
  });

  it("재연결 유예 중인 사람은 예약을 지운다. 없는 사람은 false", () => {
    const { core, join, reservations } = setup();
    const a = join("a");
    core.disconnect(a, 1006, 0);
    expect(reservations.size).toBe(1);
    expect(core.expel("a", CLOSE.KICKED, "kicked")).toBe(true);
    expect(reservations.size).toBe(0);
    expect(core.count).toBe(0);
    expect(core.expel("a", CLOSE.KICKED, "kicked")).toBe(false);
    expect(core.expel("nobody", CLOSE.KICKED, "kicked")).toBe(false);
  });

  it("peerAt: sid → 방문자·이름, 나가면 null", () => {
    const { core, join } = setup();
    join("a", "유령A");
    join("b", "유령B");
    expect(core.peerAt(2)).toEqual({ visitorId: "b", name: "유령B" });
    expect(core.peerAt(9)).toBeNull();
    core.expel("b", CLOSE.KICKED, "kicked");
    expect(core.peerAt(2)).toBeNull();
  });

  it("nudgeMe: 접속 중인 그 사람에게만 {t:'me'}를 보낸다. 없거나 유예 중이면 false", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    expect(core.nudgeMe("a")).toBe(true);
    expect(events(a)).toContainEqual({ t: "me" });
    expect(events(b)).not.toContainEqual({ t: "me" });
    expect(core.nudgeMe("nobody")).toBe(false);
    core.disconnect(a, 1006, 0);
    expect(core.nudgeMe("a")).toBe(false);
  });
});
