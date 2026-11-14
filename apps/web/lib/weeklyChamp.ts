import { nanoid } from "nanoid";
import { CHAMP_BOARDS, CHAMP_ITEM_IDS, CHAMP_TITLE, champBitsOf, champBoards, champHatOf, itemById, type AvatarDye, type ChampBoard } from "@tomb/protocol";
import { notifyMe } from "./ban";
import { speciesById } from "./forage/catalog";
import { getFishRank } from "./forage/fishRank";
import { staffAccountId } from "./staff";
import { rankWithoutStaff } from "./staffRank";
import { getAccounts, getMegaphone, NO_NAME } from "./store";
import { kstDay, kstWeek, lookOf } from "./store/accounts";
import { CHAMP_GRACE_MS, champBitsFor, champUntil, champWeekCached, getChamp, prevWeek, primeChampCache, weekEndMs, weekStartMs, type ChampWeek, type ChampWinner } from "./store/champ";
import { testServerEnv } from "./rpg/superHunter";
import { getStyleStore } from "./store/style";

// 주간 랭킹 1위 보상 (설계: docs/superpowers/specs/2026-11-14-weekly-first-reward-design.md).
// 대상: 포인트(이번 주 모은 포인트) · 사냥 처치(이번 주 처치 수) · 낚시(이번 주 가장 큰 물고기, 전체 물고기 판). 운영자 제외.
// 동점이면 먼저 달성한 사람 (주간 랭킹 점수에 달성 시각이 소수부로 실려 있다 — lib/store/accounts.ts weekTieFrac).
// 매주 월요일 0시(KST) 마감. 크론 없이 "지난주 결과를 처음 읽는 요청"(입장·랭킹 창·내 정보)이 정리한다 (lib/rankFill과 같은 게으른 방식):
//  1) 그 주 1위를 한 번 정해 저장한다 (처음 정한 것만 — 다시 계산해도 바뀌지 않는다)
//  2) 1위마다 보상: 1위 전용 꾸미기 대여(다음 주 1위가 정해질 때까지 + 여유) + 1,000P — 계정 저장소 grantChamp가 주·랭킹마다 한 번만 준다.
//     다관왕은 랭킹 모자 대신 다관왕 전용 모자 하나 (protocol champHatOf)
//  3) 처음 준 보상만 본인 소식(알림)·마을 확성기 줄(전체)에 한 번 알린다
// 1위 오라·배지는 아이템이 아니라 "지난주 1위 자격"에 붙는다 (lib/store/champ.ts champBitsFor → 입장 토큰·착용 증서·내 정보).
// 한 사람이 2~3개를 차지하면 보상은 개수만큼, 배지는 "이번 주 2관왕/3관왕", 오라는 하나로 섞어 그린다.

/** 처음 1위를 정하는 주 (이 기능을 연 주 — 그 전 주는 정리하지 않는다) */
export const CHAMP_FIRST_WEEK = "20261109";
/** 1위 보상 포인트 (랭킹 하나당) */
export const CHAMP_POINTS = 1_000;
/** 레이스 1위 바뀜 공지: 같은 랭킹은 이 간격에 한 번까지 */
export const CHAMP_LEAD_COOLDOWN_MS = 10 * 60_000;
/** 마을 확성기 줄에 시스템 공지로 남길 때의 보낸 이 (운영자처럼 금색·신고 버튼 없음 — app/api/megaphone. 좁은 화면에서도 한 줄로 짧게) */
export const CHAMP_NOTICE_NAME = "공지";
export const CHAMP_NOTICE_ACCOUNT = "system:champ";
/** 랭킹 이름 (공지·화면 문구) */
export const CHAMP_BOARD_LABEL: Record<ChampBoard, string> = { points: "포인트", huntKills: "사냥 처치", fish: "낚시" };

/** 한 랭킹 판의 줄 (value = 포인트 P · 처치 수 · 크기 cm×10) */
export type ChampRow = { accountId: string; name: string; value: number; rank: number; sp?: string };

/** 그 주 그 랭킹의 상위 limit명 + me (운영자 제외, 동점은 먼저 달성한 사람이 위) */
export async function champBoard(board: ChampBoard, week: string, limit: number, me: string | null, staffId?: string | null): Promise<{ rows: ChampRow[]; mine: ChampRow | null; staff: boolean }> {
  if (board === "fish") {
    const r = await rankWithoutStaff((n, who) => getFishRank().board(null, week, n, who), limit, me, staffId);
    const row = (e: (typeof r.rows)[number]): ChampRow => ({ accountId: e.accountId, name: e.name ?? NO_NAME, value: e.size, rank: e.rank, ...(e.sp ? { sp: e.sp } : {}) });
    return { rows: r.rows.map(row), mine: r.mine ? row(r.mine) : null, staff: r.staff };
  }
  const accounts = getAccounts();
  const r = await rankWithoutStaff(
    (n, who) => (board === "points" ? accounts.pointRank(n, who, week) : accounts.huntRank("kills", n, who, { week })),
    limit,
    me,
    staffId,
  );
  const row = (e: (typeof r.rows)[number]): ChampRow => ({ accountId: e.accountId, name: e.name ?? NO_NAME, value: e.points, rank: e.rank });
  return { rows: r.rows.map(row), mine: r.mine ? row(r.mine) : null, staff: r.staff };
}

/** 그 주 1위 (랭킹마다, 기록이 없는 랭킹은 빠진다) */
export async function computeWinners(week: string): Promise<ChampWinner[]> {
  const staffId = await staffAccountId();
  const tops = await Promise.all(CHAMP_BOARDS.map((b) => champBoard(b, week, 1, null, staffId)));
  return tops.flatMap((t, i): ChampWinner[] => {
    const w = t.rows[0];
    return w && w.value > 0 ? [{ board: CHAMP_BOARDS[i], accountId: w.accountId, name: w.name, value: w.value, ...(w.sp ? { sp: w.sp } : {}) }] : [];
  });
}

/** 1위 칭호 묶음: "포인트왕" · "포인트왕·낚시왕" */
export const champTitles = (boards: readonly ChampBoard[]) => boards.map((b) => CHAMP_TITLE[b]).join("·");

/** 1위 값 문구 (공지·명예의 전당): 1,234P · 56마리 · 붕어 61.0cm */
export function champValueText(w: Pick<ChampWinner, "board" | "value" | "sp">): string {
  if (w.board === "points") return `${w.value.toLocaleString("ko-KR")}P`;
  if (w.board === "huntKills") return `${w.value.toLocaleString("ko-KR")}마리`;
  const sp = w.sp ? speciesById(w.sp)?.name : undefined;
  return `${sp ? `${sp} ` : ""}${(w.value / 10).toFixed(1)}cm`;
}

/** 마을 확성기 줄에 시스템 공지 한 줄 (모든 채널, 5분 동안 — 확성기 기록과 같은 자리) */
export async function pushVillageNotice(text: string, now = Date.now()): Promise<void> {
  await getMegaphone().push({ id: nanoid(10), name: CHAMP_NOTICE_NAME, text, scope: "all", ch: 1, at: now, accountId: CHAMP_NOTICE_ACCOUNT });
}

export type ChampSettle = {
  /** 그 주 1위 기록 (아직 정리 전·대상 아님이면 null) */
  rec: ChampWeek | null;
  /** 이번 호출에서 처음 지급한 랭킹 */
  paidNow: ChampBoard[];
  /** 지급이 끝난 랭킹 (이번 호출 포함) */
  paid: ChampBoard[];
  /** 다른 요청이 정리 중이라 건너뛰었다 */
  busy?: true;
};

/**
 * 그 주 1위 정리·지급 (여러 번 불러도 한 번만 준다). 아직 마감 전이거나 CHAMP_FIRST_WEEK 전이면 아무것도 안 한다.
 * opts.minWeek = 정리할 수 있는 가장 이른 주 (개발 시험용으로 낮춘다)
 */
export async function settleChamps(week: string, now = Date.now(), opts: { minWeek?: string } = {}): Promise<ChampSettle> {
  if (week < (opts.minWeek ?? CHAMP_FIRST_WEEK) || now < weekEndMs(week)) return { rec: null, paidNow: [], paid: [] };
  const store = getChamp();
  const accounts = getAccounts();
  const existing = await store.get(week);
  if (existing) {
    const paid = await paidBoards(existing);
    if (paid.length === existing.winners.length) return { rec: existing, paidNow: [], paid };
  }
  if (!(await store.lock(week))) return { rec: existing, paidNow: [], paid: existing ? await paidBoards(existing) : [], busy: true };
  try {
    let rec = existing;
    if (!rec) {
      const fresh: ChampWeek = { week, winners: await computeWinners(week), settledAt: now };
      rec = (await store.create(fresh, weekStartMs(week))) ? fresh : await store.get(week);
    }
    if (!rec) return { rec: null, paidNow: [], paid: [] };
    primeChampCache(rec, now);
    const paidNow: ChampBoard[] = [];
    for (const w of rec.winners) {
      // 다관왕이면 랭킹 모자 여러 개 대신 다관왕 전용 모자 하나 (랭킹마다 같은 모자·같은 기간이라 겹쳐 줘도 한 벌). 포인트는 랭킹마다
      const hat = champHatOf(rec.winners.filter((x) => x.accountId === w.accountId).map((x) => x.board));
      const slot = itemById(hat)?.slot ?? "head";
      if (await accounts.grantChamp(w.accountId, `${week}:${w.board}`, hat, slot, champUntil(week), CHAMP_POINTS, now)) paidNow.push(w.board);
    }
    await announce(rec, paidNow, now).catch((e) => console.warn("[champ] 1위 알림 실패", e));
    return { rec, paidNow, paid: await paidBoards(rec) };
  } finally {
    await store.unlock(week);
  }
}

/** 지급이 끝난 랭킹 */
async function paidBoards(rec: ChampWeek): Promise<ChampBoard[]> {
  const marks = await getAccounts().champPaid(rec.winners.map((w) => `${rec.week}:${w.board}`));
  return rec.winners.filter((w, i) => marks[i] === w.accountId).map((w) => w.board);
}

/** 처음 준 보상만: 1위마다(다관왕은 합쳐서) 본인 소식 한 줄 + 마을 확성기 줄 한 줄 */
async function announce(rec: ChampWeek, paidNow: readonly ChampBoard[], now: number): Promise<void> {
  if (!paidNow.length) return;
  const byAccount = new Map<string, ChampWinner[]>();
  for (const w of rec.winners) if (paidNow.includes(w.board)) byAccount.set(w.accountId, [...(byAccount.get(w.accountId) ?? []), w]);
  const accounts = getAccounts();
  for (const [accountId, ws] of byAccount) {
    const boards = ws.map((w) => w.board);
    const title = boards.length > 1 ? `${boards.length}관왕(${champTitles(boards)})` : champTitles(boards);
    await accounts.pushActivity(accountId, { id: nanoid(10), kind: "champ", at: now, who: "", targetId: rec.week, targetName: title });
    const what = ws.map((w) => `${CHAMP_BOARD_LABEL[w.board]} ${champValueText(w)}`).join(" · ");
    await pushVillageNotice(`👑 지난주 ${title}은 ${ws[0].name}님! (${what})`, now);
  }
  // 접속 중인 1위 화면에 "내 정보 새로 받기" 신호 → 그 자리에서 알림 창·모자·배지·전용 오라 (실시간 서버 /internal/me, 실패해도 화면이 몇 분 안에 스스로 확인한다)
  await notifyMe([...byAccount.keys()]).catch(() => null);
}

// ── 내 1위 상태 (화면이 접속 중에 가볍게 확인한다 — /api/champ/me) ──

/** 아직 안 본 1위 알림: week = 그 주 월요일 또는 시험 지급 id("test:…"), test = 운영자 시험 지급 */
export type ChampUnseen = { week: string; boards: ChampBoard[]; test?: true };

/**
 * 지금 내 1위 값(비트, 0 = 아님)과 아직 안 본 1위 알림. 1위가 아니면 저장소를 거의 읽지 않는다
 * (지난주 기록은 프로세스 캐시, 오라 끔·봤음 표시는 1위일 때만 읽는다)
 */
export async function champMine(accountId: string, now = Date.now()): Promise<{ bits: number; unseen: ChampUnseen | null; until: number }> {
  const bits = await champBitsFor(accountId, now);
  if (!bits) return { bits: 0, unseen: null, until: 0 };
  const store = getChamp();
  const week = prevWeek(kstWeek(now));
  const [rec, seen, test] = await Promise.all([champWeekCached(week, now), store.seen(accountId), testServerEnv() ? store.test(accountId, now) : null]);
  const won = CHAMP_BOARDS.filter((b) => rec?.winners.some((w) => w.board === b && w.accountId === accountId));
  // 자격이 끝나는 시각: 진짜 1위는 이번 주 마감(다음 월요일 0시 — 그때 다음 1위로 넘어간다), 시험 1위는 시험 끝 시각
  const until = Math.max(won.length ? weekEndMs(kstWeek(now)) : 0, test?.until ?? 0);
  if (won.length && seen !== week) return { bits, until, unseen: { week, boards: won } };
  if (test && seen !== test.id) return { bits, until, unseen: { week: test.id, boards: champBoards(test.bits), test: true } };
  return { bits, until, unseen: null };
}

// ── 테스트 서버 운영자 시험 1위 (운영에서는 쓸 수 없다) ──

/** 시험 1위 자격(배지·전용 오라)이 저절로 끝나는 시간 */
export const CHAMP_TEST_MS = 3 * 3_600_000;
/**
 * 시험 지급 모자 대여 기간: 실제 지급과 같은 길이 — 발표(월요일 0시 정리) 때 받아 다음 발표까지 한 주 + 정리가 늦어질 여유(CHAMP_GRACE_MS).
 * (실제 지급은 champUntil = 그 주 시작 + 14일 + 여유 = 받은 월요일로부터 7일 + 여유)
 */
export const CHAMP_TEST_HAT_MS = 7 * 86_400_000 + CHAMP_GRACE_MS;

/**
 * 운영자 계정에 시험 1위 주기 (실제 지급과 같은 계정 저장소 grantChamp: 전용 모자 한 주 대여(실제와 같은 길이) + 1,000P씩) + 시험 자격(CHAMP_TEST_MS 뒤 저절로 끝).
 * 주간 1위 기록·랭킹·명예의 전당은 건드리지 않는다. boards가 비면 시험 자격을 끝내고 시험으로 준 전용 모자도 거둔다.
 * 접속 중인 운영자 화면에 바로 알린다 (알림 창·모자·배지·전용 오라)
 */
export async function grantChampTest(accountId: string, boards: readonly ChampBoard[], now = Date.now()): Promise<{ bits: number; until: number }> {
  if (!testServerEnv()) throw new Error("[champ] 시험 지급은 테스트 서버에서만");
  const store = getChamp();
  if (!boards.length) {
    // 시험 해제: 전용 꾸미기를 모두 거둔다 — 예전 시험에서 남은 모자(하나만 규칙 전 것)·시험 자격이 이미 끝난 뒤 남은 모자까지.
    // 운영자는 랭킹에서 빠지니 진짜 1위 모자와 겹치지 않는다
    await getAccounts().revokeChamp(accountId, CHAMP_ITEM_IDS);
    await store.setTest(accountId, null);
    await notifyMe([accountId]).catch(() => null);
    return { bits: 0, until: 0 };
  }
  const id = `test:${now}`;
  const accounts = getAccounts();
  // 여러 개면 다관왕 전용 모자 하나 (실제 지급과 같은 규칙)
  const hat = champHatOf(boards);
  for (const b of boards) await accounts.grantChamp(accountId, `${id}:${b}`, hat, itemById(hat)?.slot ?? "head", now + CHAMP_TEST_HAT_MS, CHAMP_POINTS, now);
  const t = { id, bits: champBitsOf([...boards]), until: now + CHAMP_TEST_MS };
  await store.setTest(accountId, t);
  const title = boards.length > 1 ? `${boards.length}관왕(${champTitles(boards)})` : champTitles(boards);
  await accounts.pushActivity(accountId, { id: nanoid(10), kind: "champ", at: now, who: "", targetId: id, targetName: `[시험] ${title}` });
  await notifyMe([accountId]).catch(() => null);
  return { bits: t.bits, until: t.until };
}

/** 이 프로세스에서 정리가 끝난 주 (다음 주가 될 때까지 다시 확인하지 않는다) */
let settledWeek: string | null = null;

/**
 * 지난주 정리가 아직이면 한다 (입장·랭킹 창·내 정보 요청 앞에서 부른다). 끝난 주는 프로세스 안에서 기억해 저장소를 다시 읽지 않는다.
 * 랭킹·입장을 막으면 안 되므로 오류는 삼킨다
 */
export async function ensureChampSettled(now = Date.now()): Promise<void> {
  const week = prevWeek(kstWeek(now));
  if (settledWeek === week) return;
  try {
    const r = await settleChamps(week, now);
    if (!r.busy && (!r.rec || r.paid.length === r.rec.winners.length)) settledWeek = week;
  } catch (e) {
    console.warn("[champ] 지난주 1위 정리 실패", e);
  }
}

/** 시험용: 프로세스 기억을 지운다 */
export function resetChampMemo(): void {
  settledWeek = null;
}

// ── 화면용 ──

/** 시상대·명예의 전당에 그릴 캐릭터 모습 */
export type ChampLook = { color: string; body: string; look: string[]; dye?: AvatarDye };

const LOOK_CACHE_MS = 20_000;
const lookCache = new Map<string, { at: number; v: ChampLook }>();

/** 계정의 지금 모습 (꾸미기·몸·염색, 잠깐 캐시) */
export async function champLookOf(accountId: string, now = Date.now()): Promise<ChampLook> {
  const hit = lookCache.get(accountId);
  if (hit && now - hit.at < LOOK_CACHE_MS) return hit.v;
  const accounts = getAccounts();
  const [a, style] = await Promise.all([accounts.get(accountId, kstDay(now), now), getStyleStore(accounts).get(accountId)]);
  const v: ChampLook = { color: a.color ?? "#9fc5a8", body: a.body ?? "hood", look: lookOf(a), ...(style.dye && Object.keys(style.dye).length ? { dye: style.dye } : {}) };
  lookCache.set(accountId, { at: now, v });
  return v;
}

/** 이 프로세스가 마지막으로 본 레이스 1위 (같으면 저장소에 쓰지 않는다) */
const leaderMemo = new Map<string, string>();

/**
 * 레이스: 이번 주 1위가 바뀌었으면 마을 확성기 줄에 알린다 ("○○님이 이번 주 낚시 1위로 올라섰어요").
 * 같은 랭킹은 CHAMP_LEAD_COOLDOWN_MS에 한 번까지 (그사이 바뀐 것은 기록만 하고 알리지 않는다). 처음 본 1위는 알리지 않는다
 */
export async function noteLeaders(week: string, leaders: readonly { board: ChampBoard; accountId: string; name: string }[], now = Date.now()): Promise<void> {
  const store = getChamp();
  for (const l of leaders) {
    const key = `${week}:${l.board}`;
    if (leaderMemo.get(key) === l.accountId) continue;
    leaderMemo.set(key, l.accountId);
    const prev = await store.swapLeader(week, l.board, l.accountId);
    if (!prev || prev === l.accountId) continue;
    if (!(await store.leadCooldown(l.board, CHAMP_LEAD_COOLDOWN_MS))) continue;
    await pushVillageNotice(`${l.name}님이 이번 주 ${CHAMP_BOARD_LABEL[l.board]} 1위로 올라섰어요!`, now);
  }
}

/** 시험용: 레이스 1위 기억을 지운다 */
export function resetLeaderMemo(): void {
  leaderMemo.clear();
}

export { champWeekCached, prevWeek, weekEndMs };
