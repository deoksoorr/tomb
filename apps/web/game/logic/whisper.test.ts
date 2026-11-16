import { CHAT_MAX } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { isWhisperCommand, parseWhisper, whisperPrefill } from "./whisper";

describe("귓속말 명령 나누기", () => {
  it("/귓·/w로 시작할 때만 귓속말 (다른 /로 시작하는 글·평범한 글은 아니다)", () => {
    expect(isWhisperCommand("/귓 진순 안녕")).toBe(true);
    expect(isWhisperCommand("  /W 진순 안녕")).toBe(true);
    expect(isWhisperCommand("/귓")).toBe(true);
    expect(isWhisperCommand("/wave")).toBe(false);
    expect(isWhisperCommand("/귓속말 진순")).toBe(false);
    expect(isWhisperCommand("귓 진순 안녕")).toBe(false);
    expect(parseWhisper("안녕하세요", ["진순"])).toBeNull();
  });

  it("공백 든 이름: 아는 이름 중 가장 긴 것으로 나눈다", () => {
    expect(parseWhisper("/귓 진 순 안녕 하세요", ["진", "진 순"])).toEqual({ kind: "send", to: "진 순", text: "안녕 하세요" });
    expect(parseWhisper("/w 큰 곰 돌이  뭐 해요", ["큰 곰 돌이", "큰 곰"])).toEqual({ kind: "send", to: "큰 곰 돌이", text: "뭐 해요" });
    // 이름 키가 같으면 띄어 써도·붙여 써도 같은 사람 (보낼 이름은 실제 이름)
    expect(parseWhisper("/귓 진순 안녕", ["진 순"])).toEqual({ kind: "send", to: "진 순", text: "안녕" });
  });

  it("모르는 이름이면 첫 낱말을 이름으로 (서버가 다시 맞춘다)", () => {
    expect(parseWhisper("/귓 진순 안녕 하세요", [])).toEqual({ kind: "send", to: "진순", text: "안녕 하세요" });
  });

  it("이름이나 할 말이 없으면 empty, 할 말이 너무 길면 long", () => {
    expect(parseWhisper("/귓", [])).toEqual({ kind: "empty" });
    expect(parseWhisper("/귓 진순", ["진순"])).toEqual({ kind: "empty" });
    expect(parseWhisper("/귓 진순   ", [])).toEqual({ kind: "empty" });
    expect(parseWhisper(`/귓 진순 ${"가".repeat(CHAT_MAX + 1)}`, ["진순"])).toEqual({ kind: "long", size: CHAT_MAX + 1 });
    expect(parseWhisper(`/귓 진순 ${"가".repeat(CHAT_MAX)}`, ["진순"])).toEqual({ kind: "send", to: "진순", text: "가".repeat(CHAT_MAX) });
  });

  it("캐릭터 메뉴가 채우는 글은 그대로 나눌 수 있다", () => {
    expect(parseWhisper(whisperPrefill("진 순") + "안녕", ["진 순"])).toEqual({ kind: "send", to: "진 순", text: "안녕" });
  });
});
