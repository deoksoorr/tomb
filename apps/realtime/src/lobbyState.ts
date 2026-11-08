import { EMPTY_CHANNEL_HIDE_MS, type ChannelInfo, type LobbyInfo } from "@tomb/protocol";
import type { Config } from "./config";

// 로비 판정 (순수 함수). LobbyDO는 채널 인원을 받아 이 상태를 고치고 저장만 한다. 테스트: lobbyState.test.ts

export type ChannelRec = {
  count: number;
  /** 마지막으로 사람이 있던 시각. 비면 이때부터 EMPTY_CHANNEL_HIDE_MS 동안 목록에 남긴다 */
  lastNonEmptyAt: number;
  /** 자동으로 열린 시각. 비어 있어도 이때부터 EMPTY_CHANNEL_HIDE_MS 동안 목록에 남긴다 */
  openedAt: number;
};

/** 채널 id → 기록. storage에 그대로 스냅샷한다 */
export type LobbyState = { channels: Record<number, ChannelRec> };

export type LobbyConfig = Pick<Config, "capacity" | "maxChannels" | "threshold">;

export const emptyLobby = (): LobbyState => ({ channels: {} });

/** 채널 인원을 반영한다. 인원이 바뀌었으면 true (저장 필요) */
export function applyReport(s: LobbyState, id: number, count: number, now: number): boolean {
  const prev = s.channels[id];
  const prevCount = prev?.count ?? 0;
  s.channels[id] = {
    count,
    lastNonEmptyAt: count > 0 || prevCount > 0 ? now : (prev?.lastNonEmptyAt ?? 0),
    openedAt: prev?.openedAt ?? 0,
  };
  return count !== prevCount;
}

/**
 * GET /lobby 응답을 만든다. 표시(open) 규칙:
 * - 1채널은 항상 표시
 * - 사람이 있는 채널은 표시
 * - 빈 채널은 마지막으로 사람이 있던 때(또는 자동으로 열린 때)부터 5분 동안 표시하고 그 뒤 숨긴다
 * - 표시 중인 채널이 모두 threshold 이상 차면 아직 열리지 않은 다음 채널을 연다
 *   (새로 연 채널은 비어 있으므로 한 번에 하나씩만 열린다)
 * 자동으로 연 채널이 있으면 s를 고치고 opened에 그 id를 돌려준다(저장 필요).
 */
export function computeLobby(s: LobbyState, cfg: LobbyConfig, now: number): { info: LobbyInfo; opened: number | null } {
  const channels: ChannelInfo[] = [];
  let total = 0;
  for (let id = 1; id <= cfg.maxChannels; id++) {
    const r = s.channels[id];
    const count = r?.count ?? 0;
    const recent = r !== undefined && (now - r.lastNonEmptyAt < EMPTY_CHANNEL_HIDE_MS || now - r.openedAt < EMPTY_CHANNEL_HIDE_MS);
    channels.push({ id, count, cap: cfg.capacity, open: id === 1 || count > 0 || recent });
    total += count;
  }

  let opened: number | null = null;
  const busyLine = cfg.capacity * cfg.threshold;
  if (channels.every((c) => !c.open || c.count >= busyLine)) {
    const next = channels.find((c) => !c.open);
    if (next) {
      next.open = true;
      s.channels[next.id] = { ...(s.channels[next.id] ?? { count: 0, lastNonEmptyAt: 0 }), openedAt: now };
      opened = next.id;
    }
  }

  return {
    info: { channels, total, totalCap: cfg.capacity * cfg.maxChannels, maxChannels: cfg.maxChannels, threshold: cfg.threshold },
    opened,
  };
}
