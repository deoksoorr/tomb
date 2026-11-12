"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  CAT_LABEL,
  DEX_REWARD,
  DEX_TIERS,
  DEX_TITLES,
  dexClaimKey,
  LIFE_CATS,
  PHASE_LABEL,
  RARITY_LABEL,
  SEASON_LABEL,
  speciesOf,
  WEATHER_LABEL,
  WHERE_LABEL,
  buyerOf,
  type DexTier,
  type LifeCat,
  type Species,
  type Where,
} from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import type { DexEntry, PublicDex } from "@/lib/forage/types";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { FactGrid, InfoCard } from "../ui/InfoBlocks";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// 도감 (51번): 물고기·곤충·약초/버섯·광석·발굴품. 처음 잡으면 등록 (실루엣 → 그림, 가장 큰 크기·처음 잡은 날).
// 모르는 칸도 희귀도·잡히는 곳·시간대·날씨·계절 힌트는 보인다. 종류별 25·50·75·100% 보상(포인트, 50·100%는 칭호).
// accountId를 주면 그 사람의 도감 구경 (보상 버튼 없이).

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const ymd = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d);

function hints(sp: Species): string[] {
  const out = [`${sp.where.map((w) => WHERE_LABEL[w]).join("·")}`];
  out.push(sp.time ? sp.time.map((t) => PHASE_LABEL[t]).join("·") : "아무 때나");
  if (sp.weather) out.push(`${sp.weather.map((w) => WEATHER_LABEL[w]).join("·")}인 날`);
  if (sp.season) out.push(`${sp.season.map((x) => SEASON_LABEL[x]).join("·")}에만`);
  return out;
}

export default function DexDialog({ accountId, name, onClose }: { accountId?: string; name?: string | null; onClose: () => void }) {
  const mine = !accountId;
  const { state } = useForage();
  const [other, setOther] = useState<PublicDex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<LifeCat>("fish");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseId = useId();

  useEffect(() => {
    if (mine) {
      void forageStore.refresh();
      return;
    }
    let alive = true;
    forageApi
      .dexOf(accountId)
      .then((d) => alive && setOther(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [mine, accountId]);

  const dex: Record<string, DexEntry> = (mine ? state?.dex : other?.dex) ?? {};
  const titles = (mine ? state?.titles : other?.titles) ?? [];
  const claims = mine ? (state?.claims ?? {}) : {};
  const list = speciesOf(cat);
  const got = list.filter((sp) => (dex[sp.id]?.n ?? 0) > 0).length;
  const pct = Math.floor((got * 100) / list.length);
  const pick = list.find((sp) => sp.id === sel) ?? null;
  const ambience = useAmbience();
  const entry = pick ? dex[pick.id] : undefined;
  const loaded = mine ? !!state : !!other;

  async function claim(tier: DexTier) {
    setBusy(true);
    try {
      const r = await forageApi.claimDex(cat, tier);
      forageStore.set(r.state);
      meStore.set(r.me);
      showToast(`${CAT_LABEL[cat]} 도감 ${tier}% 달성! +${r.earned}P${r.title ? ` · 칭호 「${r.title}」` : ""}`, 5_000);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const title = mine ? "도감" : `${other?.name ?? name ?? "이웃"}의 도감`;
  return (
    <Dialog title={title} onClose={onClose}>
      {!loaded ? (
        <p className={error ? ui.error : ui.hint}>{error ?? "도감을 펼치는 중…"}</p>
      ) : (
        <div>
          {titles.length > 0 && (
            <div className={s.titles} aria-label="칭호">
              {titles.map((t) => (
                <span key={t} className={s.titleTag}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className={s.dexTabs} role="tablist" aria-label="도감 종류">
            {LIFE_CATS.map((c) => {
              const all = speciesOf(c);
              const n = all.filter((sp) => (dex[sp.id]?.n ?? 0) > 0).length;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  id={`${baseId}-${c}`}
                  aria-selected={cat === c}
                  aria-controls={`${baseId}-panel`}
                  className={s.dexTab}
                  onClick={() => {
                    setCat(c);
                    setSel(null);
                  }}
                >
                  {CAT_LABEL[c]} {n}/{all.length}
                </button>
              );
            })}
          </div>
          <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${cat}`}>
            <div className={s.dexHead}>
              <div>
                <span>
                  {CAT_LABEL[cat]} {got}/{list.length}
                </span>
                <strong>{pct}%</strong>
              </div>
              <div className={s.track} role="meter" aria-label={`${CAT_LABEL[cat]} 도감 채움`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
              {mine && (
                <div className={s.tiers}>
                  {DEX_TIERS.map((t) => {
                    const done = !!claims[dexClaimKey(cat, t)];
                    const ok = pct >= t;
                    const tt = DEX_TITLES[cat][t];
                    return (
                      <button
                        key={t}
                        type="button"
                        className={cx(ui.button, s.tier, ok && !done && ui.primary)}
                        data-done={done}
                        disabled={busy || done || !ok}
                        onClick={() => void claim(t)}
                        title={tt ? `칭호 「${tt}」` : undefined}
                      >
                        {t}% {done ? "받음" : `+${DEX_REWARD[t]}P${tt ? " · 칭호" : ""}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className={s.grid}>
              {list.map((sp, i) => {
                const known = (dex[sp.id]?.n ?? 0) > 0;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    className={s.cell}
                    data-known={known}
                    aria-pressed={sel === sp.id}
                    aria-label={known ? sp.name : `${i + 1}번 · 아직 모름`}
                    onClick={() => setSel(sp.id)}
                  >
                    <span className={s.num}>{i + 1}</span>
                    <ItemIcon itemId={sp.id} size={32} />
                    <span className={s.rare} aria-hidden="true">
                      {sp.rarity >= 3 ? "★".repeat(sp.rarity - 2) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {!pick && <DexGuide list={list} dex={dex} ambience={ambience} />}
            {pick && (
              <div className={cx(s.detail, !entry && s.unknown)} role="status">
                <ItemIcon itemId={pick.id} size={48} />
                <div>
                  <h4>{entry ? pick.name : "??? (아직 못 잡았어요)"}</h4>
                  <span className={s.stars} aria-label={RARITY_LABEL[pick.rarity]}>
                    {stars(pick.rarity)} {RARITY_LABEL[pick.rarity]}
                  </span>
                  {entry && <p style={{ margin: "4px 0 0" }}>{pick.desc}</p>}
                  <dl>
                    <dt>힌트</dt>
                    <dd>{hints(pick).join(" · ")}</dd>
                    {entry ? (
                      <>
                        <dt>잡은 수</dt>
                        <dd>{entry.n}</dd>
                        {entry.max > 0 && (
                          <>
                            <dt>가장 큰</dt>
                            <dd>{(entry.max / 10).toFixed(1)}cm</dd>
                          </>
                        )}
                        <dt>처음</dt>
                        <dd>{ymd(entry.first)}</dd>
                        <dt>파는 곳</dt>
                        <dd>
                          {buyerOf(pick.cat).name} · {pick.price}P
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** 아무 칸도 고르지 않았을 때: 이 종류를 모으는 곳(곳마다 모은 수)과 지금 시간·날씨·계절에 나오는 것 */
function DexGuide({ list, dex, ambience }: { list: readonly Species[]; dex: Record<string, DexEntry>; ambience: ReturnType<typeof useAmbience> }) {
  const where = new Map<Where, { got: number; all: number }>();
  for (const sp of list)
    for (const w of sp.where) {
      const v = where.get(w) ?? { got: 0, all: 0 };
      v.all += 1;
      if ((dex[sp.id]?.n ?? 0) > 0) v.got += 1;
      where.set(w, v);
    }
  const now = ambience
    ? list.filter(
        (sp) =>
          (!sp.time || sp.time.includes(ambience.phase)) &&
          (!sp.weather || sp.weather.includes(ambience.weather)) &&
          (!sp.season || sp.season.includes(ambience.season)),
      )
    : [];
  const newNow = now.filter((sp) => (dex[sp.id]?.n ?? 0) === 0);
  return (
    <InfoCard title="모으는 곳" icon="book" aside="칸을 누르면 그 종의 힌트가 보여요">
      <FactGrid facts={[...where].map(([w, v]) => ({ label: WHERE_LABEL[w], value: `${v.got}/${v.all}`, tone: v.got === v.all ? ("good" as const) : undefined }))} />
      {ambience && (
        <p className={ui.hint}>
          지금({PHASE_LABEL[ambience.phase]} · {WEATHER_LABEL[ambience.weather]} · {SEASON_LABEL[ambience.season]}) 나오는 것 {now.length}종 — 그중 아직 못 모은 것{" "}
          {newNow.length}종
        </p>
      )}
    </InfoCard>
  );
}
