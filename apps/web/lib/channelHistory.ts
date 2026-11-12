import { readItem, writeItem } from "./storage";

// 채널 이동 창의 "마지막에 있던 채널" 표시용: 지금 채널과 그 전에 있던 채널을 이 기기에 기억한다 (세션을 넘어서도).

const CURRENT_KEY = "tomb.ui.channelNow";
const PREVIOUS_KEY = "tomb.ui.channelPrev";

const asChannel = (v: string | null): number | null => {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n >= 1 ? n : null;
};

/** 지금 들어온 채널을 기록한다. 바뀌었으면 원래 채널이 "마지막에 있던 채널"이 된다 */
export function rememberChannel(channel: number): void {
  const now = asChannel(readItem(CURRENT_KEY));
  if (now === channel) return;
  if (now !== null) writeItem(PREVIOUS_KEY, String(now));
  writeItem(CURRENT_KEY, String(channel));
}

/** 지금 채널 말고 마지막에 있던 채널 (없거나 지금과 같으면 null) */
export function lastChannel(current: number | null): number | null {
  const prev = asChannel(readItem(PREVIOUS_KEY));
  return prev !== null && prev !== current ? prev : null;
}
