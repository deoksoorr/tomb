import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import type { VersionResponse } from "@/lib/types";

/** 지금 배포의 식별자 (no-store). 클라이언트가 빌드 때 값과 다르면 새로고침을 안내한다 */
export const GET = handler(async () => json<VersionResponse>({ version: env.appVersion() }));
