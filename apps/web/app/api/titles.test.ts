import { itemById, MAX_VALID_SPEED, permanentPrice, RUN_SPEED, TITLE_IDS, titleOfLook, verifyGrant, ZOO_PETS } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getForageStore } from "@/lib/forage/store";
import { HOUSE_TITLES } from "@/lib/housing/catalog";
import { buyCottage, buyPlot, getHouseStore } from "@/lib/housing/service";
import { itemLookScore, lookScore } from "@/lib/lookScore";
import { getAccounts } from "@/lib/store";
import { kstDay, lookOf } from "@/lib/store/accounts";
import { getChamp } from "@/lib/store/champ";
import { discountedPrice, earnedTitleIds, GRADE_SPEED, perkText, PERK_VALUES, progressText, titleDef, titleLabel, titlePerk, TITLE_GRADES, TITLE_GROUPS, TITLES } from "@/lib/titles";
import type { ApiError, TitlesResponse, WearResponse } from "@/lib/types";
import { wardrobeEntries } from "@/components/account/wardrobe";
import * as marks from "./me/titles/marks/route";
import * as titles from "./me/titles/route";
import * as session from "./session/route";
import * as presence from "./me/presence/route";
import * as buy from "./shop/buy/route";
import * as permanent from "./shop/permanent/route";
import * as staffRoute from "./admin/staff/route";
import { getTitleStats } from "@/lib/store/titleStats";
import { getTitleMarks } from "@/lib/store/titleMarks";
import { FACTS_TTL_MS, forgetTitles, titleStatus } from "@/lib/titlesServer";

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
    expect(TITLES.length).toBe(TITLE_IDS.length);
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

  it("얻었는지: 도감 칭호 이름 · 1위 한 랭킹 · 진행 수치 (집·레벨·처치·접속 시간 …)", () => {
    expect(earnedTitleIds({ dexTitleNames: ["별지기", "주말 낚시꾼"], champBoards: ["huntKills"], metrics: { house: 160 } })).toEqual([
      "t_fish50",
      "t_star50",
      "t_champ_hunt",
      "t_house50",
      "t_house150",
    ]);
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: {} })).toEqual([]);
    const got = earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { lv: 31, kills: 1000, hell: 1, stay: 61, streak: 7, big: 1000, champ: 3 } });
    expect(got).toEqual(["t_champ3", "t_lv10", "t_lv20", "t_lv30", "t_kill100", "t_kill1k", "t_hell", "t_big50", "t_big100", "t_att7", "t_stay1", "t_stay10"]);
  });

  it("11/20 회장님 독대 주간 1위 칭호: 주간 1위처럼 금 · 1위 갈래, 서버가 알린 동안만 (timed)", () => {
    for (const [id, name] of [["t_chairNormal", "연봉 협상의 신"], ["t_chairHell", "맨주먹 협상가"]] as const) {
      expect(titleDef(id)).toMatchObject({ name, group: "champ", grade: "gold", transient: true, timed: true });
      expect(titleDef(id)?.how).toContain("회장님 독대 주간 1위");
      expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: {}, timed: [id] })).toEqual([id]);
    }
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: ["points"], metrics: {} })).not.toContain("t_chairNormal");
    // 11/23 2관왕 「차기 회장」: 전설 (두 금 칭호 대신 하나 — 걷기 +1%)
    expect(titleDef("t_chairDuo")).toMatchObject({ name: "차기 회장", group: "champ", grade: "legend", transient: true, timed: true });
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: {}, timed: ["t_chairDuo"] })).toEqual(["t_chairDuo"]);
  });

  it("등급: 같은 줄은 단계가 높을수록 등급이 같거나 높고, 동·은·금·전설·신화가 모두 있다", () => {
    const order = { bronze: 0, silver: 1, gold: 2, legend: 3, mythic: 4, manager: 5 } as const;
    expect(new Set(TITLES.map((t) => t.grade))).toEqual(new Set(TITLE_GRADES));
    const byMetric = new Map<string, typeof TITLES>();
    for (const t of TITLES) if (t.metric && t.need !== undefined) byMetric.set(t.metric, [...(byMetric.get(t.metric) ?? []), t]);
    for (const list of byMetric.values()) {
      const sorted = [...list].sort((a, b) => a.need! - b.need!);
      for (let i = 1; i < sorted.length; i++) expect(order[sorted[i].grade]).toBeGreaterThanOrEqual(order[sorted[i - 1].grade]);
    }
    expect(titleDef("t_star100")?.grade).toBe("legend");
    expect(titleDef("t_lv50")?.grade).toBe("legend");
    expect(titleDef("t_stay300")?.name).toBe("이 마을 터줏대감");
    expect(progressText(titleDef("t_stay50")!, 72)).toBe("12시간 / 50시간");
    expect(progressText(titleDef("t_kill5k")!, 1234)).toBe("1,234 / 5,000");
  });

  it("칭호 능력: 공통 속도는 등급이 높을수록 크고, 가장 빠른 타는 펫과 겹쳐도 실시간 서버 속도 검증(달리기 × 1.5) 안", () => {
    // 11/16 동은 없음, 은 2 · 금 3 · 전설 4 · 신화 6%, 매니저 칭호는 능력이 없다
    expect(GRADE_SPEED).toEqual({ bronze: 1, silver: 1.02, gold: 1.03, legend: 1.04, mythic: 1.06, manager: 1 });
    const steps = TITLE_GRADES.filter((g) => g !== "manager");
    for (let i = 1; i < steps.length; i++) expect(GRADE_SPEED[steps[i]]).toBeGreaterThan(GRADE_SPEED[steps[i - 1]]);
    const fastestPet = Math.max(...ZOO_PETS.map((p) => p.ride?.speed ?? 1));
    const fastestTitle = Math.max(...TITLES.map((t) => titlePerk(t.id).speed));
    expect(fastestTitle).toBeLessThanOrEqual(GRADE_SPEED.mythic + PERK_VALUES.champ.legend);
    expect(RUN_SPEED * fastestPet * fastestTitle).toBeLessThan(MAX_VALID_SPEED);
    expect(titlePerk("t_hell")).toMatchObject({ group: "hunt", speed: 1.03, huntExp: 0.06, discount: 0 });
    expect(titlePerk(null)).toMatchObject({ group: "none", speed: 1 });
    expect(perkText(titleDef("t_lv50"))).toBe("마을에서 4% 더 빨리 걸어요. 사냥에서 경험치를 10% 더 받아요.");
    expect(perkText(titleDef("t_kill100"))).toBe("");
  });

  it("할인가: 원가 × (1 − 할인율)을 1P 단위로 내림, 할인이 있으면 최소 1P", () => {
    expect(discountedPrice(80, 0.02)).toBe(78);
    expect(discountedPrice(100, 0.04)).toBe(96);
    expect(discountedPrice(1680, 0.07)).toBe(1562);
    expect(discountedPrice(10, 0.02)).toBe(9);
    expect(discountedPrice(1, 0.07)).toBe(0);
    expect(discountedPrice(80, 0)).toBe(80);
    expect(discountedPrice(0, 0.07)).toBe(0);
  });
});

describe("칭호 끼우기 (/api/me/titles)", () => {
  it("못 얻은 칭호는 403, 얻은 칭호는 하나만 끼우고 착용 증서에 실린다, 빼기", async () => {
    const v = await newVisitor();
    const day = kstDay();
    const get = async () => (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect(await get()).toMatchObject({ earned: [], equipped: null, fresh: [], unseen: [], first: true });

    const locked = await titles.POST(call("/api/me/titles", v, { id: "t_fish50" }));
    expect(locked.status).toBe(403);
    expect(((await locked.json()) as ApiError).error.code).toBe("TITLE_LOCKED");
    expect((await titles.POST(call("/api/me/titles", v, { id: "hat_cat" }))).status).toBe(400);

    // 도감 절반 칭호 붙음 + 지난 주간 낚시 1위 기록
    await getForageStore().markDexTitles(v.visitorId, ["fish:50"], day);
    forgetTitles();
    await getChamp().create({ week: "20260105", winners: [{ board: "fish", accountId: v.visitorId, name: "낚시꾼", value: 300 }], settledAt: 1 }, 0);
    // 명예의 전당·칭호 사실은 서버가 몇 분 기억한다 (도감 등록·1위 지급은 그만큼 늦게 보인다) — 시험에서는 바로 잊힌다
    forgetTitles();
    (globalThis as { __tombTitleHall?: unknown }).__tombTitleHall = undefined;
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

describe("새 칭호 알림 (fresh·unseen·first)", () => {
  it("기능 전에 얻어 둔 칭호는 처음 한 번 묶어서, 그 뒤엔 새로 얻은 것만 알린다 · 가방에서 보면 NEW 표시가 꺼진다", async () => {
    const v = await newVisitor();
    const day = kstDay();
    const get = async () => (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    const mark = (body: object) => marks.POST(call("/api/me/titles/marks", v, body));
    // 이미 얻어 둔 칭호 둘 → 처음 확인: 둘 다 fresh, first
    await getForageStore().markDexTitles(v.visitorId, ["bug:50", "ore:100"], day);
    forgetTitles();
    expect(await get()).toMatchObject({ fresh: ["t_bug50", "t_ore100"], unseen: ["t_bug50", "t_ore100"], first: true });
    // 알림 창을 띄움 → 다시 확인해도 안 뜬다 (가방 점은 남는다)
    expect((await mark({ announced: ["t_bug50", "t_ore100"] })).status).toBe(200);
    expect(await get()).toMatchObject({ fresh: [], unseen: ["t_bug50", "t_ore100"], first: false });
    // 새로 얻은 칭호 하나 → 그것만
    await getForageStore().markDexTitles(v.visitorId, ["star:50"], day);
    forgetTitles();
    expect(await get()).toMatchObject({ fresh: ["t_star50"], first: false });
    // 가방 [칭호] 칸에서 봄
    await mark({ announced: ["t_star50"], seen: ["t_bug50", "t_ore100", "t_star50"] });
    expect(await get()).toMatchObject({ fresh: [], unseen: [], first: false });
    // 모르는 칭호 id는 400
    expect((await mark({ seen: ["hat_cat"] })).status).toBe(400);
  });

  it("11/18 보안: 얻지 않은 칭호를 알렸음·봤음으로 보내도 적히지 않고 달 수도 없다 (신화 칭호 포함)", async () => {
    const v = await newVisitor();
    const mark = (body: object) => marks.POST(call("/api/me/titles/marks", v, body));
    const wear = (id: string) => titles.POST(call("/api/me/titles", v, { id }));
    // 요청은 받아 주지만 (옛 화면 호환) 아무것도 적지 않는다
    expect((await mark({ announced: ["t_first100", "t_att30", "t_bug50"], seen: ["t_first100"] })).status).toBe(200);
    const marked = await getTitleMarks().get(v.visitorId);
    expect(marked.announced).toEqual([]);
    expect(marked.seen).toEqual([]);
    forgetTitles();
    const r = (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect(r.earned).not.toContain("t_first100");
    expect(r.earned).not.toContain("t_att30");
    expect((await wear("t_first100")).status).toBe(403);
    expect((await wear("t_att30")).status).toBe(403);
    // 진짜 얻은 칭호는 섞여 와도 그것만 적힌다
    await getForageStore().markDexTitles(v.visitorId, ["bug:50"], kstDay());
    forgetTitles();
    await mark({ announced: ["t_first100", "t_bug50"] });
    expect((await getTitleMarks().get(v.visitorId)).announced).toEqual(["t_bug50"]);
    expect((await wear("t_bug50")).status).toBe(200);
  });

  it("11/18 보안: 예전에 알림 기록에 들어간 신화 칭호는 지금 주인이 아니면 얻은 칭호가 아니다", async () => {
    const v = await newVisitor();
    await getTitleMarks().add(v.visitorId, "announced", ["t_first100"]);
    forgetTitles();
    const r = (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect(r.earned).not.toContain("t_first100");
    expect((await titles.POST(call("/api/me/titles", v, { id: "t_first100" }))).status).toBe(403);
  });

  it("얻은 칭호가 없어도 처음 확인 뒤 얻은 칭호는 하나씩 (first 아님)", async () => {
    const v = await newVisitor();
    const get = async () => (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect((await get()).first).toBe(true);
    await marks.POST(call("/api/me/titles/marks", v, { announced: [] }));
    await getForageStore().markDexTitles(v.visitorId, ["dig:50"], kstDay());
    forgetTitles();
    expect(await get()).toMatchObject({ fresh: ["t_dig50"], first: false });
  });
});

describe("운영자 · 칭호 능력 · 누적 접속 시간", () => {
  const setPoints = (v: Visitor, n: number) => {
    (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = n;
  };

  it("운영자 계정은 모든 칭호를 얻은 것으로 보고 달 수 있다 (새 칭호 알림은 없다)", async () => {
    const v = await newVisitor();
    await getAccounts().enter(v.visitorId, { name: "운영시험" + ipSeq }, Date.now());
    const admin = new NextRequest("http://localhost/api/admin/staff", {
      method: "POST",
      headers: { "x-admin-key": "dev-admin", "content-type": "application/json" },
      body: JSON.stringify({ accountId: v.visitorId }),
    });
    expect((await staffRoute.POST(admin)).status).toBe(200);
    const r = (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect(r.staff).toBe(true);
    // 11/16 매니저 전용 칭호는 운영자도 매니저로 임명됐을 때만 (managers.test)
    expect(r.earned).toEqual(TITLE_IDS.filter((id) => id !== "t_mgr"));
    expect(r.fresh).toEqual([]);
    expect(r.unseen).toEqual([]);
    expect((await titles.POST(call("/api/me/titles", v, { id: "t_kill20k" }))).status).toBe(200);
    // 다음 시험을 위해 운영자 지정 해제
    await staffRoute.POST(
      new NextRequest("http://localhost/api/admin/staff", {
        method: "POST",
        headers: { "x-admin-key": "dev-admin", "content-type": "application/json" },
        body: JSON.stringify({ accountId: null }),
      }),
    );
  });

  it("11/16 패션 갈래 칭호만 상점 값이 깎인다 (이용권·영구 소장), 다른 갈래는 그대로", async () => {
    const v = await newVisitor();
    setPoints(v, 10_000);
    // 금 등급 낚시 칭호 (도감 전부): 할인 없음
    await getForageStore().markDexTitles(v.visitorId, ["fish:100"], kstDay());
    forgetTitles();
    expect((await titles.POST(call("/api/me/titles", v, { id: "t_fish100" }))).status).toBe(200);
    const b0 = (await getAccounts().get(v.visitorId, kstDay(), Date.now())).points;
    expect((await buy.POST(call("/api/shop/buy", v, { itemId: "hat_cat" }))).status).toBe(200);
    expect(b0 - (await getAccounts().get(v.visitorId, kstDay(), Date.now())).points).toBe(itemById("hat_cat")!.price);
    // 금 등급 패션 칭호 (꾸미기 점수 1,500 — 시험이라 바로 단다): 5% 할인
    await getAccounts().setTitle(v.visitorId, "t_look1500");
    forgetTitles(v.visitorId);
    const before = (await getAccounts().get(v.visitorId, kstDay(), Date.now())).points;
    const res = await buy.POST(call("/api/shop/buy", v, { itemId: "hat_flower" }));
    expect(res.status).toBe(200);
    const mid = (await getAccounts().get(v.visitorId, kstDay(), Date.now())).points;
    expect(PERK_VALUES.look.gold).toBe(0.05);
    expect(before - mid).toBe(discountedPrice(itemById("hat_flower")!.price, PERK_VALUES.look.gold));
    expect(before - mid).toBeLessThan(itemById("hat_flower")!.price);
    const p = await permanent.POST(call("/api/shop/permanent", v, { itemId: "hat_straw" }));
    expect(p.status).toBe(200);
    const after = (await getAccounts().get(v.visitorId, kstDay(), Date.now())).points;
    expect(mid - after).toBe(discountedPrice(permanentPrice("hat_straw")!, PERK_VALUES.look.gold));
  });

  it("누적 접속 시간: 받아 준 머무르기만 센다 (처음이면 그날 머문 기록부터)", async () => {
    const v = await newVisitor();
    expect((await getTitleStats().get(v.visitorId)).stay).toBe(0);
    await presence.POST(call("/api/me/presence", v, {}));
    expect((await getTitleStats().get(v.visitorId)).stay).toBe(1);
    // 몰아서 센 만큼 한 번에 (처음이면 그날 머문 기록부터)
    expect(await getTitleStats().addStay("fresh-" + v.visitorId, 3, 5)).toBe(5);
    expect(await getTitleStats().addStay("fresh-" + v.visitorId, 2, 7)).toBe(7);
    // 너무 이르면 안 센다
    await presence.POST(call("/api/me/presence", v, {}));
    expect((await getTitleStats().get(v.visitorId)).stay).toBe(1);
  });

  it("한 번 알린 칭호는 기록이 내려가도 남는다", async () => {
    const v = await newVisitor();
    await getTitleMarks().add(v.visitorId, "announced", ["t_att30"]);
    forgetTitles();
    const r = (await (await titles.GET(call("/api/me/titles", v))).json()) as TitlesResponse;
    expect(r.earned).toContain("t_att30");
    expect(r.progress.streak ?? 0).toBe(0);
  });
});

describe("칭호 사실 기억 (Redis 명령 절약)", () => {
  it("한 번 읽은 칭호 사실은 몇 분 기억하고, 칭호를 달거나 알림 기록을 남기면 그 계정 기억을 지운다", async () => {
    const v = await newVisitor();
    const t0 = 1_900_000_000_000;
    expect((await titleStatus(v.visitorId, t0)).earned).toEqual([]);
    await getForageStore().markDexTitles(v.visitorId, ["herb:50"], kstDay());
    // 기억하는 동안은 그대로
    expect((await titleStatus(v.visitorId, t0 + 60_000)).earned).toEqual([]);
    // 시간이 지나면 새로 읽는다
    expect((await titleStatus(v.visitorId, t0 + FACTS_TTL_MS + 1)).earned).toEqual(["t_herb50"]);
    // 알림 기록을 남기면 바로 (marks 경로가 기억을 지운다)
    await marks.POST(call("/api/me/titles/marks", v, { announced: ["t_herb50"] }));
    expect((await titleStatus(v.visitorId, t0 + FACTS_TTL_MS + 2)).fresh).toEqual([]);
  });
});


describe("내 집 칭호 (꾸밈 점수)", () => {
  it("11/20 포구 오두막 점수도 센다: 마을 집과 오두막 중 높은 쪽 하나 (더하지 않는다)", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    await accounts.earn(v.visitorId, "flower", kstDay());
    await accounts.adjustPoints(v.visitorId, 200_000);
    const store = getHouseStore();
    const t0 = 1_950_000_000_000;
    // 오두막만 있을 때
    const c = (await buyCottage(store, v.visitorId, "칭호 오두막", "", "a", null, 1)).house!;
    for (let i = 0; i < 50; i++) await store.like(c.id, `liker-${i}`, kstDay());
    const cs = (await store.get(c.id))!.score;
    expect(cs).toBeGreaterThanOrEqual(150);
    const want = (score: number) => HOUSE_TITLES.filter((t) => t.min > 0 && score >= t.min).map((t) => `t_house${t.min}`);
    forgetTitles(v.visitorId);
    let r = await titleStatus(v.visitorId, t0);
    expect(r.earned.filter((id) => id.startsWith("t_house"))).toEqual(want(cs));
    expect(r.progress.house).toBe(cs);
    // 마을 집(점수 낮음)을 더 가져도 오두막 점수가 그대로 (합치지 않는다)
    const h = (await buyPlot(store, v.visitorId, "칭호 마을 집", "", "a", null, 1)).house!;
    const vs = (await store.get(h.id))!.score;
    expect(vs).toBeLessThan(cs);
    forgetTitles(v.visitorId);
    r = await titleStatus(v.visitorId, t0 + 1);
    expect(r.progress.house).toBe(Math.max(vs, cs));
    expect(r.earned.filter((id) => id.startsWith("t_house"))).toEqual(want(Math.max(vs, cs)));
  });
});
