import { nanoid } from "nanoid";
import { fishingWaterOf, STAFF_PUBLIC_NAME } from "@tomb/protocol";
import { BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import { env } from "../env";
import { peerOf } from "../ban";
import { HttpError } from "../http";
import { isStaff } from "../staff";
import { earnPoints, getAccounts } from "../store";
import { kstDay, kstWeek, loadMe } from "../store/accounts";
import type { BugsResult } from "../rpg/types";
import {
  DAILY_CATCH_MAX,
  DEX_CATS,
  dexBadgeBits,
  DEX_REWARD,
  DEX_TIERS,
  DEX_TITLES,
  dexClaimKey,
  dexIdsOf,
  gatherNodeById,
  NODE_CAT,
  npcById,
  speciesById,
  STACK_MAX,
  type DexCat,
  type DexTier,
  type NpcId,
} from "./catalog";
import {
  activeNodes,
  BUG_ROUND_SEC,
  BUG_TTL_SEC,
  biteDelayMs,
  candidates,
  conditionsAt,
  fishPower,
  GATHER_MS,
  GATHER_SLACK_MS,
  GATHER_TTL_SEC,
  gatherCount,
  HOOK_WINDOW_MS,
  insectRolls,
  nodeActive,
  nodeWindow,
  pickWeighted,
  REEL_MAX_MS,
  REEL_SLACK_MS,
  reelMinMs,
  rollSize10,
  verifyBugs,
  windowEndsAt,
} from "./rules";
import { AUTO_FISH_DAILY_MAX, newAutoSession } from "./auto";
import { autoStatus, settleAuto, type AutoSettled } from "./autoSettle";
import { getFishRank } from "./fishRank";
import { pickSunkenCosmetic, SUNKEN_CHANCE, sunkenFallbackFish, sunkenName } from "./sunken";
import { grantSunkenCosmetic, ownedPermanent } from "./sunkenGrant";
import { getForageStore, type GrantItem, type ForageStore, type Snapshot } from "./store";
import { signForageTicket, verifyForageTicket, type ForageTicket } from "./ticket";
import type {
  AutoFishResponse,
  CastResponse,
  CatchResult,
  DexClaimResponse,
  GatherFinishResponse,
  GatherStartResponse,
  ForageState,
  PublicDex,
  ReelResponse,
  SellResponse,
} from "./types";

// 낚시·채집·NPC 판매·도감 서버 로직 (라우트는 세션 확인·입력 검증만 하고 여기로 넘긴다).
// 위조 방지:
//  - 무엇이 걸렸는지(종류·크기)는 시작할 때 서버가 굴려 진행 기록(저장소)에만 둔다. 티켓에는 시각·자리·손맛만.
//  - 끝낼 때 티켓 서명·계정·한 번만 쓰기·시간(입질 전/너무 빠른 감기/게이지보다 빠름/너무 늦음)을 확인한다.
//  - 곤충은 미니게임 시드로 다시 만든 출현 계획으로 결과의 상한을 검사한다 (사냥터와 같은 방식).
//  - 도감 등록·가방 추가는 이 결과 API(grant)에서만. 포인트는 NPC에게 팔 때 earnPoints(항목·하루·지갑·IP 한도)로만.

/** 한 시간에 시작할 수 있는 낚시·채집 수 (둘을 합쳐서. 평범하게 하면 시간당 100번도 어렵다) */
export const FORAGE_STARTS_PER_HOUR = 300;
const hourBucket = (now: number) => String(Math.floor(now / 3_600_000));

function rand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
const newSeed = () => Math.floor(rand() * 0x7fffffff);

const SOURCE_OF_NPC: Record<NpcId, Extract<EarnSource, "fish" | "gather">> = { fishmonger: "fish", collector: "gather" };
const DAY_FIELD = { fish: "fishP", gather: "gatherP", dex: "dexP" } as const;

/** 받은 보상 → 칭호 */
function titlesOf(claims: Record<string, string>): string[] {
  const out: string[] = [];
  for (const cat of DEX_CATS)
    for (const tier of DEX_TIERS) {
      const t = DEX_TITLES[cat][tier];
      if (t && claims[dexClaimKey(cat, tier)]) out.push(t);
    }
  return out;
}

function toState(acct: string, snap: Snapshot, now: number): ForageState {
  const w = nodeWindow(now);
  return {
    bag: snap.bag,
    dex: snap.dex,
    claims: snap.claims,
    titles: titlesOf(snap.claims),
    today: { ...snap.day, fishCap: earnRule("fish").dailyMax, gatherCap: earnRule("gather").dailyMax, dexCap: earnRule("dex").dailyMax, autoCap: AUTO_FISH_DAILY_MAX },
    nodes: { ids: activeNodes(acct, now, new Set(snap.taken)).map((n) => n.id), refreshAt: windowEndsAt(w) },
  };
}

export async function forageState(acct: string, now = Date.now(), store: ForageStore = getForageStore()): Promise<ForageState> {
  return toState(acct, await store.snapshot(acct, kstDay(now), nodeWindow(now)), now);
}

/** 도감 칸 채운 비율 (%, 내림). 별자리 칸도 같은 방식 (완성한 별자리 수) */
export function dexPercent(dex: Record<string, { n: number }>, cat: DexCat): number {
  const all = dexIdsOf(cat);
  const got = all.filter((id) => (dex[id]?.n ?? 0) > 0).length;
  return Math.floor((got * 100) / all.length);
}

async function ticketOf(acct: string, token: string, kind: ForageTicket["k"]): Promise<ForageTicket> {
  const t = await verifyForageTicket(env.sessionSecret(), token);
  if (!t || t.k !== kind) throw new HttpError(400, "BAD_TICKET", "기록이 올바르지 않아요. 다시 시작해 주세요.");
  if (t.a !== acct) throw new HttpError(403, "BAD_TICKET", "다른 계정으로 시작한 기록이에요.");
  return t;
}

async function claimOrThrow(store: ForageStore, acct: string, nonce: string): Promise<string> {
  const c = await store.claim(acct, nonce);
  if (c.status === "reused") throw new HttpError(409, "TICKET_USED", "이미 결과를 받았어요.");
  if (c.status !== "ok") throw new HttpError(409, "TICKET_STALE", "그 뒤에 새로 시작했거나 너무 오래돼서 이 기록은 끝났어요.");
  return c.payload;
}

// ── 낚시 ──

/** g = 물에 빠진 꾸미기를 고를 난수 (아주 드물게, 던질 때 서버가 정한다), alt = 꾸미기를 다 가졌을 때 대신 줄 물고기 */
type FishPayload = { k: "fish"; sp: string; sz: number; g?: number; alt?: string };

export async function castLine(acct: string, spotId: string, now = Date.now()): Promise<CastResponse> {
  const store = getForageStore();
  // 정해진 낚시 자리 또는 배 위 가상 자리(boat:river·boat:lake) — 물 종류로 물고기를 고른다
  const water = fishingWaterOf(spotId);
  if (!water) throw new HttpError(400, "INVALID_INPUT", "여기서는 낚시를 할 수 없어요.");
  // 직접 던지면 자동 낚시는 끝난다 (둘을 한꺼번에 할 수 없다). 그때까지 낚은 것은 정산해 넣는다
  if (await store.autoGet(acct)) await settleAuto(store, acct, now, true);
  const snap = await store.snapshot(acct, kstDay(now), nodeWindow(now));
  if (snap.day.fish >= DAILY_CATCH_MAX.fish) throw new HttpError(429, "DAILY_LIMIT", "오늘은 물고기를 충분히 잡았어요. 내일 또 와요.");
  const cond = conditionsAt(now);
  const s = pickWeighted(candidates("fish", water, cond), rand());
  if (!s) throw new HttpError(409, "NO_FISH", "지금은 아무것도 물지 않아요.");
  const size = rollSize10(s, rand());
  const power = fishPower(s, size);
  const bite = now + biteDelayMs(rand(), cond);
  const nonce = nanoid(16);
  const payload: FishPayload = { k: "fish", sp: s.id, sz: size };
  // 아주 드물게 물고기 대신 꾸미기 (손맛·입질은 물고기 그대로 → 미리 알 수 없다). 무엇인지는 감을 때 가진 것을 보고 고른다
  if (rand() < SUNKEN_CHANCE) {
    payload.g = rand();
    payload.alt = sunkenFallbackFish(water, cond, rand(), s).id;
  }
  const ttl = Math.ceil((bite - now + HOOK_WINDOW_MS + REEL_MAX_MS) / 1000) + 30;
  if (!(await store.begin(acct, nonce, JSON.stringify(payload), ttl, hourBucket(now), FORAGE_STARTS_PER_HOUR)))
    throw new HttpError(429, "RATE_LIMITED", "조금 쉬었다 해요. 한 시간에 낚시·채집을 너무 많이 했어요.");
  const ticket = await signForageTicket(env.sessionSecret(), { n: nonce, a: acct, k: "fish", x: spotId, t: now, b: bite, p: power });
  return { ticket, biteInMs: bite - now, power, reelMs: reelMinMs(power), hookMs: HOOK_WINDOW_MS };
}

/** ok=false: 놓쳤다(너무 일찍 당김·줄이 끊김·도망). 기록만 끝낸다 */
export async function reelIn(acct: string, token: string, ok: boolean, now = Date.now()): Promise<ReelResponse> {
  const store = getForageStore();
  const t = await ticketOf(acct, token, "fish");
  const payload = JSON.parse(await claimOrThrow(store, acct, t.n)) as FishPayload;
  if (!ok) return { result: null, state: await forageState(acct, now, store) };
  const since = now - (t.b ?? t.t);
  if (since < reelMinMs(t.p ?? 1) - REEL_SLACK_MS) throw new HttpError(422, "TOO_FAST", "입질도 전에, 또는 너무 빨리 감았어요. 이번 물고기는 놓쳤어요.");
  if (since > HOOK_WINDOW_MS + REEL_MAX_MS) throw new HttpError(410, "TICKET_EXPIRED", "너무 오래 걸려서 물고기가 도망갔어요.");
  const day = kstDay(now);
  if (payload.g !== undefined) return reelSunken(store, acct, payload, now);
  const got = await store.grant(acct, day, "fish", [{ id: payload.sp, size: payload.sz }], STACK_MAX);
  // 최대어 랭킹: 크기는 시작할 때 서버가 굴린 값 (가방이 가득 차 못 넣었어도 잡은 기록은 남는다). 랭킹 저장 실패가 낚시를 막지는 않는다
  // 운영자 계정은 순위에 남기지 않는다
  if (got?.[0] && payload.sz > 0 && !(await isStaff(acct)))
    await getFishRank()
      .record(acct, payload.sp, payload.sz, kstWeek(now))
      .catch((e) => console.error("[forage] 최대어 기록 실패", e));
  return { result: got?.[0] ?? null, state: await forageState(acct, now, store) };
}

// ── 자동 낚시 (lib/forage/auto.ts) ──

async function autoResponse(store: ForageStore, acct: string, r: AutoSettled, now: number): Promise<AutoFishResponse> {
  const snap = await store.snapshot(acct, kstDay(now), nodeWindow(now));
  return {
    auto: r.session ? autoStatus(r.session, snap.day, now) : null,
    items: r.items,
    dropped: r.dropped,
    gear: r.gear,
    ...(r.ended ? { ended: r.ended } : {}),
    state: toState(acct, snap, now),
  };
}

/** 켜기: 낚시 자리(배 위 포함)에서. 이미 켜 둔 세션이 있으면 정산하고 새로 시작한다 */
export async function startAutoFish(acct: string, spotId: string, ch: number | null, now = Date.now()): Promise<AutoFishResponse> {
  const store = getForageStore();
  const water = fishingWaterOf(spotId);
  if (!water) throw new HttpError(400, "INVALID_INPUT", "여기서는 낚시를 할 수 없어요.");
  const prev = await settleAuto(store, acct, now, true);
  const day = (await store.snapshot(acct, kstDay(now), nodeWindow(now))).day;
  if (day.fish >= DAILY_CATCH_MAX.fish) throw new HttpError(429, "DAILY_LIMIT", "오늘은 물고기를 충분히 잡았어요. 내일 또 와요.");
  if (day.auto >= AUTO_FISH_DAILY_MAX) throw new HttpError(429, "AUTO_LIMIT", `자동 낚시는 하루 ${AUTO_FISH_DAILY_MAX}마리까지예요. 직접 낚거나 내일 또 와요.`);
  const session = newAutoSession(newSeed(), spotId, water, ch, now);
  // 그 사이 다른 탭이 먼저 켰으면 그쪽을 정산하고 다시
  for (let i = 0; i < 3 && !(await store.autoSwap(acct, null, JSON.stringify(session))); i++) {
    const more = await settleAuto(store, acct, now, true);
    prev.items.push(...more.items);
    prev.gear.push(...more.gear);
    prev.dropped += more.dropped;
  }
  return autoResponse(store, acct, { ...prev, session, ended: undefined }, now);
}

/** 정산 (보이는 동안 주기적으로, 숨었다가 돌아오면). 세션이 없으면 auto: null */
export async function syncAutoFish(acct: string, now = Date.now()): Promise<AutoFishResponse> {
  const store = getForageStore();
  return autoResponse(store, acct, await settleAuto(store, acct, now, false), now);
}

/** 끄기 (움직임·일어남·장면 떠남): 정산하고 끝낸다 */
export async function stopAutoFish(acct: string, now = Date.now()): Promise<AutoFishResponse> {
  const store = getForageStore();
  return autoResponse(store, acct, await settleAuto(store, acct, now, true), now);
}

/** 물에 빠진 꾸미기를 건졌다: 영구 소장으로 지급(낚시 1회로 셈, 도감·최대어 기록 없음). 다 가졌으면 대신 희귀 물고기 */
async function reelSunken(store: ForageStore, acct: string, p: FishPayload, now: number): Promise<ReelResponse> {
  const day = kstDay(now);
  const c = pickSunkenCosmetic(p.g!, await ownedPermanent(acct, now));
  if (c && (await grantSunkenCosmetic(acct, c.id))) {
    await store.addDay(acct, day, "fish", 1);
    return { result: null, gear: { id: c.id, name: sunkenName(c), kept: true }, state: await forageState(acct, now, store) };
  }
  const alt = p.alt ?? p.sp;
  const got = await store.grant(acct, day, "fish", [{ id: alt, size: 0 }], STACK_MAX);
  return {
    result: got?.[0] ?? null,
    gear: { id: c?.id ?? "", name: c ? sunkenName(c) : "", kept: false, instead: alt },
    state: await forageState(acct, now, store),
  };
}

// ── 채집 ──

type GatherPayload = { k: "gather"; items?: GrantItem[] };

export async function startGather(acct: string, nodeId: string, now = Date.now()): Promise<GatherStartResponse> {
  const store = getForageStore();
  const n = gatherNodeById(nodeId);
  if (!n) throw new HttpError(400, "INVALID_INPUT", "여기서는 캘 게 없어요.");
  const w = nodeWindow(now);
  const snap = await store.snapshot(acct, kstDay(now), w);
  if (!nodeActive(acct, n, w) || snap.taken.includes(n.id)) throw new HttpError(409, "NODE_EMPTY", "지금은 비어 있어요. 조금 뒤에 다시 피어나요.");
  if (snap.day.gather >= DAILY_CATCH_MAX.gather) throw new HttpError(429, "DAILY_LIMIT", "오늘은 충분히 모았어요. 내일 또 와요.");
  const nonce = nanoid(16);
  const begin = async (payload: GatherPayload, ttl: number) => {
    if (!(await store.begin(acct, nonce, JSON.stringify(payload), ttl, hourBucket(now), FORAGE_STARTS_PER_HOUR)))
      throw new HttpError(429, "RATE_LIMITED", "조금 쉬었다 해요. 한 시간에 낚시·채집을 너무 많이 했어요.");
  };
  const secret = env.sessionSecret();
  if (n.kind === "bug") {
    const seed = newSeed();
    await begin({ k: "gather" }, BUG_TTL_SEC);
    const phase = conditionsAt(now).phase;
    const ticket = await signForageTicket(secret, { n: nonce, a: acct, k: "gather", x: n.id, t: now, w, m: 0, s: seed });
    return { ticket, mode: "bugs", kind: "bug", seed, timeLimitSec: BUG_ROUND_SEC, night: phase === "night" || phase === "dusk", phase };
  }
  const s = pickWeighted(candidates(NODE_CAT[n.kind], n.where, conditionsAt(now)), rand());
  if (!s) throw new HttpError(409, "NODE_EMPTY", "지금은 비어 있어요. 조금 뒤에 다시 피어나요.");
  const items = Array.from({ length: gatherCount(n.kind, rand()) }, () => ({ id: s.id, size: 0 }));
  const ms = GATHER_MS[n.kind];
  await begin({ k: "gather", items }, GATHER_TTL_SEC);
  const ticket = await signForageTicket(secret, { n: nonce, a: acct, k: "gather", x: n.id, t: now, w, m: ms });
  return { ticket, mode: "gauge", kind: n.kind, durationMs: ms };
}

export async function finishGather(acct: string, token: string, result: BugsResult | undefined, now = Date.now()): Promise<GatherFinishResponse> {
  const store = getForageStore();
  const t = await ticketOf(acct, token, "gather");
  const n = gatherNodeById(t.x);
  if (!n || t.w === undefined) throw new HttpError(400, "BAD_TICKET", "기록이 올바르지 않아요. 다시 시작해 주세요.");
  const payload = JSON.parse(await claimOrThrow(store, acct, t.n)) as GatherPayload;
  const elapsed = now - t.t;
  let items: GrantItem[];
  let message: string | undefined;
  if (n.kind === "bug") {
    if (!result || t.s === undefined) throw new HttpError(400, "INVALID_RESULT", "곤충 잡기 결과가 없어요.");
    const v = verifyBugs(t.s, result, elapsed);
    if (!v.ok) throw new HttpError(422, "RESULT_REJECTED", `${v.message} 이번엔 빈손이에요.`);
    const r = insectRolls(v.caught, v.golden, v.mistakes);
    const cond = conditionsAt(t.t);
    const common = candidates("bug", n.where, cond, (s) => s.rarity <= 2);
    const rarePool = candidates("bug", n.where, cond, (s) => s.rarity >= 3);
    items = [];
    for (let i = 0; i < r.common; i++) {
      const s = pickWeighted(common, rand());
      if (s) items.push({ id: s.id, size: rollSize10(s, rand()) });
    }
    for (let i = 0; i < r.rare; i++) {
      const s = pickWeighted(rarePool.length ? rarePool : common, rand());
      if (s) items.push({ id: s.id, size: rollSize10(s, rand()) });
    }
    if (!items.length) message = "곤충이 모두 날아갔어요. 다섯 마리는 잡아야 하나라도 챙겨요.";
  } else {
    if (elapsed < (t.m ?? 0) - GATHER_SLACK_MS) throw new HttpError(422, "TOO_FAST", "다 캐기 전에 끝냈어요. 이번엔 빈손이에요.");
    items = payload.items ?? [];
  }
  const got = await store.grant(acct, kstDay(now), "gather", items, STACK_MAX, { window: t.w, node: n.id });
  if (!got) throw new HttpError(409, "NODE_EMPTY", "이미 캔 자리예요.");
  return { items: got satisfies CatchResult[], state: await forageState(acct, now, store), ...(message ? { message } : {}) };
}

// ── NPC 판매 ──

/**
 * NPC에게 팔기. 비싼 것부터 오늘 남은 한도(항목 한도·하루 전체·지갑) 안에서 개수 단위로만 판다 →
 * 한도를 넘는 만큼은 가방에 그대로 남아 내일 팔 수 있다. NPC 앞에서만 여는 창은 UI 몫(서버는 위치를 모른다 — 어디서 불러도 같은 한도라 이득이 없다)
 */
export async function sellTo(acct: string, npcId: NpcId, want: Record<string, number>, ipHash: string, now = Date.now()): Promise<SellResponse> {
  const store = getForageStore();
  const npc = npcById(npcId);
  if (!npc) throw new HttpError(400, "INVALID_INPUT", "그런 상인은 없어요.");
  const source = SOURCE_OF_NPC[npc.id];
  const day = kstDay(now);
  const [snap, acc] = await Promise.all([store.snapshot(acct, day, nodeWindow(now)), getAccounts().get(acct, day, now)]);
  const units: { id: string; price: number }[] = [];
  for (const [id, raw] of Object.entries(want)) {
    const s = speciesById(id);
    if (!s || !npc.buys.includes(s.cat)) throw new HttpError(400, "INVALID_INPUT", `${npc.name}은(는) 그건 안 사요.`);
    const n = Math.min(Math.max(0, Math.floor(raw)), snap.bag[id] ?? 0);
    for (let i = 0; i < n; i++) units.push({ id, price: s.price });
  }
  if (!units.length) throw new HttpError(409, "NOTHING_TO_SELL", "팔 게 없어요.");
  let left = Math.min(earnRule(source).dailyMax - snap.day[DAY_FIELD[source]], DAILY_EARN_CAP - acc.todayEarned, BALANCE_CAP - acc.points);
  units.sort((a, b) => b.price - a.price);
  const plan: Record<string, number> = {};
  let value = 0;
  for (const u of units) {
    if (u.price > left) continue;
    left -= u.price;
    value += u.price;
    plan[u.id] = (plan[u.id] ?? 0) + 1;
  }
  const capped = value < units.reduce((n, u) => n + u.price, 0);
  if (!value) return { sold: {}, earned: 0, capped: true, state: toState(acct, snap, now), me: await loadMe(getAccounts(), acct, now) };
  if (!(await store.remove(acct, plan))) throw new HttpError(409, "BAG_CHANGED", "가방이 바뀌었어요. 다시 골라 주세요.");
  const { earned, me } = await earnPoints(acct, source, value, ipHash);
  if (earned < value) {
    // 그 사이 다른 적립으로 한도가 줄었다 → 값을 못 받은 만큼(싼 것부터) 가방에 되돌린다
    const soldUnits = Object.entries(plan)
      .flatMap(([id, k]) => Array.from({ length: k }, () => ({ id, price: speciesById(id)!.price })))
      .sort((a, b) => b.price - a.price);
    let paid = 0;
    const back: Record<string, number> = {};
    for (const u of soldUnits) {
      if (paid + u.price <= earned) paid += u.price;
      else back[u.id] = (back[u.id] ?? 0) + 1;
    }
    for (const [id, k] of Object.entries(back)) {
      plan[id] -= k;
      if (plan[id] <= 0) delete plan[id];
    }
    if (Object.keys(back).length) await store.restore(acct, back, STACK_MAX);
  }
  if (earned > 0) await store.addDay(acct, day, DAY_FIELD[source], earned);
  return { sold: plan, earned, capped: capped || earned < value, state: await forageState(acct, now, store), me };
}

// ── 도감 ──

export async function claimDexReward(acct: string, cat: DexCat, tier: DexTier, ipHash: string, now = Date.now()): Promise<DexClaimResponse> {
  const store = getForageStore();
  const day = kstDay(now);
  const [snap, acc] = await Promise.all([store.snapshot(acct, day, nodeWindow(now)), getAccounts().get(acct, day, now)]);
  if (dexPercent(snap.dex, cat) < tier) throw new HttpError(409, "NOT_YET", `아직 ${tier}%를 채우지 못했어요.`);
  const key = dexClaimKey(cat, tier);
  if (snap.claims[key]) throw new HttpError(409, "ALREADY", "이미 받은 보상이에요.");
  const reward = DEX_REWARD[tier];
  const left = Math.min(earnRule("dex").dailyMax - snap.day.dexP, DAILY_EARN_CAP - acc.todayEarned, BALANCE_CAP - acc.points);
  if (left < reward) throw new HttpError(409, "DAILY_CAP", "오늘 받을 수 있는 포인트가 다 찼어요. 내일 받으면 돼요.");
  if (!(await store.claimDex(acct, key, day))) throw new HttpError(409, "ALREADY", "이미 받은 보상이에요.");
  const { earned, me } = await earnPoints(acct, "dex", reward, ipHash);
  if (earned > 0) await store.addDay(acct, day, "dexP", earned);
  return { earned, title: DEX_TITLES[cat][tier] ?? null, state: await forageState(acct, now, store), me };
}

/** 다른 사람 도감 구경 (프로필·랭킹에서) */
export async function publicDex(accountId: string, now = Date.now()): Promise<PublicDex> {
  const [d, acc, staff] = await Promise.all([getForageStore().dex(accountId), getAccounts().get(accountId, kstDay(now), now), isStaff(accountId)]);
  // 운영자는 다른 사람에게 공개 이름("대장")으로
  return { accountId, name: staff ? STAFF_PUBLIC_NAME : acc.name, dex: d.dex, titles: titlesOf(d.claims) };
}

/**
 * 게임 안에서 누른 다른 사람의 도감: 채널·방과 sid로 실시간 서버에 누구인지 물어(서명된 /internal/peer) 서버에서만 계정을 푼다.
 * 응답에는 계정 id를 넣지 않는다 (브라우저는 sid만 안다)
 */
export async function peerDex(where: { ch: number } | { room: string }, sid: number, now = Date.now()): Promise<PublicDex> {
  const peer = await peerOf(where, sid);
  if (!peer) throw new HttpError(404, "NOT_FOUND", "그 사람을 찾지 못했어요. 이미 나갔을 수 있어요.");
  // 운영자 캐릭터는 정보를 내보내지 않는다 (화면에서도 운영자를 눌러 열 수 없다)
  if (await isStaff(peer.visitorId)) throw new HttpError(403, "STAFF_TARGET", "운영자의 정보는 볼 수 없어요.");
  const d = await publicDex(peer.visitorId, now);
  return { ...d, accountId: "", name: d.name ?? peer.name };
}

/** 입장 토큰에 넣을 도감 100% 배지 (종류별 비트). 읽지 못하면 0 — 입장 자체를 막지 않는다 */
export async function dexBadgeOf(acct: string): Promise<number> {
  try {
    return dexBadgeBits((await getForageStore().dex(acct)).dex);
  } catch {
    return 0;
  }
}
