import { AVATAR_COLORS, CAMP_SCOPES, DIR, SEA_SCOPES, STATE, TELESCOPE_2, TELESCOPE_SPOT, TELESCOPES, encodeEvent, encodeMove, scopeSeatId, spotSeatId, type S2C, type StateId } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket } from "./channel";

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

  it("11/15 two telescopes: two people look at the same time, each holding their own", () => {
    const { core, join, ev } = setup();
    const scope2 = spotSeatId("telescope", TELESCOPE_2.x, TELESCOPE_2.y + 10);
    const a = join("a", TELESCOPE_SPOT.x, TELESCOPE_SPOT.y + 4);
    const b = join("b", TELESCOPE_2.x, TELESCOPE_2.y + 14);
    core.message(a, encodeEvent({ t: "sit", seatId: scope }), 10);
    core.message(b, encodeEvent({ t: "sit", seatId: scope2 }), 11);
    expect(ev(b)).not.toContainEqual({ t: "seatDenied", seatId: scope2 });
    expect(core.peer(1)).toMatchObject({ seatId: scope, state: STATE.idle, dir: DIR.up });
    expect(core.peer(2)).toMatchObject({ seatId: scope2, state: STATE.idle, dir: DIR.up });
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

// 11/16 망원경 늘리기: 마을 곳곳(TELESCOPES)·캠핑장(CAMP_SCOPES)·바닷가 동전 망원경(SEA_SCOPES, binocular) — 서버는 목록을 몰라도 자리 id(종류 + 앵커)로 받는다
describe("more telescopes (village · camp · sea)", () => {
  function mapSetup() {
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
    const core = new ChannelCore<Conn>({ capacity: 20, graceMs: 20_000 }, host);
    const join = (id: string, x: number, y: number, map?: "camp" | "sea") => {
      const c: Conn = { out: [] };
      const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn: { x, y }, look: [], body: "hood", ...(map === "camp" ? { camp: true as const, map } : map === "sea" ? { sea: true as const, map } : {}) };
      core.join(c, t, 0);
      return c;
    };
    const ev = (c: Conn) => c.out.map((d) => JSON.parse(d) as S2C);
    return { core, join, ev };
  }

  it("every village telescope is its own 1-person spot: all of them can be used at once", () => {
    const { core, join, ev } = mapSetup();
    expect(TELESCOPES.length).toBeGreaterThanOrEqual(6);
    const cs = TELESCOPES.map((t, i) => {
      const c = join(`v${i}`, t.x, t.y + 12);
      core.message(c, encodeEvent({ t: "sit", seatId: spotSeatId("telescope", t.x, t.y + 10) }), 10 + i);
      return c;
    });
    cs.forEach((c, i) => {
      const t = TELESCOPES[i];
      expect(ev(c)).not.toContainEqual({ t: "seatDenied", seatId: spotSeatId("telescope", t.x, t.y + 10) });
      expect(core.peer(i + 1)).toMatchObject({ seatId: spotSeatId("telescope", t.x, t.y + 10), state: STATE.idle, dir: DIR.up });
    });
  });

  it("camp star telescopes and sea coin binoculars are accepted on their own maps (binocular looks down at the sea)", () => {
    const { core, join, ev } = mapSetup();
    let sid = 0;
    for (const s of CAMP_SCOPES) {
      const c = join(`c${s.id}`, s.ax, s.ay + 2, "camp");
      sid++;
      core.message(c, encodeEvent({ t: "sit", seatId: scopeSeatId(s) }), 10);
      expect(ev(c)).not.toContainEqual({ t: "seatDenied", seatId: scopeSeatId(s) });
      expect(core.peer(sid)).toMatchObject({ map: "camp", seatId: scopeSeatId(s), state: STATE.idle, dir: DIR.up });
    }
    for (const s of SEA_SCOPES) {
      const c = join(`s${s.id}`, s.ax, s.ay - 2, "sea");
      sid++;
      core.message(c, encodeEvent({ t: "sit", seatId: scopeSeatId(s) }), 10);
      expect(ev(c)).not.toContainEqual({ t: "seatDenied", seatId: scopeSeatId(s) });
      expect(core.peer(sid)).toMatchObject({ map: "sea", seatId: scopeSeatId(s), state: STATE.idle, dir: DIR.down });
      // 한 대에 한 명
      const late = join(`late${s.id}`, s.ax + 4, s.ay - 2, "sea");
      sid++;
      core.message(late, encodeEvent({ t: "sit", seatId: scopeSeatId(s) }), 20);
      expect(ev(late)).toContainEqual({ t: "seatDenied", seatId: scopeSeatId(s) });
    }
  });

  it("far away from the binocular is refused (same distance rule as other spots)", () => {
    const { core, join, ev } = mapSetup();
    const s = SEA_SCOPES[0];
    const c = join("far", s.ax + 200, s.ay, "sea");
    core.message(c, encodeEvent({ t: "sit", seatId: scopeSeatId(s) }), 10);
    expect(ev(c)).toContainEqual({ t: "seatDenied", seatId: scopeSeatId(s) });
  });
});
