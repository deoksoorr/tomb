import { CONN_ABNORMAL, CONN_WHYS, type ConnLogWire, type ConnWhy } from "@tomb/protocol";
import { runAfter } from "./analyticsService";
import type { MoveLogEntry } from "./moveLog";
import { getOpsLog, HUNT_DROP_LIST_MAX, hourKeyOf, lastHourKeys, type ConnLogEntry, type HuntDrop, type HuntLogEntry, type LogEntry } from "./store/opsLog";

// 11/26 운영 기록 쓰기·읽기 (저장소: lib/store/opsLog). 기록 실패는 손님 요청을 깨지 않는다 (조용히 로그만).

/** 11/27 실시간 서버의 맵 옮김·다시 접속 줄 → 자리 옮김 줄 (src "s") */
function serverMoveOf(r: Extract<ConnLogWire, [string, "m" | "t", ...unknown[]]>, now: number): MoveLogEntry {
  const [a, k, at, ch, dev, , x] = r;
  const base = { a, k: "mv" as const, at: Math.min(at, now), src: "s" as const, ...(ch ? { ch } : {}), ...(dev ? { dev } : {}) };
  if (k === "m") return { ...base, m: "map", ...(x.f ? { from: x.f } : {}), ...(x.t ? { to: x.t } : {}), ...(x.c ? { via: x.c } : {}) };
  return {
    ...base,
    m: "tab",
    ...(x.m ? { to: x.m } : {}),
    ...(x.a ? { ask: x.a } : {}),
    ...(x.tab ? { tab: x.tab } : {}),
    ...(x.pt ? { ptab: x.pt } : {}),
    ...(x.pc ? { pch: x.pc } : {}),
    ...(x.live ? { live: true as const } : {}),
  };
}

/** 11/28 실시간 서버의 탈것·좌대 줄 "r" → 동작 줄 (rideOn·rideOff·raftOut) */
export function serverActOf(r: Extract<ConnLogWire, [string, "r", ...unknown[]]>, now: number): MoveLogEntry {
  const [a, , at, ch, dev, , x] = r;
  const base = { a, k: "mv" as const, at: Math.min(at, now), src: "s" as const, ...(ch ? { ch } : {}), ...(dev ? { dev } : {}), ...(x.s ? { skip: x.s } : {}) };
  if (x.g === "raft") return { ...base, m: "raftOut", n: x.n, out: x.w };
  return {
    ...base,
    m: x.on ? "rideOn" : "rideOff",
    ride: x.g,
    map: x.m,
    ...(x.n !== undefined ? { n: x.n } : {}),
    ...(x.k !== undefined ? { seat: x.k } : {}),
    ...(x.d !== undefined ? { sec: x.d } : {}),
    ...(x.w ? { off: x.w } : {}),
    ...(x.b ? { brief: true as const } : {}),
  };
}

/**
 * 실시간 서버가 1분마다 모아 보낸 들어옴·나감 → 접속 기록 (한 번에 넣는다).
 * 11/27 다시 접속·다른 탭 줄(t)은 들어옴·나감과 함께 전체 목록에도, 맵 옮김 줄(m — 버스마다)은 계정 목록에만 (전체 목록을 밀어내지 않게)
 * 11/28 탈것·좌대 줄(r)도 계정 목록에만, 계정마다 MOVE_CAP 안에서만 (자주 타고 내려 앞선 기록을 밀어내지 않게)
 */
export async function recordConnRows(rows: readonly ConnLogWire[], now = Date.now()): Promise<number> {
  const main: LogEntry[] = [];
  const maps: LogEntry[] = [];
  const acts: MoveLogEntry[] = [];
  for (const r of rows) {
    if (r[1] === "r") {
      acts.push(serverActOf(r as Extract<ConnLogWire, [string, "r", ...unknown[]]>, now));
      continue;
    }
    if (r[1] === "m" || r[1] === "t") {
      (r[1] === "m" ? maps : main).push(serverMoveOf(r as Extract<ConnLogWire, [string, "m" | "t", ...unknown[]]>, now));
      continue;
    }
    const [a, k, at, ch, dev, why] = r;
    main.push({ a, k: k === "i" ? "in" : "out", at: Math.min(at, now), ...(ch ? { ch } : {}), ...(dev ? { dev } : {}), ...(k === "o" && why ? { why } : {}) } as ConnLogEntry);
  }
  const byAt = (x: LogEntry, y: LogEntry) => x.at - y.at;
  // 11/28 탈것·좌대 줄은 맵 옮김 줄과 같이 계정 목록에 (상한 안의 것만)
  const capped = acts.length ? capMoves(acts.sort(byAt), now) : [];
  // 맵 옮김을 먼저 (같은 묶음이면 대개 더 이른 일 — 목록은 넣은 순서로 최신 먼저)
  const own = [...maps, ...capped].sort(byAt);
  if (own.length) await getOpsLog().push("conn", own, undefined, { all: false });
  if (main.length) await getOpsLog().push("conn", main.sort(byAt), hourKeyOf(now));
  return main.length + own.length;
}

/**
 * 화면 오류·API 실패를 그 계정의 접속 기록에도 한 줄 (오류 기록은 lib/errors가 따로 묶어 둔다). 한 번에 넣는다.
 * 11/26 보안: 계정 목록에만 넣는다 — 아무 계정이나 오류 보고를 몰아 보내 전체 접속 기록(최근 500줄)의 들어옴·나감 줄을 밀어내지 못하게
 */
export function logClientErrors(accountId: string, items: readonly { kind: string; message: string }[], now = Date.now()): void {
  if (!items.length) return;
  const entries: ConnLogEntry[] = items.slice(0, 5).map((r) => ({ a: accountId, k: "err", at: now, msg: `${r.kind === "api" ? "API" : "화면"}: ${r.message}`.slice(0, 140) }));
  runAfter(() => getOpsLog().push("conn", entries, undefined, { all: false }));
}

/**
 * 11/28 한 계정이 MOVE_CAP.windowMs 안에 적을 수 있는 동작 줄 수 (이 서버 인스턴스 기준 — 명령을 더 쓰지 않는다).
 * 계정 목록은 50줄뿐이라, 자동 낚시 켜기·끄기나 화면 보고를 몰아 보내 앞선 기록(집 들어감·자리 떠남)을 밀어내지 못하게.
 * 평소 놀이(버스·집·채널·낚시 켜고 끄기)는 1분에 몇 줄이라 닿지 않는다. 넘은 줄은 버리고 세었다가 다음에 적는 줄에 skip으로 붙인다
 */
export const MOVE_CAP = { max: 20, windowMs: 60_000 } as const;
const moveCap = new Map<string, { start: number; n: number; skipped: number }>();

/** 상한 안의 줄만 (넘은 수는 다음 줄의 skip) — 순수하지 않다: 계정마다 창을 기억한다 */
export function capMoves(entries: readonly MoveLogEntry[], now = Date.now()): MoveLogEntry[] {
  if (moveCap.size > 5_000) for (const [k, v] of moveCap) if (now - v.start >= MOVE_CAP.windowMs) moveCap.delete(k);
  const out: MoveLogEntry[] = [];
  for (const e of entries) {
    let c = moveCap.get(e.a);
    if (!c || now - c.start >= MOVE_CAP.windowMs) {
      c = { start: now, n: 0, skipped: c?.skipped ?? 0 };
      moveCap.set(e.a, c);
    }
    if (c.n >= MOVE_CAP.max) {
      c.skipped++;
      continue;
    }
    c.n++;
    if (c.skipped) {
      out.push({ ...e, skip: (e.skip ?? 0) + c.skipped });
      c.skipped = 0;
    } else out.push(e);
  }
  return out;
}
/** 시험용: 상한 기억 비우기 */
export function resetMoveCap(): void {
  moveCap.clear();
}

/**
 * 11/27 자리 옮김·동작 줄들 (집 들어감·못 들어감·맵·채널 옮기기·자동 낚시·좌대 — lib/moveLog). 계정 목록에만 (전체 접속 기록의 들어옴·나감을 밀어내지 않게), 응답 뒤에 한 번에.
 * 11/28 계정마다 MOVE_CAP 안에서만
 */
export function logMoves(entries: readonly MoveLogEntry[]): void {
  const rows = capMoves(entries);
  if (!rows.length) return;
  runAfter(() => getOpsLog().push("conn", rows, undefined, { all: false }));
}

/** 11/28 사냥 드롭 → 기록 칸 (같은 종류·id·일수는 수를 합치고 앞 HUNT_DROP_LIST_MAX칸만, id는 48자까지). more = 넘쳐서 뺀 칸 수 */
export function huntDropList(drops: readonly { kind: string; id: string; qty: number; days?: number }[]): { dl: HuntDrop[]; more: number } {
  const by = new Map<string, HuntDrop>();
  const over = new Set<string>();
  for (const d of drops) {
    if (!d || typeof d.id !== "string") continue;
    const key = `${d.kind}|${d.id}|${d.days ?? ""}`;
    const cur = by.get(key);
    const q = Number.isFinite(d.qty) && d.qty > 0 ? Math.floor(d.qty) : 1;
    if (cur) cur[2] += q;
    else if (by.size < HUNT_DROP_LIST_MAX) by.set(key, d.days ? [d.kind, d.id.slice(0, 48), q, d.days] : [d.kind, d.id.slice(0, 48), q]);
    else over.add(key);
  }
  return { dl: [...by.values()], more: over.size };
}

/** 사냥터 한 줄 (응답 뒤에 — 판 시작·끝을 늦추지 않게) */
export function logHunt(accountId: string, e: Omit<HuntLogEntry, "a" | "at">, now = Date.now()): void {
  runAfter(() => getOpsLog().push("hunt", [{ ...e, a: accountId, at: now } as HuntLogEntry]));
}

export type ConnHealth = {
  /** 24시간 들어옴 수 */
  ins: number;
  /** 24시간 나감 수 (종류별) */
  outs: number;
  byWhy: Partial<Record<ConnWhy, number>>;
  /** 비정상 종료(연결 끊김·응답 없음·오류) 수와 비율 (나감이 없으면 null) */
  abnormal: number;
  ratio: number | null;
};

/** 시간 칸 합 → 비율 (순수) */
export function connHealthOf(counts: Record<string, number>): ConnHealth {
  const byWhy: Partial<Record<ConnWhy, number>> = {};
  let outs = 0;
  for (const w of CONN_WHYS) {
    const n = counts[w] ?? 0;
    if (n > 0) byWhy[w] = n;
    outs += n;
  }
  const abnormal = CONN_ABNORMAL.reduce((s, w) => s + (counts[w] ?? 0), 0);
  return { ins: counts.in ?? 0, outs, byWhy, abnormal, ratio: outs > 0 ? abnormal / outs : null };
}

/** 대시보드: 최근 24시간 접속 종료 현황 (시간 칸 24개를 한 번에) */
export async function connHealth24h(now = Date.now()): Promise<ConnHealth> {
  return connHealthOf(await getOpsLog().hourCounts(lastHourKeys(now, 24)));
}

export type { LogEntry };
