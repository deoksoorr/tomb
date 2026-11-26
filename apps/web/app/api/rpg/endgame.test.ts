import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { tExpToNext, TRANSCEND_EXP_MUL } from "@/lib/rpg/endgame";
import { floorTExp, isCheckpoint, isChestFloor, nextCheckpoint, TOWER_CHEST_FROM, TOWER_LOW_CHECKPOINTS, towerFloorPoints, towerOfScore, towerPlan, towerReachedLabel, towerZone } from "@/lib/rpg/tower";
import { getTowerStore } from "@/lib/rpg/towerStore";
import { getAccounts, getErrors, getMegaphone } from "@/lib/store";
import { cardOffer, CARD_IDS, runLevel, runLevelBase, runXpOf, startPicks, type CardCounts, type CardPick } from "@/lib/rpg/cards";
import type { MonsterId } from "@/lib/rpg/catalog";
import * as rank from "../rank/route";
import { huntPlan } from "@/lib/rpg/plan";
import { approveReview, forgetEndgameLaunch, listReviews, rejectReview } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import type { CharacterState, RpgView, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { setStaff } from "@/lib/staff";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";
import * as rpg from "./route";

// 11/19 상자 층 경계는 상수에서 (경계가 바뀌어도 그대로 통과하게)
const floorsOf = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);
const chestsIn = (start: number, n: number) => floorsOf(start, n).filter(isChestFloor);
/** f층 이상에서 처음 고를 수 있는 시작 층 (체크포인트) */
const cpFrom = (f: number) => (isCheckpoint(f) ? f : nextCheckpoint(f));
/** 11/19 1층 다음 엘리베이터 (51층 — 50층을 깨면 열린다) */
const CP_MID = TOWER_LOW_CHECKPOINTS[1];

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
    // 11/17 지옥 EXP 배율 11→4: Lv.42 사냥터 한 판이 레벨 45 필요량(약 7,600) 언저리라 레벨이 꼭 오르지는 않는다 → 일반 EXP가 들어왔는지만 본다
    expect(r.reward.exp).toBeGreaterThan(0);
    expect(r.reward.newLevel).toBeGreaterThanOrEqual(45);
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
    expect(t.exp).toBeGreaterThan(225);
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
    const v = await newVisitor({ level: 50, tLevel: 4, tExp: tExpToNext(4) - 100, statPoints: 0 });
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
/** 11/18 서버 최고 층을 새로 깬 기록(꼭대기 층 주인·전체 랭킹)은 관리자 확인 뒤에 → 시험에서는 바로 인정 */
async function approveTops(): Promise<void> {
  for (const i of await listReviews()) if (i.kind === "top") await approveReview(i.id);
}

describe("야근 빌딩 시작 검사 (서버)", () => {
  it("레벨 50이 아니면 거절, 지옥 사냥이 아니면 거절, 불 꺼진 층은 거절", async () => {
    const low = await newVisitor({ level: 49 });
    const r1 = await start.POST(call("/api/rpg/run/start", low, startBody(1)));
    expect(r1.status).toBe(403);
    expect(await errCode(r1)).toBe("LEVEL_LOW");
    const shy = await newVisitor({ level: 50, fBest: CP_MID - 2 });
    expect((await start.POST(call("/api/rpg/run/start", shy, { game: "hunt", difficulty: "hard", tower: 1 }))).status).toBe(400);
    // 49층까지 깼으면 51층 엘리베이터는 아직 불이 꺼져 있다
    const r2 = await start.POST(call("/api/rpg/run/start", shy, startBody(CP_MID)));
    expect(r2.status).toBe(403);
    expect(await errCode(r2)).toBe("TOWER_LOCKED");
    expect((await start.POST(call("/api/rpg/run/start", shy, startBody(5)))).status).toBe(400);
    // 11/19 예전 엘리베이터 층(11층)은 이제 체크포인트가 아니다
    expect((await start.POST(call("/api/rpg/run/start", shy, startBody(11)))).status).toBe(400);
    // 50층을 깼으면 51층이 열렸다 — 사냥터는 화면이 보낸 것과 상관없이 판 시드로 정한다 (11/15: 테마 순서는 판마다 무작위)
    const v = await newVisitor({ level: 50, fBest: CP_MID - 1 });
    const ok = await begin(v, CP_MID, "burnout-abyss");
    expect(ok.tower).toBe(CP_MID);
    expect(ok.zone).toBe(towerZone(ok.seed, CP_MID, CP_MID).id);
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
  it("깬 층마다 초월 EXP, 4층 = 초월 판 1판, 우두머리 상자는 TOWER_CHEST_FROM층부터(11/19), 최고 기록·이번 주 랭킹, 포인트", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 6), climbMs(6));
    const w = r.reward.tower!;
    expect(w).toMatchObject({ start: 1, floors: 6, best: 6, newBest: true, newWeek: true, runs: 1, chests: chestsIn(1, 6), emptyChests: 0 });
    expect(r.reward.transcend!.exp).toBe([1, 2, 3, 4, 5, 6].reduce((n, f) => n + floorTExp(f), 0));
    expect(r.reward.pointsRaw).toBe(6 * towerFloorPoints(1)); // 11/20 1~50층은 층마다 8P
    const c = await getRpgStore().get(v.id);
    expect([c.tRuns, c.tFl, c.tChest ?? 0, c.fBest]).toEqual([1, 2, chestsIn(1, 6).length, 6]);
    expect(r.view.endgame?.tower).toMatchObject({ best: 6, week: { floor: 6 }, chests: chestsIn(1, 6).length, checkpoints: [1] });
    expect(r.view.endgame?.day.floors).toBe(2);
    await approveTops();
    // 랭킹 (이번 주·전체)
    const board = async (period: string) => (await (await rank.GET(call(`/api/rank?board=tower&period=${period}&me=1`, v))).json()) as { rows: { value: number; me: boolean }[]; mine: unknown };
    for (const p of ["week", "all"]) expect((await board(p)).rows.find((x) => x.me)?.value).toBe(6);
    // 같은 층을 더 느리게: 기록은 그대로 (랭킹을 쓰지 않는다)
    const s2 = await begin(v, 1);
    const r2 = await end(v, s2, { ...climbed(s2, 6), floorMs: 6 * 45_000 + 30_000, durationMs: 6 * 45_000 + 40_000 }, climbMs(6) + 40_000);
    expect(r2.reward.tower).toMatchObject({ newBest: false, newWeek: false });
    expect((await getTowerStore().scoreOf(v.id))).not.toBeNull();
  });

  it("서버가 잰 시간보다 긴 기록·층 수 범위 밖은 보상 없이 거절, 몬스터를 덜 잡은 층은 의심 판, Esc로 그만두면 깬 층까지 기록", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    // 판 시작 직후 138초짜리 기록 (서버 시간보다 길다)
    const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: { ...climbed(s, 3), floors: 4 } }));
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe("TOO_FAST");
    const s1 = await begin(v, 1);
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + climbMs(3));
    const out = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s1.ticket, result: { ...climbed(s1, 3), floors: 401 } }));
    vi.restoreAllMocks();
    expect(out.status).toBe(422);
    // 4층을 깼다는데 4층 몬스터 처치가 없다 → 거절하지 않고 의심 판 (랭킹 제외)
    const sx = await begin(v, 1);
    const x = await end(v, sx, { ...climbed(sx, 3), floors: 4 }, climbMs(4));
    expect(x.reward.tower).toMatchObject({ floors: 4, best: 4, suspect: true, newBest: false });
    const s2 = await begin(v, 1);
    const q = await end(v, s2, climbed(s2, 3, { died: false, quit: true }), climbMs(3));
    expect(q.reward.tower).toMatchObject({ floors: 3, best: 3 });
  });

  it("11/16 같은 층이면 먼저 도달한 사람이 위: 도달 시각 = 판 시작 + 그 층을 깬 시간, 같은 층을 다시 올라도 점수 그대로", async () => {
    // 11/19 a는 51층 엘리베이터에서 천천히(층마다 1분 반) 52층까지
    const top = CP_MID + 1;
    const slow = 2 * 90_000;
    const a = await newVisitor({ level: 50, fBest: CP_MID - 1 });
    const t0 = Date.now();
    const sa = await begin(a, CP_MID);
    const t1 = Date.now();
    await end(a, sa, climbed(sa, 2, { floorMs: slow, durationMs: slow + 3_000 }), slow + 4_000);
    await approveTops();
    const scoreA = (await getTowerStore().scoreOf(a.id))!;
    const ta = towerOfScore(scoreA);
    expect(ta.floor).toBe(top);
    expect(ta.at).toBeGreaterThanOrEqual(Math.floor((t0 + slow) / 1000) * 1000);
    expect(ta.at).toBeLessThanOrEqual(t1 + slow);
    expect(await getTowerStore().scoreOf(a.id, kstWeek(t0))).toBe(scoreA);
    // 한 시간 뒤 같은 체크포인트(51층)에서 시작해 1분 반 만에 52층: 판은 빨라도 늦게 도달했으니 아래
    const b = await newVisitor({ level: 50, fBest: CP_MID - 1 });
    vi.spyOn(Date, "now").mockReturnValue(t1 + 3_600_000);
    const sb = await begin(b, CP_MID);
    await end(b, sb, climbed(sb, 2), climbMs(2));
    await approveTops();
    const scoreB = (await getTowerStore().scoreOf(b.id))!;
    expect(towerOfScore(scoreB).floor).toBe(top);
    expect(scoreA).toBeGreaterThan(scoreB);
    // 먼저 오른 사람이 같은 층을 더 빨리 다시 올라도 점수(도달 시각)는 그대로
    vi.spyOn(Date, "now").mockReturnValue(t1 + 7_200_000);
    const sa2 = await begin(a, CP_MID);
    const r2 = await end(a, sa2, climbed(sa2, 2), climbMs(2));
    expect(r2.reward.tower).toMatchObject({ best: top, newBest: false, newWeek: false });
    expect(await getTowerStore().scoreOf(a.id)).toBe(scoreA);
    // 랭킹 줄 아래: 「11월 16일 오후 2:32에 도달」
    const board = (await (await rank.GET(call("/api/rank?board=tower&period=all&me=1", a))).json()) as { rows: { value: number; me: boolean; sub?: string }[]; mine: { sub?: string } | null };
    const mine = board.rows.find((x) => x.me) ?? board.mine;
    expect(mine?.sub).toBe(towerReachedLabel(ta.at));
    expect(mine?.sub).toMatch(/^\d+월 \d+일 오[전후] \d+:\d\d에 도달$/);
  });

  it("11/16 이번 주 첫 판은 전체 최고보다 낮은 층이어도 주간 랭킹에 들어간다 (전체 랭킹은 그대로)", async () => {
    const v = await newVisitor({ level: 50, fBest: 40, fBestMs: 900_000, fWk: "20200106", fWkBest: 40, fWkMs: 900_000 });
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 3), climbMs(3));
    expect(r.reward.tower).toMatchObject({ best: 3, newBest: false, newWeek: true });
    expect(towerOfScore((await getTowerStore().scoreOf(v.id, kstWeek(Date.now())))!).floor).toBe(3);
    expect(await getTowerStore().scoreOf(v.id)).toBeNull();
  });

  it("11/15 우두머리 상자는 하루 개수 제한 없음 (11/19 상자는 TOWER_CHEST_FROM층부터)", async () => {
    const st = cpFrom(TOWER_CHEST_FROM);
    const want = chestsIn(st, 10);
    expect(want.length).toBeGreaterThanOrEqual(2);
    const v = await newVisitor({ level: 50, tDay: kstDay(), tChest: 14, fBest: st + 9 });
    const s = await begin(v, st);
    const r = await end(v, s, climbed(s, 10), climbMs(10));
    expect(r.reward.tower).toMatchObject({ chests: want, emptyChests: 0 });
    expect((await getRpgStore().get(v.id)).tChest).toBe(14 + want.length);
  });
});

describe("11/26 엘리베이터 판 시작 판 레벨", () => {
  /** 시작 카드 다 고르고, 층마다 쌓인 경험치로 레벨이 오른 층을 적은 정직한 기록 (base = 시작 판 레벨) */
  const picksFor = (s: RunStartResponse, floors: number, base: number): CardPick[] => {
    const start = s.tower!;
    const owned: CardCounts = {};
    const out: CardPick[] = [];
    const take = (k: "s" | "l", i: number, f: number) => {
      const c = cardOffer(s.seed, k, i, 0, owned, f)[0];
      owned[c] = (owned[c] ?? 0) + 1;
      out.push({ k, i, r: 0, c, ...(k === "l" ? { f } : {}) });
    };
    for (let i = 0; i < startPicks(start); i++) take("s", i, start);
    let xp = 0;
    let n = 0;
    for (let i = 0; i < floors; i++) {
      for (const w of towerPlan(s.seed, start + i, start)) for (const m of w.monsters) xp += runXpOf(m);
      while (n < runLevel(xp, base).level) take("l", n++, start + i);
    }
    return out;
  };
  const ticketRb = (s: RunStartResponse) => (JSON.parse(Buffer.from(s.ticket.split(".")[0], "base64url").toString()) as { rb?: number }).rb;

  it("51층 시작 티켓에 시작 판 레벨이 실리고, 그 레벨부터 센 기록은 깨끗한 판 · 0레벨부터 센 기록은 의심 판", async () => {
    const v = await newVisitor({ level: 50, fBest: CP_MID - 1 });
    const s = await begin(v, CP_MID);
    expect(ticketRb(s)).toBe(runLevelBase(CP_MID));
    // 화면도 같은 값으로 센다 (판 시작 응답)
    expect(s.towerLv0).toBe(runLevelBase(CP_MID));
    const good = picksFor(s, 8, runLevelBase(CP_MID));
    expect(good.filter((p) => p.k === "l").length).toBeLessThanOrEqual(3);
    const r = await end(v, s, climbed(s, 8, { cards: good }), climbMs(8));
    expect(r.reward.tower?.suspect).toBeUndefined();
    const s2 = await begin(v, CP_MID);
    const many = picksFor(s2, 8, 0);
    expect(many.filter((p) => p.k === "l").length).toBeGreaterThanOrEqual(6);
    const r2 = await end(v, s2, climbed(s2, 8, { cards: many }), climbMs(8));
    expect(r2.reward.tower?.suspect).toBe(true);
    const item = (await listReviews()).find((i) => i.kind === "tower" && i.acct === v.id)!;
    expect(item.kind === "tower" && item.why).toEqual(["cards:level"]);
  });

  it("1층 시작은 그대로 (티켓에 없음, 0레벨부터)", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    expect(ticketRb(s)).toBeUndefined();
    expect(s.towerLv0).toBeUndefined();
    const r = await end(v, s, climbed(s, 6, { cards: picksFor(s, 6, 0) }), climbMs(6));
    expect(r.reward.tower?.suspect).toBeUndefined();
  });
});

describe("11/19 적정 레벨·적정 층 포인트", () => {
  it("야근 빌딩: ★80(초월 30)은 50층부터 포인트 — 1층에서 10층을 깨면 포인트 0, 초월 EXP는 그대로", async () => {
    const v = await newVisitor({ level: 50, tLevel: 30 });
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 10), climbMs(10));
    expect(r.reward.points).toBe(0);
    expect(r.reward.lowFloors).toEqual({ floors: 10, from: 50 });
    expect(r.reward.transcend!.exp).toBeGreaterThan(0);
  });
  it("사냥터: Lv.50이 지옥 「회식 3차」(Lv.30)에 가면 포인트 0, 「구조조정 발표 날」(Lv.48)은 그대로", async () => {
    const v = await newVisitor({ level: 50 });
    const low = await end(v, await begin(v, undefined, "burnout-abyss"));
    expect(low.reward.points).toBe(0);
    expect(low.reward.overLevel).toBe("level");
    const fit = await end(v, await begin(v, undefined, "layoff-day"));
    expect(fit.reward.points).toBeGreaterThan(0);
    expect(fit.reward.overLevel).toBeUndefined();
  });
  it("★58(초월 8)부터는 일반 사냥터 전부 포인트 0·레이스·랭킹 제외 (★57까지는 적정 사냥터에서 받고 센다)", async () => {
    const rec = vi.spyOn(getAccounts(), "recordHunt");
    const v7 = await newVisitor({ level: 50, tLevel: 7 });
    expect((await end(v7, await begin(v7, undefined, "layoff-day"))).reward.points).toBeGreaterThan(0);
    const v8 = await newVisitor({ level: 50, tLevel: 8 });
    const r = await end(v8, await begin(v8, undefined, "layoff-day"));
    expect(r.reward.points).toBe(0);
    expect(r.reward.overLevel).toBe("star");
    const who = rec.mock.calls.map((c: unknown[]) => c[0]);
    expect(who).not.toContain(v8.id);
    rec.mockRestore();
  });
  it("야근 빌딩: 아직 초월 전이면 깬 층마다 포인트", async () => {
    const v = await newVisitor({ level: 50, tLevel: 0 });
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 4), climbMs(4));
    expect(r.reward.pointsRaw).toBe(4 * 8); // 11/20 1~50층은 층마다 8P
    expect(r.reward.lowFloors).toBeUndefined();
  });
});

describe("11/15 부드러운 거절 (의심 판) · 긴 판", () => {
  it("카드 기록이 맞지 않는 판: 거절하지 않고 판·포인트만 주고, 나머지는 관리자 「기록 확인」에서 인정하면 판 끝과 같은 정산 (11/18)", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    // 11/19 서버는 묶음 3(갈래 가중치 후보 모두)·2·1로 다시 굴려 본다 → 어느 묶음에도 없는 카드
    const off = [...([null, "ember", "frost", "soul", "worker"] as const).flatMap((m) => cardOffer(s.seed, "l", 0, 0, {}, 1, 3, m)), ...cardOffer(s.seed, "l", 0, 0, {}, 1, 2), ...cardOffer(s.seed, "l", 0, 0, {}, 1, 1)];
    const c = CARD_IDS.find((id) => !off.includes(id))!;
    const r = await end(v, s, climbed(s, 10, { cards: [{ k: "l", i: 0, r: 0, c, f: 1 }] }), climbMs(10));
    expect(r.reward.tower).toMatchObject({ floors: 10, newBest: false, newWeek: false, chests: [], suspect: true });
    expect(r.reward.transcend).toBeUndefined();
    expect(r.reward.pointsRaw).toBe(10 * towerFloorPoints(1));
    const c1 = await getRpgStore().get(v.id);
    expect([c1.fBest, c1.fWkBest, c1.fSus ?? 0, c1.tChest ?? 0]).toEqual([0, 0, 0, 0]);
    expect(await getTowerStore().scoreOf(v.id)).toBeNull();
    const logs = await getErrors().day(kstDay());
    expect(logs.some((g) => g.kind === "tower" && g.message.includes("의심 판") && g.message.includes("cards:offer"))).toBe(true);
    // 관리자 「기록 확인」에 올라와 있다 → 인정하면 상자(11/19 TOWER_CHEST_FROM층부터)·초월 EXP·최고 기록이 들어간다 (포인트는 다시 주지 않는다)
    const item = (await listReviews()).find((i) => i.kind === "tower" && i.acct === v.id)!;
    expect(item).toMatchObject({ start: 1, floors: 10 });
    expect(item.kind === "tower" && item.why.some((w) => w.startsWith("cards:"))).toBe(true);
    const ok = await approveReview(item.id);
    expect(ok.kind === "tower" && ok.reward.tower).toMatchObject({ floors: 10, best: 10, newBest: true, chests: chestsIn(1, 10) });
    expect(ok.kind === "tower" && ok.reward.transcend!.exp).toBe(Array.from({ length: 10 }, (_, i) => floorTExp(i + 1)).reduce((a, b) => a + b, 0));
    expect(ok.kind === "tower" && ok.reward.points).toBe(0);
    expect((await getRpgStore().get(v.id)).fBest).toBe(10);
    await approveTops();
    expect(await getTowerStore().scoreOf(v.id)).not.toBeNull();
    // 두 번 인정할 수 없다
    await expect(approveReview(item.id)).rejects.toThrow();
  });

  it("관리자가 거절한 의심 판은 붙잡아 둔 것을 주지 않는다 (11/18)", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    const off = cardOffer(s.seed, "l", 0, 0, {}, 1);
    const c = CARD_IDS.find((id) => !off.includes(id))!;
    await end(v, s, climbed(s, 5, { cards: [{ k: "l", i: 0, r: 0, c, f: 1 }] }), climbMs(5));
    const item = (await listReviews()).find((i) => i.kind === "tower" && i.acct === v.id)!;
    await rejectReview(item.id);
    expect((await listReviews()).some((i) => i.id === item.id)).toBe(false);
    expect((await getRpgStore().get(v.id)).fBest).toBe(0);
  });

  it("벽시계로 다섯 시간 걸린 판(멈춤·탭 숨김)도 받는다 (예전 두 시간 + 2분이면 「너무 오래된 판」)", async () => {
    const v = await newVisitor();
    const s = await begin(v, 1);
    const r = await end(v, s, climbed(s, 6), 5 * 3600_000);
    expect(r.reward.tower).toMatchObject({ floors: 6, best: 6, newBest: true });
    expect(r.reward.tower?.suspect).toBeUndefined();
  });
});

describe("서버 최초 · 꼭대기 층 주인 · 개척자 (운영자 제외)", () => {
  it("처음 30층을 깬 한 사람만 「최초 결재자」, 운영자는 먼저 올라도 차지하지 않는다, 확성기 알림", async () => {
    // 11/19 30층은 51층 엘리베이터 아래라 1층부터 오른다. 앞 시험이 51층 위 꼭대기 층 주인을 남기므로 빈 빌딩(기록 저장소)에서 시작
    Object.assign(globalThis, { __tombTower: undefined, __tombTowerTop: undefined });
    const op = await newVisitor({ level: 50, fBest: 25 });
    await setStaff(op.id);
    try {
      const so = await begin(op, 1);
      const ro = await end(op, so, climbed(so, 30), climbMs(30));
      expect(ro.reward.tower!.titles).toEqual([]);
      expect(ro.reward.pioneer).toBeUndefined();
    } finally {
      await setStaff(null);
    }
    expect((await getTowerStore().firsts()).t_first30).toBeUndefined();
    expect(await getTowerStore().scoreOf(op.id)).toBeNull();

    const a = await newVisitor({ level: 50, fBest: 25 });
    const sa = await begin(a, 1);
    const ra = await end(a, sa, climbed(sa, 30), climbMs(30));
    // 11/18 서버 최초는 관리자 확인 뒤에 (줄을 선다). 서버 최고 층을 새로 깼으니 꼭대기 층 주인·전체 랭킹도 확인 뒤에 — 내 기록·보상은 바로
    expect(ra.reward.tower!.titles).toEqual([]);
    expect(ra.reward.firstPending).toEqual(["t_first30"]);
    expect(ra.reward.tower).toMatchObject({ best: 30, newBest: true, topPending: true });
    expect((await getRpgStore().get(a.id)).fBest).toBe(30);
    expect((await getTowerStore().firsts()).t_first30).toBeUndefined();
    expect((await getTowerStore().topHolder())?.accountId).not.toBe(a.id);
    expect(await getTowerStore().scoreOf(a.id)).toBeNull();
    expect(await getTowerStore().scoreOf(a.id, kstWeek())).not.toBeNull();
    const qt = (await listReviews()).find((i) => i.kind === "top" && i.acct === a.id)!;
    expect(await approveReview(qt.id)).toEqual({ kind: "top", took: true });
    expect(await getTowerStore().topHolder()).toMatchObject({ accountId: a.id, floor: 30 });
    expect(await getTowerStore().scoreOf(a.id)).not.toBeNull();
    const notices0 = (await getMegaphone().recent(20)).map((m) => m.text);
    expect(notices0.some((t) => t.includes("야근 빌딩 최고층 기록을 세웠어요 (30층)"))).toBe(true);
    // 둘째로 30층: 서버 최초는 없고, 같은 층이라 꼭대기도 그대로 (먼저 오른 사람)
    const b = await newVisitor({ level: 50, fBest: 25 });
    const sb = await begin(b, 1);
    const rb = await end(b, sb, climbed(sb, 30), climbMs(30));
    expect(rb.reward.tower!.titles).toEqual([]);
    expect(rb.reward.firstPending).toEqual(["t_first30"]);
    expect((await getTowerStore().topHolder())?.accountId).toBe(a.id);
    // 같은 칭호 줄: 먼저 조건을 채운 a부터. b를 먼저 인정하려 하면 막힌다
    const qa = (await listReviews()).find((i) => i.kind === "first" && i.titleId === "t_first30" && i.acct === a.id)!;
    const qb = (await listReviews()).find((i) => i.kind === "first" && i.titleId === "t_first30" && i.acct === b.id)!;
    await expect(approveReview(qb.id)).rejects.toThrow();
    expect(await approveReview(qa.id)).toEqual({ kind: "first", granted: true });
    expect((await getTowerStore().firsts()).t_first30).toBe(a.id);
    const notices = (await getMegaphone().recent(20)).map((m) => m.text);
    expect(notices.some((t) => t.includes("서버 최초로 30층"))).toBe(true);
    // 이미 주인이 생겼으니 b는 인정해도 받지 못한다
    expect(await approveReview(qb.id)).toEqual({ kind: "first", granted: false });
    // 더 높이 오르면 확인 대기 → 인정하면 꼭대기 층이 넘어간다, 거절하면 전체 랭킹·꼭대기에서 빠진다 (받은 보상·내 기록은 그대로)
    const sb2 = await begin(b, 1);
    const rb2 = await end(b, sb2, climbed(sb2, 32), climbMs(32));
    expect(rb2.reward.tower).toMatchObject({ best: 32, topPending: true, titles: [] });
    expect(await getTowerStore().topHolder()).toMatchObject({ accountId: a.id, floor: 30 });
    const qb2 = (await listReviews()).find((i) => i.kind === "top" && i.acct === b.id)!;
    expect(await approveReview(qb2.id)).toEqual({ kind: "top", took: true });
    expect(await getTowerStore().topHolder()).toMatchObject({ accountId: b.id, floor: 32 });
    // 꼭대기 주인이 자기 기록을 넘을 때는 남의 자리를 빼앗는 게 아니라 바로
    const sb3 = await begin(b, 1);
    const rb3 = await end(b, sb3, climbed(sb3, 33), climbMs(33));
    expect(rb3.reward.tower?.topPending).toBeUndefined();
    expect(await getTowerStore().topHolder()).toMatchObject({ accountId: b.id, floor: 33 });
    // 다른 사람이 더 높이 → 거절하면 전체 랭킹·꼭대기에 없다
    const c = await newVisitor({ level: 50, fBest: 30 });
    const sc = await begin(c, 1);
    const rc = await end(c, sc, climbed(sc, 35), climbMs(35));
    expect(rc.reward.tower).toMatchObject({ best: 35, topPending: true });
    await rejectReview((await listReviews()).find((i) => i.kind === "top" && i.acct === c.id)!.id);
    expect(await getTowerStore().topHolder()).toMatchObject({ accountId: b.id });
    expect(await getTowerStore().scoreOf(c.id)).toBeNull();
    expect((await getRpgStore().get(c.id)).fBest).toBe(35);
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
