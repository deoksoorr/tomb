import { pickChannel, signJoinToken, type LobbyInfo } from "@tomb/protocol";
import { z } from "zod";
import { env } from "./env";
import { HttpError } from "./http";
import type { JoinResponse } from "./types";

const LOBBY_TIMEOUT_MS = 1500;

const count = z.number().int().min(0);
const LobbySchema = z.object({
  channels: z
    .array(z.object({ id: z.number().int().min(1).max(100), count, cap: count, open: z.boolean() }))
    .max(100),
  total: count,
  totalCap: count,
  maxChannels: z.number().int().min(1).max(100),
  threshold: z.number().min(0).max(1),
});

/** 서버에서 로비 조회. 느리거나 실패하거나 형태가 이상하면 null (입장 자체를 막지는 않는다) */
export async function fetchLobbyServer(timeoutMs = LOBBY_TIMEOUT_MS): Promise<LobbyInfo | null> {
  // 주소 설정 누락은 네트워크 실패와 달리 숨기지 않고 던진다
  const url = `${env.realtimeHttpUrl()}/lobby`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) return null;
    const parsed = LobbySchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * 채널 결정. "auto"면 로비를 보고 pickChannel로 고르고(null = 전체 만석 → 관람 모드),
 * 직접 고른 채널은 로비의 maxChannels 범위인지 확인한다.
 * 로비가 응답하지 않으면 auto는 1채널, 직접 고른 채널은 입력 검증(1~99)만으로 보낸다
 * (만석이면 Channel DO가 4001로 거절하고 클라이언트가 다른 채널로 재시도한다).
 */
async function resolveChannel(requested: number | "auto"): Promise<number | null> {
  const lobby = await fetchLobbyServer();
  if (requested === "auto") return lobby ? pickChannel(lobby) : 1;
  if (lobby && requested > lobby.maxChannels)
    throw new HttpError(400, "INVALID_INPUT", `채널은 1~${lobby.maxChannels} 중에서 골라 주세요.`);
  return requested;
}

export async function issueJoin(
  requested: number | "auto",
  claims: { visitorId: string; name: string; color: string },
): Promise<JoinResponse> {
  const wsBase = env.realtimeWsUrl();
  const channel = await resolveChannel(requested);
  if (channel === null) return { mode: "spectator" };

  // 토큰은 배정된 채널 하나에만 유효하다 (토큰 하나로 여러 채널 자리를 차지하지 못하게)
  const token = await signJoinToken(env.joinSecret(), { ...claims, channel });
  return { mode: "channel", channel, token, wsUrl: `${wsBase}/ch/${channel}?t=${encodeURIComponent(token)}` };
}
