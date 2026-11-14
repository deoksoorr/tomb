import { AUTO_RANK_NOTE, autoSummary } from "@/lib/forage/auto";
import { speciesById } from "@/lib/forage/catalog";
import { sunkenText } from "@/lib/forage/sunken";
import type { AutoFishResponse, DexGain } from "@/lib/forage/types";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";

// 자동 낚시 정산 결과 토스트 (낚시 창·ForageLayer가 같이 쓴다) · 도감 처음 등록 보상 글귀

/** 도감 처음 등록 보상 한 줄 ("도감 +12P", 한도에 걸린 만큼은 "받을 도감 보상 +N P", 새 칭호). 없으면 빈 문자열 */
export function dexGainText(g: DexGain | undefined): string {
  if (!g || g.points <= 0) return "";
  const parts: string[] = [];
  if (g.earned > 0) parts.push(`도감 +${g.earned}P`);
  if (g.pending > 0) parts.push(`받을 도감 보상 +${g.pending}P (오늘 한도 — 도감 창에서 받기)`);
  for (const t of g.titles) parts.push(`칭호 「${t}」`);
  return parts.join(" · ");
}

/** 처음 등록 보상을 받았으면 지갑을 맞추고 짧게 알린다 (alone=false면 토스트 없이 지갑만 — 다른 토스트에 글귀를 붙일 때) */
export function noteDexGain(g: DexGain | undefined, alone = true): void {
  if (!g) return;
  if (g.me) meStore.set(g.me);
  const text = dexGainText(g);
  if (alone && text) showToast(text, g.titles.length ? 6_000 : 3_500);
}

/** 자동 낚시 정산 결과 → 토스트 (새로 받은 게 있을 때만, 종류별 가장 큰 크기 포함). away = 숨어 있다 돌아옴 */
export function toastAutoCatch(r: AutoFishResponse, away: boolean): void {
  const gear = r.gear ?? [];
  if (!r.items.length && !gear.length) return;
  const name = (id: string) => speciesById(id)?.name ?? id;
  const n = r.items.length;
  const head = n ? `${away ? "자리 비운 동안" : "자동 낚시로"} ${n}마리 낚았어요 · ${autoSummary(r.items, name)}` : away ? "자리 비운 동안" : "자동 낚시 중";
  const cut = r.dropped > 0 ? ` (오늘 한도로 ${r.dropped}마리는 놓아줬어요)` : "";
  // 물에 빠진 꾸미기는 따로 덧붙인다
  const extra = gear.map((g) => ` · 반짝! ${sunkenText(g, name)}`).join("");
  // 크기는 도감 최대 기록에만 들어간다는 안내 (물고기를 받았을 때)
  const note = n ? ` · ${AUTO_RANK_NOTE}` : "";
  noteDexGain(r.dex, false);
  const dex = dexGainText(r.dex);
  showToast(`${head}${cut}${extra}${dex ? ` · ${dex}` : ""}${note}`, gear.length ? 10_000 : 8_000);
}
