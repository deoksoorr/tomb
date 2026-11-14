import { handler, json } from "@/lib/http";
import type { ResidentSettings } from "@/lib/residents";
import { getResidentSettings } from "@/lib/store/residents";

/** 돌아다니는 마을 주민 설정 (켜기/끄기·주민 수). 게임이 10분마다 가볍게 확인한다 — 모두 같은 값이라 CDN에 5분 캐시 */
export const GET = handler(async () =>
  json<ResidentSettings>(await getResidentSettings().get(), {
    headers: {
      "Vercel-CDN-Cache-Control": "max-age=300, stale-while-revalidate=600",
      "Cache-Control": "no-store",
    },
  }),
);
