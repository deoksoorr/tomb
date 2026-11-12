import { GRAVEYARD_CAPACITY } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminGraveSettings, AdminPassedResponse } from "@/lib/admin";
import { getAccounts, getStore } from "@/lib/store";
import type {
  ActivityResponse,
  ApiError,
  CreateGraveResponse,
  Grave,
  GraveListResponse,
  MyGraveStatusResponse,
  PassedListResponse,
  RankResponse,
} from "@/lib/types";
import * as adminPassedDelete from "./admin/graves/passed/[id]/route";
import * as adminPassed from "./admin/graves/passed/route";
import * as adminSettings from "./admin/graves/settings/route";
import * as flower from "./graves/[id]/flower/route";
import * as passedList from "./graves/passed/route";
import * as graves from "./graves/route";
import * as activity from "./me/activity/route";
import * as myGrave from "./me/grave/route";
import * as rank from "./rank/route";
import * as session from "./session/route";

// 49번: 성불·1인 1묘비·성불 리스트·포인트/사냥 랭킹 (메모리 구성). 시간은 Date.now를 바꿔 흐르게 한다
const ADMIN = { "x-admin-key": "dev-admin" };
const DAY = 86_400_000;

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.7.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
}
const bury = (v: Visitor, body: object = {}) =>
  graves.POST(call("/api/graves", { visitor: v, body: { name: "할 일 앱", lived: "week", mourner: "새벽코더", channel: 1, ...body } }));
const listOf = (ch: number) => bodyOf<GraveListResponse>(graves.GET(call(`/api/graves?channel=${ch}`)));
const myGraveOf = (v: Visitor) => bodyOf<MyGraveStatusResponse>(myGrave.GET(call("/api/me/grave", { visitor: v })));
/** 시계를 지금 + ms로 (같은 테스트 안에서 여러 번 불러도 진짜 지금 기준) */
let realNow = Date.now;
const at = (ms: number) => {
  vi.restoreAllMocks();
  realNow = Date.now;
  const t = realNow() + ms;
  vi.spyOn(Date, "now").mockReturnValue(t);
  return t;
};

describe("1인 1묘비", () => {
  it("묘비 쓰기 전 확인: 없으면 active=null, 세우면 성불 시각과 함께", async () => {
    const v = await newVisitor();
    expect(await myGraveOf(v)).toEqual({ active: null, passDays: 14 });
    const { grave } = await bodyOf<CreateGraveResponse>(bury(v));
    const status = await myGraveOf(v);
    expect(status.active?.id).toBe(grave.id);
    expect(status.active?.passAt).toBe(grave.passAt);
    expect(grave.passAt! - grave.createdAt).toBe(14 * DAY);
    const blocked = await bury(v, { channel: 2 });
    expect(blocked.status).toBe(409);
    expect((await errorOf(blocked)).message).toContain("지금 묘비가 성불한 뒤에 쓸 수 있어요");
  });

  it("예전 계정에 여러 개가 있으면: 목록 요청 때 가장 최근 것만 남고 나머지는 성불 (지우지 않는다, 다시 돌려도 같다)", async () => {
    const v = await newVisitor();
    const store = getStore();
    const accounts = getAccounts();
    const base = Date.now();
    const old = (id: string, createdAt: number, channel: number): Grave => ({
      id,
      name: `옛 묘비 ${id}`,
      epitaph: "e",
      bornAt: "2024-01-01",
      diedAt: "2024-01-02",
      ageDays: 2,
      causes: ["other"],
      mourner: "새벽코더",
      createdAt,
      ownerTokenHash: "",
      ownerAccountId: v.visitorId,
      channel,
    });
    const ids = [`mig${ipSeq}a`, `mig${ipSeq}b`, `mig${ipSeq}c`];
    await store.put(old(ids[0], base - 3000, 1));
    await store.put(old(ids[1], base - 1000, 2));
    await store.put(old(ids[2], base - 2000, 3));
    for (const id of ids) await accounts.addGrave(v.visitorId, id);

    at(2 * 60_000); // 정리 잠금(1분)이 풀린 뒤
    await listOf(1);
    expect((await myGraveOf(v)).active?.id).toBe(ids[1]);
    const passed = await bodyOf<PassedListResponse>(passedList.GET(call("/api/graves/passed?q=옛 묘비")));
    expect(passed.entries.map((e) => e.id).sort()).toEqual([ids[0], ids[2]].sort());
    at(4 * 60_000);
    await listOf(1);
    expect((await bodyOf<PassedListResponse>(passedList.GET(call("/api/graves/passed?q=옛 묘비")))).total).toBe(2);
    expect((await myGraveOf(v)).active?.id).toBe(ids[1]);
  });
});

describe("성불", () => {
  it("기간이 지나면 목록에서 빠지고(최근 성불 id로 빛 연출), 주인에게 소식, 성불 리스트에 헌화 수와 함께, 다시 쓸 수 있다", async () => {
    const owner = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(bury(owner, { channel: 6, name: "반딧불 지도" }));
    await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: await newVisitor() }), ctx(grave.id));

    at(14 * DAY - 60_000);
    expect((await listOf(6)).graves.map((g) => g.id)).toContain(grave.id);
    at(14 * DAY + 60_000);
    const list = await listOf(6);
    expect(list.graves.map((g) => g.id)).not.toContain(grave.id);
    expect(list.passed).toContain(grave.id);
    expect(list.reviveTop).toEqual([]);

    const feed = await bodyOf<ActivityResponse>(activity.GET(call("/api/me/activity", { visitor: owner })));
    expect(feed.items[0]).toMatchObject({ kind: "passed", targetId: grave.id, targetName: "반딧불 지도" });

    const found = await bodyOf<PassedListResponse>(passedList.GET(call("/api/graves/passed?q=반딧불")));
    expect(found.entries).toEqual([expect.objectContaining({ id: grave.id, name: "반딧불 지도", flowers: 1, channel: 6 })]);
    expect(found.entries[0]).not.toHaveProperty("ownerAccountId");
    expect(found.entries[0]).not.toHaveProperty("revives");
    const newest = await bodyOf<PassedListResponse>(passedList.GET(call("/api/graves/passed")));
    expect(newest.entries[0].id).toBe(grave.id);

    expect(await myGraveOf(owner)).toMatchObject({ active: null });
    expect((await bury(owner, { channel: 6 })).status).toBe(201);
    // 성불한 묘비에는 꽃을 놓을 수 없다
    expect((await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: owner }), ctx(grave.id))).status).toBe(404);
  });

  it(`묘역 정원(채널마다 ${GRAVEYARD_CAPACITY}개)을 넘으면 가장 오래된 것부터 앞당겨 성불`, async () => {
    const ids: string[] = [];
    for (let i = 0; i < GRAVEYARD_CAPACITY + 2; i++) {
      at(30 * DAY + i * 1000);
      ids.push((await bodyOf<CreateGraveResponse>(bury(await newVisitor(), { channel: 9 }))).grave.id);
    }
    at(30 * DAY + 10 * 60_000);
    const list = await listOf(9);
    expect(list.graves.map((g) => g.id)).toEqual(ids.slice(2));
    expect(list.passed?.sort()).toEqual(ids.slice(0, 2).sort());
    const admin = await bodyOf<AdminPassedResponse>(adminPassed.GET(call("/api/admin/graves/passed", { headers: ADMIN })));
    expect(admin.entries.filter((e) => ids.includes(e.id)).map((e) => e.reason)).toEqual(["full", "full"]);
  });

  it("관리자: 성불 기간을 바꾸면 바로 정리, 성불한 묘비 조회·완전 삭제", async () => {
    expect((await adminSettings.GET(call("/api/admin/graves/settings"))).status).toBe(401);
    const v = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(bury(v, { channel: 7, name: "주말 농장 앱" }));
    const patch = (passDays: unknown) =>
      adminSettings.PATCH(call("/api/admin/graves/settings", { method: "PATCH", headers: ADMIN, body: { passDays } }));
    expect((await patch(0)).status).toBe(400);
    expect((await patch(1.5)).status).toBe(400);

    at(60 * DAY);
    const changed = await bodyOf<AdminGraveSettings & { passedNow: number }>(patch(30));
    expect(changed).toMatchObject({ passDays: 30, capacity: GRAVEYARD_CAPACITY });
    expect(changed.passedNow).toBeGreaterThanOrEqual(1);
    expect(await bodyOf<AdminGraveSettings>(adminSettings.GET(call("/api/admin/graves/settings", { headers: ADMIN })))).toMatchObject({
      passDays: 30,
    });
    expect((await listOf(7)).graves.map((g) => g.id)).not.toContain(grave.id);

    const admin = await bodyOf<AdminPassedResponse>(adminPassed.GET(call("/api/admin/graves/passed?q=주말 농장", { headers: ADMIN })));
    expect(admin.entries).toEqual([expect.objectContaining({ id: grave.id, reason: "time", hidden: false, ownerAccountId: v.visitorId })]);
    const del = (id: string) => adminPassedDelete.DELETE(call(`/api/admin/graves/passed/${id}`, { method: "DELETE", headers: ADMIN }), ctx(id));
    expect((await del(grave.id)).status).toBe(200);
    expect((await del(grave.id)).status).toBe(404);
    expect((await bodyOf<PassedListResponse>(passedList.GET(call("/api/graves/passed?q=주말 농장")))).total).toBe(0);
    await patch(14);
  });
});

describe("랭킹 (포인트·사냥)", () => {
  it("기간·보드 검증, 주간 포인트는 이번 주 적립만", async () => {
    expect((await rank.GET(call("/api/rank?board=revive"))).status).toBe(400);
    expect((await rank.GET(call("/api/rank?board=huntBest&zone=moon"))).status).toBe(400);
    const v = await newVisitor();
    await bury(v); // 묘비 세우기 +20
    const res = await rank.GET(call("/api/rank?board=points&period=week&me=1", { visitor: v }));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await bodyOf<RankResponse>(res);
    expect(body).toMatchObject({ board: "points", period: "week", mine: { value: 20, me: true } });
    const pub = await rank.GET(call("/api/rank?board=huntKills"));
    expect(pub.headers.get("vercel-cdn-cache-control")).toContain("s-maxage=30");
    expect((await bodyOf<RankResponse>(pub)).mine).toBeNull();
  });

  it("F11 집 꾸미기 보드: board=house (전체·이번 주)", async () => {
    for (const period of ["all", "week"]) {
      const res = await rank.GET(call(`/api/rank?board=house&period=${period}`));
      expect(res.status).toBe(200);
      const body = await bodyOf<RankResponse>(res);
      expect(body).toMatchObject({ board: "house", period, mine: null });
      expect(Array.isArray(body.rows)).toBe(true);
    }
  });
});
