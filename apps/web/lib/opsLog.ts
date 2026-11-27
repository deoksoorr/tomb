import { CONN_ABNORMAL, CONN_WHYS, type ConnLogWire, type ConnWhy } from "@tomb/protocol";
import { runAfter } from "./analyticsService";
import type { MoveLogEntry } from "./moveLog";
import { getOpsLog, hourKeyOf, lastHourKeys, type ConnLogEntry, type HuntLogEntry, type LogEntry } from "./store/opsLog";

// 11/26 운영 기록 쓰기·읽기 (저장소: lib/store/opsLog). 기록 실패는 손님 요청을 깨지 않는다 (조용히 로그만).

/** 실시간 서버가 1분마다 모아 보낸 들어옴·나감 → 접속 기록 (한 번에 넣는다) */
export async function recordConnRows(rows: readonly ConnLogWire[], now = Date.now()): Promise<number> {
  const entries: ConnLogEntry[] = rows
    .map(([a, k, at, ch, dev, why]): ConnLogEntry => ({
      a,
      k: k === "i" ? "in" : "out",
      at: Math.min(at, now),
      ...(ch ? { ch } : {}),
      ...(dev ? { dev } : {}),
      ...(k === "o" && why ? { why } : {}),
    }))
    .sort((x, y) => x.at - y.at);
  if (entries.length) await getOpsLog().push("conn", entries, hourKeyOf(now));
  return entries.length;
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
 * 11/27 자리 옮김 줄들 (집 들어감·못 들어감·맵·채널 옮기기 — lib/moveLog). 계정 목록에만 (전체 접속 기록의 들어옴·나감을 밀어내지 않게), 응답 뒤에 한 번에
 */
export function logMoves(entries: readonly MoveLogEntry[]): void {
  if (!entries.length) return;
  runAfter(() => getOpsLog().push("conn", entries, undefined, { all: false }));
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
