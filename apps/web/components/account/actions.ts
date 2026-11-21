import { bridge } from "@/game/bridge";
import { fireworkShowMs } from "@tomb/protocol";
import { api, ApiRequestError } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { meStore } from "@/lib/hooks/useMe";
import type { LookGrantResponse, Me } from "@/lib/types";
import { currentLook } from "./items";

// 아이템 사용 → 서버가 소모하고 증서(grant)를 주면 게임에 넘긴다. 실패하면 ApiRequestError를 그대로 던진다.

/** 폭죽: 내 자리에서 바로 터지고, 증서로 같은 채널 모두에게 보인다 */
export const SHOW_BUSY_MSG = "지금 다른 불꽃쇼가 하고 있어요. 끝나고 다시 쏴 주세요";

export async function fireFirework(itemId: string): Promise<void> {
  // 11/20 광역 불꽃쇼는 채널에 한 번에 하나: 하고 있으면 쓰기 전에 막는다 (가방에서 빠지지 않게)
  if (fireworkShowMs(itemId) > 0 && (bridge.last("firework:show")?.until ?? 0) > Date.now()) {
    bridge.emit("toast", { message: SHOW_BUSY_MSG });
    throw new ApiRequestError(409, "show_busy", SHOW_BUSY_MSG);
  }
  const res = await api.spendItem(itemId);
  meStore.set(res.me);
  if (res.grant) bridge.emit("firework:fire", { item: itemId, grant: res.grant });
}

/** 바뀐 착용 상태를 내 정보에 넣고, 증서가 있으면 게임(→ 같은 방 모두)에 알린다 */
function applyLook(res: { me: Me; lookGrant?: string }): void {
  meStore.set(res.me);
  if (res.lookGrant)
    bridge.emit("look:set", {
      look: currentLook(res.me.equipped, Date.now()),
      lookGrant: res.lookGrant,
      // 46·25번: 지금 염색·몸 모양도 같이 (게임이 내 아바타에 입힌다)
      dye: res.me.dye ?? {},
      ...(res.me.body ? { body: res.me.body } : {}),
      // 주간 1위 배지·오라 (1위가 아니면 0 → 내 아바타에서도 지운다)
      champ: res.me.champ ?? 0,
      // 11/16 매니저 표시 (해제됐으면 0 → 내 머리 위 매니저 칭호도 뗀다)
      mgr: res.me.manager ? 1 : 0,
    });
}

/** 46·25·30번 염색·외형 바꾸기·영구 코디 결과 반영 (내 정보 + 게임의 내 아바타 + 같은 방 사람들) */
export function applyStyle(res: { me: Me; lookGrant: string }): void {
  applyLook(res);
}

/** 가방의 새 꾸미기 입기: 이때부터 24시간. 같은 부위에 입던 것은 벗어 둔 쪽으로 간다 */
export async function wearCosmetic(itemId: string): Promise<void> {
  applyLook(await api.spendItem(itemId));
}

/** 벗어 둔 꾸미기 다시 입기 (남은 시간 그대로) */
export async function wearStashed(itemId: string): Promise<void> {
  applyLook(await api.wear(itemId));
}

/** 그 부위 벗기 → 벗어 둔 쪽으로 (남은 시간은 계속 흐른다) */
export async function takeOff(slot: string): Promise<void> {
  applyLook(await api.unequip(slot));
}

/** 칭호 하나 끼우기 (null = 빼기) → 내 머리 위·같은 방 사람들 화면에 바로 */
export async function wearTitle(id: string | null): Promise<void> {
  applyLook(await api.setTitle(id));
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

/** 지금 착용 상태(증서)를 게임에 알린다 */
export function emitLook({ look, lookGrant, dye, body, champ, mgr }: LookGrantResponse): void {
  if (lookGrant) bridge.emit("look:set", { look, lookGrant, dye: dye ?? {}, ...(body ? { body } : {}), champ: champ ?? 0, ...(mgr !== undefined ? { mgr } : {}) });
}

/** 지금 착용 상태를 받아 게임에 알린다 (재접속·1위 값 변경) */
export async function restoreLook(): Promise<void> {
  emitLook(await api.myLook());
}
