import { verifyGrant } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import type { GiftLogEntry } from "@/lib/store/gifts";
import type {
  ApiError,
  CalendarClaimResponse,
  CalendarResponse,
  GiftClaimResponse,
  GiftListResponse,
  Me,
  MegaphoneListResponse,
  MegaphoneUseResponse,
  StayBonusResponse,
} from "@/lib/types";
import * as adminGifts from "./admin/gifts/route";
import * as adminMega from "./admin/megaphone/route";
import * as devClock from "./dev/clock/route";
import * as giftById from "./gifts/[id]/route";
import * as gifts from "./gifts/route";
import * as attend from "./me/attend/route";
import * as calendar from "./me/calendar/route";
import * as claim from "./me/calendar/claim/route";
import * as presence from "./me/presence/route";
import * as stayBonus from "./me/stay-bonus/route";
import * as megaphone from "./megaphone/route";
import * as session from "./session/route";

// 10번 출석 달력 · 11번 선물함 · 23번 확성기. 로컬 구성(Memory*)으로 라우트를 직접 부른다
const SECRET = "dev-join-secret-change-me";
/** 2026-11-12 12:00 KST (자정 근처에서 돌아도 날짜가 바뀌지 않게 시계를 고정한다) */
const NOON = Date.UTC(2026, 10, 12, 3, 0);

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "3");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; id: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; admin?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.admin) headers["x-admin-key"] = "dev-admin";
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const errOf = async (res: Response | Promise<Response>) => ((await (await res).json()) as ApiError).error.code;
async function newVisitor(name?: string): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`, id: (await bodyOf<{ visitorId: string }>(res)).visitorId };
  await attend.POST(call("/api/me/attend", { visitor: v, body: name ? { name } : {} }));
  return v;
}
const setPoints = (v: Visitor, n: number) => {
  (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.id).points = n;
};

describe("10번 출석 달력", () => {
  it("접속 시간 보너스: 서버 머무르기 기록 30분마다 받기, 안 받으면 쌓이고 같은 구간은 한 번만", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const v = await newVisitor("보너스지기");
    const post = () => stayBonus.POST(call("/api/me/stay-bonus", { method: "POST", visitor: v }));
    expect(await errOf(post())).toBe("NOT_YET");
    await devClock.POST(call("/api/dev/clock", { visitor: v, body: { minutes: 30 } }));
    const first = await bodyOf<StayBonusResponse>(post());
    expect(first).toMatchObject({ earned: 10, count: 1 });
    expect(first.me.attendance.bonusClaimed).toBe(1);
    expect(await errOf(post())).toBe("NOT_YET");
    await devClock.POST(call("/api/dev/clock", { visitor: v, body: { minutes: 60 } }));
    const second = await bodyOf<StayBonusResponse>(post());
    expect(second).toMatchObject({ earned: 35, count: 2 });
    expect(second.me.points).toBe(first.me.points + 6 * 5 + 35); // 그 사이 머무르기 +5 × 6번 + 보너스 2구간
  });

  it("정해진 시간(1시간) 머물러야 오늘 칸을 받고(+10), 하루 한 번만. 입장만으로는 포인트가 없다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const v = await newVisitor("달력지기");
    const cal = await bodyOf<CalendarResponse>(calendar.GET(call("/api/me/calendar", { visitor: v })));
    expect(cal).toMatchObject({ month: "202611", today: "20261112", firstWeekday: 0, claimable: false, stayMinutes: 0, needMinutes: 60 });
    expect(cal.days).toHaveLength(30);
    expect(cal.days[11]).toEqual({ day: 12, state: "today", points: 0 });
    expect(cal.days[10].state).toBe("missed");
    expect(cal.days[12].state).toBe("future");
    expect(cal.rewards).toEqual({ daily: 10, streak: 30, streakEvery: 7, monthly: 200 });
    expect(await errOf(claim.POST(call("/api/me/calendar/claim", { method: "POST", visitor: v })))).toBe("NOT_YET");

    // 머무르기 (실제 화면은 10분마다 /api/me/presence) — 개발용 시계로 50분을 앞당긴다
    await devClock.POST(call("/api/dev/clock", { visitor: v, body: { minutes: 50 } }));
    // 화면의 머무르기 호출: 직전 기록에서 10분이 안 지나 이번엔 쌓이지 않는다
    const pres = await bodyOf<{ me: Me; earned: number }>(presence.POST(call("/api/me/presence", { method: "POST", visitor: v })));
    expect(pres.me.attendance.stayMinutes).toBe(50);
    expect(await errOf(claim.POST(call("/api/me/calendar/claim", { method: "POST", visitor: v })))).toBe("NOT_YET");
    const { me: after } = await bodyOf<{ me: Me }>(devClock.POST(call("/api/dev/clock", { visitor: v, body: { minutes: 10 } })));
    expect(after.attendance).toEqual({ today: false, streak: 0, stayMinutes: 60, bonusClaimed: 0 });
    const before = after.points;

    const res = await bodyOf<CalendarClaimResponse>(claim.POST(call("/api/me/calendar/claim", { method: "POST", visitor: v })));
    expect(res.earned).toEqual({ daily: 10, streak: 0, monthly: 0 });
    expect(res.me.points).toBe(before + 10);
    expect(res.me.attendance).toMatchObject({ today: true, streak: 1 });
    expect(res.calendar.days[11]).toEqual({ day: 12, state: "stamped", points: 10 });
    expect(res.calendar.claimable).toBe(false);
    expect(res.tierRewards).toEqual([]); // 첫 도장은 아직 구간(3일) 전
    expect(res.calendar.tiers).toHaveLength(5);
    expect(await errOf(claim.POST(call("/api/me/calendar/claim", { method: "POST", visitor: v })))).toBe("ALREADY");
    // 다시 입장해도(옛 화면의 자동 출석 호출) 포인트는 그대로
    const again = await bodyOf<{ me: Me; earned: number }>(attend.POST(call("/api/me/attend", { visitor: v, body: {} })));
    expect(again.earned).toBe(0);
    expect(again.me.points).toBe(before + 10);
  });

  it("지난 두 달까지만 볼 수 있다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const v = await newVisitor();
    expect((await calendar.GET(call("/api/me/calendar?month=202609", { visitor: v }))).status).toBe(200);
    expect((await calendar.GET(call("/api/me/calendar?month=202608", { visitor: v }))).status).toBe(400);
    expect((await calendar.GET(call("/api/me/calendar?month=202612", { visitor: v }))).status).toBe(400);
    const sep = await bodyOf<CalendarResponse>(calendar.GET(call("/api/me/calendar?month=202609", { visitor: v })));
    expect(sep.days.every((d) => d.state === "missed")).toBe(true);
  });
});

describe("11번 선물함", () => {
  it("전체 선물: 보낸 시각 이전 계정만, 받기는 한 번만, 지우면 사라지고, 30일 뒤 만료", async () => {
    const t0 = NOON + 86_400_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    const old = await newVisitor("오래된손님");
    const sent = await adminGifts.POST(
      call("/api/admin/gifts", { admin: true, body: { target: "all", note: "개장 기념 선물이에요!", points: 50, items: [{ itemId: "fw_small", count: 2 }, { itemId: "fw_small", count: 1 }] } }),
    );
    expect(sent.status).toBe(201);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 1);
    const fresh = await newVisitor("새손님");
    expect((await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: fresh })))).gifts).toHaveLength(0);

    const box = await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: old })));
    expect(box.unclaimed).toBe(1);
    const g = box.gifts[0];
    expect(g).toMatchObject({ from: "마을 관리인", note: "개장 기념 선물이에요!", points: 50, items: [{ itemId: "fw_small", count: 3 }], claimedAt: null });
    expect(g.expiresAt - g.createdAt).toBe(30 * 86_400_000);
    // 새 계정은 남의 전체 선물을 받을 수 없다
    expect((await giftById.POST(call(`/api/gifts/${g.id}`, { method: "POST", visitor: fresh }), ctx(g.id))).status).toBe(404);

    const [a, b] = await Promise.all([
      giftById.POST(call(`/api/gifts/${g.id}`, { method: "POST", visitor: old }), ctx(g.id)),
      giftById.POST(call(`/api/gifts/${g.id}`, { method: "POST", visitor: old }), ctx(g.id)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const ok = (a.status === 200 ? a : b).clone();
    const got = (await ok.json()) as GiftClaimResponse;
    expect(got.points).toBe(50);
    expect(got.me.points).toBe(50);
    expect(got.me.inventory.fw_small).toBe(3);
    const after = await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: old })));
    expect(after.unclaimed).toBe(0);
    expect(after.gifts[0].claimedAt).toBe(t0 + 1);

    const log = await bodyOf<{ gifts: GiftLogEntry[] }>(adminGifts.GET(call("/api/admin/gifts", { admin: true })));
    expect(log.gifts.find((x) => x.id === g.id)?.claims).toBe(1);

    expect((await giftById.DELETE(call(`/api/gifts/${g.id}`, { method: "DELETE", visitor: old }), ctx(g.id))).status).toBe(200);
    expect((await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: old })))).gifts.some((x) => x.id === g.id)).toBe(false);
    expect((await giftById.POST(call(`/api/gifts/${g.id}`, { method: "POST", visitor: old }), ctx(g.id))).status).toBe(409);
  });

  it("특정 계정 선물은 그 계정에게만, 안 받으면 30일 뒤 사라진다. 검증", async () => {
    const t0 = NOON + 3 * 86_400_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    const me = await newVisitor("받는이");
    const other = await newVisitor("구경꾼");
    await adminGifts.POST(call("/api/admin/gifts", { admin: true, body: { target: me.id, targetName: "받는이", from: "운영자", note: "문의 감사 선물", items: [{ itemId: "mega_ch", count: 1 }] } }));
    expect((await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: me })))).gifts.map((g) => g.note)).toContain("문의 감사 선물");
    expect((await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: other })))).gifts.map((g) => g.note)).not.toContain("문의 감사 선물");
    vi.spyOn(Date, "now").mockReturnValue(t0 + 30 * 86_400_000 + 1);
    expect((await bodyOf<GiftListResponse>(gifts.GET(call("/api/gifts", { visitor: me })))).gifts.map((g) => g.note)).not.toContain("문의 감사 선물");

    const bad = (body: object) => adminGifts.POST(call("/api/admin/gifts", { admin: true, body }));
    expect((await bad({ target: "all", note: "빈 선물" })).status).toBe(400);
    expect((await bad({ target: "all", note: "x", items: [{ itemId: "nope", count: 1 }] })).status).toBe(400);
    expect((await bad({ target: "all", note: "", points: 10 })).status).toBe(400);
    expect((await adminGifts.POST(call("/api/admin/gifts", { body: { target: "all", note: "x", points: 1 } }))).status).toBe(401);
  });
});

describe("23번 확성기", () => {
  it("확성기를 쓰면 서명된 증서(닉네임·문장·채널)를 받고 기록이 남는다. 30초 간격·금칙어·링크·가방 확인", async () => {
    const v = await newVisitor("외침이");
    setPoints(v, 500);
    const inv = (getAccounts() as unknown as { acct(id: string): { inv: Map<string, number> } }).acct(v.id).inv;
    inv.set("mega_ch", 2);
    inv.set("mega_all", 1);
    const use = (body: object) => megaphone.POST(call("/api/megaphone", { visitor: v, body }));

    expect((await use({ itemId: "mega_ch", text: "  ", channel: 2 })).status).toBe(400);
    expect((await use({ itemId: "mega_ch", text: "가".repeat(61), channel: 2 })).status).toBe(400);
    expect((await use({ itemId: "mega_ch", text: "여기 https://spam.example 오세요", channel: 2 })).status).toBe(400);
    expect((await use({ itemId: "mega_ch", text: "시발 뭐야", channel: 2 })).status).toBe(400);
    expect((await use({ itemId: "fw_small", text: "안녕", channel: 2 })).status).toBe(400);

    const res = await bodyOf<MegaphoneUseResponse>(use({ itemId: "mega_ch", text: "  2채널 여러분\n안녕하세요!  ", channel: 2 }));
    expect(res.entry).toMatchObject({ name: "외침이", text: "2채널 여러분 안녕하세요!", scope: "channel", ch: 2 });
    expect(res.me.inventory.mega_ch).toBe(1);
    expect(await verifyGrant(SECRET, res.grant)).toMatchObject({ kind: "megaphone", visitorId: v.id, nonce: res.entry.id, name: "외침이", text: res.entry.text, scope: "channel", ch: 2 });

    const tooSoon = await use({ itemId: "mega_all", text: "또 외침", channel: 2 });
    expect(tooSoon.status).toBe(429);

    // 30초 뒤: 모든 채널 확성기
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
    const all = await bodyOf<MegaphoneUseResponse>(use({ itemId: "mega_all", text: "모두 좋은 밤!", channel: 2 }));
    expect(all.entry.scope).toBe("all");
    // 확성기가 없으면 (간격은 다시 풀어 준다)
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
    expect(await errOf(use({ itemId: "mega_all", text: "하나 더", channel: 2 }))).toBe("NO_ITEM");
    expect((await use({ itemId: "mega_ch", text: "마지막 한 번", channel: 2 })).status).toBe(200);

    const list = (ch: number) => bodyOf<MegaphoneListResponse>(megaphone.GET(call(`/api/megaphone?channel=${ch}`)));
    const ch2 = (await list(2)).entries.map((e) => e.text);
    expect(ch2.slice(-3)).toEqual(["2채널 여러분 안녕하세요!", "모두 좋은 밤!", "마지막 한 번"]);
    const ch1 = (await list(1)).entries.map((e) => e.text);
    expect(ch1).toContain("모두 좋은 밤!");
    expect(ch1).not.toContain("2채널 여러분 안녕하세요!");

    // 관리자 숨김
    const rows = (await bodyOf<{ entries: { id: string; accountId: string; hidden: boolean }[] }>(adminMega.GET(call("/api/admin/megaphone", { admin: true })))).entries;
    expect(rows.find((r) => r.id === all.entry.id)).toMatchObject({ accountId: v.id, hidden: false });
    expect((await adminMega.POST(call("/api/admin/megaphone", { admin: true, body: { id: all.entry.id, hidden: true } }))).status).toBe(200);
    expect((await list(1)).entries.map((e) => e.id)).not.toContain(all.entry.id);
    expect((await adminMega.POST(call("/api/admin/megaphone", { admin: true, body: { id: "nope", hidden: true } }))).status).toBe(404);
    expect((await adminMega.GET(call("/api/admin/megaphone"))).status).toBe(401);
  });
});
