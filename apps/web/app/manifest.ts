import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "./seo";

// 크롬 '앱 설치/바로가기 만들기'·안드로이드 홈 화면용 웹 앱 설정 (/manifest.webmanifest)
// 아이콘 그림은 scripts/gen-icons.mjs로 만든다 (후보 번호를 인자로 바꿔 다시 생성)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "한때는...",
    short_name: "한때는",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1e1f1b",
    theme_color: "#1e1f1b",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // 안드로이드가 원·둥근 사각형으로 잘라 쓰는 아이콘 (그림은 가운데 안전 영역 안)
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
