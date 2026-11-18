import { readItem, writeItem } from "@/lib/storage";

// 11/17 데스크톱 채팅창 크기 단계. [−]를 누를 때마다 세로로 한 단계씩 줄고, 맨 끝은 입력칸만 남는다 (폭은 그대로).
// 입력칸만 = 기록 숨김 · 작게 = 최근 세 줄 · 보통 = 예전 그대로 · 크게 = 더 길게. 이 브라우저에 기억한다.
// 폰 채팅 상자는 따로라 쓰지 않는다.

export type ChatSize = "input" | "small" | "normal" | "large";
export const CHAT_SIZES: readonly ChatSize[] = ["input", "small", "normal", "large"];
const KEY = "tomb.ui.chatSize";

/** 저장된 값 (없거나 모르는 값이면 보통) */
export function parseChatSize(v: string | null): ChatSize {
  return (CHAT_SIZES as readonly string[]).includes(v ?? "") ? (v as ChatSize) : "normal";
}

/** 한 단계 키우기(+1)·줄이기(-1). 끝에서는 그대로 */
export function stepChatSize(size: ChatSize, dir: 1 | -1): ChatSize {
  const i = CHAT_SIZES.indexOf(size) + dir;
  return CHAT_SIZES[Math.max(0, Math.min(CHAT_SIZES.length - 1, i))];
}

export const readChatSize = (): ChatSize => parseChatSize(readItem(KEY));
export const saveChatSize = (size: ChatSize): void => writeItem(KEY, size);

// 11/18 채팅 기록 바탕 (은은한 반투명). 켜 두는 게 기본이고 [−][+] 왼쪽 [배경]으로 끈다. 폰 채팅 기록도 같은 값을 따른다
const BG_KEY = "tomb.ui.chatBg";
export const readChatBg = (): boolean => readItem(BG_KEY) !== "off";
export const saveChatBg = (on: boolean): void => writeItem(BG_KEY, on ? "on" : "off");
