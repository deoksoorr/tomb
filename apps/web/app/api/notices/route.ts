import { handler, json } from "@/lib/http";
import { getNotices } from "@/lib/store";
import { NOTICE_LIST_MAX } from "@/lib/store/notices";
import type { NoticeListResponse } from "@/lib/types";

/**
 * 공지사항 (고정 먼저, 최신 순, 최대 20개). 방문자와 무관하므로 CDN에 캐시한다.
 * 새 공지는 1분 안에 보인다 (Redis 명령을 아끼려고 5초 → 60초. 화면은 10분마다·공지 창을 열 때 받는다)
 */
export const GET = handler(async () =>
  json<NoticeListResponse>(
    { notices: (await getNotices().list()).slice(0, NOTICE_LIST_MAX) },
    { headers: { "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=300", "Cache-Control": "no-store" } },
  ),
);
