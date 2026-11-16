import { AVATAR_COLORS, encodeEvent, type C2S, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost } from "./channel";

// 11/17 사냥터 채팅: 사냥 중(월드 채널 away + 장소 hunt)에도 채널 채팅을 쓴다. 줄에는 m: "hunt" ([사냥터])가 붙고,
// 집·상점 같은 다른 실내에서 친 채팅은 예전처럼 버린다. 도배 제한·가리기는 그대로

type Conn = { id: string; out: (string | ArrayBuffer)[] };

function setup(room = false) {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
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
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000, room, ...(room ? { hunt: true } : {}) }, host);
  const join = (id: string, o: { map?: "camp" } = {}) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: room ? 0 : 1, look: [], body: "hood", ...(o.map === "camp" ? { camp: true as const, map: "camp" as const } : {}) }, 0);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const chats = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "chat" }> => e.t === "chat");
const chatLogs = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "chatLog" }> => e.t === "chatLog");
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (m: C2S) => encodeEvent(m);

describe("사냥터 채팅 (11/17)", () => {
  it("사냥 중인 사람의 채팅이 채널 전체(마을·캠핑장)로 [사냥터] 표시와 함께 가고, 사냥 중인 사람도 마을 채팅을 받는다", () => {
    const { core, join } = setup();
    const v = join("v");
    const c = join("c", { map: "camp" });
    const h = join("h");
    core.message(h, send({ t: "away", on: true, p: "hunt" }), 0);
    clear(v, c, h);
    core.message(h, send({ t: "chat", text: "보스 잡는 중" }), 1_000);
    expect(chats(v)).toMatchObject([{ t: "chat", text: "보스 잡는 중", name: "h", m: "hunt" }]);
    expect(chats(c)).toMatchObject([{ t: "chat", text: "보스 잡는 중", name: "h", m: "hunt" }]);
    expect(chats(h)).toEqual([]);
    core.message(v, send({ t: "chat", text: "화이팅" }), 2_000);
    expect(chats(h)).toMatchObject([{ t: "chat", text: "화이팅", name: "v" }]);
    expect(chats(h)[0].m).toBeUndefined();
    // 늦게 온 사람도 기록에서 [사냥터] 줄로 받는다
    const late = join("late");
    expect(chatLogs(late)[0].lines).toMatchObject([{ name: "h", text: "보스 잡는 중", m: "hunt" }, { name: "v", text: "화이팅" }]);
  });

  it("사냥터에서 나오면(away off) 다시 마을 줄, 다른 실내(집·상점·미니게임)는 예전처럼 버린다", () => {
    const { core, join } = setup();
    const v = join("v");
    const h = join("h");
    core.message(h, send({ t: "away", on: true, p: "hunt" }), 0);
    core.message(h, send({ t: "away", on: false }), 1_000);
    clear(v);
    core.message(h, send({ t: "chat", text: "돌아왔어요" }), 1_500);
    expect(chats(v)).toMatchObject([{ text: "돌아왔어요" }]);
    expect(chats(v)[0].m).toBeUndefined();
    for (const [i, p] of (["house", "shop", "game"] as const).entries()) {
      core.message(h, send({ t: "away", on: true, p }), 10_000 * (i + 1));
      clear(v);
      core.message(h, send({ t: "chat", text: `실내 ${p}` }), 10_000 * (i + 1) + 1);
      expect(chats(v)).toEqual([]);
      core.message(h, send({ t: "away", on: false }), 10_000 * (i + 1) + 5_000);
    }
    // 장소를 안 보내는 옛 클라이언트의 실내도 버린다
    core.message(h, send({ t: "away", on: true }), 50_000);
    clear(v);
    core.message(h, send({ t: "chat", text: "옛 실내" }), 50_001);
    expect(chats(v)).toEqual([]);
  });

  it("도배 제한·가리기는 그대로", () => {
    const { core, join } = setup();
    const v = join("v");
    const h = join("h");
    core.message(h, send({ t: "away", on: true, p: "hunt" }), 0);
    clear(v);
    for (let i = 0; i < 4; i++) core.message(h, send({ t: "chat", text: `연타 ${i}` }), 1_000);
    expect(chats(v).map((e) => e.text)).toEqual(["연타 0", "연타 1", "연타 2"]);
  });

  it("사냥 중에도 귓속말을 주고받는다", () => {
    const { core, join } = setup();
    const v = join("v");
    const h = join("h");
    core.message(h, send({ t: "away", on: true, p: "hunt" }), 0);
    clear(v, h);
    core.message(h, send({ t: "whisper", to: "v", text: "몰래" }), 1_000);
    expect(events(v).filter((e) => e.t === "whisper")).toMatchObject([{ fromName: "h", toName: "v", text: "몰래" }]);
    clear(v, h);
    core.message(v, send({ t: "whisper", to: "h", text: "답장" }), 2_000);
    expect(events(h).filter((e) => e.t === "whisper")).toMatchObject([{ fromName: "v", toName: "h", text: "답장" }]);
  });

  it("사냥터 방(hunt:…)의 자리 비움은 예전처럼 채팅을 버린다 (방에는 장소가 없다)", () => {
    const { core, join } = setup(true);
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "away", on: true, p: "hunt" }), 0);
    clear(a, b);
    core.message(a, send({ t: "chat", text: "방" }), 1_000);
    expect(chats(b)).toEqual([]);
  });
});
