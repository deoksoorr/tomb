"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage, isAbortError } from "@/lib/api";
import {
  HOUSE_INTRO_MAX,
  HOUSE_NAME_MAX,
  LIKE_WEIGHT,
  lotLabel,
  nextTier,
  PLOT_TIERS,
  SORT_LABELS,
  SORTS,
  tierById,
  type HouseSort,
} from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { styleTag } from "@/lib/housing/layout";
import { WORLD_LOTS } from "@tomb/protocol";
import type { HouseSummary, MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, TierCompare, TitleBadge, TitleProgress } from "./parts";

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
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "mine");
  const id = useId();
  return (
    <Dialog title="분양 사무소" onClose={onClose}>
      <div className={styles.stack}>
        <div className={styles.spread}>
          <p className={styles.small}>
            광장 동쪽 주거 구역에 번지마다 집이 서 있어요. 채널마다 주거 구역이 따로라, 지금 {channel}채널의 빈 필지를 골라 분양받을 수 있어요.
          </p>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => (inVillage ? onClose() : onVillage(null))} disabled={busy}>
            {inVillage ? "마을로 돌아가기" : "주거 구역 보기"}
          </button>
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
              {t === "mine" ? "내 집" : "둘러보기 · 랭킹"}
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
}) {
  const [lot, setLot] = useState<number | null>(presetLot);
  const [free, setFree] = useState<number[] | null>(null);
  const noHouse = !!my && !my.house;
  useEffect(() => {
    if (!noHouse) return;
    let alive = true;
    housingApi
      .village(channel)
      .then((v) => {
        if (!alive) return;
        const used = new Set([...v.houses.map((h) => h.lot), ...v.taken]);
        // 메인 맵 주거 구역(1..WORLD_LOTS)의 빈 필지 먼저. 다 찼으면 예전처럼 분양 마을(2단지) 번지
        const all = Array.from({ length: Math.max(v.lots + 4, WORLD_LOTS) }, (_, i) => i + 1).filter((l) => !used.has(l));
        const near = all.filter((l) => l <= WORLD_LOTS);
        setFree(near.length ? near : all);
      })
      .catch(() => alive && setFree([]));
    return () => {
      alive = false;
    };
  }, [noHouse, channel]);
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const fid = useId();

  if (!my) return <p className={styles.muted}>{error ?? "분양 장부를 펼치는 중…"}</p>;

  const plot = PLOT_TIERS[0];
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
          <span className={ui.label}>번지 ({channel}채널 주거 구역의 자리)</span>
          <select
            id={`${fid}-lot`}
            className={ui.input}
            value={lot ?? ""}
            onChange={(e) => setLot(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">가장 앞의 빈 번지 (자동)</option>
            {(free ?? []).map((l) => (
              <option key={l} value={l}>
                {l}번지{l > WORLD_LOTS ? " (2단지)" : ""}
              </option>
            ))}
            {lot !== null && !free?.includes(lot) && <option value={lot}>{lot}번지</option>}
          </select>
        </label>
      )}
      <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || busy || !name.trim()}>
        {pending ? "처리 중…" : submit}
      </button>
    </form>
  );

  const h = my.house;
  if (!h) {
    const short = my.points < plot.price;
    return (
      <div className={styles.stack}>
        <div className={styles.card}>
          <p className={styles.houseName}>나만의 집을 분양받아 보세요</p>
          <p className={styles.muted}>
            주거 구역 한켠에 {plot.name}({plot.w}×{plot.h}칸)을 드려요. 가구와 소품으로 꾸미면 꾸밈 점수가 오르고, 사람들이 놀러 와 좋아요와 방명록을 남길 수 있어요.
          </p>
          <p className={styles.points}>
            분양가 <strong>{fmt(plot.price)}P</strong> · 내 포인트 <strong>{fmt(my.points)}P</strong>
          </p>
          <TierCompare current="small" />
          {lot !== null && <p className={styles.tag}>고른 자리: {lotLabel(channel, lot)}</p>}
          {short && <p className={styles.error}>포인트가 {fmt(plot.price - my.points)}P 모자라요. 출석·헌화로 모아 주세요.</p>}
        </div>
        {!short &&
          form(
            `${lot ? `${lotLabel(channel, lot)}를 ` : `${channel}채널에 `}${fmt(plot.price)}P로 분양받기`,
            () => run(() => housingApi.buyPlot(channel, name, intro, lot), `분양을 축하해요! ${channel}채널 주거 구역에 내 집이 생겼어요.`),
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
          {lotLabel(h.ch, h.lot)} · {tier.name} {tier.w}×{tier.h}칸 · 물건 {h.layout.items.length}/{tier.maxItems}개{tag ? ` · ${tag}` : ""}
        </p>
        {away && (
          <p className={styles.tag}>
            내 집은 {h.ch}채널에 있어요 (지금 {channel}채널). 보러 가기·들어가기·꾸미기를 누르면 {h.ch}채널로 옮긴 뒤 가요.
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
            내 집 들어가기
          </button>
          <button type="button" className={ui.button} onClick={() => onEnter(true)} disabled={busy}>
            들어가서 꾸미기
          </button>
          <button type="button" className={ui.button} onClick={onExterior} disabled={busy}>
            외관 꾸미기
          </button>
          <button type="button" className={ui.button} onClick={() => onVillage(h.lot, true)} disabled={busy}>
            {away ? `${h.ch}채널 내 집 보러 가기` : "내 집 보러 가기"}
          </button>
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
      {editing && form("저장", () => run(() => housingApi.editProfile(name, intro), "바꿨어요."))}
      <div className={styles.card}>
        <p className={styles.points}>
          내 포인트 <strong>{fmt(my.points)}P</strong>
        </p>
        {up ? (
          <>
            <p className={styles.muted}>
              {up.name}({up.w}×{up.h}칸, 물건 {up.maxItems}개)으로 넓힐 수 있어요. 놓아 둔 물건은 그대로이고, 주거 구역에 선 집도 더 크게 바뀌어요.
            </p>
            <TierCompare exterior={h.exterior} current={h.tier} />
            <button
              type="button"
              className={ui.button}
              disabled={pending || busy || my.points < up.price || away}
              onClick={() => run(() => housingApi.upgrade(channel, up.id), `${up.name}으로 넓혔어요!`)}
            >
              {fmt(up.price)}P로 {up.name} 만들기{away ? ` · ${h.ch}채널에서 할 수 있어요` : my.points < up.price ? " · 모자라요" : ""}
            </button>
          </>
        ) : (
          <>
            <p className={styles.muted}>가장 넓은 {tier.name}이에요.</p>
            <TierCompare exterior={h.exterior} current={h.tier} />
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
        {sort === "new" ? "최근에 분양된 집이에요." : `${SORT_LABELS[sort]} 순 상위 50곳. 꾸밈 점수 = 놓은 물건 점수 + 좋아요 × ${LIKE_WEIGHT}`}
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
                <span className={styles.listMain}>
                  <span className={styles.listName}>
                    {h.name}
                    {h.id === myId ? " (내 집)" : ""}
                  </span>
                  <span className={styles.row} style={{ gap: 6 }}>
                    <TitleBadge score={h.score} />
                    <span className={styles.small}>
                      {lotLabel(h.ch, h.lot)} · {h.ownerName} · {tierById(h.tier)?.name}
                    </span>
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
