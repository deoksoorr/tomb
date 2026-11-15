import { AVATAR_COLORS, encodeEvent, MANAGER_TITLE_ID, signJoinToken, type Grant, type PeerInfo, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { admit, admitRoom } from "./auth";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 11/16 매니저: 입장 토큰·착용 증서의 mgr (Vercel 서명) → 접속자 정보·look 방송에 실려 다른 사람 화면에서 매니저 칭호를 띄운다.
// 매니저 전용 칭호는 매니저 연결만 (해제되면 칭호도 바로 빠진다)

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };
const SECRET = "test-secret";

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
  return new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, room }, host);
}
const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const conn = (id: string): Conn => ({ id, out: [] });
const ticket = (id: string, mgr?: true, look: string[] = []) => ({ visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look, body: "hood", ...(mgr ? { mgr } : {}) });
const LOOK = ["hat_cat", MANAGER_TITLE_ID];

describe("11/16 매니저 표시", () => {
  it("토큰의 mgr는 서명 안에 있고 입장 정보가 된다 (채널·방 모두). 없으면 매니저 칭호를 뺀다, 끼워 넣으면 거절", async () => {
    const t1 = await signJoinToken(SECRET, { visitorId: "m", name: "반장", color: AVATAR_COLORS[0], channel: 1, look: LOOK, mgr: true });
    const t2 = await signJoinToken(SECRET, { visitorId: "u", name: "유저", color: AVATAR_COLORS[0], channel: 1, look: LOOK });
    const a1 = await admit(SECRET, t1, 1, undefined);
    expect(a1?.mgr).toBe(true);
    expect(a1?.look).toEqual(LOOK);
    const a2 = await admit(SECRET, t2, 1, undefined);
    expect(a2?.mgr).toBeUndefined();
    expect(a2?.look).toEqual(["hat_cat"]);
    const [body, sig] = t2.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    forged.mgr = true;
    expect(await admit(SECRET, `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, 1, undefined)).toBeNull();
    // 사냥터 방 토큰도 같다
    const room = "hunt:forest:hell";
    const tr = await signJoinToken(SECRET, { visitorId: "m", name: "반장", color: AVATAR_COLORS[0], channel: 0, room, look: LOOK, mgr: true });
    expect((await admitRoom(SECRET, tr, room, undefined))?.mgr).toBe(true);
  });

  it("다른 사람에게 가는 join·welcome에 mgr가 실리고 저장 형태에도 남는다", () => {
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    const m = conn("m");
    core.join(m, ticket("m", true, LOOK), 0);
    const joined = events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(joined?.mgr).toBe(true);
    expect(joined?.look).toEqual(LOOK);
    const late = conn("late");
    core.join(late, ticket("late"), 0);
    const welcome = events(late).find((e) => e.t === "welcome") as { peers: PeerInfo[] } | undefined;
    expect(welcome?.peers.find((p) => p.name === "m")?.mgr).toBe(true);
    expect(welcome?.peers.find((p) => p.name === "u")?.mgr).toBeUndefined();
    expect(m.att?.mgr).toBe(true);
    expect(u.att?.mgr).toBeUndefined();
  });

  it("착용 증서의 mgr 0으로 해제되면 매니저 표시와 매니저 칭호가 바로 빠지고 look 방송에 mgr 0이 실린다. 옛 증서(mgr 없음)는 그대로 둔다", () => {
    const core = setup(true);
    const u = conn("u");
    const m = conn("m");
    core.join(u, ticket("u"), 0);
    core.join(m, ticket("m", true, LOOK), 0);
    u.out.length = 0;
    // 옛 웹이 낸 증서: mgr 없음 → 매니저 표시 그대로, 칭호도 그대로
    core.applyGrant(m, { kind: "look", visitorId: "m", look: LOOK, exp: 9e9 });
    expect(m.att?.mgr).toBe(true);
    expect(m.att?.look).toEqual(LOOK);
    const old = events(u).find((e) => e.t === "look") as { mgr?: number; look: string[] } | undefined;
    expect(old?.mgr).toBeUndefined();
    // 해제: 칭호를 실어 보내도 뺀다
    u.out.length = 0;
    core.applyGrant(m, { kind: "look", visitorId: "m", look: LOOK, exp: 9e9, mgr: 0 });
    expect(m.att?.mgr).toBeUndefined();
    expect(m.att?.look).toEqual(["hat_cat"]);
    const off = events(u).find((e) => e.t === "look") as { mgr?: number; look: string[] } | undefined;
    expect(off).toMatchObject({ mgr: 0, look: ["hat_cat"] });
    // 매니저가 아닌 사람이 매니저 칭호를 실어 보내도 빠진다
    core.applyGrant(u, { kind: "look", visitorId: "u", look: LOOK, exp: 9e9 });
    expect(u.att?.look).toEqual(["hat_cat"]);
    // 다시 임명
    u.out.length = 0;
    core.applyGrant(m, { kind: "look", visitorId: "m", look: LOOK, exp: 9e9, mgr: 1 });
    expect(m.att?.mgr).toBe(true);
    expect(events(u).find((e) => e.t === "look")).toMatchObject({ mgr: 1, look: LOOK });
  });

  it("다시 들어올 때 매니저 해제가 반영된다 (join을 다시 보낸다)", () => {
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    core.join(conn("m"), ticket("m", true), 0);
    u.out.length = 0;
    core.join(conn("m2"), ticket("m"), 10);
    const again = events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(again).toBeTruthy();
    expect(again?.mgr).toBeUndefined();
  });
});

describe("11/16 매니저 채팅·확성기 딱지", () => {
  const chatLog = (c: Conn) => events(c).find((e): e is Extract<S2C, { t: "chatLog" }> => e.t === "chatLog");
  it("채팅 기록 줄에 매니저 표시(mgr)를 실시간 서버가 연결 정보로 붙인다 (일반 줄엔 없다)", () => {
    const core = setup();
    const m = conn("m");
    const u = conn("u");
    core.join(m, ticket("m", true), 0);
    core.join(u, ticket("u"), 0);
    core.message(m, encodeEvent({ t: "chat", text: "반장이에요" }), 1_000);
    core.message(u, encodeEvent({ t: "chat", text: "안녕하세요" }), 2_000);
    const late = conn("late");
    core.join(late, ticket("late"), 3_000);
    const lines = chatLog(late)?.lines ?? [];
    expect(lines.map((l) => [l.text, l.mgr === true])).toEqual([
      ["반장이에요", true],
      ["안녕하세요", false],
    ]);
    // 해제(mgr 0 증서) 뒤에 쓴 줄은 딱지 없음
    core.applyGrant(m, { kind: "look", visitorId: "m", look: [], exp: 9e9, mgr: 0 });
    core.message(m, encodeEvent({ t: "chat", text: "이제 평범해요" }), 4_000);
    const late2 = conn("late2");
    core.join(late2, ticket("late2"), 5_000);
    expect(chatLog(late2)?.lines.find((l) => l.text === "이제 평범해요")?.mgr).toBeUndefined();
  });

  it("확성기 증서의 mgr를 방송에 그대로 싣는다 (증서는 웹이 서명)", () => {
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    const m = conn("m");
    core.join(m, ticket("m", true), 0);
    u.out.length = 0;
    core.applyGrant(m, { kind: "megaphone", visitorId: "m", nonce: "n1", name: "반장", text: "다들 안녕", scope: "channel", ch: 1, exp: 9e9, mgr: true });
    expect(events(u).find((e) => e.t === "megaphone")).toMatchObject({ t: "megaphone", name: "반장", mgr: true });
  });
});
