import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GIFT_MAX_TARGETS, GiftSendSchema, sendGift } from "./gifts";
import { getGifts } from "./store";

// 11번 선물 보내기 검증: 아이템별 기간(꾸미기만, 정해진 값만)

const base = { target: "all", note: "선물이에요" };
const parse = (items: unknown[]) =>
  GiftSendSchema.safeParse({ ...base, items });

describe("GiftSendSchema 기간", () => {
  it("꾸미기는 3일·7일·30일·영구를 고를 수 있고, 기간 선물은 개수가 1로 맞춰진다", () => {
    const r = parse([
      { itemId: "hat_straw", count: 5, term: "7d" },
      { itemId: "pet_ghost", count: 1, term: "perm" },
      { itemId: "hand_lantern", count: 1, term: "30d" },
      { itemId: "neck_scarf", count: 1, term: "3d" },
    ]);
    expect(r.success).toBe(true);
    expect(r.data?.items[0]).toEqual({
      itemId: "hat_straw",
      count: 1,
      term: "7d",
    });
    expect(r.data?.items.map((i) => i.term)).toEqual([
      "7d",
      "perm",
      "30d",
      "3d",
    ]);
  });

  it("기간이 없거나 null이면 옛 선물과 같은 모양 (term 없음), 같은 아이템은 개수를 합친다", () => {
    const r = parse([
      { itemId: "fw_small", count: 2 },
      { itemId: "fw_small", count: 3, term: null },
      { itemId: "hat_straw", count: 2 },
      { itemId: "hat_straw", count: 1, term: "3d" },
    ]);
    expect(r.success).toBe(true);
    expect(r.data?.items).toEqual([
      { itemId: "fw_small", count: 5 },
      { itemId: "hat_straw", count: 2 },
      { itemId: "hat_straw", count: 1, term: "3d" },
    ]);
  });

  it("허용되지 않은 기간·꾸미기가 아닌 아이템의 기간은 거절한다", () => {
    for (const term of ["1d", "24h", "forever", 7, ""])
      expect(parse([{ itemId: "hat_straw", count: 1, term }]).success).toBe(
        false,
      );
    expect(parse([{ itemId: "fw_small", count: 1, term: "7d" }]).success).toBe(
      false,
    );
    expect(
      parse([{ itemId: "decor_candles", count: 1, term: "perm" }]).success,
    ).toBe(false);
  });
});

// 여러 계정에 한 번에: 같은 id는 한 번만, 한 명이면 target 하나로, 최대 GIFT_MAX_TARGETS명
const aid = (n: number) => `acct${String(n).padStart(17, "0")}`;
const sendTo = (body: object) =>
  GiftSendSchema.safeParse({ note: "선물이에요", points: 10, ...body });
const firstMessage = (r: ReturnType<typeof sendTo>) =>
  r.success ? null : r.error.issues[0]?.message;

describe("GiftSendSchema 여러 계정", () => {
  // 발송은 늘 메모리 저장소로 (Redis 환경변수가 있어도 쓰지 않는다)
  beforeEach(() => {
    for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
  });
  afterEach(() => void vi.unstubAllEnvs());

  it("같은 계정은 한 번만 남기고, 첫 사람이 target·targetName이 된다", () => {
    const r = sendTo({
      targets: [
        { id: aid(1), name: "진순" },
        { id: aid(2), name: "말순" },
        { id: aid(1), name: "진순" },
        { id: aid(3) },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      target: aid(1),
      targetName: "진순",
      targets: [
        { id: aid(1), name: "진순" },
        { id: aid(2), name: "말순" },
        { id: aid(3), name: null },
      ],
    });
  });

  it("target과 targets가 함께 오면 target을 맨 앞에 합치고, 한 명뿐이면 target 하나로 맞춘다", () => {
    const both = sendTo({
      target: aid(9),
      targetName: "구순",
      targets: [{ id: aid(1), name: "진순" }],
    });
    expect(both.data?.targets?.map((t) => t.id)).toEqual([aid(9), aid(1)]);
    const one = sendTo({ targets: [{ id: aid(1), name: "진순" }, { id: aid(1), name: "진순" }] });
    expect(one.success).toBe(true);
    expect(one.data).toMatchObject({ target: aid(1), targetName: "진순" });
    expect(one.data?.targets).toBeUndefined();
    // 예전처럼 한 계정 id만 보내도 그대로
    expect(sendTo({ target: aid(2), targetName: "말순" }).data).toMatchObject({ target: aid(2), targetName: "말순" });
  });

  it("대상이 없거나, 전체와 함께 고르거나, 최대 인원을 넘으면 거절한다", () => {
    expect(firstMessage(sendTo({}))).toBe("받는 사람을 골라 주세요.");
    expect(firstMessage(sendTo({ targets: [] }))).toBe("받는 사람을 골라 주세요.");
    expect(sendTo({ target: "all", targets: [{ id: aid(1) }] }).success).toBe(false);
    expect(sendTo({ targets: [{ id: "짧은id" }] }).success).toBe(false);
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: aid(i) }));
    expect(sendTo({ targets: many(GIFT_MAX_TARGETS) }).success).toBe(true);
    expect(firstMessage(sendTo({ targets: many(GIFT_MAX_TARGETS + 1) }))).toBe(
      `한 번에 ${GIFT_MAX_TARGETS}명까지 보낼 수 있어요.`,
    );
    // 중복을 빼면 최대 인원 안이면 받는다
    expect(
      sendTo({ targets: [...many(GIFT_MAX_TARGETS), ...many(10)] }).success,
    ).toBe(true);
  });

  it("sendGift: 여러 계정이면 발송 기록 한 줄에 받는 계정 id를 모두 남기고 각 선물함에 들어간다", async () => {
    const r = sendTo({
      targets: [
        { id: aid(1), name: "진순" },
        { id: aid(2), name: "말순" },
        { id: aid(3), name: "삼순" },
      ],
    });
    const gift = await sendGift(r.data!, 1_800_000_000_000);
    expect(gift).toMatchObject({
      target: aid(1),
      targetName: "진순",
      targets: [aid(1), aid(2), aid(3)],
    });
    const log = await getGifts().log(10);
    expect(log.filter((x) => x.id === gift.id)).toHaveLength(1);
    for (const id of [aid(1), aid(2), aid(3)])
      expect(
        (await getGifts().inbox(id, 0, 1_800_000_000_001)).map((x) => x.id),
      ).toContain(gift.id);
    // 한 명에게 보낸 선물엔 목록이 없다
    const single = await sendGift(sendTo({ target: aid(4) }).data!, 1_800_000_000_000);
    expect(single.targets).toBeUndefined();
  });
});
