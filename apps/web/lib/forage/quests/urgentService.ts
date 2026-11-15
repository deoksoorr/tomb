import { itemById } from "@tomb/protocol";
import { env } from "../../env";
import { addDays, gameDay } from "../../gameDay";
import { HttpError } from "../../http";
import { fetchLobbyServer } from "../../joinToken";
import { isSuperHunter, testServerEnv } from "../../rpg/superHunter";
import { getAccounts, NO_NAME } from "../../store";
import type { MemoryAccounts } from "../../store/accounts-memory";
import { getTitleStats, type MemoryTitleStats } from "../../store/titleStats";
import { forgetTitles } from "../../titlesServer";
import { pushVillageNotice } from "../../weeklyChamp";
import { speciesById, STACK_MAX } from "../catalog";
import { getForageStore, type MemoryForageStore } from "../store";
import { STAMP_CAP } from "./catalog";
import { questStore } from "./service";
import type { MemoryQuestStore } from "./store";
import {
  DYE_PICK,
  DYE_SPECIAL,
  FEST_MS,
  hasReward,
  rankScore,
  URGENT_CLAIM_MS,
  URGENT_DEF,
  URGENT_HAT,
  URGENT_HAT_MS,
  URGENT_KINDS,
  URGENT_LAST_MS,
  URGENT_MS,
  URGENT_PICK_MAX,
  URGENT_REF_ONLINE,
  URGENT_SHOW_MS,
  URGENT_TITLE_MS,
  urgentAnnounce,
  urgentGoal,
  urgentReward,
  urgentSchedule,
  urgentStage,
  type UrgentKind,
  type UrgentSlot,
} from "./urgent";
import { getUrgentStore, type ClaimPlan, type UrgentMemDeps, type UrgentStore, type UrgentTest } from "./urgentStore";
import type { UrgentClaimed, UrgentClaimResponse, UrgentDeliverResponse, UrgentMeResponse, UrgentMineRow, UrgentPublic } from "./urgentTypes";

// 11/15: 긴급 의뢰 서버 로직 (라우트는 세션 확인·입력 검증만).
//  - 상태 보기(/api/forage/urgent): 의뢰가 없을 때는 저장소를 읽지 않는다 (시각은 시드). 있을 때 명령 2~3개, 누구에게나 같아 CDN이 몇 초 캐시한다
//  - 납품: Lua 1번 (가방 빼기 + 막대 + 순위). 목표·이름은 이 인스턴스가 기억해 다시 읽지 않는다
//  - 받기: 읽기(상태·1등·내 수) + Lua 1번 (받은 표시 HSETNX가 먼저 — 두 번 받을 수 없다)
//  - 낚시·채집 축제 확인: 축제가 있을 수 있는 때(의뢰 시작 ~ 끝 + 1시간)에만, 인스턴스마다 30초에 한 번 읽는다

/** 상자 물고기 칸이 가득이면 대신 주는 도장 */
const FISH_FALLBACK_STAMPS = 3;

function memDeps(): UrgentMemDeps {
  const forage = () => getForageStore() as MemoryForageStore;
  const accts = () => getAccounts() as MemoryAccounts;
  return {
    takeBag: (a, items) => forage().removeNow(a, items),
    bagHas: (a, id) => forage().bagNow(a, id),
    giveBag: (a, id, n) => forage().giveNow(a, id, n),
    hasAccount: (a) => accts().questHas(a),
    giveInv: (a, id) => accts().questGive(a, id, false),
    addStamps: (a, n, cap) => (questStore() as MemoryQuestStore).addStampsNow(a, n, cap),
    grantTimed: (a, id, slot, until) => void accts().staffGrant(a, [{ itemId: id, slot }], until),
    setTitleUntil: (a, f, until) => (getTitleStats() as MemoryTitleStats).setUntil(a, f, until),
  };
}

export const urgentStore = (): UrgentStore => getUrgentStore(memDeps);

const g = globalThis as typeof globalThis & {
  __tombUrgentMemo?: {
    sched: Map<string, UrgentSlot[]>;
    goal: Map<string, number>;
    names: Map<string, { name: string; at: number }>;
    fest: Map<string, { at: number; fest: number }>;
    test: { at: number; t: UrgentTest | null } | null;
  };
};
const memo = () => (g.__tombUrgentMemo ??= { sched: new Map(), goal: new Map(), names: new Map(), fest: new Map(), test: null });

/** 그날 일정 (인스턴스 기억) */
function scheduleOf(day: string): UrgentSlot[] {
  const m = memo().sched;
  let s = m.get(day);
  if (!s) {
    s = urgentSchedule(day, env.sessionSecret());
    if (m.size > 20) m.delete(m.keys().next().value!);
    m.set(day, s);
  }
  return s;
}

/** 시험 의뢰 (테스트 서버에서만 읽는다 — 운영 서버는 저장소를 보지 않는다). 인스턴스마다 3초 기억 */
async function testEvent(now: number): Promise<UrgentTest | null> {
  if (!testServerEnv()) return null;
  const c = memo().test;
  if (c && now - c.at < 3_000) return c.t;
  const t = await urgentStore().testGet();
  memo().test = { at: now, t };
  return t;
}

/** now 무렵의 의뢰 (그저께·어제·오늘 + 시험), 시작 순 */
async function eventsAround(now: number): Promise<UrgentSlot[]> {
  const day = gameDay(now);
  const list = [...scheduleOf(addDays(day, -2)), ...scheduleOf(addDays(day, -1)), ...scheduleOf(day)];
  const t = await testEvent(now);
  if (t) list.push(t);
  return list.sort((a, b) => a.start - b.start);
}

async function eventById(id: string, now: number): Promise<UrgentSlot | null> {
  const m = /^(\d{8})-(\d)$/.exec(id);
  if (m) return scheduleOf(m[1]).find((e) => e.id === id) ?? null;
  const t = await testEvent(now);
  return t && t.id === id ? t : null;
}

/** 다음 시작까지 (초, 오늘·내일 일정에서) */
function secondsToNext(now: number): number {
  const day = gameDay(now);
  const next = [...scheduleOf(day), ...scheduleOf(addDays(day, 1))].find((e) => e.start > now);
  return next ? Math.ceil((next.start - now) / 1000) : 3600;
}

/** 목표 (처음 정한 값 — 그때 접속자 수로). 인스턴스 기억 → 저장소 → 없으면 지금 접속자 수로 정해 남긴다 */
async function goalOf(ev: UrgentSlot, stored?: number): Promise<number> {
  const m = memo().goal;
  const hit = m.get(ev.id) ?? (stored && stored > 0 ? stored : undefined);
  if (hit) {
    m.set(ev.id, hit);
    return hit;
  }
  const online = (await fetchLobbyServer(1500).catch(() => null))?.total ?? URGENT_REF_ONLINE;
  const goal = await urgentStore().setGoal(ev.id, urgentGoal(ev.kind, online));
  if (m.size > 50) m.delete(m.keys().next().value!);
  m.set(ev.id, goal);
  return goal;
}

/** 이름 (순위 표시용, 인스턴스마다 10분 기억) */
async function nameOf(acct: string, now: number): Promise<string> {
  const m = memo().names;
  const hit = m.get(acct);
  if (hit && now - hit.at < 600_000) return hit.name;
  const name = (await getAccounts().appearance(acct, now)).name ?? NO_NAME;
  if (m.size > 2000) m.clear();
  m.set(acct, { name, at: now });
  return name;
}

const pct = (n: number, goal: number) => (goal > 0 ? Math.floor((n * 100) / goal) : 0);

/** 마을 확성기 줄 (모든 채널). 실패해도 의뢰는 그대로 */
async function notice(ev: UrgentSlot, field: "a0" | "a1" | "a2", text: string, now: number): Promise<void> {
  try {
    if (await urgentStore().mark(ev.id, field)) await pushVillageNotice(text, now);
  } catch (e) {
    console.warn("[urgent] 확성기 실패", e);
  }
}

export type UrgentPublicResult = { body: UrgentPublic; cacheSec: number };

/**
 * 서버 전체 상태 (위쪽 막대·게시판). 진행 중이거나 끝난 지 URGENT_SHOW_MS 안의 의뢰만 저장소를 읽는다.
 * 처음 본 요청이 시작·축제·끝 확성기를 한 번씩 남긴다. cacheSec = CDN 캐시 (진행 중 5초, 없으면 다음 시작까지 최대 30초)
 */
export async function urgentPublic(now = Date.now()): Promise<UrgentPublicResult> {
  const evs = await eventsAround(now);
  const ev = [...evs].reverse().find((e) => e.start <= now && now < e.end + URGENT_SHOW_MS) ?? null;
  if (!ev) return { body: { at: now, ev: null }, cacheSec: Math.max(1, Math.min(30, secondsToNext(now) - 1)) };
  const store = urgentStore();
  const [st, top] = await Promise.all([store.state(ev.id), store.top(ev.id, 3)]);
  const goal = await goalOf(ev, st.goal);
  const live = now < ev.end;
  const festUntil = st.fest > 0 && now < st.fest + FEST_MS ? st.fest + FEST_MS : 0;
  const lastName = st.last ? (top.find((t) => t.acct === st.last)?.name ?? (await nameOf(st.last, now).catch(() => null))) : null;
  const body: UrgentPublic = {
    at: now,
    ev: { id: ev.id, kind: ev.kind, goal, n: st.n, start: ev.start, end: ev.end, festUntil, top: top.map((t) => ({ name: t.name || NO_NAME, n: t.n })), lastName },
  };
  // 확성기: 시작 · 150%(축제) · 끝 — 각각 한 번
  if (live && !st.a0) await notice(ev, "a0", `📢 ${urgentAnnounce(ev.kind, goal)} (${Math.ceil((ev.end - now) / 60_000)}분)`, now);
  if (st.fest > 0 && !st.a2) await notice(ev, "a2", `🎆 긴급 의뢰 150% 달성! 지금부터 1시간 동안 마을 축제예요`, now);
  if (!live && !st.a1) {
    const p = pct(st.n, goal);
    await notice(ev, "a1", p >= 50 ? `긴급 의뢰가 끝났어요. 목표의 ${p}%를 채웠어요! 게시판에서 보상을 받아 가세요` : `긴급 의뢰가 끝났어요. 목표의 ${p}%에서 멈췄어요`, now);
  }
  return { body, cacheSec: live ? 5 : 15 };
}

/** 고른 것이 그 의뢰에 맞는지 (맞으면 null) */
function pickError(kind: UrgentKind, items: Record<string, number>): string | null {
  const rows = Object.entries(items).filter(([, n]) => n > 0);
  if (!rows.length) return "낼 것을 골라 주세요.";
  const cat = URGENT_DEF[kind].cat;
  if (rows.some(([id]) => {
    const s = speciesById(id);
    return !s || s.junk || s.cat !== cat;
  }))
    return "이번 긴급 의뢰에 맞지 않는 것이 섞여 있어요.";
  if (rows.reduce((a, [, n]) => a + n, 0) > URGENT_PICK_MAX) return `한 번에 ${URGENT_PICK_MAX}개까지 낼 수 있어요.`;
  return null;
}

/** 납품: 제한 시간 안(서버 시각)에만. 가방에서 빼고 막대·순위 (Lua 1번) */
export async function deliverUrgent(acct: string, id: string, pick: Record<string, number>, now = Date.now()): Promise<UrgentDeliverResponse> {
  const ev = await eventById(id, now);
  if (!ev) throw new HttpError(404, "NOT_FOUND", "그런 긴급 의뢰는 없어요.");
  if (now < ev.start) throw new HttpError(409, "URGENT_NOT_YET", "아직 시작하지 않은 의뢰예요.");
  if (now >= ev.end) throw new HttpError(409, "URGENT_OVER", "제한 시간이 끝났어요. 이제는 낼 수 없어요.");
  const items = Object.fromEntries(Object.entries(pick).filter(([, n]) => n > 0));
  const bad = pickError(ev.kind, items);
  if (bad) throw new HttpError(400, "URGENT_PICK", bad);
  const [goal, name] = await Promise.all([goalOf(ev), nameOf(acct, now)]);
  const r = await urgentStore().deliver(ev.id, acct, name, items, { goal, end: ev.end, now, frac: rankScore(0, now, ev.end), lastFrom: ev.end - URGENT_LAST_MS });
  if (r.status !== "ok") throw new HttpError(409, "BAG_CHANGED", "가방에 그만큼 없어요. 다시 골라 주세요.");
  // 이 인스턴스의 축제 기억을 바로 고친다 (150%에 닿았으면)
  if (r.fest > 0) memo().fest.set(ev.id, { at: now, fest: r.fest });
  return { n: r.n, goal, mine: r.mine, festUntil: r.fest > 0 ? r.fest + FEST_MS : 0, used: items };
}

const parseClaimed = (raw: string | null): UrgentClaimed | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UrgentClaimed;
  } catch {
    return null;
  }
};

/** 나와 관련된 긴급 의뢰: 지금 것 + 끝난 지 URGENT_CLAIM_MS 안의 것 중 내가 낸 것 */
export async function urgentMine(acct: string, now = Date.now()): Promise<UrgentMeResponse> {
  const evs = (await eventsAround(now)).filter((e) => e.start <= now && now < e.end + URGENT_CLAIM_MS);
  const store = urgentStore();
  const [mine, sup] = await Promise.all([store.mine(evs.map((e) => e.id), acct), isSuperHunter(acct).catch(() => false)]);
  const rows: UrgentMineRow[] = [];
  for (const [i, ev] of evs.entries()) {
    const m = mine[i];
    const done = now >= ev.end;
    // 지금 진행 중인 것은 늘, 끝난 것은 내가 낸 것만
    if (done && m.n <= 0) continue;
    const [st, top] = await Promise.all([store.state(ev.id), done && !m.got ? store.top(ev.id, 1) : Promise.resolve([])]);
    const goal = st.goal || (await goalOf(ev));
    const claimed = parseClaimed(m.got);
    const r = done && !claimed ? urgentReward({ id: ev.id, acct, n: st.n, goal, mine: m.n, top: top[0]?.acct ?? null, last: st.last }) : null;
    rows.push({
      id: ev.id,
      kind: ev.kind,
      start: ev.start,
      end: ev.end,
      goal,
      n: st.n,
      mine: m.n,
      done,
      reward: hasReward(r) ? { ...r, box: !!r.box } : null,
      claimed,
    });
  }
  return { rows: rows.reverse(), sup };
}

/** 보상 받기 (끝난 뒤, 의뢰·계정마다 한 번) */
export async function claimUrgent(acct: string, id: string, now = Date.now()): Promise<UrgentClaimResponse> {
  const ev = await eventById(id, now);
  if (!ev) throw new HttpError(404, "NOT_FOUND", "그런 긴급 의뢰는 없어요.");
  if (now < ev.end) throw new HttpError(409, "URGENT_LIVE", "아직 진행 중이에요. 끝나면 받을 수 있어요.");
  if (now >= ev.end + URGENT_CLAIM_MS) throw new HttpError(409, "URGENT_EXPIRED", "보상을 받을 수 있는 기간이 지났어요.");
  const store = urgentStore();
  const [st, top, [m]] = await Promise.all([store.state(ev.id), store.top(ev.id, 1), store.mine([ev.id], acct)]);
  if (m.got) throw new HttpError(409, "URGENT_CLAIMED", "이미 받았어요.");
  const goal = st.goal || (await goalOf(ev));
  const r = urgentReward({ id: ev.id, acct, n: st.n, goal, mine: m.n, top: top[0]?.acct ?? null, last: st.last });
  if (!hasReward(r)) throw new HttpError(409, "NO_REWARD", m.n > 0 ? "목표의 절반을 못 채워서 이번엔 받을 보상이 없어요." : "이번 의뢰에 낸 것이 없어요.");
  const box = r.box;
  const claimed: UrgentClaimed = { stage: r.stage, stamps: r.stamps, box, king: r.king, last: r.last, at: now };
  const plan: ClaimPlan = {
    record: JSON.stringify(claimed),
    stamps: r.stamps + (box?.kind === "stamps" ? box.n : 0),
    stampCap: STAMP_CAP,
    dye: box?.kind === "dye_pick" ? DYE_PICK : box?.kind === "dye_special" ? DYE_SPECIAL : "",
    fish: box?.kind === "fish" ? box.id : "",
    fishFallback: FISH_FALLBACK_STAMPS,
    stackMax: STACK_MAX,
    hat: r.king ? { id: URGENT_HAT, slot: itemById(URGENT_HAT)?.slot ?? "head", until: now + URGENT_HAT_MS } : null,
    now,
    kingUntil: r.king ? now + URGENT_TITLE_MS : 0,
    lastUntil: r.last ? now + URGENT_TITLE_MS : 0,
  };
  const res = await store.claim(ev.id, acct, plan);
  if (res.status !== "ok") {
    if (res.status === "noacct") throw new HttpError(404, "NOT_FOUND", "계정을 찾지 못했어요. 새로고침해 주세요.");
    throw new HttpError(409, "URGENT_CLAIMED", "이미 받았어요.");
  }
  if (r.king || r.last) forgetTitles(acct);
  return { claimed: box?.kind === "fish" ? { ...claimed, fishKept: res.fish } : claimed, stamps: res.stamps };
}

// ── 축제 (낚시·채집 희귀 확률) ──

/** 지금 마을 축제인지. 축제가 있을 수 있는 때(의뢰 시작 ~ 끝 + 1시간)에만 저장소를 본다 (인스턴스마다 의뢰당 30초에 한 번) */
export async function festivalOn(now = Date.now()): Promise<boolean> {
  try {
    const evs = (await eventsAround(now)).filter((e) => e.start <= now && now < e.end + FEST_MS);
    for (const ev of evs) {
      const m = memo().fest;
      let c = m.get(ev.id);
      if (!c || (c.fest === 0 && now - c.at >= 30_000)) {
        c = { at: now, fest: (await urgentStore().state(ev.id)).fest };
        m.set(ev.id, c);
      }
      if (c.fest > 0 && now < c.fest + FEST_MS) return true;
    }
  } catch (e) {
    console.warn("[urgent] 축제 확인 실패", e);
  }
  return false;
}

// ── 테스트 서버 운영자 시험 ──

async function requireSuper(acct: string): Promise<void> {
  if (!testServerEnv() || !(await isSuperHunter(acct))) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
}

/** 지금 시험 의뢰 시작 (있던 시험 의뢰는 바꾼다). kind가 없으면 무작위 */
export async function testStartUrgent(acct: string, kind: UrgentKind | undefined, now = Date.now()): Promise<UrgentSlot> {
  await requireSuper(acct);
  const t: UrgentTest = { id: `t${now.toString(36)}`, kind: kind ?? URGENT_KINDS[Math.floor(Math.random() * URGENT_KINDS.length)], start: now, end: now + URGENT_MS };
  await urgentStore().testSet(t);
  memo().test = { at: now, t };
  await goalOf(t);
  return t;
}

/** 시험 의뢰 막대에 목표의 pct%만큼 더하기 (150%를 넘기면 축제도) */
export async function testAddUrgent(acct: string, pctAdd: number, now = Date.now()): Promise<number> {
  await requireSuper(acct);
  const t = await urgentStore().testGet();
  if (!t || now >= t.end) throw new HttpError(409, "NO_TEST", "진행 중인 시험 의뢰가 없어요.");
  const goal = await goalOf(t);
  const add = Math.max(1, Math.round((goal * pctAdd) / 100));
  const store = urgentStore();
  const before = (await store.state(t.id)).n;
  const n = await store.testAdd(t.id, add);
  if (urgentStage(before, goal) < 150 && urgentStage(n, goal) === 150) {
    // 시험에서도 축제가 붙게 (납품 Lua와 같은 표시)
    await store.testFest(t.id, now);
    memo().fest.set(t.id, { at: now, fest: now });
  }
  return n;
}

/** 시험 의뢰를 지금 끝내기 (막대가 멈추고 보상을 받을 수 있다) 또는 지우기 */
export async function testEndUrgent(acct: string, clear: boolean, now = Date.now()): Promise<void> {
  await requireSuper(acct);
  const store = urgentStore();
  const t = await store.testGet();
  if (!t) return;
  const next = clear ? null : { ...t, end: Math.min(t.end, now) };
  await store.testSet(next);
  memo().test = { at: now, t: next };
}
