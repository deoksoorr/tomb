import { gearById, type GearSlot } from "./catalog";
import { decodeSg, enhOfId, isSgCode, sgPieceOf, shopEnhOf } from "./setGear";

// 11/15 사냥 장비 표시 id (사냥터 방에서 아바타에 입힌다 — game/sprites/setGearWear): 낀 갑옷·머리·장신구를
// "sgw.{a|h|c}.{세트}{직급}" (세트 장비) 또는 "sgw.{a|h|c}.{상점 장비 id}[+]" (+5 이상)로. 무기는 손에 따로 든다.
// 서버는 사냥터 방 입장 토큰(app/api/join/room)에 캐릭터 저장값으로 만든 이 목록을 서명해 넣는다 → 화면이 다른 장비를 주장할 수 없다

export function huntGearIds(equip: Partial<Record<GearSlot, string | null>>): string[] {
  const out: string[] = [];
  for (const [slot, id] of Object.entries(equip) as [GearSlot, string | null][]) {
    if (!id || slot === "weapon") continue;
    const part = slot === "armor" ? "a" : slot === "head" ? "h" : "c";
    const it = isSgCode(id) ? decodeSg(id) : null;
    if (it) {
      const piece = sgPieceOf(it);
      if ((part === "a" && piece !== "armor") || (part === "h" && piece !== "head")) continue;
      out.push(`sgw.${part}.${it.s}${it.g}`);
      continue;
    }
    const g = gearById(id);
    if (g && g.kind !== "weapon") out.push(`sgw.${part}.${shopEnhOf(id)[0]}${enhOfId(id) >= 5 ? "+" : ""}`);
  }
  return [...new Set(out)].sort();
}
