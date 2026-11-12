import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { ACCT_IPS_KEEP, MemoryBans, RedisBans, SEEN_TTL_SEC, type BanRecord, type BanStore } from "./bans";
import { caseKey, MemoryReportBox, NOTES_KEEP, RedisReportBox, type CaseMeta, type ReportBox } from "./reportBox";

// 47번 정지 저장소·신고함 계약. Redis 구현은 환경변수가 있을 때 같은 시나리오 (Lua 없이 MULTI만 쓴다)
const conn = env.redis();
const T0 = 1_800_000_000_000;

const ban = (over: Partial<BanRecord>): BanRecord => ({
  id: `ban_${nanoid(8)}`,
  kind: "account",
  accountId: `acct-${nanoid(6)}`,
  accountName: "검수",
  ipHash: null,
  ipSource: null,
  ipAccounts: 0,
  reason: "사유",
  memo: "메모",
  startAt: T0,
  until: T0 + 86_400_000,
  by: "관리자",
  liftedAt: null,
  liftedBy: null,
  history: [],
  ...over,
});

function banContract(make: () => BanStore) {
  it("기록 저장·목록, 색인으로 계정·IP 판정 (만료는 거른다), 색인 지우기", async () => {
    const s = make();
    const ip = nanoid(32).toLowerCase();
    const a = ban({});
    const b = ban({ kind: "ip", accountId: null, ipHash: ip, until: null, startAt: T0 + 1 });
    await s.save(a);
    await s.save(b);
    await s.point(`a:${a.accountId}`, a);
    await s.point(`i:${ip}`, b);
    expect((await s.get(a.id))?.reason).toBe("사유");
    const ids = (await s.list()).map((x) => x.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id)); // 최근 시작 순
    expect(await s.lookup(a.accountId, null, T0)).toEqual({ id: a.id, until: a.until });
    expect(await s.lookup("nobody", ip, T0)).toEqual({ id: b.id, until: null });
    expect(await s.lookup(a.accountId, null, a.until! + 1)).toBeNull(); // 기간이 지나면 저절로 풀림
    expect((await s.index()).get(`i:${ip}`)).toEqual({ id: b.id, until: null });
    await s.point(`i:${ip}`, null);
    expect(await s.lookup(null, ip, T0)).toBeNull();
    await s.point(`a:${a.accountId}`, null);
  });

  it("접속 IP 기록: 계정별 최근 IP·IP별 계정 (최근 먼저, 개수 상한), 운영자 IP 표시", async () => {
    const s = make();
    const acct = `acct-${nanoid(6)}`;
    const ips = Array.from({ length: ACCT_IPS_KEEP + 2 }, () => nanoid(32).toLowerCase());
    for (const [i, ip] of ips.entries()) await s.seen(acct, ip, T0 + i * 1000, i === 0);
    const got = await s.accountIps(acct, T0 + 10_000);
    expect(got).toHaveLength(ACCT_IPS_KEEP);
    expect(got[0].ipHash).toBe(ips.at(-1));
    await s.seen(`acct-${nanoid(6)}`, ips.at(-1)!, T0 + 20_000, false);
    expect((await s.ipAccounts(ips.at(-1)!, T0 + 20_000)).map((x) => x.accountId)[1]).toBe(acct);
    expect(await s.isOperatorIp(ips[0])).toBe(true);
    expect(await s.isOperatorIp(ips[1])).toBe(false);
    // 30일 지난 기록은 보이지 않는다
    expect(await s.accountIps(acct, T0 + SEEN_TTL_SEC * 1000 + 100_000)).toEqual([]);
  });
}

describe("정지 저장소 (메모리)", () => banContract(() => new MemoryBans()));
describe.skipIf(!conn)("정지 저장소 (실제 Redis)", () => banContract(() => new RedisBans(conn!)));

const meta = (over: Partial<CaseMeta> = {}): CaseMeta => ({ type: "user", targetId: `t-${nanoid(8)}`, accountId: null, name: "대상", preview: "대상", ...over });

function boxContract(make: () => ReportBox) {
  it("신고: 같은 신고자·같은 날은 한 번, 신고자 수·횟수·메모, 처리하면 처리됨, 다시 신고되면 대기", async () => {
    const box = make();
    const m = meta();
    const key = caseKey(m.type, m.targetId);
    const before = await box.openCount();
    expect(await box.add(m, { at: T0, reason: "abuse", memo: "욕", by: "r1" }, "20271115")).toBe("ok");
    expect(await box.add(m, { at: T0 + 1, reason: "spam", memo: "", by: "r1" }, "20271115")).toBe("duplicate");
    expect(await box.add(m, { at: T0 + 2, reason: "nickname", memo: "", by: "r2" }, "20271115")).toBe("ok");
    expect(await box.add(m, { at: T0 + 3, reason: "other", memo: "다음 날", by: "r1" }, "20271116")).toBe("ok");
    expect(await box.openCount()).toBe(before + 1);
    const c = (await box.list("open", 500)).find((x) => x.key === key)!;
    expect(c).toMatchObject({ count: 3, reporters: 2, firstAt: T0, lastAt: T0 + 3, status: "open", resolution: null });
    expect(c.notes.map((n) => n.memo)).toEqual(["다음 날", "", "욕"]);

    expect(await box.resolve(key, { at: T0 + 10, by: "관리자", action: "기각" })).toBe(true);
    expect((await box.list("open", 500)).some((x) => x.key === key)).toBe(false);
    expect((await box.get(key))).toMatchObject({ status: "done", resolution: { action: "기각" } });

    await box.add(m, { at: T0 + 20, reason: "abuse", memo: "", by: "r3" }, "20271117");
    expect(await box.get(key)).toMatchObject({ status: "open", count: 4, reporters: 3, resolution: null });
    await box.resolve(key, { at: T0 + 30, by: "관리자", action: "강퇴" });
  });

  it("신고함에 없는 사건(묘비·방명록)은 스냅샷으로 처리 기록을 만든다. 없고 스냅샷도 없으면 false. 메모는 최근 것만", async () => {
    const box = make();
    const id = `g-${nanoid(8)}`;
    expect(await box.resolve(caseKey("grave", id), { at: T0, by: "관리자", action: "숨김" })).toBe(false);
    const snap = { ...meta({ type: "grave", targetId: id, name: "묘비", preview: "비문", reporters: 4 }), count: 5, firstAt: T0 - 5, lastAt: T0 - 1 };
    expect(await box.resolve(caseKey("grave", id), { at: T0, by: "관리자", action: "숨김" }, snap)).toBe(true);
    expect(await box.get(caseKey("grave", id))).toMatchObject({ status: "done", count: 5, reporters: 4, lastAt: T0 - 1, preview: "비문" });

    const m = meta();
    for (let i = 0; i < NOTES_KEEP + 3; i++) await box.add(m, { at: T0 + i, reason: "spam", memo: `#${i}`, by: `r${i}` }, "20271115");
    const c = await box.get(caseKey(m.type, m.targetId));
    expect(c?.notes).toHaveLength(NOTES_KEEP);
    expect(c?.notes[0].memo).toBe(`#${NOTES_KEEP + 2}`);
    expect(c?.count).toBe(NOTES_KEEP + 3);
    await box.resolve(caseKey(m.type, m.targetId), { at: T0, by: "관리자", action: "기각" });
  });
}

describe("신고함 (메모리)", () => boxContract(() => new MemoryReportBox()));
describe.skipIf(!conn)("신고함 (실제 Redis)", () => boxContract(() => new RedisReportBox(conn!)));
