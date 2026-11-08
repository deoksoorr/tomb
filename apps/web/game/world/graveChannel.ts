import type { NetStatus } from "../bridge";

// 채널마다 묘지가 따로다. 지금 화면에 보여 줄 묘지의 채널:
//  - 접속 중·접속 시도 중·재접속 중이면 그 채널
//  - 관람·대기열·오프라인·교체됨(채널 없음)이면 1채널 묘지
// 아직 상태가 없으면(시작 직후) 입장 화면에서 고른 채널, "auto"면 1.

export function graveChannelFor(status: NetStatus | undefined, startChannel: number | "auto"): number {
  if (!status) return typeof startChannel === "number" ? startChannel : 1;
  const live = status.mode === "online" || status.mode === "connecting" || status.mode === "reconnecting";
  return live && typeof status.channel === "number" && status.channel > 0 ? status.channel : 1;
}
