import { describe, expect, it } from "vitest";
import { CHAT_BURST, CHAT_MAX, CHAT_REFILL_MS, maskChat, newChatBucket, normalizeChat, takeChatToken } from "./chat";
import { encodeEvent, parseC2S } from "./events";

describe("말풍선 채팅: 정리·검증", () => {
  it("공백 정리, 공백만은 거절, 40자까지", () => {
    expect(normalizeChat("  안녕\n  하세요  ")).toBe("안녕 하세요");
    expect(normalizeChat("   ")).toBeNull();
    expect(normalizeChat("​​")).toBeNull();
    expect(normalizeChat("가".repeat(CHAT_MAX))).toBe("가".repeat(CHAT_MAX));
    expect(normalizeChat("가".repeat(CHAT_MAX + 1))).toBeNull();
    expect(normalizeChat(3)).toBeNull();
  });

  it("parseC2S: chat은 정리된 글만, 공백만·41자·문자열 아님은 null", () => {
    expect(parseC2S(encodeEvent({ t: "chat", text: " 하이 " }))).toEqual({ t: "chat", text: "하이" });
    expect(parseC2S('{"t":"chat","text":"   "}')).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "chat", text: "a".repeat(41) }))).toBeNull();
    expect(parseC2S('{"t":"chat","text":1}')).toBeNull();
    expect(parseC2S('{"t":"chat"}')).toBeNull();
  });
});

describe("말풍선 채팅: 도배 제한 (토큰 버킷)", () => {
  it("처음에 3번까지 몰아 보낼 수 있고, 그 뒤로는 1초에 1번", () => {
    const b = newChatBucket();
    for (let i = 0; i < CHAT_BURST; i++) expect(takeChatToken(b, 0)).toBe(true);
    expect(takeChatToken(b, 10)).toBe(false);
    expect(takeChatToken(b, CHAT_REFILL_MS - 1)).toBe(false);
    expect(takeChatToken(b, CHAT_REFILL_MS)).toBe(true);
    expect(takeChatToken(b, CHAT_REFILL_MS + 500)).toBe(false);
    expect(takeChatToken(b, CHAT_REFILL_MS * 2)).toBe(true);
  });

  it("오래 쉬어도 3개까지만 모인다", () => {
    const b = newChatBucket();
    takeChatToken(b, 0);
    let ok = 0;
    for (let i = 0; i < 10; i++) if (takeChatToken(b, 60_000)) ok++;
    expect(ok).toBe(CHAT_BURST);
  });
});

describe("말풍선 채팅: 욕설·주소·전화번호 가리기", () => {
  it("평범한 글은 그대로", () => {
    for (const s of ["안녕하세요", "다시 발표할게요", "옷발 좋다", "새끼 고양이 귀여워", "시바견 산책", "보지 마세요", "2018년 여름", "ㅋㅋㅋ", "ㅇㅇ", "1.5배"])
      expect(maskChat(s)).toBe(s);
  });

  it("욕설과 흔한 변형을 *** 로 가린다", () => {
    expect(maskChat("시발")).toBe("***");
    expect(maskChat("아 씨발 뭐야")).toBe("아 *** 뭐야");
    expect(maskChat("시.발")).toBe("***");
    expect(maskChat("시1발")).toBe("***");
    expect(maskChat("시 발")).toBe("***");
    expect(maskChat("ㅆㅣㅂㅏㄹ")).toBe("***");
    expect(maskChat("ㅅㅂ")).toBe("***");
    expect(maskChat("ㅅ ㅂ")).toBe("***");
    expect(maskChat("ㅅ1ㅂ")).toBe("***");
    expect(maskChat("씨8")).toBe("***");
    expect(maskChat("병신아")).toBe("***아");
    expect(maskChat("개새끼")).toBe("***끼");
    expect(maskChat("F*U*C*K you")).toBe("*** you");
    expect(maskChat("f u c k")).toBe("***");
    expect(maskChat("한남충 맘충")).toBe("*** ***");
  });

  it("주소·전화번호 모양을 가린다", () => {
    expect(maskChat("여기 https://evil.example/a 와봐")).toBe("여기 *** 와봐");
    expect(maskChat("www.abc.kr 가자")).toBe("*** 가자");
    expect(maskChat("naver.com에서")).toBe("***에서");
    expect(maskChat("open.kakao.com/o/abc 들어와")).toBe("*** 들어와");
    expect(maskChat("naver . com")).toBe("***");
    expect(maskChat("네이버 닷컴")).toBe("***");
    expect(maskChat("010-1234-5678 연락")).toBe("*** 연락");
    expect(maskChat("01012345678")).toBe("***");
    expect(maskChat("010 1234 5678")).toBe("***");
  });
});
