import { afterEach, describe, expect, it, vi } from "vitest";
import type { Me } from "./types";
import { meStore } from "./hooks/useMe";
import { takeReplyHint, whisperPartners, whisperPartnersKey } from "./whisperPartners";

function fakeStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const login = (accountId: string) => meStore.set({ accountId } as Me);

describe("최근 귓속말 상대 저장소", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("계정마다 따로 남기고, 계정이 바뀌면 그 계정 목록을 읽는다. /답 대상은 받은 귓속말만", () => {
    const ls = fakeStorage({ [whisperPartnersKey("acc2")]: JSON.stringify(["예전친구"]) });
    vi.stubGlobal("localStorage", ls);
    login("acc1");
    expect(whisperPartners.get()).toEqual([]);
    whisperPartners.note("진 순", "out");
    expect(whisperPartners.replyTo()).toBeNull();
    whisperPartners.note("가나", "in");
    whisperPartners.note("진순", "out");
    expect(whisperPartners.get()).toEqual(["진순", "가나"]);
    expect(whisperPartners.replyTo()).toBe("가나");
    expect(JSON.parse(ls.map.get(whisperPartnersKey("acc1"))!)).toEqual(["진순", "가나"]);

    login("acc2");
    expect(whisperPartners.get()).toEqual(["예전친구"]);
    expect(whisperPartners.replyTo()).toBeNull();
  });

  it("저장소를 못 써도 이 탭에서는 기억한다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    login("acc3");
    whisperPartners.note("고양이", "in");
    expect(whisperPartners.get()).toEqual(["고양이"]);
    expect(whisperPartners.replyTo()).toBe("고양이");
  });

  it("/답 안내는 한 번만", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(takeReplyHint()).toBe(true);
    expect(takeReplyHint()).toBe(false);
  });
});
