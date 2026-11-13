import { afterEach, describe, expect, it, vi } from "vitest";
import type { FriendPresenceResponse } from "../friendTypes";
import { friendsInChannel, friendsStore, lastSeenText, presenceChanges } from "./useFriends";

// 친구 접속 알림(누가 새로 들어왔나)과 지금 채널의 친구 (이름표·미니맵 하트)

type F = FriendPresenceResponse["friends"];
const f = (key: string, where: F[number]["where"]): F[number] => ({ key, name: key.toUpperCase(), where });

describe("친구 접속·퇴장 알림", () => {
  it("접속 안 함 → 접속한 친구만. 처음 받은 목록·모르던 때(unknown)는 알리지 않는다", () => {
    const before: F = [f("a", { at: "offline" }), f("b", { at: "unknown" }), f("c", { at: "world", ch: 1, sid: 3, x: 0, y: 0 }), f("d", { at: "offline" })];
    const after: F = [
      f("a", { at: "world", ch: 2, sid: 1, x: 0, y: 0 }),
      f("b", { at: "world", ch: 1, sid: 2, x: 0, y: 0 }),
      f("c", { at: "away", ch: 1, sid: 3, place: "house" }),
      f("d", { at: "away", ch: 3, sid: 9, place: null }),
      f("e", { at: "world", ch: 1, sid: 5, x: 0, y: 0 }),
    ];
    expect(presenceChanges(null, after)).toEqual({ came: [], left: [] });
    expect(presenceChanges(before, after)).toEqual({ came: ["A", "D"], left: [] });
    // 나감: 접속 중 → 접속 안 함 (모르게 된 것은 나간 것으로 보지 않는다)
    const later: F = [f("a", { at: "offline" }), f("b", { at: "offline" }), f("c", { at: "unknown" }), f("d", { at: "away", ch: 3, sid: 9, place: null })];
    expect(presenceChanges(after, later)).toEqual({ came: [], left: ["A", "B"] });
  });

  it("지금 채널의 친구만 sid·이름으로 (실내에 있어도 그 채널이면 포함, 채널을 모르면 없음)", () => {
    const list: F = [f("a", { at: "world", ch: 2, sid: 1, x: 0, y: 0 }), f("b", { at: "away", ch: 2, sid: 4, place: "shop" }), f("c", { at: "world", ch: 3, sid: 1, x: 0, y: 0 }), f("d", { at: "offline" })];
    expect(friendsInChannel(list, 2)).toEqual([
      { sid: 1, name: "A" },
      { sid: 4, name: "B" },
    ]);
    expect(friendsInChannel(list, null)).toEqual([]);
  });
});

describe("마지막 접속 표시", () => {
  it("한국 시간 연-월-일 시:분 + 상대 시간, 없으면 기록 없음", () => {
    const at = Date.UTC(2026, 10, 13, 12, 40); // KST 21:40
    expect(lastSeenText(at, at + 20_000)).toBe("2026-11-13 21:40 · 방금 전");
    expect(lastSeenText(at, at + 5 * 60_000)).toBe("2026-11-13 21:40 · 5분 전");
    expect(lastSeenText(at, at + 3 * 3_600_000)).toBe("2026-11-13 21:40 · 3시간 전");
    expect(lastSeenText(at, at + 3 * 86_400_000 + 1)).toBe("2026-11-13 21:40 · 3일 전");
    expect(lastSeenText(null, at)).toBe("기록 없음");
  });
});

describe("받은 친구 신청 새로 받기", () => {
  afterEach(() => vi.restoreAllMocks());

  it("받는 도중에 신청 알림(me:stale)이 오면, 끝난 뒤 한 번 더 받아 새 신청을 놓치지 않는다 (여러 번 와도 한 번)", async () => {
    let incoming = 0;
    const resolvers: (() => void)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      // 요청이 시작될 때의 값을 응답한다 (서버가 그 순간 본 값)
      const seen = incoming;
      return new Promise<Response>((res) => resolvers.push(() => res(Response.json({ friends: [], incoming: seen }))));
    });
    const first = friendsStore.refresh();
    // 주기 조회가 서버에 간 뒤 친구 신청이 저장되고, 알림이 와서 또 부른다 (두 번)
    incoming = 1;
    const second = friendsStore.refresh();
    const third = friendsStore.refresh();
    expect(resolvers).toHaveLength(1);
    resolvers[0]();
    await first;
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]();
    expect((await second)?.incoming).toBe(1);
    expect((await third)?.incoming).toBe(1);
    expect(friendsStore.getSnapshot().incoming).toBe(1);
    expect(resolvers).toHaveLength(2);
  });
});
