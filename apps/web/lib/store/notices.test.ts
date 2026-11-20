import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import type { Notice } from "../types";
import { MemoryNotices, RedisNotices, type NoticeStore } from "./notices";

function contract(make: () => NoticeStore) {
  const store = make();
  const notice = (over: Partial<Notice>): Notice => ({
    id: `t-${nanoid(8)}`,
    title: "점검 안내",
    body: "첫 줄\n둘째 줄",
    pinned: false,
    createdAt: 1000,
    ...over,
  });

  it("고정 먼저, 그 안에서 최신 순. 수정·삭제", async () => {
    const old = notice({ createdAt: 1 });
    const recent = notice({ createdAt: 3 });
    const pinned = notice({ createdAt: 2, pinned: true });
    for (const n of [old, recent, pinned]) await store.put(n);
    try {
      const mine = (await store.list()).filter((n) => [old.id, recent.id, pinned.id].includes(n.id));
      expect(mine.map((n) => n.id)).toEqual([pinned.id, recent.id, old.id]);
      expect(await store.get(old.id)).toEqual(old);
      await store.put({ ...old, title: "고침" });
      expect((await store.get(old.id))?.title).toBe("고침");
    } finally {
      for (const n of [old, recent, pinned]) expect(await store.remove(n.id)).toBe(true);
    }
    expect(await store.remove(old.id)).toBe(false);
    expect(await store.get(old.id)).toBeNull();
  });

  it("개발자 노트 본문은 목록에 실리지 않고 따로 읽는다. 공지를 지우면 본문도 지운다", async () => {
    const n = notice({ rich: true, summary: "요약", hero: "/devnotes/hero-1119.webp" });
    const doc = { blocks: [{ t: "h" as const, text: "소제목" }, { t: "p" as const, text: "긴 본문" }], outro: "끝" };
    await store.putDoc(n.id, doc);
    await store.put(n);
    try {
      expect(await store.getDoc(n.id)).toEqual(doc);
      expect(JSON.stringify((await store.list()).find((x) => x.id === n.id))).not.toContain("긴 본문");
      await store.putDoc(n.id, null);
      expect(await store.getDoc(n.id)).toBeNull();
      await store.putDoc(n.id, doc);
    } finally {
      expect(await store.remove(n.id)).toBe(true);
    }
    expect(await store.getDoc(n.id)).toBeNull();
  });
}

describe("MemoryNotices", () => contract(() => new MemoryNotices()));
const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisNotices (실제 Redis)", () => contract(() => new RedisNotices(redisEnv!)));
