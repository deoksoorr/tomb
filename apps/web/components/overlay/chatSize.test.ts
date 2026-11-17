import { afterEach, describe, expect, it, vi } from "vitest";
import { parseChatSize, readChatSize, saveChatSize, stepChatSize } from "./chatSize";

describe("데스크톱 채팅창 크기", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("모르는 값·없는 값은 보통", () => {
    expect(parseChatSize(null)).toBe("normal");
    expect(parseChatSize("huge")).toBe("normal");
    expect(parseChatSize("small")).toBe("small");
  });

  it("한 단계씩, 끝에서는 그대로", () => {
    expect(stepChatSize("normal", -1)).toBe("small");
    expect(stepChatSize("small", -1)).toBe("small");
    expect(stepChatSize("normal", 1)).toBe("large");
    expect(stepChatSize("large", 1)).toBe("large");
  });

  it("이 브라우저에 기억하고, 저장소를 못 쓰면 보통으로", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
    saveChatSize("small");
    expect(readChatSize()).toBe("small");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("막힘");
      },
      setItem: () => {
        throw new Error("막힘");
      },
    });
    expect(() => saveChatSize("large")).not.toThrow();
    expect(readChatSize()).toBe("normal");
  });
});
