import { AVATAR_COLORS, SQUIRREL_RAIN_COOLDOWN_MS, encodeEvent, type C2S, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket } from "./channel";

// 11/16 이스터에그 「다람쥐를 뿌려라」: 중계된 채팅 줄이 주문이면 채널 전체(모든 맵·실내, 보낸 사람 포함)에 squirrels. 채널마다 10분에 한 번.

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
    random: () => 0.5,
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000, room }, host);
  const join = (id: string, o: { map?: "camp" | "sea" } = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = {
      visitorId: id,
      name: id,
      color: AVATAR_COLORS[0],
      channel: 1,
      look: [],
      body: "hood",
      ...(o.map === "camp" ? { camp: true as const, map: "camp" as const } : {}),
      ...(o.map === "sea" ? { sea: true as const, map: "sea" as const } : {}),
    };
    core.join(c, t, 0);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const rains = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "squirrels" }> => e.t === "squirrels");
const chats = (c: Conn) => events(c).filter((e) => e.t === "chat");
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (m: C2S) => encodeEvent(m);
const chat = (text: string) => send({ t: "chat", text });
const SPELL = "다람쥐를 뿌려라!!";

describe("다람쥐를 뿌려라", () => {
  it("채널 전체(마을·캠핑장·바닷가·실내, 보낸 사람 포함)에 간다. 채팅 줄도 그대로 간다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b", { map: "camp" });
    const s = join("s", { map: "sea" });
    const h = join("h");
    core.message(h, send({ t: "away", on: true, p: "house" }), 1_000);
    clear(a, b, s, h);
    core.message(a, chat(SPELL), 5_000);
    for (const c of [a, b, s, h]) expect(rains(c)).toEqual([{ t: "squirrels", by: "a", seed: expect.any(Number), at: 5_000 }]);
    expect(chats(b)).toMatchObject([{ t: "chat", text: SPELL }]);
    expect(chats(a)).toEqual([]); // 내 채팅은 나에게 돌아오지 않는다 (이스터에그만 온다)
  });

  it("채널 쿨다운: 10분 안에 다시 치면 안 쏟아지고 (채팅은 간다), 10분이 지나면 다시", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b", { map: "camp" });
    core.message(a, chat(SPELL), 10_000);
    clear(a, b);
    core.message(b, chat("다람쥐를뿌려라"), 10_000 + SQUIRREL_RAIN_COOLDOWN_MS - 1);
    expect(rains(a)).toEqual([]);
    expect(rains(b)).toEqual([]);
    expect(chats(a)).toHaveLength(1);
    core.message(b, chat("다람쥐를뿌려라"), 10_000 + SQUIRREL_RAIN_COOLDOWN_MS);
    expect(rains(a)).toMatchObject([{ by: "b" }]);
    expect(rains(b)).toHaveLength(1);
  });

  it("채널마다 따로 (다른 채널 쿨다운과 상관없다)", () => {
    const one = setup();
    const two = setup();
    const a = one.join("a");
    const b = two.join("b");
    one.core.message(a, chat(SPELL), 0);
    two.core.message(b, chat(SPELL), 1_000);
    expect(rains(a)).toHaveLength(1);
    expect(rains(b)).toHaveLength(1);
  });

  it("버려진 채팅은 못 부른다: 실내에서(away) 친 줄, 도배 제한에 걸린 줄", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(b, send({ t: "away", on: true }), 0);
    clear(a, b);
    core.message(b, chat(SPELL), 1_000);
    expect(rains(a)).toEqual([]);
    expect(chats(a)).toEqual([]);
    // 토큰 버킷 3개를 다 쓰면 넷째 줄은 버려진다 → 주문이어도 안 된다
    for (let i = 0; i < 3; i++) core.message(a, chat(`안녕 ${i}`), 2_000);
    core.message(a, chat(SPELL), 2_000);
    expect(rains(b)).toEqual([]);
    expect(rains(a)).toEqual([]);
    // 버려진 줄은 쿨다운도 쓰지 않는다
    core.message(a, chat(SPELL), 10_000);
    expect(rains(b)).toHaveLength(1);
  });

  it("귓속말·주문이 아닌 말·집(방) 채팅은 아니다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "whisper", to: "b", text: SPELL }), 1_000);
    core.message(a, chat("다람쥐를 뿌려라고 하면 돼요?"), 3_000);
    expect(rains(a)).toEqual([]);
    expect(rains(b)).toEqual([]);
    const room = setup(true);
    const r1 = room.join("r1");
    const r2 = room.join("r2");
    room.core.message(r1, chat(SPELL), 1_000);
    expect(chats(r2)).toHaveLength(1);
    expect(rains(r2)).toEqual([]);
  });
});
