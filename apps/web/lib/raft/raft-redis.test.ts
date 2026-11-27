import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { RAFT_REBUY_WAIT_MS, RAFT_TICKET_MS } from "@tomb/protocol";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { getTitleStats } from "../store/titleStats";
import { getRaftStore, RedisRaft } from "./store";

// 11/27 좌대 입장권 Lua 계약: 실제 Redis(일회용 DB)에서만 (메모리 쪽은 raft.test.ts)
const conn = env.redis();

describe.skipIf(!conn)("좌대 입장권 저장소 (실제 Redis)", () => {
  const store = getRaftStore();
  const accounts = getAccounts();
  const now = Date.now();
  async function account(points: number): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, now);
    await accounts.adjustPoints(id, points);
    return id;
  }
  const ch = 40 + Math.floor(Math.random() * 50);

  it("사기: 포인트·기록·경제 통계가 한 번에, 남은 못 사고 한 사람 한 장", async () => {
    expect(store).toBeInstanceOf(RedisRaft);
    const a = await account(1000);
    const b = await account(100);
    const r = await store.buy(a, "검수|이름", ch, 2, now);
    expect(r).toEqual({ ok: true, until: now + RAFT_TICKET_MS, min: 120, price: 270, points: 730, renews: 0 });
    expect((await accounts.get(a, kstDay(now), now)).points).toBe(730);
    const board = await store.board(ch);
    expect(board).toEqual([{ n: 2, acct: a, until: now + RAFT_TICKET_MS, renews: 0, start: now, name: "검수|이름" }]);
    expect(await store.buy(a, "x", ch, 3, now + 1)).toEqual({ ok: false, why: "HAVE", n: 2, ch, until: now + RAFT_TICKET_MS });
    expect(await store.buy(b, "x", ch, 2, now + 1)).toEqual({ ok: false, why: "SOLD", until: now + RAFT_TICKET_MS });
    expect(await store.buy(b, "x", ch, 4, now + 1)).toEqual({ ok: false, why: "POINTS" });
    expect(await store.board(ch)).toHaveLength(1);
    const m = await store.mine(a, ch, kstDay(now));
    expect(m).toEqual({ own: { ch, n: 2, until: now + RAFT_TICKET_MS, renews: 0 }, coolUntil: now + RAFT_TICKET_MS, used: 120 });
    const st = await getTitleStats().get(a);
    expect([st.rafts, st.raftMin]).toEqual([1, 120]);
    // 사용 기록 (최근 포인트 사용)
    const raw = (await accounts.get(a, kstDay(now), now)) as unknown as { ledger?: { amount: number; reason: string }[] };
    if (raw.ledger) expect(raw.ledger[0]).toMatchObject({ amount: -270 });
  });

  it("연장: 1분 전부터 · 두 번까지 · 하루 4시간 넘으면 남은 만큼 (값 비례)", async () => {
    const a = await account(5000);
    const c = ch + 1;
    await store.buy(a, "검수", c, 5, now);
    expect(await store.renew(a, now + 1000)).toEqual({ ok: false, why: "EARLY", until: now + RAFT_TICKET_MS });
    const r1 = await store.renew(a, now + RAFT_TICKET_MS - 20_000);
    expect(r1).toEqual({ ok: true, until: now + 2 * RAFT_TICKET_MS, min: 120, price: 270, points: 4460, renews: 1 });
    // 하루 4시간을 다 썼다
    expect(await store.renew(a, now + 2 * RAFT_TICKET_MS - 20_000)).toEqual({ ok: false, why: "DAY" });
    expect((await store.board(c))[0]).toMatchObject({ until: now + 2 * RAFT_TICKET_MS, renews: 1, name: "검수" });
  });

  it("끝난 뒤 10분은 같은 채널 다시 못 삼 · 하루 남은 시간이 짧으면 분 비례", async () => {
    const a = await account(5000);
    const c = ch + 2;
    const day = kstDay(now);
    const r = new (await import("@upstash/redis")).Redis({ url: conn!.url, token: conn!.token });
    await r.set(`raft:day:${day}:${a}`, 180);
    const b1 = await store.buy(a, "검수", c, 1, now);
    expect(b1).toMatchObject({ ok: true, min: 60, price: 140 });
    const own = await store.devLeft(a, 0, now + 1000);
    expect(own).toEqual({ ch: c, n: 1, until: now + 1000, renews: 0 });
    expect(await store.buy(a, "검수", c, 2, now + 2000)).toEqual({ ok: false, why: "WAIT", until: now + 1000 + RAFT_REBUY_WAIT_MS });
    expect(await store.buy(a, "검수", c + 1, 2, now + 2000)).toEqual({ ok: false, why: "DAY" });
    await r.set(`raft:day:${day}:${a}`, 230);
    expect(await store.buy(a, "검수", c + 1, 2, now + 2000)).toMatchObject({ ok: true, min: 10, price: 30 });
    // 끝난 것은 다음 사기 때 표에서 지운다
    const b = await account(1000);
    expect(await store.buy(b, "둘", c, 3, now + 3000)).toMatchObject({ ok: true });
    expect((await store.board(c)).map((h) => h.n)).toEqual([3]);
  });
});
