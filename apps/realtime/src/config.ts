import {
  DEFAULT_AUTO_OPEN_THRESHOLD,
  DEFAULT_CHANNEL_CAPACITY,
  DEFAULT_MAX_CHANNELS,
  DEFAULT_RECONNECT_GRACE_SEC,
} from "@tomb/protocol";
import type { ChannelDO } from "./ChannelDO";
import type { LobbyDO } from "./LobbyDO";

// Worker 환경변수와 바인딩. 용량 관련 값은 wrangler.toml [vars]로 조정하고,
// JOIN_SECRET·ALLOWED_ORIGINS는 운영에서 `wrangler secret put`으로만 넣는다
// ([vars]에 같은 이름을 두면 secret과 충돌해 배포가 실패한다). 로컬은 dev 스크립트의 --var.

export interface Env {
  CHANNEL: DurableObjectNamespace<ChannelDO>;
  LOBBY: DurableObjectNamespace<LobbyDO>;
  /** Vercel /api/join과 같은 값. 입장 토큰 HMAC 키 */
  JOIN_SECRET?: string;
  /** 쉼표로 구분한 허용 Origin 목록 (예: https://example.com,https://www.example.com) */
  ALLOWED_ORIGINS?: string;
  CHANNEL_CAPACITY?: string;
  MAX_CHANNELS?: string;
  AUTO_OPEN_THRESHOLD?: string;
  RECONNECT_GRACE_SEC?: string;
}

export type Config = {
  /** 채널당 최대 인원 (접속 중 + 재연결 유예 예약) */
  capacity: number;
  maxChannels: number;
  /** 열린 채널이 모두 이 비율 이상 차면 다음 채널을 연다 */
  threshold: number;
  /** 재연결 유예 (ms) */
  graceMs: number;
};

type ConfigVars = Pick<Env, "CHANNEL_CAPACITY" | "MAX_CHANNELS" | "AUTO_OPEN_THRESHOLD" | "RECONNECT_GRACE_SEC">;

/** 숫자가 아니거나 범위를 벗어난 값은 기본값으로 되돌린다 (잘못된 설정으로 서버가 죽지 않게) */
function num(raw: string | undefined, def: number, min: number, max: number, int: boolean): number {
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || n < min || n > max) return def;
  return n;
}

export function readConfig(env: ConfigVars): Config {
  return {
    capacity: num(env.CHANNEL_CAPACITY, DEFAULT_CHANNEL_CAPACITY, 1, 1000, true),
    maxChannels: num(env.MAX_CHANNELS, DEFAULT_MAX_CHANNELS, 1, 100, true),
    threshold: num(env.AUTO_OPEN_THRESHOLD, DEFAULT_AUTO_OPEN_THRESHOLD, 0.05, 1, false),
    graceMs: num(env.RECONNECT_GRACE_SEC, DEFAULT_RECONNECT_GRACE_SEC, 0, 600, false) * 1000,
  };
}

/** DO를 처음 만들 때만 의미가 있다. 한국 사용자와 가까운 아시아·태평양 지역에 배치한다. */
export const LOCATION_HINT: DurableObjectLocationHint = "apac";

export function channelStub(env: Env, n: number) {
  return env.CHANNEL.get(env.CHANNEL.idFromName(`ch-${n}`), { locationHint: LOCATION_HINT });
}

export function lobbyStub(env: Env) {
  return env.LOBBY.get(env.LOBBY.idFromName("lobby"), { locationHint: LOCATION_HINT });
}
