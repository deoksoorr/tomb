"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage, isAbortError } from "@/lib/api";
import {
  HOUSE_INTRO_MAX,
  HOUSE_NAME_MAX,
  LIKE_WEIGHT,
  nextTier,
  PLOT_TIERS,
  SORT_LABELS,
  SORTS,
  tierById,
  type HouseSort,
} from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { styleTag } from "@/lib/housing/layout";
import type { HouseSummary, MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, TitleBadge, TitleProgress } from "./parts";

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
};

/** 분양 사무소 창: 내 묘역(분양·넓히기·들어가기) + 분양지 둘러보기·랭킹 */
export default function OfficeDialog({ my, myError, onMy, onEnterMine, onVisit, onClose, busy, visitError, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "mine");
  const id = useId();
  return (
    <Dialog title="분양 사무소" onClose={onClose} size="lg">
      <div className={styles.stack}>
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
              {t === "mine" ? "내 묘역" : "둘러보기 · 랭킹"}
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
          {tab === "mine" ? (
            <MyPlot my={my} error={myError} onMy={onMy} onEnter={onEnterMine} busy={busy} />
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
}: {
  my: MyHouseResponse | null;
  error: string | null;
  onMy: (r: MyHouseResponse) => void;
  onEnter: (edit: boolean) => void;
  busy: boolean;
}) {
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

  const form = (submit: string, onSubmit: () => void) => (
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
          <p className={styles.houseName}>나만의 묘역을 분양받아 보세요</p>
          <p className={styles.muted}>
            공동묘지 한켠에 {plot.name}({plot.w}×{plot.h}칸)을 드려요. 가구와 소품으로 꾸미면 꾸밈 점수가 오르고, 사람들이 놀러 와 좋아요와 방명록을 남길 수 있어요.
          </p>
          <p className={styles.points}>
            분양가 <strong>{fmt(plot.price)}P</strong> · 내 포인트 <strong>{fmt(my.points)}P</strong>
          </p>
          {short && <p className={styles.error}>포인트가 {fmt(plot.price - my.points)}P 모자라요. 출석·헌화로 모아 주세요.</p>}
        </div>
        {!short && form(`${fmt(plot.price)}P로 분양받기`, () => run(() => housingApi.buyPlot(name, intro), "분양을 축하해요! 이제 들어가서 꾸며 보세요."))}
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    );
  }

  const tier = tierById(h.tier)!;
  const up = nextTier(h.tier);
  const tag = styleTag(h.layout);
  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <div className={styles.spread}>
          <p className={styles.houseName}>{h.name}</p>
          <TitleBadge score={h.score} />
        </div>
        {h.intro && <p className={styles.muted}>{h.intro}</p>}
        <p className={styles.small}>
          {tier.name} {tier.w}×{tier.h}칸 · 물건 {h.layout.items.length}/{tier.maxItems}개{tag ? ` · ${tag}` : ""}
        </p>
        <p className={styles.score}>
          꾸밈 점수 <strong>{fmt(h.score)}</strong>{" "}
          <span className={styles.small}>
            (물건 {fmt(h.placedScore)} + 좋아요 {h.likes}×{LIKE_WEIGHT})
          </span>
        </p>
        <TitleProgress score={h.score} />
        <div className={styles.row}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => onEnter(false)} disabled={busy}>
            내 묘역 들어가기
          </button>
          <button type="button" className={ui.button} onClick={() => onEnter(true)} disabled={busy}>
            들어가서 꾸미기
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
              {up.name}({up.w}×{up.h}칸, 물건 {up.maxItems}개)으로 넓힐 수 있어요. 놓아 둔 물건은 그대로예요.
            </p>
            <button
              type="button"
              className={ui.button}
              disabled={pending || busy || my.points < up.price}
              onClick={() => run(() => housingApi.upgrade(up.id), `${up.name}으로 넓혔어요!`)}
            >
              {fmt(up.price)}P로 {up.name} 만들기{my.points < up.price ? " · 모자라요" : ""}
            </button>
          </>
        ) : (
          <p className={styles.muted}>가장 넓은 {tier.name}이에요.</p>
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
        {sort === "new" ? "최근에 분양된 묘역이에요." : `${SORT_LABELS[sort]} 순 상위 50곳. 꾸밈 점수 = 놓은 물건 점수 + 좋아요 × ${LIKE_WEIGHT}`}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {!houses && !error && <p className={styles.muted}>불러오는 중…</p>}
      {houses?.length === 0 && <p className={styles.muted}>아직 분양된 묘역이 없어요. 첫 주인이 되어 보세요.</p>}
      {houses && houses.length > 0 && (
        <ol className={styles.list}>
          {houses.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                className={styles.listItem}
                onClick={() => onVisit(h.id)}
                disabled={busy}
                aria-label={`${i + 1}위 ${h.name}, ${h.ownerName}의 묘역, 꾸밈 점수 ${h.score}, 좋아요 ${h.likes}. 놀러 가기`}
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
                      {h.ownerName} · {tierById(h.tier)?.name}
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
