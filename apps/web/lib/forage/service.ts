import { nanoid } from "nanoid";
import { questHook, todoTickOf } from "../retainQuest";
import { campOpen } from "../camp";
import { seaOpen } from "../sea";
import { anyFishingWaterOf, SEA_DIG_CLOSED_MSG, seaDigOpen, seaFishDryAt, seaFishingSpotById, seaFishWet, SEA_TIDE_OUT_MSG, tideLevel } from "@tomb/protocol";
import { WALLET_MAX, type EarnSource } from "../economy";
import { env } from "../env";
import { peerOf } from "../ban";
import { HttpError } from "../http";
import { isStaff } from "../staff";
import { earnPointsOnly, getAccounts } from "../store";
import { kstDay, kstWeek, loadMe } from "../store/accounts";
import { earnTerms } from "../pointEvent";
import { earnBoost } from "../store/pointEvent";
import type { BugsResult } from "../rpg/types";
import { bagSpecies, dexBadgeBits, dexIdsOf, gatherNodeById, gradedPrice, gradeOf, NODE_CAT, npcBuys, npcById, speciesById, STACK_MAX, type DexCat, type NpcId, type Species } from "./catalog";
import { claimPendingDex, ensureDexSettled, payNewDex, reachedTitleKeys, rewardState, titlesOf } from "./dexReward";
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
  nodeBloomRule,
  nodeBloomsAt,
  nodeRefreshAt,
  nodeSeed,
  nodeWindow,
  pickGather,
  pickWeighted,
  REEL_MAX_MS,
  REEL_SLACK_MS,
  reelMinMs,
  rollFishSize10,
  rollSize10,
  sizeGrade,
  verifyBugs,
  insectPoints,
  takenNow,
  tookMember,
  withHighTide,
  type NodeUrgent,
} from "./rules";
import { newAutoSession } from "./auto";
import { autoStatus, settleAuto, type AutoSettled } from "./autoSettle";
import { getFishRank } from "./fishRank";
import { festWeight } from "./quests/urgent";
import { festivalOn, urgentNodeEvent } from "./quests/urgentService";
import { pickSunkenCosmetic, SUNKEN_CHANCE, sunkenFallbackFish, sunkenName } from "./sunken";
import { grantSunkenCosmetic, ownedPermanent } from "./sunkenGrant";
import { getForageStore, type GrantItem, type Granted, type ForageStore, type Snapshot } from "./store";
import { wornPerk } from "../titlesServer";
import { signForageTicket, verifyForageTicket, type ForageTicket } from "./ticket";
import type {
  AutoFishResponse,
  CastResponse,
  CatchResult,
  DexGain,
  DexPayResponse,
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
//  - 도감 등록·가방 추가는 이 결과 API(grant)에서만. 포인트는 NPC에게 팔 때와 도감에 처음 등록할 때(lib/forage/dexReward) earnPoints로만.
//  - 11/19 하루 잡는 수·판 포인트 한도는 없앴다. 봇 막이는 아래 시간당 시작 수 + 위 티켓·시간 검사가 한다.

/** 한 시간에 시작할 수 있는 낚시·채집 수 (둘을 합쳐서. 평범하게 하면 시간당 100번도 어렵다 — 11/19부터 하루 한도 대신 이것이 자동화를 막는다) */
export const FORAGE_STARTS_PER_HOUR = 300;
const hourBucket = (now: number) => String(Math.floor(now / 3_600_000));

function rand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}
const newSeed = () => Math.floor(rand() * 0x7fffffff);

// 11/16 포구 시장 좌판도 같은 포인트 항목 (생선 = 낚시 판매, 갯벌 = 채집 판매) — 새 포인트 항목이 없다
// 11/20 해녀 할망(바닷가 좌판)은 둘 다 사요 → null = 품목마다 (물고기 = 낚시 판매, 나머지 = 채집 판매)
type SellSource = Extract<EarnSource, "fish" | "gather">;
const SOURCE_OF_NPC: Record<NpcId, SellSource | null> = { fishmonger: "fish", collector: "gather", haenyeo: null };
/** 이 상인에게 이 품목을 판 값이 쌓이는 포인트 항목 (포인트 배수 이벤트·하루 한도가 이 항목을 본다) */
export const sellSourceOf = (npcId: NpcId, s: Species): SellSource => SOURCE_OF_NPC[npcId] ?? (s.cat === "fish" ? "fish" : "gather");

/** ev = 11/22 진행 중인 긴급 의뢰 (그 종류 지점은 5분마다 모두 핀다 — rules nodeBloomRule) */
function toState(acct: string, snap: Snapshot, now: number, ev: NodeUrgent | null): ForageState {
  return {
    bag: snap.bag,
    dex: snap.dex,
    claims: snap.claims,
    titles: titlesOf(snap.dex, snap.claims, snap.pay.marks),
    reward: rewardState(snap.claims, snap.pay),
    today: snap.day,
    nodes: { ids: activeNodes(acct, now, takenNow(snap.took, now, ev), ev).map((n) => n.id), refreshAt: nodeRefreshAt(now, ev), seed: nodeSeed(acct), ...(ev ? { ev } : {}) },
  };
}

/**
 * 내 기록 읽기. 도감 정보를 처음 읽는 계정이면 여기서 도감 보상 전환 정산을 한 번 하고(lib/forage/dexReward),
 * 도감으로 닿은 칭호는 붙은 표시를 남긴다 (나중에 종이 늘어도 칭호가 그대로 남게)
 */
async function readSnap(store: ForageStore, acct: string, now: number): Promise<Snapshot> {
  const snap = await store.snapshot(acct, kstDay(now), nodeWindow(now));
  if (await ensureDexSettled(store, acct, snap.pay, now)) snap.pay = await store.dexPay(acct);
  const missing = reachedTitleKeys(snap.dex).filter((k) => !snap.pay.marks.includes(k));
  if (missing.length) {
    await store.markDexTitles(acct, missing, kstDay(now));
    snap.pay = { ...snap.pay, marks: [...snap.pay.marks, ...missing].sort() };
  }
  return snap;
}

export async function forageState(acct: string, now = Date.now(), store: ForageStore = getForageStore()): Promise<ForageState> {
  const [snap, ev] = await Promise.all([readSnap(store, acct, now), urgentNodeEvent(now)]);
  return toState(acct, snap, now, ev);
}

/** 처음 등록 보상 지급 (lib/forage/dexReward). 지급이 실패해도 잡은 결과는 그대로 — 쌓인 보상은 도감 창에서 받는다 */
async function dexGainOf(store: ForageStore, acct: string, items: readonly { id: string; isNew: boolean }[], ip: string | undefined, now: number) {
  try {
    return await payNewDex(store, acct, items, ip, now, dexBonusFor(acct, now));
  } catch (e) {
    console.error("[forage] 도감 보상 지급 실패", e);
    return undefined;
  }
}
const withDex = (dex: DexGain | undefined) => (dex ? { dex } : {});
/** 11/16 도감 갈래 칭호의 새 칸 보상 비율 (새로 등록한 게 있을 때만 부른다 — lib/forage/dexReward payNewDex) */
const dexBonusFor = (acct: string, now: number) => async () => (await wornPerk(acct, now)).dexBonus;

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
  if (c.status !== "ok") throw new HttpError(409, "TICKET_STALE", "새로 시작했거나 시간이 너무 지나서 이 기록은 끝났어요.");
  return c.payload;
}

// ── 낚시 ──

/** 11/16 바닷가 갯바위 자리: 찌 자리(자리 앞)가 지금 물때에 물속이 아니면 못 던져요 (protocol seaFishWet — 클라이언트와 같은 계산) */
function tideGate(spotId: string, now: number): void {
  const sea = seaFishingSpotById(spotId);
  if (sea && !seaFishWet(sea, now)) throw new HttpError(409, "TIDE_OUT", SEA_TIDE_OUT_MSG);
}

/** g = 물에 빠진 꾸미기를 고를 난수 (아주 드물게, 던질 때 서버가 정한다), alt = 꾸미기를 다 가졌을 때 대신 줄 물고기 */
type FishPayload = { k: "fish"; sp: string; sz: number; g?: number; alt?: string };

export async function castLine(acct: string, spotId: string, now = Date.now(), ip?: string): Promise<CastResponse> {
  const store = getForageStore();
  // 정해진 낚시 자리 또는 배 위 가상 자리(boat:river·boat:lake) — 물 종류로 물고기를 고른다
  const water = anyFishingWaterOf(spotId);
  if (!water) throw new HttpError(400, "INVALID_INPUT", "여기서는 낚시를 할 수 없어요.");
  tideGate(spotId, now);
  // 직접 던지면 자동 낚시는 끝난다 (둘을 한꺼번에 할 수 없다). 그때까지 낚은 것은 정산해 넣는다 (처음 등록 보상도 조용히 지급)
  if (await store.autoGet(acct)) await dexGainOf(store, acct, (await settleAuto(store, acct, now, true)).items, ip, now);
  // 11/19 하루 낚시 수 한도가 없어져 오늘 기록을 읽지 않는다 (명령 2개 줄임)
  const cond = conditionsAt(now);
  // 11/15 긴급 의뢰 마을 축제: 희귀 이상 조금 더 (축제가 있을 수 있는 때에만 저장소를 본다)
  // 11/16 낚시 갈래 칭호: 큰 물고기 확률 (단 칭호는 기억에서 — lib/titlesServer wornPerk)
  const [fest, perk] = await Promise.all([festivalOn(now), wornPerk(acct, now)]);
  const s = pickWeighted(candidates("fish", water, cond), rand(), (x) => festWeight(x.rarity, fest));
  if (!s) throw new HttpError(409, "NO_FISH", "지금은 아무것도 물지 않아요.");
  // 11/16 바다 낚시: 만조 앞뒤엔 큰 놈 확률을 더 얹는다 (rules withHighTide — 시각만으로 계산, 저장소 명령 없음)
  const size = rollFishSize10(s, rand, water === "sea" ? withHighTide(perk.bigFish, tideLevel(now)) : perk.bigFish);
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
  // 버리고 다시 던진 찌(그림자만 보고 큰 것 고르기)도 시간당 시작 수 1번으로 센다 (11/19 하루 낚시 수 한도는 없앴다)
  if (!(await store.begin(acct, nonce, JSON.stringify(payload), ttl, hourBucket(now), FORAGE_STARTS_PER_HOUR)))
    throw new HttpError(429, "RATE_LIMITED", "조금 쉬었다 해요. 한 시간에 낚시·채집을 너무 많이 했어요.");
  const ticket = await signForageTicket(env.sessionSecret(), { n: nonce, a: acct, k: "fish", x: spotId, t: now, b: bite, p: power });
  return { ticket, biteInMs: bite - now, power, reelMs: reelMinMs(power), hookMs: HOOK_WINDOW_MS };
}

/** ok=false: 놓쳤다(너무 일찍 당김·줄이 끊김·도망). 기록만 끝낸다 */
export async function reelIn(acct: string, token: string, ok: boolean, now = Date.now(), ip?: string): Promise<ReelResponse> {
  const store = getForageStore();
  const t = await ticketOf(acct, token, "fish");
  const payload = JSON.parse(await claimOrThrow(store, acct, t.n)) as FishPayload;
  const day = kstDay(now);
  // 놓치면(너무 빨리·너무 늦게 감은 것 포함) 기록만 끝낸다. 11/19 하루 낚시 수 한도가 없어져 놓친 것을 세지 않는다
  // (그림자를 보고 큰 것만 고르기는 시간당 시작 수가 막는다)
  if (!ok) return { result: null, state: await forageState(acct, now, store) };
  const since = now - (t.b ?? t.t);
  if (since < reelMinMs(t.p ?? 1) - REEL_SLACK_MS) throw new HttpError(422, "TOO_FAST", "너무 빨리 감았어요. 이번 물고기는 놓쳤어요.");
  if (since > HOOK_WINDOW_MS + REEL_MAX_MS) throw new HttpError(410, "TICKET_EXPIRED", "너무 오래 걸려서 물고기가 도망갔어요.");
  if (payload.g !== undefined) return reelSunken(store, acct, payload, now, ip);
  // 11/18 오늘 미션 「물고기 3마리」면 같은 스크립트에서 진행도 (lib/retainQuest). 11/19 바닷가 자리면 「바닷가에서 물고기 2마리」도
  const quest = questHook(acct, day, anyFishingWaterOf(t.x) === "sea" ? ["seaFish", "fish"] : "fish");
  // 11/22 크기 등급(대물·월척)은 직접 낚은 것만 — 시작할 때 굴린 크기로 (rules sizeGrade). 가방은 등급 칸에, 도감·최대어는 종 그대로
  const sp = speciesById(payload.sp);
  const grade = sp ? sizeGrade(sp, payload.sz) : 0;
  const got = await store.grant(acct, day, "fish", [{ id: payload.sp, size: payload.sz, ...(grade ? { grade } : {}) }], STACK_MAX, undefined, quest);
  // 최대어 랭킹: 크기는 시작할 때 서버가 굴린 값 (가방이 가득 차 못 넣었어도 잡은 기록은 남는다). 랭킹 저장 실패가 낚시를 막지는 않는다
  // 운영자 계정은 순위에 남기지 않는다
  if (got?.[0] && payload.sz > 0 && !(await isStaff(acct)))
    await getFishRank()
      .record(acct, payload.sp, payload.sz, kstWeek(now))
      .catch((e) => console.error("[forage] 최대어 기록 실패", e));
  const dex = await dexGainOf(store, acct, got ?? [], ip, now);
  return { result: got?.[0] ?? null, ...withDex(dex), state: await forageState(acct, now, store), ...todoTickOf(quest, day) };
}

// ── 자동 낚시 (lib/forage/auto.ts) ──

async function autoResponse(store: ForageStore, acct: string, r: AutoSettled, now: number, ip?: string): Promise<AutoFishResponse> {
  const dex = await dexGainOf(store, acct, r.items, ip, now);
  const [snap, ev] = await Promise.all([readSnap(store, acct, now), urgentNodeEvent(now)]);
  return {
    auto: r.session ? autoStatus(r.session, snap.day, now) : null,
    items: r.items,
    missed: r.missed,
    gear: r.gear,
    ...(r.full ? { full: true } : {}),
    ...(r.ended ? { ended: r.ended } : {}),
    ...withDex(dex),
    state: toState(acct, snap, now, ev),
  };
}

/** 켜기: 낚시 자리(배 위 포함)에서. 이미 켜 둔 세션이 있으면 정산하고 새로 시작한다 */
export async function startAutoFish(acct: string, spotId: string, ch: number | null, now = Date.now(), ip?: string): Promise<AutoFishResponse> {
  const store = getForageStore();
  const water = anyFishingWaterOf(spotId);
  if (!water) throw new HttpError(400, "INVALID_INPUT", "여기서는 낚시를 할 수 없어요.");
  tideGate(spotId, now);
  // 11/19 하루 자동 낚시·낚시 수 한도가 없어져 오늘 기록을 읽지 않는다 (명령 2개 줄임)
  const prev = await settleAuto(store, acct, now, true);
  const session = newAutoSession(newSeed(), spotId, water, ch, now);
  // 11/16 갯바위 자리는 물이 빠져 찌 자리가 마르는 때에 자동 낚시도 끝나요
  const sea = seaFishingSpotById(spotId);
  const dryAt = sea ? seaFishDryAt(sea, now) : Infinity;
  if (dryAt < session.end) {
    session.end = dryAt;
    session.tide = true;
  }
  // 그 사이 다른 탭이 먼저 켰으면 그쪽을 정산하고 다시
  for (let i = 0; i < 3 && !(await store.autoSwap(acct, null, JSON.stringify(session))); i++) {
    const more = await settleAuto(store, acct, now, true);
    prev.items.push(...more.items);
    prev.gear.push(...more.gear);
    prev.missed += more.missed;
    if (more.full) prev.full = true;
  }
  return autoResponse(store, acct, { ...prev, session, ended: undefined }, now, ip);
}

/** 정산 (보이는 동안 주기적으로, 숨었다가 돌아오면). 세션이 없으면 auto: null */
export async function syncAutoFish(acct: string, now = Date.now(), ip?: string): Promise<AutoFishResponse> {
  const store = getForageStore();
  return autoResponse(store, acct, await settleAuto(store, acct, now, false), now, ip);
}

/** 끄기 (움직임·일어남·장면 떠남): 정산하고 끝낸다 */
export async function stopAutoFish(acct: string, now = Date.now(), ip?: string): Promise<AutoFishResponse> {
  const store = getForageStore();
  return autoResponse(store, acct, await settleAuto(store, acct, now, true), now, ip);
}

/** 물에 빠진 꾸미기를 건졌다: 영구 소장으로 지급(오늘 낚은 수 1로 셈, 도감·최대어 기록 없음). 다 가졌으면 대신 희귀 물고기 */
async function reelSunken(store: ForageStore, acct: string, p: FishPayload, now: number, ip: string | undefined): Promise<ReelResponse> {
  const day = kstDay(now);
  const c = pickSunkenCosmetic(p.g!, await ownedPermanent(acct, now));
  if (c && (await grantSunkenCosmetic(acct, c.id))) {
    await store.addDay(acct, day, "fish", 1);
    return { result: null, gear: { id: c.id, name: sunkenName(c), kept: true }, state: await forageState(acct, now, store) };
  }
  const alt = p.alt ?? p.sp;
  const got = await store.grant(acct, day, "fish", [{ id: alt, size: 0 }], STACK_MAX);
  const dex = await dexGainOf(store, acct, got ?? [], ip, now);
  return {
    result: got?.[0] ?? null,
    gear: { id: c?.id ?? "", name: c ? sunkenName(c) : "", kept: false, instead: alt },
    ...withDex(dex),
    state: await forageState(acct, now, store),
  };
}

// ── 채집 ──

type GatherPayload = { k: "gather"; items?: GrantItem[] };

export async function startGather(acct: string, nodeId: string, now = Date.now()): Promise<GatherStartResponse> {
  const n = gatherNodeById(nodeId);
  if (!n) throw new HttpError(400, "INVALID_INPUT", "여기서는 캘 게 없어요.");
  // 11/18 보안: 닫힌 캠핑장·바닷가 지점은 API로도 못 캔다 (버스가 안 와 갈 수 없는 곳)
  if ((n.map === "camp" && !campOpen()) || (n.map === "sea" && !seaOpen())) throw new HttpError(409, "MAP_CLOSED", "아직 갈 수 없는 곳이에요.");
  const store = getForageStore();
  // 11/16 갯벌 구멍: 물이 빠져 구멍이 드러났을 때만 (protocol seaDigOpen — 화면과 같은 계산, 저장소를 읽기 전에 막는다)
  if (n.kind === "clam" && !seaDigOpen(n, now)) throw new HttpError(409, "TIDE_IN", SEA_DIG_CLOSED_MSG);
  // 오늘 기록·이번 묶음의 캔 자리 기록만 (명령 2개). 11/22 긴급 의뢰는 서버가 스스로 본다 (일정은 기억 — 의뢰 중에만 30초에 한 번 저장소)
  const [snap, ev] = await Promise.all([store.today(acct, kstDay(now), nodeWindow(now)), urgentNodeEvent(now)]);
  // 11/22 지점마다 자기 규칙 창 (긴급 의뢰 종류면 5분 창·음수 id) — 티켓·캔 자리 기록도 이 창으로
  const w = nodeBloomRule(n.kind, now, ev).window;
  if (!nodeBloomsAt(nodeSeed(acct), n, now, ev) || snap.took.includes(tookMember(w, n.id))) throw new HttpError(409, "NODE_EMPTY", "지금은 비어 있어요. 조금 뒤에 다시 피어나요.");
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
  // 11/16 채집 갈래 칭호: 희귀 채집물 확률 (단 칭호는 기억에서 — lib/titlesServer wornPerk)
  const [fest, perk] = await Promise.all([festivalOn(now), wornPerk(acct, now)]);
  const s = pickGather(candidates(NODE_CAT[n.kind], n.where, conditionsAt(now)), rand, (x) => festWeight(x.rarity, fest), perk.rareGather);
  if (!s) throw new HttpError(409, "NODE_EMPTY", "지금은 비어 있어요. 조금 뒤에 다시 피어나요.");
  const items = Array.from({ length: gatherCount(n.kind, rand()) }, () => ({ id: s.id, size: 0 }));
  const ms = GATHER_MS[n.kind];
  await begin({ k: "gather", items }, GATHER_TTL_SEC);
  const ticket = await signForageTicket(secret, { n: nonce, a: acct, k: "gather", x: n.id, t: now, w, m: ms });
  return { ticket, mode: "gauge", kind: n.kind, durationMs: ms };
}

export async function finishGather(acct: string, token: string, result: BugsResult | undefined, now = Date.now(), ip?: string): Promise<GatherFinishResponse> {
  const store = getForageStore();
  const t = await ticketOf(acct, token, "gather");
  const n = gatherNodeById(t.x);
  if (!n || t.w === undefined) throw new HttpError(400, "BAD_TICKET", "기록이 올바르지 않아요. 다시 시작해 주세요.");
  const payload = JSON.parse(await claimOrThrow(store, acct, t.n)) as GatherPayload;
  const elapsed = now - t.t;
  let items: GrantItem[];
  let message: string | undefined;
  let bugPoints = 0;
  if (n.kind === "bug") {
    if (!result || t.s === undefined) throw new HttpError(400, "INVALID_RESULT", "곤충 잡기 결과가 없어요.");
    const v = verifyBugs(t.s, result, elapsed);
    if (!v.ok) throw new HttpError(422, "RESULT_REJECTED", `${v.message} 이번엔 빈손이에요.`);
    bugPoints = insectPoints(t.s, v.caught, v.golden, v.mistakes);
    const r = insectRolls(v.caught, v.golden, v.mistakes);
    const cond = conditionsAt(t.t);
    const common = candidates("bug", n.where, cond, (s) => s.rarity <= 2);
    const rarePool = candidates("bug", n.where, cond, (s) => s.rarity >= 3);
    items = [];
    // 11/16 채집 갈래 칭호: 흔한 곤충 몫 하나하나가 그 확률로 희귀 곤충이 된다
    const rareUp = r.common > 0 && rarePool.length ? (await wornPerk(acct, now)).rareGather : 0;
    for (let i = 0; i < r.common; i++) {
      const s = rareUp > 0 && rand() < rareUp ? pickWeighted(rarePool, rand()) : pickWeighted(common, rand());
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
  // 11/18 오늘 미션 「채집 2번」 (하나라도 챙긴 채집만 센다 — lib/retainQuest). 11/19 바닷가·캠핑장 지점이면 그 장소 미션 먼저
  const quest = questHook(acct, kstDay(now), n.map === "sea" ? ["seaGather", "gather"] : n.map === "camp" ? ["campGather", "gather"] : "gather");
  const got = await store.grant(acct, kstDay(now), "gather", items, STACK_MAX, { window: t.w, node: n.id }, quest);
  if (!got) throw new HttpError(409, "NODE_EMPTY", "이미 캔 자리예요.");
  const dex = await dexGainOf(store, acct, got, ip, now);
  // 11/15 곤충 채집은 잡은 만큼 포인트도 (「곤충 채집」 항목, 11/19 하루 한도 없음)
  const points = bugPoints > 0 ? (await earnPointsOnly(acct, "bugs", bugPoints, ip)).earned : 0;
  return {
    items: got satisfies CatchResult[],
    ...withDex(dex),
    state: await forageState(acct, now, store),
    ...(message ? { message } : {}),
    ...(n.kind === "bug" ? { points } : {}),
    ...todoTickOf(quest, kstDay(now)),
  };
}

// ── NPC 판매 ──

/**
 * NPC에게 팔기. 11/19 하루 한도가 없어져 고른 것을 다 판다 (비싼 것부터 지갑 여유 WALLET_MAX 안에서만 개수 단위로 — 넘치는 만큼은 가방에 그대로).
 * NPC 앞에서만 여는 창은 UI 몫(서버는 위치를 모른다 — 어디서 불러도 값이 같아 이득이 없다)
 */
export async function sellTo(acct: string, npcId: NpcId, want: Record<string, number>, ipHash: string, now = Date.now()): Promise<SellResponse> {
  const store = getForageStore();
  const npc = npcById(npcId);
  if (!npc) throw new HttpError(400, "INVALID_INPUT", "그런 상인은 없어요.");
  const day = kstDay(now);
  const [snap, acc, boost, ev] = await Promise.all([store.snapshot(acct, day, nodeWindow(now)), getAccounts().get(acct, day, now), earnBoost(now), urgentNodeEvent(now)]);
  // 11/22 id는 가방 칸 (대물·월척은 `${종}~1`·`~2` — 한 개 값은 등급 배수를 반올림, catalog gradedPrice). 사는지는 종으로 본다
  const units: { id: string; price: number; src: SellSource }[] = [];
  const unitPrice: Record<string, number> = {};
  for (const [id, raw] of Object.entries(want)) {
    const s = bagSpecies(id);
    if (!s || !npcBuys(npc, s)) throw new HttpError(400, "INVALID_INPUT", `${npc.name}은(는) 그건 안 사요.`);
    const n = Math.min(Math.max(0, Math.floor(raw)), snap.bag[id] ?? 0);
    const src = sellSourceOf(npc.id, s);
    const price = (unitPrice[id] = gradedPrice(s, gradeOf(id)));
    for (let i = 0; i < n; i++) units.push({ id, price, src });
  }
  if (!units.length) throw new HttpError(409, "NOTHING_TO_SELL", "팔 게 없어요.");
  // 지갑 여유(포인트)를 값 단위로: 포인트 배수 이벤트로 이 항목을 골랐으면 판 값은 배수로 들어온다 (lib/pointEvent — 저장소 적립과 같은 계산).
  // 11/20 물고기·채집물을 섞어 사는 상인(해녀 할망)은 항목마다 배수·하루 최대가 달라 1/100P 단위로 센다 (한 항목만이면 예전 계산과 같아요)
  const terms = { fish: earnTerms(boost, "fish"), gather: earnTerms(boost, "gather") };
  let wallet100 = Math.max(0, WALLET_MAX - acc.points) * 100;
  const daily100 = { fish: terms.fish.dailyMax * 100, gather: terms.gather.dailyMax * 100 };
  units.sort((a, b) => b.price - a.price);
  const plan: Record<string, number> = {};
  const value = { fish: 0, gather: 0 };
  for (const u of units) {
    const cost = u.price * terms[u.src].m100;
    if (cost > wallet100 || cost > daily100[u.src]) continue;
    wallet100 -= cost;
    daily100[u.src] -= cost;
    value[u.src] += u.price;
    plan[u.id] = (plan[u.id] ?? 0) + 1;
  }
  const asked = value.fish + value.gather;
  const capped = asked < units.reduce((n, u) => n + u.price, 0);
  if (!asked) return { sold: {}, earned: 0, capped: true, state: toState(acct, snap, now, ev), me: await loadMe(getAccounts(), acct, now) };
  if (!(await store.remove(acct, plan))) throw new HttpError(409, "BAG_CHANGED", "가방이 바뀌었어요. 다시 골라 주세요.");
  // 11/19 오늘의 할 일 「물고기나 채집물 팔기」면 같은 적립 스크립트에서 진행도 (내 정보를 다시 읽어 화면이 바로 맞춘다).
  // 11/20 항목이 둘이면 적립도 둘 — 할 일 진행은 한 번 판 것이니 첫 적립에만
  // 11/20 항목마다 적립은 원자 연산만(earnPointsOnly — 배수·하루 최대는 항목별 그대로), 내 정보는 끝에 한 번만 읽는다
  let earned = 0;
  let quest = questHook(acct, day, "sell");
  const back: Record<string, number> = {};
  for (const src of ["fish", "gather"] as const) {
    if (!value[src]) continue;
    const r = await earnPointsOnly(acct, src, value[src], ipHash, boost, quest);
    quest = null;
    earned += r.earned;
    if (r.paid >= value[src]) continue;
    // 그 사이 다른 적립으로 지갑이 찼다 → 값을 못 받은 만큼(그 항목에서 싼 것부터) 가방에 되돌린다
    const soldUnits = Object.entries(plan)
      .flatMap(([id, k]) => Array.from({ length: k }, () => ({ id, price: unitPrice[id] })))
      .filter((u) => sellSourceOf(npc.id, bagSpecies(u.id)!) === src)
      .sort((a, b) => b.price - a.price);
    let kept = 0;
    for (const u of soldUnits) {
      if (kept + u.price <= r.paid) kept += u.price;
      else back[u.id] = (back[u.id] ?? 0) + 1;
    }
  }
  for (const [id, k] of Object.entries(back)) {
    plan[id] -= k;
    if (plan[id] <= 0) delete plan[id];
  }
  if (Object.keys(back).length) await store.restore(acct, back, STACK_MAX);
  // 내 정보는 earnPoints와 같게 지금 시각으로 읽는다 (적립 뒤 한 번)
  const [state, me] = await Promise.all([forageState(acct, now, store), loadMe(getAccounts(), acct)]);
  return { sold: plan, earned, capped: capped || Object.keys(back).length > 0, state, me };
}

// ── 도감 ──

/**
 * 예전 단계 보상 받기(/api/forage/dex/claim): 11/14 종마다 보상으로 바뀌어 늘 거절한다 (배포 중 옛 화면이 불러도 포인트가 나가지 않게).
 * 이미 받은 단계 기록은 정산 근거로 남아 있다
 */
export function legacyDexClaim(): never {
  throw new HttpError(409, "DEX_CHANGED", "도감 보상이 바뀌었어요. 새로고침해 주세요.");
}

/** 도감 창의 [도감 보상 받기]: 그 칸에 쌓인 받을 보상(예전 한도로 쌓인 것)을 한 번에 (동시에 눌러도 한 번만, 지갑이 꽉 차 넘친 만큼은 그대로 남는다) */
export async function claimDexPending(acct: string, cat: DexCat, ipHash: string, now = Date.now()): Promise<DexPayResponse> {
  const store = getForageStore();
  await ensureDexSettled(store, acct, null, now);
  const r = await claimPendingDex(store, acct, cat, ipHash);
  if (r.earned === 0 && r.left === 0) throw new HttpError(409, "NOTHING_TO_CLAIM", "받을 도감 보상이 없어요.");
  if (r.earned === 0) throw new HttpError(409, "WALLET_FULL", "지갑이 꽉 찼어요. 포인트를 쓰고 다시 받아요.");
  return { earned: r.earned, left: r.left, state: await forageState(acct, now, store), me: r.me ?? (await loadMe(getAccounts(), acct, now)) };
}

/** 다른 사람 도감 구경 (프로필·랭킹에서) */
export async function publicDex(accountId: string, now = Date.now()): Promise<PublicDex> {
  const [d, acc] = await Promise.all([getForageStore().dex(accountId), getAccounts().get(accountId, kstDay(now), now)]);
  return { accountId, name: acc.name, dex: d.dex, titles: titlesOf(d.dex, d.claims, d.pay.marks) };
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
    return dexBadgeBits(await getForageStore().dexEntries(acct));
  } catch {
    return 0;
  }
}

// ── 11/17 포구 갈매기 깃털 (lib/sea/gullService가 굴린 결과를 가방·도감에) ──

/** 갈매기가 떨어뜨린 깃털을 가방에 (채집 한 번으로 세요) · 처음이면 도감 보상 */
export async function grantGullFeather(acct: string, id: string, now = Date.now(), ip?: string): Promise<{ item: Granted | null; dex?: DexGain }> {
  const store = getForageStore();
  const got = await store.grant(acct, kstDay(now), "gather", [{ id, size: 0 }], STACK_MAX);
  const dex = await dexGainOf(store, acct, got ?? [], ip, now);
  return { item: got?.[0] ?? null, ...withDex(dex) };
}
