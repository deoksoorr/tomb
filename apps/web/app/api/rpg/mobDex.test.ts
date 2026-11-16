import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEX_TITLES, dexIdsOf, dexRewardOf } from "@/lib/forage/catalog";
import { publicDex } from "@/lib/forage/service";
import { getForageStore } from "@/lib/forage/store";
import type { MonsterId } from "@/lib/rpg/catalog";
import { huntPlan } from "@/lib/rpg/plan";
import { forgetEndgameLaunch, recordMobKills } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import { towerPlan } from "@/lib/rpg/tower";
import type { CharacterState, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { setStaff } from "@/lib/staff";
import { earnRule } from "@/lib/economy";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";

// 11/16 몬스터 도감: 서버가 받아들인 판(사냥·야근 빌딩)의 검증된 처치 수만 계정 도감에 더한다.
// 처음 쓰러뜨린 몬스터는 등록되고 도감 보상("dex" 적립, 하루 도감 한도)을 한 번만 받는다. 거절·의심 판은 기록하지 않는다.
// 로컬 구성(Memory*Store)으로 라우트를 직접 부른다

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
  forgetEndgameLaunch();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

function call(path: string, v?: Visitor, body?: unknown) {
  const headers: Record<string, string> = {};
  if (v) Object.assign(headers, { cookie: v.cookie, "x-forwarded-for": v.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function newVisitor(patch: Partial<CharacterState> = {}): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.16.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  if (Object.keys(patch).length) await getRpgStore().update(v.id, (s) => ({ state: { ...s, runs: 1, ...patch }, result: null }));
  return v;
}

async function begin(v: Visitor, body: object): Promise<RunStartResponse> {
  const res = await start.POST(call("/api/rpg/run/start", v, body));
  expect(res.status).toBe(200);
  return (await res.json()) as RunStartResponse;
}

/** 시계를 after ms 뒤로 옮겨 결과를 낸다 */
async function submit(v: Visitor, s: RunStartResponse, result: object, after: number): Promise<Response> {
  const real = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(real + after);
  const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result }));
  vi.restoreAllMocks();
  return res;
}

/** 쉬움 회의실 계획대로 다 깬 결과 */
function clearEasy(seed: number, durationMs = 100_000) {
  const kills: Record<string, number> = {};
  const plan = huntPlan(seed, "easy");
  for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt", durationMs, kills, wavesCleared: plan.length, died: false, potionsUsed: {} };
}

/** 야근 빌딩: 시작 층부터 floors층을 깬 결과 (층마다 45초) */
function climbed(s: RunStartResponse, floors: number) {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++) for (const w of towerPlan(s.seed, s.tower! + i, s.tower!)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt" as const, durationMs: floors * 45_000 + 3_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 45_000 };
}
const climbMs = (floors: number) => floors * 45_000 + 4_000;

const mobDexOf = async (id: string) => {
  const dex = (await getForageStore().dex(id)).dex;
  return Object.fromEntries(dexIdsOf("mob").filter((m) => dex[m]).map((m) => [m, dex[m]]));
};

describe("몬스터 도감 기록 (받아들인 판만)", () => {
  it("정상 판: 처치 수가 몬스터마다 쌓이고, 처음 쓰러뜨린 몬스터만 등록·보상 (두 번째 판은 수만 오른다)", async () => {
    const v = await newVisitor();
    const s = await begin(v, { game: "hunt", difficulty: "easy" });
    const result = clearEasy(s.seed);
    const res = await submit(v, s, result, 101_000);
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunFinishResponse;
    const ids = Object.keys(result.kills);
    expect(new Set(body.reward.newMobs)).toEqual(new Set(ids));
    const sum = ids.reduce((n, id) => n + dexRewardOf(id), 0);
    expect(body.reward.dexReward).toMatchObject({ points: sum });
    expect(body.reward.dexReward!.earned + body.reward.dexReward!.pending).toBe(sum);
    expect(body.reward.dexReward!.earned).toBeGreaterThan(0);
    const dex = await mobDexOf(v.id);
    for (const id of ids) expect(dex[id]).toMatchObject({ n: result.kills[id], max: 0 });
    expect(Object.values(dex).every((e) => /^\d{8}$/.test(e.first))).toBe(true);

    // 두 번째 판: 새로 등록되는 것이 없으면 보상도 없다
    const s2 = await begin(v, { game: "hunt", difficulty: "easy" });
    const r2 = (await (await submit(v, s2, clearEasy(s2.seed), 101_000)).json()) as RunFinishResponse;
    const fresh2 = Object.keys(clearEasy(s2.seed).kills).filter((id) => !ids.includes(id));
    expect(r2.reward.newMobs ?? []).toEqual(fresh2);
    if (!fresh2.length) expect(r2.reward.dexReward).toBeUndefined();
    const dex2 = await mobDexOf(v.id);
    for (const id of ids) expect(dex2[id].n).toBe(result.kills[id] + (clearEasy(s2.seed).kills[id] ?? 0));
    expect(dex2[ids[0]].first).toBe(dex[ids[0]].first);
  });

  it("거절된 판(너무 빠름·너무 높음)은 기록하지 않는다", async () => {
    const v = await newVisitor();
    const s = await begin(v, { game: "hunt", difficulty: "easy" });
    expect((await submit(v, s, clearEasy(s.seed), 5_000)).status).toBe(422);
    const s2 = await begin(v, { game: "hunt", difficulty: "easy" });
    expect((await submit(v, s2, clearEasy(s2.seed, 15_000), 15_000)).status).toBe(422);
    // 출현 수보다 많이 잡았다는 판
    const s3 = await begin(v, { game: "hunt", difficulty: "easy" });
    const over = clearEasy(s3.seed);
    over.kills.scope_creep = (over.kills.scope_creep ?? 0) + 500;
    expect((await submit(v, s3, over, 101_000)).status).toBe(422);
    expect(await mobDexOf(v.id)).toEqual({});
  });

  it("8초 미만 판(보상 없음)과 처치 없는 판은 기록하지 않는다", async () => {
    const v = await newVisitor();
    const s = await begin(v, { game: "hunt", difficulty: "easy" });
    const r = (await (await submit(v, s, { ...clearEasy(s.seed, 5_000), wavesCleared: 0 }, 5_500)).json()) as RunFinishResponse;
    expect(r.reward.newMobs).toBeUndefined();
    const s2 = await begin(v, { game: "hunt", difficulty: "easy" });
    const r2 = (await (await submit(v, s2, { ...clearEasy(s2.seed), kills: {}, wavesCleared: 0 }, 101_000)).json()) as RunFinishResponse;
    expect(r2.reward.newMobs).toBeUndefined();
    expect(await mobDexOf(v.id)).toEqual({});
  });

  it("모르는 몬스터 id는 판 형식에서 거절되고, 도감 기록 함수도 모르는 id·0 이하는 버린다", async () => {
    const v = await newVisitor();
    const s = await begin(v, { game: "hunt", difficulty: "easy" });
    const bad = clearEasy(s.seed);
    (bad.kills as Record<string, number>).not_a_monster = 1;
    expect((await submit(v, s, bad, 101_000)).status).toBe(400);
    const r = await recordMobKills(v.id, { not_a_monster: 3, f_carp: 2, scope_creep: 0, req_change: -1, prod_dragon: 2 }, Date.now(), "test");
    expect(r.fresh).toEqual(["prod_dragon"]);
    expect(await mobDexOf(v.id)).toEqual({ prod_dragon: expect.objectContaining({ n: 2 }) });
    // 몬스터가 아닌 도감 칸(물고기)은 건드리지 않는다
    expect((await getForageStore().dex(v.id)).dex.f_carp).toBeUndefined();
  });

  it("운영자도 기록한다 (도감 랭킹은 없다)", async () => {
    const v = await newVisitor();
    await setStaff(v.id);
    const s = await begin(v, { game: "hunt", difficulty: "easy" });
    const res = await submit(v, s, clearEasy(s.seed), 101_000);
    expect(res.status).toBe(200);
    expect(Object.keys(await mobDexOf(v.id)).length).toBeGreaterThan(0);
  });
});

describe("야근 빌딩", () => {
  it("정상 판은 기록하고, 의심 판(부드러운 거절)은 보상은 받아도 도감에는 기록하지 않는다", async () => {
    const v = await newVisitor({ level: 50 });
    const s = await begin(v, { game: "hunt", difficulty: "hell", tower: 1 });
    const ok = climbed(s, 3);
    const r = (await (await submit(v, s, ok, climbMs(3))).json()) as RunFinishResponse;
    expect(r.reward.tower?.suspect).toBeUndefined();
    expect(new Set(r.reward.newMobs)).toEqual(new Set(Object.keys(ok.kills)));
    const before = await mobDexOf(v.id);
    for (const [id, n] of Object.entries(ok.kills)) expect(before[id].n).toBe(n);

    // 4층을 깼다는데 4층 몬스터 처치가 없다 → 의심 판
    const sx = await begin(v, { game: "hunt", difficulty: "hell", tower: 1 });
    const x = (await (await submit(v, sx, { ...climbed(sx, 3), floors: 4 }, climbMs(4))).json()) as RunFinishResponse;
    expect(x.reward.tower?.suspect).toBe(true);
    expect(x.reward.newMobs).toBeUndefined();
    expect(await mobDexOf(v.id)).toEqual(before);
  });
});

describe("보상 · 칭호 · 남의 도감", () => {
  it("처음 등록 보상은 몬스터마다 한 번, 하루 도감 한도를 넘는 만큼은 받을 도감 보상으로 남는다", async () => {
    const v = await newVisitor();
    const all = Object.fromEntries(dexIdsOf("mob").map((id) => [id, 1]));
    const first = await recordMobKills(v.id, all, Date.now(), "test");
    expect(first.fresh).toHaveLength(dexIdsOf("mob").length);
    const sum = dexIdsOf("mob").reduce((n, id) => n + dexRewardOf(id), 0);
    expect(first.dex!.points).toBe(sum);
    expect(first.dex!.earned).toBeLessThanOrEqual(earnRule("dex").dailyMax);
    expect(first.dex!.pending).toBeGreaterThan(0);
    expect(first.dex!.titles).toEqual([DEX_TITLES.mob[50], DEX_TITLES.mob[100]]);
    expect((await getForageStore().dexPay(v.id)).pending.mob).toBe(first.dex!.pending);
    // 다시 잡아도 등록·보상 없음
    const again = await recordMobKills(v.id, all, Date.now(), "test");
    expect(again.fresh).toEqual([]);
    expect(again.dex).toBeUndefined();
    expect((await getForageStore().dexPay(v.id)).pending.mob).toBe(first.dex!.pending);
  });

  it("남의 도감(프로필·게임 안 구경)에도 몬스터 칸 기록과 칭호가 보인다", async () => {
    const v = await newVisitor();
    const half = dexIdsOf("mob").slice(0, Math.ceil(dexIdsOf("mob").length / 2));
    await recordMobKills(v.id, Object.fromEntries(half.map((id) => [id, 120])), Date.now(), "test");
    const d = await publicDex(v.id);
    expect(Object.keys(d.dex).filter((id) => dexIdsOf("mob").includes(id))).toHaveLength(half.length);
    expect(d.dex[half[0]]).toMatchObject({ n: 120 });
    expect(d.titles).toContain(DEX_TITLES.mob[50]);
    expect(d.titles).not.toContain(DEX_TITLES.mob[100]);
  });
});
