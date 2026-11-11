import { signGrant } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GoblinClaimResponse } from "@/lib/goblin";
import { STARRY_NIGHT_BONUS, starryNight } from "@/lib/stargaze";
import type { ApiError } from "@/lib/types";
import * as goblin from "./goblin/route";
import * as session from "./session/route";

// 22번 황금 고블린 보상 API: 실시간 서버가 서명한 증서만, 내 것만, 고블린 한 마리당 한 번, 하루 한도 안에서

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

const SECRET = "dev-join-secret-change-me";
let ipSeq = 0;
type Visitor = { cookie: string; ip: string; visitorId: string };
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], ip: `10.22.0.${++ipSeq}`, visitorId: ((await res.json()) as { visitorId: string }).visitorId };
}
const claim = (v: Visitor, grant: string) =>
  goblin.POST(
    new NextRequest("http://localhost/api/goblin", {
      method: "POST",
      headers: { cookie: v.cookie, "x-forwarded-for": v.ip, "content-type": "application/json" },
      body: JSON.stringify({ grant }),
    }),
  );
const exp = () => Math.floor(Date.now() / 1000) + 600;

describe("/api/goblin", () => {
  it("pays the winner once; the same goblin cannot be cashed twice", async () => {
    const v = await newVisitor();
    const grant = await signGrant(SECRET, { kind: "goblin", visitorId: v.visitorId, points: 57, nonce: "gTest00001", exp: exp() });
    const res = await claim(v, grant);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GoblinClaimResponse;
    expect(body).toMatchObject({ earned: 57, points: 57, capped: false });
    const again = await claim(v, grant);
    expect(again.status).toBe(409);
    expect(((await again.json()) as ApiError).error.code).toBe("ALREADY_CLAIMED");
  });

  it("rejects someone else's grant, forged grants and other grant kinds", async () => {
    const a = await newVisitor();
    const b = await newVisitor();
    const forA = await signGrant(SECRET, { kind: "goblin", visitorId: a.visitorId, points: 30, nonce: "gTest00002", exp: exp() });
    expect((await claim(b, forA)).status).toBe(403);
    const forged = await signGrant("wrong-secret", { kind: "goblin", visitorId: b.visitorId, points: 100, nonce: "gTest00003", exp: exp() });
    expect((await claim(b, forged)).status).toBe(400);
    const firework = await signGrant(SECRET, { kind: "firework", visitorId: b.visitorId, item: "fw_small", nonce: "n1", exp: exp() });
    expect((await claim(b, firework)).status).toBe(400);
    // 403으로 거절된 a의 증서는 a가 여전히 받을 수 있다 (nonce를 태우지 않는다)
    expect((await claim(a, forA)).status).toBe(200);
  });

  it("caps at the daily goblin limit (150P)", async () => {
    const v = await newVisitor();
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const g = await signGrant(SECRET, { kind: "goblin", visitorId: v.visitorId, points: 100, nonce: `gCap${i}xx`, exp: exp() });
      total += ((await (await claim(v, g)).json()) as GoblinClaimResponse).earned;
    }
    expect(total).toBe(150);
  });
});

describe("stargazing night bonus", () => {
  it("only real KST night with clear weather counts", () => {
    // KST 정오는 밤이 아니다
    expect(starryNight(Date.UTC(2026, 10, 12, 3, 0, 0))).toBe(false);
    // 밤 시간대 중 맑은 2시간 블록이 하루 몇 번은 있다 (결정적 날씨)
    let found = 0;
    for (let h = 0; h < 24 * 14; h++) if (starryNight(Date.UTC(2026, 10, 1, h, 30, 0))) found++;
    expect(found).toBeGreaterThan(0);
    expect(STARRY_NIGHT_BONUS).toBeGreaterThan(1);
  });
});
