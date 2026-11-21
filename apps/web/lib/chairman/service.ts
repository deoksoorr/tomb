import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { findBan } from "../ban";
import { env } from "../env";
import { recordError } from "../errors";
import { gameDay } from "../gameDay";
import { HttpError } from "../http";
import { maxDealPerSec } from "../rpg/dealCap";
import { derive, MAX_LEVEL } from "../rpg/formulas";
import { skillById } from "../rpg/skillTree";
import { getRpgStore } from "../rpg/store";
import { isSuperHunter } from "../rpg/superHunter";
import { towerReach } from "../rpg/tower";
import { staffAccountId } from "../staff";
import { getAccounts, NO_NAME } from "../store";
import type { ChampAvatar } from "../types";
import { CHAMP_LEAD_COOLDOWN_MS, champLookOf, pushVillageNotice } from "../weeklyChamp";
import { ensureChairSettled } from "./settle";
import {
  CHAIR_CURVE,
  CHAIR_FINISH_SLACK_MS,
  CHAIR_MIN_FLOOR,
  CHAIR_MODE_LABEL,
  CHAIR_MODES,
  CHAIR_REFUND_MS,
  CHAIR_RUNS_PER_DAY,
  CHAIR_SEAL_EVERY_MS,
  CHAIR_TICKET_MS,
  chairFloorText,
  chairEff,
  chairPoints,
  chairSealOrder,
  chairSealPool,
  chairWeek,
  checkChairFinish,
  type ChairCurve,
  type ChairMode,
} from "./rules";
import { getChairStore, type ChairCounts } from "./store";

// 11/20 회장님 독대 서비스 (API: app/api/chairman/*). 판마다 이 저장소 왕복은 시작 한 번·끝 한 번 (lib/chairman/store).
// 판 시작 때 서버가 저장된 캐릭터로 최대 초당 피해(lib/rpg/dealCap)를 재서 서명한 티켓에 싣고, 판 끝에는 티켓만 믿는다 (화면 말은 피해·판 시간뿐).

// ── 응답 모양 ──

/** ms = 그 판 버틴 시간 (옛 기록은 없음) */
export type ChairTopRow = { rank: number; name: string; damage: number; me: boolean; ms?: number; avatar?: ChampAvatar };
export type ChairMyWeek = { rank: number; damage: number; ms?: number };
export type ChairStatusResponse = {
  eligible: boolean;
  floor: number;
  remaining: ChairCounts;
  best: ChairCounts;
  /** 내 최고 판 버틴 시간 ms (옛 기록은 null) */
  bestMs: Record<ChairMode, number | null>;
  week: Record<ChairMode, ChairMyWeek | null>;
  top: Record<ChairMode, ChairTopRow[]>;
  sealEveryMs: number;
  /** 11/22 오늘 시작 전 나가기로 판을 돌려받을 수 있다 (하루 한 번, 두 모드 합쳐) */
  refundLeft: 0 | 1;
};
/** leaders = 모드마다 이번 주 1위 (레이스 창 모드 카드에 보인다) */
export type ChairRankResponse = { mode: ChairMode; week: string; rows: ChairTopRow[]; mine: ChairMyWeek | null; staff: boolean; leaders: Record<ChairMode, { name: string; damage: number } | null> };
export type ChairStartResponse = {
  ticket: string;
  seed: number;
  mode: ChairMode;
  practice: boolean;
  startedAt: number;
  /** 지옥: 봉인 순서 (45초마다 앞에서부터 하나씩) */
  sealPool?: string[];
  remaining: ChairCounts;
  curve: ChairCurve;
  /** 11/22 오늘 시작 전 나가기로 판을 돌려받을 수 있다 */
  refundLeft: 0 | 1;
};
/** 11/22 시작 전 나가기 결과 (refunded = 이번에 판을 돌려줬다) */
export type ChairAbortResponse = { ok: true; refunded: boolean; remaining: ChairCounts; refundLeft: 0 | 1 };
export type ChairFinishResponse = {
  ok: true;
  damage: number;
  points: number;
  pointsReason?: string;
  newBest: boolean;
  best: number;
  weekRank: number | null;
  remaining: ChairCounts;
};

// ── 티켓 (서명: `${base64url(JSON)}.${HMAC(SESSION_SECRET, "chair:" + payload)}`, 한 번만 쓰기는 저장소 nonce) ──

type ChairTicket = {
  n: string;
  a: string;
  m: ChairMode;
  /** 연습 판 */
  p: 0 | 1;
  /** 시작 시각 (서버 시계) */
  t: number;
  s: number;
  /** 최대 초당 피해 (lib/rpg/dealCap) */
  dm: number;
  /** 회장님 방어·내 명중 몫 (rules chairEff — 포인트 30% 검사용) */
  ef?: number;
};
const DOMAIN = "chair:";
const enc = new TextEncoder();
const dec = new TextDecoder();

async function signChair(c: ChairTicket): Promise<string> {
  const payload = b64urlEncode(enc.encode(JSON.stringify(c)));
  return `${payload}.${await hmacSign(env.sessionSecret(), DOMAIN + payload)}`;
}
async function verifyChair(token: string): Promise<ChairTicket | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 1000) return null;
  const payload = token.slice(0, dot);
  if (!(await hmacVerify(env.sessionSecret(), DOMAIN + payload, token.slice(dot + 1)))) return null;
  const bytes = b64urlDecode(payload);
  if (!bytes) return null;
  try {
    const c = JSON.parse(dec.decode(bytes)) as ChairTicket;
    return typeof c.n === "string" && typeof c.a === "string" && (c.m === "normal" || c.m === "hell") && Number.isFinite(c.t) && Number.isFinite(c.dm) && c.dm > 0 ? c : null;
  } catch {
    return null;
  }
}

// ── 공용 ──

const remainingOf = (used: ChairCounts): ChairCounts => ({
  normal: Math.max(0, CHAIR_RUNS_PER_DAY - used.normal),
  hell: Math.max(0, CHAIR_RUNS_PER_DAY - used.hell),
});

function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] & 0x7fffffff;
}

/** 캐릭터로 자격·최대 초당 피해·봉인 풀 (테스트 서버 운영자는 자격 검사 없이) */
async function charInfo(acct: string) {
  const [c, sup] = await Promise.all([getRpgStore().get(acct), isSuperHunter(acct)]);
  const floor = towerReach(c);
  const lv = sup ? MAX_LEVEL : c.level;
  return {
    floor,
    eligible: sup || floor >= CHAIR_MIN_FLOOR,
    dm: maxDealPerSec(lv, c.stats, c.equip, c.skills, c.tSkills),
    ef: Math.round(chairEff(derive(lv, c.stats, c.equip).hit) * 1e4) / 1e4,
    pool: chairSealPool(c.hotbar, c.skills, (id) => skillById(id)?.kind === "passive"),
    // 11/21 봉인 순서 = 패시브 70% 먼저, 갈래 안에서 랭크 높은 순 → 단 높은 순
    rank: (id: string) => ({ lv: (c.skills as Partial<Record<string, number>>)[id] ?? 0, tier: skillById(id)?.tier ?? 0, passive: skillById(id)?.kind === "passive" }),
  };
}

/** 판 기록 거절 로그 (관리자 오류 모음) */
async function chairLog(why: string, d: Record<string, unknown> & { acct: string }, now: number): Promise<void> {
  await recordError({ kind: "chair", source: "server", message: `회장님 독대 판 거절: ${why}`.slice(0, 500), stack: `${d.acct} @${now}\n${JSON.stringify(d)}`.slice(0, 4000), url: "/api/chairman/finish" }, now).catch(
    () => undefined,
  );
}

// ── 시작 · 끝 ──

export async function startChair(acct: string, mode: ChairMode, practice: boolean, now = Date.now()): Promise<ChairStartResponse> {
  const info = await charInfo(acct);
  if (!info.eligible) throw new HttpError(403, "NOT_ELIGIBLE", chairFloorText(info.floor));
  const seed = newSeed();
  const nonce = nanoid(16);
  const r = await getChairStore().start({ acct, nonce, mode, practice, day: gameDay(now), ttlMs: CHAIR_TICKET_MS, max: CHAIR_RUNS_PER_DAY });
  if (!r.ok) throw new HttpError(409, "NO_RUNS", `오늘 ${CHAIR_MODE_LABEL[mode]} 독대를 다 했어요. 연습 판은 할 수 있어요.`);
  const ticket = await signChair({ n: nonce, a: acct, m: mode, p: practice ? 1 : 0, t: now, s: seed, dm: info.dm, ef: info.ef });
  return {
    ticket,
    seed,
    mode,
    practice,
    startedAt: now,
    ...(mode === "hell" ? { sealPool: chairSealOrder(seed, info.pool, info.rank) } : {}),
    remaining: remainingOf(r.used),
    curve: CHAIR_CURVE[mode],
    refundLeft: r.refunded ? 0 : 1,
  };
}

/**
 * 11/22 시작 전(브리핑) 나가기: 티켓을 버린다 (다시 끝낼 수 없다). 유료 판이고 싸움 시간 0 · 판 시작 90초 안 · 같은 게임 날이면
 * 그 모드 오늘 판을 하나 돌려준다 — 하루 한 번 (두 모드 합쳐). 이미 끝났거나 시간이 지난 티켓은 410
 */
export async function abortChair(acct: string, ticket: string, durationMs: number, now = Date.now()): Promise<ChairAbortResponse> {
  const t = await verifyChair(ticket);
  if (!t || t.a !== acct) throw new HttpError(400, "BAD_TICKET", "판 정보가 맞지 않아요.");
  const day = gameDay(now);
  const age = now - t.t;
  const refund = t.p !== 1 && durationMs === 0 && age >= -CHAIR_FINISH_SLACK_MS && age <= CHAIR_REFUND_MS && gameDay(t.t) === day;
  const r = await getChairStore().abort({ acct, nonce: t.n, mode: t.m, day, refund });
  if (!r.ok) throw new HttpError(410, "RUN_GONE", "이미 끝났거나 시간이 지난 판이에요.");
  return { ok: true, refunded: r.refunded, remaining: remainingOf(r.used), refundLeft: r.refundUsed ? 0 : 1 };
}

/** o.god: 11/21 무적(시험)을 켠 판 — 개발 서버에서만 연습 판으로 친다 (운영에서는 무시: 무적 단추가 아예 없다) */
export async function finishChair(acct: string, ticket: string, damage: number, durationMs: number, now = Date.now(), o: { god?: boolean } = {}): Promise<ChairFinishResponse> {
  const t = await verifyChair(ticket);
  if (!t || t.a !== acct) throw new HttpError(400, "BAD_TICKET", "판 정보가 맞지 않아요.");
  const store = getChairStore();
  const dmg = Math.floor(damage);
  const practice = t.p === 1 || (o.god === true && process.env.NODE_ENV !== "production");
  const v = checkChairFinish({ damage: dmg, durationMs, ageMs: now - t.t, maxDps: t.dm });
  const base = { acct, nonce: t.n, mode: t.m, week: chairWeek(now), day: gameDay(now), damage: dmg, at: now, durationMs, dm: t.dm };
  if (!v.ok) {
    // 거절: 티켓만 쓰고(다시 낼 수 없게) 기록·포인트 없이
    await store.finish({ ...base, keepBest: false, ranked: false, points: 0 });
    await chairLog(v.why, { acct, mode: t.m, practice, damage: dmg, durationMs, ageMs: now - t.t, dm: t.dm }, now);
    throw new HttpError(422, "INVALID_RUN", "이번 판 기록은 인정할 수 없어요.");
  }
  const p = chairPoints({ mode: t.m, practice, damage: dmg, durationMs, maxDps: t.dm, ...(typeof t.ef === "number" && t.ef > 0 && t.ef <= 1 ? { eff: t.ef } : {}) });
  const staff = (await staffAccountId()) === acct;
  const r = await store.finish({ ...base, keepBest: !practice, ranked: !practice && !staff, points: p.points });
  if (!r.ok) throw new HttpError(410, "RUN_GONE", "이미 끝났거나 시간이 지난 판이에요.");
  // 11/23 이 판으로 이번 주 1위가 바뀌었으면 마을 소식에 (연습·무적·운영자 판은 순위에 안 들어가 overtook이 없다)
  if (r.overtook) await noteChairLeader(acct, t.m, dmg, now).catch((e) => console.warn("[chairman] 1위 바뀜 공지 실패", e));
  return {
    ok: true,
    damage: dmg,
    points: r.got,
    ...(practice ? { pointsReason: "연습 판은 포인트·기록이 없어요" } : p.reason ? { pointsReason: p.reason } : {}),
    newBest: !practice && dmg > r.prevBest,
    best: r.best,
    weekRank: r.weekRank,
    remaining: remainingOf(r.used),
  };
}

/** 공지 속 모드 이름 (레이스 창 탭과 같은 노멀·헬) */
const LEAD_MODE: Record<ChairMode, string> = { normal: "노멀", hell: "헬" };

/**
 * 11/23 이번 주 1위가 바뀌면 마을 소식 한 줄 (주간 레이스 noteLeaders와 같은 규칙: 1위가 다른 사람으로 바뀔 때만 — 그 주 첫 기록·내 기록 갱신은 아니다,
 * 같은 모드는 CHAMP_LEAD_COOLDOWN_MS에 한 번까지 — 그사이 바뀐 것은 알리지 않는다). 판단은 끝 Lua가 같이 돌려준 overtook — 바뀐 판에서만 쉼 표시·이름을 읽는다
 */
export async function noteChairLeader(acct: string, mode: ChairMode, damage: number, now = Date.now()): Promise<boolean> {
  if (!(await getChairStore().leadCooldown(mode, CHAMP_LEAD_COOLDOWN_MS))) return false;
  const name = (await getAccounts().summaries([acct]))[0]?.name ?? NO_NAME;
  await pushVillageNotice(`${name}님이 회장님 독대 ${LEAD_MODE[mode]} 이번 주 1위로 올라섰어요! 피해 ${Math.floor(damage).toLocaleString("ko-KR")}`, now);
  return true;
}

// ── 랭킹 · 상태 ──

const RANK_SIZE = 50;
const EXTRA = 10;
const RANK_CACHE_MS = 30_000;
/** 시상대 (모습을 싣는 줄 수) */
const PODIUM = 3;
type Board = { at: number; rows: (ChairTopRow & { accountId: string })[] };
const rc = globalThis as typeof globalThis & { __tombChairRank?: Map<string, Board> };

/** 그 주 모드 상위 50명 (운영자·정지 제외, 이름 포함 — 인스턴스가 30초 기억) */
async function board(mode: ChairMode, week: string, now: number): Promise<Board> {
  const cache = (rc.__tombChairRank ??= new Map());
  const key = `${mode}:${week}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < RANK_CACHE_MS) return hit;
  const staffId = await staffAccountId();
  const top = (await getChairStore().top(mode, week, RANK_SIZE + EXTRA)).filter((e) => e.accountId !== staffId);
  const banned = await Promise.all(top.map(async (e) => !!(await findBan(e.accountId, null).catch(() => null))));
  const list = top.filter((_, i) => !banned[i]).slice(0, RANK_SIZE);
  const sums = list.length ? await getAccounts().summaries(list.map((e) => e.accountId)) : [];
  const looks = await Promise.all(list.slice(0, PODIUM).map((e) => champLookOf(e.accountId, now).catch(() => null)));
  const b: Board = {
    at: now,
    rows: list.map((e, i) => ({ rank: i + 1, accountId: e.accountId, name: sums[i]?.name ?? NO_NAME, damage: e.damage, me: false, ...(e.ms ? { ms: e.ms } : {}), ...(looks[i] ? { avatar: looks[i] } : {}) })),
  };
  cache.set(key, b);
  return b;
}

/** 시험용: 랭킹·명예의 전당 기억을 지운다 */
export const resetChairRankCache = () => {
  rc.__tombChairRank?.clear();
  // 명예의 전당 기억 (lib/chairman/hall — 같은 전역 칸)
  delete (globalThis as { __tombChairHall?: unknown }).__tombChairHall;
};

const strip = (rows: Board["rows"], me: string | null): ChairTopRow[] => rows.map(({ accountId, ...r }) => ({ ...r, me: accountId === me }));
const leaderOf = (b: Board) => (b.rows[0] ? { name: b.rows[0].name, damage: b.rows[0].damage } : null);

/** 내 주간 줄: 상위 50 안이면 그 순위, 아니면 저장소 순위 (50 밖) */
function myRow(b: Board, me: string, raw: { damage: number; rank: number; ms?: number } | null): ChairMyWeek | null {
  const hit = b.rows.find((r) => r.accountId === me);
  const ms = hit ? hit.ms : raw?.ms;
  const t = ms ? { ms } : {};
  if (hit) return { rank: hit.rank, damage: hit.damage, ...t };
  if (!raw) return null;
  // 11/21 보드는 30초 기억이라 방금 처음 낸 기록이 아직 없을 수 있다 — 보드가 덜 찼거나 마지막 줄보다 세면 저장소 순위를 그대로
  const last = b.rows[b.rows.length - 1];
  const fresh = b.rows.length < RANK_SIZE || !last || raw.damage > last.damage;
  return { rank: fresh ? raw.rank : Math.max(RANK_SIZE + 1, raw.rank), damage: raw.damage, ...t };
}

export async function chairRank(mode: ChairMode, me: string | null, now = Date.now()): Promise<ChairRankResponse> {
  await ensureChairSettled(now);
  const week = chairWeek(now);
  const [b, other] = await Promise.all([board(mode, week, now), board(mode === "normal" ? "hell" : "normal", week, now)]);
  const staff = !!me && (await staffAccountId()) === me;
  const mine = me && !staff ? myRow(b, me, (await getChairStore().mine(me, gameDay(now), week)).week[mode]) : null;
  const leaders = mode === "normal" ? { normal: leaderOf(b), hell: leaderOf(other) } : { normal: leaderOf(other), hell: leaderOf(b) };
  return { mode, week, rows: strip(b.rows, me), mine, staff, leaders };
}

export async function chairStatus(acct: string, now = Date.now()): Promise<ChairStatusResponse> {
  await ensureChairSettled(now);
  const week = chairWeek(now);
  const [info, mine, bn, bh] = await Promise.all([charInfo(acct), getChairStore().mine(acct, gameDay(now), week), board("normal", week, now), board("hell", week, now)]);
  const boards: Record<ChairMode, Board> = { normal: bn, hell: bh };
  const wk = {} as ChairStatusResponse["week"];
  const top = {} as ChairStatusResponse["top"];
  for (const m of CHAIR_MODES) {
    wk[m] = myRow(boards[m], acct, mine.week[m]);
    top[m] = strip(boards[m].rows.slice(0, 3), acct);
  }
  return { eligible: info.eligible, floor: info.floor, remaining: remainingOf(mine.used), best: mine.best, bestMs: { normal: mine.bestMs.normal || null, hell: mine.bestMs.hell || null }, week: wk, top, sealEveryMs: CHAIR_SEAL_EVERY_MS, refundLeft: mine.refunded ? 0 : 1 };
}
