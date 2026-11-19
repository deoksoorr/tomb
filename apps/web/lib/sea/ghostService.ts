import { itemById, PERMANENT_UNTIL, type CosmeticSlot } from "@tomb/protocol";
import { champShopDiscount } from "../champPerks";
import { env } from "../env";
import { HttpError } from "../http";
import { buyFurniture, getHouseStore, houseIdFor } from "../housing/service";
import type { HouseZone } from "../housing/catalog";
import { recordLook } from "../lookRank";
import { onceClaim } from "../store/once";
import { isStaff } from "../staff";
import { isGraveChannel } from "../store/channels";
import { getAccounts } from "../store";
import { lookGrant, lookOf, loadMe } from "../store/accounts";
import { champBoardsSafe } from "../store/champ";
import { getStyleStore } from "../store/style";
import { wornPerk } from "../titlesServer";
import type { Me } from "../types";
import { pushVillageNotice } from "../weeklyChamp";
import { GHOST_BOUGHT_MSG, GHOST_CLOSED_MSG, GHOST_COSMETIC_KIND, GHOST_NOTICE, ghostClock, ghostCost, ghostItemName, ghostOpen, ghostStock, ghostWeek, type GhostCall, type GhostKind, type GhostPhase, type GhostTag } from "./ghostShip";
import { getGhostStore } from "./ghostStore";

// 11/17 유령선 특가 장터 (서버). 시간표·품목·할인 계산은 lib/sea/ghostShip (순수), 1인 1개·운영자 부르기는 lib/sea/ghostStore.
// 사기: ① 열려 있는지 (시간표 정박 또는 운영자가 그 채널에 부른 동안 — 11/19 그 채널 모두에게) ② 그 주 품목인지 ③ 물건 자리 잡기(SADD) ④ 값 = 큰 할인 하나 ⑤ 차감
//  (꾸미기 = 영구 꾸미기 저장소 한 번 · 가구 = 가구점과 같은 buyFurniture) — 실패하면 ③을 풀어요.
// 서버는 배 위치를 몰라요 (장터 창을 어디서 열어도 같은 값이라 이득이 없어요 — 동물원·포구 매점과 같아요).

export type GhostRow = {
  key: string;
  kind: GhostKind;
  id: string;
  tag: GhostTag;
  name: string;
  /** 원래 값 · 내가 낼 값 · 적용된 할인율 (유령선·칭호·포인트왕 중 큰 것) */
  base: number;
  cost: number;
  rate: number;
  /** 이번 장터에서 샀어요 (1인 1개) */
  bought: boolean;
};
export type GhostStatus = {
  phase: GhostPhase;
  open: boolean;
  opensAt: number;
  closesAt: number;
  week: string;
  items: GhostRow[];
  points: number;
  /** 운영자 계정이면 true (부르기 단추) */
  staff?: true;
  /** 그 채널에 운영자가 부른 상태 (11/19 모두에게 — null = 시간표대로) */
  call: GhostCall;
  /** 가구는 집(마을 집이나 포구 오두막)이 있어야 살 수 있어요 */
  house: boolean;
};
export type GhostBuyResult = GhostStatus & { me: Me; lookGrant?: string; got: string };
/** 11/19 그 채널에 운영자가 부른 상태 (GET /api/sea/ghost/call?ch=N) */
export type GhostCallState = { ch: number; call: GhostCall };

/** 그 채널에 운영자가 부른 상태 (11/19 그 채널 모두에게 — 채널을 모르면 시간표대로) */
export async function ghostCallOf(ch: number | null): Promise<GhostCall> {
  return ch !== null && isGraveChannel(ch) ? getGhostStore().getCall(ch) : null;
}

/** 가구를 넣을 집 (마을 집 먼저, 없으면 포구 오두막). 둘 다 없으면 null */
async function houseZone(accountId: string): Promise<HouseZone | null> {
  const store = getHouseStore();
  const [v, s] = await Promise.all([store.get(houseIdFor(accountId, "village")), store.get(houseIdFor(accountId, "sea"))]);
  return v ? "village" : s ? "sea" : null;
}

/** 꾸미기·가구 칭호 할인 · 포인트왕 할인 */
async function discounts(accountId: string, now: number) {
  const [perk, champ] = await Promise.all([wornPerk(accountId, now), champBoardsSafe(accountId, now)]);
  return {
    cosmetic: { title: perk.discount, champ: champShopDiscount(champ, "shop", GHOST_COSMETIC_KIND) },
    furniture: { title: perk.houseDiscount, champ: champShopDiscount(champ, "furniture") },
  };
}

export async function ghostStatus(accountId: string, now = Date.now(), ch: number | null = null): Promise<GhostStatus> {
  const week = ghostWeek(now);
  const clock = ghostClock(now);
  const [staff, call, bought, d, zone, me] = await Promise.all([isStaff(accountId), ghostCallOf(ch), getGhostStore().bought(week, accountId), discounts(accountId, now), houseZone(accountId), loadMe(getAccounts(), accountId, now)]);
  const got = new Set(bought);
  const items = ghostStock(week).map((s): GhostRow => {
    const dd = d[s.kind];
    const { cost, rate } = ghostCost(s, dd.title, dd.champ);
    return { key: s.key, kind: s.kind, id: s.id, tag: s.tag, name: ghostItemName(s), base: s.base, cost, rate, bought: got.has(s.key) };
  });
  return {
    phase: call === "on" ? "docked" : call === "off" ? "away" : clock.phase,
    open: ghostOpen(now, call),
    opensAt: clock.opensAt,
    closesAt: clock.closesAt,
    week,
    items,
    points: me.points,
    house: zone !== null,
    call,
    ...(staff ? { staff: true as const } : {}),
  };
}

/** 장터에서 사기 (key = 품목 이름표) */
export async function buyGhost(accountId: string, key: string, now = Date.now(), ch: number | null = null): Promise<GhostBuyResult> {
  // 11/19 운영자가 그 채널에 부른 동안은 그 채널 모두가 살 수 있어요 (운영자 이벤트)
  const call = await ghostCallOf(ch);
  if (!ghostOpen(now, call)) throw new HttpError(409, "GHOST_CLOSED", GHOST_CLOSED_MSG);
  const week = ghostWeek(now);
  const s = ghostStock(week).find((x) => x.key === key);
  if (!s) throw new HttpError(400, "INVALID_INPUT", "이번 장터에 없는 물건이에요.");
  const store = getGhostStore();
  if (!(await store.claim(week, accountId, key))) throw new HttpError(409, "ALREADY_BOUGHT", GHOST_BOUGHT_MSG);
  let grant: string | undefined;
  try {
    const d = (await discounts(accountId, now))[s.kind];
    const { cost, rate } = ghostCost(s, d.title, d.champ);
    if (s.kind === "cosmetic") {
      const item = itemById(s.id);
      if (!item?.slot) throw new HttpError(400, "INVALID_INPUT", "살 수 없는 꾸미기예요.");
      const r = await getStyleStore(getAccounts()).buyPermanent(accountId, s.id, item.slot as CosmeticSlot, cost, PERMANENT_UNTIL, `shop:유령선 ${s.id}`, now);
      if (r === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 영구로 가지고 있어요.");
      if (r === "ticket") throw new HttpError(409, "HAS_TICKET", "가방에 같은 꾸미기 이용권이 있어요. 먼저 입은 뒤에 영구로 바꿀 수 있어요.");
      if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
      const me = await loadMe(getAccounts(), accountId, now);
      await recordLook(accountId, me, { now }); // 꾸미기 랭킹 점수
      grant = await lookGrant(env.joinSecret(), accountId, lookOf(me), now, me);
    } else {
      const zone = await houseZone(accountId);
      if (!zone) throw new HttpError(409, "NO_HOUSE", "가구는 집이 있어야 살 수 있어요. 마을 분양 사무소나 포구 부동산에 들러요.");
      // buyFurniture가 같은 할인율로 값을 매겨요 (원가 × (1 − 큰 할인 하나)) — 가구점과 같은 가방·한도·환불
      await buyFurniture(getHouseStore(), accountId, s.id, rate, zone, true);
    }
  } catch (e) {
    await store.release(week, accountId, key).catch(() => undefined);
    throw e;
  }
  const status = await ghostStatus(accountId, now, ch);
  const me = await loadMe(getAccounts(), accountId, now);
  return { ...status, me, ...(grant ? { lookGrant: grant } : {}), got: ghostItemName(s) };
}

/**
 * 운영자: 그 채널에 유령선 부르기 (on) · 보내기 (off) · 시간표대로 (null). 운영자 계정이 아니면 403.
 * 11/19 그 채널 모두에게 보이고 탈 수 있고 장터도 열려요 (3시간 뒤 저절로 시간표대로). 다른 채널은 그대로예요
 */
export async function callGhost(accountId: string, call: GhostCall, ch: number, now = Date.now()): Promise<GhostStatus> {
  if (!(await isStaff(accountId))) throw new HttpError(403, "FORBIDDEN", "운영자 계정만 할 수 있어요.");
  if (!isGraveChannel(ch)) throw new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");
  await getGhostStore().setCall(ch, call);
  return ghostStatus(accountId, now, ch);
}

/** 이 프로세스가 공지를 마친 주 (다음 주까지 저장소를 다시 보지 않아요) */
let noticedWeek: string | null = null;

/**
 * 8시 50분 안개 공지 (확성기 「공지」 줄 — 모든 채널). 머무르기 기록이 불러요 (cron 없이 — 행운권 추첨과 같은 틀).
 * 안개·정박 시간이 아니면 아무것도 안 읽어요 (Redis 0). 주마다 한 번만 (onceClaim)
 */
export async function ensureGhostNotice(now = Date.now()): Promise<void> {
  const phase = ghostClock(now).phase;
  if (phase !== "fog" && phase !== "docked") return;
  const week = ghostWeek(now);
  if (noticedWeek === week) return;
  try {
    if ((await onceClaim(`ghost-notice:${week}`)) === null) await pushVillageNotice(GHOST_NOTICE, now, { id: `ghost-${week}` });
    noticedWeek = week;
  } catch (e) {
    console.warn("[sea/ghost] 안개 공지 실패", e);
  }
}
