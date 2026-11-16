import { AVATAR_COLORS, CHAT_HISTORY_MS, encodeEvent, type C2S, type Grant, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";

// 11/16 귓속말: 같은 채널(마을·캠핑장) 한 사람에게만. 받는 사람과 보낸 사람만 받고, 기록·말풍선에는 남지 않는다.

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null; closed?: { code: number } };

function setup(room = false) {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: (c, code) => void (c.closed = { code }),
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
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000, room }, host);
  const join = (id: string, o: { name?: string; map?: "camp"; staff?: true; mgr?: true; now?: number } = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = {
      visitorId: id,
      name: o.name ?? id,
      color: AVATAR_COLORS[0],
      channel: 1,
      look: [],
      body: "hood",
      ...(o.map ? { camp: true as const, map: o.map } : {}),
      ...(o.staff ? { staff: true as const } : {}),
      ...(o.mgr ? { mgr: true as const } : {}),
    };
    core.join(c, t, o.now ?? 0);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const whispers = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "whisper" }> => e.t === "whisper");
const fails = (c: Conn) => events(c).filter((e) => e.t === "whisperFail");
const chats = (c: Conn) => events(c).filter((e) => e.t === "chat" || e.t === "chatLog");
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (m: C2S) => encodeEvent(m);
const whisper = (to: string, text: string) => send({ t: "whisper", to, text });

describe("귓속말", () => {
  it("받는 사람과 보낸 사람에게만 가린 글로 간다 (다른 사람은 모른다)", () => {
    const { core, join } = setup();
    const a = join("a", { name: "나무" });
    const b = join("b", { name: "진순" });
    const c = join("c", { name: "구경꾼" });
    clear(a, b, c);
    core.message(a, whisper("진순", "안녕 씨발"), 1_000);
    const line = { t: "whisper", at: 1_000, from: 1, fromName: "나무", to: 2, toName: "진순", text: "안녕 ***" };
    expect(whispers(b)).toMatchObject([line]);
    expect(whispers(a)).toMatchObject([line]);
    expect(whispers(a)[0].id).toBe(whispers(b)[0].id);
    expect(whispers(a)[0].id).toEqual(expect.any(String));
    expect(events(c)).toEqual([]);
    expect(chats(a)).toEqual([]);
  });

  it("마을에서 캠핑장 사람에게도 간다 (같은 채널)", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b", { name: "캠퍼", map: "camp" });
    clear(a, b);
    core.message(a, whisper("캠퍼", "거기 어때요"), 0);
    expect(whispers(b)).toMatchObject([{ fromName: "a", toName: "캠퍼", text: "거기 어때요" }]);
  });

  it("공백 든 이름: 가장 긴 접속자 이름으로 다시 맞춘다 (공백·대소문자는 상관없다)", () => {
    const { core, join } = setup();
    const a = join("a", { name: "보내는 이" });
    const short = join("s", { name: "진" });
    const long = join("l", { name: "진 순" });
    clear(a, short, long);
    // 클라이언트가 "진"까지만 이름으로 잘라 보내도 서버는 "진 순"을 고른다
    core.message(a, whisper("진", "순 안녕 하세요"), 0);
    expect(whispers(long)).toMatchObject([{ toName: "진 순", text: "안녕 하세요" }]);
    expect(whispers(short)).toEqual([]);
    // "진순"(붙여 씀)도 같은 이름
    core.message(a, whisper("진순", "또 왔어요"), 2_000);
    expect(whispers(long)).toHaveLength(2);
    // 남은 글이 "순"뿐이면 "진"에게 간다
    core.message(a, whisper("진", "순"), 4_000);
    expect(whispers(short)).toMatchObject([{ toName: "진", text: "순" }]);
  });

  it("이 채널에 없는 이름이면 보낸 사람에게만 whisperFail(absent)", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, whisper("없는사람", "안녕"), 0);
    expect(fails(a)).toEqual([{ t: "whisperFail", to: "없는사람", why: "absent" }]);
    expect(events(b)).toEqual([]);
  });

  it("재연결 유예 중인 사람은 없는 것으로 본다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.disconnect(b, 1006, 0);
    clear(a);
    core.message(a, whisper("b", "있어요?"), 1_000);
    expect(fails(a)).toEqual([{ t: "whisperFail", to: "b", why: "absent" }]);
  });

  it("나에게 보내면 whisperFail(self)", () => {
    const { core, join } = setup();
    const a = join("a", { name: "나무" });
    clear(a);
    core.message(a, whisper("나무", "혼잣말"), 0);
    expect(fails(a)).toEqual([{ t: "whisperFail", to: "나무", why: "self" }]);
    expect(whispers(a)).toEqual([]);
  });

  it("채팅과 같은 토큰 버킷: 3번까지 몰아 보내고 그 뒤로는 1초에 1번 (채팅과 같이 쓴다)", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    for (const [i, t] of [0, 100, 200, 300, 999, 1_000].entries()) core.message(a, whisper("b", `ㅋ${i}`), t);
    expect(whispers(b).map((w) => w.text)).toEqual(["ㅋ0", "ㅋ1", "ㅋ2", "ㅋ5"]);
    // 채팅으로 토큰을 다 쓰면 귓속말도 막힌다
    core.message(a, send({ t: "chat", text: "하나" }), 3_000);
    core.message(a, send({ t: "chat", text: "둘" }), 3_000);
    core.message(a, whisper("b", "막혀요"), 3_000);
    expect(whispers(b).map((w) => w.text)).not.toContain("막혀요");
    expect(a.closed).toBeUndefined();
  });

  it("60자 넘는 글·공백만은 버린다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, JSON.stringify({ t: "whisper", to: "b", text: "가".repeat(61) }), 0);
    core.message(a, JSON.stringify({ t: "whisper", to: "b", text: "   " }), 0);
    core.message(a, JSON.stringify({ t: "whisper", to: "", text: "안녕" }), 0);
    expect(events(a)).toEqual([]);
    expect(events(b)).toEqual([]);
  });

  it("기록(chatLog)에 남지 않는다: 늦게 온 사람·다시 들어온 사람은 받지 않는다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, whisper("b", "비밀"), 0);
    core.disconnect(b, 1006, 1_000);
    const b2 = join("b", { now: 2_000 });
    const c = join("c", { now: 2_000 });
    expect(chats(b2)).toEqual([]);
    expect(chats(c)).toEqual([]);
    expect(core.chatSnapshot("village", CHAT_HISTORY_MS / 2)).toEqual([]);
  });

  it("딱지: 보낸 사람(staff·mgr)과 받는 사람(toStaff·toMgr)", () => {
    const { core, join } = setup();
    const s = join("s", { staff: true });
    const m = join("m", { mgr: true });
    clear(s, m);
    core.message(s, whisper("m", "수고해요"), 0);
    expect(whispers(m)[0]).toMatchObject({ staff: true, toMgr: true });
    expect(whispers(m)[0].mgr).toBeUndefined();
    expect(whispers(m)[0].toStaff).toBeUndefined();
  });

  it("방(집·사냥터)에서는 받지 않는다", () => {
    const { core, join } = setup(true);
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, whisper("b", "안녕"), 0);
    expect(events(a)).toEqual([]);
    expect(events(b)).toEqual([]);
  });

  it("whoOn: 물어본 이름 중 지금 이 채널(마을·캠핑장)에 있는 사람만 on, 간격 안의 다시 묻기·방은 버린다", () => {
    const { core, join } = setup();
    const a = join("a");
    join("b", { name: "진 순" });
    join("c", { name: "캠퍼", map: "camp" });
    const gone = join("g", { name: "떠난이" });
    core.disconnect(gone, 1006, 0);
    clear(a);
    core.message(a, send({ t: "whoOn", names: ["진순", "캠퍼", "떠난이", "없는이"] }), 1_000);
    expect(events(a).filter((e) => e.t === "whoOn")).toEqual([{ t: "whoOn", on: ["진순", "캠퍼"], off: ["떠난이", "없는이"] }]);
    clear(a);
    core.message(a, send({ t: "whoOn", names: ["진순"] }), 1_500);
    expect(events(a)).toEqual([]);
    const room = setup(true);
    const r = room.join("r");
    clear(r);
    room.core.message(r, send({ t: "whoOn", names: ["r"] }), 0);
    expect(events(r)).toEqual([]);
  });
});
