"use client";

import { useState } from "react";
import { dexRewardLabel, RARITY_LABEL } from "@/lib/forage/catalog";
import type { DexEntry } from "@/lib/forage/types";
import { constellationWhen, CONSTELLATIONS, type Constellation } from "@/lib/rpg/constellations";
import { cx } from "../ui/cx";
import { FactGrid, InfoCard } from "../ui/InfoBlocks";
import ConstellationIcon from "./ConstellationIcon";
import fs from "./forage.module.css";
import s from "./ConstellationDex.module.css";

// 도감의 "별자리" 칸: 망원경 별자리 잇기에서 한 별자리를 하나도 놓치지 않고 끝까지 이으면 등록된다.
// 등록 전은 별 자리만 점으로 (실루엣), 등록하면 그림·이름·처음 완성한 날·완성 횟수(완벽으로만 이은 횟수).
// 내 도감·이웃 도감 구경이 같은 칸을 쓴다 (dex만 다르다).

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const ymd = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d);

export default function ConstellationDex({ dex }: { dex: Record<string, DexEntry> }) {
  const [sel, setSel] = useState<string | null>(null);
  const pick = CONSTELLATIONS.find((c) => c.id === sel) ?? null;
  const entry = pick ? dex[pick.id] : undefined;
  return (
    <>
      <div className={fs.grid}>
        {CONSTELLATIONS.map((c, i) => {
          const known = (dex[c.id]?.n ?? 0) > 0;
          return (
            <button
              key={c.id}
              type="button"
              className={cx(fs.cell, s.cell)}
              data-known={known}
              data-rarity={c.rarity}
              aria-pressed={sel === c.id}
              aria-label={known ? c.name : `${i + 1}번 · 아직 못 이음`}
              onClick={() => setSel(c.id)}
            >
              <span className={fs.num}>{i + 1}</span>
              <ConstellationIcon con={c} known={known} />
              <span className={fs.rare} aria-hidden="true">
                {c.rarity >= 3 ? "★".repeat(c.rarity - 2) : ""}
              </span>
            </button>
          );
        })}
      </div>
      {pick ? (
        <div className={cx(fs.detail, s.detail)} role="status">
          <ConstellationIcon con={pick} known={!!entry} size={48} />
          <div>
            <h4>{entry ? pick.name : "??? (아직 못 이었어요)"}</h4>
            <span className={fs.stars} aria-label={RARITY_LABEL[pick.rarity]}>
              {stars(pick.rarity)} {RARITY_LABEL[pick.rarity]}
            </span>
            {entry && <p style={{ margin: "4px 0 0" }}>{pick.desc}</p>}
            <dl>
              <dt>나오는 판</dt>
              <dd>{constellationWhen(pick)}</dd>
              <dt>별</dt>
              <dd>{pick.stars.length}개</dd>
              <dt>처음 등록 보상</dt>
              <dd>{dexRewardLabel(pick.id)}</dd>
              {entry ? (
                <>
                  <dt>그림</dt>
                  <dd>{pick.shape}</dd>
                  <dt>완성</dt>
                  <dd>
                    {entry.n}번{entry.pf ? ` (완벽으로만 ${entry.pf}번)` : ""}
                  </dd>
                  <dt>처음</dt>
                  <dd>{ymd(entry.first)}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      ) : (
        <StarGuide dex={dex} />
      )}
    </>
  );
}

/** 아무 칸도 고르지 않았을 때: 희귀도별 모은 수와 등록 방법 */
function StarGuide({ dex }: { dex: Record<string, DexEntry> }) {
  const tiers: { label: string; match: (c: Constellation) => boolean }[] = [
    { label: "흔함·보통", match: (c) => c.rarity <= 2 && !c.season },
    { label: "계절 (그 계절에만)", match: (c) => !!c.season },
    { label: "새벽 (5~7시 판)", match: (c) => !!c.dawn },
    { label: "희귀 (어려움 이상)", match: (c) => c.rarity === 3 && !c.dawn },
    { label: "전설 (맑은 밤)", match: (c) => c.rarity === 5 },
  ];
  return (
    <InfoCard title="별자리 모으는 법" icon="book" aside="칸을 누르면 그 별자리 정보가 보여요">
      <FactGrid
        facts={tiers.map((t) => {
          const all = CONSTELLATIONS.filter((c) => t.match(c));
          const got = all.filter((c) => (dex[c.id]?.n ?? 0) > 0).length;
          return { label: t.label, value: `${got}/${all.length}`, tone: got === all.length ? ("good" as const) : undefined };
        })}
      />
      <p className={s.hint}>별 보기 언덕의 망원경에서 별자리 잇기를 해요. 한 별자리의 별을 하나도 놓치지 않고(좋아 이상) 끝까지 이으면 등록돼요. 한 판에 새로 등록되는 건 3개까지예요.</p>
    </InfoCard>
  );
}
