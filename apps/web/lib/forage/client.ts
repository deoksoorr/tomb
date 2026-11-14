import { request } from "../api";
import type { BugsResult } from "../rpg/types";
import type { DexCat, DexTier, NpcId } from "./catalog";
import type {
  AutoFishResponse,
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

export type DexPeer = { sid: number; ch?: number; room?: string };

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const forageApi = {
  state: () => request<ForageState>("/api/forage", { cache: "no-store" }),
  cast: (spot: string) => request<CastResponse>("/api/forage/fish/cast", post({ spot })),
  reel: (ticket: string, ok: boolean) => request<ReelResponse>("/api/forage/fish/reel", post({ ticket, ok })),
  autoStart: (spot: string, ch: number | null) => request<AutoFishResponse>("/api/forage/auto", post({ action: "start", spot, ch })),
  autoSync: () => request<AutoFishResponse>("/api/forage/auto", post({ action: "sync" })),
  autoStop: () => request<AutoFishResponse>("/api/forage/auto", post({ action: "stop" })),
  /** 페이지를 떠날 때: 응답을 기다리지 않는 끄기 (keepalive) */
  autoStopBeacon: () => {
    try {
      void fetch("/api/forage/auto", { ...post({ action: "stop" }), keepalive: true }).catch(() => {});
    } catch {
      // 떠나는 중이라 무시
    }
  },
  gatherStart: (node: string) => request<GatherStartResponse>("/api/forage/gather/start", post({ node })),
  gatherFinish: (ticket: string, result?: BugsResult) => request<GatherFinishResponse>("/api/forage/gather/finish", post({ ticket, result })),
  sell: (npc: NpcId, items: Record<string, number>) => request<SellResponse>("/api/forage/sell", post({ npc, items })),
  claimDex: (cat: DexCat, tier: DexTier) => request<DexClaimResponse>("/api/forage/dex/claim", post({ cat, tier })),
  /** 게임 안에서 누른 사람 (채널·방 + sid). 계정은 서버가 푼다 */
  dexOfPeer: (peer: DexPeer) => request<PublicDex>("/api/forage/dex/peer", post(peer)),
  dexOf: (accountId: string) => request<PublicDex>(`/api/forage/dex/${encodeURIComponent(accountId)}`, { cache: "no-store" }),
};
