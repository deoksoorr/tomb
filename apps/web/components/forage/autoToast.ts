import { autoSummary } from "@/lib/forage/auto";
import { speciesById } from "@/lib/forage/catalog";
import { sunkenText } from "@/lib/forage/sunken";
import type { AutoFishResponse } from "@/lib/forage/types";
import { showToast } from "@/lib/hooks/useToasts";

// 자동 낚시 정산 결과 토스트 (낚시 창·ForageLayer가 같이 쓴다)

/** 자동 낚시 정산 결과 → 토스트 (새로 받은 게 있을 때만). away = 숨어 있다 돌아옴 */
export function toastAutoCatch(r: AutoFishResponse, away: boolean): void {
  const gear = r.gear ?? [];
  if (!r.items.length && !gear.length) return;
  const name = (id: string) => speciesById(id)?.name ?? id;
  const n = r.items.length;
  const head = n ? `${away ? "자리 비운 동안" : "자동 낚시로"} ${n}마리 낚았어요 · ${autoSummary(r.items, name)}` : away ? "자리 비운 동안" : "자동 낚시 중";
  const cut = r.dropped > 0 ? ` (오늘 한도로 ${r.dropped}마리는 놓아줬어요)` : "";
  // 물에 빠진 장비는 따로 덧붙인다
  const extra = gear.map((g) => ` · 반짝! ${sunkenText(g, name)}`).join("");
  showToast(`${head}${cut}${extra}`, gear.length ? 9_000 : 7_000);
}
