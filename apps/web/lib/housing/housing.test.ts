import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import {
  defaultExterior,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  furnitureById,
  FURNITURE,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  houseTitle,
  HOUSE_TITLES,
  LIKE_WEIGHT,
  MAX_OWN_PER_ITEM,
  nextTitle,
  PLOT_TIERS,
  sellPrice,
  villageLots,
} from "./catalog";
import { emptyLayout, normalizeExterior, findFreeSpot, footprint, gateTiles, placedScore, styleTag, validateLayout } from "./layout";
import {
  buyFurniture,
  buyPlot,
  getHouseStore,
  houseIdFor,
  houseRank,
  kstWeekStart,
  likeHouse,
  postGuest,
  saveLayout,
  saveExterior,
  sellFurniture,
  upgradePlot,
  village,
} from "./service";
import { MemoryHouseStore, type HouseStore } from "./store";
import { HK, RedisHouseStore } from "./store-redis";
import { checkGuestText, checkHouseName, checkIntro, hasBanned } from "./text";
import type { HouseLayout, Placed } from "./types";

const lay = (items: Placed[], floor = DEFAULT_FLOOR, wall = DEFAULT_WALL): HouseLayout => ({ items, floor, wall });
const p = (u: string, i: string, x: number, y: number, r = 0): Placed => ({ u, i, x, y, r });

describe("카탈로그", () => {
  it("물건이 30개 안팎이고 id가 겹치지 않으며 가격·점수가 양수다", () => {
    expect(FURNITURE.length).toBeGreaterThanOrEqual(30);
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(FURNITURE.length);
    for (const f of FURNITURE) {
      expect(f.price).toBeGreaterThan(0);
      expect(f.score).toBeGreaterThan(0);
      expect(/^[a-z0-9_]+$/.test(f.id)).toBe(true);
    }
  });
  it("묘역 폭은 짝수 (문 2칸)", () => {
    for (const t of PLOT_TIERS) expect(t.w % 2).toBe(0);
  });
});

describe("배치 검증", () => {
  it("빈 배치·정상 배치는 통과하고 점수를 합산한다", () => {
    expect(validateLayout(emptyLayout(), "small", {})).toMatchObject({ ok: true, placedScore: 0 });
    const l = lay([p("a", "desk", 0, 0), p("b", "chair", 0, 1)], "floor_wood");
    const v = validateLayout(l, "small", { desk: 1, chair: 1, floor_wood: 1 });
    expect(v).toMatchObject({ ok: true, counts: { desk: 1, chair: 1, floor_wood: 1 } });
    expect(v.ok && v.placedScore).toBe(6 + 3 + 14);
  });
  it("묘역 밖·문 앞·겹침을 막는다", () => {
    expect(validateLayout(lay([p("a", "desk", 9, 0)]), "small", null)).toMatchObject({ ok: false, code: "BAD_PLACE" });
    const [g] = gateTiles(PLOT_TIERS[0]);
    expect(validateLayout(lay([p("a", "pot", g.x, g.y)]), "small", null)).toMatchObject({ ok: false, code: "BAD_PLACE" });
    expect(validateLayout(lay([p("a", "desk", 0, 0), p("b", "pot", 1, 0)]), "small", null)).toMatchObject({ ok: false, code: "BAD_PLACE" });
  });
  it("바닥층 위에는 서 있는 물건을 올릴 수 있지만 바닥층끼리는 겹칠 수 없다", () => {
    expect(validateLayout(lay([p("a", "rug", 0, 0), p("b", "table", 1, 1)]), "small", null).ok).toBe(true);
    expect(validateLayout(lay([p("a", "rug", 0, 0), p("b", "stone_path", 1, 1)]), "small", null).ok).toBe(false);
  });
  it("돌리면 turn 물건은 가로·세로가 바뀌고, 나머지는 그대로다", () => {
    expect(footprint(furnitureById("desk")!, 1)).toEqual({ w: 1, h: 2 });
    expect(footprint(furnitureById("bookshelf")!, 1)).toEqual({ w: 2, h: 1 });
    // 세로로 돌린 책상은 오른쪽 끝 칸에 들어간다
    expect(validateLayout(lay([p("a", "desk", 9, 0, 1)]), "small", null).ok).toBe(true);
  });
  it("가진 개수·개수 상한·uid 중복·알 수 없는 물건·스킨", () => {
    expect(validateLayout(lay([p("a", "pot", 0, 0), p("b", "pot", 1, 0)]), "small", { pot: 1 })).toMatchObject({ code: "NOT_OWNED" });
    expect(validateLayout(lay([], "floor_wood"), "small", {})).toMatchObject({ code: "NOT_OWNED" });
    expect(validateLayout(lay([p("a", "pot", 0, 0), p("a", "pot", 1, 0)]), "small", null)).toMatchObject({ code: "BAD_LAYOUT" });
    expect(validateLayout(lay([p("a", "nope", 0, 0)]), "small", null)).toMatchObject({ code: "BAD_ITEM" });
    expect(validateLayout(lay([p("a", "floor_wood", 0, 0)]), "small", null)).toMatchObject({ code: "BAD_ITEM" });
    expect(validateLayout(lay([], "wall_stone"), "small", null)).toMatchObject({ code: "BAD_SKIN" });
    const many = Array.from({ length: 31 }, (_, i) => p(`u${i}`, "stone_path", i % 10, Math.floor(i / 10)));
    expect(validateLayout(lay(many), "small", null)).toMatchObject({ code: "TOO_MANY" });
  });
  it("마을 필지 수: 최소 8, 4의 배수, 집이 늘면 아래로", () => {
    expect(villageLots(0, 0)).toBe(8);
    expect(villageLots(8, 8)).toBe(12);
    expect(villageLots(13, 3)).toBe(16);
  });
  it("외관 정규화: 모르는 값·다른 자리 아이템은 기본으로", () => {
    expect(normalizeExterior({ roof: "door_red", sign: "sign_neon", junk: 1 })).toEqual({ ...defaultExterior(), sign: "sign_neon" });
    expect(normalizeExterior(null)).toEqual(defaultExterior());
  });
  it("빈자리 찾기는 겹치지 않는 칸을 준다", () => {
    const items = [p("a", "tree", 4, 3)];
    const spot = findFreeSpot(items, PLOT_TIERS[0], furnitureById("tree")!, 0)!;
    expect(validateLayout(lay([...items, p("b", "tree", spot.x, spot.y)]), "small", null).ok).toBe(true);
  });
});

describe("점수·호칭", () => {
  it("구간별 호칭과 다음 호칭", () => {
    expect(houseTitle(0).name).toBe(HOUSE_TITLES[0].name);
    expect(houseTitle(49).name).toBe("쓸쓸한 터");
    expect(houseTitle(50).name).toBe("아늑한 보금자리");
    expect(houseTitle(10_000).name).toBe("전설의 명당");
    expect(nextTitle(160)?.name).toBe("소문난 별장");
    expect(nextTitle(900)).toBeNull();
  });
  it("배치 점수와 별칭", () => {
    const l = lay([p("a", "server_rack", 0, 0), p("b", "monitor_desk", 1, 0), p("c", "pot", 4, 0)], DEFAULT_FLOOR, "wall_iron");
    expect(placedScore(l)).toBe(22 + 18 + 2 + 18);
    expect(styleTag(l)).toBe("야근 감성");
    expect(styleTag(lay([p("a", "pot", 0, 0)]))).toBeNull();
  });
});

describe("글 검사", () => {
  it("집 이름 1~20자, 허용 문자, 금칙어", () => {
    expect(checkHouseName("  달빛   서재 ")).toEqual({ ok: true, text: "달빛 서재" });
    expect(checkHouseName("").ok).toBe(false);
    expect(checkHouseName("가".repeat(21)).ok).toBe(false);
    expect(checkHouseName("<script>").ok).toBe(false);
    expect(checkHouseName("관리자의 집").ok).toBe(false);
  });
  it("소개·방명록: 길이·링크·금칙어 (띄어쓰기·문장부호로 피하지 못한다)", () => {
    expect(checkIntro("").ok).toBe(true);
    expect(checkGuestText("").ok).toBe(false);
    expect(checkGuestText("a".repeat(81)).ok).toBe(false);
    expect(checkGuestText("놀러 오세요 https://spam.example").ok).toBe(false);
    expect(hasBanned("정말 좋은 집이네요! 또 올게요")).toBe(false);
    expect(hasBanned("이 집 f.u.c.k 별로")).toBe(true);
    expect(hasBanned("ㅅ ㅂ")).toBe(true);
    expect(hasBanned("좆")).toBe(true);
    expect(hasBanned("아주 긴 문장의 맨 끝에 씨발")).toBe(true);
  });
});

// ── 저장소: 메모리와 (환경변수가 있으면) 실제 Redis가 같은 동작을 지킨다 ──

type Kit = { store: HouseStore; cleanup(ids: string[]): Promise<void> };
const kits: [string, () => Kit][] = [["memory", () => ({ store: new MemoryHouseStore(), cleanup: async () => undefined })]];
const conn = env.redis();
if (conn)
  kits.push([
    "redis",
    () => {
      const store = new RedisHouseStore(conn);
      return { store, cleanup: async (ids) => Promise.all(ids.map((id) => store.remove(id))).then(() => undefined) };
    },
  ]);

describe.each(kits)("HouseStore (%s)", (_name, make) => {
  const made: string[] = [];
  let kit: Kit;
  beforeEach(() => {
    kit = make();
  });
  const fresh = async () => {
    const id = nanoid(12);
    made.push(id);
    expect(await kit.store.create({ id, owner: `o_${id}`, name: "집", intro: "", ownerName: "주인", tier: "small", lot: null, now: Date.now() })).toMatchObject({ lot: expect.any(Number) });
    return id;
  };
  afterEach(async () => {
    await kit?.cleanup(made.splice(0));
  });

  it("같은 id로 두 번 만들 수 없다", async () => {
    const id = await fresh();
    expect(await kit.store.create({ id, owner: "x", name: "b", intro: "", ownerName: "", tier: "small", lot: null, now: 1 })).toBe("exists");
  });

  it("가방 상한, 놓인 물건은 되팔 수 없다, 배치 저장은 가진 개수를 원자적으로 확인한다", async () => {
    const id = await fresh();
    const s = kit.store;
    expect(await s.addItem(id, "pot", 2)).toBe("ok");
    expect(await s.addItem(id, "pot", 2)).toBe("ok");
    expect(await s.addItem(id, "pot", 2)).toBe("max");
    expect(await s.addItem("nohouse_xxxx", "pot", 2)).toBe("no_house");
    const l = lay([p("a", "pot", 0, 0), p("b", "pot", 1, 0)]);
    expect(await s.saveDesign(id, "small", l, null, { pot: 2 }, 4, 1)).toBe("ok");
    expect(await s.takeItem(id, "pot")).toBe("placed");
    expect(await s.takeItem(id, "desk")).toBe("none");
    expect(await s.saveDesign(id, "small", l, null, { pot: 3 }, 6, 2)).toBe("not_owned");
    expect(await s.saveDesign(id, "wide", l, null, { pot: 2 }, 4, 2)).toBe("tier");
    expect(await s.saveDesign(id, "small", lay([p("a", "pot", 0, 0)]), null, { pot: 1 }, 2, 3)).toBe("ok");
    expect(await s.takeItem(id, "pot")).toBe("ok");
    expect(await s.inventory(id)).toEqual({ pot: 1 });
    const h = await s.get(id);
    expect(h).toMatchObject({ placedScore: 2, score: 2, items: 1 });
    expect(h!.layout.items).toHaveLength(1);
  });

  it("좋아요는 하루 1번, 점수에 반영되고 랭킹이 바뀐다. 숨긴 집은 목록·좋아요에서 빠진다", async () => {
    const a = await fresh();
    const b = await fresh();
    const s = kit.store;
    await s.addItem(a, "pot", 5);
    await s.saveDesign(a, "small", lay([p("a", "pot", 0, 0)]), null, { pot: 1 }, 2, 1);
    expect(await s.like(b, "v1", "20261109")).toEqual({ likes: 1, score: LIKE_WEIGHT });
    expect(await s.like(b, "v1", "20261109")).toBe("already");
    expect(await s.likedToday(b, "v1", "20261109")).toBe(true);
    expect(await s.like(b, "v1", "20261110")).toEqual({ likes: 2, score: 2 * LIKE_WEIGHT });
    const top = (await s.list("score", 50)).filter((h) => h.id === a || h.id === b).map((h) => h.id);
    expect(top).toEqual([b, a]);
    expect((await s.list("likes", 50)).find((h) => h.id === b)?.likes).toBe(2);
    expect(await s.setHidden(b, true)).toBe(true);
    expect((await s.list("score", 50)).some((h) => h.id === b)).toBe(false);
    expect(await s.like(b, "v2", "20261109")).toBeNull();
    expect(await s.setHidden(b, false)).toBe(true);
    expect((await s.list("new", 50)).some((h) => h.id === b)).toBe(true);
  });

  it("방명록: 최신 먼저, 하루 한도, 보관 개수, 신고 누적 숨김, 지우기", async () => {
    const id = await fresh();
    const s = kit.store;
    const day = "20261109";
    const author = `w_${nanoid(6)}`;
    for (let i = 0; i < GUEST_PER_DAY; i++) expect(await s.addGuest(id, { id: `e${i}`, name: "손님", text: `글${i}`, at: i, author }, day)).toBe("ok");
    expect(await s.addGuest(id, { id: "over", name: "손님", text: "넘침", at: 99, author }, day)).toBe("limit");
    const list = await s.guestbook(id, false);
    expect(list[0].id).toBe(`e${GUEST_PER_DAY - 1}`);
    expect(list).toHaveLength(GUEST_PER_DAY);
    for (let i = 0; i < GUEST_REPORT_HIDE; i++) {
      expect(await s.reportGuest(id, "e0", `ip${i}`)).toBe("added");
      expect(await s.reportGuest(id, "e0", `ip${i}`)).toBe("duplicate");
    }
    expect((await s.guestbook(id, false)).some((g) => g.id === "e0")).toBe(false);
    expect((await s.guestbook(id, true)).find((g) => g.id === "e0")?.hidden).toBe(true);
    expect((await s.guestReports(id)).get("e0")).toBe(GUEST_REPORT_HIDE);
    expect(await s.reportGuest(id, "nope", "ip")).toBeNull();
    expect((await s.removeGuest(id, "e1"))?.text).toBe("글1");
    expect(await s.removeGuest(id, "e1")).toBeNull();
    expect(await s.setGuestHidden(id, "e0", false)).toBe(true);
    expect((await s.guestbook(id, false)).some((g) => g.id === "e0")).toBe(true);
  });

  it("번지: 자동 배정은 가장 앞 빈 번지, 고른 번지가 차 있으면 lot_taken, 동시에 만들어도 번지가 겹치지 않는다", async () => {
    const s = kit.store;
    const mk = (id: string, lot: number | null) => s.create({ id, owner: `o_${id}`, name: "집", intro: "", ownerName: "주인", tier: "small", lot, now: 1 });
    const ids = Array.from({ length: 6 }, () => nanoid(12));
    made.push(...ids);
    const before = new Set((await s.village()).map((h) => h.lot));
    const results = await Promise.all(ids.slice(0, 5).map((id) => mk(id, null)));
    const lots = results.map((r) => (typeof r === "object" ? r.lot : -1));
    expect(new Set(lots).size).toBe(5);
    for (const l of lots) expect(before.has(l)).toBe(false);
    expect(await mk(ids[5], lots[0])).toBe("lot_taken");
    const v = await s.village();
    expect(v.filter((h) => ids.includes(h.id)).map((h) => h.lot).sort((a, b) => a - b)).toEqual([...lots].sort((a, b) => a - b));
    await s.remove(ids[0]);
    expect((await mk(ids[5], lots[0])) as { lot: number }).toEqual({ lot: lots[0] });
  });

  it("외관 저장: 기본 외관으로 시작하고, saveDesign으로 바꾼 외관은 배치를 건드리지 않는다", async () => {
    const id = await fresh();
    const s = kit.store;
    expect((await s.get(id))!.exterior).toEqual(defaultExterior());
    await s.addItem(id, "roof_red", 5);
    await s.addItem(id, "pot", 5);
    await s.saveDesign(id, "small", lay([p("a", "pot", 0, 0)]), null, { pot: 1 }, 2, 1);
    const ext = { ...defaultExterior(), roof: "roof_red" };
    expect(await s.saveDesign(id, "small", null, ext, { pot: 1, roof_red: 1 }, 10, 2)).toBe("ok");
    const h = (await s.get(id))!;
    expect(h.exterior.roof).toBe("roof_red");
    expect(h.layout.items).toHaveLength(1);
    expect(h.placedScore).toBe(10);
    expect(await s.takeItem(id, "roof_red")).toBe("placed");
  });

  it(`방명록은 최근 ${GUEST_KEEP}개만 남긴다`, async () => {
    const id = await fresh();
    for (let i = 0; i < GUEST_KEEP + 3; i++)
      await kit.store.addGuest(id, { id: `k${i}`, name: "n", text: "t", at: i, author: `a${i}` }, "20261109");
    expect(await kit.store.guestbook(id, true)).toHaveLength(GUEST_KEEP);
  });
});

// ── 서비스: 공용 포인트와 함께 (로컬은 메모리 계정 저장소) ──

describe.skipIf(!!conn)("하우징 서비스 (포인트 연동)", () => {
  const accounts = getAccounts();
  const store = getHouseStore();
  async function account(points: number): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;

  it("분양: 포인트가 모자라면 409, 있으면 300P를 쓰고 한 계정에 1채만", async () => {
    const poor = await account(100);
    await expect(buyPlot(store, poor, "가난한 집", "", "a")).rejects.toMatchObject({ status: 409, code: "NOT_ENOUGH_POINTS" });
    expect(await points(poor)).toBe(100);
    const rich = await account(1000);
    const r = await buyPlot(store, rich, "부자 집", "", "a");
    expect(r.house?.id).toBe(houseIdFor(rich));
    expect(r.points).toBe(700);
    await expect(buyPlot(store, rich, "두 번째", "", "a")).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    expect(await points(rich)).toBe(700);
  });

  it("동시에 여러 번 사도 잔액이 음수가 되지 않는다 (가진 만큼만 산다)", async () => {
    const id = await account(300 + 2 * furnitureById("stone_lantern")!.price);
    await buyPlot(store, id, "집", "", "a");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => buyFurniture(store, id, "stone_lantern")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await points(id)).toBe(0);
    expect((await store.inventory(houseIdFor(id))).stone_lantern).toBe(2);
  });

  it("가방 상한을 넘으면 포인트를 쓰지 않는다", async () => {
    const id = await account(9000);
    await buyPlot(store, id, "집", "", "a");
    for (let i = 0; i < MAX_OWN_PER_ITEM; i++) await buyFurniture(store, id, "stone_path");
    const before = await points(id);
    await expect(buyFurniture(store, id, "stone_path")).rejects.toMatchObject({ code: "MAX_OWNED" });
    expect(await points(id)).toBe(before);
  });

  it("배치·되팔기·넓히기", async () => {
    const id = await account(3000);
    await buyPlot(store, id, "집", "", "a");
    await buyFurniture(store, id, "desk");
    await buyFurniture(store, id, "desk");
    const saved = await saveLayout(store, id, "small", lay([p("a", "desk", 0, 0)]));
    expect(saved.house?.placedScore).toBe(6);
    await expect(saveLayout(store, id, "small", lay([p("a", "desk", 0, 0), p("b", "desk", 2, 0), p("c", "desk", 4, 0)]))).rejects.toMatchObject({ code: "NOT_OWNED" });
    const before = await points(id);
    const sold = await sellFurniture(store, id, "desk");
    expect(sold.refunded).toBe(sellPrice(furnitureById("desk")!));
    expect(await points(id)).toBe(before + sellPrice(furnitureById("desk")!));
    await expect(sellFurniture(store, id, "desk")).rejects.toMatchObject({ code: "PLACED" });
    await expect(upgradePlot(store, id, "manor")).rejects.toMatchObject({ code: "BAD_TIER" });
    const up = await upgradePlot(store, id, "wide");
    expect(up.house?.tier).toBe("wide");
    expect(up.house?.layout.items).toHaveLength(1);
    await expect(saveLayout(store, id, "small", lay([]))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("좋아요: 내 집은 안 되고, 하루 1번, 주인은 포인트를 받는다", async () => {
    const owner = await account(400);
    const visitor = await account(0);
    await buyPlot(store, owner, "집", "", "a");
    const hid = houseIdFor(owner);
    await expect(likeHouse(store, hid, owner, "ip")).rejects.toMatchObject({ code: "OWN_HOUSE" });
    const r = await likeHouse(store, hid, visitor, "ip-v");
    expect(r).toMatchObject({ likes: 1, score: LIKE_WEIGHT, earnedOwner: 2 });
    expect(await points(owner)).toBe(102);
    await expect(likeHouse(store, hid, visitor, "ip-v")).rejects.toMatchObject({ code: "ALREADY_LIKED" });
  });

  it("방명록 하루 한도는 429", async () => {
    const owner = await account(400);
    await buyPlot(store, owner, "집", "", "a");
    const hid = houseIdFor(owner);
    const visitor = nanoid();
    for (let i = 0; i < GUEST_PER_DAY; i++) await postGuest(store, hid, visitor, "손님", `안녕 ${i}`);
    await expect(postGuest(store, hid, visitor, "손님", "또")).rejects.toMatchObject({ status: 429 });
  });

  it("외관: 산 것만 입히고, 꾸밈 점수에 더해지며, 입힌 외관 아이템은 되팔 수 없다", async () => {
    const id = await account(2000);
    await buyPlot(store, id, "집", "", "a");
    await expect(saveExterior(store, id, { roof: "roof_red" })).rejects.toMatchObject({ code: "NOT_OWNED" });
    await expect(saveExterior(store, id, { roof: "door_red" })).rejects.toMatchObject({ code: "BAD_EXTERIOR" });
    await buyFurniture(store, id, "roof_red");
    await buyFurniture(store, id, "sign_neon");
    const r = await saveExterior(store, id, { roof: "roof_red", sign: "sign_neon" });
    expect(r.house?.exterior).toMatchObject({ roof: "roof_red", sign: "sign_neon", door: "door_wood" });
    expect(r.house?.placedScore).toBe(8 + 12);
    await expect(sellFurniture(store, id, "roof_red")).rejects.toMatchObject({ code: "PLACED" });
    // 배치를 저장해도 외관 몫 점수·놓은 개수가 유지된다
    await buyFurniture(store, id, "pot");
    const l = await saveLayout(store, id, "small", lay([p("a", "pot", 0, 0)]));
    expect(l.house?.placedScore).toBe(20 + 2);
    await expect(sellFurniture(store, id, "sign_neon")).rejects.toMatchObject({ code: "PLACED" });
    // 외관 아이템은 묘역 칸에 놓을 수 없다
    await expect(saveLayout(store, id, "small", lay([p("b", "roof_red", 1, 1)]))).rejects.toMatchObject({ code: "BAD_ITEM" });
  });

  it("분양 때 번지를 고를 수 있고, 찬 번지는 포인트를 쓰지 않고 거절한다. 마을 목록에 외관과 함께 나온다", async () => {
    const a = await account(1000);
    const b = await account(1000);
    const free = (await village(store)).lots + 1;
    const ra = await buyPlot(store, a, "가", "", "a", free);
    expect(ra.house?.lot).toBe(free);
    await expect(buyPlot(store, b, "나", "", "b", free)).rejects.toMatchObject({ code: "LOT_TAKEN" });
    expect(await points(b)).toBe(1000);
    const v = await village(store);
    expect(v.houses.find((h) => h.lot === free)?.exterior.roof).toBe("roof_slate");
    expect(v.lots % 4).toBe(0);
    expect(v.lots).toBeGreaterThanOrEqual(free);
  });

  it("Redis 키 이름 (README·운영 문서와 같은 값)", () => {
    expect(HK.meta("x")).toBe("house:x");
    expect(HK.layout("x")).toBe("house:x:layout");
    expect(HK.like("x", "v", "20261109")).toBe("house:x:like:v:20261109");
    expect([HK.score, HK.new, HK.likes, HK.lots]).toEqual(["houses:score", "houses:new", "houses:likes", "houses:lots"]);
  });
});

// ── F11 꾸밈 점수 랭킹 ──

describe("꾸밈 점수 랭킹 (houseRank)", () => {
  const mk = async (store: MemoryHouseStore, owner: string, name: string, score: number, now: number) => {
    const id = houseIdFor(owner);
    await store.create({ id, owner, name, intro: "", ownerName: `${name} 주인`, tier: "small", lot: null, now });
    expect(await store.saveDesign(id, "small", null, null, {}, score, now)).toBe("ok");
    return id;
  };

  it("전체 = 점수 순, 주간 = 이번 주에 꾸민 집만, 내 집은 순위 밖이면 mine으로", async () => {
    const store = new MemoryHouseStore();
    const now = Date.UTC(2026, 10, 12, 3); // 2026-11-12 (목) 12시 KST
    const weekStart = kstWeekStart(now);
    expect(new Date(weekStart).toISOString()).toBe("2026-11-08T15:00:00.000Z"); // 11/9(월) 0시 KST
    await mk(store, "old", "지난주 집", 500, weekStart - 1000);
    await mk(store, "a", "가", 300, now);
    await mk(store, "b", "나", 100, now);
    const all = await houseRank(store, "all", "b", 50, now);
    expect(all.rows.map((r) => [r.rank, r.name, r.value])).toEqual([
      [1, "지난주 집", 500],
      [2, "가", 300],
      [3, "나", 100],
    ]);
    expect(all.rows[2]).toMatchObject({ me: true, sub: expect.stringContaining("나 주인") });
    expect(all.mine).toBeNull();
    const week = await houseRank(store, "week", null, 50, now);
    expect(week.rows.map((r) => r.name)).toEqual(["가", "나"]);
    expect(week.rows.every((r) => !r.me)).toBe(true);
    const short = await houseRank(store, "all", "b", 1, now);
    expect(short.rows).toHaveLength(1);
    expect(short.mine).toMatchObject({ rank: 3, name: "나", me: true });
  });
});
