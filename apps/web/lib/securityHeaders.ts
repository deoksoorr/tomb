// 보안 머리글 (next.config.ts headers()가 모든 경로에 붙인다). 빌드 때 환경 값으로 정해진다.

/** 주소 문자열에서 출처(scheme://host[:port])만. 비었거나 이상하면 null */
function originOf(raw: string | undefined): string | null {
  try {
    return raw?.trim() ? new URL(raw.trim()).origin : null;
  } catch {
    return null;
  }
}

/**
 * 보안 머리글 (모든 경로). CSP는 Next가 넣는 인라인 스크립트(RSC 데이터) 때문에 script-src에 'unsafe-inline'을 둔다
 * (nonce를 쓰면 모든 화면이 동적 렌더링이 된다). 대신 출처를 우리 것으로만 묶고, 액자 삽입·플러그인·base 바꿔치기를 막는다.
 * 실시간 서버(NEXT_PUBLIC_REALTIME_URL)·배경음 주소(NEXT_PUBLIC_BGM_BASE)는 빌드 때 값으로 허용한다.
 */
export function securityHeaders(e: NodeJS.ProcessEnv = process.env): { key: string; value: string }[] {
  const dev = e.NODE_ENV !== "production";
  // 미리보기(테스트 서버) 배포에는 Vercel 도구 막대(vercel.live)가 붙는다
  const preview = !!e.VERCEL_ENV && e.VERCEL_ENV !== "production";
  const realtime = originOf(e.NEXT_PUBLIC_REALTIME_URL) ?? "http://localhost:8787";
  const realtimeWs = realtime.replace(/^http/, "ws");
  const bgm = originOf(e.NEXT_PUBLIC_BGM_BASE);
  const live = preview ? ["https://vercel.live"] : [];
  const src = (...xs: (string | null | false)[]) => xs.filter(Boolean).join(" ");

  const csp = [
    "default-src 'self'",
    `script-src ${src("'self'", "'unsafe-inline'", dev && "'unsafe-eval'", ...live)}`,
    `style-src ${src("'self'", "'unsafe-inline'", ...live)}`,
    `img-src ${src("'self'", "data:", "blob:", "https://*.public.blob.vercel-storage.com", ...live, preview && "https://vercel.com")}`,
    `font-src ${src("'self'", "data:", ...live, preview && "https://assets.vercel.com")}`,
    `media-src ${src("'self'", "data:", "blob:", bgm)}`,
    `connect-src ${src("'self'", realtime, realtimeWs, bgm, "https://vercel.com", "https://*.blob.vercel-storage.com", ...live, preview && "wss://ws-us3.pusher.com", dev && "ws:")}`,
    "worker-src 'self' blob:",
    `frame-src ${src("'self'", ...live)}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}
