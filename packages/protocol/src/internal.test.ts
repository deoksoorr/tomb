import { describe, expect, it } from "vitest";
import { CLOSE } from "./constants";
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
      { op: "zap", exp: now + 5 },
    ];
    for (const b of bad) {
      const { body, sig } = await signInternal(S, b as never);
      expect(await verifyInternal(S, body, sig, now)).toBeNull();
    }
  });
});
