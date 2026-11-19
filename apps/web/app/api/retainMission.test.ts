import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, dayStartMs, gameDay } from "@/lib/gameDay";
import { getForageStore } from "@/lib/forage/store";
import { PLAY_MIN_MS, TODO_POOL, todoDef, todoPicks, todoView, type TodoKind } from "@/lib/retain";
import { hauntMinMs } from "@/lib/retainPlay";
import { bumpQuest, questHook, todoOpenNow, todoTickOf } from "@/lib/retainQuest";
import { MemoryGullStore } from "@/lib/sea/gullStore";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import * as retain from "./me/retain/route";
import * as session from "./session/route";

// 11/19 오늘 미션(옛 「오늘의 할 일」) 종류 늘리기: 뽑기 규칙(마을·놀이·나들이 하나씩, 같은 묶음 하나, 닫힌 장소 빼기) ·
// 새 종류 진행(바다 낚시·장소 채집·갈매기·방명록·소원 분수 등 진행 훅) · 놀이 판 기록 조작 방지(시작 표·최소 시간·끝까지·계정·날짜)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** 2026-11-19 (목) 한국 시간 낮 2시 */
const T0 = Date.UTC(2026, 10, 19, 5, 0);
const DAY0 = gameDay(T0);
const catOf = (k: TodoKind) => todoDef(k)!.cat;
const groupOf = (k: TodoKind) => todoDef(k)!.group;

let ipSeq = 1;
async function newAccount(at = T0): Promise<{ id: string; cookie: string }> {
  vi.spyOn(Date, "now").mockReturnValue(at);
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "x-forwarded-for": `10.78.0.${ipSeq++ % 250}` } }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const { visitorId } = (await res.json()) as { visitorId: string };
  await getAccounts().enter(visitorId, { name: null, color: "#9fc5a8", body: "hood" }, at);
  return { id: visitorId, cookie };
}

/** 그날 미션에 kind가 든 새 계정 (계정 id가 무작위라 나올 때까지 만든다) */
async function accountWith(kind: TodoKind, at = T0): Promise<{ id: string; cookie: string }> {
  for (let i = 0; i < 200; i++) {
    const a = await newAccount(at);
    if (todoPicks(kstDay(at), a.id, todoOpenNow()).includes(kind)) return a;
  }
  throw new Error(`미션 ${kind}이 든 계정을 못 만들었어요`);
}
/** 그날 미션에 kind가 없는 새 계정 */
async function accountWithout(kind: TodoKind): Promise<{ id: string; cookie: string }> {
  for (let i = 0; i < 50; i++) {
    const a = await newAccount();
    if (!todoPicks(DAY0, a.id, todoOpenNow()).includes(kind)) return a;
  }
  throw new Error("못 만들었어요");
}
/** 순수 함수용 계정 id (뽑기만 본다) */
function idWith(kind: TodoKind, day = DAY0, open = { camp: true, sea: true }): string {
  for (let i = 0; i < 5000; i++) if (todoPicks(day, `acct${i}`, open).includes(kind)) return `acct${i}`;
  throw new Error("없음");
}

type Res = { status: number; json: Record<string, unknown> & { error?: { code: string }; ticket?: string | null; seed?: number; counted?: boolean; todo?: { kind: string; have: number } } };
async function post(cookie: string, body: unknown, at: number): Promise<Res> {
  vi.spyOn(Date, "now").mockReturnValue(at);
  const res = await retain.POST(
    new NextRequest("http://localhost/api/me/retain", { method: "POST", headers: { cookie, "content-type": "application/json", "x-forwarded-for": "10.78.1.1" }, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

describe("오늘 미션 뽑기 규칙 (순수)", () => {
  it("하루 3개 = 마을 일상 하나 · 놀이 하나 · 나들이 하나, 같은 묶음(낚시·채집)은 하루에 하나", () => {
    for (let d = 0; d < 20; d++)
      for (let i = 0; i < 200; i++) {
        const p = todoPicks(addDays(DAY0, d), `acct${i}`);
        expect(p.map(catOf)).toEqual(["life", "play", "trip"]);
        const groups = p.map(groupOf).filter(Boolean);
        expect(new Set(groups).size).toBe(groups.length);
      }
  });

  it("날짜 + 계정으로 늘 같고(새벽 5시 게임 날짜), 날마다·계정마다 무작위로 달라진다", () => {
    expect(todoPicks(DAY0, "acctX")).toEqual(todoPicks(DAY0, "acctX"));
    const days = new Set(Array.from({ length: 14 }, (_, i) => todoPicks(addDays(DAY0, i), "acctX").join()));
    expect(days.size).toBeGreaterThan(7);
    const accts = new Set(Array.from({ length: 50 }, (_, i) => todoPicks(DAY0, `acct${i}`).join()));
    expect(accts.size).toBeGreaterThan(30);
  });

  it("새 종류까지 20가지가 모두 나온다 (마을 7 · 놀이 7 · 나들이 6)", () => {
    expect(TODO_POOL).toHaveLength(20);
    const cats = (c: string) => TODO_POOL.filter((d) => d.cat === c).length;
    expect([cats("life"), cats("play"), cats("trip")]).toEqual([7, 7, 6]);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const k of todoPicks(DAY0, `acct${i}`)) seen.add(k);
    expect([...seen].sort()).toEqual(TODO_POOL.map((d) => d.kind).sort());
  });

  it("바닷가가 닫힌 서버면 바닷가 미션은 뽑지 않고, 캠핑장·바닷가가 모두 닫히면 놀이·사냥에서 고른다", () => {
    const seaOnly = new Set(TODO_POOL.filter((d) => d.open === "sea").map((d) => d.kind));
    const campOnly = new Set(TODO_POOL.filter((d) => d.open === "camp").map((d) => d.kind));
    for (let i = 0; i < 1000; i++) {
      const noSea = todoPicks(DAY0, `acct${i}`, { camp: true, sea: false });
      expect(noSea.some((k) => seaOnly.has(k))).toBe(false);
      expect(noSea).toHaveLength(3);
      const closed = todoPicks(DAY0, `acct${i}`, { camp: false, sea: false });
      expect(closed.some((k) => seaOnly.has(k) || campOnly.has(k) || k === "bbq")).toBe(false);
      expect(new Set(closed).size).toBe(3);
      expect(closed[0] && catOf(closed[0])).toBe("life");
      const groups = closed.map(groupOf).filter(Boolean);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("칸마다 진행 단위와 짧은 안내, 갈 곳이 있는 미션은 길 안내 목적지 · 귀신의 집은 끝까지", () => {
    for (const d of TODO_POOL) {
      expect(d.unit.length).toBeGreaterThan(0);
      expect(d.hint.length).toBeGreaterThan(5);
      expect(d.need).toBeGreaterThan(0);
    }
    expect(TODO_POOL.filter((d) => d.guide).length).toBeGreaterThanOrEqual(18);
    expect(todoDef("haunt")!.label).toContain("끝까지");
    expect(todoDef("haunt")!.hint).toContain("중간에 나오지 않고");
    const v = todoView(DAY0, idWith("seaFish"), { "_q:seaFish": 1 }, 0, 0);
    expect(v.items.find((it) => it.kind === "seaFish")).toMatchObject({ have: 1, need: 2 });
  });
});

describe("새 미션 진행 (서버가 아는 행동)", () => {
  it("바다 낚시는 「바닷가에서 물고기」에, 바닷가·캠핑장 채집은 그 장소 미션에 센다 (같은 날 「물고기 3마리」와는 안 겹친다)", async () => {
    const { id } = await accountWith("seaFish");
    const hook = questHook(id, DAY0, ["seaFish", "fish"]);
    expect(hook?.field).toBe("_q:seaFish");
    // 호수 낚시는 바다 미션이 아니다
    expect(questHook(id, DAY0, "fish")).toBeNull();
    await getForageStore().grant(id, DAY0, "fish", [{ id: "f_carp", size: 0 }], 99, undefined, hook);
    expect(todoTickOf(hook, DAY0).todo).toEqual({ kind: "seaFish", have: 1, day: DAY0 });
    const g = await accountWith("campGather");
    expect(questHook(g.id, DAY0, ["campGather", "gather"])?.field).toBe("_q:campGather");
    expect(questHook(g.id, DAY0, ["seaGather", "gather"])).toBeNull();
  });

  it("갈매기 과자는 던지는 스크립트에서 같이 +1 (과자가 없으면 세지 않는다)", async () => {
    const { id } = await accountWith("gull");
    const s = new MemoryGullStore();
    const miss = questHook(id, DAY0, "gull");
    expect(await s.take(id, DAY0, "plain", miss)).toBeNull();
    expect(miss?.have).toBeUndefined();
    await s.buy(id, DAY0, "plain");
    const hook = questHook(id, DAY0, "gull");
    await s.take(id, DAY0, "plain", hook);
    expect(hook?.have).toBe(1);
  });

  it("소원 분수·방명록·의뢰·바베큐 같은 따로 올리기도 그날 미션일 때만, 다 채우면 더 올리지 않는다 (명령 아끼기)", async () => {
    const { id } = await accountWith("wish");
    const hook = questHook(id, DAY0, "wish");
    await bumpQuest(hook);
    expect(todoTickOf(hook, DAY0).todo?.have).toBe(1);
    // 필요 수(1)를 채웠다 → 같은 인스턴스에서는 훅이 없다
    expect(questHook(id, DAY0, "wish")).toBeNull();
    const other = await accountWithout("wish");
    expect(questHook(other.id, DAY0, "wish")).toBeNull();
    await bumpQuest(null);
    expect((await getAccounts().get(other.id, DAY0, T0)).retain.quest).toEqual({});
  });

  it("미션 화면 값에 진행이 실리고, 다 채운 칸을 받을 수 있다", async () => {
    const { id, cookie } = await accountWith("guestbook");
    const which = todoPicks(DAY0, id, todoOpenNow()).indexOf("guestbook");
    expect((await post(cookie, { do: "todo", which }, T0)).json.error?.code).toBe("TODO_NOT_YET");
    await bumpQuest(questHook(id, DAY0, "guestbook"));
    const r = await post(cookie, { do: "todo", which }, T0);
    expect(r.status).toBe(200);
  });
});

describe("놀이 미션 판 기록 (귀신의 집·범퍼카·관람차/열기구·불멍 — 조작 방지)", () => {
  it("그날 미션이 아니면 시작 표가 없다 (요청만, 저장소 명령 없음)", async () => {
    const { cookie } = await accountWithout("bumper");
    const r = await post(cookie, { do: "playStart", kind: "bumper" }, T0);
    expect(r.status).toBe(200);
    expect(r.json.ticket).toBeNull();
  });

  it("범퍼카: 1분이 안 되면 거절, 넘으면 +1 → 받기", async () => {
    const { id, cookie } = await accountWith("bumper");
    const start = await post(cookie, { do: "playStart", kind: "bumper" }, T0);
    const ticket = start.json.ticket as string;
    expect(typeof ticket).toBe("string");
    expect((await post(cookie, { do: "playEnd", ticket, done: true }, T0 + PLAY_MIN_MS.bumper - 5_000)).json.error?.code).toBe("TOO_FAST");
    const ok = await post(cookie, { do: "playEnd", ticket, done: true }, T0 + PLAY_MIN_MS.bumper + 1_000);
    expect(ok.json).toMatchObject({ counted: true, todo: { kind: "bumper", have: 1 } });
    const which = todoPicks(DAY0, id, todoOpenNow()).indexOf("bumper");
    expect((await post(cookie, { do: "todo", which }, T0 + 120_000)).status).toBe(200);
    expect((await post(cookie, { do: "todo", which }, T0 + 120_000)).json.error?.code).toBe("TODO_DONE");
  });

  it("귀신의 집: 서버가 고른 미로 시드, 중간에 나온 판은 세지 않고, 끝까지 돌파한 판만 (최소 시간 = 그 미로를 달려도 걸리는 시간)", async () => {
    const { cookie } = await accountWith("haunt");
    const start = await post(cookie, { do: "playStart", kind: "haunt" }, T0);
    const ticket = start.json.ticket as string;
    const seed = start.json.seed as number;
    expect(Number.isInteger(seed)).toBe(true);
    const min = hauntMinMs(seed);
    expect(min).toBeGreaterThanOrEqual(PLAY_MIN_MS.haunt);
    // 중간에 나왔다 (done=false) → 세지 않음
    expect((await post(cookie, { do: "playEnd", ticket, done: false, ms: min + 5_000 }, T0 + min + 6_000)).json).toEqual({ counted: false });
    // 너무 빨리 (서버 시계)
    expect((await post(cookie, { do: "playEnd", ticket, done: true, ms: 3_000 }, T0 + 3_500)).json.error?.code).toBe("TOO_FAST");
    // 화면 판 시간이 서버 시계보다 길거나 최소보다 짧으면 거절
    expect((await post(cookie, { do: "playEnd", ticket, done: true, ms: min + 60_000 }, T0 + min + 1_000)).json.error?.code).toBe("RESULT_REJECTED");
    expect((await post(cookie, { do: "playEnd", ticket, done: true }, T0 + min + 1_000)).json.error?.code).toBe("RESULT_REJECTED");
    // 끝까지 돌파
    const ok = await post(cookie, { do: "playEnd", ticket, done: true, ms: min + 500 }, T0 + min + 2_000);
    expect(ok.json).toMatchObject({ counted: true, todo: { kind: "haunt", have: 1 } });
  });

  it("다른 계정의 표·고친 표·날이 바뀐 표·너무 오래된 표는 세지 않는다", async () => {
    const a = await accountWith("fire");
    const b = await newAccount();
    const ticket = (await post(a.cookie, { do: "playStart", kind: "fire" }, T0)).json.ticket as string;
    expect((await post(b.cookie, { do: "playEnd", ticket, done: true }, T0 + 200_000)).json.error?.code).toBe("BAD_TICKET");
    const forged = ticket.slice(0, -2) + (ticket.endsWith("A") ? "BB" : "AA");
    expect((await post(a.cookie, { do: "playEnd", ticket: forged, done: true }, T0 + 200_000)).json.error?.code).toBe("BAD_TICKET");
    // 다음 게임 날짜(새벽 5시 넘어)
    const next = dayStartMs(addDays(DAY0, 1)) + 60_000;
    expect((await post(a.cookie, { do: "playEnd", ticket, done: true }, next)).json).toEqual({ counted: false });
    // 40분 넘게 지난 표
    expect((await post(a.cookie, { do: "playEnd", ticket, done: true }, T0 + 41 * 60_000)).json).toEqual({ counted: false });
    // 제때 끝내면 센다
    expect((await post(a.cookie, { do: "playEnd", ticket, done: true }, T0 + PLAY_MIN_MS.fire + 1_000)).json).toMatchObject({ counted: true });
  });

  it("운영자 계정은 미션이 없어 표도 없다", async () => {
    const { cookie, id } = await accountWith("sky");
    const { setStaff } = await import("@/lib/staff");
    await setStaff(id);
    try {
      expect((await post(cookie, { do: "playStart", kind: "sky" }, T0)).json.ticket).toBeNull();
    } finally {
      await setStaff(null);
    }
  });
});
