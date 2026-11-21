import { request } from "@/lib/api";
import type { ChairMode } from "@/lib/chairman/rules";
import type { ChairHallResponse } from "@/lib/chairman/hall";
import type { ChairRankResponse, ChairStatusResponse } from "@/lib/chairman/service";
import type { BoardTops } from "./chairText";

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

/** 11/22 명예의 전당 (지난 주들 1위 — 노멀·헬 함께) */
export const chairHall = () => request<ChairHallResponse>("/api/chairman/hall");

/** 전광판·이름표: 이번 주 노멀·헬 현재 1위 (1분 기억 — 상태를 막 받았으면 그 시상대, 아니면 랭킹 응답의 leaders) */
let top1: { at: number; v: BoardTops } | null = null;
export async function boardTops(): Promise<BoardTops> {
  if (top1 && Date.now() - top1.at < TTL) return top1.v;
  const lead = (rows: { name: string; damage: number }[]) => (rows[0] ? { name: rows[0].name, damage: rows[0].damage } : null);
  const v: BoardTops = st && Date.now() - st.at < TTL ? { normal: lead(st.v.top.normal), hell: lead(st.v.top.hell) } : (await chairRank("normal")).leaders;
  top1 = { at: Date.now(), v };
  return v;
}
