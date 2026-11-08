import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { isUploadPathFor, MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPE, UPLOAD_TOKEN_TTL_MS, uploadPrefix } from "@/lib/blob";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { assertRateLimitOpen, rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { UploadModeResponse } from "@/lib/types";
import { BlobUploadRequestSchema, readBody } from "@/lib/validate";

/** 업로드 완료 콜백을 쓰지 않으므로(요청 스키마가 그 이벤트를 받지 않는다) 이 값으로 서명을 검증할 일은 없다 */
const NO_CALLBACK_KEY = "unused-no-upload-callback";

/**
 * 업로드 방식과 이 방문자의 업로드 폴더. Blob이 연결돼 있지 않으면 로컬 대체 경로(/api/upload/local)를 쓴다.
 * Blob 모드에서는 `${prefix}<이름>.webp` 경로로만 올릴 수 있다 (이름: 영숫자·_·- 1~64자).
 * 업로드 한도를 이미 다 썼으면 여기서 미리 429를 준다 (Blob SDK는 토큰 단계의 에러 메시지를 감춘다).
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await assertRateLimitOpen("upload", req, visitorId);
  return json<UploadModeResponse>({ mode: env.blobEnabled() ? "blob" : "local", prefix: uploadPrefix(visitorId) });
});

/**
 * @vercel/blob/client의 uploadPresigned()가 부르는 presigned URL 발급 경로. 파일은 브라우저 → Blob으로 직접 간다.
 * 읽기쓰기 토큰 방식과 OIDC(BLOB_STORE_ID) 방식 모두에서 도는 흐름이다
 * (handleUpload의 클라이언트 토큰은 읽기쓰기 토큰으로만 서명할 수 있어 OIDC에서는 쓸 수 없다).
 */
export const POST = handler(async (req) => {
  if (!env.blobEnabled())
    throw new HttpError(503, "UPLOAD_DISABLED", "Blob 저장소가 연결되지 않았어요. 로컬 업로드를 사용해 주세요.");
  const body = (await readBody(req, BlobUploadRequestSchema)) as HandleUploadPresignedBody;

  const result = await handleUploadPresigned({
    request: req,
    body,
    webhookPublicKey: env.blobWebhookKey() ?? NO_CALLBACK_KEY,
    getSignedToken: async (pathname) => {
      const visitorId = await requireVisitor(req);
      if (!isUploadPathFor(pathname, visitorId))
        throw new HttpError(400, "INVALID_INPUT", "업로드 경로가 올바르지 않아요. GET /api/upload의 prefix를 쓰세요.");
      await rateLimit("upload", req, visitorId);
      const limits = {
        allowedContentTypes: [UPLOAD_CONTENT_TYPE],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
      };
      // 읽기쓰기 토큰이 없으면 token을 비워 두어 SDK가 OIDC로 인증하게 한다
      const token = await issueSignedToken({ ...limits, pathname, operations: ["put"], token: env.blobToken() });
      return { token, urlOptions: { ...limits, addRandomSuffix: true } };
    },
  });
  return json(result);
});
