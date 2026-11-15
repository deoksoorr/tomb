import { request } from "../../api";
import type { UrgentKind } from "./urgent";
import type { UrgentClaimResponse, UrgentDeliverResponse, UrgentMeResponse, UrgentPublic } from "./urgentTypes";

// 11/15: 브라우저 → 긴급 의뢰 API

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const urgentApi = {
  status: () => request<UrgentPublic>("/api/forage/urgent", { cache: "no-store" }),
  me: () => request<UrgentMeResponse>("/api/forage/urgent/me", { cache: "no-store" }),
  deliver: (id: string, items: Record<string, number>) => request<UrgentDeliverResponse>("/api/forage/urgent/deliver", post({ id, items })),
  claim: (id: string) => request<UrgentClaimResponse>("/api/forage/urgent/claim", post({ id })),
  test: (body: { action: "start"; kind?: UrgentKind } | { action: "add"; pct: number } | { action: "end" } | { action: "clear" }) =>
    request<UrgentPublic>("/api/forage/urgent/test", post(body)),
};
