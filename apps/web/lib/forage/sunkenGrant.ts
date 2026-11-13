import { addGear, GEAR_INV_MAX, RpgError } from "../rpg/character";
import { gearById } from "../rpg/catalog";
import { getRpgStore, type RpgStore } from "../rpg/store";

// 물에 빠진 장비 지급 (서버 전용 — 사냥 저장소를 쓴다). 규칙은 lib/forage/sunken.ts

/** 사냥 장비 지급 (사냥 드롭과 같은 규칙: 산 것이 아님, 저장소 원자적 갱신). 장비 칸이 가득이면 false */
export async function grantSunkenGear(acct: string, gearId: string, store: RpgStore = getRpgStore()): Promise<boolean> {
  if (!gearById(gearId)) return false;
  try {
    await store.update(acct, (s) => ({ state: addGear(s, gearId, false), result: null }));
    return true;
  } catch (e) {
    if (e instanceof RpgError && e.code === "INVENTORY_FULL") return false;
    throw e;
  }
}

/** 장비 칸에 남은 자리 */
export async function sunkenGearRoom(acct: string, store: RpgStore = getRpgStore()): Promise<number> {
  const s = await store.get(acct);
  return Math.max(0, GEAR_INV_MAX - Object.values(s.inv).reduce((a, b) => a + b, 0));
}
