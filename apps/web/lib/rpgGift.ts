import { POTION_MAX_STACK, potionById } from "./rpg/catalog";
import { MAT_KEY, MAT_MAX, type MatId } from "./rpg/setGear";
import { getRpgStore } from "./rpg/store";

// 11/19 포인트 대신 주는 사냥 아이템 꾸러미 (물약·강화 재료). 출석·친구 초대·첫 걸음·환영 선물·오늘의 할 일이 같이 쓴다.
// 사냥 캐릭터 저장소에 바로 넣는다 (선물함은 상점 아이템만 받는다). 물약은 종류마다 POTION_MAX_STACK, 재료는 MAT_MAX까지

export type RpgBundle = { potions?: Readonly<Record<string, number>>; mats?: Readonly<Partial<Record<MatId, number>>> };

export const isEmptyBundle = (b: RpgBundle | undefined): boolean =>
  !b || (!Object.values(b.potions ?? {}).some((n) => n > 0) && !Object.values(b.mats ?? {}).some((n) => (n ?? 0) > 0));

/** 꾸러미를 사냥 가방에 넣는다 (넘치는 만큼은 버린다) */
export async function grantRpgBundle(accountId: string, b: RpgBundle): Promise<void> {
  if (isEmptyBundle(b)) return;
  await getRpgStore().update(accountId, (s) => {
    const potions = { ...s.potions };
    for (const [id, n] of Object.entries(b.potions ?? {})) {
      if (!potionById(id) || !(n > 0)) continue;
      potions[id] = Math.min(POTION_MAX_STACK, (potions[id] ?? 0) + n);
    }
    const mats = { doc: s.mats?.doc ?? 0, seal: s.mats?.seal ?? 0, prot: s.mats?.prot ?? 0 };
    for (const [id, n] of Object.entries(b.mats ?? {}) as [MatId, number][]) {
      if (!(n > 0)) continue;
      const k = MAT_KEY[id];
      mats[k] = Math.min(MAT_MAX, mats[k] + n);
    }
    return { state: { ...s, potions, mats }, result: null };
  });
}
