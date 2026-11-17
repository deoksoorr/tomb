import { request } from "@/lib/api";
import type { GiftSendInput } from "@/lib/gifts";
import type { GiftOnlinePreview, GiftOnlineResult } from "@/lib/giftOnline";
import type { GiftLogEntry, GiftRecord } from "@/lib/store/gifts";
import type { AdminMegaphoneRow } from "@/app/api/admin/megaphone/route";

// 관리자 화면 → 11번 선물·23번 확성기 (인증은 관리자 쿠키)

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const socialAdminApi = {
  gifts: () => request<{ gifts: GiftLogEntry[] }>("/api/admin/gifts", { cache: "no-store" }),
  sendGift: (input: Partial<GiftSendInput> & { note: string }) => request<{ gift: GiftRecord }>("/api/admin/gifts", post(input)),
  /** 11/17 지금 접속 중인 사람 수 (운영자·정지 계정 뺀 수) */
  giftOnlinePreview: () => request<GiftOnlinePreview>("/api/admin/gifts/online", { cache: "no-store" }),
  /** 11/17 지금 접속 중인 사람 모두에게 (expect = 확인 화면에 보여 준 수) */
  sendGiftOnline: (input: Omit<GiftSendInput, "target" | "targetName" | "targets"> & { expect: number }) => request<GiftOnlineResult>("/api/admin/gifts/online", post(input)),
  megaphones: () => request<{ entries: AdminMegaphoneRow[] }>("/api/admin/megaphone", { cache: "no-store" }),
  hideMegaphone: (id: string, hidden: boolean) => request<{ ok: true }>("/api/admin/megaphone", post({ id, hidden })),
};
