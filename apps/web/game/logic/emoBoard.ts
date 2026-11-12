import { EMOS, isEmoId, type EmoId } from "@tomb/protocol";
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

export { isEmoId };
