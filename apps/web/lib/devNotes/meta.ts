import type { Metadata, Viewport } from "next";
import { SITE_TITLE } from "@/app/seo";

/** 개발자 노트 사이트 화면은 밝은 바탕이 기본 (게임 화면은 어두운 바탕) */
export const SITE_VIEWPORT: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

/** 공유 카드까지 채운 페이지 메타데이터 */
export function siteMetadata(o: { title: string; description: string; path: string; image?: string | null }): Metadata {
  const image = o.image ?? "/api/og";
  const full = `${o.title} | ${SITE_TITLE}`;
  return {
    title: full,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_TITLE, title: full, description: o.description, url: o.path, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: full, description: o.description, images: [image] },
  };
}
