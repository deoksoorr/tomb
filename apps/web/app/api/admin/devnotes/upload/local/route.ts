import { requireAdmin } from "@/lib/admin";
import { DEVNOTE_IMAGE_MAX_BYTES, devNoteImageKind, saveLocalDevNoteImage } from "@/lib/blob";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import type { LocalUploadResponse } from "@/lib/types";

/** Blob 토큰이 없는 로컬 개발용 개발자 노트 이미지 업로드 (multipart, 필드 이름 `file`). 서버 메모리에만 둔다 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(503, "UPLOAD_DISABLED", "로컬 업로드는 개발 환경에서만 쓸 수 있어요.");
  await requireAdmin(req);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "INVALID_FILE", "업로드할 파일이 없어요.");
  if (file.size > DEVNOTE_IMAGE_MAX_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "사진은 5MB 이하로 올려 주세요.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = devNoteImageKind(bytes);
  if (!type) throw new HttpError(400, "INVALID_FILE", "PNG·JPG·WebP 이미지만 올릴 수 있어요.");
  return json<LocalUploadResponse>({ url: saveLocalDevNoteImage(bytes, type) }, { status: 201 });
});
