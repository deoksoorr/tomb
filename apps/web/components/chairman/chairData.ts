import { request } from "@/lib/api";
import type { ChairMode } from "@/lib/chairman/rules";
import type { ChairRankResponse, ChairStatusResponse } from "@/lib/chairman/service";

// 11/20 회장님 독대 입장 창·전광판·레이스 탭이 읽는 서버 값 (GET만 — 판 시작·끝은 game/chairman/api가 부른다).
// 상태는 1분 기억 (판이 끝나면 chairman:result를 듣고 버린다).

const TTL = 60_000;
let st: { at: number; v: ChairStatusResponse } | null = null;
let stWait: Promise<ChairStatusResponse> | null = null;

export function chairStatus(force = false): Promise<ChairStatusResponse> {
  if (!force && st && Date.now() - st.at < TTL) return Promise.resolve(st.v);
  if (!force && stWait) return stWait;
  const p = request<ChairStatusResponse>("/api/chairman/status", { cache: "no-store" }).then((v) => {
    st = { at: Date.now(), v };
    return v;
  });
  stWait = p.finally(() => {
    if (stWait === p) stWait = null;
  });
  return p;
}

export const peekStatus = (): ChairStatusResponse | null => st?.v ?? null;

/** 판이 끝났다 → 다음에 새로 받는다 */
export function dropChairStatus(): void {
  st = null;
  top1 = null;
}

export const chairRank = (mode: ChairMode) => request<ChairRankResponse>(`/api/chairman/rank?mode=${mode}`, { cache: "no-store" });

/** 전광판: 이번 주 노멀 1위 (1분 기억) */
let top1: { at: number; v: { name: string; damage: number } | null } | null = null;
export async function normalTop(): Promise<{ name: string; damage: number } | null> {
  if (top1 && Date.now() - top1.at < TTL) return top1.v;
  const fresh = st && Date.now() - st.at < TTL ? st.v.top.normal : (await chairRank("normal")).rows;
  const r = fresh[0];
  top1 = { at: Date.now(), v: r ? { name: r.name, damage: r.damage } : null };
  return top1.v;
}
