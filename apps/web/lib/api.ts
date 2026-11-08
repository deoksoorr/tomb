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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
 * WebP 스크린샷을 올리고 공개 주소를 돌려준다. Blob 토큰이 없는 개발 환경에서는 로컬 대체 경로로 보낸다.
 * 업로드 토큰이 60초만 유효하므로 제출 직전에 모드 조회 → 토큰 → 업로드를 연달아 부른다.
 */
async function uploadScreenshot(image: Blob): Promise<string> {
  const { mode, prefix } = await request<UploadModeResponse>("/api/upload", { cache: "no-store" });
  if (mode === "local") {
    const form = new FormData();
    form.append("file", image, "screenshot.webp");
    return (await request<LocalUploadResponse>("/api/upload/local", { method: "POST", body: form })).url;
  }
  // 서버는 이 방문자 전용 prefix 아래 `[A-Za-z0-9_-]{1,64}.webp` 경로만 받는다
  const pathname = `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.webp`;
  // upload()는 토큰 발급 실패(401·429 등)를 "Failed to retrieve the client token"으로 뭉개므로,
  // 같은 요청을 직접 보내 서버의 한국어 메시지를 살리고 받은 토큰으로 put()한다.
  const { clientToken } = await request<{ clientToken: string }>(
    "/api/upload",
    jsonInit("POST", { type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart: false } }),
  );
  const { put } = await import("@vercel/blob/client");
  try {
    const blob = await put(pathname, image, { access: "public", token: clientToken, contentType: "image/webp" });
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
  report: (id: string) => request<ReportResponse>(gravePath(id, "/report"), { method: "POST" }),
  uploadScreenshot,
};
