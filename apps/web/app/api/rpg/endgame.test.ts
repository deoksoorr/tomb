import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { tExpToNext, TRANSCEND_EXP_MUL } from "@/lib/rpg/endgame";
import { floorTExp, TOWER_FLOOR_POINTS, towerPlan, towerZone } from "@/lib/rpg/tower";
import { getTowerStore } from "@/lib/rpg/towerStore";
import { getMegaphone } from "@/lib/store";
import type { MonsterId } from "@/lib/rpg/catalog";
import * as rank from "../rank/route";
import { huntPlan } from "@/lib/rpg/plan";
import { forgetEndgameLaunch } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import type { CharacterState, RpgView, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { setStaff } from "@/lib/staff";
import { kstDay } from "@/lib/store/accounts";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";
import * as rpg from "./route";

// 11/15 사냥 끝판 API: 초월 판 구간·초월 EXP, 야근 빌딩(시작 검사·층 정산·상자·기록·랭킹·서버 최초·꼭대기 층)·개척자 번호.
// 로컬 구성(MemoryRpgStore)으로 라우트를 직접 부른다

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
  forgetEndgameLaunch();
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

async function newVisitor(patch: Partial<CharacterState> = { level: 50 }): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.15.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getRpgStore().update(v.id, (s) => ({ state: { ...s, runs: 1, ...patch }, result: null }));
  return v;
}

const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const startBody = (tower?: number, zone?: string) => ({ game: "hunt", difficulty: "hell", ...(zone ? { zone } : {}), ...(tower ? { tower } : {}) });

async function begin(v: Visitor, tower?: number, zone?: string): Promise<RunStartResponse> {
  const res = await start.POST(call("/api/rpg/run/start", v, startBody(tower, zone)));
  expect(res.status).toBe(200);
  return (await res.json()) as RunStartResponse;
}

/** 계획대로 모든 웨이브를 깬 결과 */
function clearAll(s: RunStartResponse, extra: { died?: boolean; potionsUsed?: Record<string, number> } = {}) {
  const plan = huntPlan(s.seed, "hell", s.zone);
  const kills: Record<string, number> = {};
  for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt" as const, durationMs: 150_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {}, ...extra };
}

async function end(v: Visitor, s: RunStartResponse, result: object = clearAll(s), after = 151_000): Promise<RunFinishResponse> {
  const real = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(real + after);
  const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result }));
  vi.restoreAllMocks();
  expect(res.status).toBe(200);
  return (await res.json()) as RunFinishResponse;
}

describe("초월 판 (지옥 사냥)", () => {
  it("레벨 50 미만 지옥 판은 초월 판이 아니다 (티켓에 구간 없음, EXP는 보통 레벨로)", async () => {
    const v = await newVisitor({ level: 45 });
    const s = await begin(v, undefined, "quarter-close");
    expect(s.tier).toBeUndefined();
    const r = await end(v, s);
    expect(r.reward.transcend).toBeUndefined();
    expect(r.view.endgame).toBeUndefined();
    expect(r.reward.newLevel).toBeGreaterThan(45);
  });
});


  it("어제 기록은 새벽 5시 뒤 첫 판에 넘어간다 (남은 100% 판은 적립)", async () => {
    const v = await newVisitor({ level: 50, tDay: "20200101", tRuns: 5, tBank: 0 });
    const s = await begin(v, undefined, "layoff-day");
    expect(s.tier).toBe("full");
    const c = await getRpgStore().get(v.id);
    expect(c.tDay).toBe(kstDay());
    expect(c.tRuns).toBe(1);
    expect(c.tBank).toBe(40);
  });

describe("초월 판 보상", () => {
  it("레벨 50 지옥 판: 판 EXP × 배율 → 초월 EXP (100% 구간), 일반 EXP는 그대로 0", async () => {
    const v = await newVisitor();
    const s = await begin(v, undefined, "layoff-day");
    expect(s.tier).toBe("full");
    const r = await end(v, s);
    const t = r.reward.transcend!;
    expect(t.tier).toBe("full");
    expect(t.exp).toBe(Math.round(r.reward.exp * TRANSCEND_EXP_MUL));
    expect(t.exp).toBeGreaterThan(900);
    expect(r.view.character.tExp).toBe(t.exp);
    expect(r.view.character.exp).toBe(0);
    expect(r.view.character.level).toBe(50);
  });

  it("11/15 하루 판 수 제한 없음: 61번째 판도 초월 EXP 100%·드롭 그대로", async () => {
    const v = await newVisitor({ level: 50, tDay: kstDay(), tRuns: 60, tBank: 0 });
    const s = await begin(v, undefined, "layoff-day");
    expect(s.tier).toBe("full");
    const r = await end(v, s);
    expect(r.reward.transcend!.exp).toBe(Math.round(r.reward.exp * TRANSCEND_EXP_MUL));
    expect(r.reward.points).toBeGreaterThan(0);
  });

  it("초월 레벨이 오르면 5레벨마다 능력치 포인트", async () => {
    const v = await newVisitor({ level: 50, tLevel: 4, tExp: tExpToNext(4) - 500, statPoints: 0 });
    const r = await end(v, await begin(v, undefined, "layoff-day"));
    expect(r.reward.transcend!.levelsGained).toBe(1);
    expect(r.view.character.tLevel).toBe(5);
    expect(r.view.character.statPoints).toBe(1);
  });
});


/** 시작 층부터 floors층을 깨고 다음 층에서 쓰러진 결과 (층마다 45초) */
function climbed(s: RunStartResponse, floors: number, extra: object = {}) {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++) for (const w of towerPlan(s.seed, s.tower! + i, s.tower!)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt" as const, durationMs: floors * 45_000 + 3_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 45_000, ...extra };
}
const climbMs = (floors: number) => floors * 45_000 + 4_000;

describe("야근 빌딩 시작 검사 (서버)", () => {
  it("레벨 50이 아니면 거절, 지옥 사냥이 아니면 거절, 불 꺼진 층은 거절", async () => {
    const low = await newVisitor({ level: 49 });
    const r1 = await start.POST(call("/api/rpg/run/start", low, startBody(1)));
    expect(r1.status).toBe(403);
    expect(await errCode(r1)).toBe("LEVEL_LOW");
    const v = await newVisitor({ level: 50, fBest: 15 });
    expect((await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "hard", tower: 1 }))).status).toBe(400);
    const r2 = await start.POST(call("/api/rpg/run/start", v, startBody(21)));
    expect(r2.status).toBe(403);
    expect(await errCode(r2)).toBe("TOWER_LOCKED");
    expect((await start.POST(call("/api/rpg/run/start", v, startBody(5)))).status).toBe(400);
    // 11층은 열렸다 — 사냥터는 화면이 보낸 것과 상관없이 판 시드로 정한다 (11/15: 테마 순서는 판마다 무작위)
    const ok = await begin(v, 11, "burnout-abyss");
    expect(ok.tower).toBe(11);
    expect(ok.zone).toBe(towerZone(ok.seed, 11, 11).id);
    expect(ok.tier).toBeUndefined();
    // 시작할 때는 초월 판을 세지 않는다 (캐릭터 저장 없음)
    expect((await getRpgStore().get(v.id)).tRuns).toBe(0);
    // 긴 등반도 받는다 (두 시간)
    expect(ok.timeLimitSec).toBe(7200);
  });

  it("도전 횟수 제한이 없다 (하루 여러 번)", async () => {
    const v = await newVisitor();
    for (let i = 0; i < 7; i++) expect((await begin(v, 1)).tower).toBe(1);
    const view = (await (await rpg.GET(call("/api/rpg", v))).json()) as RpgView;
    expect(view.endgame?.tower).toEqual({ best: 0, week: null, checkpoints: [1], chests: 0, chestsMax: 0 });
    expect(view.endgame?.day.runs).toBe(0);
  });
});

describe("야근 빌딩 판 끝 정산", () => {
  it("깬 층마다 초월 EXP, 4층 = 초월 판 1판, 5층 우두머리 상자, 최고 기록·이번 주 랭킹, 포인트", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 6), climbMs(6));
    const w = r.reward.tower!;
    expect(w).toMatchObject({ start: 1, floors: 6, best: 6, newBest: true, newWeek: true, runs: 1, chests: [5], emptyChests: 0 });
    expect(r.reward.transcend!.exp).toBe([1, 2, 3, 4, 5, 6].reduce((n, f) => n + floorTExp(f), 0));
    expect(r.reward.pointsRaw).toBe(6 * TOWER_FLOOR_POINTS);
    const c = await getRpgStore().get(v.id);
    expect([c.tRuns, c.tFl, c.tChest, c.fBest]).toEqual([1, 2, 1, 6]);
    expect(r.view.endgame?.tower).toMatchObject({ best: 6, week: { floor: 6 }, chests: 1, checkpoints: [1] });
    expect(r.view.endgame?.day.floors).toBe(2);
    // 랭킹 (이번 주·전체)
    const board = async (period: string) => (await (await rank.GET(call(`/api/rank?board=tower&period=${period}&me=1`, v))).json()) as { rows: { value: number; me: boolean }[]; mine: unknown };
    for (const p of ["week", "all"]) expect((await board(p)).rows.find((x) => x.me)?.value).toBe(6);
    // 같은 층을 더 느리게: 기록은 그대로 (랭킹을 쓰지 않는다)
    const s2 = await begin(v, 1);
    const r2 = await end(v, s2, { ...climbed(s2, 6), floorMs: 6 * 45_000 + 30_000, durationMs: 6 * 45_000 + 40_000 }, climbMs(6) + 40_000);
    expect(r2.reward.tower).toMatchObject({ newBest: false, newWeek: false });
    expect((await getTowerStore().scoreOf(v.id))).not.toBeNull();
  });

  it("거짓 층은 보상 없이 거절, Esc로 그만두면 깬 층까지 기록", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: { ...climbed(s, 3), floors: 4 } }));
    expect(res.status).toBe(422);
    const s2 = await begin(v, 1);
    const q = await end(v, s2, climbed(s2, 3, { died: false, quit: true }), climbMs(3));
    expect(q.reward.tower).toMatchObject({ floors: 3, best: 3 });
  });

  it("11/15 우두머리 상자는 하루 개수 제한 없음", async () => {
    const v = await newVisitor({ level: 50, tDay: kstDay(), tChest: 14 });
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 10), climbMs(10));
    expect(r.reward.tower).toMatchObject({ chests: [5, 10], emptyChests: 0 });
    expect((await getRpgStore().get(v.id)).tChest).toBe(16);
  });
});

describe("서버 최초 · 꼭대기 층 주인 · 개척자 (운영자 제외)", () => {
  it("처음 30층을 깬 한 사람만 「최초 결재자」, 운영자는 먼저 올라도 차지하지 않는다, 확성기 알림", async () => {
    const op = await newVisitor({ level: 50, fBest: 25 });
    await setStaff(op.id);
    try {
      const so = await begin(op, 21);
      const ro = await end(op, so, climbed(so, 10), climbMs(10));
      expect(ro.reward.tower!.titles).toEqual([]);
      expect(ro.reward.pioneer).toBeUndefined();
    } finally {
      await setStaff(null);
    }
    expect((await getTowerStore().firsts()).t_first30).toBeUndefined();
    expect(await getTowerStore().scoreOf(op.id)).toBeNull();

    const a = await newVisitor({ level: 50, fBest: 25 });
    const sa = await begin(a, 21);
    const ra = await end(a, sa, climbed(sa, 10), climbMs(10));
    expect(ra.reward.tower!.titles).toContain("t_first30");
    expect(ra.reward.tower!.titles).toContain("t_topFloor");
    expect((await getTowerStore().firsts()).t_first30).toBe(a.id);
    const notices = (await getMegaphone().recent(20)).map((m) => m.text);
    expect(notices.some((t) => t.includes("서버 최초로 30층"))).toBe(true);
    expect(notices.some((t) => t.includes("꼭대기 층을 차지했어요 (30층)"))).toBe(true);

    // 둘째로 30층: 서버 최초는 없고, 같은 층이라 꼭대기도 그대로 (먼저 오른 사람)
    const b = await newVisitor({ level: 50, fBest: 25 });
    const sb = await begin(b, 21);
    const rb = await end(b, sb, climbed(sb, 10), climbMs(10));
    expect(rb.reward.tower!.titles).toEqual([]);
    expect((await getTowerStore().topHolder())?.accountId).toBe(a.id);
    // 더 높이 오르면 꼭대기 층이 넘어간다
    const sb2 = await begin(b, 21);
    const rb2 = await end(b, sb2, climbed(sb2, 12), climbMs(12));
    expect(rb2.reward.tower!.titles).toEqual(["t_topFloor"]);
    expect(await getTowerStore().topHolder()).toMatchObject({ accountId: b.id, floor: 32 });
  });

  it("개척자: 야근 빌딩 5층·★51에 차례대로 번호 (한 번만)", async () => {
    const a = await newVisitor();
    const sa = await begin(a, 1);
    const ra = await end(a, sa, climbed(sa, 4), climbMs(4));
    expect(ra.reward.pioneer).toBeUndefined();
    const sa2 = await begin(a, 1);
    const n = (await end(a, sa2, climbed(sa2, 5), climbMs(5))).reward.pioneer!;
    expect(n).toBeGreaterThan(0);
    const sa3 = await begin(a, 1);
    expect((await end(a, sa3, climbed(sa3, 5), climbMs(5))).reward.pioneer).toBeUndefined();
    // ★51 (지옥 사냥 초월 EXP로)
    const b = await newVisitor({ level: 50, tExp: 14_900 });
    const rb = await end(b, await begin(b, undefined, "layoff-day"));
    expect(rb.view.character.tLevel).toBe(1);
    expect(rb.reward.pioneer).toBe(n + 1);
  });
});
