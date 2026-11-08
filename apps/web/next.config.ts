import type { NextConfig } from "next";

// 빌드에 박아 두는 배포 식별자. GET /api/version(lib/env.ts appVersion)과 같은 규칙이라
// 열어 둔 탭의 값과 서버 값이 다르면 새 배포가 나간 것이다.
const appVersion = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev";

const nextConfig: NextConfig = {
  // 모노레포의 TS 소스 패키지를 그대로 번들한다
  transpilePackages: ["@tomb/protocol"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
};

export default nextConfig;
