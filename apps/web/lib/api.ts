import type {
  ApiError,
  CreateGraveResponse,
  FlowerResponse,
  GraveDetailResponse,
  GraveInput,
  GraveListResponse,
  LocalUploadResponse,
  ReportResponse,
  ReviveResponse,
  SessionResponse,
  UpdateGraveResponse,
  UploadModeResponse,
} from "./types";
import type { ReportReason } from "./reports";

// 브라우저 → Next API 호출. 서버가 준 한국어 메시지를 그대로 사용자에게 보여 준다.

const FALLBACK_MESSAGE = "연결이 불안정해요. 잠시 후 다시 시도해 주세요.";
const UPLOAD_FAILED_MESSAGE = "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** 사용자에게 보여 줄 메시지 */
export function errorMessage(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : FALLBACK_MESSAGE;
}

/** JSON 응답을 받고, 실패하면 서버의 `{ error }`를 ApiRequestError로 바꾼다 (관리자 화면도 같이 쓴다) */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiRequestError(0, "NETWORK", FALLBACK_MESSAGE);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as Partial<ApiError> | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? "UNKNOWN", err?.message ?? FALLBACK_MESSAGE);
  }
  return body as T;
}

const OWNER_HEADER = "x-owner-token";

function jsonInit(method: string, data: unknown, headers?: Record<string, string>): RequestInit {
  return { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) };
}

const gravePath = (id: string, sub = "") => `/api/graves/${encodeURIComponent(id)}${sub}`;

/**
 * WebP 스크린샷을 올리고 공개 주소를 돌려준다. Blob이 연결되지 않은 개발 환경에서는 로컬 대체 경로로 보낸다.
 * 업로드 URL이 60초만 유효하므로 제출 직전에 모드 조회 → presigned URL → 업로드를 연달아 부른다.
 */
async function uploadScreenshot(image: Blob): Promise<string> {
  // 모드 조회가 세션·업로드 한도를 먼저 확인해 한국어 에러(401·429)를 그대로 돌려준다.
  // (uploadPresigned는 URL 발급 단계의 에러를 "Failed to retrieve the presigned URL"로 뭉갠다)
  const { mode, prefix } = await request<UploadModeResponse>("/api/upload", { cache: "no-store" });
  if (mode === "local") {
    const form = new FormData();
    form.append("file", image, "screenshot.webp");
    return (await request<LocalUploadResponse>("/api/upload/local", { method: "POST", body: form })).url;
  }
  // 서버는 이 방문자 전용 prefix 아래 `[A-Za-z0-9_-]{1,64}.webp` 경로만 받는다
  const pathname = `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.webp`;
  // presigned 흐름은 읽기쓰기 토큰 방식과 OIDC(BLOB_STORE_ID) 방식 모두에서 돈다
  const { uploadPresigned } = await import("@vercel/blob/client");
  try {
    const blob = await uploadPresigned(pathname, image, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: "image/webp",
    });
    return blob.url;
  } catch {
    throw new ApiRequestError(0, "UPLOAD_FAILED", UPLOAD_FAILED_MESSAGE);
  }
}

export const api = {
  startSession: () => request<SessionResponse>("/api/session", { method: "POST" }),
  listGraves: (signal?: AbortSignal) => request<GraveListResponse>("/api/graves", { signal }),
  /** 상세는 목록의 CDN 캐시(30초)를 거치지 않는다 */
  graveDetail: (id: string, signal?: AbortSignal) =>
    request<GraveDetailResponse>(gravePath(id), { cache: "no-store", signal }),
  createGrave: (input: GraveInput) => request<CreateGraveResponse>("/api/graves", jsonInit("POST", input)),
  updateGrave: (id: string, ownerToken: string, input: GraveInput) =>
    request<UpdateGraveResponse>(gravePath(id), jsonInit("PATCH", input, { [OWNER_HEADER]: ownerToken })),
  deleteGrave: (id: string, ownerToken: string) =>
    request<unknown>(gravePath(id), { method: "DELETE", headers: { [OWNER_HEADER]: ownerToken } }),
  flower: (id: string) => request<FlowerResponse>(gravePath(id, "/flower"), { method: "POST" }),
  revive: (id: string) => request<ReviveResponse>(gravePath(id, "/revive"), { method: "POST" }),
  report: (id: string, reason: ReportReason) =>
    request<ReportResponse>(gravePath(id, "/report"), jsonInit("POST", { reason })),
  uploadScreenshot,
};
