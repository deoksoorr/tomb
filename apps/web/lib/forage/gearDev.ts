import { env } from "../env";

// 11/28 낚시 꾸미기 QA (개발 전용 — 운영에서는 늘 꺼짐): 켠 계정은 걸린 한 마리마다(직접 낚시는 찌 던질 때마다)
// raft = 좌대 자동 낚시 코디(7일 단계) · sunken = 물에 빠진 꾸미기가 확률 1로 나온다. 고르기·기간·이미 가진 것 처리는 그대로.
// 켜고 끄기는 app/api/dev/forage-gear (운영 404). 가방 [꾸미기]가 새로고침 없이 바로 바뀌는지 볼 때 쓴다

export type GearForceKind = "raft" | "sunken";

const g = globalThis as typeof globalThis & { __tombGearForce?: Map<string, Set<GearForceKind>> };

/** 이 계정의 그 굴림을 확률 1로 (운영이면 늘 false) */
export function gearForced(acct: string, kind: GearForceKind): boolean {
  if (env.isProd()) return false;
  return g.__tombGearForce?.get(acct)?.has(kind) ?? false;
}

export function setGearForced(acct: string, kind: GearForceKind, on: boolean): void {
  if (env.isProd()) return;
  g.__tombGearForce ??= new Map();
  const set = g.__tombGearForce.get(acct) ?? new Set<GearForceKind>();
  if (on) set.add(kind);
  else set.delete(kind);
  g.__tombGearForce.set(acct, set);
}
