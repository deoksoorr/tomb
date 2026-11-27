import { nanoid } from "nanoid";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerWhere } from "@tomb/protocol";
import { AUTO_FISH_EVERY_MS } from "./auto";
import { autoLeftSpot, autoSpotMap } from "./autoSpot";
import { getForageStore } from "./store";

// 11/27 자동 낚시는 켠 자리(맵·채널)를 떠나는 순간 끝난다 (집·방·채널·맵·끊김). 실시간 서버 위치(whereOf)는 가짜로 준다

const where = vi.hoisted(() => ({ value: null as Record<string, PeerWhere> | null }));
vi.mock("../ban", async (orig) => ({ ...(await orig<typeof import("../ban")>()), whereOf: vi.fn(async () => where.value) }));

const { beatAutoFishAt, endAutoFishOnLeave, startAutoFish, syncAutoFish } = await import("./service");
const { getOpsLog } = await import("../store/opsLog");

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
beforeEach(() => {
  where.value = null;
});
afterEach(() => vi.clearAllMocks());

const MIN = 60_000;
const PIER = "f_1172_932"; // 마을 호수 잔교 끝
const T0 = Date.UTC(2026, 10, 12, 3, 0);
const acct = () => `t-leave-${nanoid(8)}`;
const at = (ch: number, map?: "camp" | "sea", away?: true): PeerWhere => ({ ch, sid: 1, x: 1172, y: 940, ...(map ? { map } : {}), ...(away ? { away } : {}) });
const session = async (a: string) => JSON.parse((await getForageStore().autoGet(a)) ?? "null") as { beat: number; segs: [number, number][] } | null;
const aliveMs = (s: { segs: [number, number][] }) => s.segs.reduce((n, [x, y]) => n + (y - x), 0);
const stops = async (a: string) => (await getOpsLog().ofAccount("conn", a)).filter((e) => e.k === "mv");

describe("autoSpot 규칙", () => {
  it("자리 맵: 마을·캠핑장·바닷가·배 위", () => {
    expect(autoSpotMap(PIER)).toBe("village");
    expect(autoSpotMap("boat:lake")).toBe("village");
    expect(autoSpotMap("boat:reservoir")).toBe("camp");
    expect(autoSpotMap("nope")).toBeNull();
  });
  it("채널·실내(집·버스·사냥터)·다른 맵이면 떠남, 연결 없음·모름은 판단하지 않음", () => {
    const s = { spot: PIER, ch: 1 };
    expect(autoLeftSpot(s, true, at(1))).toBeNull();
    expect(autoLeftSpot(s, true, at(2))).toBe("fishChannel");
    expect(autoLeftSpot(s, true, at(1, undefined, true))).toBe("fishAway");
    expect(autoLeftSpot(s, true, at(1, "camp"))).toBe("fishMap");
    expect(autoLeftSpot(s, true, undefined)).toBeNull();
    expect(autoLeftSpot(s, false, at(2))).toBeNull();
  });
});

describe("자리를 떠나면 서버가 자동 낚시를 끈다", () => {
  it("집 들어감(친구 집·내 집 가기): 그 순간까지 정산하고 끝, 기록 한 줄", async () => {
    const a = acct();
    where.value = { [a]: at(1) };
    await startAutoFish(a, PIER, 1, T0);
    await syncAutoFish(a, T0 + 3 * MIN);
    const r = await endAutoFishOnLeave(a, T0 + 6 * MIN, "fishHouse");
    expect(r?.ended).toBe("stop");
    expect(await getForageStore().autoGet(a)).toBeNull();
    const log = await stops(a);
    expect(log[0]).toEqual(expect.objectContaining({ m: "fishStop", via: "fishHouse", src: "s" }));
    // 다시 불러도 세션이 없으니 아무 일 없다 (방 안 재접속)
    expect(await endAutoFishOnLeave(a, T0 + 7 * MIN, "fishRoom")).toBeNull();
  });

  it("맵을 옮긴 뒤의 정산(버스·순간이동 — 웹을 안 거친다): 마지막 신호까지만 치고 끝 (그 뒤 시간은 안 친다)", async () => {
    const a = acct();
    where.value = { [a]: at(1) };
    await startAutoFish(a, PIER, 1, T0);
    await syncAutoFish(a, T0 + 3 * MIN);
    const beat = (await session(a))!.beat;
    // 바닷가로 간 뒤 30분 뒤에 정산이 와도 3분까지만
    where.value = { [a]: at(1, "sea") };
    const r = await syncAutoFish(a, T0 + 33 * MIN);
    expect(r.auto).toBeNull();
    expect(r.ended).toBe("stop");
    expect(beat).toBe(T0 + 3 * MIN);
    expect((await stops(a))[0]).toEqual(expect.objectContaining({ via: "fishMap" }));
  });

  it("머무르기 신호: 실내(집·버스)면 끄고, 연결이 없으면 늘리지 않고, 그대로면 늘린다", async () => {
    const a = acct();
    where.value = { [a]: at(1) };
    await startAutoFish(a, PIER, 1, T0);
    await beatAutoFishAt(a, T0 + 5 * MIN);
    expect(aliveMs((await session(a))!)).toBe(5 * MIN);
    // 연결 없음(끊김·탭 강제 종료): 신호를 늘리지 않는다
    where.value = {};
    await beatAutoFishAt(a, T0 + 10 * MIN);
    expect((await session(a))!.beat).toBe(T0 + 5 * MIN);
    // 실내
    where.value = { [a]: at(1, undefined, true) };
    await beatAutoFishAt(a, T0 + 12 * MIN);
    expect(await getForageStore().autoGet(a)).toBeNull();
  });

  it("다른 채널 입장 토큰: 지금 끈다 / 같은 채널 재접속(유예 안 — 아직 접속 중)은 이어진다", async () => {
    const a = acct();
    where.value = { [a]: at(1) };
    await startAutoFish(a, PIER, 1, T0);
    expect(await endAutoFishOnLeave(a, T0 + MIN, null, undefined, { channel: 1 })).toBeNull();
    expect(await endAutoFishOnLeave(a, T0 + MIN, null, undefined, { channel: "auto" })).toBeNull();
    const r = await endAutoFishOnLeave(a, T0 + 2 * MIN, null, undefined, { channel: 2 });
    expect(r?.ended).toBe("stop");
    expect((await stops(a))[0]).toEqual(expect.objectContaining({ via: "fishChannel" }));
  });

  it("강제 종료 뒤 다시 들어옴(재접속 유예가 지나 연결 없음): 끊긴 동안은 안 치고 마지막 신호까지만", async () => {
    const a = acct();
    where.value = { [a]: at(1) };
    await startAutoFish(a, PIER, 1, T0);
    await syncAutoFish(a, T0 + 4 * MIN);
    // 탭을 강제로 닫고 30분 뒤 같은 채널로 다시 들어온다 (예전에는 40분 안이면 그 사이도 쳤다)
    where.value = {};
    const r = await endAutoFishOnLeave(a, T0 + 34 * MIN, null, undefined, { channel: 1 });
    expect(r?.ended).toBe("stop");
    expect((await stops(a))[0]).toEqual(expect.objectContaining({ via: "fishQuit" }));
    // 4분어치(8번 시도)만 — 받은 것 + 놓친 것 ≤ 8
    expect(r!.items.length + r!.missed + r!.gear.length).toBeLessThanOrEqual(Math.floor((4 * MIN) / AUTO_FISH_EVERY_MS));
  });

  it("실시간 서버에 닿지 못하면 신호는 예전처럼 늘리고, 집 들어감은 그래도 끈다", async () => {
    const a = acct();
    where.value = null;
    await startAutoFish(a, PIER, 1, T0);
    await beatAutoFishAt(a, T0 + 5 * MIN);
    expect((await session(a))!.beat).toBe(T0 + 5 * MIN);
    expect((await endAutoFishOnLeave(a, T0 + 6 * MIN, "fishHouse"))?.ended).toBe("stop");
  });
});
