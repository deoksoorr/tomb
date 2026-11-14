import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RANK_GIFT_FIX_TAG, rankGiftFixStatus, runRankGiftFix } from "./rankGiftFix";
import { getAccounts, getGifts } from "./store";
import { kstDay } from "./store/accounts";
import { GIFT_KEEP_MS, legacyGiftPoints, walletField, type GiftRecord } from "./store/gifts";
import { CHAMP_POINTS } from "./weeklyChamp";

// 선물·1위 보상 포인트는 지갑에만 + 그 전에 랭킹에 들어간 몫을 한 번만 빼는 정리 (메모리 저장소)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
});

const glob = globalThis as Record<string, unknown>;
beforeEach(() => {
  for (const k of ["__tombAccounts", "__tombGifts", "__tombStore"]) delete glob[k];
});

const T0 = Date.UTC(2026, 10, 12, 3);
const DAY = "20261112";
const WEEK = "20261109";
const gift = (over: Partial<GiftRecord>): GiftRecord => ({
  id: `g-${Math.random().toString(36).slice(2, 10)}`,
  from: "마을 관리인",
  note: "선물",
  points: 0,
  items: [],
  createdAt: T0,
  expiresAt: T0 + GIFT_KEEP_MS,
  target: "all",
  targetName: null,
  ...over,
});

/** 메모리 저장소 안쪽 (이전 방식 받기·지급을 흉내 내려고만 쓴다) */
type AcctInner = { accts: Map<string, { lifetime: number | null; points: number }>; champWallet: Map<string, number> };
type GiftInner = { state: Map<string, Map<string, string>> };
const inner = () => getAccounts() as unknown as AcctInner;

/** 이전 방식 선물 받기: 받은 뒤 지갑 전용 표시를 지우고, 그때처럼 모은 포인트에도 더한다 (메모리 랭킹은 모은 포인트를 그대로 읽는다) */
async function legacyClaim(id: string, g: GiftRecord, now: number, lifetimeAdd = g.points) {
  const r = await getGifts().claim(id, g.id, 1, now);
  expect(r.ok).toBe(true);
  (getGifts() as unknown as GiftInner).state.get(id)!.delete(walletField(g.id));
  const a = inner().accts.get(id)!;
  a.lifetime = (a.lifetime ?? 0) + lifetimeAdd;
}
/** 이전 방식 1위 보상 지급 */
async function legacyChamp(id: string, mark: string, now: number) {
  expect(await getAccounts().grantChamp(id, mark, "hat_straw", "head", now + 1000, CHAMP_POINTS, now)).toBe(true);
  inner().champWallet.delete(mark);
  const a = inner().accts.get(id)!;
  a.lifetime = (a.lifetime ?? 0) + CHAMP_POINTS;
}

const life = async (id: string) => (await getAccounts().get(id, DAY, T0)).lifetimePoints;
const total = async (id: string) => (await getAccounts().pointRank(1000, id)).mine?.points ?? null;
const week = async (id: string) => (await getAccounts().pointRank(1000, id, WEEK)).mine?.points ?? null;

describe("앞으로: 선물·1위 보상·관리자 지급은 지갑에만", () => {
  it("모은 포인트·전체/주간 포인트 랭킹은 그대로, 지갑만 오른다", async () => {
    const accounts = getAccounts();
    await accounts.earn("alpha", "hunt", DAY, { amount: 30 });
    const g = gift({ points: 70 });
    await getGifts().send(g);
    expect(await getGifts().claim("alpha", g.id, 1, T0 + 1)).toMatchObject({ ok: true, points: 70 });
    expect(await accounts.grantChamp("alpha", `${WEEK}:points`, "hat_straw", "head", T0 + 1000, CHAMP_POINTS, T0)).toBe(true);
    expect(await accounts.adjustPoints("alpha", 500)).toBe(30 + 70 + CHAMP_POINTS + 500);
    expect(await life("alpha")).toBe(30);
    expect(await total("alpha")).toBe(30);
    expect(await week("alpha")).toBe(30);
    // 경제 통계에는 따로 남는다 (관리자 선물·주간 1위 보상·관리자 지급)
    const [{ fields }] = await accounts.economy([DAY]);
    expect(fields).toMatchObject({ "earn:gift": 70, "earn:champ": CHAMP_POINTS, "earn:hunt": 30 });
    expect((await accounts.economy([kstDay()]))[0].fields["earn:admin"]).toBe(500); // 관리자 조정은 오늘 날짜로
    // 새로 받은 것은 정리 대상이 아니다
    expect((await getGifts().legacyClaims()).perAccount.size).toBe(0);
    expect(await accounts.legacyChampMarks()).toEqual([]);
  });

  it("선물만 받은 계정은 랭킹에 오르지 않는다", async () => {
    const g = gift({ target: "bravo", points: 300 });
    await getGifts().send(g);
    await getGifts().claim("bravo", g.id, 0, T0);
    expect(await total("bravo")).toBeNull();
    expect(await life("bravo")).toBe(0);
  });
});

describe("이미 받은 몫 정리 (한 번)", () => {
  it("계정별로 정확히 빼고, 0 아래로는 안 내려가며, 두 번 눌러도 한 번만", async () => {
    const accounts = getAccounts();
    await accounts.onceEnd(RANK_GIFT_FIX_TAG, null);
    expect((await rankGiftFixStatus()).status).toBe("none");
    // alpha: 적립 30 + 이전 방식 선물 70 + 이전 1위 보상 1,000 → 1,100
    await accounts.earn("alpha", "hunt", DAY, { amount: 30 });
    const g1 = gift({ points: 70 });
    await getGifts().send(g1);
    await legacyClaim("alpha", g1, T0 + 1);
    await legacyChamp("alpha", `${WEEK}:points`, T0);
    expect(await total("alpha")).toBe(1_100);
    // bravo: 적립 10 + 이전 선물 500 (그런데 모은 포인트엔 100만 남음) → 0에서 멈추고 랭킹에서 빠진다
    await accounts.earn("bravo", "hunt", DAY, { amount: 10 });
    const g2 = gift({ target: "bravo", points: 500 });
    await getGifts().send(g2);
    await legacyClaim("bravo", g2, T0 + 2, 100);
    expect(await total("bravo")).toBe(110);
    // charlie: 이전 선물(g1)을 받고 지웠다 (받은 수로 확정) + 새 방식 선물은 그대로
    await accounts.earn("charlie", "hunt", DAY, { amount: 5 });
    await legacyClaim("charlie", g1, T0 + 3);
    expect(await getGifts().remove("charlie", g1.id, 1, T0 + 4)).toBe(true);
    const g3 = gift({ target: "charlie", points: 40 });
    await getGifts().send(g3);
    await getGifts().claim("charlie", g3.id, 0, T0 + 5);
    expect(await total("charlie")).toBe(75);
    // delta: 개발용 지급(dev:)은 0P라 빼지 않는다
    await accounts.earn("delta", "hunt", DAY, { amount: 8 });
    await accounts.grantChamp("delta", "dev:delta:hat_straw", "hat_straw", "head", T0 + 1000, 0, T0);
    inner().champWallet.delete("dev:delta:hat_straw");

    const [r1, r2] = await Promise.all([runRankGiftFix(T0 + 10), runRankGiftFix(T0 + 10)]);
    expect([r1.status, r2.status].sort()).toEqual(["busy", "done"]);
    const s = (r1.status === "done" ? r1 : r2).summary!;
    expect(s).toMatchObject({
      accounts: 3,
      requested: 70 + CHAMP_POINTS + 500 + 70,
      deducted: 70 + CHAMP_POINTS + 110 + 70,
      clamped: 1,
      skipped: 0,
      gift: { claims: 2, deleted: 1, ambiguous: 0, missing: 0, points: 640 },
      champ: { marks: 1, points: CHAMP_POINTS },
    });
    expect([await life("alpha"), await total("alpha"), await week("alpha")]).toEqual([30, 30, 30]);
    expect([await life("bravo"), await total("bravo")]).toEqual([0, null]);
    expect([await life("charlie"), await total("charlie")]).toEqual([5, 5]);
    expect(await total("delta")).toBe(8);
    // 지갑은 그대로
    expect((await accounts.get("alpha", DAY, T0)).points).toBe(30 + 70 + CHAMP_POINTS);

    // 다시 눌러도 그때 결과만 (더 빼지 않는다)
    const again = await runRankGiftFix(T0 + 20);
    expect(again).toEqual({ status: "already", summary: s });
    expect(await rankGiftFixStatus()).toEqual({ status: "already", summary: s });
    expect(await total("alpha")).toBe(30);
    // 계정별 표시도 한 번만
    expect(await accounts.unrankOnce(RANK_GIFT_FIX_TAG, "alpha", 10)).toBeNull();
    expect(await life("alpha")).toBe(30);
  });

  it("중간에 멈췄다 다시 해도 이미 뺀 계정은 다시 빼지 않는다", async () => {
    const accounts = getAccounts();
    await accounts.earn("echo", "hunt", DAY, { amount: 20 });
    const g = gift({ target: "echo", points: 50 });
    await getGifts().send(g);
    await legacyClaim("echo", g, T0);
    expect(await accounts.unrankOnce(RANK_GIFT_FIX_TAG, "echo", 50)).toEqual({ before: 70, after: 20 });
    await accounts.onceEnd(RANK_GIFT_FIX_TAG, null);
    const r = await runRankGiftFix(T0 + 1);
    expect(r.summary).toMatchObject({ accounts: 0, skipped: 1, deducted: 0 });
    expect(await life("echo")).toBe(20);
  });
});

describe("legacyGiftPoints (받은 뒤 지운 선물 맞추기)", () => {
  const G = (id: string, points: number, target = "all") => [id, gift({ id, points, target })] as const;
  const st = (rows: Record<string, Record<string, string>>) => new Map(Object.entries(rows).map(([k, v]) => [k, new Map(Object.entries(v))]));

  it("지운 계정이 모두 받았거나 아무도 안 받았으면 확정, 일부만이면 빼지 않는다, 내용이 없으면 missing", () => {
    const gifts = new Map([G("a", 10), G("b", 20), G("c", 30), G("t", 7, "u4")]);
    const states = st({
      u1: { a: "c:1", b: "d", c: "d" },
      u2: { a: "d", b: "d", c: "c:2", [walletField("c")]: "30" },
      u3: { a: "d", b: "d", c: "d", x: "c:9" },
      u4: { t: "d" },
    });
    // a: 받은 3 = c: 1 + 지운 2 → 지운 둘 다 받음 / b: 받은 0 → 아무도 안 받음 / c: 받은 2 = c: 1(지갑 전용) + 지운 2 중 1 → 확정 못 함 / t: 계정 앞 선물을 받고 지움
    const r = legacyGiftPoints(states, gifts, new Map([["a", 3], ["b", 0], ["c", 2], ["t", 1], ["x", 1]]));
    expect(Object.fromEntries(r.perAccount)).toEqual({ u1: 10, u2: 10, u3: 10, u4: 7 });
    expect(r).toMatchObject({ claims: 2, deleted: 3, ambiguous: 1, missing: 1 });
  });
});
