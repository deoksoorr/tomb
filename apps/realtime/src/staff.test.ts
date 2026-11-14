import { AVATAR_COLORS, signJoinToken, type Grant, type PeerInfo, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { admit } from "./auth";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 31번 운영자 계정: 입장 토큰의 staff 표시 → 접속자 정보(join·welcome·peers)에 실려 다른 사람 화면에 저승사자 차림으로

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };
const SECRET = "test-secret";

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
    verifyGrant: async (token) => JSON.parse(token) as Grant,
    claimNonce: () => true,
  };
  return new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, room: false }, host);
}
const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const conn = (id: string): Conn => ({ id, out: [] });
const ticket = (id: string, staff?: true) => ({ visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...(staff ? { staff } : {}) });

describe("31번 운영자 표시", () => {
  it("토큰의 staff는 서명 안에 있고 그대로 입장 정보가 된다 (일반 토큰엔 없다)", async () => {
    const t1 = await signJoinToken(SECRET, { visitorId: "op", name: "운영", color: AVATAR_COLORS[0], channel: 1, look: [], staff: true });
    const t2 = await signJoinToken(SECRET, { visitorId: "u", name: "유저", color: AVATAR_COLORS[0], channel: 1, look: [] });
    expect((await admit(SECRET, t1, 1, undefined))?.staff).toBe(true);
    expect((await admit(SECRET, t2, 1, undefined))?.staff).toBeUndefined();
    // 몸통을 바꿔 staff를 끼워 넣으면 서명이 맞지 않는다
    const [body, sig] = t2.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    forged.staff = true;
    expect(await admit(SECRET, `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, 1, undefined)).toBeNull();
  });

  it("다른 사람에게 가는 join·welcome에 staff가 실리고, 저장 형태에도 남는다", () => {
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    const op = conn("op");
    core.join(op, ticket("op", true), 0);
    const joined = events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(joined?.staff).toBe(true);
    // 나중에 들어온 사람의 welcome (나를 뺀 접속자 목록)
    const late = conn("late");
    core.join(late, ticket("late"), 0);
    const welcome = events(late).find((e) => e.t === "welcome") as { peers: PeerInfo[] } | undefined;
    expect(welcome?.peers.find((p) => p.name === "op")?.staff).toBe(true);
    expect(welcome?.peers.find((p) => p.name === "u")?.staff).toBeUndefined();
    expect(op.att?.staff).toBe(true);
    expect(u.att?.staff).toBeUndefined();
  });

  it("다시 들어올 때 운영자 해제가 반영된다 (join을 다시 보낸다)", () => {
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    core.join(conn("op"), ticket("op", true), 0);
    u.out.length = 0;
    core.join(conn("op2"), ticket("op"), 10);
    const again = events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(again).toBeTruthy();
    expect(again?.staff).toBeUndefined();
  });

  it("운영자 전용 꾸미기·몸은 운영자 연결만 (토큰·착용 증서 모두, 아니면 빼고 후드 유령)", async () => {
    // 입장 토큰: 서명이 맞아도 staff가 없으면 운영자 전용은 뺀다
    const look = ["hat_beret", "staff_armband", "staff_souls"];
    const tu = await signJoinToken(SECRET, { visitorId: "u", name: "유저", color: AVATAR_COLORS[0], channel: 1, look, body: "reaper" });
    const to = await signJoinToken(SECRET, { visitorId: "op", name: "운영", color: AVATAR_COLORS[0], channel: 1, look, body: "reaper", staff: true });
    const au = await admit(SECRET, tu, 1, undefined);
    const ao = await admit(SECRET, to, 1, undefined);
    expect(au?.look).toEqual(["hat_beret"]);
    expect(au?.body).toBe("hood");
    expect(ao?.look).toEqual(look);
    expect(ao?.body).toBe("reaper");
    // 착용 증서: 연결의 staff로 거른다 (프리미엄 외형은 누구나)
    const core = setup();
    const u = conn("u");
    const op = conn("op");
    core.join(u, ticket("u"), 0);
    core.join(op, ticket("op", true), 0);
    core.applyGrant(u, { kind: "look", visitorId: "u", look, exp: 9e9, body: "reaper" });
    core.applyGrant(op, { kind: "look", visitorId: "op", look, exp: 9e9, body: "reaper" });
    expect(u.att?.look).toEqual(["hat_beret"]);
    expect(u.att?.body).toBe("hood");
    expect(op.att?.look).toEqual(look);
    expect(op.att?.body).toBe("reaper");
    core.applyGrant(u, { kind: "look", visitorId: "u", look: [], exp: 9e9, body: "king" });
    expect(u.att?.body).toBe("king");
  });
});

describe("도감 100% 배지 (입장 토큰의 dex)", () => {
  it("서명 안의 dex만 입장 정보가 되고 다른 사람의 join·welcome·저장 형태에 실린다. 이상한 값은 버린다", async () => {
    const t1 = await signJoinToken(SECRET, { visitorId: "fan", name: "도감", color: AVATAR_COLORS[0], channel: 1, look: [], dex: 5 });
    expect((await admit(SECRET, t1, 1, undefined))?.dex).toBe(5);
    const t2 = await signJoinToken(SECRET, { visitorId: "odd", name: "이상", color: AVATAR_COLORS[0], channel: 1, look: [], dex: 999 });
    expect((await admit(SECRET, t2, 1, undefined))?.dex).toBeUndefined();
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    const fan = conn("fan");
    core.join(fan, { ...ticket("fan"), dex: 5 }, 0);
    const joined = events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(joined?.dex).toBe(5);
    expect(fan.att?.dex).toBe(5);
    const late = conn("late");
    core.join(late, ticket("late"), 0);
    const welcome = events(late).find((e) => e.t === "welcome") as { peers: PeerInfo[] } | undefined;
    expect(welcome?.peers.find((p) => p.name === "fan")?.dex).toBe(5);
    expect(welcome?.peers.find((p) => p.name === "u")?.dex).toBeUndefined();
    // 다시 들어올 때 배지가 늘면 join을 다시 보낸다
    u.out.length = 0;
    core.join(conn("fan2"), { ...ticket("fan"), dex: 7 }, 10);
    expect((events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined)?.dex).toBe(7);
  });
});

describe("주간 랭킹 1위 (입장 토큰·착용 증서의 champ)", () => {
  it("서명 안의 champ만 입장 정보가 되고 다른 사람 화면(join·welcome)에 실린다. 착용 증서로 켜고 끄면 look 방송에 함께", async () => {
    const t1 = await signJoinToken(SECRET, { visitorId: "king", name: "왕", color: AVATAR_COLORS[0], channel: 1, look: ["champ_crown"], champ: 1 });
    const a1 = await admit(SECRET, t1, 1, undefined);
    expect(a1?.champ).toBe(1);
    // 1위 전용 꾸미기는 운영자 전용이 아니라 그대로 입는다
    expect(a1?.look).toEqual(["champ_crown"]);
    const t2 = await signJoinToken(SECRET, { visitorId: "odd", name: "이상", color: AVATAR_COLORS[0], channel: 1, look: [], champ: 64 });
    expect((await admit(SECRET, t2, 1, undefined))?.champ).toBeUndefined();
    const core = setup();
    const u = conn("u");
    core.join(u, ticket("u"), 0);
    const king = conn("king");
    core.join(king, { ...ticket("king"), champ: 5 }, 0);
    expect((events(u).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined)?.champ).toBe(5);
    const late = conn("late");
    core.join(late, ticket("late"), 0);
    const welcome = events(late).find((e) => e.t === "welcome") as { peers: PeerInfo[] } | undefined;
    expect(welcome?.peers.find((p) => p.name === "king")?.champ).toBe(5);
    // 오라 끄기 (1위 비트 + 오라 끔 표시)
    u.out.length = 0;
    core.applyGrant(king, { kind: "look", visitorId: "king", look: [], exp: 9e9, champ: 5 | 8 });
    expect(events(u).find((e) => e.t === "look")).toMatchObject({ t: "look", champ: 13 });
    expect(king.att?.champ).toBe(13);
    // 1위가 끝남 (0) → 지운다
    u.out.length = 0;
    core.applyGrant(king, { kind: "look", visitorId: "king", look: [], exp: 9e9, champ: 0 });
    expect(events(u).find((e) => e.t === "look")).toMatchObject({ t: "look", champ: 0 });
    expect(king.att?.champ).toBeUndefined();
    // 옛 웹 증서(champ 없음)는 그대로 둔다
    core.applyGrant(king, { kind: "look", visitorId: "king", look: [], exp: 9e9, champ: 2 });
    u.out.length = 0;
    core.applyGrant(king, { kind: "look", visitorId: "king", look: [], exp: 9e9 });
    expect(events(u).find((e) => e.t === "look")).not.toHaveProperty("champ");
    expect(king.att?.champ).toBe(2);
  });
});
