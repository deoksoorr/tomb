import { MEGAPHONE_MAX, signInternal, verifyInternal } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { sayRelay } from "./logic";

// 11/26 운영자 외치기: 웹이 /internal/say로 보내는 줄(id ops-…, 이름 「운영자」, 확성기 60자)을 실시간 서버가 그대로 받고,
// 옛 화면도 그리는 확성기 방송(scope all · staff · system)으로 바꾸는지. 실시간 서버 코드는 바꾸지 않았다 (마을 공지와 같은 길)

const SECRET = "test-secret";

describe("운영자 외치기 → /internal/say", () => {
  it("서명 확인을 통과한다 (ops- id · 운영자 이름 · 60자)", async () => {
    const text = "가나다라마바사아자차".repeat(MEGAPHONE_MAX / 10);
    const req = { op: "say" as const, id: "ops-AbC_12-xyz", name: "운영자", text, at: 1_700_000_000_000, exp: Math.floor(Date.now() / 1000) + 30 };
    const { body, sig } = await signInternal(SECRET, req);
    expect(await verifyInternal(SECRET, body, sig)).toEqual(req);
  });

  it("확성기 방송 모양으로: 모든 채널·운영자·시스템 줄, 바꿔 끼우기 없음, 같은 id는 채널마다 한 번(nonce s:)", () => {
    const r = sayRelay({ id: "ops-abc", name: "운영자", text: "잠시 뒤 점검해요", at: 5_000 });
    expect(r.nonce).toBe("s:ops-abc");
    expect(JSON.parse(r.data)).toEqual({ t: "megaphone", id: "ops-abc", name: "운영자", text: "잠시 뒤 점검해요", scope: "all", ch: 0, at: 5_000, staff: true, system: true });
  });
});
