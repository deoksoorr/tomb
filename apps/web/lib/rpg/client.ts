import type { HuntRoomsInfo } from "@tomb/protocol";
import { request } from "../api";
import { REALTIME_HTTP_URL } from "../realtime";
import { HUNT_ZONES, isZoneId, type Difficulty, type GameKind, type GearSlot, type SkillId, type Stats, type ZoneId } from "./catalog";
import type { HotAuto } from "./hotbar";
import type { TNodeId } from "./transcendTree";
import type { RpgView, RunFinishResponse, RunResult, RunStartResponse, SoldInfo } from "./types";
import type { GearActionResponse } from "./gearService";

// 브라우저 → 사냥터 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export type CharacterAction =
  | { type: "alloc"; stats: Partial<Stats> }
  | { type: "learn"; skill: SkillId }
  | { type: "hotbar"; slots?: (SkillId | null)[]; auto?: HotAuto }
  | { type: "equip"; slot: GearSlot; itemId: string | null }
  | { type: "respec"; cost: number }
  | { type: "ackTree" }
  | { type: "resetStats"; cost: number }
  | { type: "tlearn"; node: TNodeId }
  | { type: "treset" };

export type ShopResponse = RpgView & { sold?: SoldInfo };

/** 11/15 세트 장비·강화 (app/api/rpg/gear) */
export type GearAction =
  | { type: "enhance"; sg?: number; shop?: string; piece?: number; protect: boolean; cost: number }
  | { type: "reroll"; uid: number; lock: string | null; cost: number }
  | { type: "exchange"; uids: number[]; set: number; piece: number }
  | { type: "disassemble"; uids: number[] }
  | { type: "inherit"; fromSg?: number; fromPiece?: number; sg?: number; shop?: string; piece?: number; cost: number }
  | { type: "equip"; slot: GearSlot; uid: number | null }
  | { type: "egg"; set: number };

export const rpgApi = {
  view: () => request<RpgView>("/api/rpg", { cache: "no-store" }),
  character: (a: CharacterAction) => request<RpgView>("/api/rpg/character", post(a)),
  buy: (itemId: string, qty = 1) => request<ShopResponse>("/api/rpg/shop", post({ type: "buy", itemId, qty })),
  sell: (itemId: string, count = 1) => request<ShopResponse>("/api/rpg/shop", post({ type: "sell", itemId, count })),
  /** 11/15 강화한 장비 한 개 되팔기 (번호) */
  sellPiece: (itemId: string, piece: number) => request<ShopResponse>("/api/rpg/shop", post({ type: "sell", itemId, piece })),
  // planVer: 별자리 잇기 화면이 쓰는 계획 판 번호 (서버가 티켓에 실어 그 판으로 검사한다)
  // tower: 11/15 야근 빌딩 시작 층 (지옥 사냥만 — 사냥터는 서버가 층으로 정한다)
  start: (game: GameKind, difficulty: Difficulty, zone?: ZoneId, planVer?: number, tower?: number) =>
    request<RunStartResponse>(
      "/api/rpg/run/start",
      post({ game, difficulty, ...(game === "hunt" && zone ? { zone } : {}), ...(planVer ? { planVer } : {}), ...(tower ? { tower } : {}) }),
    ),
  finish: (ticket: string, result: RunResult) => request<RunFinishResponse>("/api/rpg/run/finish", post({ ticket, result })),
  /** 11/18 드롭 시드 (우두머리가 나온 뒤 — 드롭 연출용, 보상은 판 끝에 서버가) */
  reveal: (ticket: string) => request<{ dropSeed: number }>("/api/rpg/run/reveal", post({ ticket })),
  gear: (a: GearAction) => request<GearActionResponse>("/api/rpg/gear", post(a)),
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
