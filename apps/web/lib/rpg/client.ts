import { request } from "../api";
import type { Difficulty, GameKind, GearSlot, SkillId, Stats } from "./catalog";
import type { RpgView, RunFinishResponse, RunResult, RunStartResponse } from "./types";

// 브라우저 → 사냥터 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export type CharacterAction =
  | { type: "alloc"; stats: Partial<Stats> }
  | { type: "learn"; skill: SkillId }
  | { type: "hotbar"; slots: (SkillId | null)[] }
  | { type: "equip"; slot: GearSlot; itemId: string | null };

export type ShopResponse = RpgView & { sold?: { value: number; capped: boolean } };

export const rpgApi = {
  view: () => request<RpgView>("/api/rpg", { cache: "no-store" }),
  character: (a: CharacterAction) => request<RpgView>("/api/rpg/character", post(a)),
  buy: (itemId: string, qty = 1) => request<ShopResponse>("/api/rpg/shop", post({ type: "buy", itemId, qty })),
  sell: (itemId: string) => request<ShopResponse>("/api/rpg/shop", post({ type: "sell", itemId })),
  start: (game: GameKind, difficulty: Difficulty) => request<RunStartResponse>("/api/rpg/run/start", post({ game, difficulty })),
  finish: (ticket: string, result: RunResult) => request<RunFinishResponse>("/api/rpg/run/finish", post({ ticket, result })),
};
