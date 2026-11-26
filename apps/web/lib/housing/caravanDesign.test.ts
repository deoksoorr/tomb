import { CAMP_LOTS, defaultCaravanDesign, type CaravanDesign } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { caravanDesign, CampBuySchema, CampDesignSchema, CreateHouseSchema } from "./schemas";
import { buyCampHome, houseIdFor, myHouse, setCaravanDesign, village } from "./service";
import { MemoryHouseStore } from "./store";

// 11/26 카라반 디자인 고르기 (메모리 저장소 — 실제 Redis는 caravanDesign-redis.test): 검증 · 분양 때 고른 디자인 · 무료 바꾸기 · 옛 카라반 기본 모습

const conn = env.redis();
const FALLS = CAMP_LOTS.find((l) => l.kind === "caravan" && l.grade === "falls")!.lot;
const FOREST = CAMP_LOTS.find((l) => l.kind === "caravan" && l.grade === "forest")!.lot;
const PENSION = CAMP_LOTS.find((l) => l.kind === "pension")!.lot;

describe("카라반 디자인 검증 (schemas)", () => {
  it("모델·몸통 색 0~3·차양 색 0~3만 받아요", () => {
    expect(caravanDesign.safeParse({ model: "bus", color: 3, awning: 0 }).success).toBe(true);
    for (const bad of [{ model: "van", color: 0, awning: 0 }, { model: "bus", color: 4, awning: 0 }, { model: "bus", color: 0, awning: -1 }, { model: "bus", color: 0.5, awning: 0 }, { model: "bus", color: 0 }])
      expect(caravanDesign.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(CampBuySchema.safeParse({ ch: 1, lot: 1, zone: "camp", design: { model: "teardrop", color: 2, awning: 3 } }).success).toBe(true);
    expect(CampBuySchema.safeParse({ ch: 1, lot: 1, zone: "camp", design: { model: "teardrop", color: 9, awning: 3 } }).success).toBe(false);
    expect(CreateHouseSchema.safeParse({ name: "집", intro: "", ch: 1, lot: 1, zone: "camp", design: { model: "airstream", color: 1, awning: 1 } }).success).toBe(true);
    expect(CampDesignSchema.safeParse({ zone: "camp", design: { model: "airstream", color: 1, awning: 1 } }).success).toBe(true);
    expect(CampDesignSchema.safeParse({ zone: "sea", design: { model: "airstream", color: 1, awning: 1 } }).success).toBe(false);
  });
});

describe.skipIf(!!conn)("카라반 디자인 (서비스)", () => {
  const accounts = getAccounts();
  async function account(pts: number): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, pts - now);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;

  it("분양 때 고른 디자인으로 사고, 값은 자리 등급 그대로예요 (폭포 앞에 버스 개조도 13,500)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const d: CaravanDesign = { model: "bus", color: 3, awning: 2 };
    const before = await points(a);
    const r = await buyCampHome(store, a, "", "", "주인", FALLS, 3, "caravan", d);
    expect(before - (await points(a))).toBe(13_500);
    expect(r.house?.camp).toEqual({ kind: "caravan", yard: 1, design: d });
    // 마을 목록(맵이 그리는 것)에도 디자인
    const v = await village(store, 3, Date.now(), "camp");
    expect(v.houses.find((h) => h.lot === FALLS)?.camp?.design).toEqual(d);
  });

  it("디자인 없이 사면 그 자리 기본 모습 · 펜션은 디자인을 줘도 무시해요", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    expect((await buyCampHome(store, a, "", "", "주인", FOREST, 4)).house?.camp?.design).toEqual(defaultCaravanDesign(FOREST));
    const b = await account(100_000);
    const p = await buyCampHome(store, b, "", "", "주인", PENSION, 4, "pension", { model: "bus", color: 0, awning: 0 });
    expect(p.house?.camp).toEqual({ kind: "pension", yard: 1 });
    await expect(setCaravanDesign(store, b, { model: "bus", color: 1, awning: 1 })).rejects.toMatchObject({ status: 409, code: "NOT_CARAVAN" });
  });

  it("디자인 바꾸기는 무료 · 집이 없으면 409 · 앞마당 단계·배치는 그대로", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    await expect(setCaravanDesign(store, a, { model: "bus", color: 1, awning: 1 })).rejects.toMatchObject({ status: 409, code: "NO_HOUSE" });
    const bought = await buyCampHome(store, a, "", "", "주인", FALLS, 5);
    const p = await points(a);
    const d: CaravanDesign = { model: "teardrop", color: 2, awning: 0 };
    const r = await setCaravanDesign(store, a, d);
    expect(await points(a)).toBe(p);
    expect(r.house?.camp).toEqual({ kind: "caravan", yard: 1, design: d });
    expect(r.house?.layout).toEqual(bought.house?.layout);
    expect((await myHouse(store, a, undefined, "camp")).house?.camp?.design).toEqual(d);
  });

  it("디자인 칸이 없는 옛 카라반 기록은 그 자리 기본 모습으로 내보내요 (지금 그림 그대로)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    await buyCampHome(store, a, "", "", "주인", FALLS, 6, "caravan", { model: "bus", color: 3, awning: 3 });
    // 저장소 기록에서 디자인 칸을 지운다 (디자인 고르기 전에 산 집)
    const raw = (store as unknown as { houses: Map<string, { rec: { camp?: { design?: unknown } } }> }).houses.get(houseIdFor(a, "camp"))!;
    delete raw.rec.camp!.design;
    expect((await myHouse(store, a, undefined, "camp")).house?.camp).toEqual({ kind: "caravan", yard: 1, design: defaultCaravanDesign(FALLS) });
    expect((await village(store, 6, Date.now(), "camp")).houses[0].camp?.design).toEqual(defaultCaravanDesign(FALLS));
  });
});
