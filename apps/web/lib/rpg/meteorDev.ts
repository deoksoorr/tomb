import { env } from "../env";

// 11/20 유성우 오라 QA (개발 전용 — 운영에서는 늘 꺼짐): 켠 계정은 다음 별자리 잇기 판부터 맑은 밤이 아니어도 굴리고 확률 1.
// 완성 별자리가 하나 이상 있어야 하는 조건과 「이미 가졌으면 안 굴림」은 그대로다. 켜고 끄기는 app/api/dev/meteor (운영 404)

const g = globalThis as typeof globalThis & { __tombMeteorForce?: Set<string> };

/** 이 계정의 굴림을 확률 1로 (운영이면 늘 false) */
export function meteorForced(acct: string): boolean {
  if (env.isProd()) return false;
  return g.__tombMeteorForce?.has(acct) ?? false;
}

export function setMeteorForced(acct: string, on: boolean): void {
  if (env.isProd()) return;
  g.__tombMeteorForce ??= new Set();
  if (on) g.__tombMeteorForce.add(acct);
  else g.__tombMeteorForce.delete(acct);
}
