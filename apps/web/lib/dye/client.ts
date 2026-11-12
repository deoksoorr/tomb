import type { DyePart } from "@tomb/protocol";
import { request } from "../api";
import type { WearResponse } from "../types";
import type { AdminDyeIssueResponse, AdminDyeResponse, DyeStartResponse, DyeStateResponse, DyeTimeoutResponse, StyleChangeResponse } from "./types";

// 브라우저 → 46·25·30번 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const dyeApi = {
  state: () => request<DyeStateResponse>("/api/dye", { cache: "no-store" }),
  start: (itemId: string, part: DyePart) => request<DyeStartResponse>("/api/dye/start", post({ itemId, part })),
  /** 판 위 좌표만 보낸다 (색은 서버가 정한다) */
  finish: (seed: string, x: number, y: number) => request<StyleChangeResponse>("/api/dye/finish", post({ seed, x, y })),
  /** 시간이 끝난 순간 조준점 좌표 → 후보 색 (아직 칠하지 않는다) */
  timeout: (seed: string, x: number, y: number) => request<DyeTimeoutResponse>("/api/dye/timeout", post({ seed, x, y })),
  /** 후보를 새 색으로(apply) 또는 지금 색 유지 */
  choose: (seed: string, apply: boolean) => request<StyleChangeResponse>("/api/dye/choose", post({ seed, apply })),
  /** 염색 포기 (창 닫기): 색 그대로 */
  cancel: (seed: string) => request<{ cancelled: boolean }>("/api/dye/cancel", post({ seed })),
  fixed: (itemId: string, part: DyePart) => request<StyleChangeResponse>("/api/dye/fixed", post({ itemId, part })),
  reset: (part: DyePart) => request<StyleChangeResponse>("/api/dye/reset", post({ part })),
  reshape: (body: string) => request<StyleChangeResponse>("/api/dye/body", post({ body })),
  buyPermanent: (itemId: string) => request<WearResponse>("/api/shop/permanent", post({ itemId })),
};

/** 관리자 (로그인 때 받은 httpOnly 쿠키가 자동으로 실린다) */
export const adminDyeApi = {
  list: () => request<AdminDyeResponse>("/api/admin/dye", { cache: "no-store" }),
  issue: (body: { name: string; color: string; parts?: DyePart[]; count: number; target: string; note?: string }) =>
    request<AdminDyeIssueResponse>("/api/admin/dye", post(body)),
};
