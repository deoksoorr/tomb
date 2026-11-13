import { createHmac } from "node:crypto";
import { CLOSE, INTERNAL_SIG_HEADER, INTERNAL_TTL_SEC, signInternal, WHERE_MAX_IDS, type InternalRequest, type PeerWhere } from "@tomb/protocol";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { clientIp, HttpError } from "./http";
import { isAdminIp, parseIp } from "./ipAllow";
import { staffActorName } from "./staff";
import { getBanStore, isBanActive, type BanPointer, type BanRecord, type BanStore } from "./store/bans";

// 47번 정지·IP 차단 판정과 실시간 서버 연동.
//
// 판정 위치 (비용이 싼 순서로)
//  1) 첫 화면: app/page.tsx는 원래 요청마다 서버에서 그리는 페이지라, 거기서 HMGET 한 번으로 바로 판정한다(lib/banPage.ts).
//     proxy에서 막으면 정적 파일·모든 요청마다 함수가 한 번 더 돌고 Redis도 그만큼 읽는다 → 페이지에서 한다.
//  2) 입장 토큰(/api/join): 캐시 없이 판정 (실시간 서버로 들어가는 문)
//  3) 그 밖의 모든 방문자 API(requireVisitor): 인스턴스마다 BAN_CACHE_MS 동안 색인 전체를 기억해 두고 비교한다.
//     정지가 없으면 Redis를 거의 읽지 않는다 (색인은 정지 수만큼만 크다)
// 운영자 IP(ADMIN_ALLOWED_IPS, 로컬은 루프백)에는 IP 차단을 적용하지 않는다 (계정 정지는 적용).

/** requireVisitor용 색인 캐시 유지 시간. 다른 인스턴스는 이만큼 늦게 알 수 있다 (같은 인스턴스는 바로 비운다) */
export const BAN_CACHE_MS = 20_000;

// ── IP 해시 ──

/**
 * 비교용 IP 정규형. IPv4는 그대로(IPv4-mapped IPv6 포함), IPv6는 앞 64비트(/64, 한 가정·기기 대역)만 쓴다 —
 * 같은 회선에서 주소 뒷부분만 계속 바뀌는 경우가 흔해 /128로는 차단이 쉽게 풀린다. 잘못된 값이면 null
 */
export function canonicalIp(raw: string): string | null {
  const a = parseIp(raw);
  if (!a) return null;
  if (a.v === 4) return [24, 16, 8, 0].map((s) => Number((a.n >> BigInt(s)) & BigInt(255))).join(".");
  return `${(a.n >> BigInt(64)).toString(16)}::/64`;
}

/** 비밀키 HMAC 해시 (원본 IP는 어디에도 저장하지 않는다). 관리자가 직접 입력한 IP도 이걸로 바꿔 비교한다 */
export function banIpHash(ip: string): string | null {
  const c = canonicalIp(ip);
  return c ? createHmac("sha256", env.sessionSecret()).update(`ban-ip:${c}`).digest("hex").slice(0, 32) : null;
}

export const requestIpHash = (req: NextRequest) => banIpHash(clientIp(req));

/** 운영자 IP (IP 차단 예외). 목록이 비어 있으면 로컬 개발만 루프백 */
export const isOperatorIp = (ip: string) => isAdminIp(ip, env.adminAllowedIps(), env.isProd());

// ── 판정 ──

type Cache = { at: number; idx: Map<string, BanPointer> };
const g = globalThis as typeof globalThis & { __tombBanCache?: Cache | null };

/** 정지를 바꾼 뒤 부른다 (이 인스턴스는 바로 새 색인을 읽는다) */
export function invalidateBanCache(): void {
  g.__tombBanCache = null;
}

async function cachedIndex(store: BanStore, now: number): Promise<Map<string, BanPointer>> {
  const c = g.__tombBanCache;
  if (c && now - c.at < BAN_CACHE_MS) return c.idx;
  const idx = await store.index();
  g.__tombBanCache = { at: now, idx };
  return idx;
}

/**
 * 이 계정·IP에 지금 걸린 정지. ip는 요청 원본 IP(운영자 IP면 IP 차단은 보지 않는다).
 * fresh면 색인을 바로 읽고, 아니면 캐시한 색인을 본다 (걸렸을 때만 기록을 한 번 더 읽는다)
 */
export async function findBan(
  accountId: string | null,
  ip: string | null,
  opts: { fresh?: boolean; now?: number; store?: BanStore } = {},
): Promise<BanRecord | null> {
  const store = opts.store ?? getBanStore();
  const now = opts.now ?? Date.now();
  const ipHash = ip && !isOperatorIp(ip) ? banIpHash(ip) : null;
  let ptr: BanPointer | null;
  if (opts.fresh) ptr = await store.lookup(accountId, ipHash, now);
  else {
    const idx = await cachedIndex(store, now);
    const live = (p: BanPointer | undefined) => (p && (p.until === null || p.until > now) ? p : null);
    ptr = (accountId ? live(idx.get(`a:${accountId}`)) : null) ?? (ipHash ? live(idx.get(`i:${ipHash}`)) : null);
  }
  if (!ptr) return null;
  const rec = await store.get(ptr.id);
  return rec && isBanActive(rec, now) ? rec : null;
}

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
/** 해제 예정일 문구 (영구면 "해제 예정 없음") */
export const untilText = (until: number | null) => (until === null ? "해제 예정 없음 (영구)" : `${KST.format(until)} 해제 예정`);
export const kstText = (at: number) => KST.format(at);

/** 사용자에게 보여 줄 정지 정보 (관리자 메모·대상·처리자는 빼고) */
export type BanNotice = { reason: string; startAt: number; until: number | null; ip: boolean };
export const toNotice = (r: BanRecord): BanNotice => ({ reason: r.reason, startAt: r.startAt, until: r.until, ip: r.kind !== "account" });

export const bannedError = (r: BanRecord) =>
  new HttpError(403, "BANNED", `이용이 제한됐어요. 사유: ${r.reason} · ${untilText(r.until)}`);

/** 방문자 API 공용: 정지·차단이면 403 BANNED (캐시한 색인으로 판정) */
export async function assertNotBanned(req: NextRequest, accountId: string, fresh = false): Promise<void> {
  const ban = await findBan(accountId, clientIp(req), { fresh });
  if (ban) throw bannedError(ban);
}

/** 입장할 때 계정의 접속 IP(해시)를 가볍게 남긴다. 실패해도 입장은 막지 않는다 */
export async function recordSeen(req: NextRequest, accountId: string, now = Date.now()): Promise<void> {
  const ip = clientIp(req);
  const hash = banIpHash(ip);
  if (!hash) return;
  await getBanStore()
    .seen(accountId, hash, now, isOperatorIp(ip))
    .catch((e: unknown) => console.error("[ban] 접속 IP 기록 실패", e));
}

/**
 * 처리자 이름. 관리자 키는 하나라 기본은 "관리자". 관리자 화면을 연 브라우저가 31번 운영자 계정으로 게임에 들어간 브라우저면
 * "관리자(운영자 닉네임)"으로 남긴다 (lib/staff.ts staffActorName)
 */
export async function adminActor(req: NextRequest): Promise<string> {
  const name = await staffActorName(req).catch(() => null);
  return name ? `관리자(${name})` : "관리자";
}

// ── 실시간 서버 (서버끼리) ──

/** 개발 전용: QA가 따로 띄운 실시간 서버로 내부 요청을 돌린다 (/api/dev/realtime). 운영에서는 쓰지 않는다 */
const dev = globalThis as typeof globalThis & { __tombRealtimeDevUrl?: string | null };
export function setDevRealtimeUrl(url: string | null): void {
  if (env.isProd()) return;
  dev.__tombRealtimeDevUrl = url;
}
const internalBase = () => (!env.isProd() && dev.__tombRealtimeDevUrl) || env.realtimeHttpUrl();

type WithoutExp<T> = T extends unknown ? Omit<T, "exp"> : never;

async function internal<T>(path: string, req: WithoutExp<InternalRequest>, timeoutMs = 4000): Promise<T | null> {
  try {
    const exp = Math.floor(Date.now() / 1000) + INTERNAL_TTL_SEC;
    const { body, sig } = await signInternal(env.joinSecret(), { ...req, exp } as InternalRequest);
    const res = await fetch(`${internalBase()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_SIG_HEADER]: sig },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.error(`[ban] 실시간 서버 ${path} 응답 ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`[ban] 실시간 서버 ${path} 실패`, e);
    return null;
  }
}

/** 접속 중이면 지금 내보낸다. 내보낸 연결 수, 실시간 서버에 닿지 못하면 null */
export async function kickNow(visitorIds: string[], code: typeof CLOSE.KICKED | typeof CLOSE.BANNED): Promise<number | null> {
  const ids = [...new Set(visitorIds)].slice(0, 50);
  if (!ids.length) return 0;
  const r = await internal<{ expelled: number }>("/internal/kick", { op: "kick", visitorIds: ids, code });
  return r ? r.expelled : null;
}

/** 접속 중이면 그 계정 화면에 "내 정보 새로 받기"를 보낸다 (관리자 포인트 지급 등). 보낸 연결 수, 실시간 서버에 닿지 못하면 null */
export async function notifyMe(accountIds: string[]): Promise<number | null> {
  const ids = [...new Set(accountIds)].slice(0, 50);
  if (!ids.length) return 0;
  const r = await internal<{ sent: number }>("/internal/me", { op: "me", visitorIds: ids }, 2000);
  return r ? r.sent : null;
}

/** 채널·방의 sid가 누구인지 (유저 신고). 없거나 실시간 서버에 닿지 못하면 null */
export async function peerOf(where: { ch: number } | { room: string }, sid: number): Promise<{ visitorId: string; name: string } | null> {
  const r = await internal<{ peer: { visitorId: string; name: string } | null }>("/internal/peer", { op: "peer", ...where, sid });
  return r?.peer ?? null;
}

/**
 * 친구 위치: 그 계정들이 지금 어느 채널·자리에 있는지 (접속 안 한 계정은 빠진다). 실시간 서버가 WHERE_CACHE_MS 동안 기억한 값이고,
 * fresh면 지금 다시 묻는다. 실시간 서버에 닿지 못하면 null
 */
export async function whereOf(visitorIds: string[], fresh = false): Promise<Record<string, PeerWhere> | null> {
  const ids = [...new Set(visitorIds)].slice(0, WHERE_MAX_IDS);
  if (!ids.length) return {};
  const r = await internal<{ where: Record<string, PeerWhere> }>("/internal/where", { op: "where", visitorIds: ids, ...(fresh ? { fresh: true } : {}) }, 3000);
  return r ? r.where : null;
}
