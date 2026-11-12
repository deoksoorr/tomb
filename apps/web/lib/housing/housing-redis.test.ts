import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as exteriorRoute from "@/app/api/housing/me/exterior/route";
import * as session from "@/app/api/session/route";
import * as villageRoute from "@/app/api/housing/village/route";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { defaultExterior, PLOT_TIERS } from "./catalog";
import { buyFurniture, buyPlot, getHouseStore, houseIdFor, saveExterior, sellFurniture, village } from "./service";
import { HK, RedisHouseStore } from "./store-redis";
import type { MyHouseResponse, VillageResponse } from "./types";

// 하우징 v4 계약: 실제 Redis(일회용 DB)에서만. 분양 번지 Lua·외관·마을 목록·예전 집 번지 배정
const conn = env.redis();
const OPERATOR_IP = "10.77.0.1"; // 라우트 호출은 운영자 IP로 (Upstash Ratelimit 스크립트는 SRH에서 돌지 않는다)

describe.skipIf(!conn)("하우징 v4 (실제 Redis)", () => {
  const raw = conn ? new Redis({ ...conn, automaticDeserialization: false }) : null!;
  const accounts = getAccounts();
  const store = getHouseStore();
  const PLOT = PLOT_TIERS[0].price;

  beforeAll(() => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", OPERATOR_IP);
    expect(store).toBeInstanceOf(RedisHouseStore);
  });

  async function account(points: number, id = nanoid()): Promise<string> {
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;
  const lotsHash = async () => {
    const flat = ((await raw.hgetall(HK.lots(1))) as unknown as string[] | null) ?? [];
    const m = new Map<number, string>();
    for (let i = 0; i < flat.length; i += 2) m.set(Number(flat[i]), flat[i + 1]);
    return m;
  };

  it("동시 분양(자동 번지)은 번지가 겹치지 않고, houses:lots:1과 집의 lot이 서로 맞다", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => account(PLOT)));
    const res = await Promise.all(ids.map((id, i) => buyPlot(store, id, `집${i}`, "", "주인")));
    const lots = res.map((r) => r.house!.lot);
    expect(new Set(lots).size).toBe(8);
    const hash = await lotsHash();
    for (const [i, id] of ids.entries()) {
      expect(hash.get(lots[i])).toBe(houseIdFor(id));
      expect(await points(id)).toBe(0);
    }
  });

  it("같은 번지를 동시에 고르면 한 명만 받고, 나머지는 LOT_TAKEN + 포인트 그대로", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => account(PLOT + 50)));
    const want = Math.max(0, ...(await lotsHash()).keys()) + 1;
    const res = await Promise.allSettled(ids.map((id) => buyPlot(store, id, "같은 번지", "", "주인", want)));
    const won = res.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const r of res) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "LOT_TAKEN" });
    const balances = await Promise.all(ids.map(points));
    expect(balances.filter((b) => b === 50)).toHaveLength(1);
    expect(balances.filter((b) => b === PLOT + 50)).toHaveLength(4);
    expect((await lotsHash()).get(want)).toBe((won[0] as PromiseFulfilledResult<MyHouseResponse>).value.house!.id);
  });

  it("외관 PUT: 안 산 것·자리가 다른 것은 거절, 산 것은 입히고, 입힌 것은 되팔 수 없다", async () => {
    const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "x-forwarded-for": OPERATOR_IP } }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const visitorId = ((await res.json()) as { visitorId: string }).visitorId;
    await account(2000, visitorId);
    await buyPlot(store, visitorId, "외관집", "", "주인");
    const put = (exterior: object) =>
      exteriorRoute.PUT(
        new NextRequest("http://localhost/api/housing/me/exterior", {
          method: "PUT",
          headers: { cookie, "x-forwarded-for": OPERATOR_IP, "content-type": "application/json" },
          body: JSON.stringify({ exterior }),
        }),
        { params: Promise.resolve({}) },
      );
    expect((await put({ roof: "roof_red" })).status).toBe(400);
    expect(((await (await put({ roof: "door_red" })).json()) as { error: { code: string } }).error.code).toBe("BAD_EXTERIOR");
    await buyFurniture(store, visitorId, "roof_red");
    await buyFurniture(store, visitorId, "roof_red");
    const ok = await put({ roof: "roof_red" });
    expect(ok.status).toBe(200);
    const house = ((await ok.json()) as MyHouseResponse).house!;
    expect(house.exterior).toEqual({ ...defaultExterior(), roof: "roof_red" });
    // 2개 중 1개는 입혀 있어 1개만 되팔 수 있다
    await sellFurniture(store, visitorId, "roof_red");
    await expect(sellFurniture(store, visitorId, "roof_red")).rejects.toMatchObject({ code: "PLACED" });
    // 저장소에 그대로 남았는지 (다시 읽기)
    expect((await store.get(house.id))!.exterior.roof).toBe("roof_red");
    expect((await store.inventory(house.id)).roof_red).toBe(1);
    // 기본으로 돌리면 다시 팔 수 있다
    await saveExterior(store, visitorId, {});
    expect((await sellFurniture(store, visitorId, "roof_red")).refunded).toBeGreaterThan(0);
  });

  it("마을 GET: 번지 순·외관 포함, 숨긴 집은 자리(taken)만, lots는 4의 배수", async () => {
    const [a, b] = await Promise.all([account(PLOT), account(PLOT)]);
    const ha = (await buyPlot(store, a, "보이는 집", "", "a")).house!;
    const hb = (await buyPlot(store, b, "숨긴 집", "", "b")).house!;
    await store.setHidden(hb.id, true);
    const res = await villageRoute.GET(new NextRequest("http://localhost/api/housing/village"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const v = (await res.json()) as VillageResponse;
    const lotsSeen = v.houses.map((h) => h.lot);
    expect(lotsSeen).toEqual([...lotsSeen].sort((x, y) => x - y));
    expect(v.houses.find((h) => h.id === ha.id)).toMatchObject({ lot: ha.lot, name: "보이는 집", exterior: defaultExterior() });
    expect(v.houses.some((h) => h.id === hb.id)).toBe(false);
    expect(v.taken).toContain(hb.lot);
    expect(v.lots % 4).toBe(0);
    expect(v.lots).toBeGreaterThanOrEqual(Math.max(...lotsSeen, hb.lot));
    expect(JSON.stringify(v)).not.toContain(a); // 계정 id는 내보내지 않는다
  });

  it("예전 집(번지·외관 필드 없음)은 마을을 열 때 빈 번지를 하나씩 받고, 두 번 열어도 그대로", async () => {
    const olds = await Promise.all(Array.from({ length: 3 }, () => account(PLOT)));
    const ids = olds.map(houseIdFor);
    for (const [i, owner] of olds.entries()) {
      // 마을 이전 형식: meta에 ch·lot·exterior가 없고 번지 색인에도 없다
      await raw.hset(HK.meta(ids[i]), { owner, name: `옛집${i}`, intro: "", ownerName: "옛주인", tier: "small", createdAt: "1", updatedAt: "1", likes: "0", placedScore: "0", items: "0" });
      await raw.zadd(HK.all, { score: 1, member: ids[i] });
    }
    expect((await store.get(ids[0]))!.lot).toBe(0);
    expect((await store.get(ids[0]))!.exterior).toEqual(defaultExterior());
    const taken = new Set((await lotsHash()).keys());

    const [v1, v2] = await Promise.all([village(store), village(store)]); // 동시에 열어도 한 번만 배정
    const lots = ids.map((id) => v1.houses.find((h) => h.id === id)?.lot);
    expect(lots.every((l) => typeof l === "number" && l > 0 && !taken.has(l))).toBe(true);
    expect(new Set(lots).size).toBe(3);
    expect(ids.map((id) => v2.houses.find((h) => h.id === id)?.lot)).toEqual(lots);
    const hash = await lotsHash();
    for (const [i, id] of ids.entries()) {
      expect(hash.get(lots[i]!)).toBe(id);
      expect([...hash.values()].filter((x) => x === id)).toHaveLength(1);
      expect((await store.get(id))!.lot).toBe(lots[i]);
    }
    const again = await village(store);
    expect(ids.map((id) => again.houses.find((h) => h.id === id)?.lot)).toEqual(lots);
  });
});
