import { describe, expect, it } from "vitest";
import { EMOS, QUEST_EMO_IDS, QUEST_EMO_PACK } from "@tomb/protocol";
import { emoteGrid } from "../sprites/emotes";
import { EMO_BOARD, EMO_GROUPS, emoAllowed, emoIcon, isQuestEmo, ownsQuestEmos } from "./emoBoard";

// 11/15 수집 의뢰 이모티콘 묶음 (qe_pack)

/** 의뢰 묶음 전에 있던 이모티콘 60종 (순서 = 단축키·판 순서 — 바꾸면 안 된다) */
const BEFORE = [
  "heart", "laugh", "cry", "wow", "what", "bang", "clap", "angry", "zzz", "coffee", "fire", "note", "sweat", "idea",
  "grin", "wink", "blank", "panic", "shy", "moved", "tongue", "annoyed", "doubt", "zen", "faint", "yawn", "proud", "gloom",
  "leave", "overtime", "payday", "meeting", "approve", "laptop", "excel", "subway", "vacation", "clockout", "beer", "soju",
  "thumbs", "ok", "thanks", "vein", "lol", "sob", "gg", "party", "gift", "check",
  "sun", "rain", "moon", "rainbow", "flower", "cat", "dog", "ghost", "tomb", "candle",
];

describe("의뢰 이모티콘 묶음", () => {
  it("EMOS: 예전 60종 순서 그대로 + 맨 끝에 의뢰 8종", () => {
    expect(EMOS).toHaveLength(BEFORE.length + 8);
    expect(EMOS.slice(0, BEFORE.length).map((e) => e.id)).toEqual(BEFORE);
    expect(EMOS.slice(-8).map((e) => e.id)).toEqual([...QUEST_EMO_IDS]);
  });

  it("모든 이모티콘에 13×13 그림이 있고 비어 있지 않다", () => {
    for (const e of EMOS) {
      const g = emoteGrid(emoIcon(e.id));
      expect([g.w, g.h], e.id).toEqual([13, 13]);
      let n = 0;
      for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) n++;
      expect(n, e.id).toBeGreaterThan(40);
    }
  });

  it("[의뢰] 묶음 = 의뢰 8종 (판 맨 끝), 나머지 묶음엔 없다", () => {
    const q = EMO_GROUPS.find((g) => g.id === "quest")!;
    expect(q.label).toBe("의뢰");
    expect(q.slots.map((s) => s.id)).toEqual([...QUEST_EMO_IDS]);
    expect(EMO_BOARD.slice(-8).map((s) => s.id)).toEqual([...QUEST_EMO_IDS]);
    for (const g of EMO_GROUPS) if (g.id !== "quest") for (const s of g.slots) expect(isQuestEmo(s.id), s.id).toBe(false);
  });

  it("qe_pack이 있어야 의뢰 이모티콘을 보낸다 (다른 이모티콘은 언제나)", () => {
    expect(ownsQuestEmos(undefined)).toBe(false);
    expect(ownsQuestEmos({})).toBe(false);
    expect(ownsQuestEmos({ [QUEST_EMO_PACK]: 0 })).toBe(false);
    expect(ownsQuestEmos({ [QUEST_EMO_PACK]: 1 })).toBe(true);
    for (const id of QUEST_EMO_IDS) {
      expect(emoAllowed(id, {}), id).toBe(false);
      expect(emoAllowed(id, { [QUEST_EMO_PACK]: 1 }), id).toBe(true);
    }
    expect(emoAllowed("heart", {})).toBe(true);
    expect(emoAllowed("candle", null)).toBe(true);
  });
});
