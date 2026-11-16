import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

// Redis 명령 수 계측 (인스턴스 메모리만 — 이것 때문에 Redis에 쓰지 않는다).
//  - 모든 Upstash 클라이언트를 redisClient()로 만들면 HTTP 요청마다 명령 수를 "라우트 · 저장소:명령" 이름으로 센다
//  - 라우트 이름은 handler()가 withRedisRoute로 붙인다 (응답 뒤 runAfter 작업도 같은 이름). 라우트 밖이면 "-"
//  - Upstash 과금: 파이프라인 안 명령은 하나씩, MULTI/EXEC는 +2, EVAL/EVALSHA는 1 + 스크립트 안 redis.call 수.
//    스크립트 안 호출 수는 HTTP에서 안 보이므로 스크립트 본문의 redis.call 개수로 어림한다 (분기·반복이 있으면 실제와 다르다)
//  - 5분에 한 번(그사이 명령이 있었을 때만) console.info("[redis-usage] …")로 요약을 남기고 비운다. REDIS_USAGE_LOG=0이면 로그만 끈다

export type RedisConn = { url: string; token: string };

type Row = { sent: number; billed: number };

const LOG_EVERY_MS = 5 * 60_000;
const TOP_ROWS = 25;
/** 이름이 끝없이 늘지 않게 (라우트 경로를 정리해도 혹시 모를 폭주 대비) */
const MAX_KEYS = 2_000;

type UsageState = { rows: Map<string, Row>; since: number; scripts: Map<string, { sha: string; calls: number }>; shaCalls: Map<string, number> };
const g = globalThis as typeof globalThis & { __tombRedisUsage?: UsageState; __tombRedisRoute?: AsyncLocalStorage<string> };
const state = (g.__tombRedisUsage ??= { rows: new Map(), since: Date.now(), scripts: new Map(), shaCalls: new Map() });
const als = (g.__tombRedisRoute ??= new AsyncLocalStorage<string>());

const logEnabled = () => process.env.REDIS_USAGE_LOG !== "0" && !process.env.VITEST && process.env.NODE_ENV !== "test";

/** 경로의 id 조각(숫자·대문자·한글·긴 값)을 :id로 바꿔 라우트마다 이름 하나로 모은다 */
export function routeLabel(method: string, pathname: string): string {
  const path = pathname
    .split("/")
    .map((s) => (s === "" || /^[a-z][a-z-]{0,23}$/.test(s) ? s : ":id"))
    .join("/");
  return `${method} ${path}`;
}

/** 라우트 이름을 붙여 실행 (그 안에서 나간 Redis 명령은 이 이름으로 센다) */
export function withRedisRoute<T>(label: string, fn: () => T): T {
  return als.run(label, fn);
}

/** 스크립트 본문 → sha1과 어림 내부 호출 수 (redis.call / redis.pcall 개수) */
function scriptInfo(script: string): { sha: string; calls: number } {
  let s = state.scripts.get(script);
  if (!s) {
    const sha = createHash("sha1").update(script).digest("hex");
    s = { sha, calls: (script.match(/redis\.p?call\s*\(/g) ?? []).length };
    state.scripts.set(script, s);
    state.shaCalls.set(sha, s.calls);
  }
  return s;
}

/** 명령 하나 → [이름, 어림 과금 수] */
function classify(cmd: unknown): [string, number] {
  if (!Array.isArray(cmd) || typeof cmd[0] !== "string") return ["?", 1];
  const name = cmd[0].toLowerCase();
  if ((name === "eval" || name === "eval_ro") && typeof cmd[1] === "string") {
    const { sha, calls } = scriptInfo(cmd[1]);
    return [`eval#${sha.slice(0, 7)}`, 1 + calls];
  }
  if ((name === "evalsha" || name === "evalsha_ro") && typeof cmd[1] === "string") {
    const calls = state.shaCalls.get(cmd[1]) ?? 0;
    return [`eval#${cmd[1].slice(0, 7)}`, 1 + calls];
  }
  return [name, 1];
}

function bump(key: string, sent: number, billed: number) {
  let row = state.rows.get(key);
  if (!row) {
    if (state.rows.size >= MAX_KEYS) key = "(기타)";
    row = state.rows.get(key) ?? { sent: 0, billed: 0 };
    state.rows.set(key, row);
  }
  row.sent += sent;
  row.billed += billed;
}

/** HTTP 요청 하나(단일 명령 · 파이프라인 · multi-exec)를 센다 */
export function countRedisRequest(client: string, path: readonly string[] | undefined, body: unknown, now = Date.now()): void {
  const route = als.getStore() ?? "-";
  const kind = path?.[0];
  if ((kind === "pipeline" || kind === "multi-exec") && Array.isArray(body)) {
    for (const cmd of body) {
      const [name, billed] = classify(cmd);
      bump(`${route} ${client}:${name}`, 1, billed);
    }
    if (kind === "multi-exec") bump(`${route} ${client}:multi+exec`, 0, 2);
  } else {
    const [name, billed] = classify(body);
    bump(`${route} ${client}:${name}`, 1, billed);
  }
  maybeLog(now);
}

export type RedisUsageSnapshot = {
  since: number;
  /** 보낸 명령 수 (EVAL 하나 = 1) */
  sent: number;
  /** 어림 과금 명령 수 (EVAL 안 호출·MULTI/EXEC 포함) */
  billed: number;
  /** 라우트별 합계 (과금 많은 순) */
  routes: { route: string; sent: number; billed: number }[];
  /** 라우트 · 저장소:명령 (과금 많은 순) */
  rows: { key: string; sent: number; billed: number }[];
};

export function redisUsageSnapshot(top = TOP_ROWS): RedisUsageSnapshot {
  let sent = 0;
  let billed = 0;
  const routes = new Map<string, Row>();
  for (const [key, r] of state.rows) {
    sent += r.sent;
    billed += r.billed;
    const route = key.slice(0, key.lastIndexOf(" "));
    const acc = routes.get(route) ?? { sent: 0, billed: 0 };
    acc.sent += r.sent;
    acc.billed += r.billed;
    routes.set(route, acc);
  }
  const byBilled = <T extends Row>(a: T, b: T) => b.billed - a.billed;
  return {
    since: state.since,
    sent,
    billed,
    routes: [...routes].map(([route, r]) => ({ route, ...r })).sort(byBilled).slice(0, top),
    rows: [...state.rows].map(([key, r]) => ({ key, ...r })).sort(byBilled).slice(0, top),
  };
}

export function resetRedisUsage(now = Date.now()): void {
  state.rows.clear();
  state.since = now;
}

/** 로그 한 덩어리 (Vercel 로그에서 "[redis-usage]"로 찾는다) */
export function formatRedisUsage(s: RedisUsageSnapshot, now = Date.now()): string {
  const secs = Math.max(1, Math.round((now - s.since) / 1000));
  const perHour = Math.round((s.billed * 3600) / secs);
  const lines = [`[redis-usage] ${secs}s sent=${s.sent} billed≈${s.billed} (≈${perHour}/h on this instance)`];
  lines.push("  routes: " + s.routes.map((r) => `${r.route}=${r.billed}`).join(" | "));
  for (const r of s.rows) lines.push(`  ${r.billed}\t${r.sent}\t${r.key}`);
  return lines.join("\n");
}

function maybeLog(now: number) {
  if (now - state.since < LOG_EVERY_MS) return;
  const snap = redisUsageSnapshot();
  if (logEnabled() && snap.sent > 0) console.info(formatRedisUsage(snap, now));
  resetRedisUsage(now);
}

/**
 * Upstash 클라이언트 만들기 (모든 저장소가 이걸 쓴다 → 명령 수를 한곳에서 센다).
 * name은 로그에 보일 저장소 이름. 기본값은 지금까지와 같다 (자동 직렬화 끔)
 */
export function redisClient(conn: RedisConn, name: string, opts: { automaticDeserialization?: boolean } = {}): Redis {
  const redis = new Redis({ ...conn, automaticDeserialization: opts.automaticDeserialization ?? false });
  redis.use((req, next) => {
    try {
      countRedisRequest(name, req.path, req.body);
    } catch {
      // 계측 실패는 명령을 막지 않는다
    }
    return next(req);
  });
  return redis;
}
