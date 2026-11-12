import { itemById, verifyGrant } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import type { ApiError, LookGrantResponse, Me, UseItemResponse, WearResponse } from "@/lib/types";
import * as look from "./me/look/route";
import * as me from "./me/route";
import * as unequip from "./me/unequip/route";
import * as wear from "./me/wear/route";
import * as session from "./session/route";
import * as buy from "./shop/buy/route";
import * as use from "./shop/use/route";

// 벗어 둔 꾸미기(stash)·다시 입기·벗기 (메모리 구성으로 라우트를 직접 호출한다)
const SECRET = "dev-join-secret-change-me";
const HOUR = 3_600_000;

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
function call(path: string, opts: { visitor?: Visitor; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: body ? "POST" : "GET", headers, body });
}
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { body: {} }));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.7.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
}
const setPoints = (v: Visitor, n: number) =>
  ((getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = n);
const getMe = (v: Visitor) => bodyOf<Me>(me.GET(call("/api/me", { visitor: v })));
const buyItem = (v: Visitor, itemId: string) => buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId } }));
const useItem = (v: Visitor, itemId: string) => bodyOf<UseItemResponse>(use.POST(call("/api/shop/use", { visitor: v, body: { itemId } })));
const wearItem = (v: Visitor, itemId: string) => wear.POST(call("/api/me/wear", { visitor: v, body: { itemId } }));
const takeOff = (v: Visitor, slot: string) => unequip.POST(call("/api/me/unequip", { visitor: v, body: { slot } }));
const lookIn = async (grant: string) => {
  const g = await verifyGrant(SECRET, grant);
  return g?.kind === "look" ? g.look : null;
};

/** Date.now를 고정해 둔다 (남은 시간이 흐르는 것을 확인) */
function clock(start: number) {
  let t = start;
  vi.spyOn(Date, "now").mockImplementation(() => t);
  return { advance: (ms: number) => (t += ms) };
}

describe("벗어 둔 꾸미기", () => {
  it("같은 부위에 새로 입으면 입던 것은 사라지지 않고 같은 만료 시각으로 stash에 남는다", async () => {
    const t = clock(Date.parse("2026-11-12T00:00:00Z"));
    const v = await newVisitor();
    setPoints(v, 1000);
    for (const id of ["hat_straw", "hat_cat"]) expect((await buyItem(v, id)).status).toBe(200);
    const first = await useItem(v, "hat_straw");
    const strawUntil = first.me.equipped[0].until;
    t.advance(HOUR);
    const second = await useItem(v, "hat_cat");
    expect(second.me.equipped).toEqual([{ itemId: "hat_cat", until: expect.any(Number) }]);
    expect(second.me.stash).toEqual([{ itemId: "hat_straw", until: strawUntil }]);
    expect(await lookIn(second.lookGrant!)).toEqual(["hat_cat"]);

    // 다시 입기: 자리를 바꾼다 (남은 시간 그대로)
    const worn = await bodyOf<WearResponse>(wearItem(v, "hat_straw"));
    expect(worn.me.equipped).toEqual([{ itemId: "hat_straw", until: strawUntil }]);
    expect(worn.me.stash).toEqual([{ itemId: "hat_cat", until: second.me.equipped[0].until }]);
    expect(await lookIn(worn.lookGrant)).toEqual(["hat_straw"]);
    expect((await bodyOf<LookGrantResponse>(look.GET(call("/api/me/look", { visitor: v })))).look).toEqual(["hat_straw"]);
  });

  it("벗기: 증서에서 빠지고 stash로, 남은 시간은 계속 흘러 만료되면 사라진다", async () => {
    const t = clock(Date.parse("2026-11-12T00:00:00Z"));
    const v = await newVisitor();
    setPoints(v, 1000);
    for (const id of ["hat_cat", "neck_scarf"]) await buyItem(v, id);
    await useItem(v, "hat_cat");
    const used = await useItem(v, "neck_scarf");
    expect((await lookIn(used.lookGrant!))?.sort()).toEqual(["hat_cat", "neck_scarf"]);

    const off = await bodyOf<WearResponse>(takeOff(v, "head"));
    expect(off.me.equipped.map((e) => e.itemId)).toEqual(["neck_scarf"]);
    expect(off.me.stash.map((e) => e.itemId)).toEqual(["hat_cat"]);
    expect(await lookIn(off.lookGrant)).toEqual(["neck_scarf"]);

    const again = await takeOff(v, "head");
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toEqual({ code: "NO_ITEM", message: "그 부위에 입은 게 없어요." });

    // 벗어 둔 동안에도 시간이 흐른다: 24시간 뒤엔 stash에서도, 착용에서도 사라진다
    t.advance(24 * HOUR);
    expect(await getMe(v)).toMatchObject({ equipped: [], stash: [] });
    const gone = await wearItem(v, "hat_cat");
    expect(await errorOf(gone)).toEqual({ code: "NO_ITEM", message: "벗어 둔 꾸미기 중에 그 아이템이 없어요." });
    // 만료된 뒤에는 다시 살 수 있다
    expect((await buyItem(v, "hat_cat")).status).toBe(200);
  });

  it("벗어 둔 꾸미기는 가진 것: 다시 살 수 없다", async () => {
    clock(Date.parse("2026-11-12T00:00:00Z"));
    const v = await newVisitor();
    setPoints(v, 1000);
    await buyItem(v, "hat_cat");
    await useItem(v, "hat_cat");
    await takeOff(v, "head");
    const res = await buyItem(v, "hat_cat");
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("ALREADY_OWNED");
    expect((await getMe(v)).points).toBe(1000 - itemById("hat_cat")!.price);
  });

  it("다시 입기 409: stash에 없거나 이미 입고 있으면. 입력 검사 400, 세션 없으면 401", async () => {
    const v = await newVisitor();
    setPoints(v, 1000);
    await buyItem(v, "hat_cat");
    // 가방에만 있는 것은 wear로 입을 수 없다 (상점의 사용으로 입는다)
    expect((await errorOf(await wearItem(v, "hat_cat"))).code).toBe("NO_ITEM");
    await useItem(v, "hat_cat");
    expect((await errorOf(await wearItem(v, "hat_cat"))).code).toBe("NO_ITEM");
    expect((await getMe(v)).equipped.map((e) => e.itemId)).toEqual(["hat_cat"]);

    expect((await wearItem(v, "fw_small")).status).toBe(400); // 캐릭터 꾸미기가 아니다
    expect((await wearItem(v, "rocket")).status).toBe(400);
    expect((await takeOff(v, "tail")).status).toBe(400);
    expect((await takeOff(v, "toString")).status).toBe(400);
    expect((await wear.POST(call("/api/me/wear", { body: { itemId: "hat_cat" } }))).status).toBe(401);
    expect((await unequip.POST(call("/api/me/unequip", { body: { slot: "head" } }))).status).toBe(401);
  });
});
