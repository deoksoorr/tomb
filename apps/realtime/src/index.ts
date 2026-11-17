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
 *   GET /lobby               채널 목록과 인원(LobbyInfo). CORS는 ALLOWED_ORIGINS만, 아이솔레이트 메모·엣지 캐시 LOBBY_CACHE_SEC(5초)
 *   GET /hunt-rooms          11/12 사냥터 방별 지금 인원(HuntRoomsInfo). CORS는 ALLOWED_ORIGINS만, 메모리·엣지 캐시 10초
 *   GET /queue?t=            대기열 자리 확인(QueueStatus). 대기열 토큰(channel 0)만 받는다. 캐시 없음
 *   GET /ch/:n?t=&x=&y=&v=&m=   채널 WebSocket. Origin·클라이언트 버전·토큰(그 채널용)을 검증한 뒤 Channel DO로 넘긴다 (m=camp: 11/15 캠핑장으로, 토큰에 camp 허락이 있을 때만. m=sea: 11/16 바닷가, sea 허락)
 *   GET /room/:id?t=&x=&y=&v= 방(마을·집·사냥터) WebSocket. 토큰의 room이 id와 같아야 한다. 상한 ROOM_CAPACITY
 *   (v < MIN_CLIENT_VERSION이면 DO까지 가지 않고 4010으로 거절 → 클라이언트가 새로고침 창을 띄운다)
 *   POST /dev/goblin?ch=N    (개발용, DEV_HOOKS=1일 때만) 그 채널에 황금 고블린을 지금 나오게 한다. 운영에서는 404
 *   POST /internal/me        Vercel → 이 서버: 접속 중인 그 방문자들에게 "내 정보 새로 받기"를 보낸다 (관리자 포인트 지급 등). 서명 필수
 *   POST /internal/kick      47번 Vercel → 이 서버: 방문자들을 지금 내보낸다(강퇴 4011·이용 제한 4012). 본문 서명(JOIN_SECRET) 필수
 *   POST /internal/peer      47번 Vercel → 이 서버: 채널·방의 sid가 누구인지 (유저 신고). 본문 서명 필수
 *   POST /internal/hello     친구 Vercel → 이 서버: 입장 직전 "들고 날 때 알릴 친구들" 등록 (로비가 들어옴·나감을 밀어 준다). 본문 서명 필수
 *   POST /internal/where     친구 Vercel → 이 서버: 그 방문자들이 지금 어느 채널·자리에 있는지 (WHERE_CACHE_MS 기억). 본문 서명 필수
 *   POST /internal/say       11/15 Vercel → 이 서버: 마을 공지 한 줄을 사람이 있는 채널 모두의 확성기 줄에 지금 띄운다. 본문 서명 필수
 *   POST /internal/pin       11/17 Vercel → 이 서버: 확성기 창 고정 공지가 바뀌었다 (그 채널 하나, 모든 채널이면 사람이 있는 채널 모두). 본문 서명 필수
 *   POST /internal/online    11/17 Vercel → 이 서버: 지금 접속 중인 방문자 id 전부 (관리자 선물 「지금 접속 중인 사람 모두」). 본문 서명 필수
 */
import { CLOSE, HUNT_ROOMS_CACHE_SEC, INTERNAL_SIG_HEADER, LOBBY_CACHE_SEC, ROOM_ID_RE, WHERE_CACHE_MS, verifyInternal, type PeerWhere } from "@tomb/protocol";
import type { JoinTicket } from "./channel";
import {
  TICKET_HEADER,
  admit,
  admitRoom,
  corsHeaders,
  encodeTicket,
  isAllowedOrigin,
  parseOrigins,
  queueVisitor,
  rejectSocket,
} from "./auth";
import { type Env, channelStub, lobbyStub, readConfig, roomStub } from "./config";
import { mergeOnline } from "./lobbyState";
import { IsolateMemo, isOutdatedClient, parseChannel, parseMap, parseSpawn, pinEvent, sayRelay } from "./logic";

export { ChannelDO } from "./ChannelDO";
export { LobbyDO } from "./LobbyDO";

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname === "/lobby") return lobby(req, env, ctx);
    if (url.pathname === "/hunt-rooms") return huntRooms(req, env);
    if (url.pathname === "/queue") return queue(req, env, url);
    const ch = /^\/ch\/([^/]*)$/.exec(url.pathname);
    if (ch) return channel(req, env, url, ch[1]);
    const rm = /^\/room\/([^/]*)$/.exec(url.pathname);
    if (rm) return room(req, env, url, rm[1]);
    if (INTERNAL_PATHS.has(url.pathname)) return internal(req, env, url.pathname);
    if (url.pathname === "/dev/goblin" && env.DEV_HOOKS === "1" && req.method === "POST") {
      const n = parseChannel(url.searchParams.get("ch") ?? "1", readConfig(env).maxChannels);
      if (n === null) return new Response("bad channel", { status: 400 });
      return Response.json({ goblin: await channelStub(env, n).devGoblin() });
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ── POST /internal/* (47번, 서버끼리) ──
// 브라우저가 부르는 경로가 아니라 CORS가 없다. 서명이 틀리면 경로가 없는 것처럼 404.

/** /internal/* 본문 상한 (바이트) */
const INTERNAL_MAX_BYTES = 8_000 * 4;
const INTERNAL_PATHS = new Set(["/internal/kick", "/internal/peer", "/internal/me", "/internal/where", "/internal/hello", "/internal/say", "/internal/pin", "/internal/online"]);

async function internal(req: Request, env: Env, path: string): Promise<Response> {
  const notFound = new Response("not found", { status: 404 });
  if (req.method !== "POST") return notFound;
  // 서명을 보기 전에 본문 크기부터 (verifyInternal의 글자 수 상한과 같은 8KB) — 큰 본문을 통째로 읽어 메모리를 쓰지 않게
  // (길이 머리글이 없는 요청은 예전처럼 읽고 글자 수로 거른다 — 서버 간 호출을 깨지 않게)
  const len = Number(req.headers.get("content-length") ?? 0);
  if (!req.headers.get(INTERNAL_SIG_HEADER) || !(len <= INTERNAL_MAX_BYTES)) return notFound;
  const r = await verifyInternal(env.JOIN_SECRET, await req.text(), req.headers.get(INTERNAL_SIG_HEADER));
  if (!r || `/internal/${r.op}` !== path) return notFound;
  if (r.op === "kick") {
    if (r.code !== CLOSE.KICKED && r.code !== CLOSE.BANNED) return new Response("bad code", { status: 400 });
    // 방문자가 어느 채널에 있는지 로비 등록이 늦거나 비어 있을 수 있어, 열린 채널 전부에 묻는다 (채널 수가 적다).
    // 방: 마을 방과 로비가 아는 사냥터 방(인원 보고)에도 보낸다 — 고친 클라이언트가 방 소켓을 붙든 채 남지 않게.
    // 집 방은 로비가 모른다 → 월드 소켓이 닫히면 클라이언트가 정리한다
    const [info, hunt] = await Promise.all([lobbyStub(env).info(), lobbyStub(env).huntRooms().catch(() => ({ rooms: {} as Record<string, number> }))]);
    const rooms = ["village", ...Object.keys(hunt.rooms)].filter((id) => ROOM_ID_RE.test(id));
    const expel = (label: string, stub: { expel(ids: string[], code: number): Promise<number> | number }) =>
      Promise.resolve()
        .then(() => stub.expel(r.visitorIds, r.code))
        .catch((e) => {
          console.error("expel failed", label, e);
          return 0;
        });
    const counts = await Promise.all([
      ...info.channels.map((c) => expel(String(c.id), channelStub(env, c.id))),
      ...rooms.map((id) => expel(id, roomStub(env, id))),
    ]);
    return Response.json({ expelled: counts.reduce((a, b) => a + b, 0) });
  }
  if (r.op === "me") {
    // 방에 있어도 월드 채널 소켓은 열려 있다 → 열린 채널에만 알린다
    const info = await lobbyStub(env).info();
    const counts = await Promise.all(
      info.channels.map((c) =>
        channelStub(env, c.id)
          .nudgeMe(r.visitorIds)
          .catch((e) => {
            console.error("nudgeMe failed", c.id, e);
            return 0;
          }),
      ),
    );
    return Response.json({ sent: counts.reduce((a, b) => a + b, 0) });
  }
  if (r.op === "say") {
    // 마을 공지: 확성기 방송과 같은 모양(scope all)으로, 사람이 있는 채널마다 한 번 (채널이 nonce로 중복을 막는다 — 웹이 다시 보내도 한 번)
    const { nonce, until, data } = sayRelay(r);
    const info = await lobbyStub(env).info();
    const sent = await Promise.all(
      info.channels
        .filter((c) => c.count > 0)
        .map((c) =>
          channelStub(env, c.id)
            .megaphoneRelay(nonce, until, data)
            .catch((e) => {
              console.error("say relay failed", c.id, e);
              return false;
            }),
        ),
    );
    return Response.json({ sent: sent.filter(Boolean).length });
  }
  if (r.op === "pin") {
    // 11/17 고정 공지: 운영자가 쓰거나 지울 때만 온다 (드물다). 채널 공지는 그 채널 DO 하나만 (로비를 묻지 않는다 — 비었으면 보낼 사람이 없을 뿐),
    // 모든 채널 공지는 로비 한 번 + 사람이 있는 채널마다 한 번
    const data = pinEvent(r);
    let ids: number[];
    if (r.scope === "channel") ids = parseChannel(String(r.ch), readConfig(env).maxChannels) === null ? [] : [r.ch];
    else ids = (await lobbyStub(env).info()).channels.filter((c) => c.count > 0).map((c) => c.id);
    const sent = await Promise.all(
      ids.map((id) =>
        channelStub(env, id)
          .pinRelay(data)
          .catch((e) => {
            console.error("pin relay failed", id, e);
            return false;
          }),
      ),
    );
    return Response.json({ sent: sent.filter(Boolean).length });
  }
  if (r.op === "online") {
    // 11/17 관리자 선물: 사람이 있는 채널들의 지금 명단(기억을 건너뛰고) + 로비 등록 → 한 번씩
    const lobby = lobbyStub(env);
    const [map, registry] = await Promise.all([
      whereMap(env, true),
      lobby.onlineVisitors().catch((e) => {
        console.error("onlineVisitors failed", e);
        return [] as string[];
      }),
    ]);
    return Response.json({ visitorIds: mergeOnline([[...map.keys()].map((visitorId) => ({ visitorId }))], registry) });
  }
  if (r.op === "hello") {
    await lobbyStub(env).friendHello(r.visitorId, r.name, r.key, r.friends);
    return Response.json({ ok: true });
  }
  if (r.op === "where") {
    const map = await whereMap(env, r.fresh === true);
    const where: Record<string, PeerWhere> = {};
    for (const v of r.visitorIds) {
      const w = map.get(v);
      if (w) where[v] = w;
    }
    return Response.json({ where });
  }
  const stub = r.ch !== undefined ? (parseChannel(String(r.ch), readConfig(env).maxChannels) === null ? null : channelStub(env, r.ch)) : roomStub(env, r.room!);
  if (!stub) return Response.json({ peer: null });
  return Response.json({ peer: await stub.peerAt(r.sid) });
}

// ── 친구 위치 (/internal/where) ──
// 사람이 있는 채널들의 접속자 자리를 아이솔레이트 메모리에 WHERE_CACHE_MS 동안 기억한다.
// 친구 창·접속 알림이 자주 물어도 채널 DO는 그 간격에 한 번만 깨운다. fresh(친구한테 가기)면 바로 다시 묻는다.
// 방(집·사냥터)은 로비가 모르지만, 방에 있어도 월드 채널 자리는 실내(away)로 남아 있어 채널 쪽에서 찾는다.

let whereMemo: { at: number; map: Map<string, PeerWhere> } | null = null;

async function whereMap(env: Env, fresh: boolean): Promise<Map<string, PeerWhere>> {
  const now = Date.now();
  if (!fresh && whereMemo && now - whereMemo.at < WHERE_CACHE_MS) return whereMemo.map;
  const info = await lobbyStub(env).info();
  const ids = info.channels.filter((c) => c.count > 0).map((c) => c.id);
  const rosters = await Promise.all(
    ids.map((id) =>
      channelStub(env, id)
        .roster()
        .catch((e) => {
          console.error("roster failed", id, e);
          return [];
        }),
    ),
  );
  const map = new Map<string, PeerWhere>();
  ids.forEach((ch, i) => {
    for (const { visitorId, ...at } of rosters[i]) map.set(visitorId, { ch, ...at });
  });
  whereMemo = { at: now, map };
  return map;
}

// ── GET /ch/:n ──

/** WebSocket 업그레이드 요청이고 Origin이 허용 목록에 있고 클라이언트 버전이 충분한지. 아니면 바로 보낼 응답 */
function upgradeGate(req: Request, env: Env, url: URL): Response | null {
  if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
  if (!isAllowedOrigin(req.headers.get("Origin"), parseOrigins(env.ALLOWED_ORIGINS))) {
    return new Response("forbidden origin", { status: 403 });
  }
  // 큰 패치(맵·프로토콜 변경) 뒤 옛 화면: 토큰 검증·DO 호출 없이 바로 거절한다 (옛 화면이 재시도해도 비용이 거의 없다)
  if (isOutdatedClient(url.searchParams.get("v"))) return rejectSocket(CLOSE.OUTDATED, "update required");
  return null;
}

/** 검증한 입장 정보를 내부 헤더에 실어 DO로 넘긴다 */
function forward(req: Request, stub: { fetch(r: Request): Promise<Response> }, ticket: JoinTicket): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.set(TICKET_HEADER, encodeTicket(ticket));
  return stub.fetch(new Request(req.url, { method: "GET", headers }));
}

async function channel(req: Request, env: Env, url: URL, rawN: string): Promise<Response> {
  const gate = upgradeGate(req, env, url);
  if (gate) return gate;
  const n = parseChannel(rawN, readConfig(env).maxChannels);
  if (n === null) return rejectSocket(CLOSE.BAD_REQUEST, "bad channel");

  if (!env.JOIN_SECRET) console.error("JOIN_SECRET is not set — every join is rejected");
  // 11/15 ?m=camp: 처음부터 캠핑장으로 (새로고침 복원·캠핑장에서 채널 이동·재접속). 허락 없는 토큰이면 admit이 마을로 돌린다 (11/16 ?m=sea 바닷가도 같다)
  const map = parseMap(url.searchParams.get("m"));
  const spawn = parseSpawn(url.searchParams.get("x"), url.searchParams.get("y"), false, map);
  const ticket = await admit(env.JOIN_SECRET, url.searchParams.get("t"), n, spawn, map);
  if (!ticket) return rejectSocket(CLOSE.INVALID_TOKEN, "invalid token");
  return forward(req, channelStub(env, n), ticket);
}

// ── GET /room/:id ── 방(마을·집·사냥터). 같은 사람이 월드 채널과 방에 동시에 붙어 있을 수 있다
// (월드 아바타는 입구에 idle로 남는다). 그래서 방은 로비 보고·대기열·채널 간 중복 정리를 하지 않는다.

async function room(req: Request, env: Env, url: URL, rawId: string): Promise<Response> {
  const gate = upgradeGate(req, env, url);
  if (gate) return gate;
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return rejectSocket(CLOSE.BAD_REQUEST, "bad room");
  }
  if (!ROOM_ID_RE.test(id)) return rejectSocket(CLOSE.BAD_REQUEST, "bad room");
  const spawn = parseSpawn(url.searchParams.get("x"), url.searchParams.get("y"), true);
  const ticket = await admitRoom(env.JOIN_SECRET, url.searchParams.get("t"), id, spawn);
  if (!ticket) return rejectSocket(CLOSE.INVALID_TOKEN, "invalid token");
  return forward(req, roomStub(env, id), ticket);
}

// ── GET /lobby ──
// 입장 화면·채널 창이 LOBBY_POLL_MS(10초)마다(화면 하나에 한 번, 숨은 탭은 멈춤), 웹 서버가 입장 토큰을 줄 때 묻는다.
// 캐시 LOBBY_CACHE_SEC(5초): 아이솔레이트 안 메모 → caches.default → Lobby DO 순으로 찾는다.
// 주의: 운영은 workers.dev 주소라 Cache API(caches.default)가 아무것도 저장하지 않는다(match는 늘 없음, put은 무시) → 아이솔레이트 메모만 효과가 있다.
//   커스텀 도메인(wrangler.toml routes)으로 옮기면 같은 지역 아이솔레이트들이 엣지 캐시를 나눠 써서 DO 요청이 더 준다.
// 캐시에는 Origin과 무관한 본문만 두고, CORS 헤더는 응답할 때 Origin마다 붙인다.

const LOBBY_TTL_MS = LOBBY_CACHE_SEC * 1000;
const CACHED_AT_HEADER = "X-Lobby-At";
const lobbyMemo = new IsolateMemo<string>(LOBBY_TTL_MS);

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

function lobbyBody(req: Request, env: Env, ctx: ExecutionContext): Promise<string> {
  return lobbyMemo.get(Date.now(), async () => {
    const key = new Request(new URL("/lobby", req.url).toString());
    const hit = await caches.default.match(key);
    if (hit) return { v: await hit.text(), at: Number(hit.headers.get(CACHED_AT_HEADER)) || Date.now() };

    const now = Date.now();
    const body = JSON.stringify(await lobbyStub(env).info());
    const cached = new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${LOBBY_CACHE_SEC}`,
        [CACHED_AT_HEADER]: String(now),
      },
    });
    ctx.waitUntil(caches.default.put(key, cached));
    return { v: body, at: now };
  });
}

// ── GET /hunt-rooms (11/12) ──
// 사냥터 고르는 화면이 "n명 사냥 중"을 보여 주려고 묻는다. 방 DO들이 로비에 보고해 둔 값을 그대로 돌려준다(방을 깨우지 않는다).
// 아이솔레이트 메모리에 10초 + 브라우저·엣지 Cache-Control 10초 → 로비 DO 호출은 아이솔레이트마다 10초에 한 번.

const huntMemo = new IsolateMemo<string>(HUNT_ROOMS_CACHE_SEC * 1000);

async function huntRooms(req: Request, env: Env): Promise<Response> {
  const { cors, early } = corsFor(req, env);
  if (early) return early;
  try {
    const body = await huntMemo.get(Date.now(), async () => ({ v: JSON.stringify(await lobbyStub(env).huntRooms()) }));
    return new Response(body, {
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": `public, max-age=${HUNT_ROOMS_CACHE_SEC}` },
    });
  } catch (e) {
    console.error("hunt-rooms failed", e);
    return Response.json({ error: { code: "HUNT_ROOMS_UNAVAILABLE", message: "사냥터 인원을 불러오지 못했어요." } }, { status: 503, headers: cors });
  }
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
