"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  DEX_CAT_LABEL,
  DEX_CATS,
  DEX_NEW_REWARD,
  DEX_TITLE_TIERS,
  DEX_TITLES,
  dexIdsOf,
  dexRewardLabel,
  dexTitleNeed,
  PHASE_LABEL,
  RARITY_LABEL,
  SEASON_LABEL,
  speciesOf,
  WEATHER_LABEL,
  WHERE_LABEL,
  buyerOf,
  type DexCat,
  type Species,
  type Where,
} from "@/lib/forage/catalog";
import { forageApi, type DexPeer } from "@/lib/forage/client";
import type { DexEntry, PublicDex } from "@/lib/forage/types";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { FactGrid, InfoCard } from "../ui/InfoBlocks";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import ConstellationDex from "./ConstellationDex";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// 도감 (51번): 물고기·곤충·약초/버섯·광석·발굴품 + 별자리(망원경 별자리 잇기, ConstellationDex). 처음 잡으면 등록 (실루엣 → 그림, 가장 큰 크기·처음 잡은 날).
// 모르는 칸도 희귀도·잡히는 곳·시간대·날씨·계절 힌트는 보인다. 보상은 종(칸) 하나를 처음 등록할 때마다 희귀도별 포인트 (등록하는 순간 서버가 지급,
// 오늘 한도에 걸려 못 받은 것은 칸마다 [도감 보상 받기]로). 칭호는 그 칸의 절반·전부를 등록하면 자동으로 (lib/forage/dexReward).
// accountId를 주면 그 사람의 도감 구경 (보상 버튼 없이).

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const REWARD_RANGE = `${DEX_NEW_REWARD[1]}~${DEX_NEW_REWARD[5]}P`;
const ymd = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d);

function hints(sp: Species): string[] {
  const out = [`${sp.where.map((w) => WHERE_LABEL[w]).join("·")}`];
  out.push(sp.time ? sp.time.map((t) => PHASE_LABEL[t]).join("·") : "아무 때나");
  if (sp.weather) out.push(`${sp.weather.map((w) => WEATHER_LABEL[w]).join("·")}인 날`);
  if (sp.season) out.push(`${sp.season.map((x) => SEASON_LABEL[x]).join("·")}에만`);
  return out;
}

export default function DexDialog({ accountId, peer, name, onClose }: { accountId?: string; peer?: DexPeer; name?: string | null; onClose: () => void }) {
  const mine = !accountId && !peer;
  const peerKey = peer ? `${peer.ch ?? ""}:${peer.room ?? ""}:${peer.sid}` : "";
  const { state } = useForage();
  const [other, setOther] = useState<PublicDex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<DexCat>("fish");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseId = useId();

  useEffect(() => {
    if (mine) {
      void forageStore.refresh();
      return;
    }
    let alive = true;
    (peer ? forageApi.dexOfPeer(peer) : forageApi.dexOf(accountId!))
      .then((d) => alive && setOther(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // peer는 peerKey로만 비교한다 (매번 새 객체라도 같은 사람이면 다시 받지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, accountId, peerKey]);

  const dex: Record<string, DexEntry> = (mine ? state?.dex : other?.dex) ?? {};
  const titles = (mine ? state?.titles : other?.titles) ?? [];
  const reward = mine ? state?.reward : undefined;
  // 별자리 칸은 종 목록이 없다 (ConstellationDex가 따로 그린다)
  const list = cat === "star" ? [] : speciesOf(cat);
  const ids = dexIdsOf(cat);
  const got = ids.filter((id) => (dex[id]?.n ?? 0) > 0).length;
  const pct = Math.floor((got * 100) / ids.length);
  const pick = list.find((sp) => sp.id === sel) ?? null;
  const ambience = useAmbience();
  const entry = pick ? dex[pick.id] : undefined;
  const loaded = mine ? !!state : !!other;

  const pending = reward?.pending[cat] ?? 0;
  // 다음 칭호 (절반 → 전부 중 아직 없는 것)
  const nextTitle = DEX_TITLE_TIERS.map((t) => ({ name: DEX_TITLES[cat][t], need: dexTitleNeed(cat, t) })).find((t) => t.name && !titles.includes(t.name));

  async function payDex() {
    setBusy(true);
    try {
      const r = await forageApi.payDex(cat);
      forageStore.set(r.state);
      meStore.set(r.me);
      showToast(`${DEX_CAT_LABEL[cat]} 도감 보상 +${r.earned}P${r.left > 0 ? ` (오늘 한도로 ${r.left}P는 남겨 뒀어요 — 내일 또 받기)` : ""}`, 5_000);
    } catch (e) {
      showToast(errorMessage(e));
      void forageStore.refresh();
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
            {DEX_CATS.map((c) => {
              const all = dexIdsOf(c);
              const n = all.filter((id) => (dex[id]?.n ?? 0) > 0).length;
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
                  {DEX_CAT_LABEL[c]} {n}/{all.length}
                  {(reward?.pending[c] ?? 0) > 0 && (
                    <span className={s.dexDot} aria-label="받을 도감 보상 있음">
                      {" "}●
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${cat}`}>
            <div className={s.dexHead}>
              <div>
                <span>
                  {DEX_CAT_LABEL[cat]} {got}/{ids.length}
                </span>
                <strong>{pct}%</strong>
              </div>
              <div className={s.track} role="meter" aria-label={`${DEX_CAT_LABEL[cat]} 도감 채움`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
              {mine && (
                <div className={s.dexReward}>
                  <p>
                    등록 {got}/총 {ids.length} · 이 분류에서 받은 도감 보상 <b>{reward?.got[cat] ?? 0}P</b>
                  </p>
                  {pending > 0 && (
                    <button type="button" className={cx(ui.button, ui.primary, s.tier)} disabled={busy} onClick={() => void payDex()}>
                      도감 보상 받기 ({pending}P)
                    </button>
                  )}
                  <p className={ui.hint}>
                    {nextTitle ? `다음 칭호 「${nextTitle.name}」까지 ${Math.max(0, nextTitle.need - got)}종` : "이 분류 칭호를 모두 받았어요"} · 새 종을 처음 등록할 때마다{" "}
                    {REWARD_RANGE} (희귀할수록 많이)
                  </p>
                </div>
              )}
            </div>
            {cat === "star" && <ConstellationDex key={peerKey || accountId || "me"} dex={dex} />}
            {/* 별자리 칸이면 list가 비어 있어 아무것도 그리지 않는다 */}
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
            {!pick && cat !== "star" && <DexGuide list={list} dex={dex} ambience={ambience} />}
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
                    <dt>처음 등록 보상</dt>
                    <dd>{dexRewardLabel(pick.id)}</dd>
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
