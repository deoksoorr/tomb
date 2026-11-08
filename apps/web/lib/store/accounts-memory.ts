import type { CosmeticSlot } from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import type { GraveDecor } from "../types";
import type { MemoryStore } from "./memory";
import type { AccountRecord, AccountStore, EquippedItem } from "./types";

type Acct = {
  points: number;
  name: string | null;
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

  constructor(private graves: () => MemoryStore) {}

  private acct(id: string): Acct {
    let a = this.accts.get(id);
    if (!a) {
      a = {
        points: 0,
        name: null,
        streak: 0,
        lastAttend: null,
        codeHash: null,
        inv: new Map(),
        look: new Map(),
        graves: new Set(),
        earnDay: null,
        earned: new Map(),
      };
      this.accts.set(id, a);
    }
    return a;
  }

  /** 항목별·하루 전체·지갑 한도 안에서 적립 (lib/store/accounts-redis.ts의 Lua credit과 같은 규칙) */
  private credit(a: Acct, source: EarnSource, day: string): number {
    if (a.earnDay !== day) {
      a.earnDay = day;
      a.earned = new Map();
    }
    const rule = earnRule(source);
    const got = a.earned.get(source) ?? 0;
    const total = a.earned.get("_total") ?? 0;
    const amount = Math.min(rule.points, rule.dailyMax - got, DAILY_EARN_CAP - total, BALANCE_CAP - a.points);
    if (amount <= 0) return 0;
    a.earned.set(source, got + amount);
    a.earned.set("_total", total + amount);
    a.points += amount;
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
    const a = this.acct(id);
    return {
      points: a.points,
      name: a.name,
      streak: a.streak,
      lastAttend: a.lastAttend,
      hasCode: !!a.codeHash,
      inventory: Object.fromEntries(a.inv),
      equipped: [...a.look.values()].filter((e) => e.until > now),
      graves: [...a.graves],
      todayEarned: a.earnDay === day ? (a.earned.get("_total") ?? 0) : 0,
    };
  }

  async earn(id: string, source: EarnSource, day: string): Promise<number> {
    return this.credit(this.acct(id), source, day);
  }

  async attend(id: string, ipHash: string, name: string | null, day: string, yesterday: string): Promise<number> {
    const a = this.acct(id);
    if (name) a.name = name;
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

  async buy(id: string, itemId: string, price: number): Promise<boolean> {
    const a = this.acct(id);
    if (a.points < price) return false;
    a.points -= price;
    a.inv.set(itemId, (a.inv.get(itemId) ?? 0) + 1);
    return true;
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
    itemId: string,
    until: number,
    now: number,
  ): Promise<GraveDecor[] | "no_item" | null> {
    const graves = this.graves();
    if (!graves.hasGrave(graveId)) return null;
    if (!this.take(this.acct(id), itemId)) return "no_item";
    return graves.applyDecor(graveId, itemId, until, now);
  }

  async addGrave(id: string, graveId: string): Promise<void> {
    this.acct(id).graves.add(graveId);
  }

  async removeGrave(id: string, graveId: string): Promise<void> {
    this.acct(id).graves.delete(graveId);
  }
}
