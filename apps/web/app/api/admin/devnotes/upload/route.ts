import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/admin";
import { DEVNOTE_IMAGE_CONTENT_TYPES, DEVNOTE_IMAGE_MAX_BYTES, isDevNoteUploadPath, UPLOAD_TOKEN_TTL_MS } from "@/lib/blob";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { BlobUploadRequestSchema, readBody } from "@/lib/validate";

/** 업로드 완료 콜백은 쓰지 않는다 (요청 스키마가 그 이벤트를 받지 않는다) */
const NO_CALLBACK_KEY = "unused-no-upload-callback";

export type DevNoteUploadMode = { mode: "blob" | "local" };

/** 업로드 방식: Blob이 연결돼 있으면 브라우저 → Blob 직접, 아니면(로컬 개발) /api/admin/devnotes/upload/local */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<DevNoteUploadMode>({ mode: env.blobEnabled() ? "blob" : "local" });
});

/**
 * 운영자 전용 presigned URL 발급 (@vercel/blob/client uploadPresigned()가 부른다).
 * 경로는 `devnotes/<이름>.<webp|jpg|png>`, PNG·JPEG·WebP만, 5MB까지. 묘비 업로드(/api/upload)와 같은 흐름이다.
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  if (!env.blobEnabled()) throw new HttpError(503, "UPLOAD_DISABLED", "Blob 저장소가 연결되지 않았어요. 로컬 업로드를 사용해 주세요.");
  const body = (await readBody(req, BlobUploadRequestSchema)) as HandleUploadPresignedBody;
  const result = await handleUploadPresigned({
    request: req,
    body,
    webhookPublicKey: env.blobWebhookKey() ?? NO_CALLBACK_KEY,
    getSignedToken: async (pathname) => {
      if (!isDevNoteUploadPath(pathname)) throw new HttpError(400, "INVALID_INPUT", "업로드 경로가 올바르지 않아요.");
      const limits = {
        allowedContentTypes: DEVNOTE_IMAGE_CONTENT_TYPES,
        maximumSizeInBytes: DEVNOTE_IMAGE_MAX_BYTES,
        validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
      };
      // 읽기쓰기 토큰이 없으면 token을 비워 두어 SDK가 OIDC로 인증하게 한다
      const token = await issueSignedToken({ ...limits, pathname, operations: ["put"], token: env.blobToken() });
      return { token, urlOptions: { ...limits, addRandomSuffix: true } };
    },
  });
  return json(result);
});
