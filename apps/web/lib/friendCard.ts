import { AVATAR_COLORS } from "@tomb/protocol";
import { SPECIES, speciesOf } from "./forage/catalog";
import { getForageStore } from "./forage/store";
import type { FriendCard } from "./friendTypes";
import { getHouseStore, houseIdFor } from "./housing/service";
import { lookScore } from "./lookScore";
import { MAX_LEVEL } from "./rpg/formulas";
import { getRpgStore } from "./rpg/store";
import { isSuperHunter } from "./rpg/superHunter";
import { getAccounts } from "./store";
import { kstDay, lookOf } from "./store/accounts";
import { getStyleStore } from "./store/style";

// 친구 창 한 줄의 자랑거리: 지금 모습·꾸미기 점수(lib/lookScore)·집 꾸밈 점수·사냥 레벨·도감 %·최대어.
// 계정·꾸미기·집·사냥·도감 저장소를 한 번씩 읽어야 해서, 인스턴스 안에 CARD_TTL_MS 동안 기억해 둔다
// (친구 창은 열려 있는 동안 30초마다 새로 받는다 — 위치만 새로 묻고 자랑거리는 기억한 것을 쓴다).

export const CARD_TTL_MS = 60_000;
const CARD_MAX = 2_000;

const g = globalThis as typeof globalThis & { __tombFriendCards?: Map<string, { at: number; card: FriendCard }> };
const memo = () => (g.__tombFriendCards ??= new Map());

/** 도감 채운 비율 (모든 종류 합쳐, 내림) */
export function dexPercentAll(dex: Record<string, { n: number }>): number {
  if (!SPECIES.length) return 0;
  return Math.floor((100 * SPECIES.filter((s) => (dex[s.id]?.n ?? 0) > 0).length) / SPECIES.length);
}

/** 가장 큰 물고기 (잡동사니 빼고, 크기 mm) */
export function biggestFish(dex: Record<string, { n: number; max: number }>): FriendCard["bigFish"] {
  let best: FriendCard["bigFish"] = null;
  for (const s of speciesOf("fish")) {
    const max = s.junk ? 0 : (dex[s.id]?.max ?? 0);
    if (max > 0 && (!best || max > best.size)) best = { name: s.name, size: max };
  }
  return best;
}

async function build(accountId: string, now: number): Promise<FriendCard> {
  const accounts = getAccounts();
  const houseId = houseIdFor(accountId);
  const [acct, style, house, rpg, sup, dex] = await Promise.all([
    accounts.get(accountId, kstDay(now), now),
    getStyleStore(accounts)
      .get(accountId)
      .catch(() => null),
    getHouseStore()
      .get(houseId)
      .catch(() => null),
    getRpgStore()
      .get(accountId)
      .catch(() => null),
    isSuperHunter(accountId).catch(() => false),
    getForageStore()
      .dex(accountId)
      .then((d) => d.dex)
      .catch(() => ({})),
  ]);
  return {
    look: { color: acct.color ?? AVATAR_COLORS[0], body: acct.body ?? "hood", look: lookOf(acct), ...(style?.dye ? { dye: style.dye } : {}) },
    house: house && !house.hidden ? { id: houseId, score: house.score } : null,
    hunt: sup ? MAX_LEVEL : (rpg?.level ?? 1),
    dex: dexPercentAll(dex),
    bigFish: biggestFish(dex),
    fashion: lookScore({ equipped: acct.equipped, body: acct.body, dye: style?.dye ?? null }, now),
  };
}

/** 한 계정의 자랑거리 (CARD_TTL_MS 동안 기억). 읽지 못하면 null — 그 줄만 비워 둔다 */
export async function friendCard(accountId: string, now = Date.now()): Promise<FriendCard | null> {
  const m = memo();
  const hit = m.get(accountId);
  if (hit && now - hit.at < CARD_TTL_MS) return hit.card;
  try {
    const card = await build(accountId, now);
    m.delete(accountId);
    m.set(accountId, { at: now, card });
    if (m.size > CARD_MAX) m.delete(m.keys().next().value!);
    return card;
  } catch (e) {
    console.error("[friends] 자랑거리 읽기 실패", e);
    return null;
  }
}

/** 기억해 둔 것을 지운다 (테스트·내 모습이 바뀐 직후) */
export function forgetFriendCard(accountId?: string): void {
  if (accountId) memo().delete(accountId);
  else memo().clear();
}
