import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모노레포의 TS 소스 패키지를 그대로 번들한다
  transpilePackages: ["@tomb/protocol"],
};

export default nextConfig;
