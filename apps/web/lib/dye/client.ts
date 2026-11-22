import type { DyePart, DyeSpecial, DyeTarget } from "@tomb/protocol";
import { request } from "../api";
import type { WearResponse } from "../types";
import type { AdminDyeIssueResponse, AdminDyeResponse, DyeStartResponse, DyeStateResponse, DyeTimeoutResponse, StyleChangeResponse } from "./types";

// 브라우저 → 46·25·30번 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const dyeApi = {
  state: () => request<DyeStateResponse>("/api/dye", { cache: "no-store" }),
  /** part = 캐릭터 부위 또는 11/22 아이템 id, slot = 아이템 색 보관함 칸 (없으면 서버가 정한다) */
  start: (itemId: string, part: DyeTarget, slot?: number) => request<DyeStartResponse>("/api/dye/start", post({ itemId, part, slot })),
  /** 판 위 좌표만 보낸다 (색은 서버가 정한다) */
  finish: (seed: string, x: number, y: number) => request<StyleChangeResponse>("/api/dye/finish", post({ seed, x, y })),
  /** 시간이 끝난 순간 조준점 좌표 → 후보 색 (아직 칠하지 않는다) */
  timeout: (seed: string, x: number, y: number) => request<DyeTimeoutResponse>("/api/dye/timeout", post({ seed, x, y })),
  /** 후보를 새 색으로(apply) 또는 지금 색 유지 */
  choose: (seed: string, apply: boolean) => request<StyleChangeResponse>("/api/dye/choose", post({ seed, apply })),
  /** 염색 포기 (창 닫기): 색 그대로 */
  cancel: (seed: string) => request<{ cancelled: boolean }>("/api/dye/cancel", post({ seed })),
  fixed: (itemId: string, part: DyeTarget, slot?: number) => request<StyleChangeResponse>("/api/dye/fixed", post({ itemId, part, slot })),
  /** 11/15 색 확정 염색권: 고른 보통 색으로 */
  pick: (itemId: string, part: DyeTarget, color: string, slot?: number) => request<StyleChangeResponse>("/api/dye/pick", post({ itemId, part, color, slot })),
  /** 11/15 특수색 확정 염색권: 특수 색 종류만 (바탕 색은 서버가) */
  special: (itemId: string, part: DyeTarget, kind: DyeSpecial, slot?: number) => request<StyleChangeResponse>("/api/dye/special", post({ itemId, part, kind, slot })),
  /** 11/22 색 보관함: 입을 칸 고르기 (sel -1 = 원래 색, 무료) · 칸 더 열기 (값은 protocol DYE_COLOR_SLOT_PRICES) */
  select: (item: string, sel: number) => request<StyleChangeResponse>("/api/dye/select", post({ item, sel })),
  buySlot: (item: string) => request<StyleChangeResponse>("/api/dye/slot", post({ item })),
  /** 11/22 꾸미기 되팔기 (상점 꾸미기 영구 소장 — 정가의 30%) */
  sell: (itemId: string) => request<StyleChangeResponse & { paid: number }>("/api/shop/sell", post({ itemId })),
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
