import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { connHealthOf } from "../opsLog";
import { OTHER_SITE_LABEL, OVERFLOW_LABEL, SIGNUP_DAY_LABEL_MAX, signupDayLabel, srcLabel, signupSrcOf, srcText } from "../signupSource";
import { hourKeyOf, lastHourKeys, LOG_KEEP_ALL, LOG_KEEP_USER, MemoryOpsLog, RedisOpsLog, type ConnLogEntry, type OpsLogStore } from "./opsLog";
import { MemorySignupSrc, RedisSignupSrc, type SignupSrcStore } from "./signupSrc";

// 11/26 운영 기록(계정당 50·전체 500 트림, 시간별 수)과 가입 유입 저장소 — 메모리·실제 Redis 같은 약속

function logContract(make: () => OpsLogStore, isolated: boolean) {
  const store = make();

  it("여러 줄을 한 번에: 최신 먼저, 계정당 50줄·전체 500줄로 자른다", async () => {
    const a = `a${nanoid(8)}`;
    const b = `b${nanoid(8)}`;
    const rows: ConnLogEntry[] = [];
    for (let i = 0; i < 60; i++) rows.push({ a, k: i % 2 ? "out" : "in", at: 1_000 + i, ch: 1, dev: "pc", ...(i % 2 ? { why: "closed" as const } : {}) });
    rows.push({ a: b, k: "in", at: 5_000, dev: "phone·카카오톡" });
    await store.push("conn", rows);
    const mine = await store.ofAccount("conn", a);
    expect(mine).toHaveLength(LOG_KEEP_USER);
    expect(mine[0].at).toBe(1_059); // 최신 먼저
    expect(mine[LOG_KEEP_USER - 1].at).toBe(1_010);
    expect(await store.ofAccount("conn", b)).toEqual([{ a: b, k: "in", at: 5_000, dev: "phone·카카오톡" }]);
    const all = await store.recent("conn", 3);
    expect(all.map((e) => e.at)).toEqual([5_000, 1_059, 1_058]);
    // 사냥터 기록은 따로
    expect(await store.ofAccount("hunt", a)).toEqual([]);
  });

  it("11/26 계정 목록에만 넣기(all: false — 화면 오류 줄)는 전체 목록을 밀어내지 않는다", async () => {
    const a = `e${nanoid(8)}`;
    await store.push("conn", [{ a, k: "in", at: 9_000_000 }]);
    const before = await store.recent("conn", 3);
    const errs = Array.from({ length: 5 }, (_, i): ConnLogEntry => ({ a, k: "err", at: 9_000_001 + i, msg: `화면: e${i}` }));
    await store.push("conn", errs, undefined, { all: false });
    expect(await store.recent("conn", 3)).toEqual(before);
    const mine = await store.ofAccount("conn", a);
    expect(mine.map((e) => e.k)).toEqual(["err", "err", "err", "err", "err", "in"]);
  });

  it("전체 목록은 500줄까지", async () => {
    const rows = Array.from({ length: LOG_KEEP_ALL + 20 }, (_, i): ConnLogEntry => ({ a: `x${i % 7}${nanoid(4)}`, k: "in", at: i }));
    await store.push("hunt", rows.map((r) => ({ ...r, k: "start" as const })));
    const all = await store.recent("hunt");
    expect(all).toHaveLength(LOG_KEEP_ALL);
    expect(all[0].at).toBe(LOG_KEEP_ALL + 19);
  });

  it("시간 칸: 나감 종류별·들어옴 수를 세고, 여러 칸을 합친다", async () => {
    const h1 = isolated ? `t${nanoid(6)}` : hourKeyOf(Date.now());
    const h2 = `t${nanoid(6)}`;
    const a = `c${nanoid(8)}`;
    await store.push("conn", [
      { a, k: "in", at: 1 },
      { a, k: "out", at: 2, why: "drop" },
      { a, k: "out", at: 3, why: "normal" },
      { a, k: "err", at: 4, msg: "화면: x" },
    ], h1);
    await store.push("conn", [{ a, k: "out", at: 5, why: "timeout" }], h2);
    const c = await store.hourCounts([h1, h2]);
    expect(c.in).toBeGreaterThanOrEqual(1);
    expect(c.drop).toBeGreaterThanOrEqual(1);
    expect(c.timeout).toBe(1);
    expect(c.err).toBeUndefined(); // 오류 줄은 세지 않는다
  });
}

describe("MemoryOpsLog", () => logContract(() => new MemoryOpsLog(), true));
const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisOpsLog (실제 Redis)", () => logContract(() => new RedisOpsLog(redisEnv!), true));

function srcContract(make: () => SignupSrcStore) {
  const store = make();
  it("가입 유입은 처음 한 번만, 그날 유입별 가입 수 +1", async () => {
    const day = `t${nanoid(6)}`;
    const a = nanoid(10);
    const b = nanoid(10);
    const src = signupSrcOf({ r: "www.google.com", us: "Kakao Talk!" }, null, 10);
    expect(await store.save(a, src, day)).toBe(true);
    expect(await store.save(a, signupSrcOf({ r: "naver.com" }, null, 20), day)).toBe(false);
    expect(await store.save(b, signupSrcOf({}, "Mozilla/5.0 (iPhone) KAKAOTALK 10", 30), day)).toBe(true);
    const got = await store.get([a, "nobody", b]);
    expect(got[0]).toEqual({ r: "google.com", us: "kakao-talk", at: 10 });
    expect(got[1]).toBeNull();
    expect(got[2]).toEqual({ app: "카카오톡", at: 30 });
    expect(await store.dayCounts([day, `t${nanoid(6)}`])).toEqual({ "utm kakao-talk": 1, "카카오톡 앱": 1 });
    expect(await store.get([])).toEqual([]);
  });

  it("11/26 보안: 하루 유입 이름은 상한까지만 따로 세고 넘치면 「기타」, 모르는 사이트는 「기타 사이트」 (계정 칸에는 호스트 그대로)", async () => {
    const day = `t${nanoid(6)}`;
    const odd = nanoid(10);
    expect(await store.save(odd, signupSrcOf({ r: "unknown-site.example" }, null, 1), day)).toBe(true);
    expect((await store.get([odd]))[0]?.r).toBe("unknown-site.example");
    expect(await store.dayCounts([day])).toEqual({ [OTHER_SITE_LABEL]: 1 });
    for (let i = 0; i < SIGNUP_DAY_LABEL_MAX + 4; i++) await store.save(nanoid(10), { us: `u${i}`, at: i }, day);
    const c = await store.dayCounts([day]);
    expect(Object.keys(c)).toHaveLength(SIGNUP_DAY_LABEL_MAX + 1);
    expect(c[OVERFLOW_LABEL]).toBe(5);
    // 이미 있는 이름은 상한이 차도 그 칸에 센다
    await store.save(nanoid(10), { us: "u0", at: 1 }, day);
    await store.save(nanoid(10), { r: "other.example", at: 1 }, day);
    const d = await store.dayCounts([day]);
    expect(d["utm u0"]).toBe(2);
    expect(d[OTHER_SITE_LABEL]).toBe(2);
    expect(d[OVERFLOW_LABEL]).toBe(5);
  });

  it("이번 접속 유입: 오늘 칸 먼저, 없으면 어제 칸", async () => {
    const today = `t${nanoid(6)}`;
    const yday = `t${nanoid(6)}`;
    const a = nanoid(10);
    const b = nanoid(10);
    await store.setLive(a, { s: "구글", at: 1 }, yday);
    await store.setLive(a, { s: "네이버", at: 2 }, today);
    await store.setLive(b, { s: "직접·알 수 없음", at: 3 }, yday);
    expect(await store.live([a, b, "none"], [today, yday])).toEqual([{ s: "네이버", at: 2 }, { s: "직접·알 수 없음", at: 3 }, null]);
  });
}

describe("MemorySignupSrc", () => srcContract(() => new MemorySignupSrc()));
describe.skipIf(!redisEnv)("RedisSignupSrc (실제 Redis)", () => srcContract(() => new RedisSignupSrc(redisEnv!)));

describe("유입 이름·비정상 종료 비율 (순수)", () => {
  it("utm → 리퍼러 → 앱 → 직접 순, 앱 안이면 앱 이름을 덧붙인다", () => {
    expect(srcLabel(null)).toBe("기록 없음");
    expect(srcLabel({ us: "naver_blog", um: "post" })).toBe("utm naver_blog/post");
    expect(srcLabel({ r: "search.naver.com" })).toBe("네이버 검색");
    expect(srcLabel({ r: "blog.naver.com" })).toBe("네이버 블로그");
    expect(srcLabel({ r: "example.org" })).toBe("example.org");
    expect(srcLabel({ app: "인스타그램" })).toBe("인스타그램 앱");
    expect(srcLabel({})).toBe("직접·알 수 없음");
    expect(srcText({ r: "instagram.com", app: "인스타그램", at: 1 })).toBe("인스타그램 · 인스타그램");
    // 유입별 가입 수 이름: 모르는 호스트만 묶는다
    expect(signupDayLabel({ r: "example.org" })).toBe(OTHER_SITE_LABEL);
    expect(signupDayLabel({ r: "blog.naver.com" })).toBe("네이버 블로그");
    expect(signupDayLabel({ us: "naver_blog", r: "example.org" })).toBe("utm naver_blog");
    expect(signupDayLabel({ app: "카카오톡" })).toBe("카카오톡 앱");
    expect(signupDayLabel(null)).toBe("기록 없음");
    // 전체 주소·검색어는 남지 않는다 (호스트 모양만)
    expect(signupSrcOf({ r: "google.com/search?q=abc" as string }, null, 1)).toEqual({ at: 1 });
  });

  it("24시간 비율: 연결 끊김·응답 없음·오류 / 나감 전체", () => {
    expect(connHealthOf({})).toEqual({ ins: 0, outs: 0, byWhy: {}, abnormal: 0, ratio: null });
    const h = connHealthOf({ in: 10, normal: 4, closed: 3, drop: 2, timeout: 1, maint: 0 });
    expect(h).toMatchObject({ ins: 10, outs: 10, abnormal: 3, ratio: 0.3 });
    expect(lastHourKeys(Date.UTC(2026, 10, 26, 0, 30), 3)).toEqual(["2026112609", "2026112608", "2026112607"]);
  });
});
