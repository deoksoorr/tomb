import { describe, expect, it, vi } from "vitest";
import { CHAT_SHOW_MS } from "@tomb/protocol";
import { wrapChat } from "../logic/chatWrap";

// 말풍선 자유 채팅: 한 아바타의 말풍선 자리는 하나 — 새 채팅·정해진 문장·이모티콘이 오면 이전 것은 바로 바뀐다.

vi.mock("phaser", () => ({}));
vi.mock("../assets/manifest", () => ({ TEX: { pixel: "pixel" }, addCanvasTexture: () => {} }));
vi.mock("../text/GlyphAtlas", () => ({ FONT_KEY: "f", FONT_PX: 12 }));
vi.mock("../sprites/emotes", () => ({ EMOTE_ICONS: [], emoteGrid: () => ({}), emoteTexKey: (k: string) => `emo-${k}` }));

/** 무엇을 불러도 자기 자신을 돌려주는 가짜 게임 오브젝트 (글자는 기억한다) */
function fakeObject() {
  const o: Record<string, unknown> = { width: 10, height: 10, displayHeight: 10, visible: false, text: "" };
  const proxy: Record<string, unknown> = new Proxy(o, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "setText") return (s: string) => ((t.text = s), proxy);
      if (k === "setVisible") return (v: boolean) => ((t.visible = v), proxy);
      return () => proxy;
    },
  });
  return proxy;
}

async function bubble() {
  const { SpeechBubble, SAY_MS } = await import("./SpeechBubble");
  const texts: Record<string, unknown>[] = [];
  const chats: Record<string, unknown>[] = [];
  const scene = {
    add: {
      image: () => fakeObject(),
      text: () => {
        const t = fakeObject();
        chats.push(t);
        return t;
      },
      bitmapText: () => {
        const t = fakeObject();
        texts.push(t);
        return t;
      },
    },
    textures: { exists: () => true },
  };
  const atlas = { ensure: () => {} };
  const b = new SpeechBubble(scene as never, atlas as never);
  return { b, text: () => texts[0].text as string, chats, texts, SAY_MS };
}

describe("말풍선 교체", () => {
  it("자유 채팅은 CHAT_SHOW_MS 동안, 정해진 문장은 SAY_MS 동안 뜬다", async () => {
    const { b, SAY_MS } = await bubble();
    b.show("안녕", 0, CHAT_SHOW_MS);
    expect(b.active(CHAT_SHOW_MS - 1)).toBe(true);
    expect(b.active(CHAT_SHOW_MS)).toBe(false);
    b.show("정해진 문장", 10_000);
    expect(b.active(10_000 + SAY_MS - 1)).toBe(true);
    expect(b.active(10_000 + SAY_MS)).toBe(false);
  });

  it("연속으로 치면 이전 말풍선은 바로 새 글로 바뀌고 시간도 새로 센다", async () => {
    const { b, text } = await bubble();
    b.show("첫 번째", 0, CHAT_SHOW_MS);
    b.show("두 번째", 4_000, CHAT_SHOW_MS);
    expect(text()).toBe("두 번째");
    expect(b.active(CHAT_SHOW_MS + 3_000)).toBe(true);
    expect(b.active(4_000 + CHAT_SHOW_MS)).toBe(false);
  });

  it("이모티콘이 오면 같은 자리의 채팅을 바꾸고, 다시 채팅이 오면 채팅으로 바뀐다", async () => {
    const { b, text } = await bubble();
    b.show("안녕", 0, CHAT_SHOW_MS);
    b.showIcon("wave" as never, 1_000, 1_800);
    expect(b.active(2_799)).toBe(true);
    expect(b.active(2_800)).toBe(false); // 채팅의 남은 시간은 이어지지 않는다
    b.show("다시", 3_000, CHAT_SHOW_MS);
    expect(text()).toBe("다시");
    expect(b.active(3_000 + CHAT_SHOW_MS - 1)).toBe(true);
  });
});

describe("말풍선 글꼴", () => {
  it("자유 채팅만 Pretendard 글자(따로 만든 글자 오브젝트)로, 정해진 문장은 비트맵 글자로 그린다", async () => {
    const { b, chats, texts } = await bubble();
    b.show("정해진 문장", 0);
    expect(chats).toHaveLength(0);
    b.showChat("안녕하세요", 1_000, CHAT_SHOW_MS);
    expect(chats).toHaveLength(1);
    expect(chats[0].text).toBe("안녕하세요");
    expect(texts[0].visible).toBe(false);
    expect(b.active(1_000 + CHAT_SHOW_MS - 1)).toBe(true);
    b.show("다시 정해진 문장", 2_000);
    expect(chats[0].visible).toBe(false);
    expect(texts[0].text).toBe("다시 정해진 문장");
  });
});

describe("말풍선 줄 나누기", () => {
  it("짧으면 그대로, 길면 띄어쓰기에서 끊고 띄어쓰기가 없으면 글자 수로 자른다", () => {
    expect(wrapChat("안녕하세요")).toBe("안녕하세요");
    expect(wrapChat("오늘 날씨가 정말 좋네요 산책하러 나왔어요")).toBe("오늘 날씨가 정말 좋네요\n산책하러 나왔어요");
    expect(wrapChat("가".repeat(40))).toBe(["가".repeat(14), "가".repeat(14), "가".repeat(12)].join("\n"));
  });
});
