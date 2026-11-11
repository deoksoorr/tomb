import { verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";
import { earnPoints, getAccounts, spendPoints } from "@/lib/store";
import type {
  ApiError,
  CreateGraveResponse,
  GraveDetailResponse,
  GraveListResponse,
  JoinResponse,
  Me,
  PointRankResponse,
  PresenceResponse,
  ShrineListResponse,
  UpdateGraveResponse,
} from "@/lib/types";
import * as graveById from "./graves/[id]/route";
import * as graves from "./graves/route";
import * as join from "./join/route";
import * as attend from "./me/attend/route";
import * as presence from "./me/presence/route";
import * as me from "./me/route";
import * as rank from "./rank/points/route";
import * as session from "./session/route";
import * as restore from "./shrine/[id]/restore/route";
import * as shrine from "./shrine/route";
import * as buy from "./shop/buy/route";
import * as flower from "./graves/[id]/flower/route";

// v3: 아바타 프로필·머무르기·포인트 랭킹·성황당·코멘트·코디 중복 구매 금지
beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "3");
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
const getMe = (v: Visitor) => bodyOf<Me>(me.GET(call("/api/me", { visitor: v })));
const quickBury = (v: Visitor, body: object = {}) =>
  graves.POST(call("/api/graves", { visitor: v, body: { name: "할 일 앱", lived: "week", mourner: "새벽코더", channel: 1, ...body } }));
const setPoints = (v: Visitor, n: number) =>
  ((getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = n);

describe("아바타 프로필", () => {
  it("출석 때 색·몸 모양을 비어 있을 때만 저장하고, 입장 토큰의 몸 모양은 요청 > 계정 값", async () => {
    const v = await newVisitor();
    await attend.POST(call("/api/me/attend", { visitor: v, body: { name: "새벽코더", color: "#9fc5a8", body: "cat" } }));
    await attend.POST(call("/api/me/attend", { visitor: v, body: { color: "#e0c36a", body: "tall" } }));
    expect(await getMe(v)).toMatchObject({ name: "새벽코더", color: "#9fc5a8", body: "cat" });
    expect((await attend.POST(call("/api/me/attend", { visitor: v, body: { body: "dragon" } }))).status).toBe(400);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no lobby"));
    const tokenBody = async (extra: object) => {
      const res = await bodyOf<JoinResponse>(join.POST(call("/api/join", { visitor: v, body: { channel: 1, name: "새벽코더", color: "#9fc5a8", ...extra } })));
      if (res.mode !== "channel") throw new Error("channel 모드여야 한다");
      return (await verifyJoinToken("dev-join-secret-change-me", res.token))?.body;
    };
    expect(await tokenBody({})).toBe("cat");
    expect(await tokenBody({ body: "round" })).toBe("round");
  });
});

describe("머무르기", () => {
  it("처음 +5, 9.5분 안에 다시 부르면 0, 분당 2번까지", async () => {
    const v = await newVisitor();
    const first = await bodyOf<PresenceResponse>(presence.POST(call("/api/me/presence", { method: "POST", visitor: v })));
    expect(first.earned).toBe(5);
    expect(first.me.points).toBe(5);
    expect((await bodyOf<PresenceResponse>(presence.POST(call("/api/me/presence", { method: "POST", visitor: v })))).earned).toBe(0);
    expect((await presence.POST(call("/api/me/presence", { method: "POST", visitor: v }))).status).toBe(429);
  });
});

describe("포인트 랭킹", () => {
  it("익명 목록은 CDN 캐시(브라우저 no-store), ?me=1은 내 순위를 넣고 캐시하지 않는다. 이름이 없으면 이름 없는 유령", async () => {
    const named = await newVisitor();
    await attend.POST(call("/api/me/attend", { visitor: named, body: { name: "랭커" } }));
    await earnPoints(named.visitorId, "hunt", 300);
    const nameless = await newVisitor();
    await earnPoints(nameless.visitorId, "hunt", 299);

    const anon = await rank.GET(call("/api/rank/points"));
    expect(anon.headers.get("cache-control")).toBe("no-store");
    expect(anon.headers.get("vercel-cdn-cache-control")).toBe("s-maxage=30, stale-while-revalidate=300");
    const list = (await anon.json()) as PointRankResponse;
    expect(list.mine).toBeNull();
    expect(list.rows.every((r) => !r.me)).toBe(true);
    const top = list.rows.findIndex((r) => r.name === "랭커" && r.points === 310);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(list.rows[top + 1]).toMatchObject({ name: "이름 없는 유령", points: 299 });

    const mine = await rank.GET(call("/api/rank/points?me=1", { visitor: nameless }));
    expect(mine.headers.get("cache-control")).toBe("private, no-store");
    const body = (await mine.json()) as PointRankResponse;
    expect(body.mine).toMatchObject({ name: "이름 없는 유령", points: 299, me: true });
    expect(body.rows.find((r) => r.me)?.rank).toBe(body.mine!.rank);
  });
});

describe("공용 포인트 함수", () => {
  it("earnPoints는 한도 안에서 적립하고 me를, spendPoints는 모자라면 409 NOT_ENOUGH_POINTS", async () => {
    const v = await newVisitor();
    const r = await earnPoints(v.visitorId, "houseLike");
    expect(r).toMatchObject({ earned: 2, me: { points: 2, lifetimePoints: 2 } });
    expect((await spendPoints(v.visitorId, 2, "test")).points).toBe(0);
    const err = await spendPoints(v.visitorId, 1, "test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 409, code: "NOT_ENOUGH_POINTS" });
    expect((await getMe(v)).lifetimePoints).toBe(2);
  });
});

describe("성황당", () => {
  it("이장 → 목록에서 빠지고 내 성황당에 → 다시 모시면 원래 채널 맨 뒤, 헌화 수 그대로", async () => {
    const owner = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(owner, { channel: 2 }));
    await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: await newVisitor() }), ctx(grave.id));
    await quickBury(await newVisitor(), { channel: 2 }); // 뒤에 다른 사람 묘비

    expect((await graveById.DELETE(call(`/api/graves/${grave.id}`, { method: "DELETE", visitor: owner }), ctx(grave.id))).status).toBe(200);
    const listed = async () => (await bodyOf<GraveListResponse>(graves.GET(call("/api/graves?channel=2")))).graves.map((g) => g.id);
    expect(await listed()).not.toContain(grave.id);
    expect((await getMe(owner)).graves).not.toContain(grave.id);
    expect((await graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id))).status).toBe(404);

    const mine = await bodyOf<ShrineListResponse>(shrine.GET(call("/api/shrine", { visitor: owner })));
    expect(mine.entries).toHaveLength(1);
    expect(mine.entries[0].grave).toMatchObject({ id: grave.id, channel: 2, flowers: 1 });
    expect(mine.entries[0].expiresAt - mine.entries[0].removedAt).toBe(30 * 86_400_000);

    const stranger = await newVisitor();
    expect((await bodyOf<ShrineListResponse>(shrine.GET(call("/api/shrine", { visitor: stranger })))).entries).toEqual([]);
    expect((await restore.POST(call(`/api/shrine/${grave.id}/restore`, { method: "POST", visitor: stranger }), ctx(grave.id))).status).toBe(404);

    // 1인 1묘비: 그사이 새 묘비를 세웠으면 다시 모실 수 없다 (새 묘비를 이장하면 된다)
    const newer = await bodyOf<CreateGraveResponse>(quickBury(owner, { channel: 2 }));
    const blocked = await restore.POST(call(`/api/shrine/${grave.id}/restore`, { method: "POST", visitor: owner }), ctx(grave.id));
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("ONE_GRAVE");
    expect((await graveById.DELETE(call(`/api/graves/${newer.grave.id}`, { method: "DELETE", visitor: owner }), ctx(newer.grave.id))).status).toBe(200);

    const back = await bodyOf<UpdateGraveResponse>(restore.POST(call(`/api/shrine/${grave.id}/restore`, { method: "POST", visitor: owner }), ctx(grave.id)));
    expect(back.grave).toMatchObject({ id: grave.id, channel: 2, flowers: 1 });
    expect((await listed()).at(-1)).toBe(grave.id);
    expect((await getMe(owner)).graves).toContain(grave.id);
    expect((await bodyOf<ShrineListResponse>(shrine.GET(call("/api/shrine", { visitor: owner })))).entries.map((e) => e.grave.id)).toEqual([
      newer.grave.id,
    ]);
    expect((await restore.POST(call(`/api/shrine/${grave.id}/restore`, { method: "POST", visitor: owner }), ctx(grave.id))).status).toBe(404);
  });
});

describe("묘비 코멘트", () => {
  it("한 줄 100자로 저장되어 상세에 나오고, 수정에서 빼면 지워진다", async () => {
    const v = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(v, { comment: " 다음엔\n끝까지 " }));
    const detail = async () => (await bodyOf<GraveDetailResponse>(graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id)))).grave as { comment?: string };
    expect((await detail()).comment).toBe("다음엔 끝까지");
    expect((await quickBury(v, { comment: "가".repeat(101) })).status).toBe(400);
    const full = { name: "고침", epitaph: "e", bornAt: grave.bornAt, diedAt: grave.diedAt, causes: ["time"], mourner: "새벽코더" };
    await graveById.PATCH(call(`/api/graves/${grave.id}`, { method: "PATCH", visitor: v, body: { ...full, comment: "고친 말" } }), ctx(grave.id));
    expect((await detail()).comment).toBe("고친 말");
    await graveById.PATCH(call(`/api/graves/${grave.id}`, { method: "PATCH", visitor: v, body: full }), ctx(grave.id));
    expect((await detail()).comment).toBeUndefined();
  });
});

describe("코디 중복 구매 금지", () => {
  it("캐릭터 꾸미기는 가방에 있으면 409 ALREADY_OWNED, 폭죽은 여러 개", async () => {
    const v = await newVisitor();
    setPoints(v, 500);
    const buyItem = (itemId: string) => buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId } }));
    expect((await buyItem("hat_cat")).status).toBe(200);
    expect(await errorOf(await buyItem("hat_cat"))).toEqual({ code: "ALREADY_OWNED", message: "이미 가지고 있거나 착용 중이에요." });
    expect((await buyItem("fw_small")).status).toBe(200);
    expect((await buyItem("fw_small")).status).toBe(200);
    expect((await getMe(v)).inventory).toEqual({ hat_cat: 1, fw_small: 2 });
  });
});
