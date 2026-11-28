import { recordKingCatch } from "./kingFish";
import { kstDay } from "../store/accounts";
import {
  autoCatchTimes,
  autoHit,
  autoHitInMs,
  autoNextInMs,
  autoTriesTotal,
  beatAuto,
  parseAutoSession,
  rollAutoCatch,
  type AutoSession,
} from "./auto";
import { speciesById, STACK_MAX } from "./catalog";
import { conditionsAt, hash01 } from "./rules";
import { pickSunkenCosmetic, rollAutoSunken, rollAutoSunkenDays, sunkenFallbackFish, sunkenName } from "./sunken";
import { grantSunkenTerm, ownedCosmetics, sunkenDays } from "./sunkenGrant";
import { getForageStore, type ForageStore, type GrantItem } from "./store";
import type { AutoFishStatus, CatchResult, LifeDay, RaftGearCatch, SunkenCatch } from "./types";
import { everyOf } from "./auto";
import { grantRaftRange } from "../raft/gear";
import { gearForced } from "./gearDev";

// 자동 낚시 정산 (서버). 세션은 저장소의 문자열 하나이고 "이전 값과 같을 때만 바꾸기"(autoSwap)로만 바꾼다
// → 동시에 정산을 여러 번 눌러도 같은 번호의 물고기는 한 번만 지급된다 (바꾸기에 성공한 쪽만 지급).
// 물고기는 세션 시드 + 번호로 결정적으로 굴리므로, 바꾸기에 져서 다시 시도해도 같은 번호면 같은 물고기다.

const SWAP_TRIES = 5;

export type AutoSettled = {
  /** 정산 뒤 세션 (끝났으면 null) */
  session: AutoSession | null;
  items: CatchResult[];
  /** 찌를 올렸지만 놓친 수 (11/19 자동 낚시는 시도마다 AUTO_CATCH_CHANCE로 걸린다) */
  missed: number;
  gear: SunkenCatch[];
  /** 11/19 가방이 가득 차서 쉰 시도가 있었는지 */
  full?: boolean;
  /** 11/22 시간 제한이 없어져 "time"(예전 6시간)은 더 나오지 않는다 */
  ended?: "stop" | "tide" | "raft";
  /** 11/27 좌대 전용 코디 (내 좌대 자동 낚시로 걸린 한 마리마다 굴린다 — lib/raft/gear, protocol RAFT_GEAR_ODDS) */
  raftGear?: RaftGearCatch[];
  /** 11/28 끝낸 세션의 자리·채널·좌대 (끝났을 때만 — 관리자 기록 「자동 낚시 해제」에) */
  was?: { spot: string; ch: number | null; n?: number };
};

/** 정산: 지금까지 올린 시도 번호 중 아직 안 본 것을 그 시각 조건으로 굴려 걸린 것만 그날(게임 날짜, 새벽 5시 경계) 기록으로 넣는다. stop이면 세션을 끝낸다 */
export async function settleAuto(store: ForageStore, acct: string, now: number, stop: boolean): Promise<AutoSettled> {
  for (let i = 0; i < SWAP_TRIES; i++) {
    const raw = await store.autoGet(acct);
    if (!raw) return { session: null, items: [], missed: 0, gear: [] };
    const cur = parseAutoSession(raw);
    if (!cur) {
      // 알아볼 수 없는 값은 지운다
      await store.autoSwap(acct, raw, null);
      return { session: null, items: [], missed: 0, gear: [] };
    }
    const beaten = beatAuto(cur, now);
    const total = autoTriesTotal(beaten);
    // 11/22 end는 바닷가 물때로 끝날 때만 실제 시각 (그 밖에는 AUTO_NO_END — lib/forage/auto)
    const timeUp = now >= beaten.end;
    const finish = stop || timeUp;
    const next: AutoSession = { ...beaten, done: Math.max(cur.done, total) };
    if (!(await store.autoSwap(acct, raw, finish ? null : JSON.stringify(next)))) continue;
    const { items, missed, gear, full } = await grantRange(store, acct, beaten, cur.done + 1, total, now);
    const raftGear = cur.raft ? await grantRaftRange(acct, beaten, cur.done + 1, total, now) : [];
    const ended = stop ? ("stop" as const) : cur.tide ? ("tide" as const) : cur.raft ? ("raft" as const) : ("stop" as const);
    const was = { spot: cur.spot, ch: cur.ch, ...(cur.raft ? { n: cur.raft.n } : {}) };
    return { session: finish ? null : next, items, missed, gear, ...(full ? { full } : {}), ...(raftGear.length ? { raftGear } : {}), ...(finish ? { ended, was } : {}) };
  }
  throw new Error("[forage] 자동 낚시 정산이 계속 겹쳤어요");
}

type Rolled = { day: string; id: string; size: number; gear?: { pick: number; alt: string; gd: number } };

/**
 * from..to번 시도를 굴려(그 시각 조건, 시드 + 번호) 걸린 것만 낚인 날(게임 날짜)마다 넣는다.
 * 물에 빠진 꾸미기는 걸린 물고기 자리에서만 굴리고(잡힌 한 마리당 SUNKEN_CHANCE_AUTO), 자리("@" + 꾸미기 id)만 세고 기간제로 지급한다 (11/28 — 기간 난수는 시드 + 번호 「gd」).
 * 영구로 가진 것은 빼고 고르고(한 정산 안에서 겹치지 않게), 다 영구로 가졌으면 희귀 물고기(alt)로 대신. 기간제로 가진 것이면 기간이 더해진다
 */
async function grantRange(store: ForageStore, acct: string, s: AutoSession, from: number, to: number, now: number) {
  if (to < from) return { items: [] as CatchResult[], missed: 0, gear: [] as SunkenCatch[], full: false };
  const rolled: Rolled[] = [];
  let missed = 0;
  // 11/28 개발 전용 확인 (lib/forage/gearDev — 운영은 늘 false): 걸린 한 마리마다 꾸미기로
  const force = gearForced(acct, "sunken");
  autoCatchTimes(s, from, to).forEach((t, i) => {
    const k = from + i;
    if (!autoHit(s.seed, k)) {
      missed++;
      return;
    }
    const cond = conditionsAt(t);
    const c = rollAutoCatch(s.seed, k, s.water, t, cond);
    if (!c) return;
    const pick = force ? hash01(`auto|${s.seed}|${k}|gp`) : rollAutoSunken(s.seed, k);
    const alt = pick !== null ? sunkenFallbackFish(s.water, cond, hash01(`auto|${s.seed}|${k}|alt`), speciesById(c.id)!, true) : null;
    rolled.push({ day: kstDay(t), id: c.id, size: c.size, ...(pick !== null && alt ? { gear: { pick, alt: alt.id, gd: rollAutoSunkenDays(s.seed, k) } } : {}) });
  });
  const mine = rolled.some((r) => r.gear) ? await ownedCosmetics(acct, now) : { perm: new Set<string>(), timed: new Set<string>() };
  const owned = mine.perm;
  type Entry = { item: GrantItem; gear?: { id: string; name: string; alt: string; days: number } };
  const byDay = new Map<string, Entry[]>();
  for (const r of rolled) {
    let e: Entry = { item: { id: r.id, size: r.size } };
    if (r.gear) {
      const c = pickSunkenCosmetic(r.gear.pick, owned);
      if (c) {
        owned.add(c.id);
        e = { item: { id: `@${c.id}`, size: 0 }, gear: { id: c.id, name: sunkenName(c), alt: r.gear.alt, days: sunkenDays(r.gear.gd, c) } };
      } else e = { item: { id: r.gear.alt, size: 0 }, gear: { id: "", name: "", alt: r.gear.alt, days: 0 } };
    }
    const list = byDay.get(r.day) ?? [];
    list.push(e);
    byDay.set(r.day, list);
  }
  const items: CatchResult[] = [];
  const gear: SunkenCatch[] = [];
  let full = false;
  for (const [day, list] of byDay) {
    // 넣은 순서 그대로 (got[i] ↔ list[i])
    const got = await store.grantAuto(acct, day, list.map((e) => e.item), STACK_MAX);
    // 11/23 낚시왕이면 자동 낚시로 잡은 물고기도 이번 주 판매 보너스 표에 (lib/forage/kingFish — 꾸미기 자리 「@」는 빼고)
    await recordKingCatch(acct, got.filter((g) => !g.rest && !g.id.startsWith("@")).map((g) => g.id), now);
    for (let i = 0; i < got.length; i++) {
      // 11/19 가방이 가득 차서 쉰 자리 (아무것도 받지 않는다)
      if (got[i].rest) {
        full = true;
        continue;
      }
      const g = list[i].gear;
      if (!g || !got[i].id.startsWith("@")) {
        items.push(got[i]);
        // 꾸미기를 다 가져서 대신 희귀 물고기
        if (g) gear.push({ id: "", name: "", kept: false, instead: g.alt });
        continue;
      }
      if (await grantSunkenTerm(acct, g.id, g.days, now)) gear.push({ id: g.id, name: g.name, kept: true, days: g.days, ...(mine.timed.has(g.id) ? { ext: true as const } : {}) });
      else {
        // 그 사이 다른 곳에서 영구로 받았다 → 대신 물고기를 가방에만 (낚은 수는 이미 셌다)
        await store.restore(acct, { [g.alt]: 1 }, STACK_MAX);
        gear.push({ id: g.id, name: g.name, kept: false, instead: g.alt });
      }
    }
  }
  return { items, missed, gear, full };
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

/** 11/27 다음 걸리는 찌까지 (끝나는 시각 — 좌대 입장권·물때 — 뒤면 null) */
function hitIn(s: AutoSession, now: number): number | null {
  if (now >= s.end) return null;
  const ms = autoHitInMs(s);
  return ms !== null && now + ms <= s.end ? ms : null;
}

export function autoStatus(s: AutoSession, day: LifeDay, now: number): AutoFishStatus {
  return {
    spot: s.spot,
    water: s.water,
    startedAt: s.start,
    // 11/22 끝이 있는 건 바닷가 물때·11/27 좌대 입장권뿐 (나머지는 null)
    endsAt: s.tide || s.raft ? s.end : null,
    ...(s.raft ? { raft: s.raft.n, every: everyOf(s) } : {}),
    nextInMs: now >= s.end ? null : autoNextInMs(s),
    hitInMs: hitIn(s, now),
    today: day.auto,
  };
}
