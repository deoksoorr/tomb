import type { HuntRoomsInfo } from "@tomb/protocol";
import { request } from "../api";
import { REALTIME_HTTP_URL } from "../realtime";
import { HUNT_ZONES, isZoneId, type Difficulty, type GameKind, type GearSlot, type SkillId, type Stats, type ZoneId } from "./catalog";
import type { RpgView, RunFinishResponse, RunResult, RunStartResponse, SoldInfo } from "./types";

// 브라우저 → 사냥터 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export type CharacterAction =
  | { type: "alloc"; stats: Partial<Stats> }
  | { type: "learn"; skill: SkillId }
  | { type: "hotbar"; slots: (SkillId | null)[] }
  | { type: "equip"; slot: GearSlot; itemId: string | null }
  | { type: "respec"; cost: number }
  | { type: "ackTree" };

export type ShopResponse = RpgView & { sold?: SoldInfo };

export const rpgApi = {
  view: () => request<RpgView>("/api/rpg", { cache: "no-store" }),
  character: (a: CharacterAction) => request<RpgView>("/api/rpg/character", post(a)),
  buy: (itemId: string, qty = 1) => request<ShopResponse>("/api/rpg/shop", post({ type: "buy", itemId, qty })),
  sell: (itemId: string, count = 1) => request<ShopResponse>("/api/rpg/shop", post({ type: "sell", itemId, count })),
  start: (game: GameKind, difficulty: Difficulty, zone?: ZoneId) => request<RunStartResponse>("/api/rpg/run/start", post({ game, difficulty, ...(game === "hunt" && zone ? { zone } : {}) })),
  finish: (ticket: string, result: RunResult) => request<RunFinishResponse>("/api/rpg/run/finish", post({ ticket, result })),
};

// ── 11/12 사냥터별 지금 사냥 중인 인원 ──

/** 사냥터 id → 지금 그 사냥터 방에 있는 사람 수 (0명인 곳은 없다) */
export type HuntCrowd = Partial<Record<ZoneId, number>>;

/** 실시간 서버 응답(방 id "hunt:{zone}:{difficulty}" → 인원) → 사냥터별 인원. 사냥터·난이도가 맞지 않는 방은 버린다 */
export function huntCrowdOf(info: HuntRoomsInfo | null | undefined): HuntCrowd {
  const out: HuntCrowd = {};
  for (const [room, n] of Object.entries(info?.rooms ?? {})) {
    const [, slug, diff] = room.split(":");
    if (!isZoneId(slug) || HUNT_ZONES[slug].difficulty !== diff || !Number.isInteger(n) || n <= 0) continue;
    out[slug] = (out[slug] ?? 0) + n;
  }
  return out;
}

/** 브라우저 메모리 캐시 (서버도 10초 캐시라 더 자주 물어도 같은 값) */
const CROWD_TTL_MS = 10_000;
let crowdMemo: { at: number; value: HuntCrowd } | null = null;
let crowdInflight: Promise<HuntCrowd> | null = null;

/**
 * 사냥터 고르는 화면용: 사냥터별 지금 사냥 중인 인원 (예: `crowd["subway"] ?? 0`명 사냥 중).
 * 실시간 서버 GET /hunt-rooms, 10초 캐시·동시 요청 합치기. 실패하면 빈 객체 (표시만 빠진다)
 */
export function fetchHuntCrowd(): Promise<HuntCrowd> {
  const now = Date.now();
  if (crowdMemo && now - crowdMemo.at < CROWD_TTL_MS) return Promise.resolve(crowdMemo.value);
  crowdInflight ??= fetch(`${REALTIME_HTTP_URL}/hunt-rooms`)
    .then((res) => (res.ok ? (res.json() as Promise<HuntRoomsInfo>) : null))
    .catch(() => null)
    .then((info) => {
      const value = huntCrowdOf(info);
      if (info) crowdMemo = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      crowdInflight = null;
    });
  return crowdInflight;
}
