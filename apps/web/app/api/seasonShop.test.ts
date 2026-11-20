import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isPermanentUntil, itemById, seasonPrice } from "@tomb/protocol";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import { prevWeek } from "@/lib/gameDay";
import { primeChampCache } from "@/lib/store/champ";
import { getAccounts } from "@/lib/store";
import { kstMs } from "@/lib/seasonShop/schedule";
import type { SeasonBuyResult, SeasonCosRow, SeasonStatus } from "@/lib/seasonShop/service";
import * as season from "./season-shop/route";
import * as session from "./session/route";

// 11/19 계절 보따리상 서버 흐름: 판매 예정 거절 · 판매 중 하루권·영구 · 판매 끝 거절 · 할인 · 펫은 영구만 · 가구는 집이 있어야
// (아이템 정의가 아직 없으면 그 부분은 건너뛴다 — 아이템 에이전트 작업과 맞물림)

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
async function newVisitor(points = 30_000): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.93.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
const at = (t: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(t);
};
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const ready = !!itemById("sc_earflap") && !!seasonPrice("sc_earflap");

describe("11/19 계절 보따리상 — 서버", () => {
  it("종류가 틀리면 400", async () => {
    const v = await newVisitor();
    expect((await season.GET(req("/api/season-shop?kind=zz", v))).status).toBe(400);
    expect((await season.POST(req("/api/season-shop", v, { kind: "zz", id: "sc_earflap" }))).status).toBe(400);
  });

  it("일정에 없는 물건은 400 NOT_SOLD (잡화점 물건을 노점으로 사지 못해요)", async () => {
    at(kstMs(2026, 11, 22, 12));
    const v = await newVisitor();
    const r = await season.POST(req("/api/season-shop", v, { kind: "cos", id: "hat_cat", mode: "day" }));
    expect(r.status).toBe(400);
    expect(await code(r)).toBe("NOT_SOLD");
    const f = await season.POST(req("/api/season-shop", v, { kind: "furn", id: "sc_earflap" }));
    expect(await code(f)).toBe("NOT_SOLD");
  });

  it.runIf(ready)("판매 예정이면 보이지만 사기는 409 SEASON_SOON (포인트 그대로), 토요일 새벽 5시부터 하루권·영구", async () => {
    at(kstMs(2026, 11, 19, 22)); // 목요일 밤: 첫 묶음은 판매 예정
    const v = await newVisitor();
    const st = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(st.on).toEqual([]);
    expect(st.soon[0].set).toBe("snow-commute");
    // 11/20 세트마다 다섯 점을 한 번에
    expect(st.soon[0].items.map((i) => i.id)).toEqual(["sc_earflap", "sc_padding", "sc_goguma", "sc_breath", "sc_snowduck"]);
    expect(st.soon[0].bonus === "" || st.soon[0].bonus.startsWith("한 벌을 다 입으면")).toBe(true);
    // 11/20 판매 예정은 값을 감춰 보낸다 (판매 시작 때 공개)
    for (const it of st.soon[0].items) expect(it).toMatchObject({ hidden: true, day: null, perm: { base: 0, cost: 0 } });
    const before = await pts(v.id);
    const soon = await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_earflap", mode: "day" }));
    expect(soon.status).toBe(409);
    expect(await code(soon)).toBe("SEASON_SOON");
    expect(await pts(v.id)).toBe(before);

    at(kstMs(2026, 11, 21, 4, 59)); // 1분 전도 판매 예정
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_earflap", mode: "perm" })))).toBe("SEASON_SOON");

    at(kstMs(2026, 11, 21, 5)); // 토요일 05:00
    const on = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(on.on[0].items.map((i) => i.id)).toEqual(["sc_earflap", "sc_padding", "sc_goguma", "sc_breath", "sc_snowduck"]);
    // 다음 세트(야근 요정)는 판매 예정 칸에, 값은 감춰서
    expect(on.soon[0].set).toBe("overtime-fairy");
    expect(on.soon[0].items.every((i) => (i as SeasonCosRow).hidden)).toBe(true);
    const row = on.on[0].items[0] as SeasonCosRow;
    const price = seasonPrice("sc_earflap")!;
    expect(row.day).toEqual({ base: price.day, cost: price.day });
    expect(row.perm).toEqual({ base: price.perm, cost: price.perm });

    const b0 = await pts(v.id);
    const day = await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_earflap", mode: "day" }));
    expect(day.status).toBe(200);
    expect(b0 - (await pts(v.id))).toBe(price.day);
    expect(((await day.json()) as SeasonBuyResult).me.inventory.sc_earflap).toBe(1);
    // 같은 하루권을 또 사면 409 (잡화점과 같은 규칙), 이용권이 가방에 있으면 영구도 HAS_TICKET
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_earflap", mode: "day" })))).toBe("ALREADY_OWNED");
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_earflap", mode: "perm" })))).toBe("HAS_TICKET");

    const b1 = await pts(v.id);
    const perm = await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_goguma", mode: "perm" }));
    expect(perm.status).toBe(200);
    const body = (await perm.json()) as SeasonBuyResult;
    expect(b1 - (await pts(v.id))).toBe(seasonPrice("sc_goguma")!.perm);
    expect([...body.me.equipped, ...body.me.stash].some((e) => e.itemId === "sc_goguma" && isPermanentUntil(e.until))).toBe(true);
    expect(body.lookGrant).toBeTruthy();
    expect(body.got).toBe(itemById("sc_goguma")!.name);
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_goguma", mode: "perm" })))).toBe("ALREADY_OWNED");
  });

  it.runIf(ready)("펫은 하루권이 없어요 (영구만) · 판매가 끝나면 409 SEASON_ENDED, 산 것은 그대로", async () => {
    at(kstMs(2026, 11, 28, 6));
    const v = await newVisitor(60_000);
    if (seasonPrice("sc_snowduck")?.day === null) {
      expect((await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_snowduck", mode: "day" }))).status).toBe(400);
      expect((await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_snowduck", mode: "perm" }))).status).toBe(200);
    }
    // 11/20 딱 2주: 12/5 새벽 5시부터 첫눈 출근길은 판매 끝 (다음 세트들은 판매 중)
    at(kstMs(2026, 12, 5, 5));
    const end = await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_earflap", mode: "perm" }));
    expect(end.status).toBe(409);
    expect(await code(end)).toBe("SEASON_ENDED");
    const me = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(me.on.map((g) => g.set)).toEqual(["overtime-fairy", "fog-keeper"]);
  });

  it("11/20 새 다섯 벌: 12/26 송년회 3차 판매 (그 전 주엔 판매 예정), 1/9 새벽 5시부터 판매 끝 · 1월 내내 두 벌씩 판매 중", async () => {
    at(kstMs(2026, 12, 19, 12));
    const v = await newVisitor(60_000);
    const before = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(before.on.map((g) => g.set)).toEqual(["santa-intern", "sports-day"]);
    expect(before.soon.map((g) => g.set)).toEqual(["year-end", "sunrise-hike"]);
    expect(before.soon[0].items.map((i) => i.id)).toEqual(["ye_tiehead", "ye_mic", "ye_tambo", "ye_tipsy", "ye_raccoon"]);
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "cos", id: "ye_raccoon", mode: "perm" })))).toBe("SEASON_SOON");
    at(kstMs(2026, 12, 26, 5));
    const st = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(st.on.map((g) => g.set)).toEqual(["sports-day", "year-end"]);
    const row = st.on[1].items.find((r) => r.id === "ye_tiehead") as SeasonCosRow;
    expect(row.day).toEqual({ base: 350, cost: 350 });
    expect(row.perm).toEqual({ base: 1400, cost: 1400 });
    // 펫은 영구만 (6,000P)
    expect((await season.POST(req("/api/season-shop", v, { kind: "cos", id: "ye_raccoon", mode: "day" }))).status).toBe(400);
    const b0 = await pts(v.id);
    expect((await season.POST(req("/api/season-shop", v, { kind: "cos", id: "ye_raccoon", mode: "perm" }))).status).toBe(200);
    expect(b0 - (await pts(v.id))).toBe(6000);
    at(kstMs(2027, 1, 9, 5));
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "cos", id: "ye_tiehead", mode: "day" })))).toBe("SEASON_ENDED");
    const jan = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(jan.on.map((g) => g.set)).toEqual(["sunrise-hike", "resolution"]);
    expect(jan.soon.map((g) => g.set)).toEqual(["smelt-fest", "frost-yard"]);
  });

  it.runIf(ready)("포인트왕 20% 할인이 잡화점과 같게 붙어요", async () => {
    at(kstMs(2026, 11, 22, 12));
    const v = await newVisitor();
    const now = Date.now();
    primeChampCache({ week: prevWeek(kstWeek(now)), winners: [{ board: "points", accountId: v.id, name: "1위", value: 1 }], settledAt: now }, now);
    const st = (await (await season.GET(req("/api/season-shop?kind=cos", v))).json()) as SeasonStatus;
    expect(st.rate).toBe(0.2);
    const row = st.on[0].items.find((r) => r.id === "sc_breath") as SeasonCosRow;
    expect(row.perm.cost).toBe(Math.floor(row.perm.base * 0.8));
    const b = await pts(v.id);
    expect((await season.POST(req("/api/season-shop", v, { kind: "cos", id: "sc_breath", mode: "perm" }))).status).toBe(200);
    expect(b - (await pts(v.id))).toBe(row.perm.cost);
  });

  it("가구 노점: 판매 예정이면 거절, 판매 중이어도 집이 없으면 NO_HOUSE (정의가 들어온 가구만)", async () => {
    at(kstMs(2026, 11, 20, 12)); // 첫 가구 묶음(11/24 화)은 판매 예정
    const v = await newVisitor();
    const st = (await (await season.GET(req("/api/season-shop?kind=furn", v))).json()) as SeasonStatus;
    expect(st.house).toBe(false);
    expect(st.on).toEqual([]);
    for (const g of st.soon) for (const it of g.items) expect(it).toMatchObject({ hidden: true, base: 0, cost: 0 });
    expect(await code(await season.POST(req("/api/season-shop", v, { kind: "furn", id: "winter_stove" })))).toBe("SEASON_SOON");
    at(kstMs(2026, 11, 24, 5));
    const r = await season.POST(req("/api/season-shop", v, { kind: "furn", id: "winter_stove" }));
    // 정의가 아직 없으면 NOT_SOLD, 있으면 집이 없어서 NO_HOUSE
    expect(["NOT_SOLD", "NO_HOUSE"]).toContain(await code(r));
  });
});
