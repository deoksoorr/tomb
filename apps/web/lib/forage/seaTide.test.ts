import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SEA_TIDE_OUT_MSG, seaFishDryAt, seaFishingSpotById } from "@tomb/protocol";
import { CastSchema } from "./schemas";
import { castLine, startAutoFish, syncAutoFish } from "./service";
import { getForageStore } from "./store";

// 11/16 바닷가 갯바위 낚시 물때 규칙 (서버): 찌 자리가 물속이 아니면 던지기·자동 낚시 켜기를 막고, 자동 낚시는 물이 빠지는 때 끝나요.
// 로컬 메모리 저장소. 시각은 now 인자로 흘려요 (한국 자정 = 물때 0분, 만조)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;
const HIGH = Date.UTC(2026, 10, 15, 15, 0); // 11/16 0시 KST
const ROCK = "f_1084_528"; // 방파제 쪽 바위 곶 (r11: 썰물 18.2분째에 말라요)
const PIER = "f_604_674"; // 선착장 끝 (늘 물)
const acct = () => `t-seatide-${nanoid(8)}`;

describe("갯바위 낚시 물때 (서버)", () => {
  it("바닷가 자리 id는 입력 검증을 통과해요", () => {
    expect(CastSchema.safeParse({ spot: ROCK }).success).toBe(true);
    expect(CastSchema.safeParse({ spot: PIER }).success).toBe(true);
  });

  it("만조엔 던질 수 있고, 물이 빠진 뒤엔 TIDE_OUT, 밀물에 다시 돼요", async () => {
    await expect(castLine(acct(), ROCK, HIGH + 10 * MIN)).resolves.toHaveProperty("ticket");
    await expect(castLine(acct(), ROCK, HIGH + 60 * MIN)).rejects.toMatchObject({ status: 409, code: "TIDE_OUT", message: SEA_TIDE_OUT_MSG });
    await expect(castLine(acct(), ROCK, HIGH + 170 * MIN)).resolves.toHaveProperty("ticket");
  });

  it("선착장 끝은 간조에도 던질 수 있어요", async () => {
    await expect(castLine(acct(), PIER, HIGH + 90 * MIN)).resolves.toHaveProperty("ticket");
  });

  it("자동 낚시도 마른 자리에선 못 켜고, 켜 둔 건 물이 빠지는 때 끝나요 (ended tide)", async () => {
    await expect(startAutoFish(acct(), ROCK, null, HIGH + 90 * MIN)).rejects.toMatchObject({ code: "TIDE_OUT" });
    const a = acct();
    await startAutoFish(a, ROCK, null, HIGH + 10 * MIN);
    const s = JSON.parse((await getForageStore().autoGet(a))!) as { end: number; tide?: true };
    expect(s.end).toBe(seaFishDryAt(seaFishingSpotById(ROCK)!, HIGH + 10 * MIN));
    expect(s.tide).toBe(true);
    const mid = await syncAutoFish(a, HIGH + 15 * MIN);
    expect(mid.auto).not.toBeNull();
    const r = await syncAutoFish(a, HIGH + 40 * MIN);
    expect(r.auto).toBeNull();
    expect(r.ended).toBe("tide");
  });
});
