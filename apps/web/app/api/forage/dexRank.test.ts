import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AVATAR_COLORS, verifyInternal, verifyJoinToken } from "@tomb/protocol";
import { dexBadgeBits, speciesOf } from "@/lib/forage/catalog";
import { getFishRank, MemoryFishRank } from "@/lib/forage/fishRank";
import { reelMinMs } from "@/lib/forage/rules";
import { getForageStore } from "@/lib/forage/store";
import { setStaff } from "@/lib/staff";
import type { CastResponse, PublicDex, ReelResponse } from "@/lib/forage/types";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import type { JoinResponse, RankResponse } from "@/lib/types";
import * as join from "../join/route";
import * as rank from "../rank/route";
import * as session from "../session/route";
import * as peerDex from "./dex/peer/route";
import * as cast from "./fish/cast/route";
import * as reel from "./fish/reel/route";

// 다른 사람 도감 보기(실시간 서버로 sid → 계정) · 도감 100% 배지(입장 토큰) · 최대어 랭킹(낚시 결과에서 기록)

const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

function call(path: string, v?: Visitor, body?: unknown) {
  const headers: Record<string, string> = {};
  if (v) Object.assign(headers, { cookie: v.cookie, "x-forwarded-for": v.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.9.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}
const body = async <T>(res: Response) => (await res.json()) as T;
const realNow = Date.now.bind(Date);

/** 실시간 서버 흉내: 서명된 /internal/peer만 답한다 (채널 1의 sid → 방문자). 로비 조회는 실패시킨다 */
function fakeRealtime(peers: Record<number, { visitorId: string; name: string }>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/internal/")) return new Response("no", { status: 503 });
    const raw = String(init?.body ?? "");
    const r = await verifyInternal(SECRET, raw, new Headers(init?.headers).get("X-Tomb-Internal"));
    if (!r || r.op !== "peer") return new Response("not found", { status: 404 });
    return Response.json({ peer: r.ch === 1 ? (peers[r.sid] ?? null) : null });
  });
}

/** 그 종류 도감을 다 채운다 (저장소에 바로) */
async function fillDex(acct: string, cat: "fish" | "bug") {
  const items = speciesOf(cat).map((s) => ({ id: s.id, size: s.size ? s.size[0] * 10 : 0 }));
  await getForageStore().grant(acct, kstDay(realNow()), cat === "fish" ? "fish" : "gather", items, 99);
}

describe("다른 사람 도감 보기 (게임 안 메뉴)", () => {
  it("채널·sid로 서버가 계정을 풀어 도감을 준다. 응답에 계정 id는 없다", async () => {
    const [me, other] = [await newVisitor(), await newVisitor()];
    await fillDex(other.id, "bug");
    fakeRealtime({ 7: { visitorId: other.id, name: "옆사람" } });
    const res = await peerDex.POST(call("/x", me, { ch: 1, sid: 7 }));
    expect(res.status).toBe(200);
    const d = await body<PublicDex>(res);
    expect(d.accountId).toBe("");
    expect(JSON.stringify(d)).not.toContain(other.id);
    expect(Object.keys(d.dex).length).toBe(speciesOf("bug").length);
  });

  it("없는 sid는 404, 채널·방을 둘 다 주거나 안 주면 400, 세션 없으면 401", async () => {
    const me = await newVisitor();
    fakeRealtime({});
    expect((await peerDex.POST(call("/x", me, { ch: 1, sid: 99 }))).status).toBe(404);
    expect((await peerDex.POST(call("/x", me, { sid: 1 }))).status).toBe(400);
    expect((await peerDex.POST(call("/x", me, { ch: 1, room: "village", sid: 1 }))).status).toBe(400);
    expect((await peerDex.POST(call("/x", undefined, { ch: 1, sid: 1 }))).status).toBe(401);
  });
});

describe("도감 100% 배지", () => {
  it("종류별 비트: 다 채운 종류만", () => {
    expect(dexBadgeBits({})).toBe(0);
    const fish = Object.fromEntries(speciesOf("fish").map((s) => [s.id, { n: 1 }]));
    expect(dexBadgeBits(fish)).toBe(1);
    const bugs = Object.fromEntries(speciesOf("bug").map((s) => [s.id, { n: 1 }]));
    expect(dexBadgeBits({ ...fish, ...bugs })).toBe(3);
    // 하나라도 비면 그 종류는 없다
    const { [speciesOf("fish")[0].id]: _drop, ...almost } = fish;
    void _drop;
    expect(dexBadgeBits(almost)).toBe(0);
  });

  it("입장 토큰에 서버가 계산한 배지가 들어간다 (없으면 필드 없음)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 503 }));
    const v = await newVisitor();
    const tokenOf = async () => {
      const r = await body<JoinResponse>(await join.POST(call("/api/join", v, { channel: 1, name: "배지", color: AVATAR_COLORS[0] })));
      if (r.mode !== "channel") throw new Error(`채널 입장이 아님 ${JSON.stringify(r)}`);
      return verifyJoinToken(SECRET, r.token);
    };
    expect((await tokenOf())?.dex).toBeUndefined();
    await fillDex(v.id, "bug");
    expect((await tokenOf())?.dex).toBe(2);
  });
});

describe("최대어 랭킹", () => {
  it("메모리 판: 더 큰 기록만 바꾸고, 전체 판은 어떤 물고기인지 같이 둔다", async () => {
    const r = new MemoryFishRank();
    await r.record("a", "f_crucian", 200, "w1");
    await r.record("a", "f_crucian", 150, "w1");
    await r.record("b", "f_bluegill", 210, "w1");
    await r.record("a", "f_crucian", 0, "w1");
    const sp = await r.board("f_crucian", null, 10, "a");
    expect(sp.rows.map((x) => [x.accountId, x.size])).toEqual([["a", 200]]);
    const all = await r.board(null, "w1", 10, "a");
    expect(all.rows.map((x) => [x.accountId, x.size, x.sp])).toEqual([
      ["b", 210, "f_bluegill"],
      ["a", 200, "f_crucian"],
    ]);
    expect(all.mine).toMatchObject({ rank: 2, size: 200 });
    expect((await r.board(null, "w2", 10, null)).rows).toEqual([]);
  });

  it("낚시 결과 API가 기록하고, /api/rank?board=fish로 본다 (모르는 물고기는 400)", async () => {
    const v = await newVisitor();
    const c = await body<CastResponse>(await cast.POST(call("/x", v, { spot: "f_1172_932" })));
    vi.spyOn(Date, "now").mockReturnValue(realNow() + c.biteInMs + reelMinMs(c.power) + 50);
    const got = await body<ReelResponse>(await reel.POST(call("/x", v, { ticket: c.ticket, ok: true })));
    vi.restoreAllMocks();
    const caught = got.result!;
    const mine = (await getFishRank().board(caught.id, kstWeek(), 50, v.id)).mine;
    expect(mine?.size).toBe(caught.size);
    const res = await rank.GET(call(`/api/rank?board=fish&period=week&fish=all&me=1`, v));
    expect(res.status).toBe(200);
    const r = await body<RankResponse>(res);
    expect(r.board).toBe("fish");
    expect(r.mine).toMatchObject({ value: expect.any(Number), me: true });
    expect(r.mine!.sub).toBeTruthy();
    expect((await rank.GET(call(`/api/rank?board=fish&fish=b_nope`))).status).toBe(400);
  });

  it("운영자 계정은 최대어를 잡아도 기록되지 않고, 내 순위 대신 staff 표시", async () => {
    const v = await newVisitor();
    await setStaff(v.id);
    try {
      const c = await body<CastResponse>(await cast.POST(call("/x", v, { spot: "f_1172_932" })));
      vi.spyOn(Date, "now").mockReturnValue(realNow() + c.biteInMs + reelMinMs(c.power) + 50);
      const got = await body<ReelResponse>(await reel.POST(call("/x", v, { ticket: c.ticket, ok: true })));
      vi.restoreAllMocks();
      expect(got.result).toBeTruthy();
      expect((await getFishRank().board(null, kstWeek(), 50, v.id)).mine).toBeNull();
      const r = await body<RankResponse>(await rank.GET(call(`/api/rank?board=fish&period=week&fish=all&me=1`, v)));
      expect(r).toMatchObject({ mine: null, staff: true });
      expect(r.rows.some((x) => x.me)).toBe(false);
    } finally {
      await setStaff(null);
    }
  });
});
