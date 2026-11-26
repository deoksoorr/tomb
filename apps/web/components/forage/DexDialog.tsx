"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  DEX_CAT_LABEL,
  DEX_CATS,
  DEX_MAP_BADGE,
  DEX_MAP_LABEL,
  DEX_MAP_REWARD,
  DEX_MAPS,
  dexMapClaimKey,
  dexMapGot,
  dexMapIds,
  dexMapOf,
  DEX_NEW_REWARD,
  DEX_TITLE_TIERS,
  DEX_TITLES,
  dexIdsOf,
  dexRewardLabel,
  dexTitleNeed,
  GATHER_NODES,
  NODE_CAT,
  nodeWheres,
  PHASE_LABEL,
  RARITY_LABEL,
  SEASON_LABEL,
  speciesOf,
  WATER_LABEL,
  watersOf,
  WEATHER_LABEL,
  WHERE_LABEL,
  npcBuys,
  NPCS,
  isCampSpecies,
  type DexCat,
  type DexMap,
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
import MonsterDex from "./MonsterDex";
import { OddsLink } from "../odds/OddsLayer";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// 도감 (51번): 물고기·곤충·약초/버섯·광석·발굴품 + 별자리(망원경 별자리 잇기, ConstellationDex) + 11/16 몬스터(사냥터·야근 빌딩, MonsterDex). 처음 잡으면 등록 (실루엣 → 그림, 가장 큰 크기·처음 잡은 날).
// 모르는 칸도 희귀도·잡히는 곳·시간대·날씨·계절 힌트는 보인다. 보상은 종(칸) 하나를 처음 등록할 때마다 희귀도별 포인트 (등록하는 순간 서버가 지급,
// 예전 하루 한도·꽉 찬 지갑으로 못 받은 것은 칸마다 [도감 보상 받기]로). 칭호는 그 칸의 절반·전부를 등록하면 자동으로 (lib/forage/dexReward).
// accountId를 주면 그 사람의 도감 구경 (보상 버튼 없이).

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const REWARD_RANGE = `${DEX_NEW_REWARD[1]}~${DEX_NEW_REWARD[5]}P`;
/** 11/16 몬스터 칸 처음 등록 보상 범위 (몬스터는 ★4까지 — lib/forage/mobDex mobRarity) */
const MOB_REWARD_RANGE = `${DEX_NEW_REWARD[1]}~${DEX_NEW_REWARD[4]}P`;
const ymd = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d);

/** 11/19 마을 밖에서도 나오는 곳 (같은 종류 채집 지점이 캠핑장·바닷가에 있으면) — 장소 이름이 마을 기준이라 헷갈렸다 */
function awayOf(sp: Species): string {
  if (sp.cat === "fish") {
    // 11/26 이어진 물에서도 (강 물고기 → 캠핑장 옛길 계곡, 호수 물고기 → 윤슬 낚시터, 계곡 물고기 → 달그늘 소). 나룻배는 낚시터와 같은 물이라 한 번만
    const ws = watersOf(sp).filter((w) => !sp.where.includes(w) && !(w === "rowboat" && sp.where.includes("reservoir")));
    const names = ws.filter((w) => !(w === "rowboat" && ws.includes("reservoir"))).map((w) => WATER_LABEL[w]);
    if (!names.length) return "";
    return ` (${isCampSpecies(sp) ? "" : "캠핑장 "}${names.join("·")}에도 있어요)`;
  }
  // 11/26 도감 확장: 그 맵에서만 나오는 곳(모래 언덕·갯바위·계곡 물가 …)은 어느 맵인지 붙여요 (이름에 맵 이름이 없으면)
  const home = dexMapOf(sp);
  if (home !== "village") {
    const m = DEX_MAP_LABEL[home];
    return sp.where.every((w) => WHERE_LABEL[w].includes(m)) ? "" : ` (${m})`;
  }
  const maps = new Set(GATHER_NODES.filter((n) => n.map && NODE_CAT[n.kind] === sp.cat && nodeWheres(n).some((w) => sp.where.includes(w))).map((n) => n.map));
  const names = [maps.has("camp") ? "캠핑장" : "", maps.has("sea") ? "바닷가" : ""].filter(Boolean);
  return names.length ? ` (${names.join(", ")}에도 있어요)` : "";
}

function hints(sp: Species): string[] {
  const out = [`${sp.where.map((w) => WHERE_LABEL[w]).join("·")}${awayOf(sp)}`];
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
  // 별자리·몬스터 칸은 종 목록이 없다 (ConstellationDex·MonsterDex가 따로 그린다)
  // 11/26 도감 번호는 보이는 차례대로 (마을 → 바닷가 → 캠핑장 — 카탈로그 차례는 늘린 순서라 섞여 있어요)
  const list = cat === "star" || cat === "mob" ? [] : groupsOf(speciesOf(cat)).flatMap((g) => g.list);
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
      showToast(`${DEX_CAT_LABEL[cat]} 도감 보상 +${r.earned}P${r.left > 0 ? ` (지갑이 꽉 차 ${r.left}P는 남겨 뒀어요)` : ""}`, 5_000);
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
          <MapBadges dex={dex} claims={mine ? (state?.claims ?? {}) : null} />
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
                    {nextTitle ? `다음 칭호 「${nextTitle.name}」까지 ${Math.max(0, nextTitle.need - got)}종` : "이 분류 칭호를 모두 받았어요"}.{" "}
                    {cat === "mob"
                      ? `새 몬스터를 처음 쓰러뜨리면 ${MOB_REWARD_RANGE}를 받아요. 우두머리일수록 많이 받아요.`
                      : `새 종을 처음 올리면 ${REWARD_RANGE}를 받아요. 희귀할수록 많이 받아요.`}{" "}
                    {cat !== "star" && cat !== "mob" && <OddsLink section="forage" label="희귀도별 확률 보기" />}
                    {cat === "mob" && <OddsLink section="hunt" label="드롭 확률 보기" />}
                  </p>
                </div>
              )}
            </div>
            {cat === "star" && <ConstellationDex key={peerKey || accountId || "me"} dex={dex} />}
            {cat === "mob" && <MonsterDex key={peerKey || accountId || "me"} dex={dex} />}
            {/* 별자리·몬스터 칸이면 list가 비어 있어 아무것도 그리지 않는다 */}
            {/* 11/26 맵마다 묶어서 (마을 → 바닷가 → 캠핑장, 번호는 이어서). 한 맵 것만 있는 칸은 제목 없이 */}
            {groupsOf(list).map((grp, _gi, all) => (
              <div key={grp.map}>
                {all.length > 1 && (
                  <p className={s.dexGroup}>
                    {DEX_MAP_LABEL[grp.map]}
                    <span>
                      {grp.list.filter((sp) => (dex[sp.id]?.n ?? 0) > 0).length}/{grp.list.length}
                    </span>
                  </p>
                )}
                <div className={s.grid}>
                  {grp.list.map((sp) => {
                    const i = list.indexOf(sp);
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
              </div>
            ))}
            {!pick && cat !== "star" && cat !== "mob" && <DexGuide list={list} dex={dex} ambience={ambience} />}
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
                          {NPCS.filter((n) => npcBuys(n, pick))
                            .map((n) => n.name)
                            .join("·")}{" "}
                          · {pick.price}P
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

/** 11/26 칸 안의 종을 맵마다 (마을 → 바닷가 → 캠핑장 — 빈 맵은 뺀다) */
function groupsOf(list: readonly Species[]): { map: DexMap; list: Species[] }[] {
  return DEX_MAPS.map((map) => ({ map, list: list.filter((sp) => dexMapOf(sp) === map) })).filter((g) => g.list.length > 0);
}

/**
 * 11/26 맵별 도감 완성 배지 (마을·바닷가·캠핑장): 그 맵 종을 다 등록하면 배지 + 완성 보상 한 번 (서버가 등록 순간 지급 — lib/forage/dexReward payMapBadges).
 * claims = 내 도감이면 받은 기록 (남의 도감은 null — 다 채웠는지만)
 */
function MapBadges({ dex, claims }: { dex: Record<string, DexEntry>; claims: Record<string, string> | null }) {
  return (
    <div className={s.mapBadges} aria-label="맵 도감">
      {DEX_MAPS.map((m) => {
        const all = dexMapIds(m).length;
        const got = dexMapGot(dex, m);
        const done = got >= all || (claims ? !!claims[dexMapClaimKey(m)] : false);
        const pct = Math.floor((got * 100) / Math.max(1, all));
        const tip = done
          ? `${DEX_MAP_BADGE[m]} 배지를 받았어요.`
          : `${DEX_MAP_LABEL[m]}에서 나오는 ${all}종을 다 모으면 「${DEX_MAP_BADGE[m]}」 배지${claims ? `와 ${DEX_MAP_REWARD[m]}P` : ""}를 받아요.`;
        return (
          <div key={m} className={s.mapBadge} data-done={done || undefined} title={tip} aria-label={`${DEX_MAP_LABEL[m]} 도감 ${got}/${all}${done ? ", 완성" : ""}`}>
            <span className={s.mapBadgeHead}>
              <b>{DEX_MAP_LABEL[m]}</b>
              {done ? <em>완성</em> : claims ? <small>{DEX_MAP_REWARD[m]}P</small> : null}
            </span>
            <span className={s.mapBadgeNum}>
              {got}/{all}
            </span>
            <span className={s.mapBadgeTrack} aria-hidden="true">
              <span style={{ width: `${done ? 100 : pct}%` }} />
            </span>
          </div>
        );
      })}
    </div>
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
          지금({PHASE_LABEL[ambience.phase]}, {WEATHER_LABEL[ambience.weather]}, {SEASON_LABEL[ambience.season]}) 나오는 건 {now.length}종이에요. 그중{" "}
          {newNow.length}종은 아직 못 모았어요.
        </p>
      )}
    </InfoCard>
  );
}
