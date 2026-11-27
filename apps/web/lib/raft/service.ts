import {
  campRaftOfSpot,
  GRANT_TTL_SEC,
  RAFT_DAILY_MIN,
  RAFT_NUMS,
  RAFT_REBUY_WAIT_MS,
  RAFT_RENEW_MAX,
  raftGrantMin,
  raftPriceFor,
  signGrant,
} from "@tomb/protocol";
import { campOpen } from "../camp";
import { env } from "../env";
import { parseAutoSession } from "../forage/auto";
import { getForageStore } from "../forage/store";
import { HttpError } from "../http";
import { forgetTitles } from "../titlesServer";
import { displayName, getAccounts } from "../store";
import { kstDay, loadMe } from "../store/accounts";
import type { RaftDealResponse, RaftMine, RaftSlot, RaftStatusResponse } from "./types";
import { getRaftStore, type RaftDeal, type RaftOwn } from "./store";

export type { RaftDealResponse, RaftMine, RaftSlot, RaftStatusResponse } from "./types";

// 11/27 좌대 입장권 (서버). 규칙·숫자는 protocol raft.ts, 저장은 ./store (Lua 한 번에 확인·포인트·기록).
// 웹은 사람 위치를 모른다 → 마루 막기·내려보내기는 실시간 서버가, 여기는 팔기·연장·자동 낚시 확인만.

/** 좌대 입장권을 파는 서버인가: 캠핑장이 열린 서버면 켜고, RAFT_ENABLED=0이면 끈다 (끄면 막기 표시도 토큰에 안 넣는다) */
export function raftOpen(e: Partial<Record<string, string | undefined>> = process.env): boolean {
  return campOpen(e) && e.RAFT_ENABLED?.trim() !== "0";
}

const ownMine = (own: RaftOwn | null, now: number): RaftMine | null =>
  own && own.until > now ? { ch: own.ch, n: own.n, until: own.until, renews: own.renews, renewLeft: Math.max(0, RAFT_RENEW_MAX - own.renews) } : null;

export async function raftStatus(acct: string, ch: number, now: number): Promise<RaftStatusResponse> {
  const store = getRaftStore();
  const [board, me] = await Promise.all([store.board(ch), store.mine(acct, ch, kstDay(now))]);
  const live = new Map(board.filter((h) => h.until > now).map((h) => [h.n, h]));
  const slots = RAFT_NUMS.map((n): RaftSlot => {
    const h = live.get(n);
    if (!h) return { n, state: "free" };
    return { n, state: h.acct === acct ? "mine" : "used", until: h.until, name: h.name };
  });
  const dayLeftMin = Math.max(0, RAFT_DAILY_MIN - me.used);
  const buyMin = raftGrantMin(dayLeftMin);
  const mine = ownMine(me.own, now);
  const rebuyAt = !mine && me.coolUntil > 0 && now < me.coolUntil + RAFT_REBUY_WAIT_MS ? me.coolUntil + RAFT_REBUY_WAIT_MS : null;
  return { now, ch, slots, mine, rebuyAt, dayLeftMin, buyMin, buyPrice: raftPriceFor(buyMin) };
}

const hhmm = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(11, 16);
export const RAFT_DAY_DONE_MSG = "오늘 좌대 시간을 다 썼어요. 내일 다시 와요.";

function failOf(d: Extract<RaftDeal, { ok: false }>, ch: number, n: number, now: number): HttpError {
  switch (d.why) {
    case "HAVE":
      return new HttpError(409, "RAFT_HAVE", d.ch && d.ch !== ch ? `${d.ch}채널 ${d.n}번 좌대 입장권이 이미 있어요.` : `이미 ${d.n}번 좌대 입장권이 있어요.`);
    case "WAIT":
      return new HttpError(409, "RAFT_WAIT", `좌대에서 내려온 지 얼마 안 됐어요. ${hhmm(d.until ?? now)}부터 다시 살 수 있어요.`);
    case "SOLD":
      return new HttpError(409, "RAFT_SOLD", `${n}번 좌대는 ${hhmm(d.until ?? now)}까지 사용 중이에요.`);
    case "DAY":
      return new HttpError(409, "RAFT_DAY", RAFT_DAY_DONE_MSG);
    case "POINTS":
      return new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
    case "EARLY":
      return new HttpError(409, "RAFT_EARLY", "끝나기 1분 전부터 연장할 수 있어요.");
    case "MAX":
      return new HttpError(409, "RAFT_MAX", `연장은 한 장에 ${RAFT_RENEW_MAX}번까지예요.`);
    default:
      return new HttpError(409, "RAFT_NONE", "입장권 시간이 끝났어요.");
  }
}

async function grantOf(visitorId: string, own: { ch: number; n: number; until: number }, now: number): Promise<string> {
  return signGrant(env.joinSecret(), { kind: "raft", visitorId, ch: own.ch, n: own.n, until: own.until, exp: Math.floor(now / 1000) + GRANT_TTL_SEC });
}

export async function buyRaft(acct: string, ch: number, n: number, now: number): Promise<RaftDealResponse> {
  const name = await displayName(acct, now);
  const d = await getRaftStore().buy(acct, name, ch, n, now);
  if (!d.ok) throw failOf(d, ch, n, now);
  // 칭호 「좌대 단골」·「밤낚시 장인」 진행이 바로 보이게 (칭호 사실 기억 — 이 인스턴스만)
  forgetTitles(acct);
  const [grant, status, me] = await Promise.all([grantOf(acct, { ch, n, until: d.until }, now), raftStatus(acct, ch, now), loadMe(getAccounts(), acct, now)]);
  return { me, grant, status, min: d.min, price: d.price };
}

/** 연장: 끝나기 1분 전부터, 한 장에 두 번, 오늘 남은 좌대 시간만큼 (2시간까지). 켜 둔 좌대 자동 낚시도 같이 늘린다 */
export async function renewRaft(acct: string, now: number): Promise<RaftDealResponse> {
  const store = getRaftStore();
  const d = await store.renew(acct, now);
  if (!d.ok) throw failOf(d, 0, 0, now);
  forgetTitles(acct);
  const own = (await store.mine(acct, 0, kstDay(now))).own!;
  await extendAuto(acct, own, d.until);
  const [grant, status, me] = await Promise.all([grantOf(acct, { ch: own.ch, n: own.n, until: d.until }, now), raftStatus(acct, own.ch, now), loadMe(getAccounts(), acct, now)]);
  return { me, grant, status, min: d.min, price: d.price };
}

/** 지금 입장권 증서만 다시 (재접속·채널 다시 들어옴). 이 채널 입장권이 없으면 null */
export async function raftRegrant(acct: string, ch: number, now: number): Promise<string | null> {
  const own = (await getRaftStore().mine(acct, ch, kstDay(now))).own;
  return own && own.until > now && own.ch === ch ? grantOf(acct, own, now) : null;
}

/** 개발 전용: 내 입장권을 지금 + leftMs에 끝나게 (연장 창·끝남 확인) */
export async function raftDevLeft(acct: string, leftMs: number, now: number): Promise<{ grant: string; status: RaftStatusResponse } | null> {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 기능이에요.");
  const own = await getRaftStore().devLeft(acct, leftMs, now);
  if (!own) return null;
  await extendAuto(acct, own, own.until);
  return { grant: await grantOf(acct, own, now), status: await raftStatus(acct, own.ch, now) };
}

/** 켜 둔 좌대 자동 낚시 세션의 끝을 입장권 끝으로 */
async function extendAuto(acct: string, own: { ch: number; n: number }, until: number): Promise<void> {
  const fs = getForageStore();
  for (let i = 0; i < 3; i++) {
    const raw = await fs.autoGet(acct);
    const s = parseAutoSession(raw);
    if (!raw || !s?.raft || s.raft.ch !== own.ch || s.raft.n !== own.n) return;
    if (await fs.autoSwap(acct, raw, JSON.stringify({ ...s, end: until }))) return;
  }
}

/**
 * 자동 낚시 켜기 확인: 좌대 낚시 자리면 그 채널 그 좌대 입장권이 살아 있어야 (아니면 409). 좌대가 아니면 null.
 * 좌대 입장권을 안 파는 서버(raftOpen 꺼짐)면 좌대도 보통 자리처럼 (null)
 */
export async function raftAutoGate(acct: string, spotId: string, ch: number | null, now: number): Promise<{ ch: number; n: number; until: number } | null> {
  const n = campRaftOfSpot(spotId);
  if (n === null || !raftOpen()) return null;
  const own = ch === null ? null : (await getRaftStore().mine(acct, ch, kstDay(now))).own;
  if (!own || own.ch !== ch || own.n !== n || own.until <= now) throw new HttpError(409, "RAFT_TICKET", "입장권이 있어야 이 좌대에서 낚시할 수 있어요.");
  return { ch: own.ch, n: own.n, until: own.until };
}

/** 입장 토큰: 막기 켬 + 이 채널 입장권 (토큰마다 GET 하나) */
export async function raftClaims(acct: string, ch: number, now = Date.now()): Promise<{ rafts?: true; raft?: { n: number; u: number } }> {
  if (!raftOpen()) return {};
  const own = await getRaftStore()
    .mine(acct, ch, kstDay(now))
    .then((m) => m.own)
    .catch(() => null);
  return { rafts: true, ...(own && own.ch === ch && own.until > now ? { raft: { n: own.n, u: own.until } } : {}) };
}
