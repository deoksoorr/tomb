import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEX_REWARD } from "@/lib/forage/catalog";
import { getForageStore } from "@/lib/forage/store";
import type { DexClaimResponse, PublicDex } from "@/lib/forage/types";
import { CONSTELLATIONS } from "@/lib/rpg/constellations";
import { starGroups, starsPlan } from "@/lib/rpg/plan";
import type { RunFinishResponse, RunStartResponse, StarsResult } from "@/lib/rpg/types";
import { kstDay } from "@/lib/store/accounts";
import * as dexClaim from "../forage/dex/claim/route";
import * as dexOf from "../forage/dex/[id]/route";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";

// 별자리 잇기 → 별자리 도감 (로컬 메모리 저장소로 라우트를 직접 부른다). 시간은 Date.now를 바꿔 흐르게 한다.

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
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.8.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}
const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const later = (ms: number) => {
  const real = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(real + ms);
};

async function startStars(v: Visitor) {
  const res = await start.POST(call("/api/rpg/run/start", v, { game: "stars", difficulty: "easy" }));
  expect(res.status).toBe(200);
  const s = (await res.json()) as RunStartResponse;
  expect(typeof s.starry).toBe("boolean");
  return s;
}

/** 다 완벽으로 이은 판 (groups를 주면 완성 목록도) */
function perfectRun(s: RunStartResponse, groups?: number[]): StarsResult {
  const plan = starsPlan(s.seed, "easy", s.timeLimitSec, !!s.starry);
  return {
    game: "stars",
    durationMs: 75_000,
    perfect: plan.length,
    good: 0,
    miss: 0,
    maxCombo: plan.length,
    score: plan.length * 300,
    ...(groups ? { groups, perfectGroups: groups } : {}),
  };
}

describe("별자리 잇기 → 별자리 도감", () => {
  it("완성 목록을 검사해 도감에 등록 (처음만 새로), 옛 화면 결과는 등록 없이, 가짜 목록은 거절", async () => {
    const v = await newVisitor();
    // 1) 옛 화면 (완성 목록 없음): 보상은 그대로, 도감 등록 없음
    const s0 = await startStars(v);
    later(76_000);
    const r0 = (await (await finish.POST(call("/x", v, { ticket: s0.ticket, result: perfectRun(s0) }))).json()) as RunFinishResponse;
    expect(r0.reward.points).toBeGreaterThan(0);
    expect(r0.reward.constellations).toBeUndefined();
    expect((await getForageStore().dex(v.id)).dex).toEqual({});
    vi.restoreAllMocks();

    // 2) 완성 목록: 온전한 무리 둘
    const s1 = await startStars(v);
    const g1 = starGroups(starsPlan(s1.seed, "easy", s1.timeLimitSec, !!s1.starry)).filter((g) => g.full);
    later(76_000);
    const res1 = await finish.POST(call("/x", v, { ticket: s1.ticket, result: perfectRun(s1, [g1[0].group, g1[1].group]) }));
    expect(res1.status).toBe(200);
    const r1 = (await res1.json()) as RunFinishResponse;
    expect(r1.reward.constellations).toEqual([
      { id: g1[0].con, isNew: true, perfect: true },
      { id: g1[1].con, isNew: true, perfect: true },
    ]);
    const d1 = (await getForageStore().dex(v.id)).dex;
    expect(d1[g1[0].con]).toEqual({ n: 1, max: 0, first: kstDay(Date.now()), pf: 1 });
    // 같은 티켓을 다시 내도 두 번 등록되지 않는다
    expect(await errCode(await finish.POST(call("/x", v, { ticket: s1.ticket, result: perfectRun(s1, [g1[0].group]) })))).toBe("TICKET_USED");
    expect((await getForageStore().dex(v.id)).dex[g1[0].con].n).toBe(1);
    vi.restoreAllMocks();

    // 3) 가짜 목록 (형식은 맞지만 계획에 없는 무리): 판 전체 거절, 도감 그대로
    const s2 = await startStars(v);
    later(76_000);
    const fake = await finish.POST(call("/x", v, { ticket: s2.ticket, result: perfectRun(s2, [150]) }));
    expect(fake.status).toBe(422);
    expect(Object.keys((await getForageStore().dex(v.id)).dex)).toHaveLength(2);
    vi.restoreAllMocks();

    // 4) 이미 있는 별자리를 다시 완성하면 횟수만 오르고 isNew는 아니다 (그 판에 같은 별자리가 나왔을 때 — 저장소 단위 시험은 lib/rpg/constellations.test.ts)
    const s3 = await startStars(v);
    const g3 = starGroups(starsPlan(s3.seed, "easy", s3.timeLimitSec, !!s3.starry)).filter((g) => g.full);
    const again = g3.find((g) => g.con === g1[0].con || g.con === g1[1].con);
    if (again) {
      later(76_000);
      const r3 = (await (await finish.POST(call("/x", v, { ticket: s3.ticket, result: perfectRun(s3, [again.group]) }))).json()) as RunFinishResponse;
      expect(r3.reward.constellations).toEqual([{ id: again.con, isNew: false, perfect: true }]);
      expect((await getForageStore().dex(v.id)).dex[again.con]).toMatchObject({ n: 2, pf: 2 });
    }
  });

  it("별자리 도감 25% 보상은 한 번만, 이웃 도감 구경에도 별자리·칭호가 보인다", async () => {
    const v = await newVisitor();
    const day = kstDay(Date.now());
    const need = (pct: number) => Math.ceil((CONSTELLATIONS.length * pct) / 100);
    await getForageStore().addStars(
      v.id,
      day,
      CONSTELLATIONS.slice(0, need(25)).map((c) => ({ id: c.id, perfect: false })),
    );
    expect(await errCode(await dexClaim.POST(call("/x", v, { cat: "star", tier: 50 })))).toBe("NOT_YET");
    const c = (await (await dexClaim.POST(call("/x", v, { cat: "star", tier: 25 }))).json()) as DexClaimResponse;
    expect(c.earned).toBe(DEX_REWARD[25]);
    expect(c.state.claims["star:25"]).toBe(day);
    expect(await errCode(await dexClaim.POST(call("/x", v, { cat: "star", tier: 25 })))).toBe("ALREADY");
    await getForageStore().addStars(
      v.id,
      day,
      CONSTELLATIONS.slice(need(25), need(50)).map((c) => ({ id: c.id, perfect: true })),
    );
    const c50 = (await (await dexClaim.POST(call("/x", v, { cat: "star", tier: 50 }))).json()) as DexClaimResponse;
    expect(c50.title).toBe("별지기");
    // 별자리는 가방에 들어가지 않는다 (팔 수 없다)
    expect(c50.state.bag).toEqual({});

    const w = await newVisitor();
    const pub = (await (await dexOf.GET(call(`/api/forage/dex/${v.id}`, w), { params: Promise.resolve({ id: v.id }) })).json()) as PublicDex;
    expect(Object.keys(pub.dex).filter((id) => id.startsWith("c_"))).toHaveLength(need(50));
    expect(pub.titles).toContain("별지기");
  });
});
