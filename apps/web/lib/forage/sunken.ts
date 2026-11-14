import { ITEMS, isShopListed, type ItemDef } from "@tomb/protocol";
import { candidates, hash01, pickWeighted, type Cond } from "./rules";
import type { Species } from "./catalog";

// 물에 빠진 꾸미기: 낚시 한 번에 아주 드물게 물고기 대신 캐릭터 꾸미기가 걸린다 (서버가 판정, 영구 소장으로 지급).
//  - 직접 낚시: 찌를 던질 때(cast) 서버 난수로 걸렸는지·고를 난수를 정해 진행 기록에만 둔다 (손맛·그림자는 물고기 그대로)
//  - 자동 낚시: 세션 시드 + 번호로 결정적으로, 확률은 직접의 절반
//  - 낚시 1회로 센다 (하루 낚시 한도·자동 한도 그대로). 도감·최대어 기록에는 넣지 않는다
//  - 이미 영구로 가진 것이 뽑히면 아직 없는 것 중에서 다시 고르고, 다 가졌으면 희귀 물고기로 대신

/** 직접 낚시 한 번에 꾸미기가 걸릴 확률 (약 300번에 1번) */
export const SUNKEN_CHANCE = 0.003;
/** 자동 낚시는 절반 */
export const SUNKEN_CHANCE_AUTO = SUNKEN_CHANCE / 2;

/** 낚일 수 있는 꾸미기: 상점에서 파는 부위 있는 꾸미기 (펫·운영자 전용은 빠진다 — isShopListed) */
// 닉네임 꾸미기(이름 글자·이름표 바탕판)는 물에서 건져 올릴 물건이 아니라 뺀다
export const SUNKEN_POOL: readonly ItemDef[] = ITEMS.filter(
  (i) => i.kind === "cosmetic" && !!i.slot && i.slot !== "pet" && i.slot !== "nameColor" && i.slot !== "namePlate" && !i.staff && isShopListed(i),
);

/**
 * 꾸미기 고르기: 싼 것이 조금 더 잘 나온다 (1/√가격). 이미 영구로 가진 것(owned)이 뽑히면 아직 없는 것 중에서 같은 난수로 다시 고른다.
 * 다 가졌으면 null
 */
export function pickSunkenCosmetic(rand: number, owned: ReadonlySet<string> = new Set()): ItemDef | null {
  const pick = (pool: readonly ItemDef[]) => {
    if (!pool.length) return null;
    const w = pool.map((i) => 1 / Math.sqrt(Math.max(1, i.price)));
    let x = rand * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) if ((x -= w[i]) < 0) return pool[i];
    return pool[pool.length - 1];
  };
  const first = pick(SUNKEN_POOL);
  if (first && !owned.has(first.id)) return first;
  return pick(SUNKEN_POOL.filter((i) => !owned.has(i.id)));
}

export const sunkenName = (item: Pick<ItemDef, "name">) => `물에 빠진 ${item.name}`;

/** 다 가졌을 때 대신 줄 물고기: 그 물·조건의 희귀(★3 이상) 중 하나, 없으면 원래 걸린 것 */
export function sunkenFallbackFish(water: "lake" | "river", c: Cond, rand: number, orig: Species): Species {
  return pickWeighted(candidates("fish", water, c, (s) => s.rarity >= 3 && !s.junk), rand) ?? orig;
}

/** 자동 낚시 k번째가 꾸미기인지 (시드 + 번호로 결정적). 꾸미기면 고를 때 쓸 난수 */
export function rollAutoSunken(seed: number, k: number): number | null {
  if (hash01(`auto|${seed}|${k}|gear`) >= SUNKEN_CHANCE_AUTO) return null;
  return hash01(`auto|${seed}|${k}|gp`);
}

/** 받침이 있으면 "을", 없으면 "를" (한글이 아니면 "을(를)") */
function objJosa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "을(를)";
  return (c - 0xac00) % 28 ? "을" : "를";
}

/** 건진 꾸미기 알림 문구 */
export function sunkenText(c: { name: string; kept: boolean; instead?: string }, fishName?: (id: string) => string): string {
  if (c.kept) return `${c.name}${objJosa(c.name)} 건졌어요! (영구 소장)`;
  const alt = c.instead && fishName ? fishName(c.instead) : "희귀 물고기";
  return `물에 빠진 꾸미기를 건졌지만 이미 모두 가지고 있어서 대신 ${alt}${objJosa(alt)} 챙겼어요`;
}
