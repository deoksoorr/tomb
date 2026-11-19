import { isOpenLot, WORLD_LOTS } from "@tomb/protocol";
import { HOUSING_CHANNELS } from "./catalog";
import type { HouseStore } from "./store";

// 11/19 2단지(분양 마을, WORLD_LOTS보다 큰 번지) 닫기 — 1회성 이전.
// 채널마다 2단지 집을 오래된 집(분양 순)부터 메인 맵의 빈 번지(1..WORLD_LOTS, 10~15번지 등불 골목 포함)로 옮긴다.
// 빈 번지가 없으면 집은 지우지 않고 「필지 대기」(번지 0)로 둔다 — 집 안·가구·방명록은 그대로이고, 빈 번지가 나면 assignLot이 다시 준다.
// 미리 보기(apply=false)는 아무것도 바꾸지 않고 계획만 돌려준다. 다시 돌려도 결과가 같다 (옮긴 집은 이제 2단지에 없다).

export type CloseVillageMove = { id: string; name: string; ownerName: string; ch: number; from: number; to: number };
export type CloseVillageReport = { apply: boolean; moved: number; waiting: number; moves: CloseVillageMove[] };

/** 2단지 집 주인에게 보이는 안내 (to = 0이면 필지 대기) */
export function closeVillageNote(m: Pick<CloseVillageMove, "to">): string {
  return m.to > 0 ? `2단지가 문을 닫아 ${m.to}번지로 이사했어요. 집 안 물건은 그대로예요.` : "주거 구역에 빈 집터가 나면 바로 옮겨 드려요. 그동안 집 안에는 들어갈 수 있어요.";
}

export async function closeVillage(store: HouseStore, apply: boolean, channels: readonly number[] = Array.from({ length: HOUSING_CHANNELS }, (_, i) => i + 1)): Promise<CloseVillageReport> {
  const moves: CloseVillageMove[] = [];
  for (const ch of channels) {
    const all = await store.village(ch);
    const used = new Set(all.filter((h) => h.lot >= 1 && h.lot <= WORLD_LOTS).map((h) => h.lot));
    const movers = all.filter((h) => h.lot > WORLD_LOTS).sort((a, b) => a.createdAt - b.createdAt || a.lot - b.lot);
    for (const h of movers) {
      let to = 0;
      for (let l = 1; l <= WORLD_LOTS && to === 0; l++) {
        if (!isOpenLot(l) || used.has(l)) continue;
        // 실제로 옮길 때 그 사이 다른 분양이 먼저 차지했으면 다음 빈 번지로
        if (apply && (await store.moveLot(h.id, l)) !== "ok") {
          used.add(l);
          continue;
        }
        to = l;
      }
      if (to > 0) used.add(to);
      else if (apply) await store.unlot(h.id);
      moves.push({ id: h.id, name: h.name, ownerName: h.ownerName, ch, from: h.lot, to });
    }
  }
  return { apply, moved: moves.filter((m) => m.to > 0).length, waiting: moves.filter((m) => m.to === 0).length, moves };
}
