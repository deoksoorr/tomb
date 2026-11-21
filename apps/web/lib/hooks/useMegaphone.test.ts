import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MegaphoneEntry } from "@/lib/types";
import { MEGA_FEED_TTL_MS } from "@tomb/protocol";
import { applyPinMsg, dropReplaced, feedOpen, flashEndsAt, liveMegaphones, MEGA_FLASH_MS, MEGA_FLASH_QUEUED_MS, MEGA_QUEUE_MAX, megaphoneStore, sortPins } from "./useMegaphone";

let n = 0;
const entry = (text: string): MegaphoneEntry => ({ id: `m${++n}`, name: `이름${n}`, text, scope: "channel", ch: 1, at: Date.now() });

describe("확성기 가운데 표시 차례", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    // 남은 표시를 모두 흘려보내 다음 테스트가 빈 상태에서 시작하게
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
  });

  it("기다리는 것이 없으면 길게, 있으면 짧게 보여 준다", () => {
    expect(flashEndsAt(0, 0)).toBe(MEGA_FLASH_MS);
    expect(flashEndsAt(0, 2)).toBe(MEGA_FLASH_QUEUED_MS);
  });

  it("하나만 오면 MEGA_FLASH_MS 동안 떠 있다가 내려간다", () => {
    const a = entry("하나");
    megaphoneStore.push(a);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(a.id);
    vi.advanceTimersByTime(MEGA_FLASH_MS - 1);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(a.id);
    vi.advanceTimersByTime(1);
    expect(megaphoneStore.getSnapshot().flash).toBeNull();
  });

  it("겹쳐 오면 온 차례대로 하나씩 띄우고, 앞의 것은 짧게 줄인다", () => {
    const a = entry("첫째");
    const b = entry("둘째");
    const c = entry("셋째");
    megaphoneStore.push(a);
    vi.advanceTimersByTime(1_000);
    megaphoneStore.push(b);
    megaphoneStore.push(c);
    const s = megaphoneStore.getSnapshot();
    expect(s.flash?.id).toBe(a.id);
    expect(s.queue.map((e) => e.id)).toEqual([b.id, c.id]);
    // 첫째는 뜬 지 MEGA_FLASH_QUEUED_MS가 되면 넘어간다
    expect(s.flashUntil).toBe(1_000_000 + MEGA_FLASH_QUEUED_MS);
    vi.advanceTimersByTime(MEGA_FLASH_QUEUED_MS - 1_000);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(b.id);
    // 둘째 뒤에 셋째가 기다리므로 둘째도 짧게
    vi.advanceTimersByTime(MEGA_FLASH_QUEUED_MS);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(c.id);
    // 마지막은 길게
    vi.advanceTimersByTime(MEGA_FLASH_MS - 1);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(c.id);
    vi.advanceTimersByTime(1);
    expect(megaphoneStore.getSnapshot().flash).toBeNull();
    // 기록에는 셋 다 남는다
    const ids = megaphoneStore.getSnapshot().entries.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
  });

  it("같은 id는 한 번만, 기다리는 줄은 MEGA_QUEUE_MAX개까지", () => {
    const first = entry("처음");
    megaphoneStore.push(first);
    megaphoneStore.push(first);
    expect(megaphoneStore.getSnapshot().queue).toHaveLength(0);
    for (let i = 0; i < MEGA_QUEUE_MAX + 3; i++) megaphoneStore.push(entry(`줄 ${i}`));
    expect(megaphoneStore.getSnapshot().queue).toHaveLength(MEGA_QUEUE_MAX);
    expect(megaphoneStore.getSnapshot().queue.at(-1)?.text).toBe(`줄 ${MEGA_QUEUE_MAX + 2}`);
  });

  it("하루가 지난 한마디는 기록 목록에서 빠진다 (열려 있는 동안에도 타이머로)", () => {
    const now = Date.now();
    const old = { ...entry("오래됨"), at: now - MEGA_FEED_TTL_MS };
    const fresh = entry("방금");
    expect(liveMegaphones([old, fresh], now).map((e) => e.id)).toEqual([fresh.id]);
    // 11/21 옛 5분 기준은 지났어도 하루 안이면 남는다
    expect(liveMegaphones([{ ...entry("6분 전"), at: now - 6 * 60_000 }], now)).toHaveLength(1);
    megaphoneStore.push(fresh);
    vi.advanceTimersByTime(MEGA_FEED_TTL_MS - 1_000);
    expect(megaphoneStore.getSnapshot().entries.some((e) => e.id === fresh.id)).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(megaphoneStore.getSnapshot().entries.some((e) => e.id === fresh.id)).toBe(false);
  });

  it("11/15 끝 공지(replaces)가 오면 바꿔 끼울 시작 공지를 기록·기다리는 줄에서 뺀다", () => {
    const start = { ...entry("📢 긴급! … (20분)"), id: "urg-t1-a0", system: true as const, staff: true as const };
    const other = entry("다른 말");
    megaphoneStore.push(other);
    megaphoneStore.push(start);
    expect(megaphoneStore.getSnapshot().queue.map((e) => e.id)).toContain(start.id);
    const end = { ...entry("긴급 의뢰(생선 15마리)는 아무도 오지 않은 채 끝났어요."), id: "urg-t1-a1", replaces: start.id, system: true as const, staff: true as const };
    megaphoneStore.push(end);
    const ids = megaphoneStore.getSnapshot().entries.map((e) => e.id);
    expect(ids).not.toContain(start.id);
    expect(ids.slice(-1)).toEqual([end.id]);
    expect(megaphoneStore.getSnapshot().queue.map((e) => e.id)).not.toContain(start.id);
    // 서버 목록으로 다시 맞출 때도 (목록에 둘 다 있어도) 바꿔 끼운 쪽만
    expect(dropReplaced([start, other, end]).map((e) => e.id)).toEqual([other.id, end.id]);
  });
});

describe("11/17 고정 공지 칸", () => {
  const pin = (scope: "channel" | "all", ch: number, text: string) => ({ scope, ch, text, name: "운영자", at: 1 });

  it("그 채널 것 먼저, 모든 채널 것 다음 (최대 2개)", () => {
    expect(sortPins([pin("all", 0, "전체"), pin("channel", 2, "채널")]).map((p) => p.text)).toEqual(["채널", "전체"]);
  });

  it("실시간 바뀜: 같은 칸만 바꾸고, 다른 채널 공지는 상관없다(null)", () => {
    const now = [pin("channel", 2, "채널"), pin("all", 0, "전체")];
    expect(applyPinMsg(now, { t: "megaPin", scope: "channel", ch: 3, pin: pin("channel", 3, "3채널") }, 2)).toBeNull();
    expect(applyPinMsg(now, { t: "megaPin", scope: "all", ch: 0, pin: null }, 2)?.map((p) => p.text)).toEqual(["채널"]);
    expect(applyPinMsg(now, { t: "megaPin", scope: "channel", ch: 2, pin: pin("channel", 2, "새 글") }, 2)?.map((p) => p.text)).toEqual(["새 글", "전체"]);
    expect(applyPinMsg([], { t: "megaPin", scope: "all", ch: 0, pin: pin("all", 0, "전체") }, 5)?.map((p) => p.text)).toEqual(["전체"]);
  });

  it("실시간으로 바뀐 공지는 잠시 서버 목록(CDN 옛것)으로 되돌리지 않고, 채널을 옮기면 새 채널 것으로 맞춘다", async () => {
    const { socialApi } = await import("@/lib/socialApi");
    const spy = vi.spyOn(socialApi, "megaphones").mockResolvedValue({ entries: [], pins: [pin("channel", 2, "옛 글")] });
    megaphoneStore.applyPin({ t: "megaPin", scope: "channel", ch: 2, pin: pin("channel", 2, "새 글") }, 2);
    await megaphoneStore.load(2);
    expect(megaphoneStore.getSnapshot().pins.map((p) => p.text)).toEqual(["새 글"]);
    spy.mockResolvedValue({ entries: [], pins: [pin("channel", 4, "4채널")] });
    await megaphoneStore.load(4);
    expect(megaphoneStore.getSnapshot().pins.map((p) => p.text)).toEqual(["4채널"]);
    // 옛 서버(pins 없음)면 그대로 둔다
    spy.mockResolvedValue({ entries: [] });
    await megaphoneStore.load(4);
    expect(megaphoneStore.getSnapshot().pins.map((p) => p.text)).toEqual(["4채널"]);
    spy.mockRestore();
  });
});

describe("11/21 마을 소식 기록 줄 열림 (feedOpen)", () => {
  it("접혀 있으면 닫힘", () => {
    expect(feedOpen(true, 3, true)).toBe(false);
  });
  it("소식이 있으면 펼침 상태 그대로", () => {
    expect(feedOpen(false, 2, false)).toBe(true);
  });
  it("비어 있으면 직접 펼친 때만 (빈 줄 안내)", () => {
    expect(feedOpen(false, 0, false)).toBe(false);
    expect(feedOpen(false, 0, true)).toBe(true);
  });
  it("펼친 뒤 다시 받은 목록이 비어도 닫히지 않는다 (펼치자마자 접히던 것)", () => {
    // 누르기 전: 실시간으로 온 줄 1개 → 펼침. 다시 받은 서버 목록은 0개
    expect(feedOpen(false, 1, true)).toBe(true);
    expect(feedOpen(false, 0, true)).toBe(true);
  });
});
