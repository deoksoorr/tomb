import { request } from "@/lib/api";
import type { GiftSendInput } from "@/lib/gifts";
import type { GiftLogEntry, GiftRecord } from "@/lib/store/gifts";
import type { AdminMegaphoneRow } from "@/app/api/admin/megaphone/route";

// 관리자 화면 → 11번 선물·23번 확성기 (인증은 관리자 쿠키)

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const socialAdminApi = {
  gifts: () => request<{ gifts: GiftLogEntry[] }>("/api/admin/gifts", { cache: "no-store" }),
  sendGift: (input: Partial<GiftSendInput> & { target: string; note: string }) => request<{ gift: GiftRecord }>("/api/admin/gifts", post(input)),
  megaphones: () => request<{ entries: AdminMegaphoneRow[] }>("/api/admin/megaphone", { cache: "no-store" }),
  hideMegaphone: (id: string, hidden: boolean) => request<{ ok: true }>("/api/admin/megaphone", post({ id, hidden })),
};
