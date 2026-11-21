import { isShopListed, ITEMS, type ChampBoard } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CHAIR_DUO, CHAIR_REWARD } from "@/lib/chairman/rewards";
import { chairWeek, type ChairMode } from "@/lib/chairman/rules";
import { resetChairMemo } from "@/lib/chairman/settle";
import { getChairStore, type ChairSettle, type ChairWinner } from "@/lib/chairman/store";
import type { ChairPerk } from "@/lib/chairPerks";
import { prevWeek } from "@/lib/gameDay";
import { FURNITURE } from "@/lib/housing/catalog";
import { buyPlot, getHouseStore } from "@/lib/housing/service";
import { ENHANCE_TABLE } from "@/lib/rpg/enhance";
import type { GearActionResponse } from "@/lib/rpg/gearService";
import { huntPlan } from "@/lib/rpg/plan";
import { grantTowerRun, rpgView } from "@/lib/rpg/service";
import { encodeSg, type SgItem } from "@/lib/rpg/setGear";
import { SG_CHEST_CHANCE } from "@/lib/rpg/setGearRoll";
import { getRpgStore } from "@/lib/rpg/store";
import { isChestFloor, isCheckpoint, nextCheckpoint, TOWER_CHEST_FROM, towerChestDrops } from "@/lib/rpg/tower";
import type { CharacterState, Drop, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { getAccounts } from "@/lib/store";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import { primeChampCache } from "@/lib/store/champ";
import { discountedPrice } from "@/lib/titles";
import { forgetTitles } from "@/lib/titlesServer";
import * as houseBuy from "./housing/me/buy/route";
import * as gear from "./rpg/gear/route";
import * as finish from "./rpg/run/finish/route";
import * as start from "./rpg/run/start/route";
import * as session from "./session/route";
import * as shopBuy from "./shop/buy/route";

// 11/24 회장님 독대 1위 1주일 혜택이 서버 흐름에 실려 가는지 (값은 lib/chairPerks.test, 자격·하루 판은 lib/chairman/perks.test).
// 자격은 지난주 회장님 독대 정리 기록 하나 — 그 기록을 저장소에 넣어 "지금 1위"를 만든다 (정리가 끝난 뒤와 같은 길)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const call = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: v.cookie,
      "x-forwarded-for": v.ip,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return {
    cookie,
    ip: `10.79.${++seq}.1`,
    id: ((await res.json()) as { visitorId: string }).visitorId,
  };
}

const win = (accountId: string): ChairWinner => ({
  accountId,
  damage: 1_000_000,
  at: 1,
  name: "1위",
  rank: 1,
});
/** 지난주 회장님 독대 1위로 만든다 (duo = 노멀·헬 모두 같은 사람). 부를 때마다 그 주 기록을 바꿔 끼운다 */
function chairCrown(id: string, perk: ChairPerk | null): void {
  const week = prevWeek(chairWeek(Date.now()));
  const store = getChairStore() as unknown as {
    settles: Map<string, ChairSettle>;
  };
  const ranks: Record<ChairMode, ChairWinner[]> = {
    normal: perk === "normal" || perk === "duo" ? [win(id)] : [win("someone-normal")],
    hell: perk === "hell" || perk === "duo" ? [win(id)] : [win("someone-hell")],
  };
  store.settles.set(week, { week, settledAt: Date.now(), ranks, pay: [] });
  resetChairMemo();
}
/** 지난주 레이스 1위 (lib/store/champ 프로세스 캐시) */
function crown(id: string, boards: ChampBoard[]): void {
  const now = Date.now();
  primeChampCache(
    {
      week: prevWeek(kstWeek(now)),
      winners: boards.map((board) => ({
        board,
        accountId: id,
        name: "1위",
        value: 1,
      })),
      settledAt: now,
    },
    now,
  );
}

const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;

describe("11/24 회장님 독대 1위 혜택 — 서버 흐름", () => {
  it("정리 기록의 칭호 주인과 같은 자격 (노멀 1위 = 「연봉 협상의 신」 주인)", async () => {
    const v = await newVisitor();
    chairCrown(v.id, "duo");
    const { chairHolders } = await import("@/lib/chairman/settle");
    expect((await chairHolders()).get(CHAIR_DUO.title)).toBe(v.id);
    chairCrown(v.id, "normal");
    expect((await chairHolders()).get(CHAIR_REWARD.normal.title)).toBe(v.id);
  });

  it("꾸미기 상점: 노멀 1위 30% (염색권은 원가), 포인트왕 20%·패션 칭호와 겹쳐도 30% 하나 · 헬 1위는 할인 없음", async () => {
    const v = await newVisitor();
    await getAccounts().earn(v.id, "flower", kstDay());
    await getAccounts().adjustPoints(v.id, 80_000);
    const cos = ITEMS.filter((i) => i.kind === "cosmetic" && isShopListed(i) && i.price >= 100);
    const dye = ITEMS.find((i) => i.kind === "dye" && isShopListed(i) && i.price > 0)!;
    const buy = async (itemId: string) => {
      const before = await pts(v.id);
      expect((await shopBuy.POST(call("/api/shop/buy", v, { itemId }))).status).toBe(200);
      return before - (await pts(v.id));
    };
    crown("someone-else", ["points"]);
    chairCrown(v.id, "hell");
    expect(await buy(cos[0].id)).toBe(cos[0].price);
    chairCrown(v.id, "normal");
    expect(await buy(cos[1].id)).toBe(discountedPrice(cos[1].price, 0.3));
    expect(await buy(dye.id)).toBe(dye.price);
    // 포인트왕(20%) + 패션 전설 칭호(8%)까지 겹쳐도 가장 큰 30% 하나 (58%가 아니다)
    crown(v.id, ["points"]);
    await getAccounts().setTitle(v.id, "t_look3000");
    forgetTitles(v.id);
    expect(await buy(cos[2].id)).toBe(discountedPrice(cos[2].price, 0.3));
    // 2관왕도 30%
    chairCrown(v.id, "duo");
    expect(await buy(cos[3].id)).toBe(discountedPrice(cos[3].price, 0.3));
    // 다음 1위로 넘어가면 포인트왕 20%로 돌아온다
    chairCrown(v.id, null);
    expect(await buy(cos[4].id)).toBe(discountedPrice(cos[4].price, 0.2));
  });

  it("가구 상점: 노멀 1위 30% (포인트왕 20%·집 칭호와 겹쳐도 하나)", async () => {
    const v = await newVisitor();
    const f = FURNITURE.find((x) => x.price >= 100 && !x.skin && !x.ext)!;
    await getAccounts().earn(v.id, "flower", kstDay());
    await getAccounts().adjustPoints(v.id, 50_000);
    await buyPlot(getHouseStore(), v.id, "회장님 집", "", "a");
    await getAccounts().setTitle(v.id, "t_house400");
    forgetTitles(v.id);
    crown(v.id, ["points"]);
    chairCrown(v.id, "normal");
    const before = await pts(v.id);
    expect((await houseBuy.POST(call("/api/housing/me/buy", v, { itemId: f.id }))).status).toBe(200);
    expect(before - (await pts(v.id))).toBe(discountedPrice(f.price, 0.3));
  });

  it("강화: 노멀 1위는 포인트 30% 덜 (재료는 그대로) — 화면 비용(원가)을 보내면 COST_CHANGED, 헬 1위는 원가", async () => {
    const v = await newVisitor();
    const sg: SgItem = {
      s: 0,
      p: 0,
      g: 3,
      u: 1,
      e: 5,
      o: [["a", 7]],
      L: 0,
      rr: 0,
      f: 0,
    };
    await getRpgStore().update(v.id, (s): { state: CharacterState; result: null } => ({
      state: {
        ...s,
        level: 50,
        sg: [encodeSg(sg)],
        sgN: 2,
        mats: { doc: 20, seal: 0, prot: 0 },
      },
      result: null,
    }));
    await getAccounts().refund(v.id, 20_000, "시험", Date.now());
    const act = async (cost: number) => {
      const res = await gear.POST(call("/api/rpg/gear", v, { type: "enhance", sg: 1, cost }));
      return {
        status: res.status,
        body: (await res.json()) as GearActionResponse & {
          error?: { code: string };
        },
      };
    };
    const row = ENHANCE_TABLE[6];
    const off = discountedPrice(row.cost, 0.3);
    chairCrown(v.id, "normal");
    expect((await rpgView(v.id)).chair).toBe("normal");
    expect((await act(row.cost)).body.error?.code).toBe("COST_CHANGED");
    const before = await pts(v.id);
    const ok = await act(off);
    expect(ok.status).toBe(200);
    expect(ok.body.points).toBe(before - off);
    expect(ok.body.character.mats!.doc).toBe(20 - row.doc);
    expect(ok.body.chair).toBe("normal");
    // 헬 1위는 강화 할인이 없다
    chairCrown(v.id, "hell");
    const e = ok.body.gear!.enhance!.to;
    const full = ENHANCE_TABLE[e + 1].cost;
    expect((await act(discountedPrice(full, 0.3))).body.error?.code).toBe("COST_CHANGED");
    const b2 = await pts(v.id);
    const ok2 = await act(full);
    expect(ok2.status).toBe(200);
    expect(b2 - ok2.body.points).toBe(full);
  });

  it("사냥 경험치: 헬 1위 +20% (사냥왕 15%와 겹쳐도 20% 하나 — 35%가 아니다), 몫을 준 이름이 결과에", async () => {
    const clearAll = (seed: number) => {
      const kills: Record<string, number> = {};
      const plan = huntPlan(seed, "easy");
      for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      return {
        game: "hunt",
        durationMs: 100_000,
        kills,
        wavesCleared: plan.length,
        died: false,
        potionsUsed: {},
      };
    };
    const run = async (boards: ChampBoard[], perk: ChairPerk | null) => {
      const v = await newVisitor();
      crown(v.id, boards);
      chairCrown(v.id, perk);
      const s = (await (await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy" }))).json()) as RunStartResponse;
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 101_000);
      try {
        const res = await finish.POST(
          call("/api/rpg/run/finish", v, {
            ticket: s.ticket,
            result: clearAll(s.seed),
          }),
        );
        expect(res.status).toBe(200);
        return ((await res.json()) as RunFinishResponse).reward;
      } finally {
        clock.mockRestore();
      }
    };
    const plain = await run([], "normal");
    expect(plain.champExp).toBeUndefined();
    const hell = await run([], "hell");
    expect(hell.champExp).toBeGreaterThan(0);
    expect(hell.champBy).toBe("맨주먹 협상가");
    const base = hell.exp - hell.champExp!;
    expect(hell.exp).toBe(Math.round(base * 1.2));
    const both = await run(["huntKills"], "duo");
    expect(both.champBy).toBe("차기 회장");
    expect(both.exp).toBe(Math.round((both.exp - both.champExp!) * 1.2));
    const champOnly = await run(["huntKills"], null);
    expect(champOnly.champBy).toBe("사냥왕");
    expect(champOnly.exp).toBe(Math.round((champOnly.exp - champOnly.champExp!) * 1.15));
  });

  it("야근 빌딩 상자: 헬 1위는 세트 장비 20%로 굴린다 (같은 시드에서 15%면 안 나오는 상자도 나온다) · 초월 EXP +15%", async () => {
    const st = isCheckpoint(TOWER_CHEST_FROM) ? TOWER_CHEST_FROM : nextCheckpoint(TOWER_CHEST_FROM);
    const chests = Array.from({ length: 10 }, (_, i) => st + i).filter(isChestFloor);
    const sets = (d: readonly Drop[]) => d.filter((x) => x.kind === "set").length;
    const roll = (seed: number, p: number) => chests.flatMap((f) => towerChestDrops(seed, f, st, 0, false, p));
    // 15%로는 세트 장비가 없고 20%로는 있는 시드를 찾는다 (순수 계산)
    let seed = 1;
    while (!(sets(roll(seed, SG_CHEST_CHANCE)) === 0 && sets(roll(seed, 0.2)) > 0)) seed++;
    const grant = async (perk: ChairPerk | null) => {
      const v = await newVisitor();
      await getRpgStore().update(v.id, (s) => ({
        state: { ...s, level: 50, exp: 0 },
        result: null,
      }));
      chairCrown(v.id, perk);
      // grantTowerRun의 시드 = floor(Math.random() × 2^31) — 첫 한 번만 정해 준다
      vi.spyOn(Math, "random").mockReturnValueOnce(seed / 2 ** 31);
      const r = await grantTowerRun(v.id, {
        start: st,
        floors: 10,
        floorMs: 10 * 60_000,
      });
      vi.restoreAllMocks();
      expect(r.reward.tower!.chests).toEqual(chests);
      return r.reward;
    };
    const plain = await grant("normal");
    expect(sets(plain.drops)).toBe(0);
    expect(plain.champExp).toBeUndefined();
    const hell = await grant("hell");
    expect(sets(hell.drops)).toBe(sets(roll(seed, 0.2)));
    expect(hell.champBy).toBe("맨주먹 협상가");
    expect(hell.transcend!.exp).toBe(Math.round((hell.transcend!.exp - hell.champExp!) * 1.15));
    const duo = await grant("duo");
    expect(sets(duo.drops)).toBeGreaterThan(0);
  });
});
