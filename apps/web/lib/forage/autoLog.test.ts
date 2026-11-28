import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PeerWhere } from "@tomb/protocol";
import type { MoveLogEntry } from "../moveLog";

// 11/28 관리자 접속 기록: 자동 낚시 시작·해제 (직접 끔·새로 다시 켬·직접 던짐). 켜져 있던 세션을 끝냈을 때만 해제 한 줄

const where = vi.hoisted(() => ({ value: null as Record<string, PeerWhere> | null }));
vi.mock("../ban", async (orig) => ({ ...(await orig<typeof import("../ban")>()), whereOf: vi.fn(async () => where.value) }));

const { castLine, startAutoFish, stopAutoFish } = await import("./service");
const { getOpsLog } = await import("../store/opsLog");
const { describeLog } = await import("../logText");

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.clearAllMocks());

const MIN = 60_000;
const PIER = "f_1172_932"; // 마을 호수 잔교 끝
const T0 = Date.UTC(2026, 10, 12, 3, 0);
const acct = () => `t-alog-${nanoid(8)}`;
/** 최신 먼저 */
const rows = async (a: string) => (await getOpsLog().ofAccount("conn", a)).filter((e): e is MoveLogEntry => e.k === "mv");

describe("자동 낚시 시작·해제 기록", () => {
  it("켜면 시작(자리·채널), 끄면 해제(직접 끔 · 자리 · 정산 수). 꺼져 있을 때 끄기는 줄을 남기지 않는다", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 2, T0);
    await stopAutoFish(a, T0 + 30 * MIN);
    await stopAutoFish(a, T0 + 31 * MIN);
    const log = await rows(a);
    expect(log.map((e) => [e.m, e.via ?? null])).toEqual([
      ["fishStop", "fishSelf"],
      ["fishStart", null],
    ]);
    expect(log[1]).toEqual(expect.objectContaining({ spot: PIER, ch: 2, src: "s" }));
    expect(log[0]).toEqual(expect.objectContaining({ spot: PIER, ch: 2, fish: expect.any(Number) }));
    expect(describeLog("conn", log[1]).text).toMatch(/^자동 낚시 시작 \(마을 호수 \d+번 자리 · 2채널\)$/);
    expect(describeLog("conn", log[0]).text).toMatch(/^자동 낚시 해제 \(직접 끔 · 움직이거나 일어남 · 마을 호수 \d+번 자리 · (\d+마리 정산|잡은 것 없음)\)$/);
  });

  it("켜 둔 채 다시 켜면 「새로 다시 켬」 해제 뒤 시작, 직접 던지면 「직접 낚시를 던짐」", async () => {
    const a = acct();
    await startAutoFish(a, PIER, 1, T0);
    await startAutoFish(a, PIER, 1, T0 + 5 * MIN);
    await castLine(a, PIER, T0 + 10 * MIN);
    expect((await rows(a)).map((e) => [e.m, e.via ?? null])).toEqual([
      ["fishStop", "fishCast"],
      ["fishStart", null],
      ["fishStop", "fishRestart"],
      ["fishStart", null],
    ]);
  });
});
