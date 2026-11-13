import { describe, expect, it } from "vitest";
import { CHAT_CHIME_GAP_MS, createChatChimer, parseChatChime } from "./chatChime";

const other = { mine: false, added: true, shown: true, enabled: true };

describe("채팅 알림음", () => {
  it("다른 사람의 새 채팅에만 울린다 — 내 글·지난 기록으로 이미 받은 줄은 안 울림", () => {
    let n = 0;
    const chime = createChatChimer(() => n++);
    expect(chime({ ...other, mine: true }, 0)).toBe(false);
    expect(chime({ ...other, added: false }, 1000)).toBe(false);
    expect(n).toBe(0);
    expect(chime(other, 2000)).toBe(true);
    expect(n).toBe(1);
  });

  it("0.6초 안에 연달아 오면 한 번만", () => {
    let n = 0;
    const chime = createChatChimer(() => n++);
    expect(chime(other, 0)).toBe(true);
    expect(chime(other, 200)).toBe(false);
    expect(chime(other, CHAT_CHIME_GAP_MS - 1)).toBe(false);
    expect(chime(other, CHAT_CHIME_GAP_MS)).toBe(true);
    expect(n).toBe(2);
  });

  it("끄거나 채팅창이 숨은 장면이면 안 울림 (안 울린 건 간격을 잡아먹지 않는다)", () => {
    let n = 0;
    const chime = createChatChimer(() => n++);
    expect(chime({ ...other, enabled: false }, 0)).toBe(false);
    expect(chime({ ...other, shown: false }, 100)).toBe(false);
    expect(n).toBe(0);
    expect(chime(other, 200)).toBe(true);
  });

  it("저장값: 기본 켜짐, \"0\"이면 꺼짐", () => {
    expect(parseChatChime(null)).toBe(true);
    expect(parseChatChime("1")).toBe(true);
    expect(parseChatChime("0")).toBe(false);
  });
});
