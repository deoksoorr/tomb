import { describe, expect, it } from "vitest";
import { CLOSE } from "./constants";
import { WHERE_MAX_IDS } from "./friends";
import { MEGA_PIN_MAX, parseHomesMsg } from "./events";
import { INTERNAL_KICK_MAX, INTERNAL_SAY_MAX, signInternal, verifyInternal } from "./internal";

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
    // 11/15 마을 공지 방송 (replaces는 있을 때만)
    const say = await signInternal(S, { op: "say", id: "urg-t1-a1", name: "공지", text: "긴급 의뢰(생선 15마리)는 아무도 오지 않은 채 끝났어요.", at: 123, replaces: "urg-t1-a0", exp: now + 20 });
    expect(await verifyInternal(S, say.body, say.sig, now)).toEqual({ op: "say", id: "urg-t1-a1", name: "공지", text: "긴급 의뢰(생선 15마리)는 아무도 오지 않은 채 끝났어요.", at: 123, replaces: "urg-t1-a0", exp: now + 20 });
    const say2 = await signInternal(S, { op: "say", id: "abc", name: "공지", text: "한 줄", at: 1, exp: now + 20 });
    expect(await verifyInternal(S, say2.body, say2.sig, now)).toEqual({ op: "say", id: "abc", name: "공지", text: "한 줄", at: 1, exp: now + 20 });
    // 11/17 고정 공지 (쓰기·지우기, 모든 채널은 ch 0). 200자까지
    const pin = await signInternal(S, { op: "pin", scope: "channel", ch: 3, pin: { text: "가".repeat(MEGA_PIN_MAX), name: "운영자", at: 9 }, exp: now + 20 });
    expect(await verifyInternal(S, pin.body, pin.sig, now)).toEqual({ op: "pin", scope: "channel", ch: 3, pin: { text: "가".repeat(MEGA_PIN_MAX), name: "운영자", at: 9 }, exp: now + 20 });
    const unpin = await signInternal(S, { op: "pin", scope: "all", ch: 0, pin: null, exp: now + 20 });
    expect(await verifyInternal(S, unpin.body, unpin.sig, now)).toEqual({ op: "pin", scope: "all", ch: 0, pin: null, exp: now + 20 });
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
      { op: "say", id: "a b", name: "공지", text: "x", at: 1, exp: now + 5 },
      { op: "say", id: "a", name: "", text: "x", at: 1, exp: now + 5 },
      { op: "say", id: "a", name: "공지", text: "", at: 1, exp: now + 5 },
      { op: "say", id: "a", name: "공지", text: "가".repeat(INTERNAL_SAY_MAX + 1), at: 1, exp: now + 5 },
      { op: "say", id: "a", name: "공지", text: "x", at: 0, exp: now + 5 },
      { op: "say", id: "a", name: "공지", text: "x", at: 1, replaces: "a b", exp: now + 5 },
      { op: "pin", scope: "nope", ch: 1, pin: null, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 0, pin: null, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 1.5, pin: null, exp: now + 5 },
      { op: "pin", scope: "all", ch: 3, pin: null, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 1, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 1, pin: { text: "", name: "운영", at: 1 }, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 1, pin: { text: "가".repeat(MEGA_PIN_MAX + 1), name: "운영", at: 1 }, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 1, pin: { text: "x", name: "운영", at: 0 }, exp: now + 5 },
      { op: "pin", scope: "channel", ch: 1, pin: { text: "x", at: 1 }, exp: now + 5 },
      { op: "zap", exp: now + 5 },
    ];
    for (const b of bad) {
      const { body, sig } = await signInternal(S, b as never);
      expect(await verifyInternal(S, body, sig, now)).toBeNull();
    }
  });
});

describe("11/26 집 목록 바뀜 알림 (/internal/homes)", () => {
  it("채널·구역·v가 맞으면 받고, 틀리면 버린다", async () => {
    const ok = await signInternal(S, { op: "homes", ch: 3, zone: "camp", v: 1_795_000_000_000, exp: now + 20 });
    expect(await verifyInternal(S, ok.body, ok.sig, now)).toEqual({ op: "homes", ch: 3, zone: "camp", v: 1_795_000_000_000, exp: now + 20 });
    for (const zone of ["village", "sea"] as const) {
      const z = await signInternal(S, { op: "homes", ch: 1, zone, v: 5, exp: now + 20 });
      expect(await verifyInternal(S, z.body, z.sig, now)).toMatchObject({ op: "homes", zone });
    }
    for (const bad of [
      { op: "homes", ch: 0, zone: "camp", v: 5, exp: now + 20 },
      { op: "homes", ch: 1.5, zone: "camp", v: 5, exp: now + 20 },
      { op: "homes", ch: 1, zone: "moon", v: 5, exp: now + 20 },
      { op: "homes", ch: 1, zone: "camp", v: 0, exp: now + 20 },
      { op: "homes", ch: 1, zone: "camp", exp: now + 20 },
    ]) {
      const s = await signInternal(S, bad as never);
      expect(await verifyInternal(S, s.body, s.sig, now)).toBeNull();
    }
  });
  it("받은 homes 이벤트 검증", () => {
    expect(parseHomesMsg({ t: "homes", zone: "camp", v: 7, extra: 1 })).toEqual({ t: "homes", zone: "camp", v: 7 });
    expect(parseHomesMsg({ t: "homes", zone: "x", v: 7 })).toBeNull();
    expect(parseHomesMsg({ t: "homes", zone: "sea", v: "7" })).toBeNull();
  });
});
