import { ApiRequestError, request } from "@/lib/api";
import { chairSealOrder, chairSealPool, chairTimePoints, type ChairMode } from "@/lib/chairman/rules";
import { skillById, type SkillId } from "@/lib/rpg/catalog";

// 11/20 회장님 독대 서버 호출 (app/api/chairman/*) — 화면에서 서버를 부르는 곳은 여기 하나.
// 개발 서버에서만: 주소에 ?chairStub=1 이 있거나 API가 아직 없으면(404) 가짜 응답으로 판을 돌린다 (운영 빌드에서는 꺼진다).

export type ChairStartRes = {
  ticket: string;
  seed: number;
  mode: ChairMode;
  practice: boolean;
  startedAt: number;
  sealPool?: string[];
  remaining: { normal: number; hell: number };
  curve?: unknown;
  /** 11/22 오늘 시작 전 나가기로 판을 돌려받을 수 있다 (옛 서버는 없음) */
  refundLeft?: 0 | 1;
};
/** 11/22 시작 전 나가기 결과 */
export type ChairAbortRes = { ok: boolean; refunded: boolean; remaining: { normal: number; hell: number }; refundLeft: 0 | 1 };
export type ChairFinishRes = {
  ok: boolean;
  damage: number;
  points: number;
  pointsReason?: string;
  newBest: boolean;
  best: number;
  weekRank: number | null;
  remaining: { normal: number; hell: number };
};
/** 판 상태 (모양은 서버를 따른다 — 여기서는 내 최고 기록만 읽는다) */
export type ChairStatusRes = Record<string, unknown>;

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

const DEV = process.env.NODE_ENV !== "production";
const stubOn = () => DEV && typeof location !== "undefined" && /[?&]chairStub=1/.test(location.search);
const missing = (e: unknown) => DEV && e instanceof ApiRequestError && e.status === 404;

/** 상태 응답에서 그 모드 내 최고 기록 */
export function bestOf(st: ChairStatusRes | null, mode: ChairMode): number {
  if (!st) return 0;
  const b = st.best as Record<string, unknown> | number | undefined;
  if (typeof b === "number") return b;
  if (b && typeof b[mode] === "number") return b[mode] as number;
  const m = st[mode] as Record<string, unknown> | undefined;
  if (m && typeof m.best === "number") return m.best;
  return 0;
}

// ── 개발용 가짜 서버 ──
const stub = {
  best: { normal: 0, hell: 0 } as Record<ChairMode, number>,
  ticket: null as { mode: ChairMode; practice: boolean; at: number } | null,
  start(mode: ChairMode, practice: boolean, hotbar: readonly (string | null)[], skills: Partial<Record<string, number>>): ChairStartRes {
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.ticket = { mode, practice, at: Date.now() };
    const pool = chairSealPool(hotbar, skills, (id) => skillById(id as SkillId)?.kind === "passive");
    return { ticket: `stub-${seed}`, seed, mode, practice, startedAt: Date.now(), sealPool: mode === "hell" ? chairSealOrder(seed, pool, (id) => ({ lv: skills[id] ?? 0, tier: skillById(id as SkillId)?.tier ?? 0, passive: skillById(id as SkillId)?.kind === "passive" })) : undefined, remaining: { normal: 2, hell: 2 } };
  },
  finish(damage: number, durationMs: number, god = false): ChairFinishRes {
    const t0 = this.ticket ?? { mode: "normal" as ChairMode, practice: false, at: 0 };
    const t = god ? { ...t0, practice: true } : t0;
    const newBest = !t.practice && damage > this.best[t.mode];
    if (newBest) this.best[t.mode] = damage;
    return { ok: true, damage, points: t.practice ? 0 : chairTimePoints(t.mode, durationMs), newBest, best: this.best[t.mode], weekRank: 3, remaining: { normal: 1, hell: 2 } };
  },
};

export const chairApi = {
  async start(mode: ChairMode, practice: boolean, hotbar: readonly (string | null)[], skills: Partial<Record<string, number>>): Promise<ChairStartRes> {
    if (stubOn()) return stub.start(mode, practice, hotbar, skills);
    try {
      return await request<ChairStartRes>("/api/chairman/start", post({ mode, ...(practice ? { practice: true } : {}) }));
    } catch (e) {
      if (missing(e)) return stub.start(mode, practice, hotbar, skills);
      throw e;
    }
  },
  async finish(ticket: string, damage: number, durationMs: number, extra: Record<string, unknown> = {}): Promise<ChairFinishRes> {
    if (stubOn() || ticket.startsWith("stub-")) return stub.finish(damage, durationMs, extra.god === true);
    return request<ChairFinishRes>("/api/chairman/finish", post({ ticket, damage: Math.round(damage), durationMs: Math.round(durationMs), ...extra }));
  },
  /** 11/22 시작 전(브리핑) 나가기: 티켓 버리기 + 하루 한 번 판 돌려받기 (싸운 시간 0) */
  async abort(ticket: string): Promise<ChairAbortRes | null> {
    if (stubOn() || ticket.startsWith("stub-")) return null;
    return request<ChairAbortRes>("/api/chairman/abort", post({ ticket, durationMs: 0 }));
  },
  async status(): Promise<ChairStatusRes | null> {
    if (stubOn()) return { best: stub.best };
    try {
      return await request<ChairStatusRes>("/api/chairman/status", { cache: "no-store" });
    } catch {
      return null;
    }
  },
};
