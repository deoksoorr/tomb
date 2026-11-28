import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { campRaftSpots, RAFT_AUTO_EVERY_MS } from "@tomb/protocol";
import { env } from "../env";
import { buyRaft } from "../raft/service";
import { getAccounts } from "../store";
import { autoCatchLine, autoChipText, autoTip, fishPanelOf, gotCosmetic, isRaftAutoOnly, RAFT_AUTO_ONLY_LINE, RAFT_AUTO_ONLY_MSG, raftGearText } from "./auto";
import { castLine, reelIn, startAutoFish, syncAutoFish } from "./service";
import { getForageStore } from "./store";
import { signForageTicket } from "./ticket";

// 11/28 운영자 「좌대에서는 자동낚시만 가능하게」: 좌대 낚시 자리에서는 찌 던지기(직접 낚시)를 서버가 막고, 낚시 창은 자동 낚시만 보인다.
// 같이: 자동 낚시 알림 한 줄로 줄이기 · 최대어 안내는 도움말에만 · 좌대 「속도 2배」 · 꾸미기 받으면 내 정보 새로

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "RAFT_ENABLED"]) vi.stubEnv(k, "");
  vi.stubEnv("CAMP_ENABLED", "1");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.stubEnv("RAFT_ENABLED", ""));

const RAFT = campRaftSpots(2)[0];
const PIER = "f_1040_480";
const err = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string; status?: number }) => e);

async function account(points = 1000): Promise<string> {
  const id = nanoid();
  await getAccounts().enter(id, { name: `손님${id.slice(0, 4)}`, color: "#9fc5a8", body: "hood" }, Date.now());
  await getAccounts().adjustPoints(id, points);
  return id;
}

describe("서버: 좌대 자리는 직접 낚시 막기", () => {
  it("좌대 자리 찌 던지기 → 409 RAFT_AUTO_ONLY (입장권이 있어도, 좌대 판매가 꺼진 서버여도)", async () => {
    const a = await account();
    const now = Date.now();
    await buyRaft(a, 21, 2, now);
    const e = await err(castLine(a, RAFT, now));
    expect(e).toMatchObject({ code: "RAFT_AUTO_ONLY", message: RAFT_AUTO_ONLY_MSG, status: 409 });
    vi.stubEnv("RAFT_ENABLED", "0");
    expect((await err(castLine(a, RAFT, now)))?.code).toBe("RAFT_AUTO_ONLY");
    for (const n of [1, 2, 3, 4, 5, 6]) expect((await err(castLine(a, campRaftSpots(n)[0], now)))?.code).toBe("RAFT_AUTO_ONLY");
  });

  it("보통 자리(잔교·둑)는 그대로 던지고 감을 수 있다", async () => {
    const a = await account();
    const now = Date.now();
    const c = await castLine(a, PIER, now);
    expect(c.ticket).toBeTruthy();
    const r = await reelIn(a, c.ticket, true, now + c.biteInMs + c.reelMs + 100);
    expect(r.result ?? r.gear).toBeTruthy();
  });

  it("좌대 자리 표(막기 전에 받은 것)로 감기 → 409 (대물·월척·오늘 미션·최대어 길 모두 막힘)", async () => {
    const a = await account();
    const now = Date.now();
    const nonce = nanoid(16);
    await getForageStore().begin(a, nonce, JSON.stringify({ k: "fish", sp: "f_crucian", sz: 300 }), 600, "h", 9999);
    const ticket = await signForageTicket(env.sessionSecret(), { n: nonce, a, k: "fish", x: RAFT, t: now, b: now + 1000, p: 1 });
    expect((await err(reelIn(a, ticket, true, now + 30_000)))?.code).toBe("RAFT_AUTO_ONLY");
    // 그 표는 쓴 것으로 끝난다 (다시 보내도 못 받는다)
    expect((await err(reelIn(a, ticket, true, now + 31_000)))?.code).toBe("TICKET_USED");
  });

  it("좌대 자동 낚시는 그대로 (입장권 → 15초 간격), 켜 둔 자동 낚시는 막힌 찌 던지기에 꺼지지 않는다", async () => {
    const a = await account();
    const now = Date.now();
    await buyRaft(a, 22, 2, now);
    const r = await startAutoFish(a, RAFT, 22, now);
    expect(r.auto).toMatchObject({ raft: 2, every: RAFT_AUTO_EVERY_MS });
    expect((await err(castLine(a, RAFT, now + 1000)))?.code).toBe("RAFT_AUTO_ONLY");
    expect((await syncAutoFish(a, now + 60_000)).auto).not.toBeNull();
  });
});

describe("낚시 창·알림 글귀", () => {
  it("좌대 자리면 찌 던지기 없이 한 줄 안내, 보통 자리는 그대로", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(isRaftAutoOnly(campRaftSpots(n)[0])).toBe(true);
      expect(fishPanelOf(campRaftSpots(n)[0])).toEqual({ cast: false, note: RAFT_AUTO_ONLY_LINE });
    }
    expect(RAFT_AUTO_ONLY_LINE).toBe("좌대에서는 자동 낚시만 할 수 있고, 속도는 일반 자리의 2배예요.");
    for (const spot of [PIER, "f_998_252", "boat:reservoir", "f_484_238"]) expect(fishPanelOf(spot)).toEqual({ cast: true, note: null });
  });

  it("[자동 낚시 켜기] 도움말: 초 숫자 없이 짧게, 최대어 안내는 여기 한 곳", () => {
    expect(autoTip("river", false)).toBe("자리를 비워도 접속해 있는 동안 자동으로 낚아요. 자동으로 낚은 물고기는 최대어 순위에 안 올라가요.");
    expect(autoTip("reservoir", true)).toBe("자리를 비워도 접속해 있는 동안 자동으로 낚아요. 좌대에서는 속도 2배예요. 최대어 순위와 캠핑장 희귀 물고기는 좌대 밖에서 직접 낚아야 해요.");
    expect(autoTip("reservoir", false)).toBe("자리를 비워도 접속해 있는 동안 자동으로 낚아요. 최대어 순위와 캠핑장 희귀 물고기는 직접 낚아야 해요.");
    for (const w of ["river", "sea", "valley", "reservoir"] as const) for (const raft of [false, true]) expect(autoTip(w, raft)).not.toMatch(/초마다|\d+초/);
  });

  it("좌대 칩: 속도 2배", () => {
    expect(autoChipText(3, null, false, RAFT_AUTO_EVERY_MS)).toEqual({ head: "좌대 자동 낚시 중 · 속도 2배", count: "3마리", next: "" });
  });

  it("자동 낚시 알림 한 줄: 한 마리 「블루길 9.7cm」, 새 도감이면 「 · 새 도감 +3P」, 여러 마리 「3마리 · 블루길 외 2」, 없으면 빈 줄", () => {
    const name = (id: string) => ({ a: "블루길", b: "붕어", c: "메기" })[id] ?? id;
    expect(autoCatchLine([{ id: "a", isNew: false, size: 97 }], name)).toBe("블루길 9.7cm");
    expect(autoCatchLine([{ id: "a", isNew: true, size: 97 }], name, { earned: 3, pending: 0 })).toBe("블루길 9.7cm · 새 도감 +3P");
    expect(autoCatchLine([{ id: "a", isNew: true, size: 97 }], name, { earned: 0, pending: 3 })).toBe("블루길 9.7cm · 새 도감 (보상은 도감 창에서)");
    expect(autoCatchLine([{ id: "b", isNew: false, size: 300, grade: 2 }], name)).toBe("붕어 30.0cm 월척");
    expect(autoCatchLine([{ id: "b", isNew: false, size: 120 }, { id: "a", isNew: true, size: 97 }, { id: "c", isNew: false, size: 400 }], name, { earned: 6, pending: 0 })).toBe("3마리 · 블루길 외 2 · 새 도감 +6P");
    expect(autoCatchLine([{ id: "b", isNew: false, size: 120 }, { id: "c", isNew: false, size: 400 }], name)).toBe("2마리 · 메기 외 1");
    expect(autoCatchLine([], name)).toBe("");
  });

  it("꾸미기 알림은 따로: 좌대 코디 「붕어 털모자」 7일 획득", () => {
    expect(raftGearText({ name: "붕어 털모자", tier: "d7" })).toBe("좌대 코디 「붕어 털모자」 7일 획득");
    expect(raftGearText({ name: "물빛 삿갓", tier: "perm" })).toBe("좌대 코디 「물빛 삿갓」 영구 획득");
  });

  it("꾸미기를 받은 응답이면 내 정보를 새로 받는다 (물에 빠진 꾸미기 kept · 좌대 코디 — 자동 정산·직접 낚시)", () => {
    expect(gotCosmetic({ gear: [], raftGear: [] })).toBe(false);
    expect(gotCosmetic({ gear: [{ kept: false }] })).toBe(false);
    expect(gotCosmetic({ gear: [{ kept: true }] })).toBe(true);
    expect(gotCosmetic({ gear: [], raftGear: [{}] })).toBe(true);
    expect(gotCosmetic({ gear: { kept: true } })).toBe(true);
    expect(gotCosmetic({ gear: undefined })).toBe(false);
  });
});

describe("개발 전용 꾸미기 확인 (lib/forage/gearDev — 운영은 늘 꺼짐)", () => {
  it("켜면 좌대 자동 낚시로 걸린 한 마리마다 좌대 코디(7일), 끄면 원래 확률", async () => {
    const { setGearForced } = await import("./gearDev");
    const a = await account();
    const now = Date.now();
    await buyRaft(a, 23, 2, now);
    await startAutoFish(a, RAFT, 23, now);
    setGearForced(a, "raft", true);
    const r = await syncAutoFish(a, now + 10 * 60_000);
    setGearForced(a, "raft", false);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.raftGear?.length).toBeGreaterThan(0);
    expect(r.raftGear!.every((g) => g.tier === "d7")).toBe(true);
    const acc = await getAccounts().get(a, "20261128", now);
    expect([...acc.equipped, ...acc.stash].some((e) => e.itemId === r.raftGear![0].id)).toBe(true);
  });
});
