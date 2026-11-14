import { itemById, nameKey, type CosmeticSlot } from "@tomb/protocol";
import { tierUntil } from "../attendTiers";
import { legacyAttendDays, type AttendClaim, type CalendarMonthRecord } from "../calendar";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import { staffAccountIdNow } from "../staff";
import { stayBonusSum, stayBonusTiers } from "../stayBonus";
import type { ActivityItem, GiftItem, Grave, GraveDecor } from "../types";
import { kstDay, weekOfDay } from "./accounts";
import { giftTermUntil } from "./gifts";
import type { MemoryStore } from "./memory";
import {
  ACTIVITY_KEEP,
  DORMANT_MS,
  PRESENCE_MIN_GAP_MS,
  spendCategory,
  type NameChangeResult,
  type NameClaimResult,
  type VisitResult,
  type AccountRecord,
  type AccountStore,
  type AccountSummary,
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
  /** 주(월요일 YYYYMMDD) → 그 주에 모은 포인트. 예전(HMR 전) 계정에는 없을 수 있다 */
  weeks?: Map<string, number>;
  /** 주간 랭킹 동점 정리: 주 → 마지막으로 값이 오른 순번 (먼저 달성한 사람이 위 — accounts-redis.ts WEEK_FN과 같은 규칙) */
  weeksAt?: Map<string, number>;
  /** 10번 출석 달력: 달(YYYYMM) → (DD → 그날 받은 포인트, `_month` → 한 달 개근 보상). 예전 계정에는 없을 수 있다 */
  calendar?: Map<string, Map<string, number>>;
  /** 달력 개편 전 출석을 도장으로 옮겼는지 */
  calInit?: boolean;
  /** 출석 구간 코디 보상: 달(YYYYMM) → (구간 일수 → 받은 꾸미기 id). 예전 계정에는 없을 수 있다 */
  attendTiers?: Map<string, Record<string, string>>;
  /** 처음 입장한 시각 (없으면 모름) */
  createdAt?: number;
  /** 닉네임 중복 금지: 마지막 입장 시각, 이 계정이 차지한 이름 비교 키, 기존 중복(색인에 못 올림) 표시, 휴면 재설정 중 */
  seenAt?: number;
  nameKey?: string;
  nameDup?: boolean;
  renameRequired?: boolean;
  /** 사냥 기록: 처치 수 합계(전체·주별), 사냥터별 최단 클리어 ms(전체·`${zone}|${week}`) */
  hunt?: { kills: number; killsWeek: Map<string, number>; best: Map<string, number>; bestWeek: Map<string, number>; killsWeekAt?: Map<string, number> };
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
  /** 주간 랭킹 동점 정리용 순번 (값이 오를 때마다 1씩) */
  private tieSeq = 0;
  /** 경제 통계: 날짜 → 필드(`earn:{source}`, `spend:{분류}`, `refund`) → 합계 */
  private econ = new Map<string, Map<string, number>>();
  /** 닉네임 중복 금지: 이름 비교 키(nameKey) → 계정 id (Redis `names` 해시와 같다) */
  private names = new Map<string, string>();

  private stat(a: Acct, day: string, field: string, amount: number): void {
    // 운영자 계정의 적립·사용은 경제 통계에 넣지 않는다 (지갑·기능은 그대로. accounts.ts econKeyFor와 같은 규칙)
    const staff = staffAccountIdNow();
    if (staff && this.accts.get(staff) === a) return;
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

  /** 친구 창의 마지막 접속: 마지막 머무르기 기록 시각 (없으면 0). 계정을 만들지 않는다 */
  lastPresence(id: string): number {
    return this.accts.get(id)?.presenceAt ?? 0;
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
  private credit(a: Acct, source: EarnSource, day: string, opts: EarnOptions = {}, capless = false, outsideTotal = false): number {
    this.today(a, day);
    const rule = earnRule(source);
    const got = a.earned.get(source) ?? 0;
    const total = a.earned.get("_total") ?? 0;
    const ipKey = opts.ipHash ? `${opts.ipHash}:${day}:${source}` : null;
    const ipLeft = ipKey ? rule.dailyMax * ATTEND_ACCOUNTS_PER_IP - (this.ipEarned.get(ipKey) ?? 0) : Infinity;
    // capless: 출석 달력 보상은 하루 전체 한도에 막히지 않는다 (accounts-redis.ts CLAIM_LUA와 같은 규칙)
    const amount = Math.min(opts.amount ?? rule.points, rule.dailyMax - got, capless ? Infinity : DAILY_EARN_CAP - total, BALANCE_CAP - a.points, ipLeft);
    if (!(amount > 0)) return 0;
    a.earned.set(source, got + amount);
    // 접속 보너스는 하루 전체 한도와 별개라 _total에 더하지 않는다 (accounts-redis.ts credit의 outsideTotal)
    if (!outsideTotal) a.earned.set("_total", total + amount);
    if (ipKey) this.ipEarned.set(ipKey, (this.ipEarned.get(ipKey) ?? 0) + amount);
    a.points += amount;
    this.addLifetime(a, amount);
    const weeks = (a.weeks ??= new Map());
    weeks.set(weekOfDay(day), (weeks.get(weekOfDay(day)) ?? 0) + amount);
    (a.weeksAt ??= new Map()).set(weekOfDay(day), ++this.tieSeq);
    this.stat(a, day, `earn:${source}`, amount);
    return amount;
  }

  /** 오늘 적립 기록을 day로 맞춘다 (날짜가 바뀌었으면 비운다) */
  private today(a: Acct, day: string): void {
    if (a.earnDay !== day) {
      a.earnDay = day;
      a.earned = new Map();
    }
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
      stayTicks: a.earnDay === day ? (a.earned.get("_stay") ?? 0) : 0,
      bonusClaimed: a.earnDay === day ? (a.earned.get("_bonus") ?? 0) : 0,
      createdAt: a.createdAt ?? 0,
      hasCode: !!a.codeHash,
      inventory: Object.fromEntries(a.inv),
      equipped: [...a.look.values()].filter((e) => e.until > now),
      stash: [...(a.stash ?? [])]
        .filter(([, until]) => until > now)
        .map(([itemId, until]) => ({ itemId, until }))
        .sort((x, y) => x.until - y.until || x.itemId.localeCompare(y.itemId)),
      graves: [...a.graves],
      todayEarned: a.earnDay === day ? (a.earned.get("_total") ?? 0) : 0,
      activityUnread: (a.activity ?? []).filter((x) => x.kind !== "revive" && x.at > (a.activitySeen ?? 0)).length,
      nameChangedAt: a.nameChangedAt ?? 0,
      nameChanges: a.nameChanges ?? 0,
      tutorialDone: a.tutorialDone ?? false,
      renameRequired: a.renameRequired ?? false,
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
    this.stat(a, kstDay(now), `spend:${spendCategory(reason)}`, amount);
    return a.points;
  }

  async refund(id: string, amount: number, reason: string, now: number): Promise<number> {
    const a = this.acct(id);
    a.lifetime ??= a.points; // 모은 포인트는 그대로 (개편 전 계정은 지금 잔액에서 시작)
    const before = a.points;
    a.points = Math.min(BALANCE_CAP, a.points + amount);
    this.stat(a, kstDay(now), "refund", a.points - before);
    a.ledger = [{ at: now, amount, reason }, ...(a.ledger ?? [])].slice(0, 100);
    return a.points;
  }

  async presence(id: string, day: string, now: number): Promise<number | null> {
    const a = this.acct(id);
    if (now - (a.presenceAt ?? 0) < PRESENCE_MIN_GAP_MS) return null;
    a.presenceAt = now;
    // 10번: 머문 기록은 포인트 한도와 상관없이 센다 (출석 도장 조건)
    this.today(a, day);
    a.earned.set("_stay", (a.earned.get("_stay") ?? 0) + 1);
    return this.credit(a, "presence", day);
  }

  async claimStayBonus(id: string, day: string): Promise<{ earned: number; count: number } | null> {
    const a = this.acct(id);
    this.today(a, day);
    const tiers = stayBonusTiers(a.earned.get("_stay") ?? 0);
    const claimed = a.earned.get("_bonus") ?? 0;
    if (tiers <= claimed) return null;
    a.earned.set("_bonus", tiers);
    // 하루 전체 한도(800)와 별개: 자기 하루 상한(145P)·지갑 상한만 본다
    return { earned: this.credit(a, "stayBonus", day, { amount: stayBonusSum(claimed, tiers) }, true, true), count: tiers - claimed };
  }

  /** value가 null인 계정은 순위에서 뺀다. asc면 작을수록 위. tie = 같은 값일 때 먼저 달성한 순번 (작을수록 위, 주간 랭킹) */
  private board(limit: number, me: string | null, value: (a: Acct) => number | null, asc = false, tie?: (a: Acct) => number) {
    const all = [...this.accts]
      .flatMap(([accountId, a]) => {
        const points = value(a);
        return points === null ? [] : [{ accountId, name: a.name, points, at: tie?.(a) ?? 0 }];
      })
      .sort((x, y) => (asc ? x.points - y.points : y.points - x.points) || x.at - y.at || x.accountId.localeCompare(y.accountId))
      .map((r, i) => ({ accountId: r.accountId, name: r.name, points: r.points, rank: i + 1 }));
    return { rows: all.slice(0, limit), mine: all.find((r) => r.accountId === me) ?? null };
  }

  async pointRank(limit: number, me: string | null, week?: string): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    return this.board(
      limit,
      me,
      (a) => {
        const v = week ? (a.weeks?.get(week) ?? 0) : (a.lifetime ?? a.points);
        return v > 0 ? v : null;
      },
      false,
      week ? (a) => a.weeksAt?.get(week) ?? 0 : undefined,
    );
  }

  async recordHunt(id: string, zone: string, run: { kills: number; clearMs: number | null }, week: string): Promise<void> {
    const a = this.acct(id);
    const h: NonNullable<Acct["hunt"]> = (a.hunt ??= { kills: 0, killsWeek: new Map(), best: new Map(), bestWeek: new Map() });
    const kills = Math.max(0, Math.floor(run.kills));
    if (kills > 0) {
      h.kills += kills;
      h.killsWeek.set(week, (h.killsWeek.get(week) ?? 0) + kills);
      (h.killsWeekAt ??= new Map()).set(week, ++this.tieSeq);
    }
    if (run.clearMs === null) return;
    const ms = Math.round(run.clearMs);
    const wk = `${zone}|${week}`;
    if (ms < (h.best.get(zone) ?? Infinity)) h.best.set(zone, ms);
    if (ms < (h.bestWeek.get(wk) ?? Infinity)) h.bestWeek.set(wk, ms);
  }

  async huntRank(
    board: "kills" | "best",
    limit: number,
    me: string | null,
    opts: { zone?: string; week?: string },
  ): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    const { week } = opts;
    if (board === "kills")
      return this.board(
        limit,
        me,
        (a) => {
          const v = week ? (a.hunt?.killsWeek.get(week) ?? 0) : (a.hunt?.kills ?? 0);
          return v > 0 ? v : null;
        },
        false,
        week ? (a) => a.hunt?.killsWeekAt?.get(week) ?? 0 : undefined,
      );
    const zone = opts.zone ?? "easy";
    return this.board(limit, me, (a) => (week ? a.hunt?.bestWeek.get(`${zone}|${week}`) : a.hunt?.best.get(zone)) ?? null, true);
  }

  async enter(id: string, profile: Profile, now: number): Promise<void> {
    // 이름은 이름 색인과 함께 등록한다 (다른 계정이 쓰는 이름이면 저장하지 않는다). 휴면 재설정은 여기서 하지 않는다
    if (profile.name) this.claimNow(id, profile.name, now, true);
    const a = this.acct(id);
    a.color ??= profile.color || null;
    a.body ??= profile.body || null;
    a.createdAt ??= now;
  }

  /** 달(YYYYMM) 기록. 없으면 만든다 */
  private month(a: Acct, month: string): Map<string, number> {
    const cal = (a.calendar ??= new Map());
    let m = cal.get(month);
    if (!m) cal.set(month, (m = new Map()));
    return m;
  }

  /** 달력 개편 전 출석(마지막 출석일·연속 일수)을 도장으로 옮긴다 (한 번만) */
  private initCalendar(a: Acct): void {
    if (a.calInit) return;
    a.calInit = true;
    for (const d of legacyAttendDays(a.lastAttend, a.streak)) {
      const m = this.month(a, d.slice(0, 6));
      if (!m.has(d.slice(6))) m.set(d.slice(6), 0);
    }
  }

  async attendCalendar(id: string, month: string): Promise<CalendarMonthRecord> {
    const a = this.accts.get(id);
    if (!a) return { days: {}, monthBonus: null, tiers: {} };
    this.initCalendar(a);
    const m = a.calendar?.get(month) ?? new Map<string, number>();
    return {
      days: Object.fromEntries([...m].filter(([k]) => !k.startsWith("_"))),
      monthBonus: m.has("_month") ? m.get("_month")! : null,
      tiers: { ...(a.attendTiers?.get(month) ?? {}) },
    };
  }

  async grantAttendTier(id: string, month: string, tierDays: number, itemId: string, slot: CosmeticSlot, termMs: number | null, now: number): Promise<boolean> {
    // await 없이 확인·기록·지급을 한 번에 (accounts-redis.ts TIER_LUA와 같은 규칙)
    const a = this.accts.get(id);
    if (!a) return false;
    this.initCalendar(a);
    const stamped = [...(a.calendar?.get(month)?.keys() ?? [])].filter((k) => !k.startsWith("_")).length;
    if (stamped < tierDays) return false;
    const tiers = (a.attendTiers ??= new Map());
    const got = tiers.get(month) ?? {};
    if (got[String(tierDays)]) return false;
    tiers.set(month, { ...got, [String(tierDays)]: itemId });
    this.prune(a, now);
    const cur = a.look.get(slot);
    const wearing = cur?.itemId === itemId && cur.until > now;
    const had = wearing ? cur.until : (this.stashOf(a).get(itemId) ?? 0);
    const until = tierUntil(termMs, had, now);
    if (until > had) {
      if (wearing) a.look.set(slot, { itemId, until });
      else this.stashOf(a).set(itemId, until);
    }
    return true;
  }

  /** 주간 1위 보상 지급 표시 (mark → 계정). accounts-redis.ts CHAMP_LUA의 champ:paid와 같다 */
  private champMarks = new Map<string, string>();

  async grantChamp(id: string, mark: string, itemId: string, slot: CosmeticSlot, until: number, points: number, now: number): Promise<boolean> {
    // await 없이 확인·표시·지급을 한 번에 (accounts-redis.ts CHAMP_LUA와 같은 규칙)
    if (this.champMarks.has(mark)) return false;
    this.champMarks.set(mark, id);
    const a = this.acct(id);
    this.prune(a, now);
    const cur = a.look.get(slot);
    const wearing = cur?.itemId === itemId && cur.until > now;
    const had = wearing ? cur.until : (this.stashOf(a).get(itemId) ?? 0);
    if (until > had) {
      if (wearing) a.look.set(slot, { itemId, until });
      else this.stashOf(a).set(itemId, until);
    }
    if (points > 0) {
      const before = a.points;
      a.points = Math.min(BALANCE_CAP, before + points);
      if (a.points > before) {
        this.addLifetime(a, a.points - before);
        this.stat(a, kstDay(now), "earn:champ", a.points - before);
      }
    }
    return true;
  }

  async champPaid(marks: readonly string[]): Promise<(string | null)[]> {
    return marks.map((m) => this.champMarks.get(m) ?? null);
  }

  async claimAttend(id: string, ipHash: string, day: string, yesterday: string, monthDays: number, needTicks: number): Promise<AttendClaim> {
    const a = this.acct(id);
    this.initCalendar(a);
    const m = this.month(a, day.slice(0, 6));
    const dd = day.slice(6);
    if (a.lastAttend === day) {
      if (!m.has(dd)) m.set(dd, 0);
      return { ok: false, reason: "already" };
    }
    const stayTicks = a.earnDay === day ? (a.earned.get("_stay") ?? 0) : 0;
    if (stayTicks < needTicks) return { ok: false, reason: "stay", stayTicks };
    a.streak = a.lastAttend === yesterday ? a.streak + 1 : 1;
    a.lastAttend = day;

    const key = `${ipHash}:${day}`;
    const ids = this.attendIps.get(key) ?? new Set<string>();
    const paid = ids.has(id) || ids.size < ATTEND_ACCOUNTS_PER_IP;
    const earned = { daily: 0, streak: 0, monthly: 0 };
    if (paid) {
      ids.add(id);
      this.attendIps.set(key, ids);
      earned.daily = this.credit(a, "attend", day, {}, true);
      if (a.streak % 7 === 0) earned.streak = this.credit(a, "streak", day, {}, true);
    }
    m.set(dd, earned.daily + earned.streak);
    const stamped = [...m.keys()].filter((k) => !k.startsWith("_")).length;
    if (paid && !m.has("_month") && stamped >= monthDays) {
      earned.monthly = this.credit(a, "monthly", day, {}, true);
      m.set("_month", earned.monthly);
    }
    return { ok: true, earned, streak: a.streak };
  }

  /**
   * 11번 선물 받기 (MemoryGifts가 부른다): 포인트(지갑 상한에서 잘림, 모은 포인트·랭킹에도 더한다)와 아이템을 가방에 넣는다.
   * accounts-redis.ts가 아니라 gifts.ts의 Lua(GIFT_CLAIM_LUA)와 같은 규칙. 실제로 들어간 포인트를 돌려준다
   */
  deposit(id: string, points: number, items: readonly GiftItem[], now: number): number {
    const a = this.acct(id);
    const before = a.points;
    a.points = Math.min(BALANCE_CAP, a.points + Math.max(0, points));
    const got = a.points - before;
    if (got > 0) {
      this.addLifetime(a, got);
      this.stat(a, kstDay(now), "earn:gift", got);
    }
    this.prune(a, now);
    for (const { itemId, count, term } of items) {
      const slot = term ? itemById(itemId)?.slot : undefined;
      if (!term || !slot) {
        if (count > 0) a.inv.set(itemId, (a.inv.get(itemId) ?? 0) + count);
        continue;
      }
      // 기간 선물(꾸미기): 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 만료 시각을 늘린다 (lib/store/gifts.ts GIFT_CLAIM_LUA와 같은 규칙)
      const cur = a.look.get(slot);
      const had = cur?.itemId === itemId ? cur.until : (this.stashOf(a).get(itemId) ?? 0);
      const until = giftTermUntil(term, had, now);
      if (until <= had) continue;
      if (cur?.itemId === itemId) a.look.set(slot, { itemId, until });
      else this.stashOf(a).set(itemId, until);
    }
    return got;
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
    this.stat(a, kstDay(now), "spend:shop", price);
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
    if (a.points > before) this.stat(a, kstDay(), "earn:admin", a.points - before);
    if (a.points < before) this.stat(a, kstDay(), "spend:admin", before - a.points);
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
    const key = nameKey(name);
    if (!this.canTake(key, id, now)) return { ok: false, reason: "taken" };
    const cost = a.nameChanges ? price : 0;
    if (a.points < cost) return { ok: false, reason: "points" };
    a.points -= cost;
    if (cost) {
      a.ledger = [{ at: now, amount: -cost, reason: "name" }, ...(a.ledger ?? [])].slice(0, 100);
      this.stat(a, kstDay(now), "spend:name", cost);
    }
    this.takeName(a, key, id);
    a.name = name;
    a.nameChangedAt = now;
    a.nameChanges = (a.nameChanges ?? 0) + 1;
    return { ok: true, cost };
  }

  // ── 닉네임 중복 금지 (이름 색인). accounts-redis.ts의 NAME_FNS·CLAIM_NAME_LUA·VISIT_LUA·INDEX_NAME_LUA와 같은 규칙 ──

  /** 마지막 접속(입장·머무르기·처음 입장 중 가장 늦은 것)이 DORMANT_MS보다 오래면 휴면. 기록이 없으면 휴면이 아니다 */
  private dormant(a: Acct | undefined, now: number): boolean {
    const last = a ? Math.max(a.seenAt ?? 0, a.presenceAt ?? 0, a.createdAt ?? 0) : 0;
    return last > 0 && now - last > DORMANT_MS;
  }

  /** 비었거나 내 것이거나 점유자가 휴면이면 가질 수 있다 */
  private canTake(key: string, id: string, now: number): boolean {
    const owner = this.names.get(key);
    return !owner || owner === id || this.dormant(this.accts.get(owner), now);
  }

  /** 그 키를 차지한다: 내 옛 키는 풀고, 휴면 점유자에게서 가져오면 그 계정의 nameKey를 지운다 */
  private takeName(a: Acct, key: string, id: string): void {
    if (a.nameKey && a.nameKey !== key && this.names.get(a.nameKey) === id) this.names.delete(a.nameKey);
    const owner = this.names.get(key);
    const prev = owner && owner !== id ? this.accts.get(owner) : undefined;
    if (prev?.nameKey === key) prev.nameKey = undefined;
    this.names.set(key, id);
    a.nameKey = key;
    a.nameDup = false;
    a.renameRequired = false;
  }

  private claimNow(id: string, name: string, now: number, onlyEmpty: boolean): NameClaimResult {
    const key = nameKey(name);
    const cur = this.accts.get(id);
    if (cur?.name && (onlyEmpty || !cur.renameRequired)) return cur.nameKey === key ? "ok" : "has";
    if (!this.canTake(key, id, now)) return "taken";
    const a = this.acct(id);
    this.takeName(a, key, id);
    a.name = name;
    a.seenAt = now;
    return "ok";
  }

  /** 옛 계정 이름을 색인에 채운다 (이미 다른 계정이 차지했으면 이름은 그대로 두고 nameDup 표시만) */
  private indexName(a: Acct, id: string, now: number): "indexed" | "dup" | "none" {
    if (!a.name || a.nameKey || a.renameRequired) return "none";
    const key = nameKey(a.name);
    if (!this.canTake(key, id, now)) {
      a.nameDup = true;
      return "dup";
    }
    this.takeName(a, key, id);
    return "indexed";
  }

  async nameOwner(key: string, now: number): Promise<string | null> {
    const owner = this.names.get(key);
    return owner && !this.dormant(this.accts.get(owner), now) ? owner : null;
  }

  async claimName(id: string, name: string, now: number): Promise<NameClaimResult> {
    return this.claimNow(id, name, now, false);
  }

  async visit(id: string, now: number, touch: boolean): Promise<VisitResult> {
    const a = touch ? this.acct(id) : this.accts.get(id);
    if (!a) return { renameRequired: false };
    if (a.name && !a.renameRequired && this.dormant(a, now)) {
      if (a.nameKey && this.names.get(a.nameKey) === id) this.names.delete(a.nameKey);
      a.nameKey = undefined;
      a.nameDup = false;
      a.renameRequired = true;
    }
    if (!a.renameRequired) {
      if (touch) a.seenAt = now;
      this.indexName(a, id, now);
    }
    return { renameRequired: a.renameRequired ?? false };
  }

  async reindexNames(cursor: string, count: number, now: number): Promise<{ next: string; indexed: number; dup: number }> {
    const all = [...this.accts];
    const start = Number(cursor) || 0;
    const end = start + count;
    let indexed = 0;
    let dup = 0;
    for (const [id, a] of all.slice(start, end)) {
      const r = this.indexName(a, id, now);
      if (r === "indexed") indexed++;
      else if (r === "dup") dup++;
    }
    return { next: end >= all.length ? "0" : String(end), indexed, dup };
  }

  async setTutorialDone(id: string): Promise<void> {
    this.acct(id).tutorialDone = true;
  }

  async economy(days: string[]): Promise<{ date: string; fields: Record<string, number> }[]> {
    return days.map((date) => ({ date, fields: Object.fromEntries(this.econ.get(date) ?? []) }));
  }

  async walletTotals(exclude: string | null = null): Promise<{ wallets: number; accounts: number }> {
    const all = [...this.accts].filter(([id, a]) => id !== exclude && (a.points > 0 || (a.lifetime ?? 0) > 0)).map(([, a]) => a);
    return { wallets: all.reduce((n, a) => n + a.points, 0), accounts: all.length };
  }

  async summaries(ids: readonly string[]): Promise<(AccountSummary | null)[]> {
    return ids.map((id) => {
      const a = this.accts.get(id);
      return a ? summaryOf(id, a) : null;
    });
  }

  /** Redis SCAN과 같은 약속: cursor = 다음에 볼 순번, 끝이면 "0" */
  async scanAccounts(cursor: string, count: number): Promise<{ next: string; accounts: AccountSummary[] }> {
    const all = [...this.accts];
    const start = Number(cursor) || 0;
    const end = start + Math.max(1, count);
    return { next: end >= all.length ? "0" : String(end), accounts: all.slice(start, end).map(([id, a]) => summaryOf(id, a)) };
  }

  /** 31번 운영자 계정: 잔액을 to까지 채운다 (적립이 아니라 모은 포인트·랭킹·경제 통계와 무관). 없는 계정이면 false */
  staffFill(id: string, to: number): boolean {
    const a = this.accts.get(id);
    if (!a) return false;
    if (a.points < to) a.points = to;
    return true;
  }

  /** 31번 운영자 전용 꾸미기를 영구로 채운다 (lib/store/staff.ts GRANT_LUA와 같은 규칙). 새로 채운 수, 없는 계정이면 -1 */
  staffGrant(id: string, items: readonly { itemId: string; slot: string }[], permUntil: number): number {
    const a = this.accts.get(id);
    if (!a) return -1;
    const stash = this.stashOf(a);
    let added = 0;
    for (const { itemId, slot } of items) {
      const cur = a.look.get(slot as CosmeticSlot);
      if (cur?.itemId === itemId) {
        if (cur.until < permUntil) {
          a.look.set(slot as CosmeticSlot, { itemId, until: permUntil });
          added++;
        }
      } else if ((stash.get(itemId) ?? 0) < permUntil) {
        stash.set(itemId, permUntil);
        added++;
      }
    }
    return added;
  }

  // ── 46·25·30번 꾸미기 (MemoryStyle이 부른다, lib/store/style.ts). 모두 동기 → 한 번에 일어난다 ──

  /** 가방에서 1개 꺼내기 (없으면 false) */
  styleTake(id: string, itemId: string): boolean {
    return this.take(this.acct(id), itemId);
  }

  /** 포인트 내기 (모자라면 false). 사용 기록·경제 통계(spend:{분류})도 남긴다 */
  styleCharge(id: string, amount: number, reason: string, now: number): boolean {
    const a = this.acct(id);
    if (a.points < amount) return false;
    a.points -= amount;
    a.ledger = [{ at: now, amount: -amount, reason }, ...(a.ledger ?? [])].slice(0, 100);
    this.stat(a, kstDay(now), `spend:${spendCategory(reason)}`, amount);
    return true;
  }

  styleBody(id: string): string | null {
    return this.accts.get(id)?.body ?? null;
  }

  styleSetBody(id: string, body: string): void {
    this.acct(id).body = body;
  }

  /**
   * 30번 영구 꾸미기 받기 상태: 이미 영구면 "owned", 가방에 같은 이용권이 있으면 "ticket", 아니면 "ok".
   * apply면 영구로 바꾼다 — 입고 있으면 그대로 영구로, 아니면 벗어 둔 꾸미기에 영구로 넣는다 (lib/store/style.ts의 Lua와 같은 규칙)
   */
  stylePermanent(id: string, itemId: string, slot: CosmeticSlot, permUntil: number, now: number, apply: boolean): "ok" | "owned" | "ticket" {
    const a = this.acct(id);
    const stash = this.stashOf(a);
    const cur = a.look.get(slot);
    if ((cur?.itemId === itemId && cur.until >= permUntil) || (stash.get(itemId) ?? 0) >= permUntil) return "owned";
    if ((a.inv.get(itemId) ?? 0) > 0) return "ticket";
    if (!apply) return "ok";
    if (cur?.itemId === itemId && cur.until > now) a.look.set(slot, { itemId, until: permUntil });
    else stash.set(itemId, permUntil);
    return "ok";
  }
}

/** accounts-redis.ts summaryOf와 같은 규칙 */
function summaryOf(accountId: string, a: Acct): AccountSummary {
  const createdAt = a.createdAt ?? 0;
  return {
    accountId,
    name: a.name,
    createdAt,
    lastSeenAt: Math.max(a.seenAt ?? 0, a.presenceAt ?? 0, createdAt),
    points: a.points,
    renameRequired: !!a.renameRequired,
    hasCode: !!a.codeHash,
  };
}
