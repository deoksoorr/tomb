import { request } from "../../api";
import type { QuestBoard, QuestDeliverResponse, QuestExchangeResponse, QuestRerollResponse } from "./types";

// 11/15: 브라우저 → 수집 의뢰 API

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const questApi = {
  board: () => request<QuestBoard>("/api/forage/quests", { cache: "no-store" }),
  deliver: (key: string, items: Record<string, number>) => request<QuestDeliverResponse>("/api/forage/quests/deliver", post({ key, items })),
  reroll: (key: string) => request<QuestRerollResponse>("/api/forage/quests/reroll", post({ key })),
  exchange: (id: string) => request<QuestExchangeResponse>("/api/forage/quests/exchange", post({ id })),
};
