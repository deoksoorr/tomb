import { itemById, isPermanentUntil, PERMANENT_UNTIL, RAFT_GEAR_TIER_DAYS, raftGearOfTier, raftGearTier, type RaftGearTier } from "@tomb/protocol";
import { autoCatchTimes, autoHit, type AutoSession } from "../forage/auto";
import { gearForced } from "../forage/gearDev";
import { hash01 } from "../forage/rules";
import type { RaftGearCatch } from "../forage/types";
import { getStaffStore } from "../staff";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";

// 11/27 좌대 전용 코디 (자동 낚시 정산 때, 내 좌대 세션에서 걸린 한 마리마다 한 번 굴린다 — 물고기는 그대로, 코디는 덤).
// 세션 시드 + 번호로 결정적 (다시 정산해도 같다). 정산 바꾸기(autoSwap)에 이긴 쪽만 여기까지 와서 한 번만 준다.
// protocol RAFT_GEAR_ON(11/27 그림 확정 → true)이 false면 굴려도 늘 없다. 카탈로그(items.ts raft: true)에 있는 것만 준다.

/** k번째 시도에서 나온 좌대 코디 단계 (없으면 null). pick = 고를 난수 */
export function rollRaftGear(seed: number, k: number, on?: boolean): { tier: RaftGearTier; pick: number } | null {
  const tier = raftGearTier(hash01(`auto|${seed}|${k}|raft`), on);
  return tier ? { tier, pick: hash01(`auto|${seed}|${k}|raftpick`) } : null;
}

/** 그 단계에서 고를 수 있는 좌대 코디 (카탈로그에 있는 것 중 이미 영구로 가진 것은 빼고) */
export function raftGearChoices(tier: RaftGearTier, ownedPerm: ReadonlySet<string>): string[] {
  return raftGearOfTier(tier).filter((id) => !!itemById(id)?.slot && !ownedPerm.has(id));
}

export async function grantRaftRange(acct: string, s: AutoSession, from: number, to: number, now: number, on?: boolean): Promise<RaftGearCatch[]> {
  if (to < from || !s.raft) return [];
  const rolls: { tier: RaftGearTier; pick: number }[] = [];
  // 11/28 개발 전용 확인 (lib/forage/gearDev — 운영은 늘 false): 걸린 한 마리마다 7일 단계로
  const force = gearForced(acct, "raft");
  autoCatchTimes(s, from, to).forEach((_, i) => {
    const k = from + i;
    if (!autoHit(s.seed, k)) return;
    const r = force ? { tier: "d7" as const, pick: hash01(`auto|${s.seed}|${k}|raftpick`) } : rollRaftGear(s.seed, k, on);
    if (r) rolls.push(r);
  });
  if (!rolls.length) return [];
  const a = await getAccounts().get(acct, kstDay(now), now);
  const untilOf = new Map<string, number>([...a.equipped, ...a.stash].map((e) => [e.itemId, e.until]));
  const out: RaftGearCatch[] = [];
  for (const r of rolls) {
    const perm = new Set([...untilOf].filter(([, u]) => isPermanentUntil(u)).map(([id]) => id));
    const list = raftGearChoices(r.tier, perm);
    if (!list.length) continue; // 그 단계 것을 다 영구로 가졌으면(또는 그림 전이라 카탈로그에 없으면) 그 굴림은 없던 것으로
    const id = list[Math.min(list.length - 1, Math.floor(r.pick * list.length))];
    const item = itemById(id)!;
    const until = r.tier === "perm" ? PERMANENT_UNTIL : Math.min(PERMANENT_UNTIL, Math.max(untilOf.get(id) ?? 0, now) + RAFT_GEAR_TIER_DAYS[r.tier] * 86_400_000);
    // 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 끝을 늘린다 (staff 지급 Lua — 더 짧아지지는 않는다)
    await getStaffStore().grant(getAccounts(), acct, [{ itemId: id, slot: item.slot! }], until);
    untilOf.set(id, until);
    out.push({ id, name: item.name, tier: r.tier });
  }
  return out;
}
