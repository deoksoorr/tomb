"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { todayKst } from "@/lib/epitaph";
import { sortByRevives } from "@/lib/hooks/graveMerge";
import type { PointRankResponse, PublicGrave } from "@/lib/types";
import styles from "./RankingPanel.module.css";

type Tab = "revive" | "flower" | "recent" | "points";

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: "revive", label: "살려주세요", empty: "아직 살려 달라는 목소리가 없어요." },
  { id: "flower", label: "헌화", empty: "아직 놓인 꽃이 없어요." },
  { id: "recent", label: "최근 안장", empty: "아직 아무도 잠들지 않았어요." },
  { id: "points", label: "포인트", empty: "아직 포인트를 모은 사람이 없어요." },
];

const LIMIT = 20;

function ranked(graves: readonly PublicGrave[], reviveTop: readonly string[], tab: Tab): PublicGrave[] {
  if (tab === "revive") return sortByRevives(graves, reviveTop);
  if (tab === "flower") return graves.filter((g) => g.flowers > 0).sort((a, b) => b.flowers - a.flowers);
  return [...graves].sort((a, b) => b.createdAt - a.createdAt);
}

function metric(g: PublicGrave, tab: Tab): string {
  if (tab === "revive") return `🙏 ${g.revives}`;
  if (tab === "flower") return `🌼 ${g.flowers}`;
  return todayKst(g.createdAt).replaceAll("-", ".");
}

type Props = {
  /** 지금 채널 묘비 (묘비 랭킹은 채널별) */
  graves: readonly PublicGrave[];
  reviveTop: readonly string[];
  onPick: (graveId: string) => void;
};

/** 탭 4개: 살려주세요 순(기본)·헌화 순·최근 안장 (지금 채널) / 포인트 (모은 포인트, 전체) */
export default function RankingList({ graves, reviveTop, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("revive");
  const baseId = useId();
  const items = useMemo(() => (tab === "points" ? [] : ranked(graves, reviveTop, tab).slice(0, LIMIT)), [graves, reviveTop, tab]);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="랭킹 기준">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${baseId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-list`}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`${baseId}-list`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.listWrap}>
        {tab === "points" ? (
          <PointRanking empty={current.empty} />
        ) : items.length === 0 ? (
          <p className={styles.empty}>{current.empty}</p>
        ) : (
          <ol className={styles.list}>
            {items.map((g, i) => (
              <li key={g.id}>
                <button type="button" className={styles.item} onClick={() => onPick(g.id)}>
                  <span className={styles.rank}>{i + 1}</span>
                  <span className={styles.name}>{g.name}</span>
                  <span className={styles.metric}>{metric(g, tab)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

/** 모은 포인트(쓰더라도 줄지 않는 합계) 순위. 내 줄은 강조하고, 50위 밖이면 맨 아래에 따로 */
function PointRanking({ empty }: { empty: string }) {
  const [data, setData] = useState<PointRankResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .pointRank()
      .then((r) => alive && setData(r))
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <p className={styles.empty}>{error ?? "불러오는 중…"}</p>;
  if (data.rows.length === 0) return <p className={styles.empty}>{empty}</p>;
  const mineOutside = data.mine && !data.rows.some((r) => r.me) ? data.mine : null;
  return (
    <ol className={styles.list}>
      {[...data.rows, ...(mineOutside ? [mineOutside] : [])].map((r) => (
        <li key={`${r.rank}-${r.name}`} className={styles.pointRow} data-me={r.me}>
          <span className={styles.rank}>{r.rank}</span>
          <span className={styles.name}>
            {r.name}
            {r.me && " (나)"}
          </span>
          <span className={styles.metric}>{r.points.toLocaleString("ko-KR")}P</span>
        </li>
      ))}
    </ol>
  );
}
