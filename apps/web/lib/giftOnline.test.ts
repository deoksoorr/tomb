import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunk, giftDetail, ONLINE_GIFT_BATCH, pickOnlineTargets } from "./giftOnline";

// 11/17 관리자 선물 「지금 접속 중인 사람 모두」: 중복 제거 · 제외 대상 · 나눠 보내기 · 사람 수 확인 흐름

const online = vi.hoisted(() => ({ ids: [] as string[] | null, banned: new Set<string>() }));
vi.mock("./ban", async (orig) => ({
  ...(await orig<typeof import("./ban")>()),
  onlineVisitorIds: async () => online.ids,
  findBan: async (id: string | null) => (id && online.banned.has(id) ? { id: "b1" } : null),
  notifyMe: async () => 0,
}));

const { onlineTargets, previewOnline, sendOnlineGift } = await import("./giftOnlineServer");
const { getAccounts, getGifts } = await import("./store");
const { getStaffStore } = await import("./staff");
const { getAdminAudit } = await import("./store/adminAudit");

const acct = (n: number) => `onl${String(n).padStart(4, "0")}`.padEnd(21, "z");

describe("받을 계정 고르기 (순수)", () => {
  it("한 번씩, 계정 id 모양만, 제외 대상은 뺀다", () => {
    const a = acct(1);
    const b = acct(2);
    const c = acct(3);
    expect(pickOnlineTargets([a, b, a, "짧은id", c, b], new Set([c]))).toEqual([a, b]);
    expect(pickOnlineTargets([], new Set())).toEqual([]);
  });

  it("1,000명씩 나눈다", () => {
    const ids = Array.from({ length: 2345 }, (_, i) => acct(i));
    const parts = chunk(ids);
    expect(parts.map((p) => p.length)).toEqual([ONLINE_GIFT_BATCH, ONLINE_GIFT_BATCH, 345]);
    expect(parts.flat()).toEqual(ids);
    expect(chunk([], 10)).toEqual([]);
  });

  it("감사 기록 요약", () => {
    expect(giftDetail(0, [{ itemId: "xm_box", count: 1 }])).toBe("크리스마스 선물상자 ×1");
    expect(giftDetail(50, [])).toBe("포인트 50");
  });
});

describe("지금 접속 중인 사람에게 보내기 (메모리 저장소)", () => {
  const NOW = Date.UTC(2026, 11, 24, 12);
  const [a, b, staff, banned, ghost] = [acct(11), acct(12), acct(13), acct(14), acct(15)];

  beforeEach(async () => {
    for (const id of [a, b, staff, banned]) await getAccounts().enter(id, {}, NOW - 1000);
    await getStaffStore().set({ accountId: staff, setAt: NOW });
    online.banned = new Set([banned]);
  });

  it("운영자·정지·없는 계정을 빼고 중복 없이 센다", async () => {
    online.ids = [a, b, a, staff, banned, ghost, "bad id"];
    const t = (await onlineTargets(NOW))!;
    expect(t.ids).toEqual([a, b]);
    expect(t.excluded).toBe(4); // 서로 다른 6개 중 운영자·정지·없는 계정·모양이 틀린 id
    expect(await previewOnline(NOW)).toEqual({ reachable: true, count: 2, excluded: 4, at: NOW });
  });

  it("실시간 서버에 닿지 못하면 보내지 않는다", async () => {
    online.ids = null;
    expect(await previewOnline(NOW)).toMatchObject({ reachable: false, count: 0 });
    expect(await sendOnlineGift({ note: "메리 크리스마스", points: 0, items: [{ itemId: "xm_box", count: 1 }] }, "관리자", NOW)).toBeNull();
  });

  it("확인한 수만큼 선물함에 들어가고 감사 기록이 남는다", async () => {
    online.ids = [b, a, staff];
    const preview = await previewOnline(NOW);
    expect(preview.count).toBe(2);
    const r = (await sendOnlineGift({ note: "메리 크리스마스", points: 0, items: [{ itemId: "xm_box", count: 1 }], expect: preview.count }, "관리자(산타)", NOW))!;
    expect(r).toMatchObject({ sent: 2, gifts: 1, expect: 2 });
    for (const id of [a, b]) {
      const box = await getGifts().inbox(id, NOW - 1000, NOW);
      expect(box.some((g) => g.id === r.records[0].id)).toBe(true);
    }
    expect((await getGifts().inbox(staff, NOW - 1000, NOW)).some((g) => g.id === r.records[0].id)).toBe(false);
    const [log] = await getAdminAudit().recent(1);
    expect(log).toMatchObject({ action: "giftOnline", by: "관리자(산타)", count: 2, detail: "크리스마스 선물상자 ×1" });
  });
});
