import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isPermanentUntil } from "@tomb/protocol";
import { kstDay } from "@/lib/store/accounts";
import { getAccounts } from "@/lib/store";
import { setStaff } from "@/lib/staff";
import { BUNGEO_CART, BUNGEO_SPOTS, bungeoDays, bungeoOpenSpot, bungeoSpotOf } from "@/lib/bungeo/cart";
import type { BungeoBuyResult, BungeoSchedule, BungeoStatus } from "@/lib/bungeo/service";
import * as bungeo from "./bungeo/route";
import * as schedule from "./bungeo/schedule/route";
import * as reshape from "./dye/body/route";
import * as session from "./session/route";

// 11/22 골목 붕어빵 수레 서버 흐름: 닫힌 시간 거절(포인트 그대로) · 열린 시간 차감·소장 · 중복 거절 · 외형 · 일정은 운영자만

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
  const v = { cookie, ip: `10.92.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
const at = (t: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(t);
};
/** 11/23 사기 본문: 지금 회차 수레 앞(장수 앞 말 걸기 자리)에 선 맵·자리 (닫힌 시간이면 옛 고정 자리) */
const buy = (id: string) => {
  const s = bungeoOpenSpot(Date.now()) ?? BUNGEO_CART;
  return { id, map: s.map, x: s.x + 10, y: s.y + 40 };
};
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("11/22 골목 붕어빵 수레 — 서버 흐름", () => {
  it("닫힌 시간엔 목록 없이 open:false, 사면 409 BUNGEO_CLOSED이고 포인트는 그대로", async () => {
    at(kst(2026, 11, 22, 21, 59));
    const v = await newVisitor();
    const st = (await (await bungeo.GET(req("/api/bungeo", v))).json()) as BungeoStatus;
    expect(st.open).toBe(false);
    expect(st.items).toEqual([]);
    // 일정은 일반 응답에 실리지 않는다
    expect(Object.keys(st).sort()).toEqual(["items", "open", "points"]);
    const before = await pts(v.id);
    const r = await bungeo.POST(req("/api/bungeo", v, buy("kc_cap")));
    expect(r.status).toBe(409);
    expect(await code(r)).toBe("BUNGEO_CLOSED");
    expect(await pts(v.id)).toBe(before);
    // 이틀 뒤(23일) 밤도 닫힘
    at(kst(2026, 11, 23, 23, 0));
    expect((await bungeo.POST(req("/api/bungeo", v, buy("kc_cap")))).status).toBe(409);
  });

  it("열린 밤엔 값 그대로 차감 · 영구 소장 · 같은 것은 다시 못 산다", async () => {
    at(kst(2026, 11, 22, 22, 30));
    const v = await newVisitor();
    const st = (await (await bungeo.GET(req("/api/bungeo", v))).json()) as BungeoStatus;
    expect(st.open).toBe(true);
    expect(st.items).toHaveLength(13);
    const before = await pts(v.id);
    const ok = await bungeo.POST(req("/api/bungeo", v, buy("kd_coat")));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as BungeoBuyResult;
    expect(before - (await pts(v.id))).toBe(10_000);
    expect([...body.me.equipped, ...body.me.stash].some((e) => e.itemId === "kd_coat" && isPermanentUntil(e.until))).toBe(true);
    expect(body.items.find((r) => r.id === "kd_coat")!.owned).toBe(true);
    expect(body.lookGrant).toBeTruthy();
    const again = await bungeo.POST(req("/api/bungeo", v, buy("kd_coat")));
    expect(again.status).toBe(409);
    expect(await code(again)).toBe("ALREADY_OWNED");
    expect(before - (await pts(v.id))).toBe(10_000);
    // 팔지 않는 것
    expect((await bungeo.POST(req("/api/bungeo", v, buy("hat_straw")))).status).toBe(400);
  });

  it("새벽 1시 59분(같은 게임 날짜)에도 살 수 있고 2시엔 닫힌다", async () => {
    const v = await newVisitor();
    at(kst(2026, 11, 23, 1, 59));
    expect((await bungeo.POST(req("/api/bungeo", v, buy("kc_cap")))).status).toBe(200);
    at(kst(2026, 11, 23, 2, 0));
    expect((await bungeo.POST(req("/api/bungeo", v, buy("kc_phones")))).status).toBe(409);
  });

  it("포인트가 모자라면 409 NOT_ENOUGH_POINTS (소장 안 됨)", async () => {
    at(kst(2026, 11, 25, 23, 0));
    const v = await newVisitor(0);
    const before = await pts(v.id);
    const r = await bungeo.POST(req("/api/bungeo", v, buy("kn_fleece")));
    expect(r.status).toBe(409);
    expect(await code(r)).toBe("NOT_ENOUGH_POINTS");
    expect(await pts(v.id)).toBe(before);
  });

  it("외형 「붕어빵 장수 유령」: 15,000P → 소장 + 그 모습으로, 다시 사면 거절, 소장 전엔 꾸미기 창에서 못 바꾼다", async () => {
    at(kst(2026, 11, 22, 23, 0));
    const v = await newVisitor();
    const other = await newVisitor();
    const no = await reshape.POST(req("/api/dye/body", other, { body: "vendor" }));
    expect(no.status).toBe(403);
    const before = await pts(v.id);
    const ok = await bungeo.POST(req("/api/bungeo", v, buy("vendor")));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as BungeoBuyResult;
    expect(before - (await pts(v.id))).toBe(15_000);
    expect(body.me.body).toBe("vendor");
    expect(body.me.bodies).toContain("vendor");
    const again = await bungeo.POST(req("/api/bungeo", v, buy("vendor")));
    expect(await code(again)).toBe("ALREADY_OWNED");
    // 다른 몸으로 갔다가 무료로 돌아온다
    expect((await reshape.POST(req("/api/dye/body", v, { body: "hood" }))).status).toBe(200);
    const mid = await pts(v.id);
    expect((await reshape.POST(req("/api/dye/body", v, { body: "vendor" }))).status).toBe(200);
    expect(await pts(v.id)).toBe(mid);
  });

  it("운영자 계정도 다른 상점과 같은 규칙 (닫힌 시간 거절 · 열린 밤에 사기 — 운영자 포인트 정책은 계정 저장소 그대로)", async () => {
    at(kst(2026, 11, 22, 21, 0));
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      expect(await code(await bungeo.POST(req("/api/bungeo", op, buy("kc_sneaker"))))).toBe("BUNGEO_CLOSED");
      at(kst(2026, 11, 22, 23, 10));
      const ok = await bungeo.POST(req("/api/bungeo", op, buy("kc_sneaker")));
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as BungeoBuyResult).items.find((r) => r.id === "kc_sneaker")!.owned).toBe(true);
      expect(await code(await bungeo.POST(req("/api/bungeo", op, buy("kc_sneaker"))))).toBe("ALREADY_OWNED");
    } finally {
      await setStaff(null);
    }
  });

  it("다음 출현 일정은 운영자 계정만 (일반 계정은 403)", async () => {
    at(kst(2026, 11, 21, 12, 0));
    const v = await newVisitor();
    const r = await schedule.GET(req("/api/bungeo/schedule", v));
    expect(r.status).toBe(403);
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      const ok = await schedule.GET(req("/api/bungeo/schedule", op));
      expect(ok.status).toBe(200);
      const s = (await ok.json()) as BungeoSchedule;
      expect(s.open).toBe(false);
      expect(s.next.map((x) => x.day)).toEqual(["20261121", "20261122", "20261125", "20261128", "20261201"]);
      expect(s.next.every((x) => typeof x.spot === "string" && x.spot.length > 0)).toBe(true);
    } finally {
      await setStaff(null);
    }
  });
});

describe("11/23 수레 자리 확인 (그 회차 맵 · 수레에서 64px 안 — 화면이 보낸 자리)", () => {
  it("가까우면 산다, 멀거나 다른 맵·자리 없음이면 403 BUNGEO_FAR이고 포인트 그대로", async () => {
    const day = bungeoDays().find((d) => d >= "20261125" && bungeoSpotOf(d).map === "sea")!;
    at(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), 22 - 9, 30));
    const s = bungeoSpotOf(day);
    const v = await newVisitor();
    const before = await pts(v.id);
    const other = BUNGEO_SPOTS.find((o) => o.map === "village")!;
    for (const body of [{ id: "kc_cap" }, { id: "kc_cap", map: "village", x: s.x, y: s.y }, { id: "kc_cap", map: "sea", x: s.x + 80, y: s.y }, { id: "kc_cap", map: other.map, x: other.x, y: other.y + 30 }, { id: "kc_cap", map: "camp", x: s.x, y: s.y }]) {
      const r = await bungeo.POST(req("/api/bungeo", v, body));
      expect(r.status, JSON.stringify(body)).toBe(403);
      const j = (await r.json()) as { error: { code: string; message: string } };
      expect(j.error.code).toBe("BUNGEO_FAR");
      expect(j.error.message).toBe("수레 가까이에서 살 수 있어요.");
    }
    expect(await pts(v.id)).toBe(before);
    const ok = await bungeo.POST(req("/api/bungeo", v, { id: "kc_cap", map: "sea", x: s.x + 10, y: s.y + 40 }));
    expect(ok.status).toBe(200);
  });
});
