import { REALTIME_HTTP_URL } from "./realtime";

// 서버 전용 환경변수. 모듈 로드 시점이 아니라 사용할 때 읽는다.
// → 빌드 단계에 시크릿이 없어도 되고, 테스트에서 process.env를 바꿔 끼울 수 있다.

const isProd = () => process.env.NODE_ENV === "production";

function read(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** 운영에서 빠지면 사용 시점에 실패시킨다(500 + 로그). 로컬에서는 계정 없이 돌도록 개발용 기본값을 쓴다. */
function required(name: string, devFallback: string): string {
  const v = read(name);
  if (v) return v;
  if (isProd()) throw new Error(`[env] ${name} 환경변수가 없습니다. Vercel 프로젝트 설정에 추가하세요.`);
  return devFallback;
}

export const env = {
  isProd,
  sessionSecret: () => required("SESSION_SECRET", "dev-session-secret-change-me"),
  /** realtime(wrangler dev)의 개발용 기본값과 같아야 로컬 입장이 된다 */
  joinSecret: () => required("JOIN_SECRET", "dev-join-secret-change-me"),
  adminKey: () => required("ADMIN_KEY", "dev-admin"),

  /** Vercel Marketplace(KV_*)와 Upstash 콘솔(UPSTASH_*) 두 이름을 모두 받는다 */
  redis(): { url: string; token: string } | null {
    const url = read("KV_REST_API_URL") ?? read("UPSTASH_REDIS_REST_URL");
    const token = read("KV_REST_API_TOKEN") ?? read("UPSTASH_REDIS_REST_TOKEN");
    return url && token ? { url, token } : null;
  },

  blobToken: () => read("BLOB_READ_WRITE_TOKEN"),

  /** 브라우저가 접속할 실시간 서버 주소. 운영에서 빠지면 입장 토큰의 wsUrl이 localhost가 되므로 실패시킨다 */
  realtimePublicUrl: () => required("NEXT_PUBLIC_REALTIME_URL", REALTIME_HTTP_URL).replace(/\/$/, ""),
  realtimeWsUrl: (): string => env.realtimePublicUrl().replace(/^http/, "ws"),
  /** 서버에서 로비를 조회할 주소. 내부망 주소가 따로 있으면 REALTIME_INTERNAL_URL로 덮어쓴다 */
  realtimeHttpUrl: (): string => read("REALTIME_INTERNAL_URL")?.replace(/\/$/, "") ?? env.realtimePublicUrl(),

  /** MemoryStore가 처음 뜰 때 심는 목업 묘비 수 */
  mockGraves(): number {
    const n = Number(read("MOCK_GRAVES") ?? 30);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 5000) : 30;
  },
};
