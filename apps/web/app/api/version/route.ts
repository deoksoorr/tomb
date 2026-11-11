import { MIN_CLIENT_VERSION } from "@tomb/protocol";
import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import type { VersionResponse } from "@/lib/types";

/**
 * 지금 배포의 식별자 (no-store). 클라이언트가 빌드 때 값과 다르면 새로고침을 안내하고,
 * minClient(= 이 배포의 MIN_CLIENT_VERSION)가 자기 CLIENT_VERSION보다 크면 게임을 가리는 업데이트 창을 띄운다.
 */
export const GET = handler(async () => json<VersionResponse>({ version: env.appVersion(), minClient: MIN_CLIENT_VERSION }));
