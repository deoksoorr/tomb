import { pickChannel, signJoinToken, type LobbyInfo } from "@tomb/protocol";
import { z } from "zod";
import { env } from "./env";
import { HttpError } from "./http";
import type { JoinResponse } from "./types";

const LOBBY_TIMEOUT_MS = 1500;
/** 대기열 토큰: channel 0은 대기열 전용(실시간 서버가 그렇게 검증한다). 10분 동안 자리를 확인할 수 있다 */
const QUEUE_CHANNEL = 0;
const QUEUE_TOKEN_TTL_SEC = 600;

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
 * 채널 결정. "auto"면 로비를 보고 pickChannel로 고르고(null = 전체 만석 → 대기열),
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

/** 입장 토큰 내용. look = 지금 착용 중인 꾸미기 (입장하자마자 다른 사람에게 보이게) */
type Claims = { visitorId: string; name: string; color: string; look: string[] };

/**
 * 입장 토큰 발급. 전체 만석이면 대기열 주소를 준다: 클라이언트가 QUEUE_POLL_MS마다 GET하다가
 * admitted가 오면 그 채널로 /api/join을 다시 부른다.
 */
export async function issueJoin(requested: number | "auto", claims: Claims): Promise<JoinResponse> {
  const wsBase = env.realtimeWsUrl();
  const channel = await resolveChannel(requested);
  if (channel === null) {
    const token = await signJoinToken(env.joinSecret(), { ...claims, channel: QUEUE_CHANNEL }, QUEUE_TOKEN_TTL_SEC);
    return { mode: "queue", queueUrl: `${env.realtimePublicUrl()}/queue?t=${encodeURIComponent(token)}` };
  }

  // 토큰은 배정된 채널 하나에만 유효하다 (토큰 하나로 여러 채널 자리를 차지하지 못하게)
  const token = await signJoinToken(env.joinSecret(), { ...claims, channel });
  return { mode: "channel", channel, token, wsUrl: `${wsBase}/ch/${channel}?t=${encodeURIComponent(token)}` };
}
