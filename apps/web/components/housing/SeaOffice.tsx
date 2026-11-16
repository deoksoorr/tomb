"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { SEA_LOTS } from "@tomb/protocol";
import { cottagePreviewUrl } from "@/game/sea/seaCottageArt";
import { errorMessage } from "@/lib/api";
import {
  COTTAGE_STYLES,
  HOUSE_INTRO_MAX,
  HOUSE_NAME_MAX,
  houseLabel,
  nextTier,
  PLOT_TIERS,
  RECLAIM_DAYS,
  SEA_COTTAGE_RATE,
  SEA_LOT_COUNT,
  SEA_VILLA_RATE,
  seaLotLabel,
  seaPlotCost,
  seaUpgradeCost,
  tierById,
  type CottageStyleId,
  type PlotTierId,
} from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse, VillageResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, TitleBadge } from "./parts";

const noop = () => () => undefined;

type Props = {
  channel: number;
  /** 내 포구 오두막 (아직 모르면 null) */
  my: MyHouseResponse | null;
  myError: string | null;
  /** 마을 집이 있는지 (별장 값 판단, 모르면 null) */
  villa: boolean | null;
  onMy: (r: MyHouseResponse) => void;
  /** 내 오두막 들어가기 (edit = 꾸미기로) */
  onEnterMine: (edit: boolean) => void;
  onVisit: (id: string) => void;
  onClose: () => void;
  busy: boolean;
  /** 빈 터 팻말에서 열었으면 그 터 */
  presetLot: number | null;
};

/**
 * 11/16 포구 부동산 창: 이 채널의 오두막 터 6곳 + 내 오두막(들어가기·꾸미기·겉모습·넓히기) + 분양받기.
 * 값은 같은 크기 마을 집의 1.5배, 마을 집이 이미 있으면 별장이라 2배예요
 */
export default function SeaOffice({ channel, my, myError, villa, onMy, onEnterMine, onVisit, onClose, busy, presetLot }: Props) {
  const fid = useId();
  const client = useSyncExternalStore(noop, () => true, () => false);
  const [lots, setLots] = useState<VillageResponse | null>(null);
  const [lotsError, setLotsError] = useState<string | null>(null);
  const [lot, setLot] = useState<number | null>(presetLot);
  const [tier, setTier] = useState<PlotTierId>("small");
  const [style, setStyle] = useState<CottageStyleId>("wood");
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    housingApi
      .village(channel, true, "sea")
      .then((v) => alive && setLots(v))
      .catch((e) => alive && setLotsError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [channel]);

  const run = async (fn: () => Promise<MyHouseResponse>, ok: string) => {
    setPending(true);
    setMsg(null);
    try {
      onMy(await fn());
      setMsg(ok);
      setLots(await housingApi.village(channel, true, "sea").catch(() => lots));
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const mine = my?.house ?? null;
  const taken = new Map((lots?.houses ?? []).map((h) => [h.lot, h]));
  const hidden = new Set(lots?.taken ?? []);
  const free = SEA_LOTS.filter((l) => !taken.has(l.n) && !hidden.has(l.n)).map((l) => l.n);
  const rate = villa ? SEA_VILLA_RATE : SEA_COTTAGE_RATE;
  const cost = seaPlotCost(tier, !!villa);
  const points = my?.points ?? 0;

  const preview = (s: CottageStyleId, t: PlotTierId, scale: number) => {
    if (!client) return <span style={{ width: 96, height: 64, display: "block" }} aria-hidden="true" />;
    const p = cottagePreviewUrl(s, t, scale);
    // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 만든 data URL 그림
    return <img src={p.url} width={p.w} height={p.h} alt="" style={{ imageRendering: "pixelated" }} />;
  };

  return (
    <Dialog title="포구 부동산" onClose={onClose}>
      <div className={styles.stack}>
        <p className={styles.small}>
          {channel}채널 포구에 오두막 터가 {SEA_LOT_COUNT}곳 있어요. 오두막은 같은 크기 마을 집 값의 1.5배이고, 마을 집이 있으면 별장이라 2배예요.
        </p>
        <div className={styles.warn} role="note">
          <strong>
            <span className={styles.warnTag}>주의</span>
            {RECLAIM_DAYS}일 동안 접속하지 않으면 오두막도 철거돼요
          </strong>
          <p>집 가격은 100% 선물함으로 돌려드리고, 가구는 그대로 저장돼요.</p>
        </div>

        {myError && <p className={styles.error}>{myError}</p>}
        {mine && (
          <div className={styles.card}>
            <div className={styles.spread}>
              <div>
                <p className={styles.houseName}>{mine.name}</p>
                <p className={styles.small}>
                  {houseLabel(mine)} · {tierById(mine.tier)?.name} · {COTTAGE_STYLES.find((c) => c.id === mine.style)?.name ?? "나무 오두막"}
                </p>
                <TitleBadge score={mine.score} />
              </div>
              {preview(mine.style ?? "wood", mine.tier, 1)}
            </div>
            {mine.ch !== channel && <p className={styles.tag}>내 오두막은 {mine.ch}채널 포구에 있어요. 꾸미기는 그 채널에서 할 수 있어요.</p>}
            <div className={styles.row}>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || pending} onClick={() => onEnterMine(false)}>
                오두막 들어가기
              </button>
              <button type="button" className={ui.button} disabled={busy || pending || mine.ch !== channel} onClick={() => onEnterMine(true)}>
                꾸미기
              </button>
            </div>
            <p className={styles.small}>겉모습 바꾸기 (무료)</p>
            <div className={styles.tierRow} role="radiogroup" aria-label="오두막 겉모습">
              {COTTAGE_STYLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={(mine.style ?? "wood") === c.id}
                  className={styles.tierCard}
                  data-current={(mine.style ?? "wood") === c.id}
                  data-pick="true"
                  disabled={pending || busy}
                  onClick={() => (mine.style ?? "wood") !== c.id && void run(() => housingApi.setCottageStyle(c.id), `${c.name}으로 바꿨어요.`)}
                >
                  {preview(c.id, mine.tier, 1)}
                  <strong>{c.name}</strong>
                </button>
              ))}
            </div>
            {(() => {
              const up = nextTier(mine.tier);
              if (!up) return null;
              const price = seaUpgradeCost(up.price, !!villa);
              return (
                <button
                  type="button"
                  className={ui.button}
                  disabled={pending || busy || mine.ch !== channel || points < price}
                  onClick={() => void run(() => housingApi.upgrade(channel, up.id, "sea"), `${up.name}으로 넓혔어요.`)}
                >
                  {up.name}으로 넓히기 ({fmt(price)}P)
                </button>
              );
            })()}
          </div>
        )}

        <ul className={styles.stack} aria-label={`${channel}채널 오두막 터`} style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {lotsError && <li className={styles.error}>{lotsError}</li>}
          {SEA_LOTS.map((l) => {
            const h = taken.get(l.n);
            const isMine = !!mine && h?.id === mine.id;
            return (
              <li key={l.n} className={styles.spread} data-lot={l.n}>
                <span className={styles.small}>
                  <strong>{l.n}번 터</strong>
                  {l.deck ? " · 바다 쪽 데크" : ""} · {h ? `${h.name} (${h.ownerName})${isMine ? " · 내 오두막" : ""}` : hidden.has(l.n) ? "주인 있음" : lots ? "빈 터" : "불러오는 중…"}
                </span>
                {h && !isMine ? (
                  <button type="button" className={ui.button} disabled={busy} onClick={() => onVisit(h.id)}>
                    놀러 가기
                  </button>
                ) : !h && !hidden.has(l.n) && lots && !mine ? (
                  <button type="button" className={ui.button} aria-pressed={lot === l.n} onClick={() => setLot(l.n)}>
                    {lot === l.n ? "고름" : "고르기"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {!mine && my && (
          <form
            className={cx(styles.card, styles.stack)}
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => housingApi.buyCottage(channel, name, intro, lot, tier, style),
                `분양을 축하해요! ${lot ? seaLotLabel(channel, lot) : `${channel}채널 포구`}에 오두막이 생겼어요.`,
              );
            }}
          >
            <p className={styles.houseName}>오두막 분양받기</p>
            <p className={styles.small}>
              {villa ? `마을 집이 있어서 별장 값(${SEA_VILLA_RATE}배)이에요.` : `마을 집 값의 ${SEA_COTTAGE_RATE}배예요.`} 해먹·라탄 의자·서핑보드·소라 장식·구명 튜브를 함께 드려요.
            </p>
            <div className={styles.tierRow} role="radiogroup" aria-label="터 크기">
              {PLOT_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tier === t.id}
                  className={styles.tierCard}
                  data-current={tier === t.id}
                  data-pick="true"
                  onClick={() => setTier(t.id)}
                >
                  {preview(style, t.id, 1)}
                  <strong>{t.name}</strong>
                  <span className={styles.small}>
                    방 {t.w}×{t.h}칸
                  </span>
                  <span className={styles.points}>
                    <strong>{fmt(seaPlotCost(t.id, !!villa))}P</strong>
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.tierRow} role="radiogroup" aria-label="오두막 겉모습">
              {COTTAGE_STYLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={style === c.id}
                  className={styles.tierCard}
                  data-current={style === c.id}
                  data-pick="true"
                  onClick={() => setStyle(c.id)}
                >
                  <strong>{c.name}</strong>
                  <span className={styles.small}>{c.desc}</span>
                </button>
              ))}
            </div>
            <label className={ui.field} htmlFor={`${fid}-name`}>
              <span className={cx(ui.label, ui.required)}>
                오두막 이름 <span className={ui.counter}>{[...name].length}/{HOUSE_NAME_MAX}</span>
              </span>
              <input id={`${fid}-name`} className={ui.input} value={name} maxLength={HOUSE_NAME_MAX + 4} onChange={(e) => setName(e.target.value)} placeholder="예) 파도 소리 오두막" required />
            </label>
            <label className={ui.field} htmlFor={`${fid}-intro`}>
              <span className={ui.label}>
                한 줄 소개 <span className={ui.counter}>{[...intro].length}/{HOUSE_INTRO_MAX}</span>
              </span>
              <input id={`${fid}-intro`} className={ui.input} value={intro} maxLength={HOUSE_INTRO_MAX + 4} onChange={(e) => setIntro(e.target.value)} placeholder="찾아온 손님에게 한마디" />
            </label>
            <p className={styles.points}>
              {lot ? `${lot}번 터` : free.length ? `빈 터 중 가장 앞 (${free[0]}번)` : "빈 터 없음"} · <strong>{fmt(cost)}P</strong> ({rate}배) · 내 포인트 <strong>{fmt(points)}P</strong>
            </p>
            {points < cost && <p className={styles.error}>포인트가 {fmt(cost - points)}P 모자라요.</p>}
            <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || busy || !name.trim() || points < cost || villa === null || !free.length}>
              {pending ? "처리 중…" : `오두막 분양받기 (${fmt(cost)}P)`}
            </button>
          </form>
        )}
        <p className={styles.hudNotice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}
