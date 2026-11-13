import { describe, expect, it } from "vitest";
import {
  addChatLine,
  CHAT_LOG_FADE_MS,
  CHAT_LOG_KEEP,
  CHAT_LOG_MOBILE_LINES,
  CHAT_LOG_TTL_MS,
  chatLineOpacity,
  chatLineTone,
  liveChatLines,
  visibleChatLines,
  type ChatLine,
} from "./chatLog";

const line = (id: number, at: number, mine = false): ChatLine => ({ id, name: mine ? "나" : `유령${id}`, text: `글${id}`, mine, at });

describe("채팅 기록창", () => {
  it("각 줄은 1분이 지나면 사라진다", () => {
    const lines = [line(1, 0), line(2, 30_000)];
    expect(liveChatLines(lines, CHAT_LOG_TTL_MS - 1).map((l) => l.id)).toEqual([1, 2]);
    expect(liveChatLines(lines, CHAT_LOG_TTL_MS).map((l) => l.id)).toEqual([2]);
    expect(liveChatLines(lines, 30_000 + CHAT_LOG_TTL_MS)).toEqual([]);
  });

  it("새 줄을 붙일 때 지난 줄은 빠진다", () => {
    const next = addChatLine([line(1, 0)], line(2, CHAT_LOG_TTL_MS + 5));
    expect(next.map((l) => l.id)).toEqual([2]);
  });

  it("마지막 몇 초 동안 서서히 흐려진다", () => {
    const l = line(1, 0);
    expect(chatLineOpacity(l, 0)).toBe(1);
    expect(chatLineOpacity(l, CHAT_LOG_TTL_MS - CHAT_LOG_FADE_MS)).toBe(1);
    expect(chatLineOpacity(l, CHAT_LOG_TTL_MS - CHAT_LOG_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(chatLineOpacity(l, CHAT_LOG_TTL_MS)).toBe(0);
  });

  it("안전 상한을 넘으면 오래된 것부터 버린다", () => {
    let lines: ChatLine[] = [];
    for (let i = 0; i < CHAT_LOG_KEEP + 7; i++) lines = addChatLine(lines, line(i, i));
    expect(lines).toHaveLength(CHAT_LOG_KEEP);
    expect(lines[0].id).toBe(7);
    expect(lines.at(-1)?.id).toBe(CHAT_LOG_KEEP + 6);
  });

  it("모바일은 최근 줄만, 데스크톱은 1분 안의 전부", () => {
    let lines: ChatLine[] = [];
    for (let i = 0; i < 9; i++) lines = addChatLine(lines, line(i, i));
    expect(visibleChatLines(lines, 10, CHAT_LOG_MOBILE_LINES).map((l) => l.id)).toEqual([4, 5, 6, 7, 8]);
    expect(visibleChatLines(lines, 10)).toHaveLength(9);
  });

  it("내가 쓴 줄은 바로 붙고 색으로 구분된다", () => {
    const lines = addChatLine([line(1, 0)], line(2, 100, true));
    expect(lines.at(-1)).toMatchObject({ mine: true, text: "글2" });
    expect(lines.map(chatLineTone)).toEqual(["other", "mine"]);
  });
});
