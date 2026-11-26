import {
  INTERNAL_SIG_HEADER,
  INTERNAL_TTL_SEC,
  MAINT_CACHE_MS,
  MAINT_OFF,
  MAINT_POLL_MS,
  MAINT_READ_HEADER,
  hmacVerify,
  parseMaint,
  publicMaint,
  signInternal,
  signMaintRead,
  type MaintState,
} from "@tomb/protocol";
import { ADMIN_COOKIE, verifyAdminCookie } from "./adminCookie";
import { env } from "./env";
import { maintUntilLabel } from "./maintText";

// 11/26 점검 모드 (웹 쪽). 상태의 정답은 실시간 서버 로비 DO다 (Redis 안 씀).
//  - 읽기: GET {실시간}/maintenance를 이 서버 인스턴스에 MAINT_CACHE_MS(15초) 기억한다. 못 읽으면 마지막 값(처음이면 꺼짐 — 사이트를 막지 않는다)
//  - 쓰기: 관리자 [점검 시작]·[점검 끝] → 서명한 /internal/maint. 쓴 인스턴스의 기억은 바로 바꾼다
//  - 미들웨어(proxy.ts)가 이 모듈만 불러 쓴다 → 저장소(Redis)·세션 모듈을 끌어오지 않는다 (가볍게)

type Memo = { at: number; state: MaintState };
const g = globalThis as typeof globalThis & { __tombMaint?: Memo };

/** 실시간 서버에 묻는 시간 상한 (넘기면 마지막 값) */
const READ_TIMEOUT_MS = 1_500;

export function realtimeBase(): string {
  return env.realtimeHttpUrl();
}

/** 지금 점검 상태 (15초 기억). fetcher·now는 시험용 */
export async function readMaint(now = Date.now(), fetcher: typeof fetch = fetch): Promise<MaintState> {
  const memo = g.__tombMaint;
  if (memo && now - memo.at < MAINT_CACHE_MS) return memo.state;
  let state = memo?.state ?? MAINT_OFF;
  try {
    // 11/26 통과 목록(skip)은 서명한 머리글이 있을 때만 실시간 서버가 싣는다 (없으면 공개 모양 — 운영자도 막힌다)
    const headers = { [MAINT_READ_HEADER]: await signMaintRead(env.joinSecret(), Math.floor(now / 1000)) };
    const res = await fetcher(`${realtimeBase()}/maintenance`, { cache: "no-store", headers, signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    if (res.ok) state = parseMaint(await res.json());
  } catch {
    // 실시간 서버가 꺼져 있거나 늦다 → 마지막 값 그대로 (다음 15초 뒤에 다시)
  }
  g.__tombMaint = { at: now, state };
  return state;
}

/** 시험·관리자 화면: 기억을 지금 값으로 바꾼다 (null = 지운다) */
export function rememberMaint(state: MaintState | null, now = Date.now()): void {
  g.__tombMaint = state ? { at: now, state } : undefined;
}

/** 계정 id → 통과 목록 해시 (sha256 hex 앞 16자). 원래 id는 실시간 서버·공개 응답에 싣지 않는다 */
export async function skipHash(accountId: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`maint:${accountId}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** 관리자 [점검 시작]·[점검 끝] → 실시간 서버. 운영자 계정은 skip으로 통과시킨다 */
export async function setMaint(
  input: { on: boolean; msg: string; until: number | null },
  staffIds: readonly string[],
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ state: MaintState; kicked: number }> {
  const skip = await Promise.all(staffIds.filter(Boolean).slice(0, 8).map(skipHash));
  const { body, sig } = await signInternal(env.joinSecret(), {
    op: "maint",
    on: input.on,
    msg: input.on ? input.msg : "",
    until: input.on ? input.until : null,
    skip: input.on ? skip : [],
    exp: Math.floor(now / 1000) + INTERNAL_TTL_SEC,
  });
  const res = await fetcher(`${realtimeBase()}/internal/maint`, {
    method: "POST",
    headers: { "content-type": "application/json", [INTERNAL_SIG_HEADER]: sig },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`실시간 서버가 점검 상태를 받지 못했어요 (${res.status}).`);
  const out = (await res.json()) as { state?: unknown; kicked?: number };
  const state = parseMaint(out.state);
  rememberMaint(state, now);
  return { state, kicked: Number(out.kicked) || 0 };
}

// ── 미들웨어 판정 ──

/** 점검 중에도 열어 두는 경로: 관리자 화면·관리자 API(따로 IP·키 확인)·점검 상태 API·서버끼리 경로·Next 정적 파일·확장자가 있는 파일 */
export function maintOpenPath(path: string): boolean {
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/") || path === "/api/admin") return true;
  if (path === "/api/maintenance" || path.startsWith("/api/internal/")) return true;
  if (path.startsWith("/_next/")) return true;
  const last = path.slice(path.lastIndexOf("/") + 1);
  return /\.[A-Za-z0-9]{1,12}$/.test(last);
}

const VISITOR_ID_RE = /^[A-Za-z0-9_-]{21}$/;
/** 방문자 쿠키(vid)의 서명만 확인해 계정 id (세대는 보지 않는다 — 운영자 통과 판정용, lib/session.parseSession과 같은 모양) */
export async function sessionIdOf(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  if (!VISITOR_ID_RE.test(id)) return null;
  const rest = value.slice(dot + 1);
  const dot2 = rest.indexOf(".");
  if (dot2 < 0) return (await hmacVerify(env.sessionSecret(), id, rest)) ? id : null;
  const gen = rest.slice(0, dot2);
  if (!/^g[1-9]\d{0,8}$/.test(gen)) return null;
  return (await hmacVerify(env.sessionSecret(), `${id}.${gen}`, rest.slice(dot2 + 1))) ? id : null;
}

/** 점검 중에도 통과: 관리자 쿠키 또는 운영자 계정 쿠키 */
export async function maintBypass(cookies: { get(name: string): { value: string } | undefined }, state: MaintState): Promise<boolean> {
  if (await verifyAdminCookie(cookies.get(ADMIN_COOKIE)?.value)) return true;
  if (!state.skip?.length) return false;
  const id = await sessionIdOf(cookies.get("vid")?.value);
  return !!id && state.skip.includes(await skipHash(id));
}

/** Retry-After (초): 예상 끝 시각까지, 1분~6시간. 모르면 10분 */
export function retryAfterSec(state: MaintState, now = Date.now()): number {
  if (!state.until || state.until <= now) return 600;
  return Math.min(6 * 3600, Math.max(60, Math.ceil((state.until - now) / 1000)));
}

/** 예상 끝 시각 문구 (KST, 예: "11월 26일 오후 3:30") */
export const maintUntilText = maintUntilLabel;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 503 점검 화면 (사이트 전체). 30초마다 저절로 다시 불러 점검이 끝나면 원래 화면이 열린다 */
export function maintPageHtml(state: MaintState): string {
  const until = maintUntilText(state.until);
  const refresh = Math.round(MAINT_POLL_MS / 1000);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="${refresh}"><meta name="robots" content="noindex">
<title>서버 점검 중이에요 · 한때는...</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{display:flex;align-items:center;justify-content:center;padding:24px 16px;background:radial-gradient(120% 90% at 50% 10%,#2a2440 0%,#15131f 55%,#0d0c14 100%);color:#ece8f6;font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:420px;text-align:center;padding:36px 24px 28px;border-radius:20px;background:rgba(30,27,44,.86);border:1px solid rgba(190,176,255,.18);box-shadow:0 18px 50px rgba(0,0,0,.45)}
.ghost{width:64px;height:72px;margin:0 auto 18px;border-radius:32px 32px 10px 10px;background:#f4f1ff;position:relative;animation:float 3.2s ease-in-out infinite;box-shadow:0 0 28px rgba(200,190,255,.35)}
.ghost:before,.ghost:after{content:"";position:absolute;top:26px;width:8px;height:11px;border-radius:50%;background:#2a2440}
.ghost:before{left:19px}.ghost:after{right:19px}
@keyframes float{50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.ghost{animation:none}}
h1{margin:0 0 10px;font-size:22px;font-weight:800;letter-spacing:-.01em}
.msg{margin:0 0 18px;font-size:15px;color:#d6d0ea;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.until{display:inline-block;margin:0 0 18px;padding:8px 14px;border-radius:999px;background:rgba(160,140,255,.14);color:#cfc4ff;font-size:14px;font-weight:600}
.note{margin:0;font-size:13px;color:#9a93b4}
</style></head>
<body><main class="card" role="main">
<div class="ghost" aria-hidden="true"></div>
<h1>서버 점검 중이에요</h1>
${state.msg ? `<p class="msg">${esc(state.msg)}</p>` : `<p class="msg">더 좋은 마을로 돌아올게요.</p>`}
${until ? `<p class="until">${esc(until)}쯤 끝나요</p>` : ""}
<p class="note">이 화면을 열어 두면 점검이 끝날 때 저절로 새로고침돼요.</p>
</main></body></html>`;
}

/** 브라우저에 보낼 점검 상태 (통과 목록 빼고) */
export function maintForClient(state: MaintState): MaintState {
  return publicMaint(state);
}
