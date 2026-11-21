import { NextRequest } from "next/server";
import { PERMANENT_UNTIL } from "@tomb/protocol";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, dayStartMs, gameDay } from "@/lib/gameDay";
import { getForageStore } from "@/lib/forage/store";
import {
  FIRST_ALL,
  FIRST_REWARD,
  FIRST_STEPS,
  PATH,
  PATH_WEAR_DAYS,
  pathView,
  retainView,
  TODO_BONUS_GIFT,
  TODO_GIFT,
  TODO_POOL,
  TODO_PROT_EVERY,
  todoProgressText,
  todoPicks,
  todoView,
  type TodoKind,
} from "@/lib/retain";
import { questHook, todoTickOf } from "@/lib/retainQuest";
import { getRpgStore } from "@/lib/rpg/store";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import { setStaff } from "@/lib/staff";
import { MemoryAccounts } from "@/lib/store/accounts-memory";
import { titleStatus } from "@/lib/titlesServer";
import type { RetainResponse } from "@/lib/types";
import * as retain from "./me/retain/route";
import * as session from "./session/route";

// 11/18 둘째 날 다시 오게: 새 이웃 꾸러미(날짜·이어 받기·중복 방지) · 첫 걸음 미션 · 오늘의 할 일(뽑기·진행·보상·중복). 메모리 저장소로.
// 11/19 보상은 모두 아이템 (포인트 없음 — 물약·결재 서류는 사냥 가방)

/** 사냥 가방의 커피·결재 서류 수 */
async function bag(id: string): Promise<{ coffee: number; doc: number; prot: number }> {
  const st = await getRpgStore().get(id);
  return { coffee: st.potions.p_coffee ?? 0, doc: st.mats?.doc ?? 0, prot: st.mats?.prot ?? 0 };
}

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** 2026-11-18 (수) 한국 시간 저녁 8시 */
const T0 = Date.UTC(2026, 10, 18, 11, 0);
const DAY0 = gameDay(T0);
/** 그 게임 날짜의 한국 시간 낮 12시 */
const noon = (day: string) => dayStartMs(day) + 7 * 3_600_000;

let ipSeq = 1;
async function newAccount(createdAt = T0): Promise<{ id: string; cookie: string }> {
  vi.spyOn(Date, "now").mockReturnValue(createdAt);
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "x-forwarded-for": `10.77.0.${ipSeq++ % 250}` } }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const { visitorId } = (await res.json()) as { visitorId: string };
  await getAccounts().enter(visitorId, { name: null, color: "#9fc5a8", body: "hood" }, createdAt);
  return { id: visitorId, cookie };
}

async function post(cookie: string, body: unknown, at: number): Promise<{ status: number; json: RetainResponse & { error?: { code: string } } }> {
  vi.spyOn(Date, "now").mockReturnValue(at);
  const res = await retain.POST(
    new NextRequest("http://localhost/api/me/retain", { method: "POST", headers: { cookie, "content-type": "application/json", "x-forwarded-for": "10.77.1.1" }, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: await res.json() };
}

describe("오늘의 할 일 뽑기 (순수)", () => {
  it("날짜 + 계정으로 늘 같은 서로 다른 3개, 날이 바뀌면 달라질 수 있다", () => {
    const a = todoPicks("20261118", "acctAAAAAAAAAAAAAAAAA");
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(todoPicks("20261118", "acctAAAAAAAAAAAAAAAAA")).toEqual(a);
    const days = Array.from({ length: 14 }, (_, i) => todoPicks(addDays("20261118", i), "acctAAAAAAAAAAAAAAAAA").join());
    expect(new Set(days).size).toBeGreaterThan(3);
  });

  it("여러 계정이면 풀의 모든 할 일이 고루 나온다", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 700; i++) for (const k of todoPicks("20261118", `acct${i}`)) seen.set(k, (seen.get(k) ?? 0) + 1);
    expect([...seen.keys()].sort()).toEqual(TODO_POOL.map((d) => d.kind).sort());
    // 11/19 700명 × 칸마다 6~7가지 → 한 종류 평균 100 남짓 (같은 묶음 빼기로 조금 줄어드는 것도 있다). 너무 치우치지 않게
    for (const n of seen.values()) expect(n).toBeGreaterThan(40);
  });

  it("진행 칸·받은 비트를 화면 값으로 (머무르기는 _stay)", () => {
    const id = "acctBBBBBBBBBBBBBBBBB";
    const [k0, k1] = todoPicks(DAY0, id);
    const field = (k: TodoKind) => (k === "stay" ? "_stay" : `_q:${k}`);
    const v = todoView(DAY0, id, { [field(k0)]: 5, [field(k1)]: 0 }, 1 | 8, 4);
    expect(v.items[0]).toMatchObject({ kind: k0, have: 5, claimed: true });
    expect(v.items[1]).toMatchObject({ kind: k1, have: 0, claimed: false });
    expect(v).toMatchObject({ bonus: true, stamps: 4 });
  });
});

describe("새 이웃 꾸러미 날짜 (순수, 11/19 모든 계정 소급·밀린 것 한꺼번에)", () => {
  it("가입한 날부터 하루 하나씩 쌓이고, 7개를 다 받으면 사라진다", () => {
    expect(pathView(T0, 0, null, DAY0)).toEqual({ got: 0, owed: 1, canClaim: true, seen: false });
    expect(pathView(T0, 1, null, DAY0)).toMatchObject({ got: 1, owed: 0, canClaim: false });
    // 이틀 건너뛰면 밀린 2개
    expect(pathView(T0, 1, null, addDays(DAY0, 2))).toMatchObject({ got: 1, owed: 2, canClaim: true });
    // 오래전에 가입했으면 7개까지
    expect(pathView(T0, 3, null, addDays(DAY0, 40))).toMatchObject({ owed: 4 });
    expect(pathView(T0, 7, null, addDays(DAY0, 6))).toBeNull();
    // 가입한 날을 모르는 옛 계정은 7개 모두
    expect(pathView(0, 0, null, DAY0)).toMatchObject({ owed: 7 });
    // 오늘 저절로 열렸는지
    expect(pathView(T0, 0, DAY0, DAY0)?.seen).toBe(true);
    expect(pathView(T0, 0, addDays(DAY0, -1), DAY0)?.seen).toBe(false);
  });

  it("꾸러미 7개는 실제 아이템·물약·강화 재료, 꾸미기는 기간제(포인트 없음)", async () => {
    const { itemById } = await import("@tomb/protocol");
    const { potionById } = await import("@/lib/rpg/catalog");
    const { isMatId } = await import("@/lib/rpg/setGear");
    expect(PATH).toHaveLength(7);
    for (const g of PATH) {
      expect(g).not.toHaveProperty("points");
      expect(g).not.toHaveProperty("perm");
      for (const it of g.items ?? []) expect(itemById(it.itemId), it.itemId).toBeTruthy();
      if (g.wear) expect(itemById(g.wear)?.slot).toBeTruthy();
      for (const id of Object.keys(g.bundle?.potions ?? {})) expect(potionById(id), id).toBeTruthy();
      for (const id of Object.keys(g.bundle?.mats ?? {})) expect(isMatId(id), id).toBe(true);
    }
  });
});

describe("새 이웃 꾸러미 받기 (라우트)", () => {
  it("날마다 하나, 밀린 날은 한꺼번에, 꾸미기는 7일, 7번째에 칭호, 다 받으면 닫힌다", async () => {
    const { id, cookie } = await newAccount();
    // 1일째: 빨간 목도리 7일 (벗어 둔 꾸미기)
    const d1 = await post(cookie, { do: "path" }, T0);
    expect(d1.status).toBe(200);
    expect(d1.json.gifts?.map((g) => g.n)).toEqual([1]);
    expect(d1.json.me?.stash.find((s) => s.itemId === "neck_scarf")?.until).toBe(T0 + PATH_WEAR_DAYS * 86_400_000);
    expect(d1.json.me?.retain?.path).toMatchObject({ got: 1, owed: 0, canClaim: false });
    // 같은 날 두 번째는 거절
    const again = await post(cookie, { do: "path" }, T0 + 60_000);
    expect(again.status).toBe(409);
    expect(again.json.error?.code).toBe("PATH_TODAY");
    // 사흘 뒤: 밀린 3개(2·3·4)를 한꺼번에 — 물약·폭죽·결재 서류
    const before = d1.json.me!.points;
    const potBefore = (await getRpgStore().get(id)).potions;
    const docBefore = (await bag(id)).doc;
    const d4 = await post(cookie, { do: "path" }, noon(addDays(DAY0, 3)));
    expect(d4.json.gifts?.map((g) => g.n)).toEqual([2, 3, 4]);
    expect(d4.json.me?.points).toBe(before);
    expect(d4.json.me?.inventory.fw_small).toBe(1);
    const pot = (await getRpgStore().get(id)).potions;
    expect(pot.p_coffee).toBe((potBefore.p_coffee ?? 0) + 3);
    expect((await bag(id)).doc).toBe(docBefore + 10);
    // 열흘 뒤: 남은 3개(5·6·7) — 7번째 칭호·꽃 머리핀 7일
    const t = noon(addDays(DAY0, 10));
    const d10 = await post(cookie, { do: "path" }, t);
    expect(d10.json.gifts?.map((g) => g.n)).toEqual([5, 6, 7]);
    expect(d10.json.me?.stash.find((s) => s.itemId === "hat_flower")?.until).toBe(t + PATH_WEAR_DAYS * 86_400_000);
    expect(d10.json.me?.retain?.path).toBeNull();
    const titles = await titleStatus(id, t);
    expect(titles.earned).toContain("t_grad");
    // 다 받았으면 닫힘
    expect((await post(cookie, { do: "path" }, t + 86_400_000)).json.error?.code).toBe("PATH_CLOSED");
  });

  it("동시에 두 번 눌러도 한 번만", async () => {
    const { cookie } = await newAccount();
    const [a, b] = await Promise.all([post(cookie, { do: "path" }, T0), post(cookie, { do: "path" }, T0)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const me = (await post(cookie, { do: "todo", which: 3 }, T0)).json;
    expect(me.error?.code).toBe("TODO_NOT_YET");
  });

  it("기존 가입자(오래전 가입)도 7개를 한꺼번에 받는다", async () => {
    const { cookie } = await newAccount(T0 - 30 * 86_400_000);
    const r = await post(cookie, { do: "path" }, T0);
    expect(r.status).toBe(200);
    expect(r.json.gifts).toHaveLength(7);
    expect(r.json.me?.retain?.path).toBeNull();
  });

  it("오늘 저절로 열린 표시는 하루 한 번 (서버 기록)", async () => {
    const { id, cookie } = await newAccount();
    const view = async (at: number) => retainView(id, T0, (await getAccounts().get(id, kstDay(at), at)).retain, 0, kstDay(at)).path;
    expect((await view(T0))?.seen).toBe(false);
    expect((await post(cookie, { do: "seen" }, T0)).status).toBe(200);
    expect((await view(T0))?.seen).toBe(true);
    // 다음 날은 다시 저절로 열릴 수 있다
    expect((await view(noon(addDays(DAY0, 1))))?.seen).toBe(false);
  });

  it("사냥 가방에 못 넣은 꾸러미는 표시가 남아 다음 받기 때 다시 넣는다", async () => {
    const { id, cookie } = await newAccount();
    await post(cookie, { do: "path" }, T0);
    const potBefore = (await getRpgStore().get(id)).potions.p_coffee ?? 0;
    const spy = vi.spyOn(getRpgStore(), "update").mockRejectedValueOnce(new Error("잠깐 실패"));
    const r = await post(cookie, { do: "path" }, noon(addDays(DAY0, 1)));
    expect(r.json.me?.retain?.path?.got).toBe(2);
    spy.mockRestore();
    expect((await getAccounts().get(id, addDays(DAY0, 1), noon(addDays(DAY0, 1)))).retain.gpPot).toBe("2");
    await post(cookie, { do: "path" }, noon(addDays(DAY0, 2)));
    expect((await getRpgStore().get(id)).potions.p_coffee).toBe(potBefore + 3);
  });
});

describe("첫 걸음 미션 (라우트)", () => {
  it("미션마다 처음 한 번 포인트, 다 해야 큰 선물(1,000P 포함), 한 번만, 받고 나면 사라진다", async () => {
    const { id, cookie } = await newAccount();
    expect((await post(cookie, { do: "first" }, T0)).json.error?.code).toBe("FIRST_NOT_YET");
    let mask = 0;
    const p0 = (await getAccounts().get(id, DAY0, T0)).points;
    for (const s of FIRST_STEPS) {
      const r = await post(cookie, { do: "step", step: s.id }, T0);
      expect(r.status).toBe(200);
      mask |= s.bit;
      expect(r.json.mask).toBe(mask);
      expect(r.json.points, s.id).toBe(s.reward.points);
    }
    const sum = FIRST_STEPS.reduce((n, s) => n + (s.reward.points ?? 0), 0);
    const p1 = (await getAccounts().get(id, DAY0, T0)).points;
    expect(p1 - p0).toBe(sum);
    // 같은 칸을 또 해도 그대로, 포인트도 없다
    const again = await post(cookie, { do: "step", step: "look" }, T0);
    expect(again.json.mask).toBe(FIRST_ALL);
    expect(again.json.text).toBeUndefined();
    expect((await getAccounts().get(id, DAY0, T0)).points).toBe(p1);
    expect((await post(cookie, { do: "step", step: "nope" }, T0)).status).toBe(400);
    const b1 = await bag(id);
    const got = await post(cookie, { do: "first" }, T0);
    expect(got.status).toBe(200);
    expect(got.json.text).toContain("하루권");
    expect(got.json.me?.inventory[FIRST_REWARD.itemId]).toBe(1);
    expect(got.json.me?.points).toBe(p1 + FIRST_REWARD.points);
    expect((await bag(id)).doc - b1.doc).toBe(FIRST_REWARD.bundle.mats?.m_doc);
    expect(got.json.me?.retain?.first).toBeNull();
    expect((await post(cookie, { do: "first" }, T0)).json.error?.code).toBe("FIRST_DONE");
    // 큰 선물을 받은 뒤 미션 표시는 아무것도 하지 않는다
    expect((await post(cookie, { do: "step", step: "run" }, T0)).json.mask).toBe(-1);
  });

  it("11/21 별자리 첫 걸음은 뺐다 — 옛 화면이 보내도 조용히 넘기고, 나머지 14칸이면 큰 선물", async () => {
    const { cookie } = await newAccount();
    expect(FIRST_STEPS.some((x) => (x.id as string) === "stars")).toBe(false);
    expect(FIRST_ALL & 512).toBe(0);
    const old = await post(cookie, { do: "step", step: "stars" }, T0);
    expect(old.status).toBe(200);
    expect(old.json.mask).toBe(-1);
    expect(old.json.text).toBeUndefined();
    for (const s of FIRST_STEPS) await post(cookie, { do: "step", step: s.id }, T0);
    expect((await post(cookie, { do: "first" }, T0)).status).toBe(200);
  });

  it("11/19 캠핑장·바닷가 미션 (새 비트 4096·8192) — 14칸을 다 해야 큰 선물", async () => {
    const { cookie } = await newAccount();
    for (const s of FIRST_STEPS.filter((x) => x.id !== "sea")) await post(cookie, { do: "step", step: s.id }, T0);
    expect((await post(cookie, { do: "first" }, T0)).json.error?.code).toBe("FIRST_NOT_YET");
    const sea = await post(cookie, { do: "step", step: "sea" }, T0);
    expect(sea.json.mask).toBe(FIRST_ALL);
    expect(sea.json.points).toBe(200);
    expect(FIRST_ALL & 4096 && FIRST_ALL & 8192).toBeTruthy();
    expect((await post(cookie, { do: "first" }, T0)).status).toBe(200);
  });

  it("11/19 의뢰 하나 해결하기 (새 비트 16384, 200P) — 14칸을 다 해야 큰 선물", async () => {
    const { cookie } = await newAccount();
    expect(FIRST_STEPS).toHaveLength(14);
    for (const s of FIRST_STEPS.filter((x) => x.id !== "quest")) await post(cookie, { do: "step", step: s.id }, T0);
    expect((await post(cookie, { do: "first" }, T0)).json.error?.code).toBe("FIRST_NOT_YET");
    const q = await post(cookie, { do: "step", step: "quest" }, T0);
    expect(q.json.mask).toBe(FIRST_ALL);
    expect(FIRST_ALL & 16384).toBeTruthy();
    expect(q.json.points).toBe(200);
    expect((await post(cookie, { do: "first" }, T0)).status).toBe(200);
  });

  it("11/19 운영자: 내 정보에 retain이 없고, 미션 표시·꾸러미·할 일 모두 하지 않는다", async () => {
    const { id, cookie } = await newAccount();
    await setStaff(id);
    try {
      vi.spyOn(Date, "now").mockReturnValue(T0);
      const me = await loadMe(getAccounts(), id, T0);
      expect(me.staff).toBe(true);
      expect(me.retain).toBeUndefined();
      expect((await post(cookie, { do: "step", step: "run" }, T0)).json.mask).toBe(-1);
      expect((await getAccounts().get(id, DAY0, T0)).retain.fs).toBe(0);
      expect((await post(cookie, { do: "seen" }, T0)).json.ok).toBe(true);
      expect((await getAccounts().get(id, DAY0, T0)).retain.gpSeen).toBeNull();
      expect((await post(cookie, { do: "path" }, T0)).status).toBe(403);
      expect((await post(cookie, { do: "todo", which: 0 }, T0)).status).toBe(403);
      // 할 일 진행 칸도 올리지 않는다 (저장소 명령을 아낀다)
      for (const k of TODO_POOL) if (k.kind !== "stay") expect(questHook(id, DAY0, k.kind as Exclude<TodoKind, "stay">)).toBeNull();
    } finally {
      await setStaff(null);
    }
  });

  it("기존 가입자에게도 보이고, 큰 선물을 받으면 사라진다", () => {
    const r = { gp: 0, gpDay: null, gpPot: null, gpSeen: null, fs: 0, fsDone: false, stamps: 0, quest: {}, qc: 0 };
    expect(retainView("a", T0, r, 0, DAY0).first).toEqual({ mask: 0 });
    expect(retainView("a", T0 - 100 * 86_400_000, r, 0, DAY0).first).toEqual({ mask: 0 });
    expect(retainView("a", T0, { ...r, fsDone: true }, 0, DAY0).first).toBeNull();
  });
});

/** 할 일 한 칸을 실제 저장소 경로(진행 훅)로 한 번 */
async function act(id: string, kind: TodoKind, day: string): Promise<number | undefined> {
  if (kind === "stay") return (getAccounts() as MemoryAccounts).bumpQuest(id, day, "_stay", 1);
  const hook = questHook(id, day, kind);
  if (!hook) return undefined;
  if (kind === "fish" || kind === "gather") await getForageStore().grant(id, day, kind, [{ id: kind === "fish" ? "f_carp" : "h_mugwort", size: 0 }], 99, undefined, hook);
  else if (kind === "stars" || kind === "hunt") await getRpgStore().addDaily(id, day, { runs: 1 }, hook);
  else if (kind === "flower") await getAccounts().earn(id, "flower", day, { quest: hook });
  else if (kind === "sell") await getAccounts().earn(id, "fish", day, { amount: 3, quest: hook });
  else hook.have = hook.local(1);
  return todoTickOf(hook, day).todo?.have;
}

describe("오늘의 할 일 진행 글자 (단위)", () => {
  it("머무르기는 분, 물고기는 마리, 판·번은 그대로", () => {
    expect(todoProgressText({ kind: "stay", need: 3, have: 1 })).toBe("10/30분");
    expect(todoProgressText({ kind: "stay", need: 3, have: 9 })).toBe("30/30분");
    expect(todoProgressText({ kind: "fish", need: 3, have: 1 })).toBe("1/3마리");
    expect(todoProgressText({ kind: "sell", need: 1, have: 0 })).toBe("0/1번");
    expect(todoProgressText({ kind: "hunt", need: 1, have: 0 })).toBe("0/1판");
  });

  it("도장 7개마다 강화 증폭권(옛 보호 문서)", () => {
    expect(TODO_PROT_EVERY).toBe(7);
  });
});

describe("오늘의 할 일 (라우트)", () => {
  it("진행을 다 채운 칸만 300P + 결재 서류, 같은 칸은 한 번, 셋 다 받으면 1,000P + 서류와 도장", async () => {
    const { id, cookie } = await newAccount();
    const day = kstDay(T0);
    const picks = todoPicks(day, id);
    const need = (k: TodoKind) => TODO_POOL.find((d) => d.kind === k)!.need;
    // 아직이면 거절
    expect((await post(cookie, { do: "todo", which: 0 }, T0)).json.error?.code).toBe("TODO_NOT_YET");
    for (let i = 0; i < 3; i++) {
      const k = picks[i];
      for (let n = 1; n <= need(k); n++) expect(await act(id, k, day)).toBe(n);
      const d0 = (await bag(id)).doc;
      const p0 = (await getAccounts().get(id, day, T0)).points;
      const r = await post(cookie, { do: "todo", which: i }, T0);
      expect(r.status).toBe(200);
      expect(r.json.points).toBe(TODO_GIFT.points);
      expect(r.json.me?.points).toBe(p0 + TODO_GIFT.points!);
      expect((await bag(id)).doc - d0).toBe(TODO_GIFT.bundle?.mats?.m_doc);
      expect(r.json.me?.retain?.todo.items[i]).toMatchObject({ kind: k, claimed: true });
      expect((await post(cookie, { do: "todo", which: i }, T0)).json.error?.code).toBe("TODO_DONE");
      // 셋 다 받기 전에는 도장 못 받음
      if (i < 2) expect((await post(cookie, { do: "todo", which: 3 }, T0)).json.error?.code).toBe("TODO_NOT_YET");
    }
    const d0 = (await bag(id)).doc;
    const bonus = await post(cookie, { do: "todo", which: 3 }, T0);
    expect(bonus.json.me?.retain?.todo).toMatchObject({ bonus: true, stamps: 1 });
    expect(bonus.json.points).toBe(TODO_BONUS_GIFT.points);
    expect((await bag(id)).doc - d0).toBe(TODO_BONUS_GIFT.bundle?.mats?.m_doc);
    expect((await post(cookie, { do: "todo", which: 3 }, T0)).json.error?.code).toBe("TODO_DONE");
    // 다음 날은 새 할 일, 받은 표시도 새로
    const next = await post(cookie, { do: "todo", which: 0 }, noon(addDays(day, 1)));
    expect(next.json.error?.code).toBe("TODO_NOT_YET");
  });

  it("그날 할 일이 아닌 행동은 진행 칸을 건드리지 않는다 (명령도 늘지 않는다)", async () => {
    const { id } = await newAccount();
    const day = kstDay(T0);
    const picks = todoPicks(day, id);
    const other = TODO_POOL.map((d) => d.kind).find((k) => k !== "stay" && !picks.includes(k)) as Exclude<TodoKind, "stay">;
    expect(questHook(id, day, other)).toBeNull();
    const a = await getAccounts().get(id, day, T0);
    expect(a.retain.quest).toEqual({});
  });

  it("행동 응답의 진행 한 칸 (todo)", async () => {
    const { id } = await newAccount();
    const day = kstDay(T0);
    const k = todoPicks(day, id).find((x) => x !== "stay")!;
    const hook = questHook(id, day, k as Exclude<TodoKind, "stay">);
    expect(todoTickOf(hook, day)).toEqual({});
    hook!.have = hook!.local(1);
    expect(todoTickOf(hook, day)).toEqual({ todo: { kind: k, have: 1, day } });
  });

  it("운영자 계정은 받지 않는다", async () => {
    const { id, cookie } = await newAccount();
    const { setStaff } = await import("@/lib/staff");
    await setStaff(id);
    try {
      expect((await post(cookie, { do: "path" }, T0)).status).toBe(403);
    } finally {
      await setStaff(null);
    }
  });
});
