"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage, isAbortError } from "@/lib/api";
import { SEA_LOTS } from "@tomb/protocol";
import {
  COTTAGE_STYLES,
  HOUSE_INTRO_MAX,
  HOUSE_NAME_MAX,
  houseLabel,
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
  tierById,
  type CottageStyleId,
  type HouseSort,
  type PlotTierId,
} from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { styleTag } from "@/lib/housing/layout";
import { isOpenLot, MAIN_LOTS, WORLD_LOTS } from "@tomb/protocol";
import type { HouseSummary, MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { CottageStylePicker, fmt, TierCompare, TierPicker, TitleBadge, TitleProgress } from "./parts";

type Tab = "mine" | "browse";

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
  zone?: "sea";
  /** 포구: 마을 집이 있는지 (별장 값). 모르면 null */
  villa?: boolean | null;
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
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "mine");
  const id = useId();
  const sea = zone === "sea";
  return (
    <Dialog title={sea ? "포구 부동산" : "분양 사무소"} onClose={onClose}>
      <div className={styles.stack}>
        <div className={styles.spread}>
          <p className={styles.small}>
            {sea
              ? `달물결 포구 곳곳에 오두막 터가 ${SEA_LOTS.length}곳 있어요. 채널마다 터가 따로 있어요. 지금 ${channel}채널의 빈 터를 골라 분양받아요.`
              : `광장 동쪽 주거 구역에 집들이 있어요. 채널마다 주거 구역이 따로 있어요. 지금 ${channel}채널의 빈 자리를 골라 분양받아요.`}
          </p>
          {!sea && (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => (inVillage ? onClose() : onVillage(null))} disabled={busy}>
              {inVillage ? "마을로 돌아가기" : "주거 구역 보기"}
            </button>
          )}
        </div>
        <div className={styles.warn} role="note">
          <strong>
            <span className={styles.warnTag}>주의</span>
            {RECLAIM_DAYS}일 동안 접속하지 않으면 {sea ? "오두막도" : "집이"} 철거돼요
          </strong>
          <p>집 가격은 100% 선물함으로 돌려드리고, 가구는 그대로 저장돼요. 철거된 자리는 다른 사람이 분양받을 수 있어요.</p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="분양 사무소">
          {(["mine", "browse"] as const).map((t) => (
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
              {t === "mine" ? (sea ? "내 오두막" : "내 집") : "둘러보기 · 랭킹"}
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
          {tab === "mine" ? (
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
  zone?: "sea";
  villa: boolean | null;
}) {
  const sea = zone === "sea";
  const [lot, setLot] = useState<number | null>(presetLot);
  const [free, setFree] = useState<number[] | null>(null);
  /** 오두막 겉모습 (분양 때 고르고, 분양 뒤 「겉모습 바꾸기」로 바꾼다) */
  const [style, setStyle] = useState<CottageStyleId>("wood");
  const [restyle, setRestyle] = useState(false);
  const noHouse = !!my && !my.house;
  useEffect(() => {
    if (!noHouse) return;
    let alive = true;
    housingApi
      .village(channel, false, sea ? "sea" : "village")
      .then((v) => {
        if (!alive) return;
        const used = new Set([...v.houses.map((h) => h.lot), ...v.taken]);
        // 11/16 포구: 그 채널의 오두막 터 중 빈 터
        if (sea) return setFree(SEA_LOTS.map((l) => l.n).filter((l) => !used.has(l)));
        // 메인 맵 주거 구역(1..WORLD_LOTS, 11/19 등불 골목 10~15번지 포함)의 빈 필지만. 2단지는 닫았다 — 다 차면 빈 목록 (자동 분양도 「다 찼어요」)
        setFree(Array.from({ length: WORLD_LOTS }, (_, i) => i + 1).filter((l) => isOpenLot(l) && !used.has(l)));
      })
      .catch(() => alive && setFree([]));
    return () => {
      alive = false;
    };
  }, [noHouse, channel, sea]);
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /** 처음 분양받을 터 크기 (넓은 터·대저택도 바로 살 수 있다) */
  const [pick, setPick] = useState<PlotTierId>("small");
  const fid = useId();

  if (!my) return <p className={styles.muted}>{error ?? "분양 장부를 펼치는 중…"}</p>;

  const plot = tierById(pick)!;
  const seaCost = (t: PlotTierId) => seaPlotCost(t, !!villa);
  // 11/18 마을 집: 포구 오두막이 먼저 있으면 별장 값 차이를 더한다 (서버가 알려 준다 — my.villaFee)
  const villaFee = sea ? 0 : (my.villaFee ?? 0);
  const villageCost = (t: PlotTierId) => plotCost(t) + villaFee;
  const cost = sea ? seaCost(pick) : villageCost(pick);
  const labelOf = (ch: number, l: number) => (sea ? seaLotLabel(ch, l) : lotLabel(ch, l));
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
        <span className={cx(ui.label, ui.required)}>
          집 이름 <span className={ui.counter}>{[...name].length}/{HOUSE_NAME_MAX}</span>
        </span>
        <input id={`${fid}-name`} className={ui.input} value={name} maxLength={HOUSE_NAME_MAX + 4} onChange={(e) => setName(e.target.value)} placeholder="예) 달빛 서재" required />
      </label>
      <label className={ui.field} htmlFor={`${fid}-intro`}>
        <span className={ui.label}>
          한 줄 소개 <span className={ui.counter}>{[...intro].length}/{HOUSE_INTRO_MAX}</span>
        </span>
        <input id={`${fid}-intro`} className={ui.input} value={intro} maxLength={HOUSE_INTRO_MAX + 4} onChange={(e) => setIntro(e.target.value)} placeholder="찾아온 손님에게 한마디" />
      </label>
      {withLot && (
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
                {sea ? `${l}번 터${SEA_LOTS.find((x) => x.n === l)?.deck ? " (바다 쪽 데크)" : ""}` : `${l}번지${l > MAIN_LOTS ? " (등불 골목)" : ""}`}
              </option>
            ))}
            {lot !== null && !free?.includes(lot) && <option value={lot}>{sea ? `${lot}번 터` : `${lot}번지`}</option>}
          </select>
        </label>
      )}
      {withLot && (
        <p className={styles.warnLine}>
          {RECLAIM_DAYS}일 동안 접속하지 않으면 {sea ? "오두막이" : "집이"} 철거돼요. 집 가격은 100% 돌려드리고 가구는 그대로 저장돼요.
        </p>
      )}
      <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || busy || !name.trim()}>
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
          <p className={styles.houseName}>{sea ? "바닷가 오두막을 분양받아 보세요" : "나만의 집을 분양받아 보세요"}</p>
          <p className={styles.muted}>
            {sea
              ? "포구의 오두막 터를 드려요. 해먹·라탄 의자·서핑보드·소라 장식·구명 튜브가 놓인 채로 시작해요. 방 아래쪽 창으로 지금 물때의 바다가 보여요."
              : "주거 구역에 내 터를 드려요. 큰 터를 바로 살 수도 있고, 작은 터로 시작해 나중에 넓혀도 돼요. 가구와 소품으로 꾸미면 꾸밈 점수가 올라요. 놀러 온 사람들이 좋아요와 방명록을 남겨 줘요."}
          </p>
          {sea && (
            <p className={styles.tag}>
              {villa === null ? "값을 확인하는 중…" : villa ? `마을 집이 있어서 별장 값이에요 (마을 집 값의 ${SEA_VILLA_RATE}배).` : `마을 집 값의 ${SEA_COTTAGE_RATE}배예요. 마을 집이 있으면 별장이라 ${SEA_VILLA_RATE}배예요.`}
            </p>
          )}
          {villaFee > 0 && <p className={styles.tag}>포구 오두막이 있어서 오두막이 별장이 돼요. 별장 값 차이 {fmt(villaFee)}P가 분양가에 더해져요.</p>}
          {kept > 0 && <p className={styles.tag}>가방에 가구 {kept}개가 있어요. 분양받으면 바로 놓을 수 있어요.</p>}
          <TierPicker
            value={pick}
            onChange={setPick}
            points={my.points}
            disabled={pending || busy}
            {...(sea ? { cottage: style, costOf: seaCost, hintOf: (i: number) => seaHint(i, !!villa) } : villaFee > 0 ? { costOf: villageCost } : {})}
          />
          {sea && <CottageStylePicker value={style} onChange={setStyle} tier={pick} disabled={pending || busy} />}
          <p className={styles.points}>
            {plot.name} 분양가 <strong>{fmt(cost)}P</strong> · 내 포인트 <strong>{fmt(my.points)}P</strong>
          </p>
          {lot !== null && <p className={styles.tag}>고른 자리: {labelOf(channel, lot)}</p>}
          {short && (
            <p className={styles.error}>
              {plot.name} 분양까지 {fmt(cost - my.points)}P 부족해요. 출석이나 헌화로 더 모아 주세요.
              {pick !== "small" && my.points >= (sea ? seaCost("small") : villageCost("small")) ? " 작은 터는 지금 바로 살 수 있어요." : ""}
            </p>
          )}
          {sea && free?.length === 0 && <p className={styles.error}>{channel}채널 포구에는 빈 오두막 터가 없어요. 다른 채널에서 찾아봐요.</p>}
        </div>
        {!short &&
          !(sea && (villa === null || free?.length === 0)) &&
          form(
            `${lot ? `${labelOf(channel, lot)}에 ` : `${channel}채널${sea ? " 포구" : ""}에 `}${plot.name} ${sea ? "오두막 " : ""}분양받기 (${fmt(cost)}P)`,
            () =>
              sea
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
  const upPrice = up ? (sea ? seaUpgradeCost(up.price, !!villa) : up.price) : 0;
  const tag = styleTag(h.layout);
  /** 내 집이 지금 채널이 아닌 다른 채널에 있다 (보러 가기·들어가기·꾸미기는 그 채널로 옮긴 뒤) */
  const away = h.ch !== channel;
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <div className={styles.spread}>
          <p className={styles.houseName}>{h.name}</p>
          <TitleBadge score={h.score} />
        </div>
        {h.intro && <p className={styles.muted}>{h.intro}</p>}
        <p className={styles.small}>
          {houseLabel(h)} · {tier.name} {tier.w}×{tier.h}칸 · 물건 {h.layout.items.length}/{tier.maxItems}개{tag ? ` · ${tag}` : ""}
          {sea ? ` · ${COTTAGE_STYLES.find((c) => c.id === h.style)?.name ?? COTTAGE_STYLES[0].name}` : ""}
        </p>
        {/* 11/19 2단지를 닫으며 메인 맵 빈 번지가 없어 「필지 대기」인 집 (번지 0) · 아직 옮기기 전인 2단지 번지 */}
        {!sea && (h.lot === 0 || h.lot > WORLD_LOTS) && <p className={styles.tag}>주거 구역에 빈 집터가 나면 바로 옮겨 드려요. 그동안 집 안에는 들어갈 수 있어요.</p>}
        {away && (
          <p className={styles.tag}>
            {sea
              ? `내 오두막은 ${h.ch}채널 포구에 있어요. 지금은 ${channel}채널이에요. 꾸미기·넓히기는 ${h.ch}채널에서 할 수 있어요.`
              : `내 집은 ${h.ch}채널에 있어요. 지금은 ${channel}채널이에요. 아래 버튼을 누르면 ${h.ch}채널로 옮긴 다음 가요.`}
          </p>
        )}
        <p className={styles.score}>
          꾸밈 점수 <strong>{fmt(h.score)}</strong>{" "}
          <span className={styles.small}>
            (물건 {fmt(h.placedScore)} + 좋아요 {h.likes}×{LIKE_WEIGHT})
          </span>
        </p>
        <TitleProgress score={h.score} />
        <div className={styles.row}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => onEnter(false)} disabled={busy}>
            {sea ? "오두막 들어가기" : "내 집 들어가기"}
          </button>
          <button type="button" className={ui.button} onClick={() => onEnter(true)} disabled={busy || (sea && away)}>
            들어가서 꾸미기
          </button>
          {sea ? (
            <button type="button" className={ui.button} onClick={() => setRestyle((v) => !v)} disabled={busy} aria-expanded={restyle}>
              겉모습 바꾸기
            </button>
          ) : (
            <button type="button" className={ui.button} onClick={onExterior} disabled={busy}>
              외관 꾸미기
            </button>
          )}
          {!(sea && away) && (sea || (h.lot >= 1 && h.lot <= WORLD_LOTS)) && (
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
      {editing && form("저장", () => run(() => housingApi.editProfile(name, intro, sea ? "sea" : "village"), "바꿨어요."))}
      <div className={styles.card}>
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
            <TierCompare exterior={h.exterior} current={h.tier} {...(sea ? { cottage: h.style ?? "wood" } : {})} />
            <button
              type="button"
              className={ui.button}
              disabled={pending || busy || my.points < upPrice || away}
              onClick={() => run(() => housingApi.upgrade(channel, up.id, sea ? "sea" : "village"), `${up.name}으로 넓혔어요!`)}
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
      <p className={styles.notice} role="status">
        {msg}
      </p>
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
        {sort === "new" ? "최근에 분양된 집이에요." : `${SORT_LABELS[sort]} 순 상위 50곳이에요. 꾸밈 점수는 놓은 물건 점수에 좋아요 × ${LIKE_WEIGHT}를 더한 값이에요.`}
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
