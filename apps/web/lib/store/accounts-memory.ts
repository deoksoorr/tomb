import type { CosmeticSlot } from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import type { ActivityItem, Grave, GraveDecor } from "../types";
import { kstDay } from "./accounts";
import type { MemoryStore } from "./memory";
import {
  ACTIVITY_KEEP,
  PRESENCE_MIN_GAP_MS,
  spendCategory,
  type NameChangeResult,
  type AccountRecord,
  type AccountStore,
  type EarnOptions,
  type EquippedItem,
  type Profile,
  type RankEntry,
} from "./types";

type Acct = {
  points: number;
  /** 모은 포인트. 개편 전 계정은 없음(null) → 처음 적립할 때 지금 잔액에서 시작한다 */
  lifetime: number | null;
  name: string | null;
  color: string | null;
  body: string | null;
  presenceAt: number;
  ledger: { at: number; amount: number; reason: string }[];
  activity: ActivityItem[];
  activitySeen: number;
  nameChangedAt: number;
  nameChanges: number;
  tutorialDone: boolean;
  streak: number;
  lastAttend: string | null;
  codeHash: string | null;
  inv: Map<string, number>;
  look: Map<CosmeticSlot, EquippedItem>;
  /** 벗어 둔 꾸미기: itemId → 만료 ms. 예전(HMR 전) 계정에는 없을 수 있다 */
  stash?: Map<string, number>;
  graves: Set<string>;
  /** 오늘 적립 기록 (source → 점수, `_total`). 날짜가 바뀌면 버린다 */
  earnDay: string | null;
  earned: Map<string, number>;
};

/**
 * 로컬 개발용 계정 저장소. 모든 연산이 await 없이 동기적으로 끝나므로 이벤트 루프 안에서 원자적이다.
 * 묘비 꾸미기는 묘비 저장소(MemoryStore)의 상태를 같이 바꾸므로 그 저장소를 함수로 받는다 (HMR로 바뀌어도 최신 것을 쓰게).
 */
export class MemoryAccounts implements AccountStore {
  private accts = new Map<string, Acct>();
  private codes = new Map<string, string>();
  /** `${ipHash}:${day}` → 그날 출석 포인트를 받은 계정 */
  private attendIps = new Map<string, Set<string>>();
  /** `${ipHash}:${day}:${source}` → 그 IP가 그날 그 항목으로 받은 합계 */
  private ipEarned = new Map<string, number>();
  /** 경제 통계: 날짜 → 필드(`earn:{source}`, `spend:{분류}`, `refund`) → 합계 */
  private econ = new Map<string, Map<string, number>>();

  private stat(day: string, field: string, amount: number): void {
    let m = this.econ.get(day);
    if (!m) this.econ.set(day, (m = new Map()));
    m.set(field, (m.get(field) ?? 0) + amount);
  }

  constructor(private graves: () => MemoryStore) {}

  private blank(): Acct {
    return {
      points: 0,
      lifetime: null,
      name: null,
      color: null,
      body: null,
      presenceAt: 0,
      ledger: [],
      activity: [],
      activitySeen: 0,
      nameChangedAt: 0,
      nameChanges: 0,
      tutorialDone: false,
      streak: 0,
      lastAttend: null,
      codeHash: null,
      inv: new Map(),
      look: new Map(),
      stash: new Map(),
      graves: new Set(),
      earnDay: null,
      earned: new Map(),
    };
  }

  /** 쓰기에서만 만든다 (조회만 한 계정은 "없는 계정"으로 남는다 → 관리자 지급에서 오타를 잡는다) */
  private acct(id: string): Acct {
    let a = this.accts.get(id);
    if (!a) this.accts.set(id, (a = this.blank()));
    return a;
  }

  /** 모은 포인트에 더한다 (개편 전 계정은 지금 잔액에서 시작) */
  private addLifetime(a: Acct, amount: number): void {
    a.lifetime = (a.lifetime ?? a.points - amount) + amount;
  }

  /**
   * 항목별·하루 전체·지갑 한도(+ ipHash가 있으면 같은 IP의 그 항목 합계) 안에서 적립.
   * lib/store/accounts-redis.ts의 Lua credit과 같은 규칙
   */
  private credit(a: Acct, source: EarnSource, day: string, opts: EarnOptions = {}): number {
    if (a.earnDay !== day) {
      a.earnDay = day;
      a.earned = new Map();
    }
    const rule = earnRule(source);
    const got = a.earned.get(source) ?? 0;
    const total = a.earned.get("_total") ?? 0;
    const ipKey = opts.ipHash ? `${opts.ipHash}:${day}:${source}` : null;
    const ipLeft = ipKey ? rule.dailyMax * ATTEND_ACCOUNTS_PER_IP - (this.ipEarned.get(ipKey) ?? 0) : Infinity;
    const amount = Math.min(opts.amount ?? rule.points, rule.dailyMax - got, DAILY_EARN_CAP - total, BALANCE_CAP - a.points, ipLeft);
    if (!(amount > 0)) return 0;
    a.earned.set(source, got + amount);
    a.earned.set("_total", total + amount);
    if (ipKey) this.ipEarned.set(ipKey, (this.ipEarned.get(ipKey) ?? 0) + amount);
    a.points += amount;
    this.addLifetime(a, amount);
    this.stat(day, `earn:${source}`, amount);
    return amount;
  }

  private take(a: Acct, itemId: string): boolean {
    const n = a.inv.get(itemId) ?? 0;
    if (n < 1) return false;
    if (n === 1) a.inv.delete(itemId);
    else a.inv.set(itemId, n - 1);
    return true;
  }

  private stashOf(a: Acct): Map<string, number> {
    return (a.stash ??= new Map());
  }

  /** 만료된 착용품·벗어 둔 꾸미기를 지운다 */
  private prune(a: Acct, now: number): void {
    for (const [slot, e] of a.look) if (e.until <= now) a.look.delete(slot);
    const stash = this.stashOf(a);
    for (const [itemId, until] of stash) if (until <= now) stash.delete(itemId);
  }

  /**
   * 그 부위에 입힌다. 입던 것은 stash로 (같은 아이템이면 새 것이 대신하므로 버린다),
   * 입는 아이템은 stash에서 지운다 → 한 아이템은 입은 곳과 stash 중 한 곳에만 있다.
   * lib/store/accounts-redis.ts의 Lua puton과 같은 규칙
   */
  private putOn(a: Acct, slot: CosmeticSlot, item: EquippedItem): void {
    const stash = this.stashOf(a);
    const old = a.look.get(slot);
    if (old && old.itemId !== item.itemId) stash.set(old.itemId, old.until);
    stash.delete(item.itemId);
    a.look.set(slot, item);
  }

  async get(id: string, day: string, now: number): Promise<AccountRecord> {
    const a = this.accts.get(id) ?? this.blank();
    return {
      points: a.points,
      lifetimePoints: a.lifetime ?? a.points,
      name: a.name,
      color: a.color ?? null,
      body: a.body ?? null,
      streak: a.streak,
      lastAttend: a.lastAttend,
      hasCode: !!a.codeHash,
      inventory: Object.fromEntries(a.inv),
      equipped: [...a.look.values()].filter((e) => e.until > now),
      stash: [...(a.stash ?? [])]
        .filter(([, until]) => until > now)
        .map(([itemId, until]) => ({ itemId, until }))
        .sort((x, y) => x.until - y.until || x.itemId.localeCompare(y.itemId)),
      graves: [...a.graves],
      todayEarned: a.earnDay === day ? (a.earned.get("_total") ?? 0) : 0,
      activityUnread: (a.activity ?? []).filter((x) => x.at > (a.activitySeen ?? 0)).length,
      nameChangedAt: a.nameChangedAt ?? 0,
      nameChanges: a.nameChanges ?? 0,
      tutorialDone: a.tutorialDone ?? false,
    };
  }

  async earn(id: string, source: EarnSource, day: string, opts?: EarnOptions): Promise<number> {
    return this.credit(this.acct(id), source, day, opts);
  }

  async spend(id: string, amount: number, reason: string, now: number): Promise<number | null> {
    const a = this.acct(id);
    if (a.points < amount) return null;
    a.points -= amount;
    a.ledger = [{ at: now, amount: -amount, reason }, ...(a.ledger ?? [])].slice(0, 100);
    this.stat(kstDay(now), `spend:${spendCategory(reason)}`, amount);
    return a.points;
  }

  async refund(id: string, amount: number, reason: string, now: number): Promise<number> {
    const a = this.acct(id);
    a.lifetime ??= a.points; // 모은 포인트는 그대로 (개편 전 계정은 지금 잔액에서 시작)
    const before = a.points;
    a.points = Math.min(BALANCE_CAP, a.points + amount);
    this.stat(kstDay(now), "refund", a.points - before);
    a.ledger = [{ at: now, amount, reason }, ...(a.ledger ?? [])].slice(0, 100);
    return a.points;
  }

  async presence(id: string, day: string, now: number): Promise<number | null> {
    const a = this.acct(id);
    if (now - (a.presenceAt ?? 0) < PRESENCE_MIN_GAP_MS) return null;
    a.presenceAt = now;
    return this.credit(a, "presence", day);
  }

  async pointRank(limit: number, me: string | null): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    const all = [...this.accts]
      .map(([accountId, a]) => ({ accountId, name: a.name, points: a.lifetime ?? a.points }))
      .filter((r) => r.points > 0)
      .sort((x, y) => y.points - x.points || x.accountId.localeCompare(y.accountId))
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return { rows: all.slice(0, limit), mine: all.find((r) => r.accountId === me) ?? null };
  }

  async attend(id: string, ipHash: string, profile: Profile, day: string, yesterday: string): Promise<number> {
    const a = this.acct(id);
    a.name ??= profile.name || null;
    a.color ??= profile.color || null;
    a.body ??= profile.body || null;
    if (a.lastAttend === day) return 0;
    a.streak = a.lastAttend === yesterday ? a.streak + 1 : 1;
    a.lastAttend = day;

    const key = `${ipHash}:${day}`;
    const ids = this.attendIps.get(key) ?? new Set<string>();
    if (!ids.has(id) && ids.size >= ATTEND_ACCOUNTS_PER_IP) return 0;
    ids.add(id);
    this.attendIps.set(key, ids);

    let earned = this.credit(a, "attend", day);
    if (a.streak % 7 === 0) earned += this.credit(a, "streak", day);
    return earned;
  }

  async setCode(id: string, codeHash: string): Promise<void> {
    const a = this.acct(id);
    if (a.codeHash) this.codes.delete(a.codeHash);
    a.codeHash = codeHash;
    this.codes.set(codeHash, id);
  }

  async findByCode(codeHash: string): Promise<string | null> {
    return this.codes.get(codeHash) ?? null;
  }

  async buy(
    id: string,
    itemId: string,
    price: number,
    opts: { unique?: boolean; now?: number } = {},
  ): Promise<"ok" | "insufficient" | "owned"> {
    const a = this.acct(id);
    const now = opts.now ?? Date.now();
    const wearing = [...a.look.values()].some((e) => e.itemId === itemId && e.until > now);
    const stashed = (this.stashOf(a).get(itemId) ?? 0) > now;
    if (opts.unique && ((a.inv.get(itemId) ?? 0) > 0 || wearing || stashed)) return "owned";
    if (a.points < price) return "insufficient";
    a.points -= price;
    this.stat(kstDay(now), "spend:shop", price);
    a.inv.set(itemId, (a.inv.get(itemId) ?? 0) + 1);
    return "ok";
  }

  async consume(id: string, itemId: string): Promise<boolean> {
    return this.take(this.acct(id), itemId);
  }

  async equip(id: string, itemId: string, slot: CosmeticSlot, until: number, now: number): Promise<boolean> {
    const a = this.acct(id);
    if (!this.take(a, itemId)) return false;
    this.prune(a, now);
    this.putOn(a, slot, { itemId, until });
    return true;
  }

  async wear(id: string, itemId: string, slot: CosmeticSlot, now: number): Promise<boolean> {
    const a = this.accts.get(id);
    if (!a) return false;
    this.prune(a, now);
    const until = this.stashOf(a).get(itemId);
    if (until === undefined) return false;
    this.putOn(a, slot, { itemId, until });
    return true;
  }

  async unequip(id: string, slot: CosmeticSlot, now: number): Promise<boolean> {
    const a = this.accts.get(id);
    if (!a) return false;
    this.prune(a, now);
    const cur = a.look.get(slot);
    if (!cur) return false;
    a.look.delete(slot);
    this.stashOf(a).set(cur.itemId, cur.until);
    return true;
  }

  async placeDecor(
    id: string,
    graveId: string,
    _channel: number,
    itemId: string,
    until: number,
    now: number,
  ): Promise<GraveDecor[] | "no_item" | null> {
    const graves = this.graves();
    if (!graves.hasGrave(graveId)) return null;
    if (!this.take(this.acct(id), itemId)) return "no_item";
    return graves.applyDecor(graveId, itemId, until, now);
  }

  async putGraveUsing(id: string, itemId: string, grave: Grave): Promise<boolean> {
    if (!this.take(this.acct(id), itemId)) return false;
    this.graves().putSync(grave);
    return true;
  }

  async adjustPoints(id: string, delta: number): Promise<number | null> {
    const a = this.accts.get(id);
    if (!a) return null;
    const before = a.points;
    a.points = Math.min(BALANCE_CAP, Math.max(0, a.points + delta));
    if (a.points > before) this.addLifetime(a, a.points - before);
    if (a.points > before) this.stat(kstDay(), "earn:admin", a.points - before);
    if (a.points < before) this.stat(kstDay(), "spend:admin", before - a.points);
    return a.points;
  }

  async addGrave(id: string, graveId: string): Promise<void> {
    this.acct(id).graves.add(graveId);
  }

  async removeGrave(id: string, graveId: string): Promise<void> {
    this.acct(id).graves.delete(graveId);
  }

  async pushActivity(id: string, item: ActivityItem): Promise<void> {
    const a = this.acct(id);
    a.activity = [item, ...(a.activity ?? [])].slice(0, ACTIVITY_KEEP);
  }

  async activity(id: string): Promise<{ items: ActivityItem[]; lastSeenAt: number }> {
    const a = this.accts.get(id);
    return { items: [...(a?.activity ?? [])], lastSeenAt: a?.activitySeen ?? 0 };
  }

  async seeActivity(id: string, at: number): Promise<number> {
    const a = this.acct(id);
    a.activitySeen = Math.max(a.activitySeen ?? 0, at);
    return a.activitySeen;
  }

  async changeName(id: string, name: string, now: number, price: number, cooldownMs: number): Promise<NameChangeResult> {
    const a = this.acct(id);
    if (a.nameChangedAt && now < a.nameChangedAt + cooldownMs) return { ok: false, reason: "cooldown", nextAllowedAt: a.nameChangedAt + cooldownMs };
    const cost = a.nameChanges ? price : 0;
    if (a.points < cost) return { ok: false, reason: "points" };
    a.points -= cost;
    if (cost) {
      a.ledger = [{ at: now, amount: -cost, reason: "name" }, ...(a.ledger ?? [])].slice(0, 100);
      this.stat(kstDay(now), "spend:name", cost);
    }
    a.name = name;
    a.nameChangedAt = now;
    a.nameChanges = (a.nameChanges ?? 0) + 1;
    return { ok: true, cost };
  }

  async setTutorialDone(id: string): Promise<void> {
    this.acct(id).tutorialDone = true;
  }

  async economy(days: string[]): Promise<{ date: string; fields: Record<string, number> }[]> {
    return days.map((date) => ({ date, fields: Object.fromEntries(this.econ.get(date) ?? []) }));
  }

  async walletTotals(): Promise<{ wallets: number; accounts: number }> {
    const all = [...this.accts.values()].filter((a) => a.points > 0 || (a.lifetime ?? 0) > 0);
    return { wallets: all.reduce((n, a) => n + a.points, 0), accounts: all.length };
  }
}
