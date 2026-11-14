import { GRAVEYARD_CAPACITY } from "@tomb/protocol";
import { nanoid } from "nanoid";
import type { Grave, PassedEntry, PassReason } from "../types";
import { kstDay } from "./accounts";
import type { AccountStore, GraveRecord, GraveSettings, GraveStore, PassedRecord } from "./types";

// 49번 성불: 묘비는 세운 뒤 passDays가 지나면 성불해 묘역을 떠나 성불 리스트로 옮겨진다 (데이터는 지우지 않는다).
//  - 기간: max(세운 시각, passEpoch) + passDays. passEpoch = 이 규칙을 처음 켠 시각 → 그 전에 세운 묘비가 배포 날 한꺼번에
//    사라지지 않고 그날부터 passDays를 센다
//  - 묘역(한 채널)에 보이는 묘비가 GRAVEYARD_CAPACITY를 넘으면 가장 오래된 것부터 앞당겨 성불
//  - 1인 1묘비: 한 계정이 묘역에 여러 개를 갖고 있으면(옛 데이터·동시 세우기) 가장 최근 것만 남기고 성불
// 정리는 몇 번을 다시 돌려도 결과가 같다 (passOn이 원자적으로 "아직 묘역에 있을 때만" 옮긴다) → 배포 때 한 번 도는
// 이관 작업 대신 목록 요청에서 조금씩(잠금으로 30분에 한 번, 인스턴스 메모리로도 걸러 Redis 명령을 아낀다) 돈다.
//  성불이 몇십 분 늦는 건 괜찮다 (Redis 무료 한도를 아끼려고 1분 → 30분)

export const DAY_MS = 86_400_000;
/** 정리 잠금 (함수 여러 개가 같은 정리를 겹쳐 하지 않게) */
export const PASS_SWEEP_LOCK_MS = 30 * 60_000;

export const passAtOf = (g: Pick<Grave, "createdAt">, s: GraveSettings) => Math.max(g.createdAt, s.passEpoch) + s.passDays * DAY_MS;

const newestFirst = (a: GraveRecord, b: GraveRecord) => b.createdAt - a.createdAt || b.id.localeCompare(a.id);
const oldestFirst = (a: GraveRecord, b: GraveRecord) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/**
 * 성불할 묘비 고르기 (순수 함수). records = 묘역에 있는 모든 묘비 (숨김 포함, 모든 채널).
 * 1인 1묘비 → 기간 → 묘역 정원 순서로 본다 (한 묘비는 한 번만 고른다)
 */
export function pickPassing(
  records: readonly GraveRecord[],
  s: GraveSettings,
  now: number,
  capacity = GRAVEYARD_CAPACITY,
): { id: string; reason: PassReason }[] {
  const out: { id: string; reason: PassReason }[] = [];
  const gone = new Set<string>();
  const pick = (id: string, reason: PassReason) => {
    if (gone.has(id)) return;
    gone.add(id);
    out.push({ id, reason });
  };

  const byOwner = new Map<string, GraveRecord[]>();
  for (const r of records) {
    if (!r.ownerAccountId) continue;
    const list = byOwner.get(r.ownerAccountId) ?? [];
    list.push(r);
    byOwner.set(r.ownerAccountId, list);
  }
  for (const list of byOwner.values()) if (list.length > 1) for (const r of [...list].sort(newestFirst).slice(1)) pick(r.id, "one");

  for (const r of records) if (passAtOf(r, s) <= now) pick(r.id, "time");

  const byChannel = new Map<number, GraveRecord[]>();
  for (const r of records) {
    if (gone.has(r.id) || r.hidden) continue;
    const list = byChannel.get(r.channel) ?? [];
    list.push(r);
    byChannel.set(r.channel, list);
  }
  for (const list of byChannel.values()) {
    const over = list.length - capacity;
    if (over > 0) for (const r of [...list].sort(oldestFirst).slice(0, over)) pick(r.id, "full");
  }
  return out;
}

/** 고른 묘비를 성불시키고, 주인 계정의 묘비 목록에서 빼고 소식을 남긴다. 실제로 옮겨진 것만 돌려준다 */
export async function passGraves(
  store: GraveStore,
  accounts: AccountStore,
  picks: readonly { id: string; reason: PassReason }[],
  now: number,
): Promise<PassedRecord[]> {
  const done: PassedRecord[] = [];
  for (const { id, reason } of picks) {
    const passed = await store.passOn(id, now, reason);
    if (!passed) continue; // 다른 요청이 먼저 옮겼거나 이장·삭제됨
    done.push(passed);
    const owner = passed.record.ownerAccountId;
    if (!owner) continue;
    await accounts.removeGrave(owner, id);
    await accounts.pushActivity(owner, { id: nanoid(10), kind: "passed", at: now, who: "", targetId: id, targetName: passed.record.name });
  }
  return done;
}

/**
 * 묘역 전체 정리 (기간·정원·1인 1묘비). force가 아니면 잠금으로 PASS_SWEEP_LOCK_MS에 한 번만 돈다.
 * 목록 요청(GET /api/graves)과 관리자 화면에서 부른다
 */
export async function sweepPassing(
  store: GraveStore,
  accounts: AccountStore,
  now = Date.now(),
  opts: { force?: boolean } = {},
): Promise<PassedRecord[]> {
  if (!opts.force && !(await store.lockSweep(PASS_SWEEP_LOCK_MS, now))) return [];
  const [settings, all] = await Promise.all([store.settings(now), store.listAll()]);
  return passGraves(store, accounts, pickPassing(all, settings, now), now);
}

// 이 인스턴스가 다음에 정리(잠금 시도)를 해 볼 시각. 그 전에는 Redis에 묻지도 않는다
let nextSweepTry = 0;

/**
 * 목록 요청용: 이 인스턴스에서 PASS_SWEEP_LOCK_MS에 한 번만 잠금을 시도한다 (잠금 실패 SET도 명령 1개라 매 요청마다 묻지 않게).
 * 다른 인스턴스가 잠금을 쥐고 있으면 그냥 넘어간다
 */
export async function sweepPassingIfDue(store: GraveStore, accounts: AccountStore, now = Date.now()): Promise<PassedRecord[]> {
  if (now < nextSweepTry) return [];
  nextSweepTry = now + PASS_SWEEP_LOCK_MS;
  return sweepPassing(store, accounts, now);
}

/** 시험용: 인스턴스 메모리 간격 초기화 */
export function resetSweepGate() {
  nextSweepTry = 0;
}

/**
 * 이 계정이 지금 묘역에 가진 묘비 (1인 1묘비 판정). 그 자리에서 정리도 한다:
 * 기간이 지난 것은 성불시키고, 여러 개면 가장 최근 것만 남긴다. 없으면 null
 */
export async function activeGraveOf(
  store: GraveStore,
  accounts: AccountStore,
  accountId: string,
  now = Date.now(),
): Promise<{ grave: GraveRecord; passAt: number; settings: GraveSettings } | null> {
  const [acct, settings] = await Promise.all([accounts.get(accountId, kstDay(now), now), store.settings(now)]);
  if (!acct.graves.length) return null;
  const found = await Promise.all(acct.graves.map((id) => store.get(id)));
  const mine = found.filter((g): g is GraveRecord => !!g && (!g.ownerAccountId || g.ownerAccountId === accountId));
  const picks = pickPassing(mine, settings, now, Infinity);
  // 계정 개편 전 묘비(주인 계정 없음)가 섞여 있어도 이 계정 몫으로 1개만 남긴다
  const live = mine.filter((g) => !picks.some((p) => p.id === g.id)).sort(newestFirst);
  for (const g of live.slice(1)) picks.push({ id: g.id, reason: "one" });
  if (picks.length) await passGraves(store, accounts, picks, now);
  // 이장·삭제돼 이미 없는 id는 계정 목록에서도 정리한다
  await Promise.all(acct.graves.filter((_, i) => !found[i]).map((id) => accounts.removeGrave(accountId, id)));
  const keep = live[0];
  return keep ? { grave: keep, passAt: passAtOf(keep, settings), settings } : null;
}

// ── 성불 리스트 ("성불한 이야기들") ──

export const PASSED_PAGE = 30;

/** 공개 목록 한 줄 (숨김·주인 정보·살려주세요 수는 내보내지 않는다) */
export function toPassedEntry(p: PassedRecord): PassedEntry {
  const g = p.record;
  return {
    id: g.id,
    name: g.name,
    epitaph: g.epitaph,
    mourner: g.mourner,
    bornAt: g.bornAt,
    diedAt: g.diedAt,
    ageDays: g.ageDays,
    ...(g.style ? { style: g.style } : {}),
    ...(g.comment ? { comment: g.comment } : {}),
    channel: g.channel,
    flowers: g.flowers,
    createdAt: g.createdAt,
    passedAt: p.passedAt,
  };
}

/** 검색어 정리: 앞뒤 공백을 빼고 소문자로, 50자까지 */
export const normalizeQuery = (q: string | null | undefined) => (q ?? "").trim().toLowerCase().slice(0, 50);

/**
 * 최신 성불 순 한 쪽 (offset부터 limit개). q가 있으면 이름·묘비명·상주·한마디에서 찾는다.
 * 한 번의 정리에서 여러 개가 같은 시각에 성불하므로 커서는 시각이 아니라 순번이다. includeHidden은 관리자용
 */
export function pagePassed(
  all: readonly PassedRecord[],
  opts: { q?: string; offset?: number; limit?: number; includeHidden?: boolean },
): { items: PassedRecord[]; next: number | null; total: number } {
  const q = normalizeQuery(opts.q);
  const limit = opts.limit ?? PASSED_PAGE;
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const matched = all
    .filter((p) => opts.includeHidden || !p.record.hidden)
    .filter((p) => {
      if (!q) return true;
      const g = p.record;
      return [g.name, g.epitaph, g.mourner, g.comment ?? ""].some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => b.passedAt - a.passedAt || b.record.createdAt - a.record.createdAt || b.record.id.localeCompare(a.record.id));
  const items = matched.slice(offset, offset + limit);
  return { items, next: offset + limit < matched.length ? offset + limit : null, total: matched.length };
}
