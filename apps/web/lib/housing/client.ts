import type { CampHomeKind, CaravanDesign } from "@tomb/protocol";
import { request } from "../api";
import type { CottageStyleId, HouseSort, HouseZone, PlotTierId } from "./catalog";
import type { PlantsResponse } from "./plants";
import type { HouseStatesResponse } from "./states";
import type {
  GuestbookResponse,
  HouseExterior,
  VillageResponse,
  HouseDetailResponse,
  HouseLayout,
  HouseLikeResponse,
  HouseListResponse,
  HouseViewerResponse,
  MyHouseResponse,
} from "./types";

// 브라우저 → /api/housing/* (서버의 한국어 오류 메시지를 그대로 보여 준다: lib/api.ts errorMessage)

const send = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});
const house = (id: string, sub = "") => `/api/housing/houses/${encodeURIComponent(id)}${sub}`;

export const housingApi = {
  mine: (zone: HouseZone = "village") => request<MyHouseResponse>(zone === "village" ? "/api/housing/me" : `/api/housing/me?zone=${zone}`, { cache: "no-store" }),
  // 채널마다 주거 구역이 따로다: ch = 지금 있는 채널 (서버가 다른 채널의 필지는 다루지 않는다)
  buyPlot: (ch: number, name: string, intro: string, lot?: number | null, tier: PlotTierId = "small") =>
    request<MyHouseResponse>("/api/housing/me", send("POST", { ch, name, intro, lot: lot ?? null, tier })),
  /** 11/16 포구 오두막 분양 (ch 채널 lot번 터, 겉모습 style) */
  buyCottage: (ch: number, name: string, intro: string, lot: number | null, tier: PlotTierId, style: CottageStyleId) =>
    request<MyHouseResponse>("/api/housing/me", send("POST", { ch, name, intro, lot, tier, style, zone: "sea" })),
  /**
   * 11/26 캠핑장 집 분양 (ch 채널 lot번 터 — 종류는 터로 정해진다: 1~12 카라반, 13·14 펜션, 15·16 촌캉스). 한 사람당 캠핑장 집 한 채.
   * name을 비우면 터 이름(「카라반 2번」·「솔바람채」). kind = 창을 연 NPC의 종류 (서버가 터 종류와 같은지 본다)
   */
  buyCamp: (ch: number, lot: number, name = "", intro = "", kind?: CampHomeKind, design?: CaravanDesign) =>
    request<MyHouseResponse>("/api/housing/me/buy", send("POST", { ch, lot, zone: "camp", name, intro, ...(kind ? { kind } : {}), ...(design ? { design } : {}) })),
  /** 11/26 캠핑장 앞마당 다음 단계 (1→2→3, 방도 커진다 — 펜션·촌캉스 넓히기는 여기에 합쳤다) */
  yardUp: (ch: number) => request<MyHouseResponse>("/api/housing/me/yard", send("POST", { ch, zone: "camp" })),
  setCottageStyle: (style: CottageStyleId) => request<MyHouseResponse>("/api/housing/me/style", send("PUT", { style })),
  /** 11/26 내 카라반 디자인 바꾸기 (무료 — 모델·몸통 색·차양 색) */
  setCaravanDesign: (design: CaravanDesign) => request<MyHouseResponse>("/api/housing/me/style", send("PUT", { zone: "camp", design })),
  saveExterior: (ch: number, exterior: HouseExterior) => request<MyHouseResponse>("/api/housing/me/exterior", send("PUT", { ch, exterior })),
  /**
   * ch 채널의 분양 마을. fresh=true: 방금 바꾼 내용을 보려고 CDN 캐시(15초)를 건너뛴다.
   * 11/26 fresh={ v }: 실시간 서버의 집 바뀜 알림(homes) — 같은 채널 화면들이 같은 주소로 물어 CDN이 한 번만 서버에 묻는다
   */
  village: (ch: number, fresh: boolean | { v: number } = false, zone: HouseZone = "village") => {
    const z = zone === "village" ? "" : `&zone=${zone}`;
    if (typeof fresh === "object") return request<VillageResponse>(`/api/housing/village?ch=${ch}${z}&v=${fresh.v}`);
    return request<VillageResponse>(
      fresh ? `/api/housing/village?ch=${ch}${z}&t=${Date.now()}` : `/api/housing/village?ch=${ch}${z}`,
      fresh ? { cache: "no-store" } : undefined,
    );
  },
  editProfile: (name: string, intro: string, zone: HouseZone = "village") => request<MyHouseResponse>("/api/housing/me", send("PATCH", { name, intro, zone })),
  upgrade: (ch: number, to: PlotTierId, zone: HouseZone = "village") => request<MyHouseResponse>("/api/housing/me/upgrade", send("POST", { ch, to, zone })),
  buyItem: (itemId: string, zone: HouseZone = "village") => request<MyHouseResponse>("/api/housing/me/buy", send("POST", { itemId, zone })),
  sellItem: (itemId: string, zone: HouseZone = "village") =>
    request<MyHouseResponse & { refunded: number }>("/api/housing/me/sell", send("POST", { itemId, zone })),
  saveLayout: (ch: number, tier: PlotTierId, layout: HouseLayout, zone: HouseZone = "village") =>
    request<MyHouseResponse>("/api/housing/me/layout", send("PUT", { ch, tier, layout, zone })),
  list: (sort: HouseSort, signal?: AbortSignal) => request<HouseListResponse>(`/api/housing/houses?sort=${sort}`, { signal }),
  detail: (id: string) => request<HouseDetailResponse>(house(id)),
  viewer: (id: string) => request<HouseViewerResponse>(house(id, "/viewer"), { cache: "no-store" }),
  like: (id: string) => request<HouseLikeResponse>(house(id, "/like"), { method: "POST" }),
  guestbook: (id: string) => request<GuestbookResponse>(house(id, "/guestbook"), { cache: "no-store" }),
  writeGuest: (id: string, text: string) => request<GuestbookResponse>(house(id, "/guestbook"), send("POST", { text })),
  deleteGuest: (id: string, entryId: string) =>
    request<GuestbookResponse>(house(id, `/guestbook/${encodeURIComponent(entryId)}`), { method: "DELETE" }),
  /** 3번 화분 물 준 기록 / 물 주기 */
  plants: (id: string) => request<PlantsResponse>(house(id, "/plants"), { cache: "no-store" }),
  water: (id: string, u: string) => request<PlantsResponse>(house(id, "/plants"), send("POST", { u })),
  /** 3번 가구 상태 (불·스탠드·라디오·창문): 방 입장 때 받기 / 바꾼 값 저장 */
  states: (id: string) => request<HouseStatesResponse>(house(id, "/states"), { cache: "no-store" }),
  setState: (id: string, u: string, a: number) => request<{ ok: true }>(house(id, "/states"), send("POST", { u, a })),
  reportGuest: (id: string, entryId: string) =>
    request<{ ok: true; duplicate: boolean }>(house(id, `/guestbook/${encodeURIComponent(entryId)}/report`), { method: "POST" }),
};
