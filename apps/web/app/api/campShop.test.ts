import { CAMP_LOTS } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CAMP_ONLY_IDS, CAMP_STARTER, furnitureById, sellPrice, type CampHomeKind } from "@/lib/housing/catalog";
import type { CampShopBuyResult, CampShopStatus } from "@/lib/housing/campExclusive/service";
import { buyCampHome, buyPlot, getHouseStore } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import * as shop from "./camp/shop/route";
import * as furnBuy from "./housing/me/buy/route";
import * as layoutRoute from "./housing/me/layout/route";
import * as sell from "./housing/me/sell/route";
import * as session from "./session/route";

// 11/27 캠핑장 NPC 전용 가구 서버 흐름: 그 종류 집 주인만 사고(아니면 409 NOT_OWNER · 차감 없음), 다른 종류 물건은 NOT_SOLD,
// 가구점 일반 구매는 거절, 그 종류 집에만 놓이고(마을 집·다른 종류는 CAMP_ONLY), 되팔기는 보통 가구처럼

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const req = (path: string, v: Visitor, body?: unknown, method = body === undefined ? "GET" : "POST") =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      cookie: v.cookie,
      "x-forwarded-for": v.ip,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(points = 100_000): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = {
    cookie,
    ip: `10.97.${++seq}.1`,
    id: ((await res.json()) as { visitorId: string }).visitorId,
  };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
const code = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error;
const status = async (v: Visitor, kind: CampHomeKind) => (await (await shop.GET(req(`/api/camp/shop?kind=${kind}`, v))).json()) as CampShopStatus;
const buy = (v: Visitor, kind: string, id: string) => shop.POST(req("/api/camp/shop", v, { kind, id }));
/** 채널마다 터가 따로라 테스트마다 채널을 바꾼다 */
let ch = 0;
const lotOf = (kind: CampHomeKind) => CAMP_LOTS.find((l) => l.kind === kind)!.lot;
const ownCamp = async (v: Visitor, kind: CampHomeKind) => buyCampHome(getHouseStore(), v.id, "", "", "주인", lotOf(kind), (ch++ % 5) + 1);

describe("11/27 캠핑장 NPC 전용 가구 — 서버", () => {
  it("목록: 그 종류 14개(가구 8 → 바닥 3 → 벽지 3), 값은 확정 값, 집이 없으면 owner = false", async () => {
    const v = await newVisitor();
    for (const kind of ["caravan", "pension", "rural"] as const) {
      const st = await status(v, kind);
      expect(st.kind).toBe(kind);
      expect(st.furn.map((f) => f.id)).toEqual([...CAMP_ONLY_IDS[kind]]);
      for (const f of st.furn) expect([f.base, f.cost, f.have]).toEqual([furnitureById(f.id)!.price, furnitureById(f.id)!.price, 0]);
      expect(st.owner).toBe(false);
    }
    expect((await shop.GET(req("/api/camp/shop?kind=village", v))).status).toBe(400);
  });

  it("주인이 아니면 409 NOT_OWNER (차감 없음) — 집이 없어도·마을 집만 있어도·다른 종류 캠핑장 집이어도", async () => {
    const v = await newVisitor();
    const b0 = await pts(v.id);
    let r = await buy(v, "caravan", "cx_cv_camp_chair");
    expect(r.status).toBe(409);
    expect(await code(r)).toEqual({
      code: "NOT_OWNER",
      message: "카라반 주인만 살 수 있어요.",
    });
    await buyPlot(getHouseStore(), v.id, "마을 집", "", "a");
    await ownCamp(v, "pension");
    const b1 = await pts(v.id);
    expect(b1).toBeLessThan(b0);
    r = await buy(v, "caravan", "cx_cv_camp_chair");
    expect(r.status).toBe(409);
    expect((await code(r)).code).toBe("NOT_OWNER");
    expect(await pts(v.id)).toBe(b1);
    expect((await status(v, "caravan")).owner).toBe(false);
    expect((await status(v, "pension")).owner).toBe(true);
  });

  it("다른 종류 전용 물건·가구점 물건은 400 NOT_SOLD (그 NPC 목록 밖), 잘못된 종류·id는 400", async () => {
    const v = await newVisitor();
    await ownCamp(v, "pension");
    for (const id of ["cx_cv_camp_chair", "cx_rr_tv", "sofa", "partition", "nothing"]) {
      const r = await buy(v, "pension", id);
      expect(r.status, id).toBe(400);
      expect((await code(r)).code, id).toBe("NOT_SOLD");
    }
    expect((await code(await buy(v, "pension", "cx_cv_camp_chair"))).message).toBe("소슬댁이 파는 물건이 아니에요.");
    expect((await buy(v, "village", "cx_pn_rocking")).status).toBe(400);
    expect((await buy(v, "pension", "BAD ID")).status).toBe(400);
  });

  it("전용 물건은 가구점 일반 구매가 거절한다 (차감 없음)", async () => {
    const v = await newVisitor();
    await ownCamp(v, "rural");
    const before = await pts(v.id);
    for (const itemId of ["cx_rr_tv", "cx_rr_floor_vinyl", "cx_cv_bunk"]) {
      const r = await furnBuy.POST(req("/api/housing/me/buy", v, { itemId, zone: "camp" }));
      expect(r.status, itemId).toBe(400);
    }
    expect(await pts(v.id)).toBe(before);
  });

  it("주인이면 산다 (가방 +1·값만큼 차감) → 그 집에 놓이고, 마을 집에는 CAMP_ONLY로 못 놓고, 되팔기는 반값", async () => {
    const v = await newVisitor();
    const home = await ownCamp(v, "caravan");
    await buyPlot(getHouseStore(), v.id, "마을 집", "", "a", null, home.house!.ch);
    const before = await pts(v.id);
    const r = await buy(v, "caravan", "cx_cv_camp_chair");
    expect(r.status).toBe(200);
    const body = (await r.json()) as CampShopBuyResult;
    expect(before - (await pts(v.id))).toBe(600);
    expect(body).toMatchObject({
      owner: true,
      got: "접이식 캠핑 의자",
      kind: "caravan",
    });
    expect(body.furn.find((f) => f.id === "cx_cv_camp_chair")?.have).toBe(1);
    // 산 뒤 내 캠핑장 집(가방 포함)을 같이 돌려준다 — 분양 창·꾸미기 가방이 다시 읽지 않고 바로 고친다
    expect(body.house.house?.zone).toBe("camp");
    expect(body.house.inventory.cx_cv_camp_chair).toBe(1);
    expect(body.me.points).toBe(await pts(v.id));
    expect((await buy(v, "caravan", "cx_cv_floor_check")).status).toBe(200);

    // 카라반에 놓기 + 전용 바닥 깔기
    const camp = home.house!;
    const items = [...CAMP_STARTER.caravan.map((p) => ({ ...p })), { u: "cx1", i: "cx_cv_camp_chair", x: 1, y: 4, r: 4 }];
    const ok = await layoutRoute.PUT(
      req(
        "/api/housing/me/layout",
        v,
        {
          ch: camp.ch,
          zone: "camp",
          tier: "small",
          layout: { items, floor: "cx_cv_floor_check", wall: camp.layout.wall },
        },
        "PUT",
      ),
    );
    expect(ok.status).toBe(200);
    const saved = (await ok.json()) as MyHouseResponse;
    expect(saved.house?.layout.items.some((p) => p.i === "cx_cv_camp_chair")).toBe(true);
    expect(saved.house?.layout.floor).toBe("cx_cv_floor_check");

    // 마을 집에는 못 놓는다 (카라반에서 치운 뒤라도)
    const back = await layoutRoute.PUT(
      req(
        "/api/housing/me/layout",
        v,
        {
          ch: camp.ch,
          zone: "camp",
          tier: "small",
          layout: {
            items: CAMP_STARTER.caravan.map((p) => ({ ...p })),
            floor: camp.layout.floor,
            wall: camp.layout.wall,
          },
        },
        "PUT",
      ),
    );
    expect(back.status).toBe(200);
    const bad = await layoutRoute.PUT(
      req(
        "/api/housing/me/layout",
        v,
        {
          ch: camp.ch,
          tier: "small",
          layout: {
            items: [{ u: "a", i: "cx_cv_camp_chair", x: 1, y: 1, r: 4 }],
            floor: "floor_grass",
            wall: "wall_fence",
          },
        },
        "PUT",
      ),
    );
    expect(bad.status).toBe(400);
    expect(await code(bad)).toEqual({
      code: "CAMP_ONLY",
      message: "접이식 캠핑 의자: 카라반 전용 가구라 카라반에만 놓을 수 있어요.",
    });
    const badFloor = await layoutRoute.PUT(
      req(
        "/api/housing/me/layout",
        v,
        {
          ch: camp.ch,
          tier: "small",
          layout: { items: [], floor: "cx_cv_floor_check", wall: "wall_fence" },
        },
        "PUT",
      ),
    );
    expect((await code(badFloor)).code).toBe("CAMP_ONLY");

    // 되팔기: 마을 집에서도 (공용 가방) 원가의 절반
    const b = await pts(v.id);
    const s = await sell.POST(req("/api/housing/me/sell", v, { itemId: "cx_cv_camp_chair" }));
    expect(s.status).toBe(200);
    expect((await pts(v.id)) - b).toBe(sellPrice(furnitureById("cx_cv_camp_chair")!));
    expect((await pts(v.id)) - b).toBe(300);
  });

  it("포인트가 모자라면 409 NOT_ENOUGH_POINTS (차감 없음)", async () => {
    const v = await newVisitor();
    await ownCamp(v, "rural");
    await getAccounts().adjustPoints(v.id, 100 - (await pts(v.id)));
    const r = await buy(v, "rural", "cx_rr_bedding");
    expect(r.status).toBe(409);
    expect((await code(r)).code).toBe("NOT_ENOUGH_POINTS");
    expect(await pts(v.id)).toBe(100);
  });
});
