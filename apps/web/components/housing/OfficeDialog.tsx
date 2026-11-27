"use client";

import { useEffect, useId, useReducer, useRef, useState, type RefObject } from "react";
import { errorMessage, isAbortError } from "@/lib/api";
import {
  CAMP_HOME_KIND_NAME,
  CAMP_LOTS,
  campLotByNo,
  campLotName,
  campLotShort,
  caravanDesignName,
  caravanDesignOf,
  sameCaravanDesign,
  SEA_LOTS,
  type CampHomeKind,
  type CaravanDesign,
} from "@tomb/protocol";
import { campOf, campPrices, campRoom, campYardPrice, fullSaleChannels } from "@/game/camp/campSaleApi";
import { useLobby, visibleChannels } from "@/lib/hooks/useLobby";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { toUi } from "@/lib/uiScale";
import { josa } from "@/lib/rpg/skillText";
import {
  COTTAGE_STYLES,
  HOUSE_INTRO_MAX,
  HOUSE_NAME_MAX,
  houseLabel,
  houseSizeBonus,
  LIKE_WEIGHT,
  lotLabel,
  nextTier,
  PLOT_TIERS,
  plotCost,
  RECLAIM_DAYS,
  SEA_COTTAGE_RATE,
  SEA_VILLA_RATE,
  seaLotLabel,
  seaPlotCost,
  seaUpgradeCost,
  SORT_LABELS,
  SORTS,
  TIER_SCORE_BONUS,
  TIER_SCORE_NOTE,
  tierById,
  type CottageStyleId,
  type HouseSort,
  type PlotTierId,
  type SaleKind,
} from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { styleTag } from "@/lib/housing/layout";
import { channelStatus, isOpenLot, MAIN_LOTS, WORLD_LOTS } from "@tomb/protocol";
import type { HouseSummary, MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { CottageStylePicker, fmt, TierCompare, TierPicker, TitleBadge, TitleProgress } from "./parts";
import { CAMP_SHOP_HELLO, CAMP_SHOP_TAB, campOfficeTitle, HOST, kindIntro, openChannelsLine, openSaleChannels, soldOutLine, yardChangeLine, yardHint } from "./campOfficeText";
import { CampLotPicker } from "./CampLotPicker";
import { CaravanDesignPicker } from "./CaravanDesignPicker";
import CampExclusiveShop from "./CampExclusiveShop";
import { CARAVAN_BUY_START, caravanBuy, caravanBuyDesign, caravanCardDesign } from "./caravanBuyFlow";

/** 11/27 shop = 캠핑장 분양 NPC의 「전용 가구」 탭 (zone "camp"만) */
type Tab = "mine" | "browse" | "shop";

type Props = {
  my: MyHouseResponse | null;
  myError: string | null;
  onMy: (r: MyHouseResponse) => void;
  onEnterMine: (edit: boolean) => void;
  onVisit: (id: string) => void;
  onClose: () => void;
  busy: boolean;
  visitError?: string | null;
  initialTab?: Tab;
  /** 분양 마을로 (spawnLot: 그 번지 앞에서). mine=true면 내 집 번지 (내 집이 다른 채널이면 그 채널로 옮긴 뒤) */
  onVillage: (spawnLot: number | null, mine?: boolean) => void;
  onExterior: () => void;
  /** 마을의 빈 필지 팻말에서 열었으면 그 번지 */
  presetLot?: number | null;
  /** 마을 안에서 열린 창이면 true ("마을로 가기" 대신 "마을로 돌아가기") */
  inVillage?: boolean;
  /** 지금 채널 (채널마다 주거 구역이 따로다. 분양은 이 채널의 빈 필지에) */
  channel: number;
  /**
   * 11/16 "sea" = 포구 부동산 (달물결 포구 오두막). 창 모양·탭·카드·버튼은 분양 사무소와 같고
   * 번지 이름(포구 N번 오두막)·값(1.5배, 마을 집이 있으면 별장 2배)·겉모습(오두막 세 모양)만 다르다
   */
  zone?: "sea" | "camp";
  /** 포구·캠핑장: 다른 집이 있는지 (서버 값표가 없을 때의 별장 값). 모르면 null */
  villa?: boolean | null;
  /**
   * 11/26 캠핑장(zone "camp"): 창을 연 분양 NPC가 파는 종류 하나 — 언젠가 씨 카라반 · 소슬댁 펜션 · 순이 할머니 촌캉스.
   * 창 모양·탭·카드·버튼은 분양 사무소와 같고, 위 안내가 그 NPC의 인사, 터 고르기가 그 종류의 터, 넓히기 자리에 앞마당 단계가 온다
   */
  campKind?: CampHomeKind;
};

/** 분양 사무소 창: 내 집(분양·넓히기·들어가기) + 분양지 둘러보기·랭킹 */
export default function OfficeDialog({
  my,
  myError,
  onMy,
  onEnterMine,
  onVisit,
  onClose,
  busy,
  visitError,
  initialTab,
  onVillage,
  onExterior,
  presetLot,
  inVillage,
  channel,
  zone,
  villa = null,
  campKind,
}: Props) {
  const [picked, setTab] = useState<Tab | null>(initialTab ?? null);
  const id = useId();
  const sea = zone === "sea";
  const camp = zone === "camp" ? (campKind ?? "caravan") : null;
  // 11/27 캠핑장: 그 종류 집 주인이 창을 열면 「전용 가구」 탭부터 (고른 탭이 있으면 그것), 아니면 분양 탭
  const tab: Tab = picked ?? (camp && my?.house?.camp?.kind === camp ? "shop" : "mine");
  const tabs: readonly Tab[] = camp ? ["mine", "shop", "browse"] : ["mine", "browse"];
  const shopTab = !!camp && tab === "shop";
  return (
    <Dialog title={camp ? campOfficeTitle(camp) : sea ? "포구 부동산" : "분양 사무소"} onClose={onClose}>
      <div className={styles.stack} style={shopTab ? { flex: 1, minHeight: 0, gridTemplateRows: "auto auto minmax(0, 1fr)" } : undefined}>
        <div className={styles.spread}>
          <p className={styles.small}>
            {camp && shopTab
              ? CAMP_SHOP_HELLO[camp]
              : camp
                ? `${HOST[camp].hello} 채널마다 터가 따로 있어요. 지금 ${channel}채널의 빈 터를 골라 분양받아요.`
                : sea
                  ? `달물결 포구 곳곳에 오두막 터가 ${SEA_LOTS.length}곳 있어요. 채널마다 터가 따로 있어요. 지금 ${channel}채널의 빈 터를 골라 분양받아요.`
                  : `광장 동쪽 주거 구역에 집들이 있어요. 채널마다 주거 구역이 따로 있어요. 지금 ${channel}채널의 빈 자리를 골라 분양받아요.`}
          </p>
          {!sea && !camp && (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => (inVillage ? onClose() : onVillage(null))} disabled={busy}>
              {inVillage ? "마을로 돌아가기" : "주거 구역 보기"}
            </button>
          )}
        </div>
        {!shopTab && (
          <div className={styles.warn} role="note">
            <strong>
              <span className={styles.warnTag}>주의</span>
              {RECLAIM_DAYS}일 동안 접속하지 않으면 {sea ? "오두막도" : camp ? `${CAMP_HOME_KIND_NAME[camp]}도` : "집이"} 철거돼요
            </strong>
            <p>집 가격은 100% 선물함으로 돌려드리고, 가구는 그대로 저장돼요. 철거된 자리는 다른 사람이 분양받을 수 있어요.</p>
          </div>
        )}
        <div className={styles.tabs} role="tablist" aria-label="분양 사무소">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`${id}-${t}`}
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              className={styles.tab}
              onClick={() => setTab(t)}
            >
              {t === "mine" ? (sea ? "내 오두막" : camp ? "내 캠핑장 집" : "내 집") : t === "shop" ? CAMP_SHOP_TAB : "둘러보기 · 랭킹"}
            </button>
          ))}
        </div>
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${tab}`}
          style={shopTab ? { display: "flex", flexDirection: "column", minHeight: 0 } : undefined}
        >
          {camp && shopTab ? (
            <CampExclusiveShop kind={camp} onMy={onMy} />
          ) : tab === "mine" ? (
            <MyPlot
              my={my}
              error={myError}
              onMy={onMy}
              onEnter={onEnterMine}
              busy={busy}
              presetLot={presetLot ?? null}
              channel={channel}
              onVillage={onVillage}
              onExterior={onExterior}
              zone={zone}
              villa={villa}
              campKind={camp}
            />
          ) : (
            <HouseList onVisit={onVisit} myId={my?.house?.id ?? null} busy={busy} />
          )}
          {visitError && (
            <p className={styles.error} role="alert">
              {visitError}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function MyPlot({
  my,
  error,
  onMy,
  onEnter,
  busy,
  presetLot,
  channel,
  onVillage,
  onExterior,
  zone,
  villa,
  campKind,
}: {
  my: MyHouseResponse | null;
  error: string | null;
  onMy: (r: MyHouseResponse) => void;
  onEnter: (edit: boolean) => void;
  busy: boolean;
  presetLot: number | null;
  channel: number;
  onVillage: (spawnLot: number | null, mine?: boolean) => void;
  onExterior: () => void;
  zone?: "sea" | "camp";
  villa: boolean | null;
  /** 11/26 캠핑장: 이 창에서 파는 종류 (zone "camp"일 때만) */
  campKind: CampHomeKind | null;
}) {
  const sea = zone === "sea";
  const camp = zone === "camp" ? campKind : null;
  const inCamp = useBridgeValue("map:changed")?.map === "camp";
  // 캠핑장: 다른 종류의 터에서 열렸으면 고른 자리를 비운다 (그 종류 NPC만 판다)
  const [lot, setLot] = useState<number | null>(camp && presetLot !== null && campLotByNo(presetLot)?.kind !== camp ? null : presetLot);
  const [free, setFree] = useState<number[] | null>(null);
  /** 11/26 캠핑장: 분양된 터의 주인 이름 (터 카드에 보인다) */
  const [campOwners, setCampOwners] = useState<ReadonlyMap<number, string>>(new Map());
  /** 11/26 분양된 카라반 터의 주인 디자인 (터 카드 그림) */
  const [campDesigns, setCampDesigns] = useState<ReadonlyMap<number, CaravanDesign>>(new Map());
  /**
   * 11/27 캠핑장 분양: 고른 터 + 카라반 두 단계(1 자리 → 2 모델·몸통 색·차양 색 — caravanBuyFlow). 디자인은 자리와 따로 간다
   * (자리를 바꿔도·되돌아가도 고른 디자인 그대로 — 예전엔 안 건드린 디자인이 고른 터의 기본 모습을 따라가 터를 누르면 모델이 바뀌었다)
   */
  const [cv, cvDo] = useReducer(caravanBuy, CARAVAN_BUY_START);
  /** 단계를 바꾸면 순서 표시가 창 위에 오게 (2단계 미리보기·고른 자리 줄부터 보이게) */
  const stepsRef = useRef<HTMLDivElement>(null);
  const toStep = (a: "next" | "back") => {
    if (a === "next" && campLot !== null) cvDo({ type: "lot", lot: campLot });
    cvDo({ type: a });
    requestAnimationFrame(() => stepsRef.current?.scrollIntoView({ block: "start" }));
  };
  /** 11/26 주인이 관리 창에서 고르는 중인 디자인 (null = 닫힘) */
  const [redesign, setRedesign] = useState<CaravanDesign | null>(null);
  const xmas = useBridgeValue("map:concept")?.concept === "christmas";
  /** 오두막 겉모습 (분양 때 고르고, 분양 뒤 「겉모습 바꾸기」로 바꾼다) */
  const [style, setStyle] = useState<CottageStyleId>("wood");
  const [restyle, setRestyle] = useState(false);
  const noHouse = !!my && !my.house;
  useEffect(() => {
    if (!noHouse) return;
    let alive = true;
    housingApi
      .village(channel, false, sea ? "sea" : camp ? "camp" : "village")
      .then((v) => {
        if (!alive) return;
        const used = new Set([...v.houses.map((h) => h.lot), ...v.taken]);
        // 11/26 캠핑장: 이 NPC가 파는 종류의 빈 터만
        if (camp) {
          setCampOwners(new Map(v.houses.map((h) => [h.lot, h.ownerName])));
          setCampDesigns(new Map(v.houses.flatMap((h) => (campLotByNo(h.lot)?.kind === "caravan" ? [[h.lot, caravanDesignOf(h.lot, h.camp?.design)] as const] : []))));
          return setFree(CAMP_LOTS.filter((l) => l.kind === camp && !used.has(l.lot)).map((l) => l.lot));
        }
        // 11/16 포구: 그 채널의 오두막 터 중 빈 터
        if (sea) return setFree(SEA_LOTS.map((l) => l.n).filter((l) => !used.has(l)));
        // 메인 맵 주거 구역(1..WORLD_LOTS, 11/19 등불 골목 10~15번지 포함)의 빈 필지만. 2단지는 닫았다 — 다 차면 빈 목록 (자동 분양도 「다 찼어요」)
        setFree(Array.from({ length: WORLD_LOTS }, (_, i) => i + 1).filter((l) => isOpenLot(l) && !used.has(l)));
      })
      .catch(() => alive && setFree([]));
    return () => {
      alive = false;
    };
  }, [noHouse, channel, sea, camp]);
  // 11/26 이 창이 파는 집 터가 이 채널에 다 찼으면(마을·포구·캠핑장 모두) 「남은 ○○이 없어요」 + 터가 남은 채널을 한 번 센다
  // (채널 목록 폴러와 같은 캐시된 주소 — 새로 폴링하지 않는다)
  const saleKind: SaleKind = camp ?? (sea ? "sea" : "village");
  const soldOut = noHouse && free !== null && free.length === 0;
  const [fullChs, setFullChs] = useState<number[] | null>(null);
  useEffect(() => {
    if (!soldOut) return;
    const ac = new AbortController();
    void fullSaleChannels(ac.signal).then((f) => !ac.signal.aborted && setFullChs(f ? f[saleKind] : null));
    return () => ac.abort();
  }, [soldOut, saleKind]);
  const lobby = useLobby().lobby;
  const openChs = soldOut
    ? openSaleChannels(lobby ? visibleChannels(lobby, [channel]).filter((c) => channelStatus(c, lobby.threshold) !== "full").map((c) => c.id) : null, fullChs, channel)
    : null;
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /** 처음 분양받을 터 크기 (넓은 터·대저택도 바로 살 수 있다) */
  const [pick, setPick] = useState<PlotTierId>("small");
  const fid = useId();
  // 11/26 넓히기 카드 높이 고정: 마지막 단계로 넓히면 카드가 짧아져(단추·안내 줄이 빠짐) 아래로 내려 둔 창이 그만큼 튀어 올랐다
  // (브라우저가 scrollTop을 줄어든 높이에 맞춰 깎음 — 대저택 PC 139→53, 폰 201→87). 넓히기를 누른 순간의 높이를 최소 높이로 둔다
  const upCard = useRef<HTMLDivElement>(null);
  const [upMin, setUpMin] = useState<number | undefined>(undefined);
  const holdUpCard = () => setUpMin((m) => Math.max(m ?? 0, toUi(upCard.current?.getBoundingClientRect().height ?? 0)) || undefined);

  if (!my) return <p className={styles.muted}>{error ?? "분양 장부를 펼치는 중…"}</p>;

  const plot = tierById(pick)!;
  // 11/26 별장 규칙 변경(두 번째로 산 집부터 별장 — 분양·넓히기 4/3): 값은 서버 값표(my.prices) 그대로. 옛 서버 응답이면 예전 계산
  const prices = my.prices;
  // 11/26 캠핑장 값표: 터마다 분양가·앞마당 값 (서버 prices.camp — 없으면 같은 규칙으로 센다)
  const campP = camp ? campPrices(prices, !!villa) : null;
  const isVilla = sea ? (prices?.villa.sea ?? !!villa) : camp ? (prices?.villa.camp ?? !!villa) : (prices?.villa.village ?? false);
  const seaCost = (t: PlotTierId) => prices?.sea[t] ?? seaPlotCost(t, isVilla);
  const villageCost = (t: PlotTierId) => prices?.village[t] ?? plotCost(t);
  /** 캠핑장: 고른 터 (안 골랐으면 가장 앞의 빈 터) */
  const campLot = camp ? (cv.lot !== null && free?.includes(cv.lot) ? cv.lot : (free?.[0] ?? null)) : null;
  /** 11/27 카라반 분양 단계 (고른 터가 없으면 1단계) · 분양 때 보낼 디자인 (2단계에서 정한 것 — 자리와 따로) */
  const cvStep = camp === "caravan" && campLot !== null ? cv.step : 1;
  const campDesign = camp === "caravan" && campLot !== null ? caravanBuyDesign(cv, campLot) : null;
  const cvCard = { ...cv, lot: campLot };
  const cost = camp ? (campLot !== null && campP ? (campP.lots[campLot] ?? 0) : 0) : sea ? seaCost(pick) : villageCost(pick);
  const labelOf = (ch: number, l: number) => (sea ? seaLotLabel(ch, l) : camp ? `${ch}채널 ${campLotName(l)}` : lotLabel(ch, l));
  const priceUnknown = (sea || !!camp) && villa === null && !prices;
  async function run(fn: () => Promise<MyHouseResponse>, done: string) {
    setPending(true);
    setMsg(null);
    try {
      onMy(await fn());
      setMsg(done);
      setEditing(false);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const form = (submit: string, onSubmit: () => void, withLot = false) => (
    <form
      className={styles.stack}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className={ui.field} htmlFor={`${fid}-name`}>
        <span className={cx(ui.label, !(camp && withLot) && ui.required)}>
          집 이름 <span className={ui.counter}>{[...name].length}/{HOUSE_NAME_MAX}</span>
        </span>
        <input
          id={`${fid}-name`}
          className={ui.input}
          value={name}
          maxLength={HOUSE_NAME_MAX + 4}
          onChange={(e) => setName(e.target.value)}
          placeholder={camp && campLot !== null && withLot ? `비우면 「${campLotShort(campLot)}」` : "예) 달빛 서재"}
          required={!(camp && withLot)}
        />
      </label>
      <label className={ui.field} htmlFor={`${fid}-intro`}>
        <span className={ui.label}>
          한 줄 소개 <span className={ui.counter}>{[...intro].length}/{HOUSE_INTRO_MAX}</span>
        </span>
        <input id={`${fid}-intro`} className={ui.input} value={intro} maxLength={HOUSE_INTRO_MAX + 4} onChange={(e) => setIntro(e.target.value)} placeholder="찾아온 손님에게 한마디" />
      </label>
      {withLot && !camp && (
        <label className={ui.field} htmlFor={`${fid}-lot`}>
          <span className={ui.label}>{sea ? `오두막 터 (${channel}채널 포구의 자리)` : `번지 (${channel}채널 주거 구역의 자리)`}</span>
          <select
            id={`${fid}-lot`}
            className={ui.input}
            value={lot ?? ""}
            onChange={(e) => setLot(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{sea ? "가장 앞의 빈 터 (자동)" : "가장 앞의 빈 번지 (자동)"}</option>
            {(free ?? []).map((l) => (
              <option key={l} value={l}>
                {sea ? `${l}번 터${SEA_LOTS.find((x) => x.n === l)?.deck ? " (바다 쪽 데크)" : ""}` : `${l}번지${l > MAIN_LOTS ? " (바닷가행 정류장 위 등불 골목)" : ""}`}
              </option>
            ))}
            {lot !== null && !free?.includes(lot) && <option value={lot}>{sea ? `${lot}번 터` : `${lot}번지`}</option>}
          </select>
        </label>
      )}
      {withLot && (
        <p className={styles.warnLine}>
          {RECLAIM_DAYS}일 동안 접속하지 않으면 {sea ? "오두막이" : camp ? josa(CAMP_HOME_KIND_NAME[camp], "이", "가") : "집이"} 철거돼요. 집 가격은 100% 돌려드리고 가구는 그대로 저장돼요.
        </p>
      )}
      <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || busy || (camp && withLot ? campLot === null || my.points < cost : !name.trim())}>
        {pending ? "처리 중…" : submit}
      </button>
    </form>
  );

  const h = my.house;
  if (!h) {
    const short = my.points < cost;
    // 가방에 남은 가구: 오래 비워 정리된 예전 집 것 + 11/16 다른 집과 함께 쓰는 공용 가방 (다른 집에 놓인 건 빼고)
    const kept = Object.values(my.inventory).reduce((n, c) => n + c, 0);
    return (
      <div className={styles.stack}>
        <div className={styles.card}>
          <p className={styles.houseName}>{camp ? `${josa(CAMP_HOME_KIND_NAME[camp], "을", "를")} 분양받아 보세요` : sea ? "바닷가 오두막을 분양받아 보세요" : "나만의 집을 분양받아 보세요"}</p>
          <p className={styles.muted}>
            {camp
              ? kindIntro(camp)
              : sea
              ? "포구의 오두막 터를 드려요. 해먹·라탄 의자·서핑보드·소라 장식·구명 튜브가 놓인 채로 시작해요. 방 아래쪽 창으로 지금 물때의 바다가 보여요."
              : "주거 구역에 내 터를 드려요. 큰 터를 바로 살 수도 있고, 작은 터로 시작해 나중에 넓혀도 돼요. 가구와 소품으로 꾸미면 꾸밈 점수가 올라요. 놀러 온 사람들이 좋아요와 방명록을 남겨 줘요."}
          </p>
          {camp && (
            <p className={styles.tag}>
              {priceUnknown ? "값을 확인하는 중…" : isVilla ? "이미 다른 집이 있어서 다주택자 가격(약 1.3배)이에요. 앞마당도 다주택자 가격이에요." : "처음 사는 집이라 기본 가격이에요. 다른 집이 있으면 다주택자 가격(약 1.3배)이에요."}
            </p>
          )}
          {sea && (
            <p className={styles.tag}>
              {villa === null && !prices
                ? "값을 확인하는 중…"
                : isVilla
                  ? `이미 다른 집이 있어서 다주택자 가격이에요 (마을 집 값의 ${SEA_VILLA_RATE}배).`
                  : `마을 집 값의 ${SEA_COTTAGE_RATE}배예요. 다른 집이 있으면 다주택자 가격이라 ${SEA_VILLA_RATE}배예요.`}
            </p>
          )}
          {!sea && !camp && isVilla && <p className={styles.tag}>이미 다른 집이 있어서 다주택자 가격(약 1.3배)이에요. 넓히기도 다주택자 가격이에요.</p>}
          {kept > 0 && <p className={styles.tag}>가방에 가구 {kept}개가 있어요. 분양받으면 바로 놓을 수 있어요.</p>}
          {/* 11/26 캠핑장은 터 크기 대신 터를 고른다 (같은 그림 카드 — 빈 터는 값, 분양된 터는 주인) */}
          {camp === "caravan" && free !== null && free.length > 0 && (
            <div ref={stepsRef}>
              <CaravanSteps step={cvStep} />
            </div>
          )}
          {camp ? (
            free === null ? (
              <p className={styles.muted}>터를 살펴보는 중…</p>
            ) : cvStep === 2 && campLot !== null && campDesign ? (
              // 11/27 카라반 2단계: 고른 자리(위치 이름·값) + 모델·몸통 색·차양 색 (큰 미리보기). 자리 다시 고르기를 눌러도 디자인은 그대로
              <div className={styles.stack}>
                <div className={styles.spread}>
                  <p className={styles.tag}>
                    고른 자리: <strong>{campLotName(campLot)}</strong> · {fmt(cost)}P
                  </p>
                  <button type="button" className={ui.button} style={{ whiteSpace: "nowrap" }} onClick={() => toStep("back")} disabled={pending || busy}>
                    ← 자리 바꾸기
                  </button>
                </div>
                <CaravanDesignPicker value={campDesign} onChange={(d) => cvDo({ type: "design", design: d })} xmas={xmas} disabled={pending || busy} />
              </div>
            ) : (
              <CampLotPicker
                lots={CAMP_LOTS.filter((l) => l.kind === camp).map((l) => ({
                  lot: l,
                  price: campP?.lots[l.lot] ?? null,
                  owner: campOwners.get(l.lot) ?? null,
                  mine: false,
                  free: free.includes(l.lot),
                  // 11/26 분양된 터 = 주인 디자인. 11/27 빈 터 = 고른 터만 2단계에서 고른 디자인, 나머지는 그 자리 기본 모습 (터를 눌러도 디자인은 안 바뀐다)
                  ...(l.kind === "caravan" ? { design: free.includes(l.lot) ? caravanCardDesign(cvCard, l.lot) : campDesigns.get(l.lot) } : {}),
                  // 포구 터 크기 카드의 넓히기 안내 자리: 앞마당 값 (이 사람 기준)
                  ...(campP?.yard[l.lot] ? { hint: yardHint(campP.yard[l.lot]) } : {}),
                }))}
                value={campLot}
                onChange={(l) => cvDo({ type: "lot", lot: l })}
                points={my.points}
                disabled={pending || busy}
                xmas={xmas}
              />
            )
          ) : (
            <TierPicker
              value={pick}
              onChange={setPick}
              points={my.points}
              disabled={pending || busy}
              {...(sea ? { cottage: style, costOf: seaCost, hintOf: (i: number) => seaHint(i, isVilla) } : isVilla ? { costOf: villageCost } : {})}
            />
          )}
          {sea && <CottageStylePicker value={style} onChange={setStyle} tier={pick} disabled={pending || busy} />}
          {/* 11/27 카라반 1단계 끝: 다음 단계로 (디자인은 분양가와 상관없다) */}
          {camp === "caravan" && cvStep === 1 && campLot !== null && (
            <button
              type="button"
              className={cx(ui.button, ui.primary)}
              onClick={() => toStep("next")}
              disabled={pending || busy}
            >
              다음: {campLotName(campLot)} 디자인 고르기
            </button>
          )}
          {camp ? (
            campLot !== null && (
              <p className={styles.points}>
                {campLotName(campLot)} 분양가 <strong>{fmt(cost)}P</strong> · 내 포인트 <strong>{fmt(my.points)}P</strong>
              </p>
            )
          ) : (
            // 남은 터가 없으면 분양가·고른 자리·부족 안내는 빼고 아래 「남은 ○○이 없어요」만
            !soldOut && (
              <p className={styles.points}>
                {plot.name} 분양가 <strong>{fmt(cost)}P</strong> · 내 포인트 <strong>{fmt(my.points)}P</strong>
              </p>
            )
          )}
          {lot !== null && !camp && !soldOut && <p className={styles.tag}>고른 자리: {labelOf(channel, lot)}</p>}
          {short && camp && campLot !== null && (
            <p className={styles.error}>
              {campLotName(campLot)} 분양까지 {fmt(cost - my.points)}P 부족해요. 출석이나 헌화로 더 모아 주세요.
              {free && campP && free.some((l) => (campP.lots[l] ?? Infinity) <= my.points) ? " 더 싼 터를 고를 수도 있어요." : ""}
            </p>
          )}
          {short && !camp && !soldOut && (
            <p className={styles.error}>
              {plot.name} 분양까지 {fmt(cost - my.points)}P 부족해요. 출석이나 헌화로 더 모아 주세요.
              {pick !== "small" && my.points >= (sea ? seaCost("small") : villageCost("small")) ? " 작은 터는 지금 바로 살 수 있어요." : ""}
            </p>
          )}
          {/* 11/26 모든 분양 창 같은 안내: 이 채널에 남은 터가 없으면 이름 칸·분양 단추 대신 이 말 (+ 터가 남은 채널) */}
          {soldOut && (
            <>
              <p className={styles.error} role="status">
                {soldOutLine(saleKind, channel)}
              </p>
              {openChs && <p className={styles.tag}>{openChannelsLine(saleKind, openChs)}</p>}
            </>
          )}
        </div>
        {/* 캠핑장은 터마다 값이 달라 포인트가 모자라도 고르기 칸은 남긴다 (더 싼 터를 고를 수 있게 — 분양 단추만 막는다) */}
        {!soldOut && (camp ? free !== null && free.length > 0 && !priceUnknown && (camp !== "caravan" || cvStep === 2) : !short && !(sea && villa === null && !prices)) &&
          form(
            camp
              ? `${campLot !== null ? `${channel}채널 ${campLotName(campLot)} ` : ""}분양받기 (${fmt(cost)}P)`
              : `${lot ? `${labelOf(channel, lot)}에 ` : `${channel}채널${sea ? " 포구" : ""}에 `}${plot.name} ${sea ? "오두막 " : ""}분양받기 (${fmt(cost)}P)`,
            () =>
              camp
                ? campLot !== null &&
                  run(
                    () => housingApi.buyCamp(channel, campLot, name, intro, camp, campDesign ?? undefined),
                    `분양을 축하해요! ${channel}채널 캠핑장에 ${josa(campLotName(campLot), "이", "가")} 생겼어요.`,
                  )
                : sea
                ? run(() => housingApi.buyCottage(channel, name, intro, lot, pick, style), `분양을 축하해요! ${channel}채널 포구에 ${plot.name} 오두막이 생겼어요.`)
                : run(() => housingApi.buyPlot(channel, name, intro, lot, pick), `분양을 축하해요! ${channel}채널 주거 구역에 ${plot.name} 집이 생겼어요.`),
            true,
          )}
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    );
  }

  const tier = tierById(h.tier)!;
  const up = nextTier(h.tier);
  // 오두막 넓히기 값은 배수를 곱한다 (마을 집이 있으면 별장 배수 — 서버 upgradePlot과 같은 규칙)
  // 11/26 넓히기 값도 서버 값표 (별장이면 4/3). 옛 서버 응답이면 예전 계산
  const upPrice = up ? (prices?.upgrade?.to === up.id ? prices.upgrade.price : sea ? seaUpgradeCost(up.price, isVilla) : up.price) : 0;
  const tag = styleTag(h.layout);
  /** 내 집이 지금 채널이 아닌 다른 채널에 있다 (보러 가기·들어가기·꾸미기는 그 채널로 옮긴 뒤) */
  const away = h.ch !== channel;
  // 11/26 캠핑장 집: 종류·앞마당 단계·방 크기 (모든 종류가 앞마당 단계로 방이 커진다 — 펜션·촌캉스 넓히기는 앞마당에 합쳤다)
  const ci = camp ? campOf(h) : null;
  // 옛 「넓힌 집」 기록(tier wide)은 3단계 방 (서버 catalog houseShape와 같다)
  const room = ci ? campRoom(ci.kind, ci.kind !== "caravan" && h.tier !== "small" ? 3 : ci.yard) : null;
  /** 이 창의 NPC가 파는 종류와 내 캠핑장 집 종류가 다르면 관리(앞마당)는 그 종류 NPC에게 */
  const otherKind = !!ci && ci.kind !== camp;
  const sizeBonus = camp ? houseSizeBonus(h) : TIER_SCORE_BONUS[h.tier];
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <div className={styles.spread}>
          <p className={styles.houseName}>{h.name}</p>
          <TitleBadge score={h.score} />
        </div>
        {h.intro && <p className={styles.muted}>{h.intro}</p>}
        {ci && room ? (
          <p className={styles.small}>
            {h.ch}채널 캠핑장 {campLotName(h.lot)}
            {h.villa ? " · 다주택자 가격" : ""} · 앞마당 {ci.yard}단계 · 방 {room.w}×{room.h}칸 · 물건 {h.layout.items.filter((p) => !p.i.startsWith("fx_")).length}/{room.maxItems}개
          </p>
        ) : (
          <p className={styles.small}>
            {houseLabel(h)} · {tier.name} {tier.w}×{tier.h}칸 · 물건 {h.layout.items.length}/{tier.maxItems}개{tag ? ` · ${tag}` : ""}
            {sea ? ` · ${COTTAGE_STYLES.find((c) => c.id === h.style)?.name ?? COTTAGE_STYLES[0].name}` : ""}
          </p>
        )}
        {ci && otherKind && (
          <p className={styles.tag}>
            캠핑장 집은 한 사람당 한 채예요. {CAMP_HOME_KIND_NAME[ci.kind]} 앞마당은 {HOST[ci.kind].name}에게 물어봐요.
          </p>
        )}
        {/* 11/19 2단지를 닫으며 메인 맵 빈 번지가 없어 「필지 대기」인 집 (번지 0) · 아직 옮기기 전인 2단지 번지 */}
        {!sea && !camp && (h.lot === 0 || h.lot > WORLD_LOTS) && <p className={styles.tag}>주거 구역에 빈 집터가 나면 바로 옮겨 드려요. 그동안 집 안에는 들어갈 수 있어요.</p>}
        {away && (
          <p className={styles.tag}>
            {sea
              ? `내 오두막은 ${h.ch}채널 포구에 있어요. 지금은 ${channel}채널이에요. 꾸미기·넓히기는 ${h.ch}채널에서 할 수 있어요.`
              : camp
                ? `내 캠핑장 집은 ${h.ch}채널에 있어요. 지금은 ${channel}채널이에요. 꾸미기·앞마당은 ${h.ch}채널에서 할 수 있어요.`
                : `내 집은 ${h.ch}채널에 있어요. 지금은 ${channel}채널이에요. 아래 버튼을 누르면 ${h.ch}채널로 옮긴 다음 가요.`}
          </p>
        )}
        <p className={styles.score}>
          꾸밈 점수 <strong>{fmt(h.score)}</strong>{" "}
          <span className={styles.small}>
            (물건 {fmt(h.placedScore)} + 좋아요 {h.likes}×{LIKE_WEIGHT}
            {sizeBonus > 0 ? ` + ${camp ? "집 크기" : tier.name} ${sizeBonus}` : ""})
          </span>
        </p>
        <TitleProgress score={h.score} />
        <div className={styles.row}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => onEnter(false)} disabled={busy}>
            {sea ? "오두막 들어가기" : "내 집 들어가기"}
          </button>
          <button type="button" className={ui.button} onClick={() => onEnter(true)} disabled={busy || ((sea || !!camp) && away)}>
            들어가서 꾸미기
          </button>
          {camp ? (
            ci?.kind === "caravan" &&
            !otherKind && (
              <button type="button" className={ui.button} onClick={() => setRedesign((v) => (v ? null : caravanDesignOf(h.lot, ci.design)))} disabled={busy} aria-expanded={!!redesign}>
                디자인 바꾸기
              </button>
            )
          ) : sea ? (
            <button type="button" className={ui.button} onClick={() => setRestyle((v) => !v)} disabled={busy} aria-expanded={restyle}>
              겉모습 바꾸기
            </button>
          ) : (
            <button type="button" className={ui.button} onClick={onExterior} disabled={busy}>
              외관 꾸미기
            </button>
          )}
          {/* 11/26 캠핑장 집 앞으로는 캠핑장에 있을 때만 (지금 채널 집) */}
          {camp && inCamp && !away && (
            <button type="button" className={ui.button} onClick={() => onVillage(h.lot, true)} disabled={busy}>
              내 집 앞으로 가기
            </button>
          )}
          {!camp && !(sea && away) && (sea || (h.lot >= 1 && h.lot <= WORLD_LOTS)) && (
            <button type="button" className={ui.button} onClick={() => onVillage(h.lot, true)} disabled={busy}>
              {sea ? "내 오두막 보러 가기" : away ? `${h.ch}채널 내 집 보러 가기` : "내 집 보러 가기"}
            </button>
          )}
          <button
            type="button"
            className={cx(ui.button, ui.quiet)}
            onClick={() => {
              setName(h.name);
              setIntro(h.intro);
              setEditing((v) => !v);
            }}
            aria-expanded={editing}
          >
            이름·소개 바꾸기
          </button>
        </div>
      </div>
      {sea && restyle && (
        <div className={styles.card}>
          <p className={styles.muted}>오두막 겉모습은 무료로 바꿀 수 있어요. 포구에 선 오두막 그림이 바로 바뀌어요.</p>
          <CottageStylePicker
            value={h.style ?? "wood"}
            tier={h.tier}
            disabled={pending || busy}
            onChange={(s) => s !== (h.style ?? "wood") && void run(() => housingApi.setCottageStyle(s), `${COTTAGE_STYLES.find((c) => c.id === s)?.name}으로 바꿨어요.`)}
          />
        </div>
      )}
      {/* 11/26 카라반 디자인 바꾸기 (무료 — 고른 뒤 「바꾸기」로 확인) */}
      {ci?.kind === "caravan" && !otherKind && redesign && (
        <div className={styles.card}>
          <p className={styles.muted}>카라반 디자인은 무료로 바꿀 수 있어요. 지금은 {caravanDesignName(caravanDesignOf(h.lot, ci.design))}이에요.</p>
          <CaravanDesignPicker value={redesign} onChange={setRedesign} xmas={xmas} disabled={pending || busy} owned />
          <div className={styles.row}>
            <button
              type="button"
              className={cx(ui.button, ui.primary)}
              disabled={pending || busy || sameCaravanDesign(redesign, caravanDesignOf(h.lot, ci.design))}
              onClick={() => {
                const next = redesign;
                void run(async () => {
                  const r = await housingApi.setCaravanDesign(next);
                  setRedesign(null);
                  return r;
                }, `${caravanDesignName(next)}으로 바꿨어요.`);
              }}
            >
              이 디자인으로 바꾸기 (무료)
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setRedesign(null)} disabled={pending}>
              그만두기
            </button>
          </div>
        </div>
      )}
      {editing && form("저장", () => run(() => housingApi.editProfile(name, intro, sea ? "sea" : camp ? "camp" : "village"), "바꿨어요."))}
      {ci && !otherKind && (
        <CampUpgrades
          h={h}
          yard={ci.yard}
          points={my.points}
          yardPrice={ci.yard < 3 ? (prices?.yard?.price ?? (campLotByNo(h.lot) ? campYardPrice(campLotByNo(h.lot)!, (ci.yard + 1) as 2 | 3, !!h.villa) : 0)) : 0}
          disabled={pending || busy}
          away={away}
          cardRef={upCard}
          minHeight={upMin}
          onYard={() => {
            holdUpCard();
            void run(() => housingApi.yardUp(channel), `앞마당을 ${ci.yard + 1}단계로 올렸어요!`);
          }}
        />
      )}
      {!camp && (
      <div className={styles.card} ref={upCard} style={upMin ? { minHeight: upMin } : undefined}>
        <p className={styles.points}>
          내 포인트 <strong>{fmt(my.points)}P</strong>
        </p>
        {up ? (
          <>
            <p className={styles.muted}>
              {sea
                ? `오두막은 한 채만 가질 수 있어요. 대신 ${up.name}(${up.w}×${up.h}칸, 물건 ${up.maxItems}개)으로 넓힐 수 있어요. 놓아 둔 물건은 그대로예요. 포구에 선 오두막도 더 크게 바뀌어요.`
                : `집은 한 채만 가질 수 있어요. 대신 ${up.name}(${up.w}×${up.h}칸, 물건 ${up.maxItems}개)으로 넓힐 수 있어요. 놓아 둔 물건은 그대로예요. 마을에 있는 집도 더 크게 바뀌어요.`}
            </p>
            {/* 11/22 터 크기 꾸밈 점수 (누적 값) */}
            <p className={styles.small}>넓히면 꾸밈 점수도 올라요 ({TIER_SCORE_NOTE}).</p>
            <TierCompare exterior={h.exterior} current={h.tier} {...(sea ? { cottage: h.style ?? "wood" } : {})} />
            <button
              type="button"
              className={ui.button}
              disabled={pending || busy || my.points < upPrice || away}
              onClick={() => {
                holdUpCard();
                void run(() => housingApi.upgrade(channel, up.id, sea ? "sea" : "village"), `${up.name}으로 넓혔어요!`);
              }}
            >
              {fmt(upPrice)}P로 {up.name} 만들기{away ? ` · ${h.ch}채널에서 할 수 있어요` : my.points < upPrice ? ` · ${fmt(upPrice - my.points)}P 부족해요` : ""}
            </button>
          </>
        ) : (
          <>
            <p className={styles.muted}>가장 넓은 {tier.name}이에요.</p>
            <TierCompare exterior={h.exterior} current={h.tier} {...(sea ? { cottage: h.style ?? "wood" } : {})} />
          </>
        )}
      </div>
      )}
      <p className={styles.notice} role="status">
        {msg}
      </p>
    </div>
  );
}

/**
 * 11/26 캠핑장 집 앞마당 칸 (마을 집 넓히기 카드와 같은 모양): 모든 종류가 앞마당 다음 단계를 올리면 방도 커진다
 * (펜션·촌캉스 넓히기는 앞마당에 합쳤다). 값은 서버 값표(prices.yard), 옛 응답이면 같은 규칙으로 센다
 */
function CampUpgrades({
  h,
  yard,
  points,
  yardPrice,
  disabled,
  away,
  cardRef,
  minHeight,
  onYard,
}: {
  h: { ch: number; lot: number; tier: string; villa?: boolean };
  yard: 1 | 2 | 3;
  points: number;
  yardPrice: number;
  disabled: boolean;
  away: boolean;
  /** 앞마당을 누른 순간 높이를 재는 칸 · 그 뒤 최소 높이 (마지막 단계에서 카드가 짧아져 창이 튀지 않게 — MyPlot holdUpCard) */
  cardRef: RefObject<HTMLDivElement | null>;
  minHeight: number | undefined;
  onYard: () => void;
}) {
  const l = campLotByNo(h.lot);
  const next = yard < 3 ? ((yard + 1) as 2 | 3) : null;
  const tail = (price: number) => (away ? ` · ${h.ch}채널에서 할 수 있어요` : points < price ? ` · ${fmt(price - points)}P 부족해요` : "");
  return (
    <div className={styles.card} ref={cardRef} style={minHeight ? { minHeight } : undefined}>
      <p className={styles.points}>
        내 포인트 <strong>{fmt(points)}P</strong>
      </p>
      {next && l ? (
        <>
          <p className={styles.muted}>캠핑장 집은 한 채만 가질 수 있어요. 대신 앞마당을 올리면 마당도 방도 커져요. 놓아 둔 물건은 그대로예요.</p>
          <p className={styles.muted}>
            앞마당 {next}단계: {yardChangeLine(l, yard)}
          </p>
          {h.villa && <p className={styles.small}>다른 집이 있을 때 산 집이라 앞마당도 다주택자 가격이에요.</p>}
          <button type="button" className={ui.button} disabled={disabled || points < yardPrice || away} onClick={onYard}>
            {fmt(yardPrice)}P로 앞마당 {next}단계 만들기{tail(yardPrice)}
          </button>
        </>
      ) : (
        <p className={styles.muted}>앞마당은 가장 높은 3단계예요.</p>
      )}
    </div>
  );
}

function HouseList({ onVisit, myId, busy }: { onVisit: (id: string) => void; myId: string | null; busy: boolean }) {
  const [sort, setSort] = useState<HouseSort>("score");
  const [data, setData] = useState<{ sort: HouseSort; houses: HouseSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    housingApi
      .list(sort, ac.signal)
      .then((r) => {
        setData({ sort: r.sort, houses: r.houses });
        setError(null);
      })
      .catch((e) => {
        if (!isAbortError(e)) setError(errorMessage(e));
      });
    return () => ac.abort();
  }, [sort]);

  const houses = data?.sort === sort ? data.houses : null;
  return (
    <div className={styles.stack}>
      <div className={styles.sorts} role="group" aria-label="정렬">
        {SORTS.map((s) => (
          <button key={s} type="button" className={ui.button} aria-pressed={sort === s} onClick={() => setSort(s)}>
            {SORT_LABELS[s]}
          </button>
        ))}
      </div>
      <p className={styles.small}>
        {sort === "new" ? "최근에 분양된 집이에요." : `${SORT_LABELS[sort]} 순 상위 50곳이에요. 꾸밈 점수는 놓은 물건 점수에 좋아요 × ${LIKE_WEIGHT}와 터 크기 점수(${TIER_SCORE_NOTE})를 더한 값이에요.`}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {!houses && !error && <p className={styles.muted}>불러오는 중…</p>}
      {houses?.length === 0 && <p className={styles.muted}>아직 분양된 집이 없어요. 첫 주인이 되어 보세요.</p>}
      {houses && houses.length > 0 && (
        <ol className={styles.list}>
          {houses.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                className={styles.listItem}
                onClick={() => onVisit(h.id)}
                disabled={busy}
                aria-label={`${i + 1}위 ${h.name}, ${h.ownerName}의 집, 꾸밈 점수 ${h.score}, 좋아요 ${h.likes}. 놀러 가기`}
              >
                <span className={styles.rank} data-top={sort !== "new" && i < 3}>
                  {sort === "new" ? "·" : i + 1}
                </span>
                {/* 11/16 닉네임 12자 · 집 이름 20자: 집 이름 / 호칭 · 주인 / 번지 · 터를 한 줄씩, 넘치면 "…" (전체는 title). (내 집)은 잘리지 않게 따로 */}
                <span className={styles.listMain}>
                  <span className={styles.listHead}>
                    <span className={styles.listName} title={h.name}>
                      {h.name}
                    </span>
                    {h.id === myId && <span className={styles.listMine}>내 집</span>}
                  </span>
                  <span className={styles.listMeta}>
                    <TitleBadge score={h.score} />
                    <span className={styles.listOwner} title={h.ownerName}>
                      {h.ownerName}
                    </span>
                  </span>
                  <span className={styles.listWhere}>
                    {houseLabel(h)} · {tierById(h.tier)?.name}
                  </span>
                </span>
                <span className={styles.listStat}>
                  <strong>{fmt(h.score)}</strong>좋아요 {h.likes}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 11/16 오두막 터 크기 카드 아래 안내 (넓히기 값도 같은 배수) */
function seaHint(i: number, villa: boolean): string {
  if (i === 0) {
    const up = PLOT_TIERS[1];
    return up ? `분양받은 뒤 더 큰 터로 넓힐 수 있어요 (${up.name} +${fmt(seaUpgradeCost(up.price, villa))}P)` : "";
  }
  const steps = PLOT_TIERS.slice(0, i + 1)
    .map((t, k) => `${fmt(k === 0 ? seaPlotCost(t.id, villa) : seaUpgradeCost(t.price, villa))}P`)
    .join(" + ");
  return `${PLOT_TIERS[0].name}에서 업그레이드로도 넓힐 수 있어요 (${steps})`;
}

/** 11/27 카라반 분양 순서 표시 (1 자리 고르기 · 2 모델·색 고르기) */
function CaravanSteps({ step }: { step: 1 | 2 }) {
  return (
    <ol className={styles.buySteps} aria-label="분양 순서">
      {(["자리 고르기", "모델·색 고르기"] as const).map((t, i) => (
        <li key={t} aria-current={step === i + 1 ? "step" : undefined}>
          <span>{i + 1}</span>
          {t}
        </li>
      ))}
    </ol>
  );
}
