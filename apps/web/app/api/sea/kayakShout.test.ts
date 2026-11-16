import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SEA_KAYAK_SHOUT_COST, signGrant, verifyGrant } from "@tomb/protocol";
import { env } from "@/lib/env";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import * as session from "../session/route";
import * as shout from "./kayak-shout/route";
import * as refund from "./kayak-shout/refund/route";

// 11/16 r18 카약 「같이 타요」 (메모리 구성): 20P 쓰고 증서 · 계정마다 1분 · 실시간 서버가 거절하면 환불 증서로 한 번만 돌려받기

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS", "SEA_ENABLED"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("VERCEL_ENV", "");
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, visitor: Visitor | null, method = "POST", body?: unknown) {
  const headers: Record<string, string> = {};
  if (visitor) Object.assign(headers, { cookie: visitor.cookie, "x-forwarded-for": visitor.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", null));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.71.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: ((await res.json()) as { visitorId: string }).visitorId,
  };
}
const points = async (v: Visitor) => (await getAccounts().get(v.visitorId, kstDay(), Date.now())).points;

describe("POST /api/sea/kayak-shout", () => {
  it("20P를 쓰고 서명된 증서를 줘요, 1분 안에 다시 부르면 429 (포인트는 그대로)", async () => {
    const v = await newVisitor();
    await getAccounts().earn(v.visitorId, "hunt", kstDay(), { amount: 100 });
    const p0 = await points(v);
    const res = await shout.POST(call("/api/sea/kayak-shout", v, "POST", { kayak: "pK2", channel: 1 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { grant: string; id: string; me: { points: number } };
    expect(body.me.points).toBe(p0 - SEA_KAYAK_SHOUT_COST);
    expect(await verifyGrant(env.joinSecret(), body.grant)).toMatchObject({ kind: "kayakShout", visitorId: v.visitorId, nonce: body.id, kayak: "pK2", ch: 1 });
    const again = await shout.POST(call("/api/sea/kayak-shout", v, "POST", { kayak: "pK2", channel: 1 }));
    expect(again.status).toBe(429);
    expect(await points(v)).toBe(p0 - SEA_KAYAK_SHOUT_COST);
  });

  it("포인트가 모자라면 409, 간격은 풀려요 (바로 다시 시도할 수 있어요)", async () => {
    const v = await newVisitor();
    const p = await points(v);
    if (p > 0) await getAccounts().spend(v.visitorId, p, "test", Date.now());
    expect((await shout.POST(call("/api/sea/kayak-shout", v, "POST", { kayak: "pK1", channel: 1 }))).status).toBe(409);
    expect((await shout.POST(call("/api/sea/kayak-shout", v, "POST", { kayak: "pK1", channel: 1 }))).status).toBe(409);
  });

  it("실시간 서버가 거절한 환불 증서로 20P를 한 번만 돌려받아요 (남의 증서·두 번째는 거절)", async () => {
    const v = await newVisitor();
    const other = await newVisitor();
    await getAccounts().earn(v.visitorId, "hunt", kstDay(), { amount: 100 });
    const res = await shout.POST(call("/api/sea/kayak-shout", v, "POST", { kayak: "pK1", channel: 1 }));
    const { id } = (await res.json()) as { id: string };
    const p1 = await points(v);
    const grant = await signGrant(env.joinSecret(), { kind: "kayakRefund", visitorId: v.visitorId, nonce: id, exp: Math.floor(Date.now() / 1000) + 600 });
    expect((await refund.POST(call("/api/sea/kayak-shout/refund", other, "POST", { refund: grant }))).status).toBe(400);
    expect((await refund.POST(call("/api/sea/kayak-shout/refund", v, "POST", { refund: grant }))).status).toBe(200);
    expect(await points(v)).toBe(p1 + SEA_KAYAK_SHOUT_COST);
    expect((await refund.POST(call("/api/sea/kayak-shout/refund", v, "POST", { refund: grant }))).status).toBe(409);
    // 돌려받으면 간격도 풀려 바로 다시 부를 수 있어요
    expect((await shout.POST(call("/api/sea/kayak-shout", v, "POST", { kayak: "pK1", channel: 1 }))).status).toBe(200);
  });
});
