import { EMOS, isEmoId, QUEST_EMO_IDS, QUEST_EMO_PACK, type EmoId } from "@tomb/protocol";
import type { EmoteIcon } from "../sprites/emotes";

// 5번 이모티콘 판: 손 흔들기·환호(몸짓, act)가 1·2번, 이모티콘(emo)이 3번부터. 단축키 1~9 = 판의 1~9번 칸.
// 게임 키(Keyboard: Digit1~9)와 이모티콘 창(SayDialog)이 같은 순서를 쓴다.

export type EmoSlot = { kind: "act"; id: "wave" | "cheer"; label: string; icon: EmoteIcon } | { kind: "emo"; id: EmoId; label: string; icon: EmoteIcon };

/** 이모티콘 id → 머리 위 그림 (음표는 어두운 말풍선에서도 보이게 밝은 그림을 따로 쓴다) */
export function emoIcon(id: EmoId): EmoteIcon {
  return id === "note" ? "tune" : id;
}

export const EMO_BOARD: readonly EmoSlot[] = [
  { kind: "act", id: "wave", label: "손 흔들기", icon: "wave" },
  { kind: "act", id: "cheer", label: "환호", icon: "cheer" },
  ...EMOS.map((e): EmoSlot => ({ kind: "emo", id: e.id, label: e.label, icon: emoIcon(e.id) })),
];

/** 판의 묶음 (표현 창 이모티콘 탭의 작은 탭·제목). 판의 모든 칸이 꼭 한 묶음에 들어간다 (polish.test.ts) */
export type EmoGroupId = "basic" | "face" | "work" | "react" | "nature" | "quest";
export type EmoGroup = { id: EmoGroupId; label: string; slots: readonly EmoSlot[] };

const GROUP_IDS: readonly [EmoGroupId, string, readonly EmoSlot["id"][]][] = [
  ["basic", "기본", ["wave", "cheer", "heart", "laugh", "cry", "wow", "what", "bang", "clap", "angry", "zzz", "coffee", "fire", "note", "sweat", "idea"]],
  ["face", "얼굴", ["grin", "wink", "blank", "panic", "shy", "moved", "tongue", "annoyed", "doubt", "zen", "faint", "yawn", "proud", "gloom"]],
  ["work", "회사", ["leave", "overtime", "payday", "meeting", "approve", "laptop", "excel", "subway", "vacation", "clockout", "beer", "soju"]],
  ["react", "반응", ["thumbs", "ok", "thanks", "vein", "lol", "sob", "gg", "party", "gift", "check"]],
  ["nature", "자연·묘역", ["sun", "rain", "moon", "rainbow", "flower", "cat", "dog", "ghost", "tomb", "candle"]],
  // 11/15 수집 의뢰 이모티콘 묶음 (qe_pack을 가진 계정만 보낸다 — 아니면 창에서 잠금)
  ["quest", "의뢰", [...QUEST_EMO_IDS]],
];

export const EMO_GROUPS: readonly EmoGroup[] = GROUP_IDS.map(([id, label, ids]) => ({
  id,
  label,
  slots: ids.map((sid) => EMO_BOARD.find((s) => s.id === sid)).filter((s): s is EmoSlot => !!s),
}));

/** 단축키가 붙는 칸 수 (1~9) */
export const EMO_HOTKEYS = 9;

/** 단축키 숫자(1~9) → 판의 칸. 범위 밖이면 null */
export function emoSlotOfKey(n: number): EmoSlot | null {
  return Number.isInteger(n) && n >= 1 && n <= EMO_HOTKEYS ? (EMO_BOARD[n - 1] ?? null) : null;
}

/** 이모티콘이 머리 위에 떠 있는 시간 (말풍선 SAY_MS 4초보다 조금 짧게) */
export const EMO_SHOW_MS = 3500;
/** 내 화면 쿨다운 (서버 EMO_INTERVAL_MS와 같다 — 연타는 내 화면에도 안 뜬다) */
export const EMO_COOLDOWN_MS = 1000;

// ── 11/15 수집 의뢰 이모티콘 묶음: 가방에 qe_pack이 있어야 보낸다. 실시간 서버는 소유를 모르므로 화면에서만 막는다 ──

/** 잠긴 묶음 안내 (도장 교환소 값) */
export const QUEST_EMO_HINT = "수집 의뢰 도장 20개";
const questSet = new Set<string>(QUEST_EMO_IDS);
/** 의뢰 이모티콘(qe_pack 전용)인지 */
export function isQuestEmo(id: string): boolean {
  return questSet.has(id);
}
/** 가방(me.inventory)에 의뢰 이모티콘 묶음이 있는지 */
export function ownsQuestEmos(inventory: Readonly<Record<string, number>> | null | undefined): boolean {
  return (inventory?.[QUEST_EMO_PACK] ?? 0) > 0;
}
/** 이 계정이 보낼 수 있는 이모티콘인지 (의뢰 이모티콘은 묶음을 가졌을 때만) */
export function emoAllowed(id: string, inventory: Readonly<Record<string, number>> | null | undefined): boolean {
  return !isQuestEmo(id) || ownsQuestEmos(inventory);
}

export { isEmoId };
