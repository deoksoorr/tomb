import { request } from "../api";
import type { BugsResult } from "../rpg/types";
import type { DexTier, LifeCat, NpcId } from "./catalog";
import type {
  CastResponse,
  DexClaimResponse,
  GatherFinishResponse,
  GatherStartResponse,
  ForageState,
  PublicDex,
  ReelResponse,
  SellResponse,
} from "./types";

// 브라우저 → 낚시·채집 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request).

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const forageApi = {
  state: () => request<ForageState>("/api/forage", { cache: "no-store" }),
  cast: (spot: string) => request<CastResponse>("/api/forage/fish/cast", post({ spot })),
  reel: (ticket: string, ok: boolean) => request<ReelResponse>("/api/forage/fish/reel", post({ ticket, ok })),
  gatherStart: (node: string) => request<GatherStartResponse>("/api/forage/gather/start", post({ node })),
  gatherFinish: (ticket: string, result?: BugsResult) => request<GatherFinishResponse>("/api/forage/gather/finish", post({ ticket, result })),
  sell: (npc: NpcId, items: Record<string, number>) => request<SellResponse>("/api/forage/sell", post({ npc, items })),
  claimDex: (cat: LifeCat, tier: DexTier) => request<DexClaimResponse>("/api/forage/dex/claim", post({ cat, tier })),
  dexOf: (accountId: string) => request<PublicDex>(`/api/forage/dex/${encodeURIComponent(accountId)}`, { cache: "no-store" }),
};
