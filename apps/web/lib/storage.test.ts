import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetMyCode, MY_CODE_KEY, readMyCode, saveMyCode } from "./storage";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("개인 코드 기기 저장본", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("저장한 계정에서만 읽히고, 지우면 사라진다", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveMyCode("acc1", "ABCD-EFGH-JKMN");
    expect(readMyCode("acc1")).toBe("ABCD-EFGH-JKMN");
    expect(readMyCode("acc2")).toBeNull();
    forgetMyCode();
    expect(readMyCode("acc1")).toBeNull();
  });

  it("깨진 값은 무시한다", () => {
    const s = fakeStorage();
    vi.stubGlobal("localStorage", s);
    s.setItem(MY_CODE_KEY, "{not json");
    expect(readMyCode("acc1")).toBeNull();
    s.setItem(MY_CODE_KEY, JSON.stringify({ accountId: "acc1", code: 3 }));
    expect(readMyCode("acc1")).toBeNull();
  });

  it("저장소를 못 쓰는 환경에서도 던지지 않는다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => saveMyCode("acc1", "ABCD-EFGH-JKMN")).not.toThrow();
    expect(readMyCode("acc1")).toBeNull();
    expect(() => forgetMyCode()).not.toThrow();
  });
});
