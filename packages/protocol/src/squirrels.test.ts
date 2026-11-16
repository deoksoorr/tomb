import { describe, expect, it } from "vitest";
import { isSquirrelRainChat, SQUIRREL_RAIN_COOLDOWN_MS, squirrelRainReady } from "./squirrels";

describe("다람쥐를 뿌려라 (이스터에그 문구)", () => {
  it.each([
    "다람쥐를 뿌려라",
    "다람쥐를뿌려라",
    "다람쥐를 뿌려라!!",
    "다람쥐를 뿌려라~",
    "다람쥐를 뿌려라 ㅋㅋㅋ",
    "다람쥐를 뿌려라!! 🐿️",
    "  다 람 쥐 를  뿌 려 라 . ",
    "얘들아 다람쥐를 뿌려라!",
    "다람쥐를 뿌려라! 가즈아",
    "다람쥐를 뿌려라... 제발",
    "다람쥐를​뿌려라",
    "ㅋㅋ다람쥐를뿌려라ㅠㅠ",
  ])("맞다: %s", (t) => expect(isSquirrelRainChat(t)).toBe(true));

  it.each([
    "다람쥐를 뿌려라고 하면 뭐가 나와요?",
    "다람쥐를뿌려라고",
    "다람쥐를 뿌려라 하면 돼요",
    "다람쥐를 뿌려",
    "다람쥐 뿌려라",
    "다람쥐를 뿌리자",
    "청설모를 뿌려라",
    "/w 친구 다람쥐를 뿌려라",
    "/귓 친구 다람쥐를 뿌려라!",
    "",
  ])("아니다: %s", (t) => expect(isSquirrelRainChat(t)).toBe(false));

  it("문자열이 아니면 아니다", () => {
    expect(isSquirrelRainChat(undefined)).toBe(false);
    expect(isSquirrelRainChat(3)).toBe(false);
  });

  it("쿨다운 10분", () => {
    expect(SQUIRREL_RAIN_COOLDOWN_MS).toBe(600_000);
    expect(squirrelRainReady(-Infinity, 0)).toBe(true);
    expect(squirrelRainReady(1_000, 1_000 + SQUIRREL_RAIN_COOLDOWN_MS - 1)).toBe(false);
    expect(squirrelRainReady(1_000, 1_000 + SQUIRREL_RAIN_COOLDOWN_MS)).toBe(true);
  });
});
