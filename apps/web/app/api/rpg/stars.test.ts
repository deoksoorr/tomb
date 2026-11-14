import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dexRewardOf, dexTitleNeed } from "@/lib/forage/catalog";
import { getForageStore } from "@/lib/forage/store";
import type { ForageState, PublicDex } from "@/lib/forage/types";
import { CONSTELLATIONS } from "@/lib/rpg/constellations";
import { env } from "@/lib/env";
import { starGroups, starsPlan, STARS_PLAN_VER } from "@/lib/rpg/plan";
import { starsPlanV1, V1_SIZE } from "@/lib/rpg/starsPlanV1";
import { signTicket, verifyTicket } from "@/lib/rpg/ticket";
import type { RunFinishResponse, RunStartResponse, StarsResult } from "@/lib/rpg/types";
import { kstDay } from "@/lib/store/accounts";
import * as dexClaim from "../forage/dex/claim/route";
import * as dexOf from "../forage/dex/[id]/route";
import * as forage from "../forage/route";
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

/** 판 시작: planVer를 주면 그 판 화면 (2 = 지금 화면), 없으면 1판 화면 */
async function startStars(v: Visitor, planVer: number | undefined = STARS_PLAN_VER) {
  const res = await start.POST(call("/api/rpg/run/start", v, { game: "stars", difficulty: "easy", ...(planVer ? { planVer } : {}) }));
  expect(res.status).toBe(200);
  const s = (await res.json()) as RunStartResponse;
  expect(typeof s.starry).toBe("boolean");
  expect(s.planVer).toBe(planVer ?? 1);
  return s;
}

/** 그 판 화면이 만든 계획 */
const planOf = (s: RunStartResponse) =>
  s.planVer === 1 ? starsPlanV1(s.seed, "easy", s.timeLimitSec, !!s.starry) : starsPlan(s.seed, "easy", s.timeLimitSec, s.sky);
const groupsOf = (s: RunStartResponse) => starGroups(planOf(s), s.planVer === 1 ? (id) => V1_SIZE.get(id) : undefined).filter((g) => g.full);

/** 다 완벽으로 이은 판 (groups를 주면 완성 목록도) */
function perfectRun(s: RunStartResponse, groups?: number[]): StarsResult {
  const plan = planOf(s);
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
  it("완성 목록을 검사해 도감에 등록 (처음만 새로), 완성 목록 없는 결과는 등록 없이, 가짜 목록은 거절", async () => {
    const v = await newVisitor();
    // 1) 완성 목록 없음: 보상은 그대로, 도감 등록 없음
    const s0 = await startStars(v);
    later(76_000);
    const r0 = (await (await finish.POST(call("/x", v, { ticket: s0.ticket, result: perfectRun(s0) }))).json()) as RunFinishResponse;
    expect(r0.reward.points).toBeGreaterThan(0);
    expect(r0.reward.constellations).toBeUndefined();
    expect((await getForageStore().dex(v.id)).dex).toEqual({});
    vi.restoreAllMocks();

    // 2) 완성 목록: 무리 둘
    const s1 = await startStars(v);
    const g1 = groupsOf(s1);
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
  });

  it("한 판 새 등록은 3개까지 — 넘친 처음 별자리는 later, 이미 있는 별자리는 한도와 상관없이 횟수가 오른다", async () => {
    const v = await newVisitor();
    const s = await startStars(v);
    const gs = groupsOf(s);
    expect(gs.length).toBeGreaterThanOrEqual(5);
    // 하나는 미리 도감에 있다
    await getForageStore().addStars(v.id, kstDay(Date.now()), [{ id: gs[4].con, perfect: false }]);
    later(76_000);
    const r = (await (
      await finish.POST(
        call("/x", v, {
          ticket: s.ticket,
          result: perfectRun(
            s,
            gs.slice(0, 5).map((g) => g.group),
          ),
        }),
      )
    ).json()) as RunFinishResponse;
    expect(r.reward.constellations).toEqual([
      { id: gs[0].con, isNew: true, perfect: true },
      { id: gs[1].con, isNew: true, perfect: true },
      { id: gs[2].con, isNew: true, perfect: true },
      { id: gs[3].con, isNew: false, perfect: true, later: true },
      { id: gs[4].con, isNew: false, perfect: true },
    ]);
    const dex = (await getForageStore().dex(v.id)).dex;
    expect(dex[gs[3].con]).toBeUndefined();
    expect(dex[gs[4].con]).toMatchObject({ n: 2, pf: 1 });
    expect(Object.keys(dex)).toHaveLength(4);
  });

  it("배포 호환: 1판 화면(판 번호 없이 시작)은 1판 계획으로 검사, 판 번호 없는 옛 티켓도 정상 판은 거절하지 않는다", async () => {
    const v = await newVisitor();
    // 1판 화면이 새 서버에서 시작 → 티켓 sv=1 → 1판 계획으로 목록 검사·등록
    const s1 = await startStars(v, undefined);
    const g1 = groupsOf(s1);
    later(76_000);
    const r1 = (await (await finish.POST(call("/x", v, { ticket: s1.ticket, result: perfectRun(s1, [g1[0].group]) }))).json()) as RunFinishResponse;
    expect(r1.reward.constellations).toEqual([{ id: g1[0].con, isNew: true, perfect: true }]);
    vi.restoreAllMocks();

    // 2판 배포 전 서버가 낸 티켓(sv 없음)으로 2판 화면이 한 정상 판: 보상은 그대로 (목록은 1판과 안 맞으면 버린다)
    const s2 = await startStars(v);
    const old = await signTicket(env.sessionSecret(), { ...(await verifyTicket(env.sessionSecret(), s2.ticket))!, sv: undefined });
    const g2 = groupsOf(s2);
    later(76_000);
    const res = await finish.POST(
      call("/x", v, {
        ticket: old,
        result: perfectRun(
          s2,
          g2.map((g) => g.group),
        ),
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as RunFinishResponse).reward.points).toBeGreaterThan(0);
  });

  it("별자리를 처음 등록하면 판 결과에 도감 보상(희귀도별), 절반을 모으면 칭호 「별지기」가 저절로. 옛 단계 받기는 거절, 이웃 구경에도 보인다", async () => {
    const v = await newVisitor();
    const s = await startStars(v);
    const gs = groupsOf(s);
    later(76_000);
    const r = (await (await finish.POST(call("/x", v, { ticket: s.ticket, result: perfectRun(s, [gs[0].group, gs[1].group]) }))).json()) as RunFinishResponse;
    const pts = dexRewardOf(gs[0].con) + dexRewardOf(gs[1].con);
    expect(r.reward.dexReward).toMatchObject({ points: pts, earned: pts, pending: 0, titles: [] });
    expect(r.reward.dexReward!.me!.points).toBeGreaterThanOrEqual(pts);
    vi.restoreAllMocks();
    // 같은 별자리를 다시 이어도 보상은 없다
    const s2 = await startStars(v);
    const again = groupsOf(s2).find((g) => g.con === gs[0].con);
    if (again) {
      later(76_000);
      const r2 = (await (await finish.POST(call("/x", v, { ticket: s2.ticket, result: perfectRun(s2, [again.group]) }))).json()) as RunFinishResponse;
      expect(r2.reward.constellations).toEqual([{ id: gs[0].con, isNew: false, perfect: true }]);
      expect(r2.reward.dexReward).toBeUndefined();
      vi.restoreAllMocks();
    }
    // 옛 화면의 단계 보상 받기는 포인트 없이 거절
    expect(await errCode(await dexClaim.POST(call("/x", v, { cat: "star", tier: 25 })))).toBe("DEX_CHANGED");

    // 절반까지 채우면 칭호가 저절로 (받기 버튼 없음)
    const day = kstDay(Date.now());
    const have = new Set([gs[0].con, gs[1].con]);
    const rest = CONSTELLATIONS.filter((c) => !have.has(c.id)).slice(0, dexTitleNeed("star", 50) - have.size);
    await getForageStore().addStars(
      v.id,
      day,
      rest.map((c) => ({ id: c.id, perfect: true })),
    );
    const st = (await (await forage.GET(call("/api/forage", v))).json()) as ForageState;
    expect(st.titles).toContain("별지기");
    expect(st.titles).not.toContain("밤하늘 지도 제작자");
    // 정산을 마친 계정이라 직접 등록한 별자리 보상은 받을 보상에 쌓여 있다
    expect(st.reward.pending.star).toBe(rest.reduce((n, c) => n + dexRewardOf(c.id), 0));
    expect(st.reward.got.star).toBe(pts);
    // 별자리는 가방에 들어가지 않는다 (팔 수 없다)
    expect(st.bag).toEqual({});

    const w = await newVisitor();
    const pub = (await (await dexOf.GET(call(`/api/forage/dex/${v.id}`, w), { params: Promise.resolve({ id: v.id }) })).json()) as PublicDex;
    expect(Object.keys(pub.dex).filter((id) => id.startsWith("c_"))).toHaveLength(dexTitleNeed("star", 50));
    expect(pub.titles).toContain("별지기");
  });
});
