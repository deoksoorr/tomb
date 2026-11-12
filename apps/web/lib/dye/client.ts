import type { DyePart } from "@tomb/protocol";
import { request } from "../api";
import type { WearResponse } from "../types";
import type { AdminDyeIssueResponse, AdminDyeResponse, DyeStartResponse, DyeStateResponse, StyleChangeResponse } from "./types";

// 브라우저 → 46·25·30번 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const dyeApi = {
  state: () => request<DyeStateResponse>("/api/dye", { cache: "no-store" }),
  start: (itemId: string, part: DyePart) => request<DyeStartResponse>("/api/dye/start", post({ itemId, part })),
  /** 판 위 좌표만 보낸다 (색은 서버가 정한다) */
  finish: (seed: string, x: number, y: number) => request<StyleChangeResponse>("/api/dye/finish", post({ seed, x, y })),
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
