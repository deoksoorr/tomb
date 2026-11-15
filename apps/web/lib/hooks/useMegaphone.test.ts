import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MegaphoneEntry } from "@/lib/types";
import { MEGAPHONE_TTL_MS } from "@tomb/protocol";
import { dropReplaced, flashEndsAt, liveMegaphones, MEGA_FLASH_MS, MEGA_FLASH_QUEUED_MS, MEGA_QUEUE_MAX, megaphoneStore } from "./useMegaphone";

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

  it("외친 지 5분이 지난 한마디는 기록 목록에서 빠진다 (열려 있는 동안에도 타이머로)", () => {
    const now = Date.now();
    const old = { ...entry("오래됨"), at: now - MEGAPHONE_TTL_MS };
    const fresh = entry("방금");
    expect(liveMegaphones([old, fresh], now).map((e) => e.id)).toEqual([fresh.id]);
    megaphoneStore.push(fresh);
    vi.advanceTimersByTime(MEGAPHONE_TTL_MS - 1_000);
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
