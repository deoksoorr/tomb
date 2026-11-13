import { GEAR, type GearDef } from "../rpg/catalog";
import { candidates, hash01, pickWeighted, type Cond } from "./rules";
import type { Species } from "./catalog";

// 물에 빠진 사냥 장비: 낚시 한 번에 아주 드물게 물고기 대신 사냥 장비가 걸린다 (서버가 판정).
//  - 직접 낚시: 찌를 던질 때(cast) 서버 난수로 정해 진행 기록에만 둔다 (손맛·그림자는 물고기 그대로라 미리 알 수 없다)
//  - 자동 낚시: 세션 시드 + 번호로 결정적으로, 확률은 직접의 절반
//  - 낚시 1회로 센다 (하루 낚시 한도·자동 한도 그대로). 도감·최대어 기록에는 넣지 않는다
//  - 지급은 사냥 장비 드롭과 같은 경로(addGear bought=false, 저장소 원자적 갱신). 장비 칸이 가득이면 희귀 물고기로 대신

/** 직접 낚시 한 번에 장비가 걸릴 확률 (약 300번에 1번) */
export const SUNKEN_GEAR_CHANCE = 0.003;
/** 자동 낚시는 절반 */
export const SUNKEN_GEAR_CHANCE_AUTO = SUNKEN_GEAR_CHANCE / 2;
/** 낮은 레벨(요구 레벨 ≤ 10) 위주, 이 확률로만 중간 레벨(11~20) */
export const SUNKEN_MID_CHANCE = 0.1;
export const SUNKEN_LOW_MAX_LEVEL = 10;
export const SUNKEN_MID_MAX_LEVEL = 20;

/** 낚일 수 있는 장비 (요구 레벨 20 이하. 그 위 장비는 사냥터에서만) */
export const SUNKEN_LOW: readonly GearDef[] = GEAR.filter((g) => g.reqLevel <= SUNKEN_LOW_MAX_LEVEL);
export const SUNKEN_MID: readonly GearDef[] = GEAR.filter((g) => g.reqLevel > SUNKEN_LOW_MAX_LEVEL && g.reqLevel <= SUNKEN_MID_MAX_LEVEL);

/** 장비 고르기 (rand 둘: 레벨대, 그 안에서). 싼 것이 더 잘 나온다 (사냥 드롭과 같은 1/√가격 무게) */
export function pickSunkenGear(rTier: number, rPick: number): GearDef {
  const pool = rTier < SUNKEN_MID_CHANCE && SUNKEN_MID.length ? SUNKEN_MID : SUNKEN_LOW;
  const weights = pool.map((g) => 1 / Math.sqrt(Math.max(1, g.price)));
  let x = rPick * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((x -= weights[i]) < 0) return pool[i];
  return pool[pool.length - 1];
}

export const sunkenName = (g: GearDef) => `물에 빠진 ${g.name}`;

/** 장비 칸이 가득일 때 대신 줄 물고기: 그 물·조건의 희귀(★3 이상) 중 하나, 없으면 원래 걸린 것 */
export function sunkenFallbackFish(water: "lake" | "river", c: Cond, rand: number, orig: Species): Species {
  return pickWeighted(candidates("fish", water, c, (s) => s.rarity >= 3 && !s.junk), rand) ?? orig;
}

/** 자동 낚시 k번째가 장비인지 (시드 + 번호로 결정적). 장비면 그 장비 */
export function rollAutoSunken(seed: number, k: number): GearDef | null {
  if (hash01(`auto|${seed}|${k}|gear`) >= SUNKEN_GEAR_CHANCE_AUTO) return null;
  return pickSunkenGear(hash01(`auto|${seed}|${k}|gt`), hash01(`auto|${seed}|${k}|gp`));
}

/** 받침이 있으면 "을", 없으면 "를" (한글이 아니면 "을(를)") */
function objJosa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "을(를)";
  return (c - 0xac00) % 28 ? "을" : "를";
}

/** 건진 장비 알림 문구 */
export function sunkenText(c: { name: string; kept: boolean; instead?: string }, fishName?: (id: string) => string): string {
  if (c.kept) return `${c.name}${objJosa(c.name)} 건졌어요! 사냥 장비 가방에 넣었어요`;
  const alt = c.instead && fishName ? fishName(c.instead) : "희귀 물고기";
  return `${c.name}${objJosa(c.name)} 건졌지만 장비 칸이 가득해서 대신 ${alt}${objJosa(alt)} 챙겼어요`;
}
