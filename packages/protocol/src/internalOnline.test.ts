import { describe, expect, it } from "vitest";
import { INTERNAL_TTL_SEC, signInternal, verifyInternal } from "./internal";

// 11/17 /internal/online (관리자 선물 「지금 접속 중인 사람 모두」): 서명·만료 확인

const S = "secret";

describe("/internal/online 서명", () => {
  it("맞는 서명이면 받고, 다른 비밀·고친 본문·지난 요청은 거절", async () => {
    const now = 1_800_000_000;
    const ok = await signInternal(S, { op: "online", exp: now + 20 });
    expect(await verifyInternal(S, ok.body, ok.sig, now)).toEqual({ op: "online", exp: now + 20 });
    expect(await verifyInternal("other", ok.body, ok.sig, now)).toBeNull();
    expect(await verifyInternal(S, ok.body.replace("online", "onlinf"), ok.sig, now)).toBeNull();
    expect(await verifyInternal(S, ok.body, null, now)).toBeNull();
    expect(await verifyInternal(S, ok.body, ok.sig, now + 21)).toBeNull();
    const far = await signInternal(S, { op: "online", exp: now + INTERNAL_TTL_SEC * 3 });
    expect(await verifyInternal(S, far.body, far.sig, now)).toBeNull();
  });
});
