import type { Metadata } from "next";

export const SITE_TITLE = "한때는...";
export const SITE_DESCRIPTION = "수많은 시작이 여기 잠들어 있습니다.";

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
