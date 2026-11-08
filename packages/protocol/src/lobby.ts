import { DEFAULT_AUTO_OPEN_THRESHOLD } from "./constants";

export type ChannelInfo = {
  id: number; // 1부터
  count: number;
  cap: number;
  /** 목록에 표시되는 채널인지. 1채널은 항상 true */
  open: boolean;
};

/** GET /lobby 응답 */
export type LobbyInfo = {
  channels: ChannelInfo[];
  total: number;
  totalCap: number;
  maxChannels: number;
  threshold: number;
};

export type ChannelStatus = "ok" | "busy" | "full";

/** 여유=초록(ok), 혼잡(threshold 이상)=노랑(busy), 만석=회색(full) */
export function channelStatus(ch: ChannelInfo, threshold = DEFAULT_AUTO_OPEN_THRESHOLD): ChannelStatus {
  if (ch.count >= ch.cap) return "full";
  if (ch.count >= ch.cap * threshold) return "busy";
  return "ok";
}

/**
 * 자동 배정. null이면 전체 만석 → 관람 모드.
 * 1) 혼잡하지 않은 열린 채널 중 가장 사람이 많은 곳 (너무 썰렁하지 않게). 동률이면 낮은 번호.
 * 2) 없으면 아직 열리지 않은 다음 채널.
 * 3) 그것도 없으면 만석이 아닌 채널 중 가장 한산한 곳.
 */
export function pickChannel(lobby: LobbyInfo, exclude: ReadonlySet<number> = new Set()): number | null {
  const threshold = lobby.threshold ?? DEFAULT_AUTO_OPEN_THRESHOLD;
  const usable = lobby.channels.filter((c) => !exclude.has(c.id) && c.count < c.cap);
  const calm = usable
    .filter((c) => c.open && channelStatus(c, threshold) === "ok")
    .sort((a, b) => b.count - a.count || a.id - b.id);
  if (calm.length) return calm[0].id;

  const known = new Set(lobby.channels.map((c) => c.id));
  for (let id = 1; id <= lobby.maxChannels; id++) {
    if (exclude.has(id)) continue;
    const c = lobby.channels.find((x) => x.id === id);
    if ((!c && !known.has(id)) || (c && !c.open && c.count < c.cap)) return id;
  }

  const rest = usable.sort((a, b) => a.count - b.count || a.id - b.id);
  return rest.length ? rest[0].id : null;
}
