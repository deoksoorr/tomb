import { titleOfLook, verifyGrant } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getForageStore } from "@/lib/forage/store";
import { itemLookScore, lookScore } from "@/lib/lookScore";
import { getAccounts } from "@/lib/store";
import { kstDay, lookOf } from "@/lib/store/accounts";
import { getChamp } from "@/lib/store/champ";
import { earnedTitleIds, titleDef, titleLabel, TITLE_GROUPS, TITLES } from "@/lib/titles";
import type { ApiError, TitlesResponse, WearResponse } from "@/lib/types";
import { wardrobeEntries } from "@/components/account/wardrobe";
import * as titles from "./me/titles/route";
import * as session from "./session/route";

// 칭호: 얻은 칭호만 끼운다(서버 확인), 하나만, 착용 목록(look)에 실려 착용 증서로 다른 사람에게 간다. 꾸미기 점수·코디 목록과는 따로
const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"]) vi.stubEnv(k, "");
});

let ipSeq = 0;
type Visitor = { cookie: string; ip: string; visitorId: string };
const call = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.9.0.${++ipSeq}`, visitorId: ((await res.json()) as { visitorId: string }).visitorId };
}

describe("칭호 목록 (lib/titles)", () => {
  it("모든 칭호에 이름·갈래·얻는 방법, 이름은 겹치지 않는다", () => {
    expect(TITLES.length).toBe(19);
    expect(new Set(TITLES.map((t) => t.name)).size).toBe(TITLES.length);
    for (const t of TITLES) {
      expect(TITLE_GROUPS).toContain(t.group);
      expect(t.how.length).toBeGreaterThan(4);
    }
    expect(titleDef("t_star50")?.name).toBe("별지기");
    expect(titleDef("t_star100")?.name).toBe("밤하늘 지도 제작자");
    expect(titleDef("t_champ_fish")?.name).toBe("낚시왕");
    expect(titleDef("t_house900")?.name).toBe("전설의 명당");
    expect(titleLabel("t_fish100")).toBe("「호수의 전설」");
    expect(titleLabel("hat_cat")).toBeNull();
  });

  it("얻었는지: 도감 칭호 이름 · 1위 한 랭킹 · 집 점수 구간", () => {
    expect(earnedTitleIds({ dexTitleNames: ["별지기", "주말 낚시꾼"], champBoards: ["huntKills"], houseScore: 160 })).toEqual([
      "t_fish50",
      "t_star50",
      "t_champ_hunt",
      "t_house50",
      "t_house150",
    ]);
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], houseScore: null })).toEqual([]);
  });
});

describe("칭호 끼우기 (/api/me/titles)", () => {
  it("못 얻은 칭호는 403, 얻은 칭호는 하나만 끼우고 착용 증서에 실린다, 빼기", async () => {
    const v = await newVisitor();
    const day = kstDay();
    const get = async () => (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect(await get()).toEqual({ earned: [], equipped: null });

    const locked = await titles.POST(call("/api/me/titles", v, { id: "t_fish50" }));
    expect(locked.status).toBe(403);
    expect(((await locked.json()) as ApiError).error.code).toBe("TITLE_LOCKED");
    expect((await titles.POST(call("/api/me/titles", v, { id: "hat_cat" }))).status).toBe(400);

    // 도감 절반 칭호 붙음 + 지난 주간 낚시 1위 기록
    await getForageStore().markDexTitles(v.visitorId, ["fish:50"], day);
    await getChamp().create({ week: "20260105", winners: [{ board: "fish", accountId: v.visitorId, name: "낚시꾼", value: 300 }], settledAt: 1 }, 0);
    expect((await get()).earned).toEqual(["t_fish50", "t_champ_fish"]);

    const r1 = (await (await titles.POST(call("/api/me/titles", v, { id: "t_fish50" }))).json()) as WearResponse;
    expect(titleOfLook(lookOf(r1.me))).toBe("t_fish50");
    const g1 = await verifyGrant(SECRET, r1.lookGrant);
    expect(g1?.kind === "look" && g1.look).toEqual(["t_fish50"]);
    // 다른 칭호로 바꾸면 하나만
    const r2 = (await (await titles.POST(call("/api/me/titles", v, { id: "t_champ_fish" }))).json()) as WearResponse;
    expect(lookOf(r2.me)).toEqual(["t_champ_fish"]);
    expect((await get()).equipped).toBe("t_champ_fish");
    // 칭호는 꾸미기 점수·코디 목록에 들지 않는다
    expect(lookScore(r2.me, Date.now())).toBe(0);
    expect(itemLookScore("t_champ_fish")).toBe(0);
    expect(wardrobeEntries(r2.me, Date.now())).toEqual([]);
    // 빼기
    const r3 = (await (await titles.POST(call("/api/me/titles", v, { id: null }))).json()) as WearResponse;
    expect(lookOf(r3.me)).toEqual([]);
    expect((await getAccounts().get(v.visitorId, day, Date.now())).equipped).toEqual([]);
  });
});
