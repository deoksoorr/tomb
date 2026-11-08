import type {
  ApiError,
  AttendResponse,
  BuyResponse,
  CodeLoginResponse,
  CodeResponse,
  CreateGraveResponse,
  FlowerResponse,
  GraveDetailResponse,
  GraveInput,
  GraveListResponse,
  LookGrantResponse,
  Me,
  QuickGraveInput,
  ReportResponse,
  ReviveResponse,
  SessionResponse,
  UpdateGraveResponse,
  UseItemResponse,
  VersionResponse,
} from "./types";
import type { ReportReason } from "./reports";

// 브라우저 → Next API 호출. 서버가 준 한국어 메시지를 그대로 사용자에게 보여 준다.

const FALLBACK_MESSAGE = "연결이 불안정해요. 잠시 후 다시 시도해 주세요.";

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

/** 내 계정이 세운 묘비는 토큰 없이도 고칠 수 있다 (토큰은 계정 개편 전 묘비용) */
const ownerHeaders = (ownerToken: string | null): Record<string, string> =>
  ownerToken ? { [OWNER_HEADER]: ownerToken } : {};

export const api = {
  startSession: () => request<SessionResponse>("/api/session", { method: "POST" }),
  listGraves: (signal?: AbortSignal) => request<GraveListResponse>("/api/graves", { signal }),
  /** 상세는 목록의 CDN 캐시(30초)를 거치지 않는다 */
  graveDetail: (id: string, signal?: AbortSignal) =>
    request<GraveDetailResponse>(gravePath(id), { cache: "no-store", signal }),
  createGrave: (input: QuickGraveInput) => request<CreateGraveResponse>("/api/graves", jsonInit("POST", input)),
  /** PATCH는 전체 교체 */
  updateGrave: (id: string, ownerToken: string | null, input: GraveInput) =>
    request<UpdateGraveResponse>(gravePath(id), jsonInit("PATCH", input, ownerHeaders(ownerToken))),
  deleteGrave: (id: string, ownerToken: string | null) =>
    request<unknown>(gravePath(id), { method: "DELETE", headers: ownerHeaders(ownerToken) }),
  flower: (id: string) => request<FlowerResponse>(gravePath(id, "/flower"), { method: "POST" }),
  revive: (id: string) => request<ReviveResponse>(gravePath(id, "/revive"), { method: "POST" }),
  report: (id: string, reason: ReportReason) =>
    request<ReportResponse>(gravePath(id, "/report"), jsonInit("POST", { reason })),

  me: () => request<Me>("/api/me", { cache: "no-store" }),
  attend: () => request<AttendResponse>("/api/me/attend", { method: "POST" }),
  issueCode: () => request<CodeResponse>("/api/me/code", { method: "POST" }),
  loginWithCode: (code: string) => request<CodeLoginResponse>("/api/me/login", jsonInit("POST", { code })),
  myLook: () => request<LookGrantResponse>("/api/me/look", { cache: "no-store" }),
  buy: (itemId: string) => request<BuyResponse>("/api/shop/buy", jsonInit("POST", { itemId })),
  /** 아이템 사용 (이름이 use로 시작하면 훅으로 오해받으므로 spend) */
  spendItem: (itemId: string, graveId?: string) =>
    request<UseItemResponse>("/api/shop/use", jsonInit("POST", graveId ? { itemId, graveId } : { itemId })),
  version: () => request<VersionResponse>("/api/version", { cache: "no-store" }),
};
