import { getLocalUpload } from "@/lib/blob";
import { env } from "@/lib/env";
import { handler, HttpError } from "@/lib/http";

/** 로컬 업로드 이미지 서빙 (개발 전용). 주소는 `/api/upload/local/graves/<업로더 해시>/<파일>.webp` */
export const GET = handler<{ path: string[] }>(async (_req, { path }) => {
  if (env.isProd()) throw new HttpError(503, "UPLOAD_DISABLED", "로컬 업로드는 개발 환경에서만 쓸 수 있어요.");
  const bytes = getLocalUpload(path.join("/"));
  if (!bytes) throw new HttpError(404, "NOT_FOUND", "이미지를 찾을 수 없어요.");
  return new Response(bytes, {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" },
  });
});
