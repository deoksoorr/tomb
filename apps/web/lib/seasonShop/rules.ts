import { seasonSetDef } from "@tomb/protocol";
import { gameDay } from "../gameDay";
import { titleDef } from "../titles";
import { SEASON_DROPS, SEASON_PREVIEW_MS, SEASON_PREVIEW_ROUNDS, type SeasonDrop, type SeasonKind } from "./schedule";

// 11/19 기간 한정 노점 판정 (순수 — 판매 창과 서버가 같이 쓴다). 일정은 schedule.ts
//  hidden = 아직 안 보임 (풀리기 한 주 전보다 이르고, 다음 두 차례도 아니다) · soon = 판매 예정 (미리보기만) · on = 판매 중 · ended = 판매 끝 (산 것은 그대로)

export type SaleState = "hidden" | "soon" | "on" | "ended";

/** 묶음 하나의 지금 상태 */
export function dropState(d: Pick<SeasonDrop, "start" | "saleEnd">, now: number): SaleState {
  if (now >= d.saleEnd) return "ended";
  if (now >= d.start) return "on";
  if (now >= d.start - SEASON_PREVIEW_MS) return "soon";
  return "hidden";
}

/** 앞으로 풀릴 차례 중 가장 가까운 SEASON_PREVIEW_ROUNDS개의 시작 시각 (그 노점 것만) */
function nextRounds(kind: SeasonKind, now: number, drops: readonly SeasonDrop[]): Set<number> {
  const starts = [...new Set(drops.filter((d) => d.kind === kind && d.start > now).map((d) => d.start))].sort((a, b) => a - b);
  return new Set(starts.slice(0, SEASON_PREVIEW_ROUNDS));
}

/** 묶음 상태 + 11/20 다음 두 차례는 한 주 전이 아니어도 판매 예정 */
function viewState(d: SeasonDrop, now: number, rounds: Set<number>): SaleState {
  const s = dropState(d, now);
  return s === "hidden" && rounds.has(d.start) ? "soon" : s;
}

/** 같은 물건이 여러 묶음에 있으면 (다음 해 다시 파는 등) 판매 중 → 판매 예정 → 안 보임 → 끝 순으로 고른다 */
const RANK: Record<SaleState, number> = { on: 0, soon: 1, hidden: 2, ended: 3 };

/** 그 물건의 지금 판매 상태와 묶음 (일정에 없으면 null) */
export function itemSale(kind: SeasonKind, id: string, now: number, drops: readonly SeasonDrop[] = SEASON_DROPS): { state: SaleState; drop: SeasonDrop } | null {
  let best: { state: SaleState; drop: SeasonDrop } | null = null;
  const rounds = nextRounds(kind, now, drops);
  for (const d of drops) {
    if (d.kind !== kind || !d.items.includes(id)) continue;
    const state = viewState(d, now, rounds);
    if (!best || RANK[state] < RANK[best.state]) best = { state, drop: d };
  }
  return best;
}

/** 판매 창 묶음 (세트별): 물건마다 풀리는 시각·판매 끝 */
export type SeasonGroup = {
  set: string;
  setName: string;
  state: "on" | "soon";
  /** 묶음에서 가장 이른 시작 (판매 예정 문구) · 가장 이른 판매 끝 (판매 종료 문구) */
  start: number;
  saleEnd: number;
  items: { id: string; start: number; saleEnd: number }[];
};

/**
 * 판매 창에 보일 것: 판매 중·판매 예정 칸 (세트별로 묶는다, 일정 순서). has(id) = 정의가 있는 물건만 (아직 안 들어온 id는 빠진다).
 * 판매 중인 물건은 판매 예정 칸에 다시 나오지 않는다
 */
export function shopView(kind: SeasonKind, now: number, has: (id: string) => boolean = () => true, drops: readonly SeasonDrop[] = SEASON_DROPS): { on: SeasonGroup[]; soon: SeasonGroup[] } {
  const out = { on: [] as SeasonGroup[], soon: [] as SeasonGroup[] };
  const seen = new Set<string>();
  const rounds = nextRounds(kind, now, drops);
  for (const want of ["on", "soon"] as const)
    for (const d of drops) {
      if (d.kind !== kind || viewState(d, now, rounds) !== want) continue;
      const items = d.items.filter((id) => has(id) && !seen.has(id));
      if (!items.length) continue;
      for (const id of items) seen.add(id);
      const list = out[want];
      let g = list.find((x) => x.set === d.set && (want === "on" || x.start === d.start));
      if (!g) {
        g = { set: d.set, setName: d.setName, state: want, start: d.start, saleEnd: d.saleEnd, items: [] };
        list.push(g);
      }
      g.start = Math.min(g.start, d.start);
      g.saleEnd = Math.min(g.saleEnd, d.saleEnd);
      for (const id of items) g.items.push({ id, start: d.start, saleEnd: d.saleEnd });
    }
  return out;
}

/** 다음에 풀릴 묶음 시작 (지금보다 뒤, 없으면 null) — 빈 노점 안내 */
export function nextStart(kind: SeasonKind, now: number, drops: readonly SeasonDrop[] = SEASON_DROPS): number | null {
  let t: number | null = null;
  for (const d of drops) if (d.kind === kind && d.start > now && (t === null || d.start < t)) t = d.start;
  return t;
}

// ── 문구 ──

const ymdUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));

/** now에서 at까지 남은 게임 날짜 수 (새벽 5시 경계, 최소 1) */
export function daysUntil(at: number, now: number): number {
  return Math.max(1, Math.round((ymdUtc(gameDay(at)) - ymdUtc(gameDay(now))) / 86_400_000));
}

/** 판매 중: 「판매 종료까지 N일」 */
export const endText = (saleEnd: number, now: number) => `판매 종료까지 ${daysUntil(saleEnd, now)}일`;
/** 11/20 판매 예정: 값도 판매 시작 때 같이 공개한다 (운영자가 고른 문구 「N일 뒤 가격 공개와 판매」 — 그대로 둘 것) */
export const soonText = (start: number, now: number) => `${daysUntil(start, now)}일 뒤 가격 공개와 판매`;

/** 마지막 글자에 받침이 있는지 (한글이 아니면 없다고 본다) */
export function batchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0;
}

/** 한 벌 덤 안내 (코디 세트 — protocol SEASON_SETS. 정의가 없으면 빈 문자열) */
export function setBonusText(set: string): string {
  const s = seasonSetDef(set);
  if (!s) return "";
  const title = titleDef(s.title)?.name;
  const head = title ? `칭호 「${title}」${batchim(title) ? "과" : "와"} 꾸미기 점수 +${s.look}점` : `꾸미기 점수 +${s.look}점`;
  // fx가 「다 입으면 …」으로 시작하면 앞말과 겹치지 않게 한 문장으로 잇는다
  const fx = s.fx.replace(/^다 입으면\s*/, "");
  return fx !== s.fx ? `한 벌을 다 입으면 ${head}을 받고, ${fx}` : `한 벌을 다 입으면 ${head}을 받아요. ${s.fx}`.trim();
}

// ── 서버 거절 규칙 ──

export type SaleRefusal = { status: 400 | 409; code: "NOT_SOLD" | "SEASON_SOON" | "SEASON_ENDED"; message: string };

/** 지금 살 수 있는지 (null = 살 수 있다). 일정에 없거나 아직 안 보이는 물건·판매 예정·판매 끝은 거절 */
export function saleRefusal(kind: SeasonKind, id: string, now: number, drops: readonly SeasonDrop[] = SEASON_DROPS): SaleRefusal | null {
  const s = itemSale(kind, id, now, drops);
  if (!s || s.state === "hidden") return { status: 400, code: "NOT_SOLD", message: "지금 이 노점에서 팔지 않는 물건이에요." };
  if (s.state === "soon") return { status: 409, code: "SEASON_SOON", message: `아직 판매 전이에요. ${daysUntil(s.drop.start, now)}일 뒤부터 살 수 있어요.` };
  if (s.state === "ended") return { status: 409, code: "SEASON_ENDED", message: "판매가 끝난 물건이에요. 이미 산 것은 그대로 쓸 수 있어요." };
  return null;
}
