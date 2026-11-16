import { SEA_MARKET } from "@tomb/protocol";
import type { NpcId } from "@/lib/forage/catalog";
import { bridge } from "../bridge";
import type { Player } from "../entities/Player";

// 11/16 포구 시장 (바닷가 2차): 시장 앞에서 E → 판매 창 (components/forage/NpcShop의 포구 시장 칸 — 생선 좌판·갯벌 좌판).
// 마을 어부 영감·수집가 유령과 같은 판매 API·같은 하루 한도라 새 포인트 항목이 없어요.
// 왼쪽 좌판(game/sea/seaLayout market:fish)이면 생선 좌판, 오른쪽(market:flat)이면 갯벌 좌판 칸부터. 가운데는 선 자리로 골라요.

/** 시장 앞에서 E: 일어나서 좌판을 보고 판매 창을 연다. at = 누른 좌판 자리 */
export function openSeaMarket(pl: Player, at: { x: number; y: number }, now: number, stand: () => void): void {
  if (pl.sitting) stand();
  pl.faceTo(at.x, at.y - 20, now);
  const x = at.x === SEA_MARKET.x ? pl.x : at.x;
  const npc: NpcId = x <= SEA_MARKET.x ? "harborFish" : "harborFlat";
  bridge.emit("forage:use", { kind: "npc", npc });
}
