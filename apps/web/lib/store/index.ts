import { styleItemId } from "@tomb/protocol";
import { deleteImage } from "../blob";
import type { EarnSource } from "../economy";
import { env } from "../env";
import { HttpError, notFound } from "../http";
import type { Grave, GraveListResponse, Me, PublicGrave } from "../types";
import { kstDay, loadMe } from "./accounts";
import { isGraveId } from "../validate";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { MemoryStore } from "./memory";
import { mockGraves } from "./mock";
import { MemoryNotices, RedisNotices, type NoticeStore } from "./notices";
import { RedisStore } from "./redis";
import type { AccountStore, GraveRecord, GraveStore } from "./types";

export type { AccountStore, GraveRecord, GraveStore } from "./types";

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & {
  __tombStore?: GraveStore;
  __tombAccounts?: AccountStore;
  __tombNotices?: NoticeStore;
};

/** Redis 환경변수가 있으면 RedisStore, 없으면 (로컬 한정) 목업을 심은 MemoryStore */
export function getStore(): GraveStore {
  const cur = g.__tombStore;
  const conn = env.redis();
  if (conn) return cur instanceof RedisStore ? cur : (g.__tombStore = new RedisStore(conn));
  if (env.isProd())
    throw new Error(
      "[store] Redis 환경변수가 없습니다. KV_REST_API_URL/KV_REST_API_TOKEN 또는 UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN을 설정하세요.",
    );
  if (cur instanceof MemoryStore) return cur;
  // 처음이면 목업을 심는다. HMR로 MemoryStore 코드가 바뀌면 옛 인스턴스에는 새 메서드가 없으므로
  // 데이터(필드)만 새 클래스 인스턴스로 옮긴다 → 로컬에서 세운 묘비를 잃지 않는다
  g.__tombStore = cur ? Object.assign(new MemoryStore(), cur) : new MemoryStore(mockGraves(env.mockGraves()));
  return g.__tombStore;
}

/** 계정 저장소 (묘비 저장소와 같은 백엔드). 로컬 계정은 꾸미기를 놓을 때 MemoryStore를 같이 바꾼다 */
export function getAccounts(): AccountStore {
  const cur = g.__tombAccounts;
  const conn = env.redis();
  if (conn) return cur instanceof RedisAccounts ? cur : (g.__tombAccounts = new RedisAccounts(conn));
  getStore(); // 운영에서 Redis가 없으면 여기서 실패한다
  if (cur instanceof MemoryAccounts) return cur;
  const fresh = new MemoryAccounts(() => getStore() as MemoryStore);
  g.__tombAccounts = cur ? Object.assign(fresh, cur, { graves: () => getStore() as MemoryStore }) : fresh;
  return g.__tombAccounts;
}

// ── 계정 포인트 공용 함수 (사냥터·하우징 등 다른 기능이 쓴다) ──

/**
 * 포인트 적립. 항목별 하루 한도(EARN_RULES)·하루 전체 한도·지갑 한도 안에서만 쌓이고, 한 번에 원자적으로 반영된다.
 * amount를 주지 않으면 항목 기본 점수. ip(= session.ts ipHash(req))를 주면 같은 IP의 그 항목 하루 합계도
 * 항목 한도 × ATTEND_ACCOUNTS_PER_IP로 막는다 (계정 여러 개로 농사 방지).
 * 모은 포인트(lifetimePoints)·포인트 랭킹도 같이 오른다. earned = 실제로 쌓인 점수 (한도면 0).
 */
export async function earnPoints(
  accountId: string,
  source: EarnSource,
  amount?: number,
  ip?: string,
): Promise<{ earned: number; me: Me }> {
  const accounts = getAccounts();
  const now = Date.now();
  const earned = await accounts.earn(accountId, source, kstDay(now), { amount, ipHash: ip });
  return { earned, me: await loadMe(accounts, accountId, now) };
}

/**
 * 포인트 쓰기 (원자적: 잔액 확인과 차감이 한 번에, 동시에 불러도 음수가 되지 않는다).
 * 모자라면 409 NOT_ENOUGH_POINTS를 던진다 (라우트 handler가 그대로 응답한다). reason은 계정의 최근 사용 기록에 남는다.
 */
export async function spendPoints(accountId: string, amount: number, reason: string): Promise<Me> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`[points] 잘못된 사용량 ${amount}`);
  const accounts = getAccounts();
  const now = Date.now();
  if ((await accounts.spend(accountId, amount, reason, now)) === null)
    throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  return loadMe(accounts, accountId, now);
}

/**
 * 포인트 돌려주기 (되팔기·결제 뒤 실패 보상). 적립이 아니라서 하루 적립 한도·모은 포인트·랭킹과 무관하고,
 * 지갑 상한에서 잘린다. reason은 계정의 최근 사용 기록에 남는다.
 */
export async function refundPoints(accountId: string, amount: number, reason: string): Promise<Me> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`[points] 잘못된 환불량 ${amount}`);
  const accounts = getAccounts();
  const now = Date.now();
  await accounts.refund(accountId, amount, reason, now);
  return loadMe(accounts, accountId, now);
}

/** 공지사항 저장소 (묘비 저장소와 같은 백엔드) */
export function getNotices(): NoticeStore {
  const cur = g.__tombNotices;
  const conn = env.redis();
  if (conn) return cur instanceof RedisNotices ? cur : (g.__tombNotices = new RedisNotices(conn));
  getStore(); // 운영에서 Redis가 없으면 여기서 실패한다
  if (cur instanceof MemoryNotices) return cur;
  g.__tombNotices = cur ? Object.assign(new MemoryNotices(), cur) : new MemoryNotices();
  return g.__tombNotices;
}

/**
 * 클라이언트로 내보낼 형태. ownerTokenHash·hidden·ownerAccountId는 절대 내보내지 않는다.
 * 채널은 항상 넣고(예전 묘비는 1), 꾸미기는 만료되지 않은 것만 (없으면 필드를 뺀다)
 */
export function toPublicGrave(r: Grave & { flowers: number; revives: number }, now = Date.now()): PublicGrave {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ownerTokenHash, hidden, ownerAccountId, decor, channel, ...rest } = r;
  const pub = { ...rest, channel: channel ?? 1 };
  const live = decor?.filter((d) => d.until > now);
  return live?.length ? { ...pub, decor: live } : pub;
}

/** 등록 순(오래된 것 먼저) = 격자 배치 순서 */
export const byCreated = (a: GraveRecord, b: GraveRecord) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** 한 채널의 묘지: 그 채널 묘비만, 랭킹(reviveTop)도 그 채널 안에서 */
export async function listPublic(store: GraveStore, channel: number, now = Date.now()): Promise<GraveListResponse> {
  const visible = (await store.list(channel)).filter((r) => !r.hidden).sort(byCreated);
  const reviveTop = visible
    .filter((r) => r.revives > 0)
    .sort((a, b) => b.revives - a.revives || byCreated(a, b))
    .slice(0, 10)
    .map((r) => r.id);
  return { channel, graves: visible.map((r) => toPublicGrave(r, now)), reviveTop, generatedAt: now };
}

/**
 * 묘비 저장. 유료 디자인으로 바꾸는 경우(spendStyle)에는 accountId의 가방에서 디자인권 1개를
 * 저장과 같은 원자적 연산으로 쓴다. 가방에 없으면 저장하지 않고 409 NO_ITEM
 */
export async function saveGrave(
  store: GraveStore,
  accounts: AccountStore,
  accountId: string,
  grave: Grave,
  spendStyle: boolean,
): Promise<void> {
  const itemId = spendStyle && grave.style ? styleItemId(grave.style) : null;
  if (!itemId) return store.put(grave);
  if (!(await accounts.putGraveUsing(accountId, itemId, grave)))
    throw new HttpError(409, "NO_ITEM", "가방에 그 묘비 디자인권이 없어요. 상점에서 먼저 사 주세요.");
}

/** 공개 조회·반응용. 없거나 숨겨진 묘비는 404 */
export async function findVisible(store: GraveStore, id: string): Promise<GraveRecord> {
  const g = isGraveId(id) ? await store.get(id) : null;
  if (!g || g.hidden) throw notFound();
  return g;
}

/**
 * 묘비에서 떨어진 이미지를 지운다. 다른 묘비가 아직 같은 주소를 쓰고 있으면 남겨 둔다
 * (업로더 폴더 검사에 더한 2차 방어. 목록 조회 1회라 삭제·교체처럼 드문 경로에서만 쓴다).
 */
export async function releaseImage(store: GraveStore, url: string | undefined): Promise<void> {
  if (!url || (await store.listAll()).some((g) => g.imageUrl === url)) return;
  await deleteImage(url);
}

// ── 성황당 (주인의 이장은 30일 보관, 관리자 삭제는 아래 deleteGrave로 완전 삭제) ──

/** 만료된 성황당 묘비를 limit개까지 완전히 지운다 (이미지 포함). 이장·성황당 요청과 관리자 목록에서 조금씩 부른다 */
export async function sweepShrine(store: GraveStore, now = Date.now(), limit = 20): Promise<number> {
  const purged = await store.purgeShrine(now, limit);
  for (const g of purged) await releaseImage(store, g.imageUrl);
  return purged.length;
}

/**
 * 주인의 이장: 목록·채널·랭킹에서 빼고 성황당(이장한 계정 몫)에 SHRINE_KEEP_DAYS 동안 모신다.
 * 세운 계정이 있으면 그 계정, 없으면(계정 개편 전 묘비) 이장한 사람의 성황당. 없으면 false
 */
export async function moveToShrine(
  store: GraveStore,
  accounts: AccountStore,
  grave: Pick<Grave, "id" | "ownerAccountId">,
  requesterId: string,
  now = Date.now(),
): Promise<boolean> {
  const keeper = grave.ownerAccountId ?? requesterId;
  if (!(await store.toShrine(grave.id, keeper, now))) return false;
  if (grave.ownerAccountId) await accounts.removeGrave(grave.ownerAccountId, grave.id);
  await sweepShrine(store, now);
  return true;
}

/** 데이터·이미지(Blob 또는 로컬 업로드)·세운 계정의 묘비 목록을 함께 정리한다 */
export async function deleteGrave(store: GraveStore, id: string, accounts = getAccounts()): Promise<boolean> {
  const removed = await store.remove(id);
  if (!removed) return false;
  await Promise.all([
    releaseImage(store, removed.imageUrl),
    removed.ownerAccountId ? accounts.removeGrave(removed.ownerAccountId, id) : undefined,
  ]);
  return true;
}
