import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import type { VillageResponse } from "@/lib/housing/types";

// 11/26 집 목록 바뀜 알림: 캠핑장 분양·카라반 디자인·앞마당·넓히기(+ 마을·포구 분양·외관·문패)가 끝나면 그 집 채널에 homes 한 줄을
// 실시간 서버로 보낸다 (lib/ban homesNotify — 여기서는 가짜). 마을 목록은 &v=면 서버 메모리 캐시를 건너뛴다

const sent = vi.hoisted(() => [] as { ch: number; zone: string; v: number }[]);
vi.mock("@/lib/ban", async (orig) => ({
  ...(await orig<typeof import("@/lib/ban")>()),
  homesNotify: async (ch: number, zone: string, v: number) => {
    sent.push({ ch, zone, v });
    return 1;
  },
}));

import * as attend from "./me/attend/route";
import * as buy from "./housing/me/buy/route";
import * as mine from "./housing/me/route";
import * as style from "./housing/me/style/route";
import * as upgrade from "./housing/me/upgrade/route";
import * as yard from "./housing/me/yard/route";
import * as villageRoute from "./housing/village/route";
import * as session from "./session/route";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"]) vi.stubEnv(k, "");
});
beforeEach(() => {
  sent.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(name: string, points: number): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const v = {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.29.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
  await attend.POST(call("/api/me/attend", { visitor: v, body: { name } }));
  (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = points;
  return v;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("11/26 집 바뀜 알림 (homes)", () => {
  it("캠핑장 분양·디자인 바꾸기·앞마당마다 그 채널 camp로 한 번씩 알린다 (넓히기는 거절)", async () => {
    const v = await newVisitor("알림", 200_000);
    const ch = 3;
    expect((await buy.POST(call("/api/housing/me/buy", { visitor: v, body: { ch, lot: 2, zone: "camp", kind: "caravan" } }))).status).toBe(201);
    await flush();
    expect(sent).toEqual([{ ch, zone: "camp", v: expect.any(Number) }]);
    expect((await style.PUT(call("/api/housing/me/style", { method: "PUT", visitor: v, body: { zone: "camp", design: { model: "bus", color: 1, awning: 2 } } }))).status).toBe(200);
    expect((await yard.POST(call("/api/housing/me/yard", { visitor: v, body: { ch, zone: "camp" } }))).status).toBe(200);
    await flush();
    expect(sent.map((s) => `${s.ch}:${s.zone}`)).toEqual([`${ch}:camp`, `${ch}:camp`, `${ch}:camp`]);
    // 펜션 앞마당 (다른 사람). 11/26 캠핑장 넓히기는 없어 거절 — 실패는 알리지 않는다
    const w = await newVisitor("펜션", 200_000);
    expect((await mine.POST(call("/api/housing/me", { visitor: w, body: { ch, lot: 13, zone: "camp", name: "솔바람", intro: "" } }))).status).toBe(201);
    expect((await upgrade.POST(call("/api/housing/me/upgrade", { visitor: w, body: { ch, to: "wide", zone: "camp" } }))).status).toBe(409);
    expect((await yard.POST(call("/api/housing/me/yard", { visitor: w, body: { ch, zone: "camp" } }))).status).toBe(200);
    await flush();
    expect(sent.slice(3).map((s) => `${s.ch}:${s.zone}`)).toEqual([`${ch}:camp`, `${ch}:camp`]);
  });

  it("실패한 저장은 알리지 않는다 (돈이 모자라 분양 실패)", async () => {
    const v = await newVisitor("가난", 10);
    const r = await buy.POST(call("/api/housing/me/buy", { visitor: v, body: { ch: 4, lot: 1, zone: "camp", kind: "caravan" } }));
    expect(r.status).toBeGreaterThanOrEqual(400);
    await flush();
    expect(sent).toEqual([]);
  });

  it("마을 분양도 village로 알린다", async () => {
    const v = await newVisitor("마을", 200_000);
    expect((await mine.POST(call("/api/housing/me", { visitor: v, body: { ch: 5, name: "집", intro: "" } }))).status).toBe(201);
    await flush();
    expect(sent.map((s) => `${s.ch}:${s.zone}`)).toEqual(["5:village"]);
  });

  it("11/26 보안: 문패가 그대로면(같은 값 저장·소개만 바꿈) 알리지 않고, 문패가 바뀌면 한 번 알린다", async () => {
    const v = await newVisitor("문패", 200_000);
    expect((await mine.POST(call("/api/housing/me", { visitor: v, body: { ch: 7, name: "처음집", intro: "" } }))).status).toBe(201);
    await flush();
    sent.length = 0;
    const edit = (name: string, intro: string) => mine.PATCH(call("/api/housing/me", { method: "PATCH", visitor: v, body: { name, intro, zone: "village" } }));
    for (let i = 0; i < 3; i++) expect((await edit("처음집", "")).status).toBe(200);
    expect((await edit("처음집", "소개만 바꿈")).status).toBe(200);
    await flush();
    expect(sent).toEqual([]);
    const renamed = await edit("새 문패", "소개만 바꿈");
    expect(renamed.status).toBe(200);
    expect((await bodyOf<{ house: { name: string } }>(renamed)).house.name).toBe("새 문패");
    await flush();
    expect(sent.map((s) => `${s.ch}:${s.zone}`)).toEqual(["7:village"]);
  });

  it("마을 목록 &v=는 서버 메모리 캐시(1분)를 건너뛴다 (알림 받은 화면이 방금 분양을 본다)", async () => {
    const ch = 6;
    const a = await newVisitor("먼저", 200_000);
    const b = await newVisitor("나중", 200_000);
    const first = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp`)));
    expect(first.houses).toHaveLength(0);
    await buy.POST(call("/api/housing/me/buy", { visitor: a, body: { ch, lot: 5, zone: "camp", kind: "caravan" } }));
    // 캐시된 목록은 아직 비었다 (5분 주기 화면이 보던 것)
    expect((await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp`)))).houses).toHaveLength(0);
    const v1 = sent.at(-1)!.v;
    const fresh = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp&v=${v1}`)));
    expect(fresh.houses.map((h) => h.lot)).toEqual([5]);
    await buy.POST(call("/api/housing/me/buy", { visitor: b, body: { ch, lot: 6, zone: "camp", kind: "caravan" } }));
    await flush();
    const v2 = sent.at(-1)!.v;
    expect((await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp&v=${v2}`)))).houses.map((h) => h.lot).sort()).toEqual([5, 6]);
  });

  // 11/26 운영: 카라반 분양이 새로고침해야 보였다 — 맵에 들어갈 때 받은 CDN 옛 목록(stale-while-revalidate 하루)을 5분 들고 있었다
  it("옛 목록은 알림 v보다 먼저 만든 것(generatedAt < v)이라 화면이 거를 수 있고, CDN은 옛 목록을 오래 주지 않는다", async () => {
    const ch = 8;
    const a = await newVisitor("늦게옴", 200_000);
    const old = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp`)));
    await new Promise((r) => setTimeout(r, 5));
    await buy.POST(call("/api/housing/me/buy", { visitor: a, body: { ch, lot: 2, zone: "camp", kind: "caravan" } }));
    await flush();
    const v = sent.at(-1)!.v;
    const cached = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp`)));
    expect(cached.houses).toHaveLength(0);
    expect(cached.generatedAt).toBe(old.generatedAt);
    expect(cached.generatedAt).toBeLessThan(v);
    const fresh = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp&v=${v}`)));
    expect(fresh.generatedAt).toBeGreaterThanOrEqual(v);
    const cdn = (await villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp`))).headers.get("Vercel-CDN-Cache-Control") ?? "";
    const swr = Number(/stale-while-revalidate=(\d+)/.exec(cdn)?.[1] ?? 0);
    expect(cdn).toContain("max-age=15");
    expect(swr).toBeGreaterThan(0);
    expect(swr).toBeLessThanOrEqual(60);
  });
});
