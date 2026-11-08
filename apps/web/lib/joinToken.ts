import { pickChannel, signJoinToken, type LobbyInfo } from "@tomb/protocol";
import { z } from "zod";
import { env } from "./env";
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
 * 자동 배정. 로비가 응답하지 않으면 1채널로 보낸다
 * (만석이면 Channel DO가 4001로 거절하고 클라이언트가 다른 채널로 재시도한다). null = 전체 만석.
 */
async function autoChannel(): Promise<number | null> {
  const lobby = await fetchLobbyServer();
  return lobby ? pickChannel(lobby) : 1;
}

export async function issueJoin(
  requested: number | "auto",
  claims: { visitorId: string; name: string; color: string },
): Promise<JoinResponse> {
  const wsBase = env.realtimeWsUrl();
  const channel = requested === "auto" ? await autoChannel() : requested;
  if (channel === null) return { mode: "spectator" };

  const token = await signJoinToken(env.joinSecret(), claims);
  return { mode: "channel", channel, token, wsUrl: `${wsBase}/ch/${channel}?t=${encodeURIComponent(token)}` };
}
