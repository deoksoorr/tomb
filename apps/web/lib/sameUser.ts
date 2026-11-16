import { createHmac } from "node:crypto";
import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import type { NextRequest, NextResponse } from "next/server";
import { canonicalIp, requestIpHash } from "./ban";
import { env } from "./env";
import { addDays, gameDay } from "./gameDay";
import { clientIp } from "./http";
import { parseIp } from "./ipAllow";
import { mergeReasons, SAME_CLUSTER_MIN, SAME_TIME_WINDOW_MS, type LinkedAccount, type MemberLinks } from "./sameUserRules";
import { staffAccountId } from "./staff";
import { getAccounts } from "./store";
import { getBanStore } from "./store/bans";
import { K } from "./store/keys";
import { getSignals, type SeenHash, type SignalKind } from "./store/signals";
import { getActivity, MemoryActivity } from "./store/userActivity";

// 같은 사람(여러 계정) 판정에 쓰는 신호 모으기·비교 (규칙·점수는 lib/sameUserRules.ts).
// 원본 IP·기기 표시·브라우저 정보는 저장하지 않는다. 모두 서버 비밀값 HMAC으로 바꿔 lib/store/signals.ts 색인에 90일 남긴다.
//  - 같은 IP: 정지 저장소의 계정별 최근 접속 IP 해시(ban:ips, 30일)와 IP별 계정(ban:ipacct)을 그대로 쓴다
//  - 같은 대역(net): IPv4 앞 24비트, IPv6 앞 48비트 (IPv6 같은 IP는 이미 /64로 본다 — lib/ban.ts canonicalIp)
//  - 기기 표시(dev): 첫 방문에 만든 무작위 값. 쿠키(tdev, 「새로 시작」·로그아웃에도 지우지 않는다)와 localStorage 두 곳에서 온다
//  - 브라우저 환경(fp): 화면이 UA·플랫폼·언어·시간대·화면 크기·배율·코어 수를 묶어 해시한 값 (같은 기종이면 겹칠 수 있어 약한 신호)
//  - 시간: 추천인이 같은 대역에서 접속한 지 3시간 안에 가입 / 활동한 날: 새 이웃이 추천인이 접속한 날에만 들어옴
//  - 무리: 추천인이 데려온 다른 이웃 둘 이상과 기기·IP·대역이 겹침
// 사용자끼리 포인트를 주고받는 길은 없어서 포인트 흐름 신호는 쓰지 않는다

export const DEVICE_COOKIE = "tdev";
export const DEVICE_HEADER = "x-tomb-dev";
export const FP_HEADER = "x-tomb-fp";
const DEV_RE = /^[A-Za-z0-9_-]{16,64}$/;
const FP_RE = /^[0-9a-f]{64}$/;
/** 기기 표시 쿠키 기간 (브라우저 상한 400일) */
const DEVICE_COOKIE_MAX_AGE = 400 * 86_400;

const hmac = (tag: string, v: string) => createHmac("sha256", env.sessionSecret()).update(`${tag}:${v}`).digest("hex").slice(0, 32);

/** IP 대역 (IPv4 /24, IPv6 /48). 잘못된 값이면 null */
export function ipNet(raw: string): string | null {
  const a = parseIp(raw);
  if (!a) return null;
  return a.v === 4 ? `4:${(a.n >> BigInt(8)).toString(16)}` : `6:${(a.n >> BigInt(80)).toString(16)}`;
}

/** 요청에서 읽은 신호 (모두 해시) */
export type RequestSignals = { ip: string | null; net: string | null; devs: string[]; fp: string | null };

/** device = 이 응답에서 새로 붙인 기기 표시 쿠키 값 (요청에는 아직 없다) */
export function requestSignals(req: NextRequest, device?: string): RequestSignals {
  const raw = clientIp(req);
  const net = canonicalIp(raw) ? ipNet(raw) : null;
  const ids = [req.cookies.get(DEVICE_COOKIE)?.value, req.headers.get(DEVICE_HEADER), device].filter((v): v is string => !!v && DEV_RE.test(v));
  const fp = req.headers.get(FP_HEADER);
  return {
    ip: requestIpHash(req),
    net: net ? hmac("net", net) : null,
    devs: [...new Set(ids)].map((v) => hmac("dev", v)),
    fp: fp && FP_RE.test(fp) ? hmac("fp", fp) : null,
  };
}

/**
 * 기기 표시 쿠키를 붙인다 (세션 발급 때). 이미 있으면 그대로 기간만 늘리고, 없으면 화면이 보낸 localStorage 값, 그것도 없으면 새로 만든다.
 * 계정 쿠키와 따로라 「새로 시작」(새 계정)이나 로그아웃에도 남는다
 */
export function setDeviceCookie(req: NextRequest, res: NextResponse): string {
  const have = req.cookies.get(DEVICE_COOKIE)?.value;
  const header = req.headers.get(DEVICE_HEADER);
  const value = have && DEV_RE.test(have) ? have : header && DEV_RE.test(header) ? header : nanoid(24);
  res.cookies.set(DEVICE_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: env.isProd(), path: "/", maxAge: DEVICE_COOKIE_MAX_AGE });
  return value;
}

// 같은 계정·같은 값은 이 인스턴스에서 10분에 한 번만 적는다 (입장·세션마다 쓰지 않게)
const RECORD_EVERY_MS = 10 * 60_000;
const gm = globalThis as typeof globalThis & { __tombSigSeen?: Map<string, number>; __tombSigRedis?: Redis };
const seenMemo = () => (gm.__tombSigSeen ??= new Map());

/** 계정의 신호를 남긴다 (세션 발급·입장·추천인 정하기). device = 세션 발급에서 방금 붙인 기기 표시. 실패해도 부른 쪽은 그대로 */
export async function recordSignals(req: NextRequest, accountId: string, now = Date.now(), device?: string): Promise<void> {
  try {
    const s = requestSignals(req, device);
    const items: [SignalKind, string][] = [...s.devs.map((h): [SignalKind, string] => ["dev", h]), ...(s.fp ? [["fp", s.fp] as [SignalKind, string]] : []), ...(s.net ? [["net", s.net] as [SignalKind, string]] : [])];
    const memo = seenMemo();
    const store = getSignals();
    await Promise.all(
      items.map(([kind, h]) => {
        const key = `${accountId}|${kind}|${h}`;
        if ((memo.get(key) ?? 0) > now) return undefined;
        memo.set(key, now + RECORD_EVERY_MS);
        return store.record(accountId, kind, h, now);
      }),
    );
    if (memo.size > 20_000) for (const [k, until] of memo) if (until <= now) memo.delete(k);
  } catch (e) {
    console.error("[sameUser] 신호 기록 실패", e);
  }
}

// ── 비교 ──

type Markers = { ips: Set<string>; nets: SeenHash[]; devs: Set<string>; fps: Set<string> };

async function markersOf(ids: readonly string[], now: number): Promise<Markers[]> {
  const sig = getSignals();
  const [ips, nets, devs, fps] = await Promise.all([
    getBanStore().accountIpsMany(ids, now),
    sig.hashesOf("net", ids, now),
    sig.hashesOf("dev", ids, now),
    sig.hashesOf("fp", ids, now),
  ]);
  return ids.map((_, i) => ({
    ips: new Set(ips[i].map((x) => x.ipHash)),
    nets: nets[i],
    devs: new Set(devs[i].map((x) => x.hash)),
    fps: new Set(fps[i].map((x) => x.hash)),
  }));
}

const meets = (a: Iterable<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/** 게임 날짜마다 그날 활동했는지 (ids × days). Redis는 SISMEMBER 파이프라인 한 번 */
async function activeOn(ids: readonly string[], days: readonly string[]): Promise<boolean[][]> {
  const act = getActivity();
  if (act instanceof MemoryActivity) {
    const sets = await act.daySets(days);
    return ids.map((id) => days.map((d) => sets.get(d)?.has(id) ?? false));
  }
  const conn = env.redis();
  if (!conn) return ids.map(() => days.map(() => false));
  const redis = (gm.__tombSigRedis ??= new Redis({ ...conn, automaticDeserialization: false }));
  const p = redis.pipeline();
  for (const id of ids) for (const d of days) p.sismember(K.actDay(d), id);
  const r = await p.exec<unknown[]>();
  return ids.map((_, i) => days.map((__, j) => Number(r[i * days.length + j]) === 1));
}

export type AssessOptions = {
  /** 추천인을 정할 때의 요청 신호 (가입 IP·대역) */
  signup?: Pick<RequestSignals, "ip" | "net"> | null;
  /** 새 이웃이 처음 들어온 시각 (시간 신호 — 추천인을 정할 때만 의미가 있다) */
  createdAt?: number;
  /** 활동한 날 무늬 (조건 달성 때) */
  days?: boolean;
  /** 추천인이 데려온 다른 이웃 (무리 신호) */
  siblings?: readonly string[];
  /** 앞서 남긴 이유 (합친다) */
  stored?: readonly string[];
};

/**
 * 새 이웃(a)과 추천인(b)이 같은 사람인지 신호를 모아 이유 코드 목록을 돌려준다 (점수·단계는 sameUserRules).
 * 무리 신호가 나오면 겹친 이웃 id도 cluster 이유에 담는다 (부른 쪽이 그 이웃들의 기록에도 남긴다)
 */
export async function assessPair(a: string, b: string, now: number, o: AssessOptions = {}): Promise<string[]> {
  const others = (o.siblings ?? []).filter((x) => x !== a && x !== b);
  const marks = await markersOf([a, b, ...others], now);
  const [ma, mb] = marks;
  const out: string[] = [];
  const signupIp = o.signup?.ip ?? null;
  if (signupIp && mb.ips.has(signupIp)) out.push("ipSignup");
  else if (meets(ma.ips, mb.ips)) out.push("ip");
  const aNets = new Set([...ma.nets.map((x) => x.hash), ...(o.signup?.net ? [o.signup.net] : [])]);
  const bNets = new Set(mb.nets.map((x) => x.hash));
  const sameNet = meets(aNets, bNets);
  if (sameNet) out.push("net");
  if (meets(ma.devs, mb.devs)) out.push("dev");
  if (meets(ma.fps, mb.fps)) out.push(sameNet || out.includes("ip") || out.includes("ipSignup") ? "fpNet" : "fp");
  if (o.createdAt && mb.nets.some((x) => aNets.has(x.hash) && x.lastAt >= o.createdAt! - SAME_TIME_WINDOW_MS)) out.push("time");
  if (o.days) {
    const days = Array.from({ length: 30 }, (_, i) => addDays(gameDay(now), -i));
    const [da, db] = await activeOn([a, b], days);
    const mine = days.filter((_, i) => da[i]);
    if (mine.length >= 3 && days.every((_, i) => !da[i] || db[i])) out.push("days");
  }
  if (others.length) {
    const aNet = new Set(ma.nets.map((x) => x.hash));
    const hit = others.filter((_, i) => {
      const m = marks[i + 2];
      return meets(m.devs, ma.devs) || meets(m.ips, ma.ips) || meets(m.nets.map((x) => x.hash), aNet);
    });
    if (hit.length >= SAME_CLUSTER_MIN) out.push(`cluster:${hit.join(".")}`);
  }
  return mergeReasons(o.stored ?? [], out);
}

// ── 관리자 회원 목록: 같은 IP·같은 기기 계정 ──

/**
 * 계정마다 같은 IP(최근 30일 접속 기록)·같은 기기(90일)로 들어온 다른 계정 전부. 한 페이지를 한 번에:
 * 계정별 IP·기기 해시 읽기 파이프라인 1번 + 해시별 계정 읽기 파이프라인 1번 (각각). 이름은 names에 없으면 한 번에 읽는다. 운영자도 빼지 않고 표시한다
 */
export async function memberLinks(ids: readonly string[], now = Date.now(), names?: ReadonlyMap<string, string | null>): Promise<Map<string, MemberLinks>> {
  const out = new Map<string, MemberLinks>();
  if (!ids.length) return out;
  const bans = getBanStore();
  const sig = getSignals();
  const [ipsOf, devsOf, staffId] = await Promise.all([bans.accountIpsMany(ids, now), sig.hashesOf("dev", ids, now), staffAccountId(now).catch(() => null)]);
  const ipHashes = [...new Set(ipsOf.flat().map((x) => x.ipHash))];
  const devHashes = [...new Set(devsOf.flat().map((x) => x.hash))];
  const [byIp, byDev] = await Promise.all([bans.ipAccountsMany(ipHashes, now), sig.accountsOf("dev", devHashes, now)]);
  const ipMap = new Map(ipHashes.map((h, i) => [h, byIp[i].map((x) => x.accountId)]));
  const devMap = new Map(devHashes.map((h, i) => [h, byDev[i].map((x) => x.accountId)]));
  const raw = ids.map((id, i) => ({
    id,
    ip: [...new Set(ipsOf[i].flatMap((x) => ipMap.get(x.ipHash) ?? []))].filter((x) => x !== id),
    dev: [...new Set(devsOf[i].flatMap((x) => devMap.get(x.hash) ?? []))].filter((x) => x !== id),
  }));
  const need = [...new Set(raw.flatMap((r) => [...r.ip, ...r.dev]))].filter((x) => !names?.has(x));
  const read = need.length ? await getAccounts().summaries(need) : [];
  const readNames = new Map(need.map((x, i) => [x, read[i]?.name ?? null]));
  const linked = (x: string): LinkedAccount => ({ accountId: x, name: (names?.get(x) ?? readNames.get(x)) ?? null, ...(x === staffId ? { staff: true as const } : {}) });
  for (const r of raw) out.set(r.id, { ip: r.ip.map(linked), device: r.dev.map(linked) });
  return out;
}
