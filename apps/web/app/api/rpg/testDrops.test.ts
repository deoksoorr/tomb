import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { gearGrade } from "@/components/rpg/gear";
import { lootLook } from "@/game/rpg/lootLook";
import { DIFFS, gearById, zonesOf, type Difficulty } from "@/lib/rpg/catalog";
import { huntPlan } from "@/lib/rpg/plan";
import { huntDropsFor } from "@/lib/rpg/rewards";
import { getRpgStore } from "@/lib/rpg/store";
import { getTestDropStore, MemoryTestDrops, resolveTestDrops, TEST_DROP_PRESET } from "@/lib/rpg/testDrops";
import type { Drop, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { setStaff } from "@/lib/staff";
import * as adminDrops from "../admin/rpg/test-drops/route";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";

// 테스트 서버 운영자 시험 드롭 예약: 예약 순서대로 한 판씩 꺼내고, 판 끝에 실제로 그 드롭을 주며(화면에 알린 것과 같다),
// 운영 서버에서는 경로가 404이고 예약이 있어도 꺼내지도·주지도 않는다. 일반 계정 드롭은 그대로.

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

function call(path: string, v?: Visitor, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (v) Object.assign(h, { cookie: v.cookie, "x-forwarded-for": v.ip });
  if (body !== undefined) h["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
const admin = (body?: unknown) => call("/api/admin/rpg/test-drops", undefined, body, { "x-admin-key": "dev-admin" });

async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.8.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}

async function startHunt(v: Visitor, difficulty = "hard", zone = "deadline-swamp") {
  const res = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty, zone }));
  expect(res.status).toBe(200);
  return (await res.json()) as RunStartResponse;
}

/** 첫 웨이브만 잡고 쓰러진 판 (굴림으로는 드롭이 거의 없다) */
function diedEarly(seed: number, difficulty: Difficulty = "hard", zone = "deadline-swamp") {
  const plan = huntPlan(seed, difficulty, zone as never);
  const kills: Record<string, number> = {};
  for (const m of plan[0].monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt" as const, durationMs: 30_000, kills, wavesCleared: 1, died: true, potionsUsed: {} };
}

async function finishWith(v: Visitor, ticket: string, result: ReturnType<typeof diedEarly>) {
  const real = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(real + 31_000);
  const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket, result }));
  vi.restoreAllMocks();
  expect(res.status).toBe(200);
  return (await res.json()) as RunFinishResponse;
}

const gradeOf = (d: Drop) => (d.kind === "gear" ? gearGrade(gearById(d.id)!).id : d.kind);

describe("시험 드롭 고르기", () => {
  it("등급이 맞고, 그 사냥터 드롭 범위에 그 등급이 있으면 범위 안에서 고른다", () => {
    let r = 1;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (const d of Object.keys(DIFFS) as Difficulty[])
      for (const z of zonesOf(d))
        for (let i = 0; i < 20; i++) {
          const [a, b] = resolveTestDrops(TEST_DROP_PRESET[0], d, z.id, rnd);
          const [c, e] = resolveTestDrops(TEST_DROP_PRESET[1], d, z.id, rnd);
          expect([gradeOf(a), gradeOf(b), gradeOf(c), gradeOf(e)]).toEqual(["fine", "rare", "cosmetic", "legend"]);
          const max = DIFFS[d].dropMaxLevel;
          // 어려움·지옥은 전설이 드롭 범위 안에 있다
          if (d === "hard" || d === "hell") expect(gearById(e.id)!.reqLevel).toBeGreaterThanOrEqual(max - 20);
        }
  });

  it("메모리 예약: 넣은 순서대로 한 판씩, 다 꺼내면 null", async () => {
    const s = new MemoryTestDrops();
    await s.set("a", TEST_DROP_PRESET);
    expect(await s.list("a")).toHaveLength(2);
    expect(await s.pop("a")).toEqual(TEST_DROP_PRESET[0]);
    expect(await s.pop("a")).toEqual(TEST_DROP_PRESET[1]);
    expect(await s.pop("a")).toBeNull();
    await s.set("a", TEST_DROP_PRESET);
    await s.set("a", []);
    expect(await s.list("a")).toEqual([]);
  });
});

describe("시험 드롭 예약 → 두 판", () => {
  it("1판 고급+희귀, 2판 꾸미기 선물+전설을 실제로 주고, 화면에 알린 것과 같다. 셋째 판부터는 원래대로", async () => {
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      const set = (await (await adminDrops.POST(admin({ action: "preset" }))).json()) as adminDrops.AdminTestDropsResponse;
      expect(set).toEqual({ staffId: op.id, left: ["고급+희귀", "꾸미기 선물+전설"] });

      // 1판: 쓰러져도 예약 드롭
      const s1 = await startHunt(op);
      expect(s1.testDrops!.map(gradeOf)).toEqual(["fine", "rare"]);
      expect(s1.testDrops!.map((d) => lootLook(d)!.tier)).toEqual([1, 2]);
      const before = { ...(await getRpgStore().get(op.id)).inv };
      const f1 = await finishWith(op, s1.ticket, diedEarly(s1.seed));
      expect(f1.reward.drops).toEqual(s1.testDrops);
      const inv = (await getRpgStore().get(op.id)).inv;
      for (const d of s1.testDrops!) expect(inv[d.id] ?? 0).toBeGreaterThan(before[d.id] ?? 0);
      expect(((await (await adminDrops.GET(admin())).json()) as adminDrops.AdminTestDropsResponse).left).toEqual(["꾸미기 선물+전설"]);

      // 2판: 꾸미기 선물(실제 꾸미기 — 이미 가진 것이면 다음 후보) + 전설
      const s2 = await startHunt(op);
      expect(s2.testDrops!.map(gradeOf)).toEqual(["cosmetic", "legend"]);
      expect(s2.testDrops!.map((d) => lootLook(d)!.tier)).toEqual([2, 3]);
      const f2 = await finishWith(op, s2.ticket, diedEarly(s2.seed));
      expect(f2.reward.drops.map(gradeOf)).toEqual(["cosmetic", "legend"]);
      expect(f2.reward.drops[1]).toEqual(s2.testDrops![1]);

      // 셋째 판: 예약이 없으니 원래 굴림 그대로
      const s3 = await startHunt(op);
      expect(s3.testDrops).toBeUndefined();
      const r3 = diedEarly(s3.seed);
      const f3 = await finishWith(op, s3.ticket, r3);
      expect(f3.reward.drops).toEqual(huntDropsFor({ game: "hunt", difficulty: "hard", seed: s3.seed, zone: "deadline-swamp" }, r3));
    } finally {
      await setStaff(null);
    }
  });

  it("운영자가 아니면 예약이 있어도 쓰이지 않는다", async () => {
    const someone = await newVisitor();
    await getTestDropStore().set(someone.id, TEST_DROP_PRESET);
    const s = await startHunt(someone, "easy", "meeting-room");
    expect(s.testDrops).toBeUndefined();
    expect(await getTestDropStore().list(someone.id)).toHaveLength(2);
    await getTestDropStore().set(someone.id, []);
  });

  it("운영 서버: 경로는 404, 운영자 예약이 있어도 꺼내지 않고, 티켓에 실려 있어도 굴림대로 준다", async () => {
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      await adminDrops.POST(admin({ action: "preset" }));
      // 테스트 서버에서 시작해 시험 드롭이 실린 티켓 → 운영으로 바뀐 서버에서 끝내기
      const s1 = await startHunt(op);
      expect(s1.testDrops).toHaveLength(2);
      vi.stubEnv("VERCEL_ENV", "production");
      expect((await adminDrops.GET(admin())).status).toBe(404);
      expect((await adminDrops.POST(admin({ action: "clear" }))).status).toBe(404);
      const r1 = diedEarly(s1.seed);
      const f1 = await finishWith(op, s1.ticket, r1);
      expect(f1.reward.drops).toEqual(huntDropsFor({ game: "hunt", difficulty: "hard", seed: s1.seed, zone: "deadline-swamp" }, r1));
      // 운영에서 시작한 판: 남은 예약을 꺼내지 않는다 (운영에서는 슈퍼 계정도 아니라 Lv.1 사냥터로)
      const s2 = await startHunt(op, "easy", "meeting-room");
      expect(s2.testDrops).toBeUndefined();
      expect(await getTestDropStore().list(op.id)).toHaveLength(1);
    } finally {
      vi.stubEnv("VERCEL_ENV", "");
      await getTestDropStore().set(op.id, []);
      await setStaff(null);
    }
  });
});
