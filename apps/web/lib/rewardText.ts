import { potionById } from "./rpg/catalog";
import { MAT_INFO, type MatId } from "./rpg/setGear";
import type { RpgBundle } from "./rpgGift";

// 11/19 사냥 아이템 꾸러미 글귀 (화면·서버 공용 — 저장소를 가져오지 않는다)

const unit = (id: string) => (id.startsWith("m_") ? "장" : "개");

/** "커피 3개, 결재 서류 5장" (빈 꾸러미면 빈 문자열) */
export function bundleText(b: RpgBundle | undefined): string {
  if (!b) return "";
  const parts: string[] = [];
  for (const [id, n] of Object.entries(b.potions ?? {})) if (n > 0) parts.push(`${potionById(id)?.name ?? id} ${n}${unit(id)}`);
  for (const [id, n] of Object.entries(b.mats ?? {}) as [MatId, number][]) if (n > 0) parts.push(`${MAT_INFO[id]?.name ?? id} ${n}${unit(id)}`);
  return parts.join(", ");
}

/** 「300P, 결재 서류 2장」 (포인트 먼저) */
export function rewardText(r: { points?: number; bundle?: RpgBundle } | undefined): string {
  if (!r) return "";
  return [r.points ? `${r.points.toLocaleString("ko-KR")}P` : "", bundleText(r.bundle)].filter(Boolean).join(", ");
}
