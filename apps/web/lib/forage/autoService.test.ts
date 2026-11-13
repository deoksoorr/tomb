import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as autoRoute from "@/app/api/forage/auto/route";
import * as session from "@/app/api/session/route";
import { kstDay } from "../store/accounts";
import { AUTO_FISH_DAILY_MAX, AUTO_FISH_EVERY_MS, autoCatchTimes, beatAuto, newAutoSession, rollAutoCatch } from "./auto";
import { beatAutoFish } from "./autoSettle";
import { rollAutoSunken } from "./sunken";
import { DAILY_CATCH_MAX } from "./catalog";
import { getFishRank } from "./fishRank";
import { castLine, startAutoFish, stopAutoFish, syncAutoFish } from "./service";
import { getForageStore } from "./store";
import type { AutoFishResponse } from "./types";

// 자동 낚시 서버 흐름 (로컬 메모리 저장소). 시각은 now 인자로 흐르게 한다.

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;
const PIER = "f_1172_932"; // 호수 낚시 잔교 끝
const T0 = Date.UTC(2026, 10, 12, 3, 0); // KST 12:00
const acct = () => `t-auto-${nanoid(8)}`;

/** from부터 every마다 정산(보이는 탭)하며 until까지. 받은 것 모두 */
async function syncEvery(a: string, from: number, until: number, every: number) {
  const out: AutoFishResponse[] = [];
  for (let t = from + every; t <= until; t += every) out.push(await syncAutoFish(a, t));
  return out;
}
/** 받은 수 (물고기 + 아주 드물게 걸린 물에 빠진 꾸미기 — 둘 다 낚시 1회) */
const caught = (r: AutoFishResponse) => r.items.length + r.gear.length;
const got = (rs: AutoFishResponse[]) => rs.reduce((n, r) => n + caught(r), 0);

describe("자동 낚시 정산", () => {
  it("켜고 30분 보이는 채 정산하면 30분어치, 다시 정산해도 더 안 나온다", async () => {
    const a = acct();
    const r0 = await startAutoFish(a, PIER, 3, T0);
    expect(r0.auto).toMatchObject({ spot: PIER, water: "lake", today: 0, cap: AUTO_FISH_DAILY_MAX, limited: false });
    const rs = await syncEvery(a, T0, T0 + 30 * MIN, 1.5 * MIN);
    const n = Math.floor((30 * MIN) / AUTO_FISH_EVERY_MS);
    expect(got(rs)).toBe(n);
    expect(caught(await syncAutoFish(a, T0 + 30 * MIN))).toBe(0);
    const st = rs[rs.length - 1];
    expect(st.state.today).toMatchObject({ fish: n, auto: n, autoCap: AUTO_FISH_DAILY_MAX });
    expect(st.auto?.today).toBe(n);
  });

  it("마리마다 그 시각 조건으로 시드 + 번호 굴림과 같은 결과 (결정적)", async () => {
    const a = acct();
    await startAutoFish(a, PIER, null, T0);
    const raw = await getForageStore().autoGet(a);
    const s0 = JSON.parse(raw!) as ReturnType<typeof newAutoSession>;
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    const s = beatAuto(s0, T0 + 10 * MIN);
    const want = autoCatchTimes(s, 1, caught(r)).map((t, i) => rollAutoCatch(s0.seed, i + 1, "lake", t)!);
    // 물에 빠진 꾸미기가 걸린 번호는 빼고 비교 (그 번호는 꾸미기로 나간다)
    const fish = want.filter((_, i) => rollAutoSunken(s0.seed, i + 1) === null);
    expect(r.items.map((x) => [x.id, x.size])).toEqual(fish.map((x) => [x.id, x.size]));
  });

  it("숨은 탭: 머무르기 기록으로 접속을 이어 가고, 끊긴 시간은 빼고 돌아와서 받는다", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    for (let t = T0 + 10 * MIN; t <= T0 + 20 * MIN; t += 10 * MIN) await beatAutoFish(a, t); // 20분 접속
    // 2시간 끊겼다가(머무르기 기록 없음) 돌아와 정산
    const back = T0 + 20 * MIN + 2 * 3_600_000;
    const r = await syncAutoFish(a, back);
    expect(caught(r)).toBe(Math.floor((20 * MIN) / AUTO_FISH_EVERY_MS));
    expect(r.auto).not.toBeNull();
  });

  it("자동은 하루 75마리까지 (넘는 것은 놓아준다), 그 뒤엔 켤 수 없다", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    for (let t = T0 + 10 * MIN; t <= T0 + 60 * MIN; t += 10 * MIN) await beatAutoFish(a, t);
    const r = await stopAutoFish(a, T0 + 60 * MIN);
    expect(caught(r)).toBe(AUTO_FISH_DAILY_MAX);
    expect(r.dropped).toBe(Math.floor((60 * MIN) / AUTO_FISH_EVERY_MS) - AUTO_FISH_DAILY_MAX);
    expect(r.ended).toBe("stop");
    expect(r.auto).toBeNull();
    await expect(startAutoFish(a, PIER, 1, T0 + 61 * MIN)).rejects.toMatchObject({ status: 429, code: "AUTO_LIMIT" });
  });

  it("직접 낚은 것과 합쳐 하루 150마리를 넘지 않는다", async () => {
    const a = acct();
    const day = kstDay(T0);
    await getForageStore().grant(a, day, "fish", Array.from({ length: DAILY_CATCH_MAX.fish - 10 }, () => ({ id: "f_crucian", size: 100 })), 99);
    await startAutoFish(a, PIER, 1, T0);
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    expect(caught(r)).toBe(10);
    expect(r.state.today).toMatchObject({ fish: DAILY_CATCH_MAX.fish, auto: 10 });
    expect(r.auto?.limited).toBe(true);
  });

  it("한국 시간 자정이 지나면 그날 한도로 새로 센다 (마리마다 낚인 날 기준)", async () => {
    const a = acct();
    const start = Date.UTC(2026, 10, 12, 14, 30); // KST 23:30
    const midnight = Date.UTC(2026, 10, 12, 15, 0);
    await startAutoFish(a, PIER, 1, start);
    for (let t = start + 5 * MIN; t <= start + 70 * MIN; t += 5 * MIN) await beatAutoFish(a, t);
    const r = await syncAutoFish(a, start + 70 * MIN);
    const before = Math.ceil((midnight - start) / AUTO_FISH_EVERY_MS) - 1; // 자정 정각에 낚인 것은 다음 날
    const store = getForageStore();
    expect((await store.snapshot(a, kstDay(start), 0)).day.auto).toBe(before);
    expect((await store.snapshot(a, kstDay(midnight), 0)).day.auto).toBe(AUTO_FISH_DAILY_MAX);
    expect(caught(r)).toBe(before + AUTO_FISH_DAILY_MAX);
  });

  it("동시에 여러 번 정산해도 한 번만 지급된다", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    const rs = await Promise.all(Array.from({ length: 6 }, () => syncAutoFish(a, T0 + 10 * MIN)));
    expect(got(rs)).toBe(Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS));
    expect((await getForageStore().snapshot(a, kstDay(T0), 0)).day.auto).toBe(got(rs));
    const stops = await Promise.all([stopAutoFish(a, T0 + 11 * MIN), stopAutoFish(a, T0 + 11 * MIN), syncAutoFish(a, T0 + 11 * MIN)]);
    expect(got(stops)).toBe(Math.floor((11 * MIN) / AUTO_FISH_EVERY_MS) - got(rs));
  });

  it("최대어 순위·최대 크기 기록은 하지 않는다 (직접 낚은 것만)", async () => {
    const a = acct();
    const rank = vi.spyOn(getFishRank(), "record");
    await startAutoFish(a, PIER, 1, T0);
    const r = await stopAutoFish(a, T0 + 10 * MIN);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((x) => !x.record)).toBe(true);
    expect(Object.values(r.state.dex).every((d) => d.max === 0)).toBe(true);
    expect(rank).not.toHaveBeenCalled();
  });

  it("6시간이 지나면 정산하고 끝난다", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    for (let t = T0 + 10 * MIN; t <= T0 + 7 * 3_600_000; t += 10 * MIN) await beatAutoFish(a, t);
    const r = await syncAutoFish(a, T0 + 7 * 3_600_000);
    expect(r.ended).toBe("time");
    expect(r.auto).toBeNull();
    expect(caught(r)).toBe(AUTO_FISH_DAILY_MAX);
  });

  it("직접 찌를 던지면 자동 낚시는 정산하고 끝난다", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    await syncAutoFish(a, T0 + 2 * MIN);
    await castLine(a, PIER, T0 + 3 * MIN);
    expect(await getForageStore().autoGet(a)).toBeNull();
    expect((await getForageStore().snapshot(a, kstDay(T0), 0)).day.auto).toBe(Math.floor((3 * MIN) / AUTO_FISH_EVERY_MS));
  });

  it("다시 켜면 이전 세션을 정산하고 새로 시작한다, 모르는 자리는 400", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    const r = await startAutoFish(a, "boat:river", 2, T0 + 5 * MIN);
    expect(caught(r)).toBe(Math.floor((5 * MIN) / AUTO_FISH_EVERY_MS));
    expect(r.auto).toMatchObject({ spot: "boat:river", water: "river", startedAt: T0 + 5 * MIN });
    await expect(startAutoFish(a, "f_1_1", 1, T0)).rejects.toMatchObject({ status: 400 });
  });
});

describe("자동 낚시 라우트", () => {
  const req = (cookie: string | null, body: unknown) =>
    new NextRequest("http://localhost/api/forage/auto", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  it("세션이 없으면 401, 잘못된 입력은 400, 켜기 → 정산 → 끄기", async () => {
    expect((await autoRoute.POST(req(null, { action: "sync" }))).status).toBe(401);
    const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    expect((await autoRoute.POST(req(cookie, { action: "start", spot: "nowhere" }))).status).toBe(400);
    expect((await autoRoute.POST(req(cookie, { action: "jump" }))).status).toBe(400);
    const on = (await (await autoRoute.POST(req(cookie, { action: "start", spot: PIER, ch: 2 }))).json()) as AutoFishResponse;
    expect(on.auto?.spot).toBe(PIER);
    const sync = (await (await autoRoute.POST(req(cookie, { action: "sync" }))).json()) as AutoFishResponse;
    expect(sync.auto).not.toBeNull();
    const off = (await (await autoRoute.POST(req(cookie, { action: "stop" }))).json()) as AutoFishResponse;
    expect(off).toMatchObject({ auto: null, ended: "stop" });
    const none = (await (await autoRoute.POST(req(cookie, { action: "stop" }))).json()) as AutoFishResponse;
    expect(none).toMatchObject({ auto: null, items: [] });
  });
});
