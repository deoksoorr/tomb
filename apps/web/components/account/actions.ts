import { bridge } from "@/game/bridge";
import { api } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { meStore } from "@/lib/hooks/useMe";
import { currentLook } from "./items";

// 아이템 사용 → 서버가 소모하고 증서(grant)를 주면 게임에 넘긴다. 실패하면 ApiRequestError를 그대로 던진다.

/** 폭죽: 내 자리에서 바로 터지고, 증서로 같은 채널 모두에게 보인다 */
export async function fireFirework(itemId: string): Promise<void> {
  const res = await api.spendItem(itemId);
  meStore.set(res.me);
  if (res.grant) bridge.emit("firework:fire", { item: itemId, grant: res.grant });
}

/** 캐릭터 꾸미기 착용 (같은 부위는 바뀐다) */
export async function wearCosmetic(itemId: string): Promise<void> {
  const res = await api.spendItem(itemId);
  meStore.set(res.me);
  if (res.lookGrant) bridge.emit("look:set", { look: currentLook(res.me.equipped, Date.now()), lookGrant: res.lookGrant });
}

/** 내 묘비에 꾸미기를 놓는다 → 목록 반영 + 같은 채널에 알림 */
export async function decorateGrave(itemId: string, graveId: string, cache: GraveCache): Promise<void> {
  const res = await api.spendItem(itemId, graveId);
  meStore.set(res.me);
  if (res.grave) {
    cache.upsert(res.grave);
    bridge.emit("grave:changed", { graveId, kind: "updated" });
  }
}

/** 입장할 때 지금 착용 상태를 게임에 알린다 */
export async function restoreLook(): Promise<void> {
  const { look, lookGrant } = await api.myLook();
  if (lookGrant) bridge.emit("look:set", { look, lookGrant });
}
