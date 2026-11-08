/**
 * 「한때는...」 실시간 서버 — Cloudflare Worker (라우터) + Durable Objects
 *
 * ── 실시간 서버를 Vercel이 아니라 Durable Objects에 두는 이유 ──
 * 1. 인스턴스 문제: Vercel Functions의 WebSocket은 연결마다 별도 함수 인스턴스에 고정된다.
 *    같은 채널 사람들이 서로 다른 인스턴스에 붙으므로 위치를 주고받으려면 외부 pub/sub을 한 번 더 거쳐야 하고,
 *    그만큼 지연과 비용이 늘어난다. 함수 실행 시간 상한 때문에 연결이 주기적으로 끊기는 문제도 있다.
 * 2. 상한 강제: Durable Object는 이름 하나당 전 세계에 인스턴스가 정확히 하나다.
 *    한 채널(ch-N)의 모든 연결이 한곳에 모이므로 "최대 N명"을 경쟁 조건 없이 강제할 수 있다.
 * 3. 비용: WebSocket Hibernation API를 쓰면 유휴 연결은 요금이 거의 들지 않고,
 *    수신 메시지는 20건이 요청 1건으로 계산되며, 송신 메시지는 무료다.
 * 4. 지연: 채널 DO를 처음 만들 때 locationHint "apac"을 줘서 한국 사용자와 가까운 지역에 둔다.
 *
 * ── 경로 ──
 *   GET /health              상태 확인
 *   GET /lobby               채널 목록과 인원(LobbyInfo). CORS는 ALLOWED_ORIGINS만, 엣지 캐시 2초
 *   GET /queue?t=            대기열 자리 확인(QueueStatus). 대기열 토큰(channel 0)만 받는다. 캐시 없음
 *   GET /ch/:n?t=&x=&y=      채널 WebSocket. Origin·토큰(그 채널용)을 검증한 뒤 Channel DO로 넘긴다
 */
import { CLOSE, LOBBY_CACHE_SEC } from "@tomb/protocol";
import {
  TICKET_HEADER,
  admit,
  corsHeaders,
  encodeTicket,
  isAllowedOrigin,
  parseOrigins,
  queueVisitor,
  rejectSocket,
} from "./auth";
import { type Env, channelStub, lobbyStub, readConfig } from "./config";
import { parseChannel, parseSpawn } from "./logic";

export { ChannelDO } from "./ChannelDO";
export { LobbyDO } from "./LobbyDO";

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname === "/lobby") return lobby(req, env, ctx);
    if (url.pathname === "/queue") return queue(req, env, url);
    const ch = /^\/ch\/([^/]*)$/.exec(url.pathname);
    if (ch) return channel(req, env, url, ch[1]);
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ── GET /ch/:n ──

async function channel(req: Request, env: Env, url: URL, rawN: string): Promise<Response> {
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected websocket", { status: 426 });
  }
  if (!isAllowedOrigin(req.headers.get("Origin"), parseOrigins(env.ALLOWED_ORIGINS))) {
    return new Response("forbidden origin", { status: 403 });
  }
  const n = parseChannel(rawN, readConfig(env).maxChannels);
  if (n === null) return rejectSocket(CLOSE.BAD_REQUEST, "bad channel");

  if (!env.JOIN_SECRET) console.error("JOIN_SECRET is not set — every join is rejected");
  const spawn = parseSpawn(url.searchParams.get("x"), url.searchParams.get("y"));
  const ticket = await admit(env.JOIN_SECRET, url.searchParams.get("t"), n, spawn);
  if (!ticket) return rejectSocket(CLOSE.INVALID_TOKEN, "invalid token");

  const headers = new Headers(req.headers);
  headers.set(TICKET_HEADER, encodeTicket(ticket));
  return channelStub(env, n).fetch(new Request(req.url, { method: "GET", headers }));
}

// ── GET /lobby ──
// 입장 화면이 5초마다 폴링한다. 엣지 캐시 2초: isolate 안 메모 → caches.default → Lobby DO 순으로 찾는다.
// (workers.dev 도메인에서는 Cache API가 동작하지 않아 메모만 효과가 있다. 커스텀 도메인에서 둘 다 동작)
// 캐시에는 Origin과 무관한 본문만 두고, CORS 헤더는 응답할 때 Origin마다 붙인다.

const LOBBY_TTL_MS = LOBBY_CACHE_SEC * 1000;
const CACHED_AT_HEADER = "X-Lobby-At";
let memo: { body: string; at: number } | null = null;

/** GET 전용 JSON 경로의 CORS 헤더. OPTIONS(preflight)·GET 외 메서드면 바로 보낼 응답도 돌려준다 */
function corsFor(req: Request, env: Env): { cors: Record<string, string>; early?: Response } {
  const cors = corsHeaders(req.headers.get("Origin"), parseOrigins(env.ALLOWED_ORIGINS));
  if (req.method === "OPTIONS") {
    const headers = { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" };
    return { cors, early: new Response(null, { status: 204, headers }) };
  }
  if (req.method !== "GET") return { cors, early: new Response("method not allowed", { status: 405, headers: { Allow: "GET, OPTIONS" } }) };
  return { cors };
}

async function lobby(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { cors, early } = corsFor(req, env);
  if (early) return early;

  try {
    const body = await lobbyBody(req, env, ctx);
    return new Response(body, {
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": `public, max-age=${LOBBY_CACHE_SEC}` },
    });
  } catch (e) {
    console.error("lobby failed", e);
    return Response.json({ error: { code: "LOBBY_UNAVAILABLE", message: "채널 정보를 불러오지 못했어요." } }, { status: 503, headers: cors });
  }
}

async function lobbyBody(req: Request, env: Env, ctx: ExecutionContext): Promise<string> {
  const now = Date.now();
  if (memo && now - memo.at < LOBBY_TTL_MS) return memo.body;

  const key = new Request(new URL("/lobby", req.url).toString());
  const hit = await caches.default.match(key);
  if (hit) {
    memo = { body: await hit.text(), at: Number(hit.headers.get(CACHED_AT_HEADER)) || now };
    return memo.body;
  }

  const body = JSON.stringify(await lobbyStub(env).info());
  memo = { body, at: now };
  const cached = new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${LOBBY_CACHE_SEC}`,
      [CACHED_AT_HEADER]: String(now),
    },
  });
  ctx.waitUntil(caches.default.put(key, cached));
  return body;
}

// ── GET /queue ──
// 전체 상한에 닿았을 때 Vercel /api/join이 대기열 토큰(channel 0, TTL 600초)을 준다. 클라이언트는 QUEUE_POLL_MS마다
// 이 경로로 자기 자리를 확인하고(첫 호출이 줄 서기), admitted가 오면 그 채널 토큰을 다시 받아 바로 입장한다.

async function queue(req: Request, env: Env, url: URL): Promise<Response> {
  const { cors, early } = corsFor(req, env);
  if (early) return early;
  const visitorId = await queueVisitor(env.JOIN_SECRET, url.searchParams.get("t"));
  if (!visitorId) {
    return Response.json({ error: { code: "INVALID_TOKEN", message: "대기열 토큰이 올바르지 않아요." } }, { status: 403, headers: cors });
  }
  try {
    const status = await lobbyStub(env).queuePoll(visitorId);
    return Response.json(status, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("queue failed", e);
    return Response.json({ error: { code: "QUEUE_UNAVAILABLE", message: "대기열을 확인하지 못했어요." } }, { status: 503, headers: cors });
  }
}
