import { channelStatus, type LobbyInfo } from "@tomb/protocol";

// 일부러 채널을 옮길 때(채널 메뉴·친구한테 가기·내 집 가기·내 묘비 가기)의 만석 규칙. Phaser·WebSocket 없이 테스트한다.
//  - 떠나기 전에 로비를 보고 꽉 찬 채널이면 옮기지 않는다 (지금 채널·자리 그대로 + 안내)
//  - 그래도 들어가는 순간 꽉 찼으면(경합) 다른 채널로 가지 않고 온 채널로 돌아온다
//  - 돌아갈 채널이 없는 처음 입장·재접속만 예전처럼 다른 채널 → 관람 모드

export const CHANNEL_FULL_MSG = "그 채널이 꽉 차서 갈 수 없어요. 자리가 나면 다시 가 보세요.";

/** 친구한테 가기: 친구가 있는 채널이 꽉 찼다 */
export function friendChannelFullMsg(name: string): string {
  return `${name}님이 있는 채널이 꽉 차서 갈 수 없어요.`;
}

/** 내 집 가기: 내 집이 있는 채널이 꽉 찼다 */
export function houseChannelFullMsg(channel: number): string {
  return `내 집이 있는 ${channel}채널이 꽉 차서 갈 수 없어요. 자리가 나면 다시 가 보세요.`;
}

/**
 * 로비로 본 그 채널이 만석인지 (채널 메뉴의 "만석"과 같은 규칙: count >= cap).
 * 로비가 없거나 목록에 없는(아직 열리지 않은) 채널은 만석이 아니다 — 들어가 보고 서버가 막으면 돌아온다
 * 11/20 운영자(staff)는 정원 밖이라 꽉 찬 채널도 막지 않는다 (실시간 서버도 받는다)
 */
export function lobbyChannelFull(lobby: LobbyInfo | null | undefined, channel: number, staff = false): boolean {
  if (staff) return false;
  const ch = lobby?.channels.find((c) => c.id === channel);
  return !!ch && channelStatus(ch, lobby?.threshold) === "full";
}

