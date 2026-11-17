import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { getForageStore } from "@/lib/forage/store";
import { SNACK } from "@/lib/sea/gull";
import { throwSnack } from "@/lib/sea/gullService";
import * as gull from "./sea/gull/route";
import * as session from "./session/route";

// 11/17 포구 갈매기 과자 서버 흐름: 사기(하루 10개) · 던지기(과자 하나 · 깃털은 서버가 굴려 가방에)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const req = (v: Visitor, body?: unknown) =>
  new NextRequest("http://localhost/api/sea/gull", {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(points = 1000): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.93.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("11/17 포구 갈매기 과자 — 서버 흐름", () => {
  it("사면 포인트가 줄고 과자가 늘어요 · 11/17 하루 10개를 넘어도 사져요", async () => {
    const v = await newVisitor();
    const before = await pts(v.id);
    for (let i = 0; i < 8; i++) expect((await gull.POST(req(v, { op: "buy", kind: "plain" }))).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await gull.POST(req(v, { op: "buy", kind: "spicy" }))).status).toBe(200);
    expect(before - (await pts(v.id))).toBe(8 * SNACK.plain.price + 4 * SNACK.spicy.price);
    expect(await (await gull.GET(req(v))).json()).toMatchObject({ plain: 8, spicy: 4, bought: 12 });
  });

  it("포인트가 모자라면 과자도 하루 개수도 그대로", async () => {
    const v = await newVisitor(0);
    const r = await gull.POST(req(v, { op: "buy", kind: "spicy" }));
    expect(r.status).toBe(409);
    expect(await code(r)).toBe("NOT_ENOUGH_POINTS");
    expect(await (await gull.GET(req(v))).json()).toMatchObject({ spicy: 0, bought: 0 });
  });

  it("던지면 과자가 하나 줄고, 깃털은 서버가 굴려 가방에 (없으면 NO_SNACK)", async () => {
    const v = await newVisitor();
    const none = await gull.POST(req(v, { op: "throw", kind: "plain" }));
    expect(none.status).toBe(409);
    expect(await code(none)).toBe("NO_SNACK");
    await gull.POST(req(v, { op: "buy", kind: "spicy" }));
    await gull.POST(req(v, { op: "buy", kind: "plain" }));
    const r = await gull.POST(req(v, { op: "throw", kind: "plain" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ plain: 0, spicy: 1, kind: "plain" });
    // 깃털이 떨어지는 경우 (난수 고정) — 매운 과자는 붉은 깃털도
    const red = await throwSnack(v.id, "spicy", Date.now(), undefined, () => 0.01);
    expect(red.feather).toBe("d_redfeather");
    const snap = await getForageStore().snapshot(v.id, kstDay(), 0);
    expect(snap.bag.d_redfeather).toBe(1);
  });
});
