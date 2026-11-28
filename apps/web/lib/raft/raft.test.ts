import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { campRaftSpots, RAFT_AUTO_EVERY_MS, RAFT_REBUY_WAIT_MS, RAFT_RENEW_MAX, RAFT_TICKET_MS, verifyGrant } from "@tomb/protocol";
import { env } from "../env";
import { autoCatchTimes, autoTriesTotal, beatAuto, newAutoSession, parseAutoSession, AUTO_FISH_EVERY_MS, AUTO_NO_END } from "../forage/auto";
import { startAutoFish, syncAutoFish } from "../forage/service";
import { getForageStore } from "../forage/store";
import { getAccounts } from "../store";
import { getTitleStats } from "../store/titleStats";
import { buyRaft, raftAutoGate, raftClaims, raftDevLeft, raftOpen, raftStatus, renewRaft, RAFT_DAY_DONE_MSG } from "./service";
import { getRaftStore } from "./store";

// 11/27 좌대 입장권 (메모리 구성 — 실제 Redis 계약은 raft-redis.test.ts)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "RAFT_ENABLED"]) vi.stubEnv(k, "");
  vi.stubEnv("CAMP_ENABLED", "1");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.stubEnv("RAFT_ENABLED", ""));

const T0 = Date.UTC(2026, 10, 27, 3, 0, 0); // KST 12:00
async function account(points: number): Promise<string> {
  const id = nanoid();
  const a = getAccounts();
  await a.enter(id, { name: `손님${id.slice(0, 4)}`, color: "#9fc5a8", body: "hood" }, T0);
  await a.adjustPoints(id, points);
  return id;
}
const pts = async (id: string) => (await getAccounts().get(id, "20261127", T0)).points;
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => e);

describe("좌대 입장권 사기·연장", () => {
  it("서버 스위치: 캠핑장이 열린 서버면 켜고 RAFT_ENABLED=0이면 끈다", () => {
    expect(raftOpen()).toBe(true);
    vi.stubEnv("RAFT_ENABLED", "0");
    expect(raftOpen()).toBe(false);
  });

  it("사면 270P를 쓰고 2시간 증서를 준다 · 남은 못 사고 한 사람 한 장", async () => {
    const a = await account(1000);
    const b = await account(1000);
    const r = await buyRaft(a, 1, 3, T0);
    expect(r.price).toBe(270);
    expect(r.min).toBe(120);
    expect(r.me.points).toBe(730);
    const g = await verifyGrant(env.joinSecret(), r.grant, Math.floor(T0 / 1000));
    expect(g).toMatchObject({ kind: "raft", visitorId: a, ch: 1, n: 3, until: T0 + RAFT_TICKET_MS });
    expect(r.status.slots[2]).toMatchObject({ n: 3, state: "mine", until: T0 + RAFT_TICKET_MS });
    expect(r.status.mine).toMatchObject({ ch: 1, n: 3, renewLeft: RAFT_RENEW_MAX });
    expect(r.status.dayLeftMin).toBe(120);
    expect((await err(buyRaft(b, 1, 3, T0 + 1000)))?.code).toBe("RAFT_SOLD");
    expect((await err(buyRaft(a, 1, 4, T0 + 1000)))?.code).toBe("RAFT_HAVE");
    expect((await err(buyRaft(a, 2, 1, T0 + 1000)))?.message).toBe("1채널 3번 좌대 입장권이 이미 있어요.");
    // 다른 채널 같은 번호는 따로
    expect((await buyRaft(b, 2, 3, T0 + 1000)).status.slots[2].state).toBe("mine");
    const sb = await raftStatus(b, 1, T0 + 2000);
    expect(sb.slots[2]).toMatchObject({ state: "used", name: expect.stringContaining("손님") });
    expect(await pts(b)).toBe(730);
  });

  it("포인트가 모자라면 못 사고 좌대도 안 잡힌다", async () => {
    const a = await account(100);
    expect((await err(buyRaft(a, 3, 1, T0)))?.code).toBe("NOT_ENOUGH_POINTS");
    expect((await raftStatus(a, 3, T0)).slots[0].state).toBe("free");
    expect(await pts(a)).toBe(100);
  });

  it("연장은 끝나기 1분 전부터 · 2시간 늘고 270P · 한 장에 한 번 · 켜 둔 좌대 자동 낚시도 같이 늘린다", async () => {
    const a = await account(5000);
    await buyRaft(a, 4, 2, T0);
    expect((await err(renewRaft(a, T0 + 60_000)))?.code).toBe("RAFT_EARLY");
    const t1 = T0 + RAFT_TICKET_MS - 30_000;
    const r1 = await renewRaft(a, t1);
    expect(r1.price).toBe(270);
    expect(r1.status.mine).toMatchObject({ until: T0 + 2 * RAFT_TICKET_MS, renews: 1, renewLeft: 0 });
    // 한 장에 연장은 한 번 (하루 4시간도 다 썼다)
    const t2 = T0 + 2 * RAFT_TICKET_MS - 10_000;
    expect((await err(renewRaft(a, t2)))?.code).toBe("RAFT_MAX");
  });

  it("하루 4시간: 남은 만큼만 팔고 값은 분 비례 · 다 쓰면 「오늘 좌대 시간을 다 썼어요」", async () => {
    const a = await account(5000);
    const r = await buyRaft(a, 5, 1, T0);
    // 개발 전용: 바로 끝나게 → 끝난 뒤 10분은 같은 채널 다시 못 삼, 다른 채널은 됨
    await raftDevLeft(a, 0, T0 + 1000);
    expect((await err(buyRaft(a, 5, 2, T0 + 2000)))?.code).toBe("RAFT_WAIT");
    const s = await raftStatus(a, 5, T0 + 2000);
    expect(s.mine).toBeNull();
    expect(s.rebuyAt).toBe(T0 + 1000 + RAFT_REBUY_WAIT_MS);
    expect(s.dayLeftMin).toBe(120);
    // 산 시간 전체를 센다 (일찍 끝나도 돌려주지 않음): 2시간 썼으니 남은 2시간
    const r2 = await buyRaft(a, 6, 1, T0 + 3000);
    expect(r2.min).toBe(120);
    await raftDevLeft(a, 0, T0 + 4000);
    const s2 = await raftStatus(a, 7, T0 + 5000);
    expect(s2.dayLeftMin).toBe(0);
    expect(s2.buyPrice).toBe(0);
    expect((await err(buyRaft(a, 7, 1, T0 + 5000)))?.message).toBe(RAFT_DAY_DONE_MSG);
    // 다음 날(KST)은 다시 4시간
    const next = T0 + 24 * 3_600_000;
    const r3 = await buyRaft(a, 7, 1, next);
    expect(r3.min).toBe(120);
    expect(r.price + r2.price + r3.price).toBe(810);
  });

  it("남은 시간이 2시간보다 짧으면 그만큼만 · 값은 10P 단위 비례 (최소 30P)", async () => {
    const a = await account(5000);
    const store = getRaftStore() as unknown as { days: Map<string, number> };
    store.days.set(`20261127:${a}`, 180); // 오늘 3시간 썼다
    const r = await buyRaft(a, 8, 1, T0);
    expect(r.min).toBe(60);
    expect(r.price).toBe(140);
    expect(r.status.mine?.until).toBe(T0 + 60 * 60_000);
    expect(r.status.dayLeftMin).toBe(0);
  });

  it("칭호 기록: 산 수(연장 포함)·산 시간(분)", async () => {
    const a = await account(5000);
    await buyRaft(a, 9, 1, T0);
    await renewRaft(a, T0 + RAFT_TICKET_MS - 1000);
    const st = await getTitleStats().get(a);
    expect(st.rafts).toBe(2);
    expect(st.raftMin).toBe(240);
  });

  it("입장 토큰: 그 채널 입장권만 싣는다, 스위치가 꺼지면 아무것도 안 싣는다", async () => {
    const a = await account(1000);
    expect(await raftClaims(a, 10, T0)).toEqual({ rafts: true });
    await buyRaft(a, 10, 6, T0);
    expect(await raftClaims(a, 10, T0 + 1)).toEqual({ rafts: true, raft: { n: 6, u: T0 + RAFT_TICKET_MS } });
    expect(await raftClaims(a, 11, T0 + 1)).toEqual({ rafts: true });
    vi.stubEnv("RAFT_ENABLED", "0");
    expect(await raftClaims(a, 10, T0 + 1)).toEqual({});
  });
});

describe("좌대 자동 낚시 (15초마다)", () => {
  it("세션 간격: every가 있으면 그 간격으로 센다, parse가 좌대 세션 end를 지킨다", () => {
    const s = { ...newAutoSession(1, "f_1", "reservoir", 1, 0), every: RAFT_AUTO_EVERY_MS, raft: { ch: 1, n: 1 }, end: 600_000 };
    const b = beatAuto(beatAuto(s, 60_000), 120_000);
    expect(autoTriesTotal(b)).toBe(8);
    expect(autoCatchTimes(b, 1, 3)).toEqual([15_000, 30_000, 45_000]);
    const plain = beatAuto(beatAuto(newAutoSession(1, "f_1", "reservoir", 1, 0), 60_000), 120_000);
    expect(autoTriesTotal(plain)).toBe(120_000 / AUTO_FISH_EVERY_MS);
    expect(parseAutoSession(JSON.stringify(s))?.end).toBe(600_000);
    expect(parseAutoSession(JSON.stringify({ ...s, raft: undefined }))?.end).toBe(AUTO_NO_END);
  });

  it("입장권 없이 좌대 자리에서 켜면 409, 내 좌대면 15초 · 입장권 끝에 끝난다", async () => {
    const a = await account(1000);
    const spot = campRaftSpots(2)[0];
    expect((await err(raftAutoGate(a, spot, 12, T0)))?.code).toBe("RAFT_TICKET");
    expect(await raftAutoGate(a, "f_1040_480", 12, T0)).toBeNull();
    const now = Date.now();
    await buyRaft(a, 12, 2, now);
    expect((await err(raftAutoGate(a, campRaftSpots(3)[0], 12, now)))?.code).toBe("RAFT_TICKET");
    expect((await err(raftAutoGate(a, spot, 13, now)))?.code).toBe("RAFT_TICKET");
    const r = await startAutoFish(a, spot, 12, now);
    expect(r.auto).toMatchObject({ raft: 2, every: RAFT_AUTO_EVERY_MS, endsAt: now + RAFT_TICKET_MS });
    const raw = parseAutoSession(await getForageStore().autoGet(a));
    expect(raw).toMatchObject({ every: RAFT_AUTO_EVERY_MS, raft: { ch: 12, n: 2 }, end: now + RAFT_TICKET_MS });
    // 끝난 뒤 정산하면 ended "raft"
    const done = await syncAutoFish(a, now + RAFT_TICKET_MS + 1000);
    expect(done.auto).toBeNull();
    expect(done.ended).toBe("raft");
  });

  it("연장하면 켜 둔 좌대 자동 낚시 끝도 늘어난다", async () => {
    const a = await account(1000);
    const now = Date.now();
    await buyRaft(a, 14, 1, now);
    await startAutoFish(a, campRaftSpots(1)[0], 14, now);
    await raftDevLeft(a, 30_000, now + 1000);
    expect(parseAutoSession(await getForageStore().autoGet(a))?.end).toBe(now + 31_000);
    await renewRaft(a, now + 2000);
    expect(parseAutoSession(await getForageStore().autoGet(a))?.end).toBe(now + 31_000 + RAFT_TICKET_MS);
  });
});
