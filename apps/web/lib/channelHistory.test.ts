import { beforeEach, describe, expect, it, vi } from "vitest";

// 노드 테스트 환경에는 localStorage가 없어 간단한 대역을 둔다
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

const { lastChannel, rememberChannel } = await import("./channelHistory");

describe("마지막에 있던 채널", () => {
  beforeEach(() => mem.clear());

  it("처음엔 없고, 채널을 옮기면 원래 채널이 남는다", () => {
    rememberChannel(1);
    expect(lastChannel(1)).toBeNull();
    rememberChannel(3);
    expect(lastChannel(3)).toBe(1);
    // 같은 채널 상태가 다시 와도 바뀌지 않는다
    rememberChannel(3);
    expect(lastChannel(3)).toBe(1);
  });

  it("지금 채널과 같으면 보여 주지 않는다 (다시 돌아온 경우)", () => {
    rememberChannel(2);
    rememberChannel(5);
    rememberChannel(2);
    expect(lastChannel(2)).toBe(5);
    expect(lastChannel(5)).toBeNull();
  });
});
