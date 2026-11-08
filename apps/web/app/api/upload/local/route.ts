import { isWebp, MAX_UPLOAD_BYTES, saveLocalUpload, UPLOAD_CONTENT_TYPE } from "@/lib/blob";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { LocalUploadResponse } from "@/lib/types";

/** Blob 토큰이 없는 로컬 개발용 업로드 (multipart, 필드 이름 `file`). 업로더 폴더 아래 서버 메모리에만 보관한다 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(503, "UPLOAD_DISABLED", "로컬 업로드는 개발 환경에서만 쓸 수 있어요.");
  const visitorId = await requireVisitor(req);

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "INVALID_FILE", "업로드할 파일이 없어요.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "사진은 300KB 이하로 올려 주세요.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type !== UPLOAD_CONTENT_TYPE || !isWebp(bytes))
    throw new HttpError(400, "INVALID_FILE", "WebP 이미지만 올릴 수 있어요.");

  await rateLimit("upload", req, visitorId);
  return json<LocalUploadResponse>({ url: saveLocalUpload(bytes, visitorId) }, { status: 201 });
});
