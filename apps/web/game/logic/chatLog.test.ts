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
  mergeChatLines,
  readChatLog,
  visibleChatLines,
  type ChatLine,
  type IncomingChatLine,
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

describe("채팅 기록창: 서버 최근 1분(chatLog) 합치기", () => {
  const inc = (key: string, at: number, text = `글${key}`, mine = false): IncomingChatLine => ({ key, name: mine ? "나" : "유령", text, mine, at });
  const counter = () => {
    let n = 100;
    return () => ++n;
  };

  it("서버 now 기준으로 지난 시간만큼 앞당겨 이 기기 시계로 옮긴다 (기기 시계가 달라도 남은 시간이 맞다). 이상한 줄은 버린다", () => {
    const got = readChatLog(
      1_000_000,
      [
        { id: "a.1", at: 990_000, name: "유령", text: "안녕" },
        { id: "a.2", at: 1_000_500, name: "나", text: "미래", mine: true },
        { id: 3, at: 0, name: "x", text: "y" },
        { id: "a.4", at: 0, name: "x", text: "" },
        null,
      ],
      5_000_000,
    );
    expect(got).toEqual([
      { key: "a.1", name: "유령", text: "안녕", mine: false, at: 4_990_000 },
      { key: "a.2", name: "나", text: "미래", mine: true, at: 5_000_000 },
    ]);
    expect(readChatLog("x", [], 0)).toEqual([]);
    expect(readChatLog(1, "x", 0)).toEqual([]);
  });

  it("같은 key는 한 번만: 실시간으로 받은 줄과 chatLog가 겹쳐도, chatLog를 두 번 받아도", () => {
    let lines: ChatLine[] = addChatLine([], { ...line(1, 1_000), key: "s.1" });
    lines = mergeChatLines(lines, [inc("s.1", 900), inc("s.0", 500)], 2_000, counter());
    expect(lines.map((l) => l.key)).toEqual(["s.0", "s.1"]); // 시각 순
    expect(lines.find((l) => l.key === "s.1")?.id).toBe(1); // 원래 줄 유지
    lines = mergeChatLines(lines, [inc("s.0", 500), inc("s.1", 900)], 3_000, counter());
    expect(lines).toHaveLength(2);
    // 실시간 줄이 나중에 와도 중복 없음
    expect(addChatLine(lines, { ...line(9, 3_500), key: "s.0" })).toHaveLength(2);
  });

  it("내가 보낸 줄(key 없음)은 서버가 돌려준 내 줄과 글·시각으로 맞춰 key만 붙인다", () => {
    const mine = { ...line(1, 10_000, true), text: "안녕" };
    let lines = mergeChatLines([mine], [inc("s.1", 10_300, "안녕", true)], 11_000, counter());
    expect(lines).toEqual([{ ...mine, key: "s.1" }]);
    // 글이 다르거나 너무 멀면 다른 줄
    lines = mergeChatLines([mine], [inc("s.2", 10_300, "다른 글", true), inc("s.3", 40_000, "안녕", true)], 41_000, counter());
    expect(lines.map((l) => l.key)).toEqual([undefined, "s.2", "s.3"]);
    // 남의 줄은 같은 글이어도 따로
    expect(mergeChatLines([mine], [inc("s.4", 10_000, "안녕")], 11_000, counter())).toHaveLength(2);
  });

  it("늦게 받은 줄은 남은 시간만큼만 (1분 지난 줄은 넣지 않는다), 상한을 넘으면 오래된 것부터", () => {
    const lines = mergeChatLines([], [inc("a", 0), inc("b", 30_000)], CHAT_LOG_TTL_MS + 1, counter());
    expect(lines.map((l) => l.key)).toEqual(["b"]);
    expect(visibleChatLines(lines, 30_000 + CHAT_LOG_TTL_MS)).toEqual([]);
    const many = Array.from({ length: CHAT_LOG_KEEP + 3 }, (_, i) => inc(`k${i}`, i));
    const capped = mergeChatLines([], many, 100, counter());
    expect(capped).toHaveLength(CHAT_LOG_KEEP);
    expect(capped[0].key).toBe("k3");
  });
});
