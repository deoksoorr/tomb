import { rateLimit } from "@/lib/ratelimit";
import { handler, json } from "@/lib/http";
import { getNotices } from "@/lib/store";
import { NOTICE_LIST_MAX } from "@/lib/store/notices";
import type { NoticeListResponse } from "@/lib/types";

/**
 * 공지사항 (고정 먼저, 최신 순, 최대 20개). 방문자와 무관하므로 CDN에 캐시한다.
 * 새 공지는 1분 안에 보인다 (Redis 명령을 아끼려고 5초 → 60초. 화면은 10분마다·공지 창을 열 때 받는다)
 */
export const GET = handler(async (req) => {
  // 공개 조회: 쿼리를 바꿔 CDN 캐시를 건너뛰는 반복 호출 방지 (메모리 한도)
  await rateLimit("publicGet", req);
  return json<NoticeListResponse>(
    // 게임은 제목·첫 문단·시각·고정만 쓴다 (11/20 개발자 노트 요약·대표 이미지는 싣지 않는다. 꼭지는 notice:doc에 따로 저장).
    // rich: 정적 글을 관리자 편집기로 고친 글이면 게임 화면 제목도 고친 제목으로 (lib/devNotes/titles)
    {
      notices: (await getNotices().list())
        .slice(0, NOTICE_LIST_MAX)
        .map(({ id, title, body, createdAt, pinned, rich }) => ({ id, title, body, createdAt, pinned, ...(rich ? { rich } : {}) })),
    },
    { headers: { "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=300", "Cache-Control": "no-store" } },
  );
});
