import { kstDay } from "../store/accounts";
import {
  AUTO_FISH_DAILY_MAX,
  autoCatchTimes,
  autoCaughtTotal,
  autoNextInMs,
  beatAuto,
  parseAutoSession,
  rollAutoCatch,
  type AutoSession,
} from "./auto";
import { DAILY_CATCH_MAX, speciesById, STACK_MAX } from "./catalog";
import { conditionsAt, hash01 } from "./rules";
import { pickSunkenCosmetic, rollAutoSunken, sunkenFallbackFish, sunkenName } from "./sunken";
import { grantSunkenCosmetic, ownedPermanent } from "./sunkenGrant";
import { getForageStore, type ForageStore, type GrantItem } from "./store";
import type { AutoFishStatus, CatchResult, LifeDay, SunkenCatch } from "./types";

// 자동 낚시 정산 (서버). 세션은 저장소의 문자열 하나이고 "이전 값과 같을 때만 바꾸기"(autoSwap)로만 바꾼다
// → 동시에 정산을 여러 번 눌러도 같은 번호의 물고기는 한 번만 지급된다 (바꾸기에 성공한 쪽만 지급).
// 물고기는 세션 시드 + 번호로 결정적으로 굴리므로, 바꾸기에 져서 다시 시도해도 같은 번호면 같은 물고기다.

const SWAP_TRIES = 5;

export type AutoSettled = {
  /** 정산 뒤 세션 (끝났으면 null) */
  session: AutoSession | null;
  items: CatchResult[];
  dropped: number;
  gear: SunkenCatch[];
  ended?: "stop" | "time";
};

/** 정산: 지금까지 낚은 번호 중 아직 안 받은 것을 그 시각 조건으로 굴려 그날(게임 날짜, 새벽 5시 경계) 한도 안에서 넣는다. stop이면 세션을 끝낸다 */
export async function settleAuto(store: ForageStore, acct: string, now: number, stop: boolean): Promise<AutoSettled> {
  for (let i = 0; i < SWAP_TRIES; i++) {
    const raw = await store.autoGet(acct);
    if (!raw) return { session: null, items: [], dropped: 0, gear: [] };
    const cur = parseAutoSession(raw);
    if (!cur) {
      // 알아볼 수 없는 값은 지운다
      await store.autoSwap(acct, raw, null);
      return { session: null, items: [], dropped: 0, gear: [] };
    }
    const beaten = beatAuto(cur, now);
    const total = autoCaughtTotal(beaten);
    const timeUp = now >= beaten.end;
    const finish = stop || timeUp;
    const next: AutoSession = { ...beaten, done: Math.max(cur.done, total) };
    if (!(await store.autoSwap(acct, raw, finish ? null : JSON.stringify(next)))) continue;
    const { items, dropped, gear } = await grantRange(store, acct, beaten, cur.done + 1, total, now);
    return { session: finish ? null : next, items, dropped, gear, ...(finish ? { ended: stop ? ("stop" as const) : ("time" as const) } : {}) };
  }
  throw new Error("[forage] 자동 낚시 정산이 계속 겹쳤어요");
}

type Rolled = { day: string; id: string; size: number; gear?: { pick: number; alt: string } };

/**
 * from..to번을 굴려(그 시각 조건, 시드 + 번호) 낚인 날(게임 날짜)마다 한도 안에서 넣는다.
 * 물에 빠진 꾸미기는 한도 자리("@" + 꾸미기 id)만 차지하고 영구 소장으로 지급한다.
 * 이미 가진 것은 빼고 고르고(한 정산 안에서 겹치지 않게), 다 가졌으면 희귀 물고기(alt)로 대신
 */
async function grantRange(store: ForageStore, acct: string, s: AutoSession, from: number, to: number, now: number) {
  if (to < from) return { items: [] as CatchResult[], dropped: 0, gear: [] as SunkenCatch[] };
  const rolled: Rolled[] = [];
  autoCatchTimes(s, from, to).forEach((t, i) => {
    const k = from + i;
    const cond = conditionsAt(t);
    const c = rollAutoCatch(s.seed, k, s.water, t, cond);
    if (!c) return;
    const pick = rollAutoSunken(s.seed, k);
    const alt = pick !== null ? sunkenFallbackFish(s.water, cond, hash01(`auto|${s.seed}|${k}|alt`), speciesById(c.id)!) : null;
    rolled.push({ day: kstDay(t), id: c.id, size: c.size, ...(pick !== null && alt ? { gear: { pick, alt: alt.id } } : {}) });
  });
  const owned = rolled.some((r) => r.gear) ? await ownedPermanent(acct, now) : new Set<string>();
  type Entry = { item: GrantItem; gear?: { id: string; name: string; alt: string } };
  const byDay = new Map<string, Entry[]>();
  for (const r of rolled) {
    let e: Entry = { item: { id: r.id, size: r.size } };
    if (r.gear) {
      const c = pickSunkenCosmetic(r.gear.pick, owned);
      if (c) {
        owned.add(c.id);
        e = { item: { id: `@${c.id}`, size: 0 }, gear: { id: c.id, name: sunkenName(c), alt: r.gear.alt } };
      } else e = { item: { id: r.gear.alt, size: 0 }, gear: { id: "", name: "", alt: r.gear.alt } };
    }
    const list = byDay.get(r.day) ?? [];
    list.push(e);
    byDay.set(r.day, list);
  }
  const items: CatchResult[] = [];
  const gear: SunkenCatch[] = [];
  let counted = 0;
  for (const [day, list] of byDay) {
    // 한도 안에 든 것은 앞에서부터 (got[i] ↔ list[i])
    const got = await store.grantAuto(acct, day, list.map((e) => e.item), STACK_MAX, AUTO_FISH_DAILY_MAX, DAILY_CATCH_MAX.fish);
    counted += got.length;
    for (let i = 0; i < got.length; i++) {
      const g = list[i].gear;
      if (!g || !got[i].id.startsWith("@")) {
        items.push(got[i]);
        // 꾸미기를 다 가져서 대신 희귀 물고기
        if (g) gear.push({ id: "", name: "", kept: false, instead: g.alt });
        continue;
      }
      if (await grantSunkenCosmetic(acct, g.id)) gear.push({ id: g.id, name: g.name, kept: true });
      else {
        // 그 사이 다른 곳에서 영구로 받았다 → 대신 물고기를 가방에만 (한도는 이미 셌다)
        await store.restore(acct, { [g.alt]: 1 }, STACK_MAX);
        gear.push({ id: g.id, name: g.name, kept: false, instead: g.alt });
      }
    }
  }
  return { items, dropped: rolled.length - counted, gear };
}

/** 신호만 (머무르기 기록 등): 세션이 있으면 접속 구간을 늘린다. 지급은 하지 않는다. 겹치면 그냥 넘어간다 (다음 신호·정산이 이어 준다) */
export async function beatAutoFish(acct: string, now: number, store: ForageStore = getForageStore()): Promise<void> {
  const raw = await store.autoGet(acct);
  const cur = parseAutoSession(raw);
  if (!raw || !cur) return;
  const next = beatAuto(cur, now);
  if (next === cur) return;
  await store.autoSwap(acct, raw, JSON.stringify(next));
}

export function autoStatus(s: AutoSession, day: LifeDay, now: number): AutoFishStatus {
  return {
    spot: s.spot,
    water: s.water,
    startedAt: s.start,
    endsAt: s.end,
    nextInMs: now >= s.end ? null : autoNextInMs(s),
    today: day.auto,
    cap: AUTO_FISH_DAILY_MAX,
    limited: day.auto >= AUTO_FISH_DAILY_MAX || day.fish >= DAILY_CATCH_MAX.fish,
  };
}
