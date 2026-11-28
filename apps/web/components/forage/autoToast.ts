import { autoCatchLine, gotCosmetic, raftGearText } from "@/lib/forage/auto";
import { speciesById } from "@/lib/forage/catalog";
import { sunkenText } from "@/lib/forage/sunken";
import type { AutoFishResponse, DexGain } from "@/lib/forage/types";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";

// 자동 낚시 정산 결과 토스트 (낚시 창·ForageLayer가 같이 쓴다) · 도감 처음 등록 보상 글귀

/** 도감 처음 등록 보상 한 줄 ("도감 +12P", 지갑이 꽉 차 못 받은 만큼은 "받을 도감 보상 +N P", 새 칭호). 없으면 빈 문자열 */
export function dexGainText(g: DexGain | undefined): string {
  if (!g || g.points <= 0) return "";
  const parts: string[] = [];
  if (g.earned > 0) parts.push(`도감 +${g.earned}P`);
  if (g.pending > 0) parts.push(`받을 도감 보상 +${g.pending}P (지갑이 꽉 차 도감 창에서 받아요)`);
  for (const t of g.titles) parts.push(`칭호 「${t}」`);
  // 11/26 맵 도감 완성 배지 (완성 보상은 위 도감 +P에 같이 들어 있어요)
  for (const b of g.badges ?? []) parts.push(`「${b.name}」 배지${b.points > 0 ? ` (완성 보상 ${b.points}P)` : ""}`);
  return parts.join(" · ");
}

/** 처음 등록 보상을 받았으면 지갑을 맞추고 짧게 알린다 (alone=false면 토스트 없이 지갑만 — 다른 토스트에 글귀를 붙일 때) */
export function noteDexGain(g: DexGain | undefined, alone = true): void {
  if (!g) return;
  if (g.me) meStore.set(g.me);
  const text = dexGainText(g);
  if (alone && text) showToast(text, g.titles.length || g.badges?.length ? 6_000 : 3_500);
}

/** 11/28 자동 낚시 알림에서 따로 띄우는 도감 칭호·맵 배지 (P는 물고기 줄에 「새 도감 +NP」로) */
function dexHonorText(g: DexGain | undefined): string {
  if (!g) return "";
  return [...g.titles.map((t) => `칭호 「${t}」`), ...(g.badges ?? []).map((b) => `「${b.name}」 배지${b.points > 0 ? ` (완성 보상 ${b.points}P)` : ""}`)].join(" · ");
}

/** 물고기 한 줄 알림 시간 */
export const AUTO_FISH_TOAST_MS = 4_000;
/** 꾸미기·칭호 알림 시간 (물고기 줄보다 조금 오래) */
export const AUTO_GEAR_TOAST_MS = 8_000;

/**
 * 자동 낚시 정산 결과 → 알림 (11/28 운영자 「안내문이 너무 길다」·「구구절절」):
 *  - 물고기는 짧은 한 줄 (lib/forage/auto autoCatchLine — 「블루길 9.7cm · 새 도감 +3P」 / 「3마리 · 블루길 외 2」), 4초. 낚은 게 없으면 알림 없음
 *  - 꾸미기(물에 빠진 꾸미기·좌대 코디)와 도감 칭호·배지는 각각 따로 조금 더 오래
 *  - 최대어 순위 안내는 알림에서 뺐다 (낚시 창 [자동 낚시 켜기] 도움말에만)
 * 꾸미기를 받았으면 내 정보를 새로 받아 가방 [꾸미기]가 바로 바뀌게 한다 (refreshCosmetics)
 */
export function toastAutoCatch(r: AutoFishResponse): void {
  noteDexGain(r.dex, false);
  const name = (id: string) => speciesById(id)?.name ?? id;
  const line = autoCatchLine(r.items, name, r.dex);
  if (line) showToast(`${line}${r.full ? " · 가방 가득" : ""}`, AUTO_FISH_TOAST_MS);
  for (const g of r.gear ?? []) showToast(sunkenText(g, name), AUTO_GEAR_TOAST_MS);
  for (const g of r.raftGear ?? []) showToast(raftGearText(g), AUTO_GEAR_TOAST_MS);
  const honor = dexHonorText(r.dex);
  if (honor) showToast(honor, AUTO_GEAR_TOAST_MS);
  refreshCosmetics(r);
}

/**
 * 11/28 꾸미기를 새로 받았으면(물에 빠진 꾸미기·좌대 코디 — 자동 정산·직접 낚시 모두) 내 정보를 바로 새로 받는다.
 * 가방 [꾸미기]·[지금 모습]은 내 정보(useMe)만 보므로 창이 열려 있어도 그 자리에서 바뀐다. 받은 게 없으면 요청하지 않는다
 */
export function refreshCosmetics(r: Parameters<typeof gotCosmetic>[0]): void {
  if (gotCosmetic(r)) void meStore.refresh();
}
