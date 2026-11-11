import { AVATAR_COLORS, DIR, STATE, TELESCOPE_SPOT, encodeEvent, encodeMove, spotSeatId, type S2C, type StateId } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost } from "./channel";

// 22번 별 보기 언덕: 망원경·돗자리는 1인 자리 (서 있기·바닥 앉기와 같은 상태지만 sit 요청으로만 잡힌다)

type Conn = { out: string[] };
function setup() {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void (typeof d === "string" && c.out.push(d)),
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
  const join = (id: string, x: number, y: number) => {
    const c: Conn = { out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: { x, y }, look: [], body: "hood" }, 0);
    return c;
  };
  const ev = (c: Conn) => c.out.map((d) => JSON.parse(d) as S2C);
  const mv = (c: Conn, x: number, y: number, state: StateId, now: number) => core.message(c, encodeMove({ x, y, state, dir: DIR.up, seq: 0 }), now);
  return { core, join, ev, mv };
}

describe("telescope / mat spots", () => {
  const scope = spotSeatId("telescope", TELESCOPE_SPOT.x, TELESCOPE_SPOT.y);
  it("one person per telescope; standing still keeps it, walking away frees it", () => {
    const { core, join, ev, mv } = setup();
    const a = join("a", TELESCOPE_SPOT.x, TELESCOPE_SPOT.y + 4);
    const b = join("b", TELESCOPE_SPOT.x + 6, TELESCOPE_SPOT.y + 4);
    core.message(a, encodeEvent({ t: "sit", seatId: scope }), 10);
    core.message(b, encodeEvent({ t: "sit", seatId: scope }), 11);
    expect(ev(b)).toContainEqual({ t: "seat", seatId: scope, sid: 1 });
    expect(ev(b)).toContainEqual({ t: "seatDenied", seatId: scope });
    expect(core.peer(1)).toMatchObject({ seatId: scope, state: STATE.idle, dir: DIR.up });
    mv(a, TELESCOPE_SPOT.x, TELESCOPE_SPOT.y, STATE.idle, 200);
    expect(core.peer(1)?.seatId).toBe(scope);
    mv(a, TELESCOPE_SPOT.x + 5, TELESCOPE_SPOT.y + 5, STATE.walk, 400);
    expect(core.peer(1)?.seatId).toBeNull();
    expect(ev(b)).toContainEqual({ t: "seat", seatId: scope, sid: null });
  });

  it("an ordinary ground sit does not claim a mat id by itself", () => {
    const { core, join, mv } = setup();
    const a = join("a", 352, 227);
    mv(a, 352, 227, STATE.sitGround, 100);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.sitGround });
    core.message(a, encodeEvent({ t: "sit", seatId: "n_352_227" }), 200);
    expect(core.peer(1)).toMatchObject({ seatId: "n_352_227", state: STATE.sitGround });
  });
});
