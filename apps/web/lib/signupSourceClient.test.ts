import { CLOSE } from "@tomb/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roomCloseAction } from "@/game/net/roomPolicy";
import { captureSource, currentSource, firstSource, sessionSource } from "./signupSourceClient";

// 11/26 가입 유입(브라우저 쪽): 리퍼러는 호스트만, 우리 사이트 안에서 넘어온 것은 빈칸 · 방 연결 4013 = 점검 화면

describe("currentSource", () => {
  it("다른 사이트 리퍼러는 호스트만, utm 세 값", () => {
    expect(currentSource("https://myproject.rip/?utm_source=kakao&utm_medium=chat&utm_campaign=camp", "https://www.google.com/search?q=%EB%AC%98")).toEqual({
      r: "google.com",
      us: "kakao",
      um: "chat",
      uc: "camp",
    });
  });
  it("우리 사이트·로컬·미리보기 주소에서 넘어온 것은 빈칸", () => {
    expect(currentSource("https://myproject.rip/news", "https://www.myproject.rip/")).toEqual({});
    expect(currentSource("http://localhost:3123/", "http://localhost:3123/news")).toEqual({});
    expect(currentSource("https://myproject.rip/", "https://tomb-abc.vercel.app/")).toEqual({});
    expect(currentSource("https://myproject.rip/", "")).toEqual({});
  });
});

describe("방 연결 닫힘 4013", () => {
  it("다시 붙지 않고 점검 화면", () => {
    expect(roomCloseAction(CLOSE.MAINTENANCE, false)).toBe("maintenance");
    expect(roomCloseAction(CLOSE.MAINTENANCE, true)).toBe("leave");
  });
});

/** 브라우저 흉내: 주소·리퍼러·두 저장소 (blocked면 저장소 접근이 던진다 — 사생활 보호 모드) */
function fakeBrowser(href: string, referrer: string, session: Record<string, string> = {}, blocked = false) {
  const store = (init: Record<string, string>) => {
    const m = new Map(Object.entries(init));
    const deny = () => {
      throw new Error("SecurityError");
    };
    return {
      getItem: (k: string) => (blocked ? deny() : (m.get(k) ?? null)),
      setItem: (k: string, v: string) => (blocked ? deny() : void m.set(k, v)),
      dump: () => Object.fromEntries(m),
    };
  };
  const ss = store(session);
  const ls = store({});
  vi.stubGlobal("window", { location: { href } });
  vi.stubGlobal("document", { referrer });
  vi.stubGlobal("sessionStorage", ss);
  vi.stubGlobal("localStorage", ls);
  return { ss, ls };
}

describe("11/27 이번 접속 유입 남기기", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("방문 표시(tomb.visit)만 있고 유입 칸이 없는 옛 탭도 지금 리퍼러로 채운다 (예전엔 비어 「직접·알 수 없음」)", () => {
    const { ss } = fakeBrowser("https://myproject.rip/", "https://null.ncsoft.com/board/1", { "tomb.visit": "1" });
    captureSource();
    expect(JSON.parse(ss.dump()["tomb.ssrc"])).toEqual({ r: "null.ncsoft.com" });
    expect(sessionSource()).toEqual({ r: "null.ncsoft.com" });
    expect(firstSource()).toEqual({ r: "null.ncsoft.com" });
  });

  it("이미 남긴 탭은 그대로 (같은 탭 안에서 옮겨 다녀도 처음 유입)", () => {
    const { ss } = fakeBrowser("https://myproject.rip/", "https://myproject.rip/news", { "tomb.ssrc": JSON.stringify({ r: "forum.example.com" }) });
    captureSource();
    expect(JSON.parse(ss.dump()["tomb.ssrc"])).toEqual({ r: "forum.example.com" });
  });

  it("저장소가 막힌 브라우저는 보낼 때 지금 화면 것", () => {
    fakeBrowser("https://myproject.rip/?utm_source=kakao", "https://forum.example.com/t/9", {}, true);
    captureSource();
    expect(sessionSource()).toEqual({ r: "forum.example.com", us: "kakao" });
    expect(firstSource()).toEqual({ r: "forum.example.com", us: "kakao" });
  });
});
