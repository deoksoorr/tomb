import { deleteImage } from "../blob";
import { env } from "../env";
import { notFound } from "../http";
import type { GraveListResponse, PublicGrave } from "../types";
import { isGraveId } from "../validate";
import { MemoryStore } from "./memory";
import { mockGraves } from "./mock";
import { RedisStore } from "./redis";
import type { GraveRecord, GraveStore } from "./types";

export type { GraveRecord, GraveStore } from "./types";

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & { __tombStore?: GraveStore };

/** Redis 환경변수가 있으면 RedisStore, 없으면 (로컬 한정) 목업을 심은 MemoryStore */
export function getStore(): GraveStore {
  if (g.__tombStore) return g.__tombStore;
  const conn = env.redis();
  if (!conn && env.isProd())
    throw new Error(
      "[store] Redis 환경변수가 없습니다. KV_REST_API_URL/KV_REST_API_TOKEN 또는 UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN을 설정하세요.",
    );
  g.__tombStore = conn ? new RedisStore(conn) : new MemoryStore(mockGraves(env.mockGraves()));
  return g.__tombStore;
}

/** 클라이언트로 내보낼 형태. ownerTokenHash·hidden은 절대 내보내지 않는다 */
export function toPublicGrave(r: GraveRecord): PublicGrave {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ownerTokenHash, hidden, ...pub } = r;
  return pub;
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
  return { graves: visible.map(toPublicGrave), reviveTop, generatedAt: now };
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

/** 데이터와 이미지(Blob 또는 로컬 업로드)를 함께 정리한다 */
export async function deleteGrave(store: GraveStore, id: string): Promise<boolean> {
  const removed = await store.remove(id);
  if (removed) await releaseImage(store, removed.imageUrl);
  return !!removed;
}
