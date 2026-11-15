import { env } from "./env";
import { MemoryManagers, RedisManagers, type ManagerRecord, type ManagerStore } from "./store/managers";

// 11/16 매니저: 관리자가 여러 명을 임명한다. 혜택은 매니저 전용 칭호(「무급 마을 반장」)와 매니저 전용 오라뿐.
// 운영자(lib/staff) 권한(관리자 기능·확성기 무료·포인트 채우기·금빛 이름 등)은 하나도 없다. 판정은 언제나 서버가 한다:
//  - 입장 토큰·착용 증서에 매니저 표시(mgr)를 이 모듈이 확인한 뒤에만 넣는다 (실시간 서버가 다른 사람 화면에 오라를 그리고 칭호를 받아 준다)
//  - 칭호는 매니저일 때만 얻은 것으로 본다 (lib/titlesServer). 해제하면 끼고 있던 칭호도 뺀다 (관리자 API)

/** 몇 명까지 임명할 수 있는지 (관리자 화면 실수 방지 — 매니저 목록은 인스턴스가 통째로 기억한다) */
export const MANAGER_MAX = 50;

/** 같은 서버 인스턴스 안에서 매니저 목록을 이만큼 기억한다 (입장마다 Redis를 더 읽지 않게). 임명·해제한 인스턴스는 바로 바뀐다 */
const CACHE_MS = 60_000;

const g = globalThis as typeof globalThis & { __tombManagers?: ManagerStore; __tombManagerCache?: { ids: ReadonlySet<string>; at: number } };

export function getManagerStore(): ManagerStore {
  const cur = g.__tombManagers;
  const conn = env.redis();
  if (conn) return cur instanceof RedisManagers ? cur : (g.__tombManagers = new RedisManagers(conn));
  if (cur instanceof MemoryManagers) return cur;
  return (g.__tombManagers = new MemoryManagers());
}

/** 지금 매니저 계정 id (CACHE_MS 동안 기억) */
export async function managerIds(now = Date.now()): Promise<ReadonlySet<string>> {
  const c = g.__tombManagerCache;
  if (c && now - c.at < CACHE_MS) return c.ids;
  const ids = new Set((await getManagerStore().list()).map((r) => r.accountId));
  g.__tombManagerCache = { ids, at: now };
  return ids;
}

/** 매니저인지 (읽기에 실패하면 아님 — 오라·칭호가 잠깐 안 보일 뿐) */
export async function isManager(accountId: string, now = Date.now()): Promise<boolean> {
  if (!accountId) return false;
  return (await managerIds(now).catch(() => new Set<string>())).has(accountId);
}

export async function listManagers(): Promise<ManagerRecord[]> {
  return getManagerStore().list();
}

/** 이 인스턴스의 기억을 지운다 (임명·해제 직후, 시험) */
export function forgetManagers(): void {
  delete g.__tombManagerCache;
}

/** 임명 (이미 매니저면 false). 이 인스턴스의 기억도 바로 바꾼다 */
export async function appointManager(accountId: string, name: string | null, now = Date.now()): Promise<boolean> {
  const added = await getManagerStore().add({ accountId, setAt: now, name });
  forgetManagers();
  return added;
}

/** 해제 (매니저가 아니었으면 false). 끼고 있던 칭호 빼기·화면 알림은 부르는 쪽(관리자 API)이 한다 */
export async function dismissManager(accountId: string): Promise<boolean> {
  const removed = await getManagerStore().remove(accountId);
  forgetManagers();
  return removed;
}
