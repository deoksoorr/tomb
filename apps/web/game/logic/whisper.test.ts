import { CHAT_MAX } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { WHISPER_PARTNERS_MAX, addPartner, filterPartners, isBareWhisper, isWhisperCommand, parseWhisper, readPartners, whisperChips, whisperPrefill } from "./whisper";

describe("귓속말 명령 나누기", () => {
  it("/w로 시작할 때만 귓속말 (11/16 /귓·/답·/r는 없앴다. 다른 /로 시작하는 글·평범한 글은 아니다)", () => {
    expect(isWhisperCommand("/w 진순 안녕")).toBe(true);
    expect(isWhisperCommand("  /W 진순 안녕")).toBe(true);
    expect(isWhisperCommand("/w")).toBe(true);
    expect(isWhisperCommand("/wave")).toBe(false);
    expect(isWhisperCommand("/귓 진순 안녕")).toBe(false);
    expect(isWhisperCommand("/답 고마워요")).toBe(false);
    expect(isWhisperCommand("/r 고마워요")).toBe(false);
    expect(isWhisperCommand("귓 진순 안녕")).toBe(false);
    expect(parseWhisper("안녕하세요", ["진순"])).toBeNull();
  });

  it("공백 든 이름: 아는 이름 중 가장 긴 것으로 나눈다", () => {
    expect(parseWhisper("/w 진 순 안녕 하세요", ["진", "진 순"])).toEqual({ kind: "send", to: "진 순", text: "안녕 하세요" });
    expect(parseWhisper("/w 큰 곰 돌이  뭐 해요", ["큰 곰 돌이", "큰 곰"])).toEqual({ kind: "send", to: "큰 곰 돌이", text: "뭐 해요" });
    // 이름 키가 같으면 띄어 써도·붙여 써도 같은 사람 (보낼 이름은 실제 이름)
    expect(parseWhisper("/w 진순 안녕", ["진 순"])).toEqual({ kind: "send", to: "진 순", text: "안녕" });
  });

  it("모르는 이름이면 첫 낱말을 이름으로 (서버가 다시 맞춘다)", () => {
    expect(parseWhisper("/w 진순 안녕 하세요", [])).toEqual({ kind: "send", to: "진순", text: "안녕 하세요" });
  });

  it("이름이나 할 말이 없으면 empty, 할 말이 너무 길면 long", () => {
    expect(parseWhisper("/w", [])).toEqual({ kind: "empty" });
    expect(parseWhisper("/w 진순", ["진순"])).toEqual({ kind: "empty" });
    expect(parseWhisper("/w 진순   ", [])).toEqual({ kind: "empty" });
    expect(parseWhisper(`/w 진순 ${"가".repeat(CHAT_MAX + 1)}`, ["진순"])).toEqual({ kind: "long", size: CHAT_MAX + 1 });
    expect(parseWhisper(`/w 진순 ${"가".repeat(CHAT_MAX)}`, ["진순"])).toEqual({ kind: "send", to: "진순", text: "가".repeat(CHAT_MAX) });
  });

  it("캐릭터 메뉴가 채우는 글은 그대로 나눌 수 있다", () => {
    expect(parseWhisper(whisperPrefill("진 순") + "안녕", ["진 순"])).toEqual({ kind: "send", to: "진 순", text: "안녕" });
  });
});

describe("명령만 친 귓속말 (/w + Enter → 최근 상대)", () => {
  it("이름 없이 /w만 쳤을 때만 (뒤 공백 포함)", () => {
    for (const t of ["/w", "/W", " /w ", "/w  "]) expect(isBareWhisper(t)).toBe(true);
    for (const t of ["/w 진순", "/귓", "/wave", "/답", "w", ""]) expect(isBareWhisper(t)).toBe(false);
  });
});

describe("최근 귓속말 상대", () => {
  it("최근 순으로 맨 앞, 이름 키가 같으면 하나만 (새 이름으로), 최대 8명", () => {
    let list: string[] = [];
    for (const n of ["가나", "다라", "진 순", "가나", "진순"]) list = addPartner(list, n);
    expect(list).toEqual(["진순", "가나", "다라"]);
    for (let i = 0; i < 10; i++) list = addPartner(list, `이름${i}`);
    expect(list).toHaveLength(WHISPER_PARTNERS_MAX);
    expect(list[0]).toBe("이름9");
    expect(addPartner(["가나"], "  ")).toEqual(["가나"]);
  });

  it("저장본 읽기: 순서 그대로, 이상한 값·겹치는 이름·넘치는 수는 거른다", () => {
    expect(readPartners(JSON.stringify(["진순", "가나", 3, "진 순", ""]))).toEqual(["진순", "가나"]);
    expect(readPartners(JSON.stringify(Array.from({ length: 12 }, (_, i) => `n${i}`)))).toHaveLength(WHISPER_PARTNERS_MAX);
    expect(readPartners("{oops")).toEqual([]);
    expect(readPartners(null)).toEqual([]);
    expect(readPartners('{"a":1}')).toEqual([]);
  });

  it("앞부분으로 거르기 (공백·대소문자 무시)", () => {
    expect(filterPartners(["진 순", "진달래", "Bob"], "진순")).toEqual(["진 순"]);
    expect(filterPartners(["진 순", "진달래", "Bob"], "진")).toEqual(["진 순", "진달래"]);
    expect(filterPartners(["진 순", "Bob"], "b")).toEqual(["Bob"]);
    expect(filterPartners(["진 순", "Bob"], "")).toEqual(["진 순", "Bob"]);
  });

  it("입력칸 위 이름 칩: /w 뒤에 이름을 쓰는 동안만, 다 쓰고 띄면 그 이름은 빠진다", () => {
    const partners = ["진", "진 순", "Bob"];
    expect(whisperChips("/w ", partners)).toEqual(partners);
    expect(whisperChips("/w b", partners)).toEqual(["Bob"]);
    expect(whisperChips("/w 진", partners)).toEqual(["진", "진 순"]);
    expect(whisperChips("/w 진 ", partners)).toEqual(["진 순"]);
    expect(whisperChips("/w 진 순 ", partners)).toEqual([]);
    expect(whisperChips("/w 진 순 안녕", partners)).toEqual([]);
    expect(whisperChips("/귓", partners)).toBeNull();
    expect(whisperChips("/답 안녕", partners)).toBeNull();
    expect(whisperChips("안녕", partners)).toBeNull();
  });
});

