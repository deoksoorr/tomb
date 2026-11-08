import type { CosmeticSlot } from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import type { Grave, GraveDecor } from "../types";
import type { MemoryStore } from "./memory";
import {
  PRESENCE_MIN_GAP_MS,
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
  streak: number;
  lastAttend: string | null;
  codeHash: string | null;
  inv: Map<string, number>;
  look: Map<CosmeticSlot, EquippedItem>;
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
      streak: 0,
      lastAttend: null,
      codeHash: null,
      inv: new Map(),
      look: new Map(),
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
    return amount;
  }

  private take(a: Acct, itemId: string): boolean {
    const n = a.inv.get(itemId) ?? 0;
    if (n < 1) return false;
    if (n === 1) a.inv.delete(itemId);
    else a.inv.set(itemId, n - 1);
    return true;
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
      graves: [...a.graves],
      todayEarned: a.earnDay === day ? (a.earned.get("_total") ?? 0) : 0,
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
    return a.points;
  }

  async refund(id: string, amount: number, reason: string, now: number): Promise<number> {
    const a = this.acct(id);
    a.lifetime ??= a.points; // 모은 포인트는 그대로 (개편 전 계정은 지금 잔액에서 시작)
    a.points = Math.min(BALANCE_CAP, a.points + amount);
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
    if (opts.unique && ((a.inv.get(itemId) ?? 0) > 0 || wearing)) return "owned";
    if (a.points < price) return "insufficient";
    a.points -= price;
    a.inv.set(itemId, (a.inv.get(itemId) ?? 0) + 1);
    return "ok";
  }

  async consume(id: string, itemId: string): Promise<boolean> {
    return this.take(this.acct(id), itemId);
  }

  async equip(id: string, itemId: string, slot: CosmeticSlot, until: number): Promise<boolean> {
    const a = this.acct(id);
    if (!this.take(a, itemId)) return false;
    a.look.set(slot, { itemId, until });
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
    return a.points;
  }

  async addGrave(id: string, graveId: string): Promise<void> {
    this.acct(id).graves.add(graveId);
  }

  async removeGrave(id: string, graveId: string): Promise<void> {
    this.acct(id).graves.delete(graveId);
  }
}
