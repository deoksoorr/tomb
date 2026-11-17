import { isShopListed, ITEMS, type ChampBoard } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { askOf } from "@/lib/champPerks";
import { npcBuys, npcById, SPECIES, STACK_MAX } from "@/lib/forage/catalog";
import { sellTo } from "@/lib/forage/service";
import { getForageStore } from "@/lib/forage/store";
import { prevWeek } from "@/lib/gameDay";
import { FURNITURE } from "@/lib/housing/catalog";
import { buyPlot, getHouseStore } from "@/lib/housing/service";
import { huntPlan } from "@/lib/rpg/plan";
import type { RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { getAccounts } from "@/lib/store";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import { primeChampCache } from "@/lib/store/champ";
import { discountedPrice, PERK_VALUES } from "@/lib/titles";
import { forgetTitles } from "@/lib/titlesServer";
import * as houseBuy from "./housing/me/buy/route";
import * as finish from "./rpg/run/finish/route";
import * as start from "./rpg/run/start/route";
import * as session from "./session/route";
import * as shopBuy from "./shop/buy/route";

// 11/17 주간 레이스 1위 1주일 혜택이 서버 흐름에 실려 가는지 (값·계산은 lib/champPerks.test, 적립 저장소는 lib/store/accounts.test).
// 자격은 지난주 1위 기록 하나 — 기록을 프로세스 캐시에 넣어 "지금 1위"를 만든다 (배포 즉시 지금 1위에게 붙는 것과 같은 길)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const call = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.78.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}

/** 지난주 1위로 만든다 (이 계정만 — 부를 때마다 그 주 기록을 바꿔 끼운다) */
function crown(id: string, boards: ChampBoard[]): void {
  const now = Date.now();
  primeChampCache({ week: prevWeek(kstWeek(now)), winners: boards.map((board) => ({ board, accountId: id, name: "1위", value: 1 })), settledAt: now }, now);
}

const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;

describe("11/17 1위 혜택 — 서버 흐름", () => {
  it("꾸미기 상점: 포인트왕은 20% (염색권은 원가), 칭호 할인과 겹치면 큰 것 하나만", async () => {
    const v = await newVisitor();
    await getAccounts().earn(v.id, "flower", kstDay());
    await getAccounts().adjustPoints(v.id, 50_000);
    const cos = ITEMS.filter((i) => i.kind === "cosmetic" && isShopListed(i) && i.price >= 100);
    const dye = ITEMS.find((i) => i.kind === "dye" && isShopListed(i) && i.price > 0)!;
    const buy = async (itemId: string) => {
      const before = await pts(v.id);
      expect((await shopBuy.POST(call("/api/shop/buy", v, { itemId }))).status).toBe(200);
      return before - (await pts(v.id));
    };
    // 1위가 아니면 원가
    crown("someone-else", ["points"]);
    expect(await buy(cos[0].id)).toBe(cos[0].price);
    crown(v.id, ["points"]);
    expect(await buy(cos[1].id)).toBe(discountedPrice(cos[1].price, 0.2));
    expect(await buy(dye.id)).toBe(dye.price);
    // 패션 갈래 전설 칭호(8%)를 달아도 20% 하나만 (28%가 아니다)
    await getAccounts().setTitle(v.id, "t_look3000");
    forgetTitles(v.id);
    expect(await buy(cos[2].id)).toBe(discountedPrice(cos[2].price, 0.2));
    // 낚시왕은 상점 할인이 없다 → 칭호 할인만
    crown(v.id, ["fish"]);
    expect(await buy(cos[3].id)).toBe(discountedPrice(cos[3].price, PERK_VALUES.look.legend));
  });

  it("가구 상점: 포인트왕은 20%, 집 갈래 칭호(5%)와 겹쳐도 20% 하나", async () => {
    const v = await newVisitor();
    const f = FURNITURE.find((x) => x.price >= 100 && !x.skin && !x.ext)!;
    await getAccounts().earn(v.id, "flower", kstDay());
    await getAccounts().adjustPoints(v.id, 50_000);
    await buyPlot(getHouseStore(), v.id, "1위 집", "", "a");
    await getAccounts().setTitle(v.id, "t_house400");
    forgetTitles(v.id);
    crown(v.id, ["points", "huntKills"]);
    const before = await pts(v.id);
    expect((await houseBuy.POST(call("/api/housing/me/buy", v, { itemId: f.id }))).status).toBe(200);
    expect(before - (await pts(v.id))).toBe(discountedPrice(f.price, 0.2));
  });

  it("사냥왕: 사냥 판 경험치 +15% (화면에 사냥왕 몫을 따로 싣는다)", async () => {
    const clearAll = (seed: number) => {
      const kills: Record<string, number> = {};
      const plan = huntPlan(seed, "easy");
      for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      return { game: "hunt", durationMs: 100_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {} };
    };
    const run = async (boards: ChampBoard[]) => {
      const v = await newVisitor();
      crown(v.id, boards);
      const s = (await (await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy" }))).json()) as RunStartResponse;
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 101_000);
      try {
        const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: clearAll(s.seed) }));
        expect(res.status).toBe(200);
        return ((await res.json()) as RunFinishResponse).reward;
      } finally {
        clock.mockRestore();
      }
    };
    const plain = await run(["fish"]);
    expect(plain.champExp).toBeUndefined();
    const champ = await run(["huntKills"]);
    expect(champ.champExp).toBeGreaterThan(0);
    expect(champ.exp).toBe(Math.round((champ.exp - champ.champExp!) * 1.15));
  });

  it("낚시왕: 물고기 판매 값 +20% (판 값으로는 그대로 다 판다)", async () => {
    const v = await newVisitor();
    const npc = npcById("fishmonger")!;
    const sp = SPECIES.find((s) => s.cat === "fish" && npcBuys(npc, s) && s.price >= 5)!;
    const store = getForageStore();
    await store.grant(v.id, kstDay(), "fish", [{ id: sp.id, size: 100 }, { id: sp.id, size: 100 }], STACK_MAX);
    crown(v.id, ["fish"]);
    const r = await sellTo(v.id, "fishmonger", { [sp.id]: 2 }, v.ip);
    expect(r.sold).toEqual({ [sp.id]: 2 });
    expect(r.earned).toBe(askOf(sp.price * 2, 120));
    expect(r.state.today.fishCap).toBe(450);
  });
});
