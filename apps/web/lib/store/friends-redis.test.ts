import { nanoid } from "nanoid";
import { FRIEND_MAX } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getFriends } from "./index";
import { RedisFriends } from "./friends";

// 친구 Lua 계약: 실제 Redis(일회용 DB)에서만 (메모리 쪽은 app/api/friends.test.ts)
const conn = env.redis();

describe.skipIf(!conn)("친구 저장소 (실제 Redis)", () => {
  const store = getFriends();
  const id = () => `t-${nanoid(10)}`;

  it("신청 → 중복 → 수락 → 삭제, 서로 신청하면 바로 친구", async () => {
    expect(store).toBeInstanceOf(RedisFriends);
    const now = Date.now();
    const [a, b, c] = [id(), id(), id()];
    expect(await store.request(a, b, now)).toBe("sent");
    expect(await store.request(a, b, now)).toBe("pending");
    expect((await store.lists(b, now)).incoming.map((l) => l.id)).toEqual([a]);
    expect(await store.accept(b, a, now)).toBe("ok");
    expect(await store.isFriend(a, b)).toBe(true);
    expect(await store.request(b, a, now)).toBe("already");
    expect((await store.lists(a, now)).outgoing).toEqual([]);
    expect(await store.remove(b, a)).toBe(true);
    expect(await store.isFriend(a, b)).toBe(false);
    expect(await store.request(a, c, now)).toBe("sent");
    expect(await store.request(c, a, now)).toBe("accepted");
    expect(await store.reject(c, a)).toBe(false);
    expect(await store.names([a, "없는계정"])).toEqual([null, null]);
  });

  it(`친구 ${FRIEND_MAX}명 상한 · 오래된 신청은 사라진다`, async () => {
    const now = Date.now();
    const a = id();
    for (let i = 0; i < FRIEND_MAX; i++) {
      const o = id();
      await store.request(o, a, now);
      expect(await store.accept(a, o, now)).toBe("ok");
    }
    expect(await store.request(a, id(), now)).toBe("full");
    expect(await store.request(id(), a, now)).toBe("their_full");
    const [x, y] = [id(), id()];
    expect(await store.request(x, y, now - 15 * 86_400_000)).toBe("sent");
    expect((await store.lists(y, now)).incoming).toEqual([]);
    expect(await store.accept(y, x, now)).toBe("none");
  });
});
