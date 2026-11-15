import { MIN_CLIENT_VERSION } from "@tomb/protocol";
import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import type { VersionResponse } from "@/lib/types";
import { VERSION_CDN_SEC } from "@/lib/update";

/**
 * 지금 배포의 식별자. 클라이언트가 빌드 때 값과 다르면 새로고침을 안내하고,
 * minClient(= 이 배포의 MIN_CLIENT_VERSION)가 자기 CLIENT_VERSION보다 크면 게임을 가리는 업데이트 창을 띄운다.
 * 값은 배포마다 고정이라 CDN이 잠깐 캐시한다(열린 탭이 90초마다 물어도 함수·저장소 호출이 늘지 않게).
 * Vercel CDN 캐시 키에는 배포가 들어가 새 배포는 곧바로 새 값을 준다. 브라우저는 no-store로 묻는다(lib/api.ts).
 */
export const GET = handler(async () =>
  json<VersionResponse>(
    { version: env.appVersion(), minClient: MIN_CLIENT_VERSION },
    { headers: { "Cache-Control": `public, max-age=0, s-maxage=${VERSION_CDN_SEC}` } },
  ),
);
