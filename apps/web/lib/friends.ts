import { createHmac } from "node:crypto";
import { FRIEND_MAX, staffPublicName, type PeerWhere } from "@tomb/protocol";
import { findBan, friendHello, notifyMe, peerOf, whereOf } from "./ban";
import { env } from "./env";
import { friendCard } from "./friendCard";
import type { FriendEntry, FriendListResponse, FriendPresenceResponse, FriendRequestEntry, FriendRequestResponse, FriendWhere, FriendWhereResponse } from "./friendTypes";
import { HttpError } from "./http";
import { getHouseStore, houseIdFor, isHouseId } from "./housing/service";
import { staffAccountId } from "./staff";
import { getFriends, NO_NAME } from "./store";
import type { FriendLink, FriendLists, FriendStore } from "./store/friends";

// 친구: 라우트가 쓰는 동작. 저장은 lib/store/friends.ts, 위치는 실시간 서버(/internal/where)에 묻는다.
//  - 브라우저는 계정 id를 모른다: 친구마다 key(계정 id의 HMAC)로 가리키고, 신청은 게임 안에서 누른 사람(채널·방 + sid)을 서버가 푼다
//  - 정지된 계정은 목록·신청·수락에서 뺀다 (기록은 남겨 두어 정지가 풀리면 다시 보인다)
//  - 운영자는 다른 사람에게 공개 이름("대장")으로
//  - 위치(좌표)는 친구 사이에만 내보낸다
//  - 운영자 계정과는 친구를 맺을 수 없다 (신청·수락 모두). 지정 전에 맺어 둔 관계·신청은 읽을 때 빼고 저장소에서도 지운다
//  - 친구 한 명의 이름·위치·자랑거리를 읽다 실패해도 나머지는 보인다 (그 줄만 비운다)

/** 브라우저에 보이는 친구 가리킴 값: 계정 id의 HMAC 앞 16자 (계정 id = 쿠키 신원이라 그대로 내보내지 않는다) */
export function friendKeyFor(accountId: string): string {
  return createHmac("sha256", env.sessionSecret()).update(`friend:${accountId}`).digest("base64url").slice(0, 16);
}

const KEY_RE = /^[A-Za-z0-9_-]{16}$/;
export const isFriendKey = (key: string) => KEY_RE.test(key);

const notFound = () => new HttpError(404, "NOT_FOUND", "그 친구(신청)를 찾지 못했어요. 이미 정리됐을 수 있어요.");

/** 정지되지 않은 계정만 (캐시한 정지 색인으로 판정 — 대부분 Redis를 읽지 않는다) */
async function withoutBanned<T extends FriendLink>(links: T[], now: number): Promise<T[]> {
  const banned = await Promise.all(links.map((l) => findBan(l.id, null, { now }).then((b) => !!b)));
  return links.filter((_, i) => !banned[i]);
}

/** 읽기 하나가 실패해도(동기 throw 포함) 대신 값으로 — 친구 한 명·저장소 하나 때문에 목록 전체가 500이 되지 않게 */
async function orElse<T>(read: () => Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await read();
  } catch (e) {
    console.error(`[friends] ${what} 읽기 실패`, e);
    return fallback;
  }
}

/** 계정 id들의 표시 이름 (운영자는 "대장", 이름이 없으면 "이름 없는 유령"). 이름을 못 읽으면 그 줄만 "이름 없는 유령" */
async function namesOf(store: FriendStore, ids: string[]): Promise<string[]> {
  const [names, staffId] = await Promise.all([orElse(() => store.names(ids), [] as (string | null)[], "이름"), orElse(() => staffAccountId(), null, "운영자")]);
  return ids.map((id, i) => staffPublicName(names[i] ?? NO_NAME, !!staffId && id === staffId));
}

/** 운영자와는 친구를 맺을 수 없다 (신청·수락 모두) */
export const STAFF_FRIEND_MESSAGE = "운영자와는 친구를 맺을 수 없어요.";
const staffFriendError = () => new HttpError(403, "STAFF", STAFF_FRIEND_MESSAGE);

/** 관계들을 저장소에서 지운다 (운영자와 맺힌 것 정리). 실패해도 읽기는 이어 간다 — 다음에 읽을 때 다시 걸러진다 */
async function dropLinks(store: FriendStore, me: string, l: FriendLists): Promise<void> {
  const ok = () => undefined;
  await Promise.all([
    ...l.friends.map((f) => store.remove(me, f.id).catch(ok)),
    ...l.incoming.map((f) => store.reject(me, f.id).catch(ok)),
    ...l.outgoing.map((f) => store.cancel(me, f.id).catch(ok)),
  ]);
}

/**
 * 내 친구·받은 신청·보낸 신청에서 운영자를 뺀다 (staff = 내가 운영자라 친구 기능을 쓸 수 없다 → 모두 비운다).
 * 운영자 판정은 lib/staff (지정·해제가 바뀌면 곧바로 — 인스턴스 캐시 10초). 걸러 낸 관계는 저장소에서도 지운다
 */
export async function cleanLists(store: FriendStore, me: string, now: number): Promise<FriendLists & { staff: boolean }> {
  const [lists, staffId] = await Promise.all([store.lists(me, now), orElse(() => staffAccountId(), null, "운영자")]);
  if (!staffId) return { ...lists, staff: false };
  if (me === staffId) {
    if (lists.friends.length || lists.incoming.length || lists.outgoing.length) await dropLinks(store, me, lists);
    return { friends: [], incoming: [], outgoing: [], staff: true };
  }
  const isStaffLink = (l: FriendLink) => l.id === staffId;
  const drop: FriendLists = { friends: lists.friends.filter(isStaffLink), incoming: lists.incoming.filter(isStaffLink), outgoing: lists.outgoing.filter(isStaffLink) };
  if (drop.friends.length || drop.incoming.length || drop.outgoing.length) await dropLinks(store, me, drop);
  const keep = (l: FriendLink) => !isStaffLink(l);
  return { friends: lists.friends.filter(keep), incoming: lists.incoming.filter(keep), outgoing: lists.outgoing.filter(keep), staff: false };
}

/** 실시간 서버가 알려 준 자리 → 브라우저용 (reached = 실시간 서버에 닿았는지) */
export function toFriendWhere(w: PeerWhere | undefined, reached: boolean): FriendWhere {
  if (!reached) return { at: "unknown" };
  if (!w) return { at: "offline" };
  if (w.away) return { at: "away", ch: w.ch, sid: w.sid, place: w.place ?? null, ...(w.place === "house" && w.house ? { houseId: w.house } : {}) };
  return { at: "world", ch: w.ch, sid: w.sid, x: w.x, y: w.y };
}

/** 친구 집 id (분양받았고 숨겨지지 않았으면) */
async function houseOf(accountId: string): Promise<string | null> {
  const id = houseIdFor(accountId);
  const h = await getHouseStore().get(id);
  return h && !h.hidden ? id : null;
}

/** 내 목록에서 key가 가리키는 계정 */
function pick(list: FriendLink[], key: string): FriendLink | null {
  if (!isFriendKey(key)) return null;
  return list.find((l) => friendKeyFor(l.id) === key) ?? null;
}

/** 친구 창 정렬: 접속 중 먼저, 그다음 최근 접속 순, 같으면 이름 순 */
export function byPresence(a: FriendEntry, b: FriendEntry): number {
  const on = (f: FriendEntry) => (f.where.at === "world" || f.where.at === "away" ? 1 : 0);
  return on(b) - on(a) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.name.localeCompare(b.name, "ko");
}

/** 친구 창: 친구(지금 위치·마지막 접속·자랑거리·집)·받은 신청·보낸 신청 + 내 요약. 친구에게만 보이는 값이라 목록 API에만 싣는다 */
export async function friendList(me: string, now = Date.now()): Promise<FriendListResponse> {
  const store = getFriends();
  const lists = await cleanLists(store, me, now);
  const [friends, incoming, outgoing] = await Promise.all([withoutBanned(lists.friends, now), withoutBanned(lists.incoming, now), withoutBanned(lists.outgoing, now)]);
  const all = [...friends, ...incoming, ...outgoing];
  const ids = friends.map((f) => f.id);
  // 한 명(또는 한 저장소) 읽기가 실패해도 목록 전체가 실패하지 않게 따로따로 막는다 (그 칸만 비운다)
  const [names, where, seen, cards, mine] = await Promise.all([
    namesOf(store, all.map((l) => l.id)),
    friends.length ? orElse(() => whereOf(ids), null, "위치") : Promise.resolve<Record<string, PeerWhere>>({}),
    orElse(() => store.seenAt(ids), [] as number[], "마지막 접속"),
    Promise.all(ids.map((id) => orElse(() => friendCard(id, now), null, "자랑거리"))),
    lists.staff ? Promise.resolve(null) : orElse(() => friendCard(me, now), null, "내 요약"),
  ]);
  const nameOf = new Map(all.map((l, i) => [l.id, names[i]]));
  const req = (l: FriendLink): FriendRequestEntry => ({ key: friendKeyFor(l.id), name: nameOf.get(l.id) ?? NO_NAME, at: l.at });
  const entries: FriendEntry[] = friends.map((f, j) => ({
    key: friendKeyFor(f.id),
    name: nameOf.get(f.id) ?? NO_NAME,
    since: f.at,
    where: toFriendWhere(where?.[f.id], where !== null),
    houseId: cards[j]?.house?.id ?? null,
    lastSeen: seen[j] || null,
    ...(cards[j] ? { card: cards[j] } : {}),
  }));
  return {
    friends: entries.sort(byPresence),
    incoming: incoming.map(req),
    outgoing: outgoing.map(req),
    max: FRIEND_MAX,
    ...(mine ? { me: mine } : {}),
    ...(lists.staff ? { staff: true as const } : {}),
  };
}

/** 접속 알림·지도 하트·빨간 점 (주기적으로): 친구 이름·위치와 받은 신청 수만 */
export async function friendPresence(me: string, now = Date.now()): Promise<FriendPresenceResponse> {
  const store = getFriends();
  const lists = await cleanLists(store, me, now);
  const [friends, incoming] = await Promise.all([withoutBanned(lists.friends, now), withoutBanned(lists.incoming, now)]);
  if (!friends.length) return { friends: [], incoming: incoming.length };
  const [names, where] = await Promise.all([namesOf(store, friends.map((f) => f.id)), orElse(() => whereOf(friends.map((f) => f.id)), null, "위치")]);
  return {
    friends: friends.map((f, i) => ({ key: friendKeyFor(f.id), name: names[i], where: toFriendWhere(where?.[f.id], where !== null) })),
    incoming: incoming.length,
  };
}

/** 친구 한 명의 지금 위치 (친구한테 가기). 친구가 아니면 403 — 남의 위치는 볼 수 없다 */
export async function friendWhere(me: string, key: string, now = Date.now()): Promise<FriendWhereResponse> {
  const store = getFriends();
  // 운영자는 걸러진 목록에 없다 → 위치를 내보내지 않는다
  const f = pick((await cleanLists(store, me, now)).friends, key);
  if (!f || (await findBan(f.id, null, { now }))) throw new HttpError(403, "NOT_FRIEND", "친구만 위치를 볼 수 있어요.");
  const [[name], where, houseId] = await Promise.all([namesOf(store, [f.id]), whereOf([f.id], true), houseOf(f.id).catch(() => null)]);
  return { key, name, since: f.at, where: await withHouseCheck(toFriendWhere(where?.[f.id], where !== null)), houseId };
}

/** 친구가 집 안이면 그 집에 따라 들어갈 수 있는지 (집 방문과 같은 규칙: 없거나 운영자가 가린 집은 안 된다) */
export async function withHouseCheck(w: FriendWhere): Promise<FriendWhere> {
  if (w.at !== "away" || !w.houseId) return w;
  const h = isHouseId(w.houseId) ? await getHouseStore().get(w.houseId).catch(() => null) : null;
  if (h && !h.hidden) return w;
  return { ...w, houseBlocked: h ? "그 집은 운영자가 가려 두어 지금은 들어갈 수 없어요." : "그 집을 찾을 수 없어요. 집이 정리됐을 수 있어요." };
}

/**
 * 친구 들고 남 등록 (/api/join이 입장 토큰을 주기 직전): 친구가 있으면 실시간 서버에 "이 사람이 들어오면·나가면 이 친구들에게"를 맡긴다.
 * 이름은 친구 창과 같게 (운영자는 "대장"). 친구가 없으면 아무것도 안 한다
 */
export async function announceFriends(me: string, now = Date.now()): Promise<void> {
  const store = getFriends();
  const lists = await cleanLists(store, me, now);
  if (lists.staff) return;
  const friends = await withoutBanned(lists.friends, now);
  if (!friends.length) return;
  const [name] = await namesOf(store, [me]);
  await friendHello(me, name, friendKeyFor(me), friends.map((f) => f.id));
}

/** 친구가 새로 생기면(수락) 두 사람 모두 다시 등록한다 — 다음 입장을 기다리지 않고 지금부터 들고 남을 알리게 */
async function reannounce(ids: string[], now: number): Promise<void> {
  await Promise.all(ids.map((id) => announceFriends(id, now).catch(() => undefined)));
}

/** 받는 쪽 화면에 알린다 (빨간 점·목록을 바로 새로). 응답 뒤로 미루면 서버리스가 멈출 수 있어 기다린다(최대 2초). 실패해도 다음 주기에 맞는다 */
const nudge = (id: string) => notifyMe([id]).catch(() => null);

/**
 * 친구 신청: 게임 안에서 누른 사람(채널·방 + sid)을 실시간 서버에 물어 푼다.
 * 상대가 먼저 나에게 신청해 뒀으면 바로 친구가 된다
 */
export async function requestFriend(me: string, where: { ch: number } | { room: string }, sid: number, now = Date.now()): Promise<FriendRequestResponse> {
  const peer = await peerOf(where, sid);
  if (!peer) throw new HttpError(404, "NOT_FOUND", "그 사람을 찾지 못했어요. 이미 나갔을 수 있어요.");
  return requestFriendById(me, peer.visitorId, now);
}

/** 계정 id로 신청 (requestFriend가 sid를 푼 뒤 · 테스트) */
export async function requestFriendById(me: string, target: string, now = Date.now()): Promise<FriendRequestResponse> {
  if (target === me) throw new HttpError(400, "SELF", "나 자신에게는 친구 신청을 할 수 없어요.");
  // 운영자와는 친구를 맺을 수 없다 (운영자가 보내는 것도, 운영자에게 보내는 것도)
  const staffId = await staffAccountId();
  if (staffId && (target === staffId || me === staffId)) throw staffFriendError();
  if (await findBan(target, null, { now })) throw new HttpError(403, "BANNED_TARGET", "이용이 제한된 계정에는 친구 신청을 할 수 없어요.");
  const store = getFriends();
  const [name] = await namesOf(store, [target]);
  const r = await store.request(me, target, now);
  switch (r) {
    case "sent":
    case "accepted":
      await nudge(target);
      if (r === "accepted") await reannounce([me, target], now);
      return { result: r, name };
    case "already":
      throw new HttpError(409, "ALREADY", `${name}님과는 이미 친구예요.`);
    case "pending":
      throw new HttpError(409, "PENDING", `${name}님에게 이미 친구 신청을 보냈어요. 답을 기다려 주세요.`);
    case "full":
      throw new HttpError(409, "FULL", `친구는 ${FRIEND_MAX}명까지예요. 목록을 정리한 뒤 다시 신청해 주세요.`);
    case "their_full":
      throw new HttpError(409, "THEIR_FULL", `${name}님의 친구 목록이 가득 찼어요.`);
    case "out_full":
      throw new HttpError(409, "OUT_FULL", "답을 기다리는 신청이 너무 많아요. 보낸 신청을 조금 정리해 주세요.");
    case "in_full":
      throw new HttpError(409, "IN_FULL", `${name}님이 받은 신청이 너무 많아요. 나중에 다시 해 주세요.`);
  }
}

/** 받은 신청에 답하기 (accept=false면 거절) */
export async function answerRequest(me: string, key: string, accept: boolean, now = Date.now()): Promise<{ ok: true }> {
  const store = getFriends();
  const lists = await cleanLists(store, me, now);
  // 운영자는 신청을 받거나 답할 수 없다 (받은 신청은 이미 정리됐다)
  if (lists.staff) throw staffFriendError();
  const from = pick(lists.incoming, key);
  if (!from) throw notFound();
  if (!accept) {
    await store.reject(me, from.id);
    return { ok: true };
  }
  if (await findBan(from.id, null, { now })) throw new HttpError(403, "BANNED_TARGET", "이용이 제한된 계정이라 받을 수 없어요.");
  const r = await store.accept(me, from.id, now);
  if (r === "none") throw notFound();
  if (r === "full") throw new HttpError(409, "FULL", `친구는 ${FRIEND_MAX}명까지예요. 목록을 정리한 뒤 받아 주세요.`);
  if (r === "their_full") throw new HttpError(409, "THEIR_FULL", "상대의 친구 목록이 가득 찼어요.");
  await nudge(from.id);
  await reannounce([me, from.id], now);
  return { ok: true };
}

/** 보낸 신청 취소 */
export async function cancelRequest(me: string, key: string, now = Date.now()): Promise<{ ok: true }> {
  const store = getFriends();
  const to = pick((await cleanLists(store, me, now)).outgoing, key);
  if (!to || !(await store.cancel(me, to.id))) throw notFound();
  return { ok: true };
}

/** 친구 끊기 (양쪽에서 함께 사라진다) */
export async function removeFriend(me: string, key: string, now = Date.now()): Promise<{ ok: true }> {
  const store = getFriends();
  const f = pick((await cleanLists(store, me, now)).friends, key);
  if (!f || !(await store.remove(me, f.id))) throw notFound();
  return { ok: true };
}
