import { AVATAR_COLORS, encodeEvent, signJoinToken, type C2S, type Grant, type PeerInfo, type S2C } from "@tomb/protocol";
import { describe, expect, it, vi } from "vitest";
import { admit, admitRoom } from "./auth";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 11/22 새싹 표시: 입장 토큰의 남은 분(nb, Vercel 서명) → Worker가 끝나는 시각으로 바꿔 접속자 정보·welcome에 싣고,
// 채팅 줄은 쓴 순간 아직 새싹이면 nb 표시 (지난 대화 기록에도 그대로)

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
const send = (m: C2S) => encodeEvent(m);
const ticket = (id: string, nb?: number) => ({ visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...(nb ? { nb } : {}) });

describe("11/22 새싹 표시", () => {
  it("토큰의 남은 분 → 입장 정보의 끝나는 시각 (지금 + 남은 분). 채널·방 모두, 운영자·매니저 토큰이면 버린다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    try {
      const t = await signJoinToken(SECRET, { visitorId: "n", name: "새싹이", color: AVATAR_COLORS[0], channel: 1, look: [], nb: 30 });
      expect((await admit(SECRET, t, 1, undefined))?.nb).toBe(1_000_000 + 30 * 60_000);
      const room = "hunt:forest:hell";
      const tr = await signJoinToken(SECRET, { visitorId: "n", name: "새싹이", color: AVATAR_COLORS[0], channel: 0, room, look: [], nb: 180 });
      expect((await admitRoom(SECRET, tr, room, undefined))?.nb).toBe(1_000_000 + 180 * 60_000);
      // 운영자·매니저는 새싹이 아니다 (웹이 실수로 넣어도)
      const ts = await signJoinToken(SECRET, { visitorId: "s", name: "운영", color: AVATAR_COLORS[0], channel: 1, look: [], staff: true, nb: 30 });
      expect((await admit(SECRET, ts, 1, undefined))?.nb).toBeUndefined();
      const tm = await signJoinToken(SECRET, { visitorId: "m", name: "반장", color: AVATAR_COLORS[0], channel: 1, look: [], mgr: true, nb: 30 });
      expect((await admit(SECRET, tm, 1, undefined))?.nb).toBeUndefined();
      // 범위 밖 값(0·181·소수)은 버린다
      for (const bad of [0, 181, 1.5, -3]) {
        const tb = await signJoinToken(SECRET, { visitorId: "b", name: "비", color: AVATAR_COLORS[0], channel: 1, look: [], nb: bad });
        expect((await admit(SECRET, tb, 1, undefined))?.nb).toBeUndefined();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("다른 사람에게 가는 join·welcome 접속자 정보와 내 welcome에 끝나는 시각이 실리고 저장 형태에도 남는다", () => {
    const core = setup();
    const v = conn("v");
    core.join(v, ticket("v"), 0);
    const n = conn("n");
    core.join(n, ticket("n", 60_000), 0);
    const joined = events(v).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(joined?.nb).toBe(60_000);
    expect((events(n).find((e) => e.t === "welcome") as { nb?: number } | undefined)?.nb).toBe(60_000);
    expect((events(v).find((e) => e.t === "welcome") as { nb?: number } | undefined)?.nb).toBeUndefined();
    const late = conn("late");
    core.join(late, ticket("late"), 0);
    const welcome = events(late).find((e) => e.t === "welcome") as { peers: PeerInfo[] } | undefined;
    expect(welcome?.peers.find((p) => p.name === "n")?.nb).toBe(60_000);
    expect(welcome?.peers.find((p) => p.name === "v")?.nb).toBeUndefined();
    expect(n.att?.nb).toBe(60_000);
    expect(v.att?.nb).toBeUndefined();
  });

  it("채팅 줄: 쓴 순간 아직 새싹이면 nb (방송·지난 대화 기록 모두), 끝나는 시각이 지난 뒤 쓴 줄엔 없다", () => {
    const core = setup();
    const v = conn("v");
    const n = conn("n");
    core.join(v, ticket("v"), 0);
    core.join(n, ticket("n", 60_000), 0);
    v.out.length = 0;
    core.message(n, send({ t: "chat", text: "안녕하세요 처음 왔어요" }), 1_000);
    expect(events(v).find((e) => e.t === "chat")).toMatchObject({ t: "chat", text: "안녕하세요 처음 왔어요", nb: true });
    v.out.length = 0;
    // 3시간이 찼다 (끝나는 시각 지남) → 새 줄엔 표시가 없다
    core.message(n, send({ t: "chat", text: "이제 익숙해요" }), 61_000);
    const after = events(v).find((e) => e.t === "chat") as Record<string, unknown> | undefined;
    expect(after?.text).toBe("이제 익숙해요");
    expect(after?.nb).toBeUndefined();
    // 늦게 온 사람의 지난 대화: 쓴 때 그대로
    const late = conn("late");
    core.join(late, ticket("late"), 62_000);
    const log = events(late).find((e) => e.t === "chatLog") as { lines: { text: string; nb?: true }[] } | undefined;
    expect(log?.lines.find((l) => l.text === "안녕하세요 처음 왔어요")?.nb).toBe(true);
    expect(log?.lines.find((l) => l.text === "이제 익숙해요")?.nb).toBeUndefined();
  });

  it("다시 붙을 때 끝나는 시각이 1분 넘게 바뀌거나 새싹이 끝났으면 다른 사람에게 join을 다시 보낸다 (몇 초 흔들림은 그대로)", () => {
    const core = setup();
    const v = conn("v");
    core.join(v, ticket("v"), 0);
    core.join(conn("n1"), ticket("n", 600_000), 0);
    v.out.length = 0;
    core.join(conn("n2"), ticket("n", 605_000), 1_000);
    expect(events(v).some((e) => e.t === "join")).toBe(false);
    core.join(conn("n3"), ticket("n"), 2_000);
    const again = events(v).find((e) => e.t === "join") as (PeerInfo & { t: "join" }) | undefined;
    expect(again?.name).toBe("n");
    expect(again?.nb).toBeUndefined();
  });
});
