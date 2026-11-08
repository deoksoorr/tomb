import { deleteImage } from "../blob";
import { env } from "../env";
import { notFound } from "../http";
import type { GraveListResponse, PublicGrave } from "../types";
import { isGraveId } from "../validate";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { MemoryStore } from "./memory";
import { mockGraves } from "./mock";
import { RedisStore } from "./redis";
import type { AccountStore, GraveRecord, GraveStore } from "./types";

export type { AccountStore, GraveRecord, GraveStore } from "./types";

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & { __tombStore?: GraveStore; __tombAccounts?: AccountStore };

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

/**
 * 클라이언트로 내보낼 형태. ownerTokenHash·hidden·ownerAccountId는 절대 내보내지 않는다.
 * 꾸미기는 만료되지 않은 것만 (없으면 필드를 뺀다)
 */
export function toPublicGrave(r: GraveRecord, now = Date.now()): PublicGrave {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ownerTokenHash, hidden, ownerAccountId, decor, ...pub } = r;
  const live = decor?.filter((d) => d.until > now);
  return live?.length ? { ...pub, decor: live } : pub;
}

/** 등록 순(오래된 것 먼저) = 격자 배치 순서 */
export const byCreated = (a: GraveRecord, b: GraveRecord) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

export async function listPublic(store: GraveStore, now = Date.now()): Promise<GraveListResponse> {
  const visible = (await store.list()).filter((r) => !r.hidden).sort(byCreated);
  const reviveTop = visible
    .filter((r) => r.revives > 0)
    .sort((a, b) => b.revives - a.revives || byCreated(a, b))
    .slice(0, 10)
    .map((r) => r.id);
  return { graves: visible.map((r) => toPublicGrave(r, now)), reviveTop, generatedAt: now };
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
  if (!url || (await store.list()).some((g) => g.imageUrl === url)) return;
  await deleteImage(url);
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
