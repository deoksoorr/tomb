import type { Metadata } from "next";

export const SITE_TITLE = "한때는...";
export const SITE_DESCRIPTION =
  "한때는...은 누구나 한때 시작했다 그만둔 것들이 잠든 공동묘지 컨셉의 도트 마을입니다. 다른 사람들과 실시간으로 모여 모닥불 앞에서 쉬고, 사냥과 미니게임으로 포인트를 모아 내 집을 꾸며 보세요. 설치 없이 브라우저에서 바로.";

// 페이지가 openGraph를 덮어쓰면 레이아웃 값이 통째로 바뀌므로 공유 카드 필드는 매번 전부 채운다.
export function shareMetadata(image: string): Metadata {
  return {
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_TITLE,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: image, alt: SITE_TITLE }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [image],
    },
  };
}

const GRAVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** `?grave=` / `/grave/[id]` 값 검증. 형식이 다르면 무시한다 */
export function graveIdParam(value: string | string[] | undefined): string | null {
  const id = Array.isArray(value) ? value[0] : value;
  return id && GRAVE_ID_RE.test(id) ? id : null;
}

export const graveOgImage = (id: string) => `/api/og?grave=${id}`;

/** 배포 주소. metadataBase·sitemap·robots·llms.txt·JSON-LD가 모두 이 기준을 쓴다 */
export function siteUrl(): URL {
  const host =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (!host) return new URL("http://localhost:3000");
  return new URL(/^https?:\/\//.test(host) ? host : `https://${host}`);
}

/** 경로 → 절대 주소 */
export const absoluteUrl = (path: string): string => new URL(path, siteUrl()).toString();

/** 운영 배포에서만 검색에 노출한다 (미리보기·테스트 서버는 막는다) */
export const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

/** 안내 페이지 숫자의 기준일 */
export const FACTS_DATE = "2026-11-13";

/** 공개 안내 페이지 목록 (sitemap·llms.txt·페이지끼리 링크가 함께 쓴다). h1과 같은 문구 */
export const GUIDE_PAGES = [
  { path: "/guide/work-music", h1: "일할 때 틀어 두는 노동요 사이트", summary: "로파이·재즈·어쿠스틱 기타 55곡 배경음악을 무료로 틀어 두는 법" },
  { path: "/guide/cowork", h1: "재택근무할 때 같이 일하는 느낌 나는 사이트", summary: "다른 사람들과 한 마을에 앉아 '일하는 중'을 띄워 두는 법" },
  { path: "/guide/browser-game", h1: "설치 없이 하는 브라우저 도트 멀티 게임", summary: "설치·가입 없이 브라우저에서 바로 하는 실시간 멀티 도트 마을" },
  { path: "/guide/bulmeong", h1: "모닥불·빗소리 불멍 사이트", summary: "모닥불 곁에 앉아 불멍하고 잔잔한 음악을 틀어 두는 법" },
  { path: "/faq", h1: "자주 묻는 질문", summary: "무료인지, 설치·가입, 모바일, 인원, 음악, 포인트에 대한 답" },
] as const;

/** 안내 페이지 메타데이터: 자기 주소 canonical + 페이지 문구로 채운 공유 카드 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  const image = "/api/og";
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_TITLE,
      url: path,
      title,
      description,
      images: [{ url: image, alt: SITE_TITLE }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** JSON-LD를 <script>로 넣을 문자열 (`<`를 이스케이프해 스크립트 주입을 막는다) */
export const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
