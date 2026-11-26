import { CLOSE } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { roomCloseAction } from "@/game/net/roomPolicy";
import { currentSource } from "./signupSourceClient";

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
