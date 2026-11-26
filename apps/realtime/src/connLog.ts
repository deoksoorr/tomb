import { CONN_LOG_BATCH, CONN_LOG_FLUSH_MS, INTERNAL_SIG_HEADER, INTERNAL_TTL_SEC, signInternal, type ConnLogWire } from "@tomb/protocol";
import { parseOrigins } from "./auth";
import type { Env } from "./config";

// 11/26 접속 기록: 로비 DO가 들어옴·나감 줄을 모았다가 CONN_LOG_FLUSH_MS(1분)마다, 또는 CONN_LOG_BATCH줄이 차면 한 번에 웹으로 넘긴다.
// 받는 곳은 웹 /api/internal/conn-log (서명 JOIN_SECRET). 웹 주소는 ALLOWED_ORIGINS의 첫 주소 —
// 운영·테스트 서버·로컬(localhost:3123)이 각자 자기 웹으로 보낸다 (WEB_ORIGIN은 [vars]라 로컬에서도 운영 주소라 쓰지 않는다).
// 11/26 넘기기 전 줄은 로비 DO 저장소(동기 KV)에도 적어 둔다: 한가한 로비는 1분이 차기 전에 내려가(로컬 workerd 약 10초,
// 운영 70~140초) 메모리에만 두면 손님이 적은 때의 들어옴·나감이 거의 다 사라졌다. 깨어나면 남은 줄을 되살려 바로 보낸다.

export const CONN_LOG_PATH = "/api/internal/conn-log";
/** 보내지 못해 다시 쌓을 때의 상한 (웹이 오래 멈춰도 메모리가 끝없이 늘지 않게) */
export const CONN_LOG_MAX_PENDING = CONN_LOG_BATCH * 5;

export class ConnLogBuffer {
  private rows: ConnLogWire[] = [];
  private dueAt: number | null = null;

  /** 한 줄 더한다. 한 묶음이 찼으면 true (바로 보낼 때) */
  add(row: ConnLogWire, now: number): boolean {
    this.rows.push(row);
    if (this.rows.length > CONN_LOG_MAX_PENDING) this.rows.splice(0, this.rows.length - CONN_LOG_MAX_PENDING);
    this.dueAt ??= now + CONN_LOG_FLUSH_MS;
    return this.rows.length >= CONN_LOG_BATCH;
  }

  /** 다음에 보낼 시각 (쌓인 게 없으면 null) */
  due(): number | null {
    return this.rows.length ? this.dueAt : null;
  }

  get size(): number {
    return this.rows.length;
  }

  /** 보낼 한 묶음 (오래된 것부터). 남은 게 있으면 다음 시각을 다시 잡는다 */
  take(now: number): ConnLogWire[] {
    const out = this.rows.splice(0, CONN_LOG_BATCH);
    this.dueAt = this.rows.length ? now + 1_000 : null;
    return out;
  }

  /** 지금 쌓인 줄 (저장용 복사본) */
  snapshot(): ConnLogWire[] {
    return [...this.rows];
  }

  /** 깨어났을 때 저장해 둔 줄을 되살린다 (곧 보낸다) */
  restore(rows: unknown, now: number): void {
    if (!Array.isArray(rows) || !rows.length) return;
    this.rows = [...(rows as ConnLogWire[]), ...this.rows].slice(-CONN_LOG_MAX_PENDING);
    this.dueAt = now + 1_000;
  }

  /** 보내지 못한 묶음을 앞에 되돌린다 (다음 주기에 다시) */
  putBack(rows: ConnLogWire[], now: number): void {
    this.rows = [...rows, ...this.rows].slice(-CONN_LOG_MAX_PENDING);
    this.dueAt = now + CONN_LOG_FLUSH_MS;
  }
}

/** 기록을 받을 웹 주소 = ALLOWED_ORIGINS의 첫 주소 (없으면 null → 기록하지 않는다) */
export function logOrigin(allowedOrigins: string | undefined): string | null {
  const first = [...parseOrigins(allowedOrigins)][0];
  return first && /^https?:\/\//.test(first) ? first : null;
}

/** 한 묶음을 웹에 보낸다. 성공하면 true (웹 주소·비밀값이 없으면 보낼 곳이 없어 true — 버린다) */
export async function sendConnLog(
  env: Pick<Env, "ALLOWED_ORIGINS" | "JOIN_SECRET">,
  rows: ConnLogWire[],
  fetcher: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<boolean> {
  const origin = logOrigin(env.ALLOWED_ORIGINS);
  if (!origin || !env.JOIN_SECRET || !rows.length) return true;
  const { body, sig } = await signInternal(env.JOIN_SECRET, { op: "connLog", rows, exp: Math.floor(nowMs / 1000) + INTERNAL_TTL_SEC });
  try {
    const res = await fetcher(origin + CONN_LOG_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_SIG_HEADER]: sig },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[connLog] 웹 응답", res.status);
    // 4xx(서명·모양이 틀림)는 다시 보내도 같다 → 버린다
    return res.ok || (res.status >= 400 && res.status < 500);
  } catch (e) {
    console.error("[connLog] 보내기 실패", e);
    return false;
  }
}
