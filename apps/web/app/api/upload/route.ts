import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isUploadPathFor, MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPE, UPLOAD_TOKEN_TTL_MS, uploadPrefix } from "@/lib/blob";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { UploadModeResponse } from "@/lib/types";
import { BlobTokenRequestSchema, readBody } from "@/lib/validate";

/**
 * 업로드 방식과 이 방문자의 업로드 폴더. Blob 토큰이 없으면 로컬 대체 경로(/api/upload/local)를 쓴다.
 * Blob 모드에서는 `${prefix}<이름>.webp` 경로로만 올릴 수 있다 (이름: 영숫자·_·- 1~64자).
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<UploadModeResponse>({ mode: env.blobToken() ? "blob" : "local", prefix: uploadPrefix(visitorId) });
});

/** @vercel/blob/client의 upload()가 부르는 클라이언트 토큰 발급 경로. 파일은 브라우저 → Blob으로 직접 간다 */
export const POST = handler(async (req) => {
  const token = env.blobToken();
  if (!token) throw new HttpError(503, "UPLOAD_DISABLED", "Blob 저장소가 설정되지 않았어요. 로컬 업로드를 사용해 주세요.");
  const body = (await readBody(req, BlobTokenRequestSchema)) as HandleUploadBody;

  const result = await handleUpload({
    token,
    request: req,
    body,
    onBeforeGenerateToken: async (pathname) => {
      const visitorId = await requireVisitor(req);
      if (!isUploadPathFor(pathname, visitorId))
        throw new HttpError(400, "INVALID_INPUT", "업로드 경로가 올바르지 않아요. GET /api/upload의 prefix를 쓰세요.");
      await rateLimit("upload", req, visitorId);
      return {
        allowedContentTypes: [UPLOAD_CONTENT_TYPE],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
        validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
      };
    },
  });
  return json(result);
});
