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

  // ── Vercel Blob: 두 연결 방식을 모두 받는다 ──
  // 1) 읽기쓰기 토큰 BLOB_READ_WRITE_TOKEN (`vercel_blob_rw_<storeId>_<secret>`)
  // 2) OIDC: BLOB_STORE_ID(`store_<storeId>`) + 런타임에 Vercel이 주는 OIDC 토큰 (SDK가 알아서 읽는다)
  /** 있으면 SDK 호출에 명시적으로 넘기고, 없으면 넘기지 않아 SDK가 OIDC로 인증하게 둔다 */
  blobToken: () => read("BLOB_READ_WRITE_TOKEN"),
  /** 스토어 id. @vercel/blob과 같은 규칙: 토큰의 네 번째 조각, 또는 BLOB_STORE_ID에서 `store_` 접두사를 뗀 값 */
  blobStoreId(): string | undefined {
    const id = read("BLOB_READ_WRITE_TOKEN")?.split("_")[3] || read("BLOB_STORE_ID");
    return id?.replace(/^store_/, "") || undefined;
  },
  blobEnabled: (): boolean => !!env.blobStoreId(),
  blobWebhookKey: () => read("BLOB_WEBHOOK_PUBLIC_KEY"),

  /** 브라우저가 접속할 실시간 서버 주소. 운영에서 빠지면 입장 토큰의 wsUrl이 localhost가 되므로 실패시킨다 */
  realtimePublicUrl: () => required("NEXT_PUBLIC_REALTIME_URL", REALTIME_HTTP_URL).replace(/\/$/, ""),
  realtimeWsUrl: (): string => env.realtimePublicUrl().replace(/^http/, "ws"),
  /** 서버에서 로비를 조회할 주소. 내부망 주소가 따로 있으면 REALTIME_INTERNAL_URL로 덮어쓴다 */
  realtimeHttpUrl: (): string => read("REALTIME_INTERNAL_URL")?.replace(/\/$/, "") ?? env.realtimePublicUrl(),

  /** 관리자 화면·API에 들어올 수 있는 IP 목록 (쉼표 구분, CIDR 가능). 규칙은 lib/ipAllow.ts */
  adminAllowedIps: () => read("ADMIN_ALLOWED_IPS"),

  /** 배포 식별자 (next.config.ts의 NEXT_PUBLIC_APP_VERSION과 같은 규칙). 클라이언트가 자기 빌드 값과 비교해 새 버전을 안내한다 */
  appVersion: () => read("VERCEL_DEPLOYMENT_ID") ?? read("VERCEL_GIT_COMMIT_SHA") ?? "dev",

  /** MemoryStore가 처음 뜰 때 심는 목업 묘비 수 */
  mockGraves(): number {
    const n = Number(read("MOCK_GRAVES") ?? 30);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 5000) : 30;
  },
};
