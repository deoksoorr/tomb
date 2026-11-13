import { describe, expect, it } from "vitest";
import { CLOSE } from "./constants";
import { WHERE_MAX_IDS } from "./friends";
import { INTERNAL_KICK_MAX, signInternal, verifyInternal } from "./internal";

// 47번 서버 간 내부 요청 서명
const S = "secret-a";
const now = 1_800_000_000;

describe("내부 요청 서명", () => {
  it("서명·만료가 맞으면 그대로 돌려준다", async () => {
    const { body, sig } = await signInternal(S, { op: "kick", visitorIds: ["abc_DEF-1"], code: CLOSE.BANNED, exp: now + 20 });
    expect(await verifyInternal(S, body, sig, now)).toEqual({ op: "kick", visitorIds: ["abc_DEF-1"], code: 4012, exp: now + 20 });
    const peer = await signInternal(S, { op: "peer", room: "village", sid: 3, exp: now + 20 });
    expect(await verifyInternal(S, peer.body, peer.sig, now)).toEqual({ op: "peer", room: "village", sid: 3, exp: now + 20 });
    const me = await signInternal(S, { op: "me", visitorIds: ["abc_DEF-1"], exp: now + 20 });
    expect(await verifyInternal(S, me.body, me.sig, now)).toEqual({ op: "me", visitorIds: ["abc_DEF-1"], exp: now + 20 });
    // 친구 위치 조회 (fresh는 true일 때만 남는다)
    const where = await signInternal(S, { op: "where", visitorIds: ["abc_DEF-1", "x"], fresh: true, exp: now + 20 });
    expect(await verifyInternal(S, where.body, where.sig, now)).toEqual({ op: "where", visitorIds: ["abc_DEF-1", "x"], fresh: true, exp: now + 20 });
    const hello = await signInternal(S, { op: "hello", visitorId: "me_1", name: "가람", key: "abcdEFGH_-123456", friends: ["f1", "f2"], exp: now + 20 });
    expect(await verifyInternal(S, hello.body, hello.sig, now)).toEqual({ op: "hello", visitorId: "me_1", name: "가람", key: "abcdEFGH_-123456", friends: ["f1", "f2"], exp: now + 20 });
    const plain = await signInternal(S, { op: "where", visitorIds: ["x"], exp: now + 20 });
    expect(await verifyInternal(S, plain.body, plain.sig, now)).toEqual({ op: "where", visitorIds: ["x"], exp: now + 20 });
  });

  it("다른 키·바뀐 본문·만료·너무 먼 만료는 거절", async () => {
    const { body, sig } = await signInternal(S, { op: "kick", visitorIds: ["a"], code: 4011, exp: now + 20 });
    expect(await verifyInternal("secret-b", body, sig, now)).toBeNull();
    expect(await verifyInternal(S, body.replace('"a"', '"b"'), sig, now)).toBeNull();
    expect(await verifyInternal(S, body, sig, now + 21)).toBeNull();
    expect(await verifyInternal(undefined, body, sig, now)).toBeNull();
    expect(await verifyInternal(S, body, null, now)).toBeNull();
    const far = await signInternal(S, { op: "kick", visitorIds: ["a"], code: 4011, exp: now + 3600 });
    expect(await verifyInternal(S, far.body, far.sig, now)).toBeNull();
  });

  it("모양이 틀린 요청은 서명이 맞아도 거절", async () => {
    const bad = [
      { op: "kick", visitorIds: [], code: 4011, exp: now + 5 },
      { op: "kick", visitorIds: Array.from({ length: INTERNAL_KICK_MAX + 1 }, (_, i) => `v${i}`), code: 4011, exp: now + 5 },
      { op: "kick", visitorIds: ["a b"], code: 4011, exp: now + 5 },
      { op: "kick", visitorIds: ["a"], code: 1000, exp: now + 5 },
      { op: "peer", sid: 1, exp: now + 5 },
      { op: "peer", ch: 1, room: "village", sid: 1, exp: now + 5 },
      { op: "peer", room: "아무 방", sid: 1, exp: now + 5 },
      { op: "me", visitorIds: [], exp: now + 5 },
      { op: "me", visitorIds: ["a b"], exp: now + 5 },
      { op: "where", visitorIds: [], exp: now + 5 },
      { op: "hello", visitorId: "a", name: "", key: "abcdEFGH_-123456", friends: [], exp: now + 5 },
      { op: "hello", visitorId: "a", name: "가람", key: "짧음", friends: [], exp: now + 5 },
      { op: "hello", visitorId: "a", name: "가람", key: "abcdEFGH_-123456", friends: ["a b"], exp: now + 5 },
      { op: "where", visitorIds: Array.from({ length: WHERE_MAX_IDS + 1 }, (_, i) => `v${i}`), exp: now + 5 },
      { op: "where", visitorIds: ["a b"], exp: now + 5 },
      { op: "zap", exp: now + 5 },
    ];
    for (const b of bad) {
      const { body, sig } = await signInternal(S, b as never);
      expect(await verifyInternal(S, body, sig, now)).toBeNull();
    }
  });
});
