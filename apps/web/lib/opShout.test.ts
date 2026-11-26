import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEGA_FLASH_MS, megaphoneStore } from "./hooks/useMegaphone";
import { isOpShout, isShoutCommand, OP_SHOUT_NAME, OP_SHOUT_PREFIX, shoutCommandText } from "./opShout";
import type { MegaphoneEntry } from "./types";

// 11/26 운영자 외치기: 채팅 명령 나누기 · 화면 확성기 줄(가운데 알림만, 소식 기록에는 안 넣음)

describe("/외치기 명령", () => {
  it("명령으로 시작할 때만 (앞 공백·NFD 한글도), 뒤에 바로 글자가 붙으면 명령이 아니다", () => {
    expect(isShoutCommand("/외치기 안녕")).toBe(true);
    expect(isShoutCommand("  /외치기")).toBe(true);
    expect(isShoutCommand("/외치기".normalize("NFD") + " 안녕")).toBe(true);
    expect(isShoutCommand("/외치기안녕")).toBe(false);
    expect(isShoutCommand("외치기 안녕")).toBe(false);
    expect(isShoutCommand("/w 친구 /외치기")).toBe(false);
  });
  it("할 말은 공백을 하나로 고르고 앞뒤를 자른다. 명령이 아니면 null", () => {
    expect(shoutCommandText("/외치기   10시에  낚시 대회 ")).toBe("10시에 낚시 대회");
    expect(shoutCommandText("/외치기")).toBe("");
    expect(shoutCommandText("안녕")).toBeNull();
  });
  it("줄 id 앞부분으로 운영자 외치기를 가린다", () => {
    expect(isOpShout({ id: `${OP_SHOUT_PREFIX}abc` })).toBe(true);
    expect(isOpShout({ id: "pev-1-s" })).toBe(false);
    expect(isOpShout({ id: "abc" })).toBe(false);
  });
});

describe("화면 확성기 줄", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
  });
  afterEach(() => {
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
  });

  const op = (id: string, text: string): MegaphoneEntry => ({ id: `${OP_SHOUT_PREFIX}${id}`, name: OP_SHOUT_NAME, text, scope: "all", ch: 0, at: Date.now(), staff: true, system: true });

  it("운영자 외치기는 가운데에 뜨지만 소식 기록에는 들어가지 않고, 같은 id는 한 번만", () => {
    const before = megaphoneStore.getSnapshot().entries.length;
    const a = op("a1", "잠시 뒤 점검해요");
    megaphoneStore.push(a);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(a.id);
    expect(megaphoneStore.getSnapshot().entries).toHaveLength(before);
    expect(megaphoneStore.getSnapshot().entries.some((e) => e.id === a.id)).toBe(false);
    vi.advanceTimersByTime(MEGA_FLASH_MS);
    expect(megaphoneStore.getSnapshot().flash).toBeNull();
    // 같은 줄이 또 와도 (두 번 받음) 다시 띄우지 않는다
    megaphoneStore.push(a);
    expect(megaphoneStore.getSnapshot().flash).toBeNull();
  });

  it("확성기와 겹치면 차례를 지킨다 (두 알림이 한꺼번에 뜨지 않는다)", () => {
    const m: MegaphoneEntry = { id: "m-op-1", name: "손님", text: "안녕", scope: "all", ch: 1, at: Date.now() };
    const a = op("a2", "운영자 알림");
    megaphoneStore.push(m);
    megaphoneStore.push(a);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(m.id);
    expect(megaphoneStore.getSnapshot().queue.map((e) => e.id)).toEqual([a.id]);
    vi.advanceTimersByTime(MEGA_FLASH_MS);
    expect(megaphoneStore.getSnapshot().flash?.id).toBe(a.id);
    // 기록에는 손님 확성기만
    const ids = megaphoneStore.getSnapshot().entries.map((e) => e.id);
    expect(ids).toContain(m.id);
    expect(ids).not.toContain(a.id);
  });
});
