import { describe, expect, it } from "vitest";
import { INQUIRY_KEEP, MemoryInquiries, type InquiryRecord } from "./inquiries";

// 문의함 (메모리만. Redis 구현은 운영·테스트 서버 저장소를 건드리지 않게 여기서 돌리지 않는다)

const rec = (i: number, over: Partial<InquiryRecord> = {}): InquiryRecord => ({
  id: `q${i}`,
  at: 1_000 + i,
  accountId: `acc${i}`,
  name: `유령${i}`,
  category: "bug",
  message: `첫 줄 ${i}\n둘째 줄`,
  userAgent: "TestBrowser/1.0",
  ...over,
});

describe("문의함 (메모리)", () => {
  it("저장하면 새 문의, 최신 순으로 돌려준다", async () => {
    const s = new MemoryInquiries();
    await s.add(rec(1, { contact: "me@example.com", channel: 3 }));
    await s.add(rec(2));
    const rows = await s.list();
    expect(rows.map((r) => r.id)).toEqual(["q2", "q1"]);
    expect(rows[1]).toMatchObject({ status: "new", contact: "me@example.com", channel: 3, message: "첫 줄 1\n둘째 줄", name: "유령1" });
    expect(await s.newCount()).toBe(2);
    expect(await s.list({ limit: 1 })).toHaveLength(1);
  });

  it(`최근 ${INQUIRY_KEEP}개만 남기고 오래된 것부터 지운다`, async () => {
    const s = new MemoryInquiries();
    for (let i = 0; i < INQUIRY_KEEP + 3; i++) await s.add(rec(i));
    const rows = await s.list();
    expect(rows).toHaveLength(INQUIRY_KEEP);
    expect(rows[0].id).toBe(`q${INQUIRY_KEEP + 2}`);
    expect(rows.some((r) => r.id === "q0" || r.id === "q2")).toBe(false);
    expect(await s.newCount()).toBe(INQUIRY_KEEP);
  });

  it("처리 여부·메모를 바꾸고 상태로 거른다. 없는 문의는 null", async () => {
    const s = new MemoryInquiries();
    await s.add(rec(1));
    await s.add(rec(2));
    expect(await s.update("q1", { status: "done" }, 5_000)).toMatchObject({ id: "q1", status: "done", doneAt: 5_000 });
    // 다시 처리해도 처음 처리한 시각을 남긴다
    expect((await s.update("q1", { status: "done" }, 9_000))?.doneAt).toBe(5_000);
    expect(await s.update("q1", { memo: "답장했어요" })).toMatchObject({ status: "done", memo: "답장했어요" });
    expect((await s.list({ status: "new" })).map((r) => r.id)).toEqual(["q2"]);
    expect((await s.list({ status: "done" })).map((r) => r.id)).toEqual(["q1"]);
    expect(await s.newCount()).toBe(1);

    const back = await s.update("q1", { status: "new", memo: "" });
    expect(back).toMatchObject({ status: "new" });
    expect(back).not.toHaveProperty("memo");
    expect(back).not.toHaveProperty("doneAt");
    expect(await s.newCount()).toBe(2);
    expect(await s.update("nope", { status: "done" })).toBeNull();
  });

  it("돌려준 줄을 고쳐도 저장된 값은 그대로", async () => {
    const s = new MemoryInquiries();
    await s.add(rec(1));
    (await s.list())[0].message = "바꿈";
    expect((await s.list())[0].message).toBe("첫 줄 1\n둘째 줄");
  });
});
