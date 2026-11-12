import { nanoid } from "nanoid";
import { recordEvent } from "../analyticsService";
import { earnPoints, getAccounts, refundPoints, spendPoints } from "../store";
import { kstDay, kstWeek } from "../store/accounts";
import { earnRule } from "../economy";
import { env } from "../env";
import { HttpError } from "../http";
import { COSMETIC_DROPS, gearById, potionById, timeLimitSec, zoneFor, type Difficulty, type GameKind, type ZoneId } from "./catalog";
import {
  addDrops,
  addGear,
  addPotions,
  allocStats,
  consumePotions,
  equip,
  gainExp,
  learnSkill,
  removeForSale,
  returnUnsold,
  RpgError,
  setHotbar,
} from "./character";
import { derive, expToNext } from "./formulas";
import { evaluate, FINISH_GRACE_SEC } from "./rewards";
import { STARRY_NIGHT_BONUS, starryNight } from "../stargaze";
import type { z } from "zod";
import type { CharacterActionSchema, ShopActionSchema } from "./schemas";
import { getRpgStore, RUNS_PER_HOUR, type RpgStore } from "./store";
import { signTicket, verifyTicket } from "./ticket";
import type { CharacterState, Drop, RpgView, SoldInfo, RunFinishResponse, RunResult, RunStartResponse } from "./types";

// 사냥터 서버 로직 (라우트는 세션 확인·입력 검증·레이트리밋만 하고 여기로 넘긴다).
// 포인트는 백엔드 공용 함수(earnPoints/spendPoints)로만 움직인다. 사냥터 자체에는 포인트 장부가 없다.

const HUNT_CAP = earnRule("hunt").dailyMax;
const hourBucket = (now: number) => String(Math.floor(now / 3_600_000));

/** 순수 함수의 RpgError를 라우트 handler가 아는 HttpError로 바꾼다 */
async function http<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof RpgError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
}

export async function rpgView(acct: string, store: RpgStore = getRpgStore(), now = Date.now(), state?: CharacterState): Promise<RpgView> {
  const day = kstDay(now);
  const [character, daily, me, runs] = await Promise.all([
    state ?? store.get(acct),
    store.daily(acct, day),
    getAccounts().get(acct, day, now),
    store.runsThisHour(acct, hourBucket(now)),
  ]);
  return {
    character,
    derived: derive(character.level, character.stats, character.equip),
    expToNext: Number.isFinite(expToNext(character.level)) ? expToNext(character.level) : 0,
    points: me.points,
    today: { huntPoints: Math.min(daily.points, HUNT_CAP), cap: HUNT_CAP, runs: daily.runs, runsPerHour: RUNS_PER_HOUR - runs },
  };
}

// ── 캐릭터 (능력치·스킬·단축키·장착) ──

export async function characterAction(acct: string, a: z.output<typeof CharacterActionSchema>): Promise<RpgView> {
  const store = getRpgStore();
  const { state } = await http(
    store.update(acct, (s) => {
      switch (a.type) {
        case "alloc":
          return { state: allocStats(s, a.stats), result: null };
        case "learn":
          return { state: learnSkill(s, a.skill), result: null };
        case "hotbar":
          return { state: setHotbar(s, a.slots), result: null };
        case "equip":
          return { state: equip(s, a.slot, a.itemId), result: null };
      }
    }),
  );
  return rpgView(acct, store, Date.now(), state);
}

// ── 상점 (장비·포션 사기, 장비·포션 되팔기 — 여러 개 한 번에) ──

export async function shopAction(acct: string, a: z.input<typeof ShopActionSchema>, ipHash: string): Promise<RpgView & { sold?: SoldInfo }> {
  const store = getRpgStore();
  if (a.type === "buy") {
    const gear = gearById(a.itemId);
    const potion = potionById(a.itemId);
    if (!gear && !potion) throw new HttpError(400, "INVALID_INPUT", "없는 물건이에요.");
    const qty = gear ? 1 : (a.qty ?? 1);
    const add = (s: CharacterState) => (gear ? addGear(s, gear.id, true) : addPotions(s, potion!.id, qty));
    // 가방이 가득 찼는지 먼저 본다 (포인트를 빼고 나서 실패하는 일을 줄인다)
    await http(store.get(acct).then(add));
    const price = (gear?.price ?? potion!.price) * qty;
    await spendPoints(acct, price, `사냥터 상점: ${gear?.name ?? potion!.name}${qty > 1 ? ` ×${qty}` : ""}`);
    try {
      const { state } = await http(store.update(acct, (s) => ({ state: add(s), result: null })));
      return rpgView(acct, store, Date.now(), state);
    } catch (e) {
      // 그 사이 다른 탭에서 가방이 찼다 → 돌려준다
      await refundPoints(acct, price, `사냥터 상점 환불(가방 가득): ${gear?.name ?? potion!.name}`);
      throw e;
    }
  }
  // 1) 가방에서 count개를 한 번에 뺀다 (CAS: 모자라면 하나도 빼지 않는다). count가 없으면 예전처럼 1개
  const count = a.count ?? 1;
  const { state: removed, result } = await http(
    store.update(acct, (s) => {
      const r = removeForSale(s, a.itemId, count);
      return { state: r.state, result: r };
    }),
  );
  const name = gearById(a.itemId)?.name ?? potionById(a.itemId)?.name ?? a.itemId;
  const label = `${name}${count > 1 ? ` ×${count}` : ""}`;
  let state = removed;
  let value = 0;
  let capped = false;
  let unsold = 0;
  // 2) 산 장비 되팔기는 환불이라 하루 적립 한도와 무관하다 (산 값보다 늘 적어서 남는 장사가 없다)
  const refund = result.bought * result.unit;
  if (refund > 0) {
    await refundPoints(acct, refund, `사냥터 되팔기: ${label}`);
    value += refund;
  }
  // 3) 드롭 장비·포션 되팔기는 사냥 수입이다 → 사냥 포인트 하루 한도 안에서만 (원자적으로 한도까지만 적립)
  const want = result.drop * result.unit;
  if (want > 0) {
    const { earned } = await earnPoints(acct, "hunt", want, ipHash);
    capped = earned < want;
    value += earned;
    if (earned > 0) await store.addDaily(acct, kstDay(), { points: earned });
    // 한도에 막혀 값을 한 푼도 못 받은 만큼은 가방에 되돌린다 (일부만 받은 1개는 판 것으로 친다)
    unsold = Math.min(result.drop, Math.floor((want - earned) / result.unit));
    if (unsold > 0) state = (await http(store.update(acct, (s) => ({ state: returnUnsold(s, a.itemId, unsold), result: null })))).state;
  }
  return { ...(await rpgView(acct, store, Date.now(), state)), sold: { value, capped, count: count - unsold } };
}

// ── 판 시작·끝 ──

function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] & 0x7fffffff;
}

/**
 * 40번: 사냥터는 캐릭터 레벨로 차례로 열린다. 로컬 개발 서버(next dev)에서는 검수용으로 모두 열어 둔다
 * (화면은 `localStorage["tomb.rpg.unlockAll"]="1"`일 때만 잠금을 풀어 보여 준다)
 */
export const zoneUnlockBypass = () => process.env.NODE_ENV === "development";

export async function startRun(acct: string, game: GameKind, difficulty: Difficulty, now = Date.now(), zoneId?: ZoneId): Promise<RunStartResponse> {
  const store = getRpgStore();
  const c = await store.get(acct);
  const d = derive(c.level, c.stats, c.equip);
  const zone = game === "hunt" ? zoneFor(difficulty, zoneId) : null;
  if (zone && zoneId && zone.id !== zoneId) throw new HttpError(400, "INVALID_INPUT", "그 사냥터는 이 난이도에 없어요.");
  if (zone && c.level < zone.unlockLevel && !zoneUnlockBypass())
    throw new HttpError(403, "ZONE_LOCKED", `${zone.name}은(는) Lv.${zone.unlockLevel}부터 갈 수 있어요.`);
  const limit = timeLimitSec(game, difficulty, zone?.id);
  const nonce = nanoid(16);
  if (!(await store.startRun(acct, nonce, limit + FINISH_GRACE_SEC, hourBucket(now))))
    throw new HttpError(429, "RATE_LIMITED", `한 시간에 ${RUNS_PER_HOUR}판까지 할 수 있어요. 잠시 쉬었다 와요.`);
  const seed = newSeed();
  const ticket = await signTicket(env.sessionSecret(), {
    n: nonce,
    a: acct,
    g: game,
    d: difficulty,
    t: now,
    s: seed,
    lv: c.level,
    st: { agi: d.stats.agi, dex: d.stats.dex, luk: d.stats.luk },
    ...(zone ? { z: zone.id } : {}),
  });
  return { ticket, game, difficulty, ...(zone ? { zone: zone.id } : {}), seed, timeLimitSec: limit, view: await rpgView(acct, store, now, c) };
}

/** 코디 드롭 하나에 시도해 볼 후보 수 (이미 가진 것이면 다음 것) */
const COSMETIC_TRIES = 8;

/**
 * 11/12 기간제 코디 드롭 → 계정 가방. 상점 구매와 같은 원자적 확인을 0P로 한다 (unique: 가방·착용 중·벗어 둔 꾸미기에 이미 있으면
 * "owned" → 목록의 다음 후보). 후보를 다 가졌으면 그 드롭은 없던 것으로 한다. 판 기록은 이미 claim했으므로 두 번 받을 수 없다
 */
export async function grantCosmetics(acct: string, drops: Drop[], now: number): Promise<Drop[]> {
  if (!drops.some((d) => d.kind === "cosmetic")) return drops;
  const accounts = getAccounts();
  const out: Drop[] = [];
  for (const d of drops) {
    if (d.kind !== "cosmetic") {
      out.push(d);
      continue;
    }
    const start = Math.max(0, COSMETIC_DROPS.indexOf(d.id));
    for (let i = 0; i < Math.min(COSMETIC_TRIES, COSMETIC_DROPS.length); i++) {
      const id = COSMETIC_DROPS[(start + i) % COSMETIC_DROPS.length];
      if ((await accounts.buy(acct, id, 0, { unique: true, now })) === "ok") {
        out.push({ kind: "cosmetic", id, qty: 1 });
        break;
      }
    }
  }
  return out;
}

export async function finishRun(acct: string, token: string, result: RunResult, ipHash: string, now = Date.now()): Promise<RunFinishResponse> {
  const store = getRpgStore();
  const t = await verifyTicket(env.sessionSecret(), token);
  if (!t) throw new HttpError(400, "BAD_TICKET", "판 기록이 올바르지 않아요. 다시 시작해 주세요.");
  if (t.a !== acct) throw new HttpError(403, "BAD_TICKET", "다른 계정으로 시작한 판이에요.");
  const elapsed = now - t.t;
  const expired = elapsed > (timeLimitSec(t.g, t.d, t.z) + FINISH_GRACE_SEC) * 1000 || elapsed < 0;
  const claim = await store.claimRun(acct, t.n);
  if (claim === "reused") throw new HttpError(409, "TICKET_USED", "이미 결과를 받은 판이에요.");
  if (expired) throw new HttpError(410, "TICKET_EXPIRED", "너무 오래된 판이라 결과를 받을 수 없어요.");
  if (claim === "stale") throw new HttpError(409, "TICKET_STALE", "그 뒤에 새 판을 시작해서 이 판은 끝났어요.");

  const v = evaluate({ game: t.g, difficulty: t.d, seed: t.s, level: t.lv, st: t.st, ...(t.z ? { zone: t.z } : {}) }, result, elapsed);
  if (!v.ok) throw new HttpError(422, v.code, v.message);

  const { state, result: applied } = await http(
    store.update(acct, (s) => {
      let cur = s;
      if (result.game === "hunt") cur = consumePotions(cur, result.potionsUsed).state;
      const g = gainExp(cur, v.exp);
      const dr = addDrops(g.state, v.drops);
      return { state: { ...dr.state, runs: dr.state.runs + 1 }, result: { levelsGained: g.levelsGained, lost: dr.lost } };
    }),
  );
  const drops = await grantCosmetics(acct, v.drops, now);
  // 22번: 별자리 잇기를 진짜 맑은 밤(판 시작 시각, KST)에 했으면 포인트 보너스
  const nightBonus = t.g === "stars" && starryNight(t.t);
  const pointsRaw = nightBonus ? Math.round(v.points * STARRY_NIGHT_BONUS) : v.points;
  const earned = pointsRaw > 0 ? (await earnPoints(acct, "hunt", pointsRaw, ipHash)).earned : 0;
  await store.addDaily(acct, kstDay(now), { points: earned, runs: 1, exp: v.exp });
  if (t.g === "hunt") await recordEvent("hunt", now); // 47번 방문 분석: 사냥 판 수
  // 49번 랭킹: 사냥터별 최단 클리어·처치 수 (난이도 = 사냥터)
  if (v.hunt && (v.hunt.kills > 0 || v.hunt.clearMs !== null))
    await getAccounts().recordHunt(acct, t.d, v.hunt, kstWeek(now));
  return {
    reward: {
      score: v.score,
      exp: v.exp,
      pointsRaw,
      points: earned,
      capped: earned < pointsRaw,
      ...(nightBonus ? { nightBonus: true } : {}),
      drops,
      levelsGained: applied.levelsGained,
      newLevel: state.level,
      lostDrops: applied.lost,
    },
    view: await rpgView(acct, store, now, state),
  };
}
