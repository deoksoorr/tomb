import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isDyeableCosmetic, isDyeSlotCosmetic, ITEMS, permanentPrice } from "@tomb/protocol";
import { DYE_CENTER } from "@/lib/dye/palette";
import { DYE_SELECT_LOCK_MS } from "@/lib/dye/rules";
import { DyeSelectSchema } from "@/lib/dye/schemas";
import { issueFixedDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { getAccounts, getGifts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import type { Me } from "@/lib/types";
import { WearSchema } from "@/lib/validate";
import * as finish from "./dye/finish/route";
import * as fixed from "./dye/fixed/route";
import * as pick from "./dye/pick/route";
import * as select from "./dye/select/route";
import * as slotBuy from "./dye/slot/route";
import * as special from "./dye/special/route";
import * as start from "./dye/start/route";
import * as unequip from "./me/unequip/route";
import * as wear from "./me/wear/route";
import * as session from "./session/route";
import * as permanent from "./shop/permanent/route";

// 11/22 운영자 로컬 보고 회귀: 영구로 산 옷(wr_*)·모자에 커스텀 1→2→3 칠하기 · 색 보관함 칸 바꾸기 · 염색권 네 가지로 다시 칠하기 ·
// 벗었다 다시 입기 — 요청·응답의 아이템 id가 늘 카탈로그 id 그대로이고 「염색할 수 없는 꾸미기」·「캐릭터 꾸미기 아이템이 아니에요」가 나오지 않는다.
// + 「이 색 입기」 연타 잠금 (10초 안에 6번째부터, 단계마다 길어짐, 다른 기능은 그대로)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.useRealTimers();
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const req = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(points = 40_000): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.93.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().enter(v.id, { name: `검수${seq}`, color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
/** 상점 요청 한도(분당 20번)를 넘지 않게 요청마다 시계를 4초씩 민다 */
let clock = Date.UTC(2026, 10, 22, 3, 0);
function tick(ms = 4_000) {
  clock += ms;
  vi.setSystemTime(clock);
}
async function call(route: { POST: (r: NextRequest) => Promise<Response> }, path: string, v: Visitor, body: unknown, gap = 4_000) {
  tick(gap);
  const res = await route.POST(req(path, v, body));
  const json = (await res.json()) as StyleChangeResponse & { error?: { code: string; message: string } };
  return { status: res.status, json, retryAfter: res.headers.get("retry-after") };
}
const ok = (r: { status: number; json: { error?: { message: string } } }) => {
  expect(r.json.error?.message ?? "", r.json.error?.message).toBe("");
  expect(r.status).toBe(200);
};
const ids = (me: Me) => [...me.equipped.map((e) => e.itemId), ...me.stash.map((e) => e.itemId)].sort();
async function give(v: Visitor, itemId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await getAccounts().adjustPoints(v.id, 1000);
    await getAccounts().buy(v.id, itemId, 1000);
  }
}

describe("11/22 색 보관함 서버 흐름 (실제 라우트, 메모리 저장소)", () => {
  it("상점 옷 다섯 벌(wr_*)도 카탈로그 꾸미기: 입기 검증·칸 고르기 검증·염색 칸을 모두 통과한다", () => {
    const wr = ITEMS.filter((i) => i.id.startsWith("wr_"));
    expect(wr.map((i) => i.id)).toEqual(["wr_shirt", "wr_puffer", "wr_robe", "wr_apron", "wr_coat"]);
    for (const it of wr) {
      expect(WearSchema.safeParse({ itemId: it.id }).success, it.id).toBe(true);
      expect(DyeSelectSchema.safeParse({ item: it.id, sel: 2 }).success, it.id).toBe(true);
      expect(isDyeSlotCosmetic(it.id) && isDyeableCosmetic(it.id), it.id).toBe(true);
      expect(permanentPrice(it.id), it.id).not.toBeNull();
    }
  });

  it("영구 옷 2벌·모자: 커스텀 1→3 칠하기 → 칸 바꾸기 → 염색권 네 가지로 덮어 칠하기 → 벗고 다시 입기 (id 그대로)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    tick(0);
    const v = await newVisitor();
    await give(v, "q_dye_pick", 8);
    await give(v, "q_dye_special", 2);
    await give(v, "dye_basic", 2);
    const { def, giftId } = await issueFixedDye({ name: "검수 빨강", color: "#ff0000", count: 2, target: v.id }, clock);
    expect((await getGifts().claim(v.id, giftId, clock - 120_000, clock)).ok).toBe(true);
    for (const it of ["wr_shirt", "wr_robe", "hat_beanie"]) ok(await call(permanent, "/api/shop/permanent", v, { itemId: it }));
    ok(await call(wear, "/api/me/wear", v, { itemId: "wr_shirt" }));

    for (const item of ["wr_shirt", "wr_robe"]) {
      ok(await call(pick, "/api/dye/pick", v, { itemId: "q_dye_pick", part: item, color: "#112233", slot: 0 }));
      ok(await call(slotBuy, "/api/dye/slot", v, { item }));
      ok(await call(pick, "/api/dye/pick", v, { itemId: "q_dye_pick", part: item, color: "#223344", slot: 1 }));
      ok(await call(slotBuy, "/api/dye/slot", v, { item }));
      const c3 = await call(pick, "/api/dye/pick", v, { itemId: "q_dye_pick", part: item, color: "#334455", slot: 2 });
      ok(c3);
      expect(c3.json.me.itemDyes?.[item]).toEqual({ colors: ["#112233", "#223344", "#334455"], sel: 2 });
      // 보고 2: 커스텀 3을 입은 채 커스텀 1·2 → 「염색할 수 없는 꾸미기」가 아니라 그 칸을 입는다
      for (const sel of [0, 1, -1, 2]) {
        const r = await call(select, "/api/dye/select", v, { item, sel }, 3_000);
        ok(r);
        expect(r.json.me.itemDyes?.[item]?.sel).toBe(sel);
      }
    }
    // 보고 3·5: 칠한 칸 다시 칠하기 — 염색권 네 가지 모두 그 칸만 바뀌고 그 칸을 입는다
    const fx = await call(fixed, "/api/dye/fixed", v, { itemId: def.id, part: "wr_shirt", slot: 0 });
    ok(fx);
    expect(fx.json.me.itemDyes?.wr_shirt).toEqual({ colors: ["#ff0000", "#223344", "#334455"], sel: 0 });
    const sp = await call(special, "/api/dye/special", v, { itemId: "q_dye_special", part: "wr_shirt", kind: "g", slot: 1 });
    ok(sp);
    expect(sp.json.me.itemDyes?.wr_shirt).toEqual({ colors: ["#ff0000", "#e2b24a~g", "#334455"], sel: 1 });
    const st = await call(start, "/api/dye/start", v, { itemId: "dye_basic", part: "wr_robe", slot: 0 });
    ok(st);
    const seed = (st.json as unknown as { session: { seed: string; part: string; slot: number } }).session;
    expect(seed).toMatchObject({ part: "wr_robe", slot: 0 });
    const fin = await call(finish, "/api/dye/finish", v, { seed: seed.seed, x: DYE_CENTER.x + 0.5, y: DYE_CENTER.y + 0.5 }, 1_000);
    ok(fin);
    expect(fin.json.me.itemDyes?.wr_robe).toEqual({ colors: [fin.json.color, "#223344", "#334455"], sel: 0 });
    ok(await call(pick, "/api/dye/pick", v, { itemId: "q_dye_pick", part: "hat_beanie", color: "#a0a0a0" }));

    // 보고 6: 처음 옷을 벗고 다시 입기 — 「캐릭터 꾸미기 아이템이 아니에요」 없이, 칠한 칸 그대로
    const before = ids((await call(wear, "/api/me/wear", v, { itemId: "wr_robe" })).json.me);
    expect(before).toEqual(["hat_beanie", "wr_robe", "wr_shirt"]);
    ok(await call(unequip, "/api/me/unequip", v, { slot: "back" }));
    const back = await call(wear, "/api/me/wear", v, { itemId: "wr_shirt" });
    ok(back);
    expect(ids(back.json.me)).toEqual(before);
    expect(back.json.me.dye?.items?.wr_shirt).toBe("#e2b24a~g");
    ok(await call(wear, "/api/me/wear", v, { itemId: "wr_robe" }));
    const me = (await call(select, "/api/dye/select", v, { item: "wr_shirt", sel: 2 }, 3_000)).json.me;
    expect(me.itemDyes?.wr_shirt?.sel).toBe(2);
    // 모든 응답의 색 보관함 키는 카탈로그 id 그대로
    expect(Object.keys(me.itemDyes ?? {}).sort()).toEqual(["hat_beanie", "wr_robe", "wr_shirt"]);
  });

  it("연타 잠금: 10초 안에 5번까지 되고 6번째는 429 + 남은 초, 잠금 중에도 입기·벗기·칠하기는 되고, 10분 뒤 풀린다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    tick(60_000);
    const v = await newVisitor();
    await give(v, "q_dye_pick", 2);
    ok(await call(permanent, "/api/shop/permanent", v, { itemId: "wr_coat" }));
    ok(await call(pick, "/api/dye/pick", v, { itemId: "q_dye_pick", part: "wr_coat", color: "#204060" }));
    tick(60_000);
    for (let i = 0; i < 5; i++) ok(await call(select, "/api/dye/select", v, { item: "wr_coat", sel: i % 2 ? 0 : -1 }, 1_000));
    const locked = await call(select, "/api/dye/select", v, { item: "wr_coat", sel: 0 }, 1_000);
    expect(locked.status).toBe(429);
    expect(locked.json.error?.code).toBe("DYE_SELECT_LOCKED");
    expect(locked.retryAfter).toBe(String(DYE_SELECT_LOCK_MS[0] / 1000));
    expect(locked.json.error?.message).toBe("너무 자주 바꿨어요. 10:00 뒤에 다시 입을 수 있어요.");
    // 잠금 중: 같은 요청은 남은 시간만큼 (60초 지나면 9:00)
    const still = await call(select, "/api/dye/select", v, { item: "wr_coat", sel: 0 }, 60_000);
    expect(still.status).toBe(429);
    expect(still.retryAfter).toBe(String(DYE_SELECT_LOCK_MS[0] / 1000 - 60));
    // 잠금과 무관: 입기·벗기·염색권 칠하기
    ok(await call(wear, "/api/me/wear", v, { itemId: "wr_coat" }));
    ok(await call(unequip, "/api/me/unequip", v, { slot: "back" }));
    const painted = await call(pick, "/api/dye/pick", v, { itemId: "q_dye_pick", part: "wr_coat", color: "#ffeecc", slot: 0 });
    ok(painted);
    expect(painted.json.me.itemDyes?.wr_coat?.colors[0]).toBe("#ffeecc");
    // 10분 뒤 풀린다
    tick(DYE_SELECT_LOCK_MS[0]);
    ok(await call(select, "/api/dye/select", v, { item: "wr_coat", sel: -1 }, 1_000));
    expect((await getAccounts().get(v.id, kstDay(clock), clock)).points).toBeGreaterThan(0);
  });
});
