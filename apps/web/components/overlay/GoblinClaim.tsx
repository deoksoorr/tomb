"use client";

import { errorMessage, request } from "@/lib/api";
import type { GoblinClaimResponse } from "@/lib/goblin";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";

// 22번 황금 고블린(보너스 요정): 내가 가장 먼저 잡으면 실시간 서버가 증서를 준다(goblin:grant) → 웹 API로 보상을 받는다.
// 화면에는 아무것도 그리지 않는다 (알림은 토스트). 같은 고블린 증서는 서버가 한 번만 받는다.

const seen = new Set<string>();

export default function GoblinClaim() {
  useBridgeEvent("goblin:grant", ({ id, grant }) => {
    if (seen.has(id)) return;
    seen.add(id);
    request<GoblinClaimResponse>("/api/goblin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant }) })
      .then((r) => {
        meStore.set(r.me);
        showToast(r.earned > 0 ? `보너스 +${r.earned}P를 받았어요!${r.capped ? " (오늘 고블린 한도까지만)" : ""}` : "오늘 받을 수 있는 고블린 보너스를 다 받았어요");
      })
      .catch((e) => {
        if ((e as { code?: string }).code === "ALREADY_CLAIMED") return;
        showToast(errorMessage(e));
      });
  });
  return null;
}
